import { prisma } from "@/lib/db";
import { OllamaProvider } from "./ollama-provider";
import type { ChatMessage } from "./provider";

const provider = new OllamaProvider();

export async function getConversationMessages(
  conversationId: string
): Promise<ChatMessage[]> {
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
    },
    select: {
      role: true,
      content: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return messages.map((message) => ({
    role: message.role.toLowerCase() as ChatMessage["role"],
    content: message.content,
  }));
}

export function streamChatResponse(messages: ChatMessage[]) {
  return provider.streamResponse(messages);
}