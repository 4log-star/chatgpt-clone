"use client";

import {SubmitEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        if (loading) {
            return;
        }

        setError(null);
        setLoading(true);

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email,
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error ?? "Login failed");
                return;
            }

            router.push("/chat");
            router.refresh();
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border p-6">
                <h1 className="mb-6 text-2xl font-semibold">
                    Log in
                </h1>

                <form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-4"
                >
                    <input
                        type="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.target.value)
                        }
                        placeholder="Email"
                        autoComplete="email"
                        className="rounded-lg border px-4 py-3 outline-none"
                    />

                    <input
                        type="password"
                        value={password}
                        onChange={(event) =>
                            setPassword(event.target.value)
                        }
                        placeholder="Password"
                        autoComplete="current-password"
                        className="rounded-lg border px-4 py-3 outline-none"
                    />

                    {error && (
                        <p className="text-sm text-red-500">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={
                            loading ||
                            !email.trim() ||
                            !password
                        }
                        className="rounded-lg bg-black px-4 py-3 text-white disabled:opacity-40 cursor-pointer hover:bg-white hover:text-black"
                    >
                        {loading ? "Logging in..." : "Log in"}
                    </button>
                </form>
            </div>
        </main>
    );
}