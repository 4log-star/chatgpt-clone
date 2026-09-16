import { getCurrentUser } from "@/lib/auth";
import {
  getConversationMessages,
  getMessagesForGeneration,
  streamChatResponse,
} from "@/lib/ai/chat";
import { generateConversationTitle } from "@/lib/ai/title";
import { encodeSSE } from "@/lib/ai/sse";
import { prisma } from "@/lib/db";
import { z } from "zod";

const messageSchema = z
  .object({
    content: z.string().trim().min(1).max(10000).optional(),

    userMessageId: z.string().uuid().optional(),

    mode: z.enum(["new", "retry", "regenerate"]).default("new"),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "new" && !data.content) {
      ctx.addIssue({
        code: "custom",
        message: "content is required",
        path: ["content"],
      });
    }

    if (
      (data.mode === "retry" || data.mode === "regenerate") &&
      !data.userMessageId
    ) {
      ctx.addIssue({
        code: "custom",
        message: "userMessageId is required",
        path: ["userMessageId"],
      });
    }
  });

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

  let body: z.infer<typeof messageSchema>;

  try {
    body = messageSchema.parse(await request.json());
  } catch {
    return new Response("Invalid request body", {
      status: 400,
    });
  }

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
   * NEW MESSAGE
   * ---------------------------------------------------------
   */
  if (body.mode === "new") {
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
     * RETRY / REGENERATE
     * ---------------------------------------------------------
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
     * Keep Retry/Regenerate limited to the latest USER message.
     */
    const latestUserMessage = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        role: "USER",
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      select: {
        id: true,
      },
    });

    if (
      !latestUserMessage ||
      latestUserMessage.id !== existingMessage.id
    ) {
      return new Response(
        "Only the latest user message can be retried or regenerated",
        {
          status: 409,
        }
      );
    }

    userMessage = existingMessage;

    /*
     * Retry:
     *
     * The latest generation must have failed/stopped.
     *
     * Regenerate:
     *
     * Any completed generation is allowed.
     */
    if (body.mode === "retry") {
      const latestGeneration = await prisma.generation.findFirst({
        where: {
          userMessageId: userMessage.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          status: true,
        },
      });

      if (
        latestGeneration &&
        latestGeneration.status !== "STOPPED" &&
        latestGeneration.status !== "ERROR"
      ) {
        return new Response(
          "This message does not have a failed generation to retry",
          {
            status: 409,
          }
        );
      }
    }
  }

  /*
   * Create an explicit generation attempt.
   */
  const generation = await prisma.generation.create({
    data: {
      userMessageId: userMessage.id,
      status: "STREAMING",
    },
    select: {
      id: true,
    },
  });

  const isNewMessage = body.mode === "new";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantContent = "";

      try {
        controller.enqueue(
          encodeSSE("user_message", {
            id: userMessage.id,
            retry: body.mode === "retry",
            regenerate: body.mode === "regenerate",
          })
        );

        controller.enqueue(
          encodeSSE("generation_started", {
            id: generation.id,
          })
        );

        /*
         * Normal message:
         *
         * Use entire conversation history.
         *
         * Retry/Regenerate:
         *
         * Use conversation history only up to this USER message.
         */
        const messages = isNewMessage
          ? await getConversationMessages(conversation.id)
          : await getMessagesForGeneration(
              conversation.id,
              userMessage.id
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
         * -----------------------------------------------------
         * STOPPED
         * -----------------------------------------------------
         */

        if (request.signal.aborted) {
          await prisma.generation.update({
            where: {
              id: generation.id,
            },
            data: {
              status: "STOPPED",
            },
          });

          return;
        }

        if (!assistantContent.trim()) {
          await prisma.generation.update({
            where: {
              id: generation.id,
            },
            data: {
              status: "ERROR",
            },
          });

          controller.enqueue(
            encodeSSE("error", {
              message: "The AI returned an empty response.",
            })
          );

          return;
        }

        /*
         * -----------------------------------------------------
         * COMPLETED
         * -----------------------------------------------------
         */

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

        await prisma.generation.update({
          where: {
            id: generation.id,
          },
          data: {
            status: "COMPLETED",
            assistantMessageId: assistantMessage.id,
          },
        });

        /*
         * Only generate the title during the first generation
         * of a brand-new conversation.
         */
        if (isNewMessage && !conversation.title) {
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
          } catch (error) {
            console.error(
              "Conversation title generation failed:",
              error
            );
          }
        }

        controller.enqueue(
          encodeSSE("done", {
            generation: {
              id: generation.id,
              status: "COMPLETED",
            },
            message: assistantMessage,
          })
        );
      } catch (error) {
        if (request.signal.aborted) {
          try {
            await prisma.generation.update({
              where: {
                id: generation.id,
              },
              data: {
                status: "STOPPED",
              },
            });
          } catch {
            // Ignore secondary DB errors.
          }

          return;
        }

        console.error(
          "Message generation failed:",
          error
        );

        try {
          await prisma.generation.update({
            where: {
              id: generation.id,
            },
            data: {
              status: "ERROR",
            },
          });
        } catch {
          // Ignore secondary DB errors.
        }

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