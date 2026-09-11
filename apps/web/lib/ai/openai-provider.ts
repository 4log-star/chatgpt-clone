import "server-only";

import { openai } from "./openai";
import type { AIProvider, ChatMessage } from "./provider";

export class OpenAIProvider implements AIProvider {
  async *streamResponse(messages: ChatMessage[]) {
    const stream = await openai.responses.create({
      model: "gpt-5.6-luna",
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield event.delta;
      }

      if (event.type === "response.failed") {
        throw new Error("OpenAI response failed");
      }

      if (event.type === "response.incomplete") {
        throw new Error("OpenAI response was incomplete");
      }
    }
  }
}