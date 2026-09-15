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
            return Response.json(
                { error: "Conversation not found" },
                { status: 404 }
            );
        }

        const body = await request.json();

        const result =
            createMessageSchema.safeParse(body);

        if (!result.success) {
            return Response.json(
                { error: "Invalid message data" },
                { status: 400 }
            );
        }

        // The user really sent this message,
        // so we persist it immediately.
        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: "USER",
                content: result.data.content,
            },
        });

        const messages =
            await getConversationMessages(
                conversation.id
            );

        const aiStream = streamChatResponse(
            messages,
            request.signal
        );

        const stream = new ReadableStream({
            async start(controller) {
                let assistantContent = "";

                try {
                    for await (const chunk of aiStream) {
                        // If the browser disconnected/aborted,
                        // stop processing immediately.
                        if (request.signal.aborted) {
                            return;
                        }

                        assistantContent += chunk;

                        controller.enqueue(
                            encodeSSE("chunk", {
                                text: chunk,
                            })
                        );
                    }

                    // Don't persist anything if the request
                    // was cancelled while the model was running.
                    if (request.signal.aborted) {
                        return;
                    }

                    if (assistantContent.length > 0) {
                        await prisma.message.create({
                            data: {
                                conversationId:
                                    conversation.id,
                                role: "ASSISTANT",
                                content: assistantContent,
                            },
                        });
                    }

                    if (
                        !conversation.title &&
                        assistantContent.length > 0
                    ) {
                        try {
                            const title =
                                await generateConversationTitle(
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
                            console.error(
                                "Failed to generate conversation title:",
                                error
                            );
                        }
                    }

                    controller.enqueue(
                        encodeSSE("done", {})
                    );

                    controller.close();
                } catch (error) {
                    // Cancellation is expected when the user
                    // clicks "Stop generating".
                    if (request.signal.aborted) {
                        return;
                    }

                    console.error(
                        "AI stream failed:",
                        error
                    );

                    controller.enqueue(
                        encodeSSE("error", {
                            message:
                                "Error generating response",
                        })
                    );

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