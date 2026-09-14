"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Conversation = {
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
};

type SidebarProps = {
    conversations: Conversation[];
};

export default function Sidebar({
    conversations: initialConversations,
}: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const [conversations, setConversations] = useState(
        initialConversations
    );

    const [creating, setCreating] = useState(false);

    async function loadConversations() {
        try {
            const response = await fetch(
                "/api/conversations"
            );

            if (!response.ok) {
                return;
            }

            const data = await response.json();

            setConversations(data.conversations);
        } catch (error) {
            console.error(
                "Failed to load conversations:",
                error
            );
        }
    }

    useEffect(() => {
        window.addEventListener(
            "conversations-updated",
            loadConversations
        );

        return () => {
            window.removeEventListener(
                "conversations-updated",
                loadConversations
            );
        };
    }, []);

    async function handleNewChat() {
        if (creating) return;

        setCreating(true);

        try {
            const response = await fetch(
                "/api/conversations",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({}),
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Failed to create conversation"
                );
            }

            const data = await response.json();

            router.push(
                `/chat/${data.conversation.id}`
            );

            await loadConversations();
        } catch (error) {
            console.error(
                "Failed to create chat:",
                error
            );
        } finally {
            setCreating(false);
        }
    }

    return (
        <aside className="flex w-64 shrink-0 flex-col border-r">
            <div className="border-b p-4">
                <Link
                    href="/chat"
                    className="block rounded-lg px-3 py-2 font-semibold hover:bg-zinc-800"
                >
                    ChatGPT Clone
                </Link>

                <button
                    type="button"
                    onClick={handleNewChat}
                    disabled={creating}
                    className="mt-3 w-full rounded-lg border px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                >
                    {creating
                        ? "Creating..."
                        : "+ New chat"}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
                <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Conversations
                </div>

                <nav className="flex flex-col gap-1">
                    {conversations.map(
                        (conversation) => {
                            const href = `/chat/${conversation.id}`;

                            const isActive =
                                pathname === href;

                            return (
                                <Link
                                    key={conversation.id}
                                    href={href}
                                    className={
                                        isActive
                                            ? "rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium"
                                            : "rounded-lg px-3 py-2 text-sm hover:bg-zinc-800"
                                    }
                                >
                                    <span className="block truncate">
                                        {conversation.title ||
                                            "New conversation"}
                                    </span>
                                </Link>
                            );
                        }
                    )}
                </nav>
            </div>
        </aside>
    );
}