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
     * Find the USER message while simultaneously checking that
     * its conversation belongs to the authenticated user.
     */
    const userMessage = await prisma.message.findFirst({
        where: {
            id: messageId,
            role: "USER",

            conversation: {
                userId: user.id,
            },
        },
        select: {
            id: true,
            content: true,
            conversationId: true,
        },
    });

    if (!userMessage) {
        return new Response("Not found", {
            status: 404,
        });
    }

    /*
     * Retry is only allowed for the latest USER message.
     *
     * Otherwise this could happen:
     *
     * USER A
     * ASSISTANT A
     * USER B
     *
     * and then someone retries USER A, creating a response
     * in the middle of newer conversation history.
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
            "Only the latest user message can be retried",
            {
                status: 409,
            }
        );
    }

    /*
     * Look at the most recent generation for this USER message.
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
     * Retry only makes sense when the previous attempt failed
     * or was explicitly stopped.
     */
    if (!latestGeneration) {
        return new Response(
            "This message has no generation to retry",
            {
                status: 409,
            }
        );
    }

    if (
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

    /*
     * Create a NEW generation.
     *
     * We reuse the existing USER message.
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
                    /*
                     * Tell the frontend which USER message is
                     * being retried.
                     */
                    controller.enqueue(
                        encodeSSE("user_message", {
                            id: userMessage.id,
                            mode: "retry",
                        })
                    );

                    /*
                     * Tell the frontend about the new
                     * generation attempt.
                     */
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
                     * Do not include the previous ASSISTANT
                     * answer in the prompt.
                     *
                     * We only load conversation history up
                     * to this USER message.
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
                     * Browser clicked Stop.
                     *
                     * Do not create an ASSISTANT message
                     * containing partial output.
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
                     * Provider returned nothing.
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
                     * Successful generation:
                     *
                     * 1. Save ASSISTANT message
                     * 2. Link it to this generation
                     * 3. Mark generation COMPLETED
                     */
                    const assistantMessage =
                        await prisma.message.create(
                            {
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
                            }
                        );

                    await prisma.generation.update(
                        {
                            where: {
                                id: generation.id,
                            },
                            data: {
                                status: "COMPLETED",
                                assistantMessageId:
                                    assistantMessage.id,
                            },
                        }
                    );

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
                    /*
                     * AbortError / client disconnect.
                     */
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
                        "Retry generation failed:",
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