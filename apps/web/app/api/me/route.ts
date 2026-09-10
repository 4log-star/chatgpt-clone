import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { error } from "node:console";
import { createHash } from "node:crypto";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  return Response.json({ user });
}
