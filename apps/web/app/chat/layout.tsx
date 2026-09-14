import Sidebar from "@/components/chat/Sidebar";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {

    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const conversations = await prisma.conversation.findMany({
        where: {
            userId: user?.id
        },
        select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true
        },
        orderBy: {
            updatedAt: "desc"
        }
    }

    )

    return (
        <div className="flex h-screen">
            <Sidebar conversations={conversations} />

            <main className="flex min-w-0 flex-1">
                {children}
            </main>
        </div>
    );
}