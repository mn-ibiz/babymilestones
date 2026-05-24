import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users } from "@bm/db";
import {
  DUMMY_PIN_HASH,
  normalizePhone,
  serializeSessionCookie,
  verifyPin,
} from "@bm/auth";
import type { AuthDeps } from "./index.js";

interface LoginBody {
  phone?: string;
  pin?: string;
}

// AC2/AC4: one generic message; never disclose which field was wrong or
// whether the phone exists.
const INVALID = { error: "Invalid credentials" };

/** POST /auth/login — returning parent logs in with phone + PIN (P1-E01-S02). */
export function registerLogin(app: FastifyInstance, { db, sessions, rateLimiter }: AuthDeps): void {
  app.post("/auth/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as LoginBody;

    const phone = normalizePhone(body.phone ?? "");
    // Malformed input is rejected before any audit/lookup — it is not a
    // credential failure and must not consume a rate-limit slot.
    if (!phone) {
      return reply.code(400).send({ error: "Enter a valid Kenyan phone number" });
    }
    const pin = body.pin ?? "";
    const ip = req.ip;

    // AC3: block once the window's failure budget is spent.
    const gate = rateLimiter.check(phone, ip);
    if (!gate.allowed) {
      reply.header("retry-after", String(gate.retryAfter));
      return reply.code(429).send({ error: "Too many attempts. Try again later." });
    }

    const [user] = await db.select().from(users).where(eq(users.phone, phone));

    // AC4: on an unknown phone, verify against a fixed dummy hash so the
    // argon2 cost (and thus timing + response) matches a wrong-PIN path. The
    // result is always treated as a failure when there is no user.
    const pinHash = user?.pinHash ?? DUMMY_PIN_HASH;
    const pinMatches = await verifyPin(pinHash, pin);
    const ok = user !== undefined && pinMatches;

    if (!ok) {
      rateLimiter.recordFailure(phone, ip);
      // AC5: audit the failure (never the PIN). actor is null for unknown phone.
      await audit(db, {
        actor: user?.id ?? null,
        action: "auth.login.failure",
        ...(user ? { target: { table: "users", id: user.id } } : {}),
        payload: { ip, user_agent: req.headers["user-agent"] ?? null },
      });
      return reply.code(401).send(INVALID);
    }

    // AC1: success → fresh session cookie + dashboard redirect; clear counter.
    rateLimiter.reset(phone, ip);
    await audit(db, {
      actor: user.id,
      action: "auth.login.success",
      target: { table: "users", id: user.id },
      payload: { ip, user_agent: req.headers["user-agent"] ?? null },
    });
    const token = await sessions.create(user.id);
    reply.header("set-cookie", serializeSessionCookie(token));
    return reply.code(200).send({ redirect: "/dashboard" });
  });
}
