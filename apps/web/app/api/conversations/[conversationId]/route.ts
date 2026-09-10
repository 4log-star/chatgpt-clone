import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { error } from "console";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const { conversationId } = await context.params;
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: user.id },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!conversation) {
      return Response.json(
        {
          error: "conversation not found",
        },
        {
          status: 404,
        },
      );
    }

    return Response.json({ conversation });
  } catch (error) {
    console.error("GET /api/conversations/[conversationId] failed:", error);

    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
