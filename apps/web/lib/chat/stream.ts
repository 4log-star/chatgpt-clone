export type StreamCallbacks = {
    onUserMessage?: (data: {
        id: string;
    }) => void;

    onGenerationStarted?: (data: {
        id: string;
    }) => void;

    onChunk?: (text: string) => void;

    onDone?: (data: {
        generation: {
            id: string;
            status: "COMPLETED";
        };
        message: {
            id: string;
            role: "ASSISTANT";
            content: string;
            createdAt: string;
            updatedAt: string;
        };
    }) => void;

    onError?: (message: string) => void;
};

export async function streamChatMessage(
    endpoint: string,
    body: unknown,
    callbacks: StreamCallbacks,
    signal?: AbortSignal
) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: body === undefined
            ? undefined
            : JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const text = await response.text();

        throw new Error(
            text || "Failed to generate response"
        );
    }

    if (!response.body) {
        throw new Error("Response body is missing");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
        const { value, done } =
            await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, {
            stream: true,
        });

        const events = buffer.split("\n\n");

        buffer = events.pop() ?? "";

        for (const eventText of events) {
            if (!eventText.trim()) {
                continue;
            }

            let eventName = "";
            let eventData = "";

            for (const line of eventText.split("\n")) {
                if (line.startsWith("event:")) {
                    eventName = line
                        .slice(6)
                        .trim();
                }

                if (line.startsWith("data:")) {
                    eventData += line
                        .slice(5)
                        .trim();
                }
            }

            if (!eventData) {
                continue;
            }

            let data: unknown;

            try {
                data = JSON.parse(eventData);
            } catch {
                continue;
            }

            switch (eventName) {
                case "user_message":
                    callbacks.onUserMessage?.(
                        data as {
                            id: string;
                        }
                    );
                    break;

                case "generation_started":
                    callbacks.onGenerationStarted?.(
                        data as {
                            id: string;
                        }
                    );
                    break;

                case "chunk":
                    callbacks.onChunk?.(
                        (
                            data as {
                                content?: string;
                            }
                        ).content ?? ""
                    );
                    break;

                case "done":
                    callbacks.onDone?.(
                        data as {
                            generation: {
                                id: string;
                                status: "COMPLETED";
                            };
                            message: {
                                id: string;
                                role: "ASSISTANT";
                                content: string;
                                createdAt: string;
                                updatedAt: string;
                            };
                        }
                    );
                    break;

                case "error":
                    callbacks.onError?.(
                        (
                            data as {
                                message?: string;
                            }
                        ).message ??
                            "Unknown error"
                    );
                    break;
            }
        }
    }
}