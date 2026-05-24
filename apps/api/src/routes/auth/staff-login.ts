import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users } from "@bm/db";
import {
  DUMMY_PIN_HASH,
  isStaffRole,
  landingForRole,
  normalizePhone,
  serializeSessionCookie,
  serializeCsrfCookie,
  generateCsrfToken,
  verifyPin,
} from "@bm/auth";
import type { AuthDeps } from "./index.js";

interface StaffLoginBody {
  phone?: string;
  pin?: string;
}

// One generic credential message; never disclose which field was wrong or
// whether the phone exists (anti-enumeration, parity with parent login).
const INVALID = { error: "Invalid credentials" };
const NOT_STAFF = { error: "Not a staff account" };

/**
 * POST /auth/staff/login — admin/reception/cashier (and other staff roles) log
 * in with phone + PIN (P1-E01-S03). Reuses the parent login primitives
 * (verifyPin, rate limiter, session cookie) and adds a role gate + role-based
 * landing. The same `bm_session` cookie is issued (scoped to
 * `.babymilestones.co.ke`) so SSO works from `admin.babymilestones.co.ke`.
 */
export function registerStaffLogin(
  app: FastifyInstance,
  { db, sessions, rateLimiter }: AuthDeps,
): void {
  app.post("/auth/staff/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as StaffLoginBody;

    const phone = normalizePhone(body.phone ?? "");
    // Malformed input is a 400 before any audit/lookup and never consumes a
    // rate-limit slot (parity with parent login).
    if (!phone) {
      return reply.code(400).send({ error: "Enter a valid Kenyan phone number" });
    }
    const pin = body.pin ?? "";
    const ip = req.ip;

    const gate = rateLimiter.check(phone, ip);
    if (!gate.allowed) {
      reply.header("retry-after", String(gate.retryAfter));
      return reply.code(429).send({ error: "Too many attempts. Try again later." });
    }

    const [user] = await db.select().from(users).where(eq(users.phone, phone));

    // Constant-cost verify against a dummy hash on unknown phone so timing and
    // response match a wrong-PIN path (anti-enumeration).
    const pinHash = user?.pinHash ?? DUMMY_PIN_HASH;
    const pinMatches = await verifyPin(pinHash, pin);
    const credentialsOk = user !== undefined && pinMatches;

    if (!credentialsOk) {
      rateLimiter.recordFailure(phone, ip);
      await audit(db, {
        actor: user?.id ?? null,
        action: "auth.staff.login.failure",
        ...(user ? { target: { table: "users", id: user.id } } : {}),
        payload: { ip, user_agent: req.headers["user-agent"] ?? null, reason: "credentials" },
      });
      return reply.code(401).send(INVALID);
    }

    // Flow isolation: a valid parent credential must NOT yield a staff session.
    // Credentials are correct, so this is a 403 (authn ok, not authorized here),
    // not a generic 401 — and it is audited as a staff-login failure.
    if (!isStaffRole(user.role)) {
      await audit(db, {
        actor: user.id,
        action: "auth.staff.login.failure",
        target: { table: "users", id: user.id },
        payload: { ip, user_agent: req.headers["user-agent"] ?? null, reason: "not_staff" },
      });
      return reply.code(403).send(NOT_STAFF);
    }

    rateLimiter.reset(phone, ip);
    await audit(db, {
      actor: user.id,
      action: "auth.staff.login",
      target: { table: "users", id: user.id },
      payload: { ip, user_agent: req.headers["user-agent"] ?? null, role: user.role },
    });
    const token = await sessions.create(user.id);
    // Same cookie machinery as parent login, plus a CSRF double-submit cookie.
    const csrf = generateCsrfToken();
    reply.header("set-cookie", [serializeSessionCookie(token), serializeCsrfCookie(csrf)]);
    // AC2: role drives where the client lands.
    return reply.code(200).send({ role: user.role, redirect: landingForRole(user.role), csrfToken: csrf });
  });
}
