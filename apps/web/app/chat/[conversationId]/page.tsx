"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessages from "@/components/chat/ChatMessages";
import { streamChatMessage } from "@/lib/chat/stream";
import { createTemporaryId } from "@/lib/chat/id";

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

export default function ChatPage() {
    const params = useParams<{
        conversationId: string;
    }>();

    const conversationId = params.conversationId;

    const [messages, setMessages] = useState<Message[]>(
        []
    );

    const [isStreaming, setIsStreaming] =
        useState(false);

    const [error, setError] = useState<string | null>(
        null
    );

    const abortControllerRef =
        useRef<AbortController | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadConversation() {
            try {
                setError(null);

                const response = await fetch(
                    `/api/conversations/${conversationId}`
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to load conversation"
                    );
                }

                const data = await response.json();

                if (!cancelled) {
                    setMessages(
                        data.conversation.messages.map(
                            (message: Omit<
                                Message,
                                "status"
                            >) => ({
                                ...message,
                                status: "complete",
                            })
                        )
                    );
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

    async function handleSendMessage(
        content: string
    ) {
        if (isStreaming) {
            return;
        }

        setError(null);
        setIsStreaming(true);

        const controller =
            new AbortController();

        abortControllerRef.current = controller;

        const temporaryUserId =
            `${Date.now()}-user`;

        const temporaryAssistantId =
            `${Date.now()}-assistant`;

        const now =
            new Date().toISOString();

        const userMessage: Message = {
            id: temporaryUserId,
            role: "USER",
            content,
            createdAt: now,
            updatedAt: now,
            status: "complete",
        };

        const assistantMessage: Message = {
            id: temporaryAssistantId,
            role: "ASSISTANT",
            content: "",
            createdAt: now,
            updatedAt: now,
            status: "streaming",
        };

        setMessages((current) => [
            ...current,
            userMessage,
            assistantMessage,
        ]);

        try {
         await streamChatMessage(
    `/api/conversations/${conversationId}/messages`,
    {
        content,
    },
    {
        onUserMessage({ id }) {
            setMessages((current) =>
                current.map((message) =>
                    message.id === temporaryUserId
                        ? {
                              ...message,
                              id,
                          }
                        : message
                )
            );
        },

        onGenerationStarted({ id }) {
            console.log(
                "Generation started:",
                id
            );
        },

        onChunk(text) {
            setMessages((current) =>
                current.map((message) =>
                    message.id ===
                    temporaryAssistantId
                        ? {
                              ...message,
                              content:
                                  message.content +
                                  text,
                              status: "streaming",
                          }
                        : message
                )
            );
        },

        onDone() {
            abortControllerRef.current = null;

            setIsStreaming(false);

            setMessages((current) =>
                current.map((message) =>
                    message.id ===
                    temporaryAssistantId
                        ? {
                              ...message,
                              status: "complete",
                          }
                        : message
                )
            );

            window.dispatchEvent(
                new Event(
                    "conversations-updated"
                )
            );
        },

        onError(message) {
            abortControllerRef.current = null;

            setIsStreaming(false);
            setError(message);

            setMessages((current) =>
                current.map((message) =>
                    message.id ===
                    temporaryAssistantId
                        ? {
                              ...message,
                              status: "error",
                          }
                        : message
                )
            );
        },
    },
    controller.signal
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

            setMessages((current) =>
                current.map((message) =>
                    message.id ===
                        temporaryAssistantId
                        ? {
                            ...message,
                            status: "error",
                        }
                        : message
                )
            );
        }
    }

    function handleStopGenerating() {
        abortControllerRef.current?.abort();

        setIsStreaming(false);

        setMessages((current) =>
            current.map((message) => {
                if (
                    message.role === "ASSISTANT" &&
                    message.status === "streaming"
                ) {
                    return {
                        ...message,
                        status: "stopped",
                    };
                }

                return message;
            })
        );

        abortControllerRef.current = null;
    }

    const handleRetry = async (userMessageId: string) => {
        if (isStreaming) {
            return;
        }

        const existingUserMessage = messages.find(
            (message) =>
                message.id === userMessageId &&
                message.role === "USER"
        );

        if (!existingUserMessage) {
            return;
        }

        /*
         * Remove the failed/stopped assistant message that belongs
         * to this generation attempt.
         *
         * Because the failed/stopped assistant was never persisted,
         * normally this is the temporary assistant message immediately
         * after the USER message.
         */
        setMessages((currentMessages) => {
            const userIndex = currentMessages.findIndex(
                (message) => message.id === userMessageId
            );

            if (userIndex === -1) {
                return currentMessages;
            }

            const nextMessages = [...currentMessages];

            const possibleAssistant =
                nextMessages[userIndex + 1];

            if (
                possibleAssistant?.role === "ASSISTANT" &&
                (
                    possibleAssistant.status === "stopped" ||
                    possibleAssistant.status === "error"
                )
            ) {
                nextMessages.splice(userIndex + 1, 1);
            }

            return nextMessages;
        });

        const assistantId = createTemporaryId();

        setMessages((currentMessages) => [
            ...currentMessages,
            {
                id: assistantId,
                role: "ASSISTANT",
                content: "",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                status: "streaming",
            },
        ]);

        setIsStreaming(true);

        const controller = new AbortController();

        abortControllerRef.current = controller;

        try {
          await streamChatMessage(
    `/api/messages/${userMessageId}/retry`,
    undefined,
    {
        onUserMessage({ id }) {
            console.log(
                "Retrying user message:",
                id
            );
        },

        onGenerationStarted({ id }) {
            console.log(
                "Retry generation:",
                id
            );
        },

        onChunk(content) {
            setMessages((currentMessages) =>
                currentMessages.map(
                    (message) =>
                        message.id ===
                        assistantId
                            ? {
                                  ...message,
                                  content:
                                      message.content +
                                      content,
                                  status: "streaming",
                              }
                            : message
                )
            );
        },

        onDone() {
            setMessages((currentMessages) =>
                currentMessages.map(
                    (message) =>
                        message.id ===
                        assistantId
                            ? {
                                  ...message,
                                  status: "complete",
                              }
                            : message
                )
            );

            setIsStreaming(false);

            window.dispatchEvent(
                new Event(
                    "conversations-updated"
                )
            );
        },

        onError(message) {
            console.error(message);

            setMessages((currentMessages) =>
                currentMessages.map(
                    (message) =>
                        message.id ===
                        assistantId
                            ? {
                                  ...message,
                                  status: "error",
                              }
                            : message
                )
            );

            setIsStreaming(false);
        },
    },
    controller.signal
);
        } catch (error) {
            if (
                error instanceof DOMException &&
                error.name === "AbortError"
            ) {
                return;
            }

            console.error(error);

            setMessages((currentMessages) =>
                currentMessages.map((item) =>
                    item.id === assistantId
                        ? {
                            ...item,
                            status: "error",
                        }
                        : item
                )
            );

            setIsStreaming(false);
        } finally {
            abortControllerRef.current = null;
        }
    };

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <ChatMessages
                messages={messages}
                isStreaming={isStreaming}
                onRetry={handleRetry}
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