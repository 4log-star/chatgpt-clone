import { NextResponse } from "next/server";
import z from "zod";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(10_000),
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = chatRequestSchema.safeParse(body);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid request",
      },
      {
        status: 400,
      },
    );
  }

  const { message } = result.data!;

  return Response.json({
    message: "Message received successfully",
    received: message,
  });
}
