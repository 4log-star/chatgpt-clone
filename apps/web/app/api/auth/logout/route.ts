import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;

    if (sessionToken) {
      const tokenHash = createHash("sha256").update(sessionToken).digest("hex");

      await prisma.session.deleteMany({
        where: {
          tokenHash,
        },
      });
    }
    cookieStore.delete("session");
    return Response.json({
      success: true,
    });
  } catch (error) {
    console.error("POST /api/auth/logout failed:", error);

    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
