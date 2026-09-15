"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessages from "@/components/chat/ChatMessages";
import { streamChatMessage } from "@/lib/chat/stream";

type MessageRole = "USER" | "ASSISTANT";

type Message = {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    updatedAt: string;
};

export default function ChatPage() {
    const params = useParams<{ conversationId: string }>();
    const conversationId = params.conversationId;
    const router = useRouter()
    const abortControllerRef =
        useRef<AbortController | null>(null);



    const [messages, setMessages] = useState<Message[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadConversation() {
            try {
                setError(null);

                const response = await fetch(
                    `/api/conversations/${conversationId}`
                );

                if (!response.ok) {
                    throw new Error("Failed to load conversation");
                }

                const data = await response.json();

                if (!cancelled) {
                    setMessages(data.conversation.messages);
                }
            } catch (error) {
                if (!cancelled) {
                    setError(
                        error instanceof Error
                            ? error.message
                            : "Failed to load conversation"
                    );
                }
            }
        }

        loadConversation();

        return () => {
            cancelled = true;
        };
    }, [conversationId]);

    async function handleSendMessage(content: string) {
        if (isStreaming) return;

        setError(null);
        setIsStreaming(true);

        const temporaryUserId = crypto.randomUUID()
        const temporaryAssistantId = crypto.randomUUID();
        const controller = new AbortController();

        abortControllerRef.current = controller;

        const userMessage: Message = {
            id: temporaryUserId,
            role: "USER",
            content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const assistantMessage: Message = {
            id: temporaryAssistantId,
            role: "ASSISTANT",
            content: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        setMessages((current) => [
            ...current,
            userMessage,
            assistantMessage,
        ]);

        try {
            await streamChatMessage(
                conversationId,
                content,
                controller.signal,
                {
                    onChunk(text) {
                        setMessages((current) =>
                            current.map((message) =>
                                message.id === temporaryAssistantId
                                    ? {
                                        ...message,
                                        content:
                                            message.content + text,
                                    }
                                    : message
                            )
                        );
                    },

                    onDone() {
                        abortControllerRef.current = null;
                        setIsStreaming(false);
                        window.dispatchEvent(
                            new Event("conversations-updated")
                        );
                    },

                    onError(message) {
                        setIsStreaming(false);
                        setError(message);
                    },
                }
            );
        } catch (error) {
            abortControllerRef.current = null;
            setIsStreaming(false);

            if (
                error instanceof DOMException &&
                error.name === "AbortError"
            ) {
                return;
            }

            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to generate response"
            );
        }
    }

    function handleStopGenerating() {
        abortControllerRef.current?.abort();
        setMessages((current) =>
            current.filter(
                (message) =>
                    !(
                        message.role === "ASSISTANT" &&
                        message.content === ""
                    )
            )
        );
    }

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <ChatMessages
                messages={messages}
                isStreaming={isStreaming}
            />

            {error && (
                <div className="px-6 pb-3 text-sm text-red-500">
                    {error}
                </div>
            )}

            <ChatComposer
                onSend={handleSendMessage}
                onStop={handleStopGenerating}
                disabled={isStreaming}
            />
        </div>
    );
}