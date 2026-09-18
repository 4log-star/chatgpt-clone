import { getCurrentUser } from "@/lib/auth";
import {
    getMessagesForGeneration,
    streamChatResponse,
} from "@/lib/ai/chat";
import { encodeSSE } from "@/lib/ai/sse";
import { prisma } from "@/lib/db";

export async function POST(
    request: Request,
    {
        params,
    }: {
        params: Promise<{
            messageId: string;
        }>;
    }
) {
    const user = await getCurrentUser();

    if (!user) {
        return new Response("Unauthorized", {
            status: 401,
        });
    }

    const { messageId } = await params;

    /*
     * Find the USER message and verify that its
     * conversation belongs to the authenticated user.
     */
    const userMessage =
        await prisma.message.findFirst({
            where: {
                id: messageId,
                role: "USER",

                conversation: {
                    userId: user.id,
                },
            },
            select: {
                id: true,
                conversationId: true,
            },
        });

    if (!userMessage) {
        return new Response("Not found", {
            status: 404,
        });
    }

    /*
     * Regenerate is currently restricted to the latest
     * USER message in the conversation.
     */
    const latestUserMessage =
        await prisma.message.findFirst({
            where: {
                conversationId:
                    userMessage.conversationId,
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
        latestUserMessage.id !== userMessage.id
    ) {
        return new Response(
            "Only the latest user message can be regenerated",
            {
                status: 409,
            }
        );
    }

    /*
     * Get the latest generation for this USER message.
     */
    const latestGeneration =
        await prisma.generation.findFirst({
            where: {
                userMessageId: userMessage.id,
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                status: true,
            },
        });

    /*
     * Regenerate is specifically for a successful
     * generation.
     *
     * STOPPED / ERROR should use Retry instead.
     */
    if (
        !latestGeneration ||
        latestGeneration.status !==
            "COMPLETED"
    ) {
        return new Response(
            "Only a completed generation can be regenerated",
            {
                status: 409,
            }
        );
    }

    /*
     * Create a completely new generation attempt.
     *
     * IMPORTANT:
     *
     * We do NOT create another USER message.
     */
    const generation =
        await prisma.generation.create({
            data: {
                userMessageId: userMessage.id,
                status: "STREAMING",
            },
            select: {
                id: true,
            },
        });

    const stream =
        new ReadableStream<Uint8Array>({
            async start(controller) {
                let assistantContent = "";

                try {
                    controller.enqueue(
                        encodeSSE(
                            "user_message",
                            {
                                id: userMessage.id,
                            }
                        )
                    );

                    controller.enqueue(
                        encodeSSE(
                            "generation_started",
                            {
                                id: generation.id,
                            }
                        )
                    );

                    /*
                     * IMPORTANT:
                     *
                     * We generate from the conversation
                     * history up to the USER message.
                     *
                     * Previous assistant generations are
                     * intentionally excluded.
                     */
                    const messages =
                        await getMessagesForGeneration(
                            userMessage.conversationId,
                            userMessage.id
                        );

                    const aiStream =
                        streamChatResponse(
                            messages,
                            request.signal
                        );

                    for await (
                        const chunk of aiStream
                    ) {
                        if (
                            request.signal.aborted
                        ) {
                            break;
                        }

                        assistantContent +=
                            chunk;

                        controller.enqueue(
                            encodeSSE("chunk", {
                                content: chunk,
                            })
                        );
                    }

                    /*
                     * User clicked Stop.
                     */
                    if (
                        request.signal.aborted
                    ) {
                        await prisma.generation.update(
                            {
                                where: {
                                    id: generation.id,
                                },
                                data: {
                                    status: "STOPPED",
                                },
                            }
                        );

                        return;
                    }

                    /*
                     * Empty AI response.
                     */
                    if (
                        !assistantContent.trim()
                    ) {
                        await prisma.generation.update(
                            {
                                where: {
                                    id: generation.id,
                                },
                                data: {
                                    status: "ERROR",
                                },
                            }
                        );

                        controller.enqueue(
                            encodeSSE("error", {
                                message:
                                    "The AI returned an empty response.",
                            })
                        );

                        return;
                    }

                    /*
                     * Save the new ASSISTANT message.
                     */
                    const assistantMessage =
                        await prisma.message.create({
                            data: {
                                conversationId:
                                    userMessage.conversationId,
                                role: "ASSISTANT",
                                content:
                                    assistantContent,
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
                     * Link this assistant message
                     * to the new generation.
                     */
                    await prisma.generation.update({
                        where: {
                            id: generation.id,
                        },
                        data: {
                            status: "COMPLETED",
                            assistantMessageId:
                                assistantMessage.id,
                        },
                    });

                    controller.enqueue(
                        encodeSSE("done", {
                            generation: {
                                id: generation.id,
                                status: "COMPLETED",
                            },
                            message:
                                assistantMessage,
                        })
                    );
                } catch (error) {
                    if (
                        request.signal.aborted
                    ) {
                        try {
                            await prisma.generation.update(
                                {
                                    where: {
                                        id: generation.id,
                                    },
                                    data: {
                                        status: "STOPPED",
                                    },
                                }
                            );
                        } catch {
                            // Ignore secondary DB errors.
                        }

                        return;
                    }

                    console.error(
                        "Regenerate failed:",
                        error
                    );

                    try {
                        await prisma.generation.update(
                            {
                                where: {
                                    id: generation.id,
                                },
                                data: {
                                    status: "ERROR",
                                },
                            }
                        );
                    } catch {
                        // Ignore secondary DB errors.
                    }

                    controller.enqueue(
                        encodeSSE("error", {
                            message:
                                "Failed to generate response.",
                        })
                    );
                } finally {
                    controller.close();
                }
            },
        });

    return new Response(stream, {
        headers: {
            "Content-Type":
                "text/event-stream",
            "Cache-Control":
                "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}