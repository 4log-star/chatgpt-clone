import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
    _request: Request,
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
                createdAt: true,
                updatedAt: true,

                messages: {
                    orderBy: [
                        {
                            createdAt: "asc",
                        },
                        {
                            id: "asc",
                        },
                    ],

                    select: {
                        id: true,
                        role: true,
                        content: true,
                        createdAt: true,
                        updatedAt: true,

                        /*
                         * USER message can have multiple
                         * generations.
                         */
                        generationsFromUser: {
                            orderBy: {
                                createdAt: "asc",
                            },
                            select: {
                                id: true,
                                status: true,
                                createdAt: true,
                                updatedAt: true,

                                assistantMessageId: true,
                            },
                        },

                        /*
                         * ASSISTANT message belongs to
                         * exactly one generation.
                         */
                        generation: {
                            select: {
                                id: true,
                                userMessageId: true,
                                status: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
            },
        });

    if (!conversation) {
        return new Response("Not found", {
            status: 404,
        });
    }

    return Response.json({
        conversation,
    });
}