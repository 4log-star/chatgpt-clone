import { getCurrentUser } from "@/lib/auth";
import {
  getConversationMessages,
  streamChatResponse,
} from "@/lib/ai/chat";
import { generateConversationTitle } from "@/lib/ai/title";
import { encodeSSE } from "@/lib/ai/sse";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
});

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { conversationId } = await context.params;

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: user.id,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    const result = createMessageSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        { error: "Invalid message data" },
        { status: 400 }
      );
    }

    // Save the user's message first.
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: result.data.content,
      },
    });

    // Load the updated conversation history.
    const messages = await getConversationMessages(
      conversation.id
    );

    // Start the AI stream.
    const aiStream = streamChatResponse(messages);

    const stream = new ReadableStream({
      async start(controller) {
        let assistantContent = "";

        try {
          // Stream assistant response to the browser.
          for await (const chunk of aiStream) {
            assistantContent += chunk;

            controller.enqueue(
              encodeSSE("chunk", {
                text: chunk,
              })
            );
          }

          // Persist the complete assistant response.
          if (assistantContent.length > 0) {
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: "ASSISTANT",
                content: assistantContent,
              },
            });
          }

          // Generate a title only for a conversation
          // that doesn't already have one.
          if (!conversation.title && assistantContent.length > 0) {
            try {
              const title = await generateConversationTitle(
                result.data.content
              );

              await prisma.conversation.update({
                where: {
                  id: conversation.id,
                },
                data: {
                  title,
                },
              });
            } catch (error) {
              // Title generation should not make an
              // otherwise successful chat response fail.
              console.error(
                "Failed to generate conversation title:",
                error
              );
            }
          }

          // Tell the browser generation is complete.
          controller.enqueue(
            encodeSSE("done", {})
          );

          controller.close();
        } catch (error) {
          console.error("AI stream failed:", error);

          controller.enqueue(
            encodeSSE("error", {
              message: "Error generating response",
            })
          );

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error(
      "POST /api/conversations/[conversationId]/messages failed:",
      error
    );

    return Response.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}