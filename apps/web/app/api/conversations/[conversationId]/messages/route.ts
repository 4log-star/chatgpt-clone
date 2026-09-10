import { getConversationMessages, streamChatResponse } from "@/lib/ai/chat";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import z from "zod";

const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
});

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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
      where: {
        id: conversationId,
        userId: user.id,
      },
      select: {
        id: true,
      },
    });

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const result = createMessageSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: "Invalid message data",
        },
        {
          status: 400,
        },
      );
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: result.data.content,
      },
    });

    const messages = await getConversationMessages(conversation.id);
    const aiStream = streamChatResponse(messages);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let assistantContent = "";

        try {
          for await (const chunk of aiStream) {
            assistantContent += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
          if (assistantContent.length > 0) {
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: "ASSISTANT",
                content: assistantContent,
              },
            });
          }

          controller.close();
        } catch (error) {
          console.error("AI stream failed:", error);

          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error(
      "POST /api/conversations/[conversationId]/messages failed:",
      error,
    );

    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
