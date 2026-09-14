"use client";

import { useEffect, useRef } from "react";

type MessageRole = "USER" | "ASSISTANT";

type Message = {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    updatedAt: string;
};

type ChatMessagesProps = {
    messages: Message[];
    isStreaming: boolean;
};

export default function ChatMessages({
    messages,
    isStreaming,
}: ChatMessagesProps) {
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: "smooth",
        });
    }, [messages, isStreaming]);

    return (
        <section className="flex flex-1 flex-col overflow-y-auto p-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                {messages.map((message) => {
                    const isUser = message.role === "USER";

                    return (
                        <div
                            key={message.id}
                            className={
                                isUser
                                    ? "self-end max-w-2xl rounded-2xl bg-blue-900 px-4 py-3 text-white"
                                    : "self-start max-w-2xl rounded-2xl bg-zinc-900 px-4 py-3 text-white"
                            }
                        >
                            {message.content}

                            {isStreaming &&
                                !isUser &&
                                message.id ===
                                    messages[messages.length - 1]?.id && (
                                    <span className="ml-1 inline-block animate-pulse">
                                        ▍
                                    </span>
                                )}
                        </div>
                    );
                })}

                <div ref={bottomRef} />
            </div>
        </section>
    );
}