import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { otpCodes, users } from "@bm/db";
import { issueResetToken, normalizePhone, verifyOtpCode } from "@bm/auth";
import type { AuthDeps } from "./index.js";

interface ResetVerifyBody {
  phone?: string;
  code?: string;
}

// One generic failure for any bad/expired/used code — never disclose which.
const INVALID = { error: "Invalid or expired code" };

/**
 * POST /auth/reset/verify — exchange a valid code for a reset token
 * (P1-E01-S05, AC2). On success the code is consumed (single-use) and a 15-min,
 * audience-bound reset token is minted. Expired, already-consumed, or unknown
 * codes all return the same generic error.
 */
export function registerResetVerify(
  app: FastifyInstance,
  { db, resetTokenSecret, now }: AuthDeps,
): void {
  app.post("/auth/reset/verify", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as ResetVerifyBody;
    const phone = normalizePhone(body.phone ?? "");
    const code = body.code ?? "";
    if (!phone || !/^\d{6}$/u.test(code)) {
      return reply.code(400).send(INVALID);
    }

    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    if (!user) return reply.code(400).send(INVALID);

    // Newest unconsumed code for this phone+purpose.
    const [row] = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, "pin_reset")))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    const nowMs = now();
    const valid =
      row !== undefined &&
      row.consumedAt === null &&
      row.expiresAt.getTime() > nowMs &&
      verifyOtpCode(code, row.codeHash);

    if (!valid) {
      return reply.code(400).send(INVALID);
    }

    // Single-use: consume the code now so it can't be replayed.
    await db
      .update(otpCodes)
      .set({ consumedAt: new Date(nowMs) })
      .where(eq(otpCodes.id, row.id));

    const token = issueResetToken({ userId: user.id, secret: resetTokenSecret, now });
    return reply.code(200).send({ token });
  });
}
