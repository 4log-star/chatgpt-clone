import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export async function createSession(userId: string) {
    const sessionToken = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256")
        .update(sessionToken)
        .digest("hex");

    const expiresAt = new Date(
        Date.now() + SESSION_DURATION_MS
    );

    await prisma.session.create({
        data: {
            tokenHash,
            userId,
            expiresAt,
        },
    });

    return {
        sessionToken,
        expiresAt,
    };
}