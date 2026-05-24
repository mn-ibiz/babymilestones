import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, otpCodes, users } from "@bm/db";
import {
  OTP_TTL_MS,
  generateOtpCode,
  hashOtpCode,
  normalizePhone,
} from "@bm/auth";
import { StubSmsSender } from "@bm/sms";
import type { AuthDeps } from "./index.js";

interface ResetRequestBody {
  phone?: string;
}

// AC1 anti-enumeration: the same generic response whether or not the phone is
// a known account, so the endpoint can't be used to probe for registered users.
const GENERIC_OK = { ok: true, message: "If that number has an account, a reset code has been sent." };

/**
 * POST /auth/reset/request — start a PIN reset (P1-E01-S05, AC1/AC4/AC5).
 *
 * Generates a 6-digit code (10-min TTL, single-use), records it hashed, and
 * "delivers" it via the stub SMS sender into `sms_outbox`. Rate-limited to 3
 * codes per phone per hour. Always returns the same body regardless of whether
 * the phone exists (anti-enumeration); the OTP and PIN are never logged.
 */
export function registerResetRequest(
  app: FastifyInstance,
  { db, resetRateLimiter, now }: AuthDeps,
): void {
  app.post("/auth/reset/request", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as ResetRequestBody;
    const phone = normalizePhone(body.phone ?? "");
    // Malformed input is a client error, not a credential probe: it predates any
    // lookup or rate-limit accounting.
    if (!phone) {
      return reply.code(400).send({ field: "phone", error: "Enter a valid Kenyan phone number" });
    }

    // AC4: cap reset codes per phone per hour. Checked before any work so the
    // response shape is still generic when blocked.
    const gate = resetRateLimiter.consume(phone);
    if (!gate.allowed) {
      reply.header("retry-after", String(gate.retryAfter));
      return reply.code(429).send({ error: "Too many reset requests. Try again later." });
    }

    const [user] = await db.select().from(users).where(eq(users.phone, phone));

    // Only mint + deliver a real code for a known account, but the response is
    // identical to the unknown-phone path (AC1 anti-enumeration).
    if (user) {
      const code = generateOtpCode();
      const nowMs = now();
      await db.insert(otpCodes).values({
        phone,
        codeHash: hashOtpCode(code),
        purpose: "pin_reset",
        expiresAt: new Date(nowMs + OTP_TTL_MS),
      });
      await new StubSmsSender(db).send({
        phone,
        body: `Your Baby Milestones reset code is ${code}. It expires in 10 minutes.`,
        template: "auth.reset.code",
      });
      // AC5: audit the request — never the code itself.
      await audit(db, {
        actor: user.id,
        action: "auth.reset.requested",
        target: { table: "users", id: user.id },
        payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null },
      });
    }

    return reply.code(200).send(GENERIC_OK);
  });
}
