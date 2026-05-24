import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, wallets } from "@bm/db";
import {
  hashPin,
  isValidPinFormat,
  isWeakPin,
  normalizePhone,
  serializeSessionCookie,
} from "@bm/auth";
import type { AuthDeps } from "./index.js";

interface SignupBody {
  phone?: string;
  pin?: string;
  pinConfirm?: string;
}

const DUPLICATE = { error: "You already have an account — please log in", action: "login" };

/** Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "23505" || /duplicate key|unique constraint/iu.test(e?.message ?? "");
}

/** POST /auth/signup — parent registration with phone + PIN (P1-E01-S01). */
export function registerSignup(app: FastifyInstance, { db, sessions }: AuthDeps): void {
  app.post("/auth/signup", async (req, reply) => {
    const body = (req.body ?? {}) as SignupBody;

    const phone = normalizePhone(body.phone ?? "");
    if (!phone) {
      return reply.code(400).send({ error: "Enter a valid Kenyan phone number", field: "phone" });
    }
    const pin = body.pin ?? "";
    if (!isValidPinFormat(pin)) {
      return reply.code(400).send({ error: "PIN must be 4 digits", field: "pin" });
    }
    if (pin !== (body.pinConfirm ?? "")) {
      return reply.code(400).send({ error: "PINs do not match", field: "pinConfirm" });
    }
    if (isWeakPin(pin)) {
      return reply.code(400).send({ error: "Choose a less predictable PIN", field: "pin" });
    }

    // AC2: duplicate phone → friendly redirect to login, no account leak.
    const existing = await db.select().from(users).where(eq(users.phone, phone));
    if (existing.length > 0) {
      return reply.code(409).send(DUPLICATE);
    }

    const pinHash = await hashPin(pin);

    let userId: string;
    try {
      userId = await db.transaction(async (tx) => {
        const [user] = await tx.insert(users).values({ phone, pinHash }).returning();
        await tx.insert(wallets).values({ userId: user!.id }); // AC1: wallet auto-provisioned
        await audit(tx, {
          actor: user!.id,
          action: "auth.signup",
          target: { table: "users", id: user!.id },
          payload: { ip: req.ip, user_agent: req.headers["user-agent"] ?? null }, // AC6 (no PIN)
        });
        return user!.id;
      });
    } catch (err) {
      // Only a unique-constraint race (check→insert) is a duplicate; anything
      // else is a real failure that must surface (500 + logged), not masked.
      if (isUniqueViolation(err)) return reply.code(409).send(DUPLICATE);
      throw err;
    }

    const token = await sessions.create(userId); // AC1: auto-logged in
    reply.header("set-cookie", serializeSessionCookie(token));
    return reply.code(201).send({ userId });
  });
}
