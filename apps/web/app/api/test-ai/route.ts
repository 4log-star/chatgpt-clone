import { openai } from "@/lib/ai/openai";

export async function GET() {
  try {
    const response = await openai.responses.create({
      model: "gpt-5",
      input: "Say hello in one short sentence.",
    });

    return Response.json({
      output: response.output_text,
    });
  } catch (error) {
    console.error("AI request failed:", error);

    return Response.json({ error: "AI request failed" }, { status: 500 });
  }
}
