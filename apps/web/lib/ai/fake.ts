import { AIProvider, ChatMessage } from "./provider";

export class FakeAIProvider implements AIProvider {
  async *streamResponse(messages: ChatMessage[]) {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    const response = `Fake AI response to: ${lastUserMessage?.content ?? "your message"}`;
    const chunks = response.split(" ");
    for (const [index, chunk] of chunks.entries()) {
      yield index === chunks.length - 1 ? chunk : `${chunk} `;

      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    }
  }
}
