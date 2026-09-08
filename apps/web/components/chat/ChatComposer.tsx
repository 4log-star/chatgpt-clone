"use client";

import { SubmitEvent, useState } from "react";

export default function ChatComposer() {
    const [message, setMessage] = useState("");

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!message.trim()) return;

        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message
            })
        })

        const data = await response.json();
        console.log("Server response : ", data);
        setMessage("");
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
                    placeholder="Ask anything..."
                    className="flex-1 bg-transparent outline-none"
                />

                <button
                    type="submit"
                    disabled={!message.trim()}
                    className="rounded-full bg-black px-4 py-2 text-white disabled:opacity-40"
                >
                    ↑
                </button>
            </div>
        </form>
    );
}