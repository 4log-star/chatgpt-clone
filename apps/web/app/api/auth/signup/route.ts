import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import argon2 from "argon2";
import { z } from "zod";

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = signupSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: "Invalid signup data",
        },
        { status: 400 }
      );
    }

    const { email, password } = result.data;

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return Response.json(
        {
          error: "Unable to create account",
        },
        { status: 409 }
      );
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    // Generate the actual secret that will be sent to the browser.
    const sessionToken = randomBytes(32).toString("hex");

    // Store only the hash of that secret in the database.
    const tokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    // The raw token goes to the browser, not the database.
    const cookieStore = await cookies();

    cookieStore.set({
      name: "session",
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return Response.json(
      {
        user,
      },
      { status: 201 }
    );
  } catch {
    return Response.json(
      {
        error: "Something went wrong",
      },
      { status: 500 }
    );
  }
}