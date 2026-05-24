import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users } from "@bm/db";
import {
  hashPin,
  isValidPinFormat,
  isWeakPin,
  verifyResetToken,
} from "@bm/auth";
import type { AuthDeps } from "./index.js";

interface ResetCompleteBody {
  token?: string;
  pin?: string;
}

/**
 * POST /auth/reset/complete — set a new PIN with a valid reset token
 * (P1-E01-S05, AC3/AC5). Verifies the token (signature + audience + expiry),
 * enforces single-use via the consumed-token store, rejects weak/malformed
 * PINs, hashes the new PIN (argon2id), and invalidates ALL existing sessions
 * for the user. The reset is audited; the token and PIN are never logged.
 */
export function registerResetComplete(
  app: FastifyInstance,
  { db, sessions, consumedTokens, resetTokenSecret, now }: AuthDeps,
): void {
  app.post("/auth/reset/complete", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as ResetCompleteBody;
    const token = body.token ?? "";
    const pin = body.pin ?? "";

    if (!token) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }
    // Validate the new PIN before redeeming the token, so a weak-PIN retry does
    // not burn the single-use token.
    if (!isValidPinFormat(pin)) {
      return reply.code(400).send({ field: "pin", error: "PIN must be 4 digits" });
    }
    if (isWeakPin(pin)) {
      return reply.code(400).send({ field: "pin", error: "Choose a less predictable PIN" });
    }

    const verified = verifyResetToken({ token, secret: resetTokenSecret, now });
    if (!verified.ok) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    // AC2 single-use: a token can be redeemed exactly once. Consume before the
    // PIN write so a replay can never reach the mutation.
    const fresh = await consumedTokens.consume(verified.payload.jti);
    if (!fresh) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    const userId = verified.payload.sub;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    const pinHash = await hashPin(pin);
    await db.update(users).set({ pinHash }).where(eq(users.id, userId));

    // AC3: invalidate every existing session (prod Redis DEL of the user's set).
    await sessions.destroyAllForUser(userId);

    // AC5: audit the completion. Never log the PIN or token.
    await audit(db, {
      actor: userId,
      action: "auth.reset.completed",
      target: { table: "users", id: userId },
      payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
    });

    return reply.code(200).send({ ok: true });
  });
}
