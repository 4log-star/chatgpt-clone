import { getCurrentUser } from "@/lib/auth";
import {
  getConversationMessages,
  streamChatResponse,
} from "@/lib/ai/chat";
import { generateConversationTitle } from "@/lib/ai/title";
import { encodeSSE } from "@/lib/ai/sse";
import { prisma } from "@/lib/db";
import { z } from "zod";

const messageSchema = z.object({
  content: z.string().trim().min(1).max(10000).optional(),
  userMessageId: z.string().uuid().optional(),
});

type MessageInput = z.infer<typeof messageSchema>;

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ conversationId: string }>;
  }
) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  const { conversationId } = await params;

  let body: MessageInput;

  try {
    body = messageSchema.parse(await request.json());
  } catch {
    return new Response("Invalid request body", {
      status: 400,
    });
  }

  /*
   * Exactly one of these should be provided:
   *
   * Normal send:
   *   { content: "Hello" }
   *
   * Retry:
   *   { userMessageId: "..." }
   */
  const isRetry = Boolean(body.userMessageId);

  if (isRetry && body.content) {
    return new Response(
      "content and userMessageId cannot be used together",
      {
        status: 400,
      }
    );
  }

  if (!isRetry && !body.content) {
    return new Response("content is required", {
      status: 400,
    });
  }

  /*
   * Authorization happens at the database query itself.
   *
   * We do NOT first load by conversationId alone.
   */
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
    return new Response("Not found", {
      status: 404,
    });
  }

  let userMessage: {
    id: string;
    role: "USER";
    content: string;
    createdAt: Date;
    updatedAt: Date;
  };

  /*
   * ---------------------------------------------------------
   * NORMAL MESSAGE
   * ---------------------------------------------------------
   */
  if (!isRetry) {
    userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: body.content!,
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } else {
    /*
     * ---------------------------------------------------------
     * RETRY
     * ---------------------------------------------------------
     *
     * Find the USER message only if it belongs to the
     * authenticated user's conversation.
     */
    const existingMessage = await prisma.message.findFirst({
      where: {
        id: body.userMessageId!,
        conversationId: conversation.id,
        role: "USER",
      },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existingMessage) {
      return new Response("Not found", {
        status: 404,
      });
    }

    /*
     * A retry is only allowed for the latest message.
     *
     * Otherwise somebody could retry an old user message while
     * newer conversation messages already exist, producing
     * confusing history.
     */
    const latestMessage = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (
      !latestMessage ||
      latestMessage.id !== existingMessage.id ||
      latestMessage.role !== "USER"
    ) {
      return new Response("This message cannot be retried", {
        status: 409,
      });
    }

    userMessage = existingMessage;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantContent = "";

      try {
        /*
         * Tell the client which real DB USER message is being used.
         *
         * For a normal send this replaces the temporary client id.
         * For a retry it simply confirms the existing id.
         */
        controller.enqueue(
          encodeSSE("user_message", {
            id: userMessage.id,
            retry: isRetry,
          })
        );

        const messages = await getConversationMessages(
          conversation.id
        );

        const aiStream = streamChatResponse(
          messages,
          request.signal
        );

        for await (const chunk of aiStream) {
          if (request.signal.aborted) {
            break;
          }

          assistantContent += chunk;

          controller.enqueue(
            encodeSSE("chunk", {
              content: chunk,
            })
          );
        }

        /*
         * If the browser stopped the request, do not save a partial
         * assistant message.
         */
        if (request.signal.aborted) {
          return;
        }

        /*
         * Ollama/provider returned successfully but with no content.
         */
        if (!assistantContent.trim()) {
          controller.enqueue(
            encodeSSE("error", {
              message: "The AI returned an empty response.",
            })
          );

          return;
        }

        const assistantMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "ASSISTANT",
            content: assistantContent,
          },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        /*
         * Generate a title only for a conversation that does not
         * already have one.
         */
        if (!conversation.title) {
          try {
            const title = await generateConversationTitle(
              userMessage.content
            );

            if (title) {
              await prisma.conversation.update({
                where: {
                  id: conversation.id,
                },
                data: {
                  title,
                },
              });
            }
          } catch (titleError) {
            /*
             * Title generation should not make an otherwise
             * successful chat fail.
             */
            console.error(
              "Conversation title generation failed:",
              titleError
            );
          }
        }

        controller.enqueue(
          encodeSSE("done", {
            message: assistantMessage,
          })
        );
      } catch (error) {
        if (request.signal.aborted) {
          return;
        }

        console.error("Message generation failed:", error);

        controller.enqueue(
          encodeSSE("error", {
            message: "Failed to generate response.",
          })
        );
      } finally {
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
}