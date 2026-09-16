import { prisma } from "@/lib/db";
import { OllamaProvider } from "./ollama-provider";
import type { ChatMessage } from "./provider";

const provider = new OllamaProvider();

function mapMessage(
  message: {
    role: "SYSTEM" | "USER" | "ASSISTANT";
    content: string;
  }
): ChatMessage {
  return {
    role: message.role.toLowerCase() as ChatMessage["role"],
    content: message.content,
  };
}

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
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  return messages.map(mapMessage);
}

export async function getMessagesForGeneration(
  conversationId: string,
  userMessageId: string
): Promise<ChatMessage[]> {
  const userMessage = await prisma.message.findFirst({
    where: {
      id: userMessageId,
      conversationId,
      role: "USER",
    },
    select: {
      createdAt: true,
    },
  });

  if (!userMessage) {
    return [];
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      createdAt: {
        lte: userMessage.createdAt,
      },
    },
    select: {
      role: true,
      content: true,
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  return messages.map(mapMessage);
}

export function streamChatResponse(
  messages: ChatMessage[],
  signal?: AbortSignal
) {
  return provider.streamResponse(messages, signal);
}