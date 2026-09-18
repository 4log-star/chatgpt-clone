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
    content: z
        .string()
        .trim()
        .min(1)
        .max(10000),
});

export async function POST(
    request: Request,
    {
        params,
    }: {
        params: Promise<{
            conversationId: string;
        }>;
    }
) {
    const user = await getCurrentUser();

    if (!user) {
        return new Response("Unauthorized", {
            status: 401,
        });
    }

    const { conversationId } = await params;

    let body: z.infer<
        typeof messageSchema
    >;

    try {
        body = messageSchema.parse(
            await request.json()
        );
    } catch {
        return new Response(
            "Invalid request body",
            {
                status: 400,
            }
        );
    }

    /*
     * Authorization is part of the query.
     */
    const conversation =
        await prisma.conversation.findFirst({
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

    /*
     * Create the USER message first.
     */
    const userMessage =
        await prisma.message.create({
            data: {
                conversationId:
                    conversation.id,
                role: "USER",
                content: body.content,
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
     * Every AI attempt gets its own Generation row.
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
                     * Give the frontend the real DB ID.
                     */
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

                    const messages =
                        await getConversationMessages(
                            conversation.id
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
                            encodeSSE(
                                "chunk",
                                {
                                    content: chunk,
                                }
                            )
                        );
                    }

                    /*
                     * Stop generation.
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
                     * Empty provider response.
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
                     * Save completed assistant response.
                     */
                    const assistantMessage =
                        await prisma.message.create({
                            data: {
                                conversationId:
                                    conversation.id,
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

                    /*
                     * Generate title only for the
                     * first message in an untitled conversation.
                     */
                    if (!conversation.title) {
                        try {
                            const title =
                                await generateConversationTitle(
                                    userMessage.content
                                );

                            if (title) {
                                await prisma.conversation.update(
                                    {
                                        where: {
                                            id: conversation.id,
                                        },
                                        data: {
                                            title,
                                        },
                                    }
                                );
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
                        "Message generation failed:",
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