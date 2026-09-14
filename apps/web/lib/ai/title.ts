import "server-only";

import { openai } from "./openai";

const TITLE_SYSTEM_PROMPT = `
Generate a short title for a chat conversation.

Rules:
- Use 3 to 6 words.
- Describe the main topic.
- Do not use quotes.
- Do not include markdown.
- Do not mention that you are generating a title.
`;

export async function generateConversationTitle(
    userMessage: string
): Promise<string> {
    const response = await openai.chat.completions.create({
        model: "gemma3:4b",
        messages: [
            {
                role: "system",
                content: TITLE_SYSTEM_PROMPT,
            },
            {
                role: "user",
                content: userMessage,
            },
        ],
        temperature: 0.2,
        stream: false,
    });

    const title =
        response.choices[0]?.message?.content?.trim();

    if (!title) {
        throw new Error("Model did not return a title");
    }

    return title.replace(/^["']|["']$/g, "");
}