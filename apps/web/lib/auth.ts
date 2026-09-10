import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;

  if (!sessionToken) {
    return null;
  }

  const tokenHash = createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  const session = await prisma.session.findUnique({
    where: {
      tokenHash,
    },
    select: {
      userId: true,
      expiresAt: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({
      where: {
        tokenHash,
      },
    });

    return null;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.userId,
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  });

  return user;
}