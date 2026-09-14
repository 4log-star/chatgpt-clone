import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ChatPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const conversation = await prisma.conversation.findFirst({
        where: {
            userId: user.id,
        },
        select: {
            id: true,
        },
        orderBy: {
            updatedAt: "desc",
        },
    });

    if (conversation) {
        redirect(`/chat/${conversation.id}`);
    }

    const newConversation = await prisma.conversation.create({
        data: {
            userId: user.id,
        },
        select: {
            id: true,
        },
    });

    redirect(`/chat/${newConversation.id}`);
}