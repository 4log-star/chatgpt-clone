import { prisma } from "@/lib/db";
import z from "zod";
import argon2 from "argon2";
import { createSession } from "@/lib/auth-session";
import { cookies } from "next/headers";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      return Response.json({ error: "Invalid login data" }, { status: 400 });
    }

    const { email, password } = result.data;
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return Response.json(
        {
          error: "Invalid email or password",
        },
        {
          status: 401,
        },
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const { sessionToken, expiresAt } = await createSession(user.id);
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
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);

    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
