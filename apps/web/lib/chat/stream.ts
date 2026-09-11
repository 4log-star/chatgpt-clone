export type StreamEvent =
  | {
      type: "chunk";
      text: string;
    }
  | {
      type: "done";
    }
  | {
      type: "error";
      message: string;
    };

type StreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

export async function streamChatMessage(
  conversationId: string,
  content: string,
  callbacks: StreamCallbacks
) {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
      }),
    }
  );

  if (!response.ok) {
    let message = "Failed to send message";

    try {
      const data = await response.json();

      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch {
      // Response wasn't JSON.
    }

    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Streaming response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const events = buffer.split("\n\n");

      // Keep the incomplete event for the next network chunk.
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const event = parseSSEEvent(rawEvent);

        if (!event) {
          continue;
        }

        if (event.type === "chunk") {
          callbacks.onChunk(event.text);
        } else if (event.type === "done") {
          callbacks.onDone();
        } else if (event.type === "error") {
          callbacks.onError(event.message);
        }
      }
    }

    // Flush any remaining UTF-8 bytes.
    buffer += decoder.decode();

    const finalEvent = parseSSEEvent(buffer);

    if (finalEvent) {
      if (finalEvent.type === "chunk") {
        callbacks.onChunk(finalEvent.text);
      } else if (finalEvent.type === "done") {
        callbacks.onDone();
      } else if (finalEvent.type === "error") {
        callbacks.onError(finalEvent.message);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSEEvent(
  rawEvent: string
): StreamEvent | null {
  if (!rawEvent.trim()) {
    return null;
  }

  let eventType = "";
  let data = "";

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      data += line.slice("data:".length).trim();
    }
  }

  if (!eventType || !data) {
    return null;
  }

  try {
    const parsed = JSON.parse(data);

    switch (eventType) {
      case "chunk":
        if (typeof parsed.text !== "string") {
          return null;
        }

        return {
          type: "chunk",
          text: parsed.text,
        };

      case "done":
        return {
          type: "done",
        };

      case "error":
        return {
          type: "error",
          message:
            typeof parsed.message === "string"
              ? parsed.message
              : "Generation failed",
        };

      default:
        return null;
    }
  } catch {
    return null;
  }
}