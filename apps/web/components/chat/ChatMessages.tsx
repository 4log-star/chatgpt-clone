"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import MarkdownCodeBlock from "./MarkdownCodeBlock";

type MessageRole = "USER" | "ASSISTANT";

type MessageStatus =
    | "complete"
    | "streaming"
    | "stopped"
    | "error";

type Message = {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    updatedAt: string;
    status: MessageStatus;
};

type ChatMessagesProps = {
    messages: Message[];
    isStreaming: boolean;
    onRetry: (userMessageId: string) => void;
};

export default function ChatMessages({
    messages,
    isStreaming,
    onRetry
}: ChatMessagesProps) {
    const bottomRef =
        useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: "smooth",
        });
    }, [messages, isStreaming]);



    return (
        <section className="flex flex-1 flex-col overflow-y-auto p-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                {messages.map((message, index) => {
                    const isUser =
                        message.role === "USER";

                    const userMessageBeforeAssistant =
                        index > 0 &&
                            messages[index - 1]?.role === "USER"
                            ? messages[index - 1]
                            : null;

                    return (
                        <div
                            key={message.id}
                            className={
                                isUser
                                    ? "self-end max-w-2xl rounded-2xl bg-blue-900 px-4 py-3 text-white"
                                    : "self-start max-w-2xl rounded-2xl bg-zinc-900 px-4 py-3 text-white"
                            }
                        >
                            {isUser ? (
                                <div className="whitespace-pre-wrap">
                                    {message.content}
                                </div>
                            ) : (
                                <div className="prose prose-invert max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[
                                            remarkGfm,
                                        ]}
                                        components={{
                                            code({
                                                className,
                                                children,
                                                ...props
                                            }) {
                                                const match =
                                                    /language-(\w+)/.exec(
                                                        className ||
                                                        ""
                                                    );

                                                const code =
                                                    String(
                                                        children
                                                    ).replace(
                                                        /\n$/,
                                                        ""
                                                    );

                                                // Inline code
                                                if (!match) {
                                                    return (
                                                        <code
                                                            className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm"
                                                            {...props}
                                                        >
                                                            {
                                                                children
                                                            }
                                                        </code>
                                                    );
                                                }

                                                return (
                                                    <MarkdownCodeBlock
                                                        language={
                                                            match[1]
                                                        }
                                                        code={
                                                            code
                                                        }
                                                    />
                                                );
                                            },
                                        }}
                                    >
                                        {
                                            message.content
                                        }
                                    </ReactMarkdown>
                                </div>
                            )}

                            {!isUser &&
                                message.status ===
                                "streaming" && (
                                    <span className="ml-1 inline-block animate-pulse">
                                        ▍
                                    </span>
                                )}

                            {!isUser &&
                                message.status ===
                                "stopped" && (
                                    <div className="mt-2 text-xs text-zinc-400">
                                        Generation stopped
                                    </div>
                                )}

                            {!isUser &&
                                message.status ===
                                "error" && (
                                    <div className="mt-2 text-xs text-red-400">
                                        Error generating
                                        response
                                    </div>
                                )}

                            {(message.status === "error" ||
                                message.status === "stopped") &&
                                userMessageBeforeAssistant && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onRetry(userMessageBeforeAssistant.id)
                                        }
                                        disabled={isStreaming}
                                        className="mt-2 rounded-md border px-3 py-1.5 text-sm"
                                    >
                                        Retry
                                    </button>
                                )}
                        </div>
                    );
                })}

                <div ref={bottomRef} />
            </div>
        </section>
    );
}