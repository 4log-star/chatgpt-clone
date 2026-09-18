"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import MarkdownCodeBlock from "./MarkdownCodeBlock";

type MessageRole = "USER" | "ASSISTANT";

type MessageStatus =
    | "complete"
    | "streaming"
    | "stopped"
    | "error";

type GenerationStatus =
    | "STREAMING"
    | "COMPLETED"
    | "STOPPED"
    | "ERROR";

type Generation = {
    id: string;
    userMessageId: string;
    status: GenerationStatus;
    createdAt?: string;
    updatedAt?: string;
    assistantMessageId?: string | null;
};

type Message = {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    updatedAt: string;
    status: MessageStatus;

    /*
     * Present on an ASSISTANT message that came
     * from a persisted generation.
     */
    generation?: Generation | null;

    /*
     * Present on a USER message.
     *
     * One user message can have multiple generations.
     */
    generationsFromUser?: Array<{
        id: string;
        status: GenerationStatus;
        createdAt: string;
        updatedAt: string;
        assistantMessageId: string | null;
    }>;
};

type ChatMessagesProps = {
    messages: Message[];
    isStreaming: boolean;
    onRetry: (userMessageId: string) => void;
    onRegenerate: (userMessageId: string) => void;
};

export default function ChatMessages({
    messages,
    isStreaming,
    onRetry,
    onRegenerate,
}: ChatMessagesProps) {
    const [
        selectedAssistantIds,
        setSelectedAssistantIds,
    ] = useState<Record<string, string>>({});

    const bottomRef =
        useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({
            behavior: "smooth",
        });
    }, [messages, isStreaming]);

    /*
     * ---------------------------------------------------------
     * STEP 1
     *
     * Group persisted ASSISTANT messages by the USER message
     * that generated them.
     *
     * Example:
     *
     * user-1
     *   -> assistant-1
     *   -> assistant-2
     *   -> assistant-3
     * ---------------------------------------------------------
     */
    const assistantsByUserMessage = new Map<
        string,
        Message[]
    >();

    for (const message of messages) {
        if (
            message.role === "ASSISTANT" &&
            message.generation?.userMessageId
        ) {
            const userMessageId =
                message.generation.userMessageId;

            const existing =
                assistantsByUserMessage.get(
                    userMessageId
                ) ?? [];

            existing.push(message);

            assistantsByUserMessage.set(
                userMessageId,
                existing
            );
        }
    }

    /*
     * ---------------------------------------------------------
     * STEP 2
     *
     * Find all assistant generations for a USER message.
     *
     * We also look for a temporary assistant message.
     *
     * A temporary assistant does not have `generation`
     * because it has not been saved to the database yet.
     * ---------------------------------------------------------
     */
    function getAssistantCandidates(
        userMessage: Message
    ) {
        const persistedAssistants =
            assistantsByUserMessage.get(
                userMessage.id
            ) ?? [];

        const userIndex = messages.findIndex(
            (message) =>
                message.id === userMessage.id
        );

        const nextMessage =
            userIndex >= 0
                ? messages[userIndex + 1]
                : undefined;

        const isTemporaryAssistant =
            nextMessage?.role === "ASSISTANT" &&
            !nextMessage.generation;

        if (isTemporaryAssistant) {
            return [
                ...persistedAssistants,
                nextMessage,
            ];
        }

        return persistedAssistants;
    }

    /*
     * ---------------------------------------------------------
     * STEP 3
     *
     * Select which generation should be displayed.
     *
     * If the user has never selected one:
     * show the latest generation.
     * ---------------------------------------------------------
     */
    function getSelectedAssistant(
        userMessage: Message
    ) {
        const candidates =
            getAssistantCandidates(userMessage);

        if (candidates.length === 0) {
            return null;
        }

        const selectedId =
            selectedAssistantIds[userMessage.id];

        if (selectedId) {
            const selected = candidates.find(
                (assistant) =>
                    assistant.id === selectedId
            );

            if (selected) {
                return selected;
            }
        }

        return candidates[candidates.length - 1];
    }

    /*
     * ---------------------------------------------------------
     * STEP 4
     *
     * Change selected generation.
     * ---------------------------------------------------------
     */
    function selectAssistant(
        userMessageId: string,
        assistantId: string
    ) {
        setSelectedAssistantIds(
            (current) => ({
                ...current,
                [userMessageId]:
                    assistantId,
            })
        );
    }

    return (
        <section className="flex flex-1 flex-col overflow-y-auto p-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                {messages.map((message, index) => {
                    /*
                     * -------------------------------------------------
                     * IMPORTANT:
                     *
                     * Persisted assistant generations are rendered
                     * together with their USER message.
                     *
                     * Therefore we skip them here.
                     *
                     * Otherwise A1, A2, A3 would all render.
                     * -------------------------------------------------
                     */
                    if (
                        message.role === "ASSISTANT" &&
                        message.generation
                    ) {
                        return null;
                    }

                    const isUser =
                        message.role === "USER";

                    /*
                     * -------------------------------------------------
                     * ASSISTANT WITHOUT GENERATION
                     *
                     * This is usually the temporary streaming
                     * assistant created by ChatPage.
                     *
                     * We still render it normally.
                     * -------------------------------------------------
                     */
                    if (!isUser) {
                        return (
                            <div
                                key={message.id}
                                className="self-start max-w-2xl rounded-2xl bg-zinc-900 px-4 py-3 text-white"
                            >
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

                                {message.status ===
                                    "streaming" && (
                                        <span className="ml-1 inline-block animate-pulse">
                                            ▍
                                        </span>
                                    )}

                                {message.status ===
                                    "stopped" && (
                                        <>
                                            <div className="mt-2 text-xs text-zinc-400">
                                                Generation stopped
                                            </div>

                                            {index >
                                                0 &&
                                                messages[
                                                    index -
                                                    1
                                                ]
                                                    ?.role ===
                                                "USER" && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onRetry(
                                                                messages[
                                                                    index -
                                                                    1
                                                                ].id
                                                            )
                                                        }
                                                        disabled={
                                                            isStreaming
                                                        }
                                                        className="mt-2 rounded-md border px-3 py-1.5 text-sm"
                                                    >
                                                        Retry
                                                    </button>
                                                )}
                                        </>
                                    )}

                                {message.status ===
                                    "error" && (
                                        <>
                                            <div className="mt-2 text-xs text-red-400">
                                                Error generating
                                                response
                                            </div>

                                            {index >
                                                0 &&
                                                messages[
                                                    index -
                                                    1
                                                ]
                                                    ?.role ===
                                                "USER" && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onRetry(
                                                                messages[
                                                                    index -
                                                                    1
                                                                ].id
                                                            )
                                                        }
                                                        disabled={
                                                            isStreaming
                                                        }
                                                        className="mt-2 rounded-md border px-3 py-1.5 text-sm"
                                                    >
                                                        Retry
                                                    </button>
                                                )}
                                        </>
                                    )}
                            </div>
                        );
                    }

                    /*
                     * -------------------------------------------------
                     * USER MESSAGE
                     * -------------------------------------------------
                     */

                    const assistantCandidates =
                        getAssistantCandidates(
                            message
                        );

                    const selectedAssistant =
                        getSelectedAssistant(
                            message
                        );

                    const selectedIndex =
                        selectedAssistant
                            ? assistantCandidates.findIndex(
                                (assistant) =>
                                    assistant.id ===
                                    selectedAssistant.id
                            )
                            : -1;

                    const hasMultipleGenerations =
                        assistantCandidates.length >
                        1;

                    return (
                        <div
                            key={message.id}
                            className="flex flex-col gap-2"
                        >
                            {/* USER MESSAGE */}
                            <div className="self-end max-w-2xl rounded-2xl bg-blue-900 px-4 py-3 text-white">
                                <div className="whitespace-pre-wrap">
                                    {
                                        message.content
                                    }
                                </div>
                            </div>

                            {/* ASSISTANT GENERATION */}
                            {selectedAssistant && (
                                <div className="self-start max-w-2xl rounded-2xl bg-zinc-900 px-4 py-3 text-white">
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
                                                selectedAssistant.content
                                            }
                                        </ReactMarkdown>
                                    </div>

                                    {selectedAssistant.status ===
                                        "streaming" && (
                                            <span className="ml-1 inline-block animate-pulse">
                                                ▍
                                            </span>
                                        )}

                                    {selectedAssistant.status ===
                                        "stopped" && (
                                            <div className="mt-2 text-xs text-zinc-400">
                                                Generation stopped
                                            </div>
                                        )}

                                    {selectedAssistant.status ===
                                        "error" && (
                                            <div className="mt-2 text-xs text-red-400">
                                                Error generating
                                                response
                                            </div>
                                        )}

                                    {/*
                                     * GENERATION SELECTOR
                                     *
                                     * Only display when this USER
                                     * message has multiple assistant
                                     * generations.
                                     */}
                                    {hasMultipleGenerations && (
                                        <div className="mt-3 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (
                                                        selectedIndex >
                                                        0
                                                    ) {
                                                        selectAssistant(
                                                            message.id,
                                                            assistantCandidates[
                                                                selectedIndex -
                                                                1
                                                            ].id
                                                        );
                                                    }
                                                }}
                                                disabled={
                                                    selectedIndex <=
                                                    0
                                                }
                                                className="rounded-md border border-zinc-700 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                ←
                                            </button>

                                            <span className="text-xs text-zinc-400">
                                                {selectedIndex +
                                                    1}{" "}
                                                /{" "}
                                                {
                                                    assistantCandidates.length
                                                }
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (
                                                        selectedIndex <
                                                        assistantCandidates.length -
                                                        1
                                                    ) {
                                                        selectAssistant(
                                                            message.id,
                                                            assistantCandidates[
                                                                selectedIndex +
                                                                1
                                                            ].id
                                                        );
                                                    }
                                                }}
                                                disabled={
                                                    selectedIndex >=
                                                    assistantCandidates.length -
                                                    1
                                                }
                                                className="rounded-md border border-zinc-700 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                →
                                            </button>
                                        </div>
                                    )}

                                    {selectedAssistant.generation?.status ===
                                        "COMPLETED" && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onRegenerate(message.id)
                                                }
                                                disabled={isStreaming}
                                                className="mt-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
                                            >
                                                Regenerate
                                            </button>
                                        )}

                                    {/*
                                     * RETRY
                                     *
                                     * Only needed when the currently
                                     * selected generation failed/stopped.
                                     */}
                                    {(selectedAssistant.status ===
                                        "error" ||
                                        selectedAssistant.status ===
                                        "stopped") && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onRetry(
                                                        message.id
                                                    )
                                                }
                                                disabled={
                                                    isStreaming
                                                }
                                                className="mt-2 rounded-md border px-3 py-1.5 text-sm"
                                            >
                                                Retry
                                            </button>
                                        )}
                                </div>
                            )}
                        </div>
                    );
                })}

                <div ref={bottomRef} />
            </div>
        </section>
    );
}