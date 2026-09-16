"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

type MarkdownCodeBlockProps = {
    language?: string;
    code: string;
};

export default function MarkdownCodeBlock({
    language,
    code,
}: MarkdownCodeBlockProps) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(code);

            setCopied(true);

            window.setTimeout(() => {
                setCopied(false);
            }, 1500);
        } catch (error) {
            console.error("Failed to copy code:", error);
        }
    }

    return (
        <div className="my-4 overflow-hidden rounded-xl border border-zinc-800">
            <div className="flex items-center justify-between bg-zinc-950 px-4 py-2">
                <span className="text-xs text-zinc-400">
                    {language || "code"}
                </span>

                <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs text-zinc-400 transition hover:text-white"
                >
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>

            <SyntaxHighlighter
                language={language || "text"}
                style={vscDarkPlus}
                customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    padding: "1rem",
                    background: "#09090b",
                    fontSize: "0.875rem",
                }}
                wrapLongLines={false}
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
}