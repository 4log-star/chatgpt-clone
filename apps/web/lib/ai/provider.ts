export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface AIProvider {
 streamResponse(messages : ChatMessage[]) : AsyncGenerator<string>
}
