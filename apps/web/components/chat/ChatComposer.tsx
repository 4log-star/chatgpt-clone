"use client";

import type { SubmitEvent } from "react";
import { useState } from "react";

type ChatComposerProps = {
    onSend: (message: string) => void | Promise<void>;
    onStop: () => void;
    disabled?: boolean;
};

export default function ChatComposer({
    onSend,
    onStop,
    disabled = false,
}: ChatComposerProps) {
    const [message, setMessage] = useState("");

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        const content = message.trim();

        if (!content || disabled) {
            return;
        }

        setMessage("");

        await onSend(content);
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="border-t p-4"
        >
            <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border px-4 py-2">
                <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={
                        disabled
                            ? "Generating response..."
                            : "Ask anything..."
                    }
                    disabled={disabled}
                    className="flex-1 bg-transparent outline-none disabled:opacity-50"
                />

                {disabled ? (
                    <button
                        type="button"
                        onClick={onStop}
                        className="rounded-full bg-black px-4 py-2 text-white cursor-pointer"
                    >
                        ■
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!message.trim()}
                        className="rounded-full bg-black px-4 py-2 text-white disabled:opacity-40 cursor-pointer"
                    >
                        ↑
                    </button>
                )}
            </div>
        </form>
    );
}