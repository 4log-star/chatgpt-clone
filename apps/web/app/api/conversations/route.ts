import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const result = createConversationSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        { error: "Invalid conversation data" },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: result.data.title,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json({ conversation }, { status: 201 });
  } catch {
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function GET() {
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
    const conversations = await prisma.conversation.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    return Response.json({
      conversations,
    });
  } catch (error) {
      console.error("GET /api/conversations failed:", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
