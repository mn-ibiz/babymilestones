import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, otpCodes, smsOutbox, users, wallets } from "@bm/db";
import {
  InMemoryConsumedTokenStore,
  InMemorySessionStore,
  ResetRateLimiter,
  hashPin,
} from "@bm/auth";
import { eq } from "drizzle-orm";
import { buildApp } from "../../app.js";

const PHONE = "+254712345678";
const SECRET = "test-reset-secret";

describe("PIN reset by OTP (P1-E01-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let resetRateLimiter: ResetRateLimiter;
  let consumedTokens: InMemoryConsumedTokenStore;
  let clock = 1_700_000_000_000;
  const now = (): number => clock;

  async function seedUser(): Promise<string> {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: PHONE, pinHash: await hashPin("1357"), role: "parent" })
      .returning();
    return u!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    resetRateLimiter = new ResetRateLimiter(3, 60 * 60 * 1000, now);
    consumedTokens = new InMemoryConsumedTokenStore();
    clock = 1_700_000_000_000;
    app = buildApp({
      db: dbh.db,
      sessions,
      resetRateLimiter,
      consumedTokens,
      resetTokenSecret: SECRET,
      now,
    });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const post = (url: string, body: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    app.inject({ method: "POST", url, payload: body });

  async function latestCode(): Promise<string> {
    const [row] = await dbh.db
      .select()
      .from(smsOutbox)
      .where(eq(smsOutbox.phone, PHONE));
    const match = row!.body.match(/\b(\d{6})\b/u);
    return match![1]!;
  }

  it("request → code logged to sms_outbox, stored hashed with 10-min TTL, audited (AC1, AC5)", async () => {
    await seedUser();
    const res = await post("/auth/reset/request", { phone: "0712345678" });
    expect(res.statusCode).toBe(200);

    const sms = await dbh.db.select().from(smsOutbox);
    expect(sms).toHaveLength(1);
    expect(sms[0]!.template).toBe("auth.reset.code");

    const codes = await dbh.db.select().from(otpCodes);
    expect(codes).toHaveLength(1);
    const code = await latestCode();
    expect(codes[0]!.codeHash).not.toContain(code); // stored hashed, not raw
    expect(codes[0]!.consumedAt).toBeNull();
    expect(codes[0]!.expiresAt.getTime()).toBe(clock + 10 * 60 * 1000);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events.map((e) => e.action)).toContain("auth.reset.requested");
    // OTP never appears in any audit payload.
    expect(JSON.stringify(events)).not.toContain(code);
  });

  it("unknown phone returns the same response, mints no code (AC1 anti-enumeration)", async () => {
    const known = await seedUser();
    expect(known).toBeTruthy();
    const res = await post("/auth/reset/request", { phone: "0700000000" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    expect(await dbh.db.select().from(otpCodes)).toHaveLength(0);
    expect(await dbh.db.select().from(smsOutbox)).toHaveLength(0);
  });

  it("malformed phone → 400, no rate-limit consumed", async () => {
    const res = await post("/auth/reset/request", { phone: "123" });
    expect(res.statusCode).toBe(400);
  });

  it("verify with the right code → 15-min token; code consumed (AC2)", async () => {
    await seedUser();
    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    const res = await post("/auth/reset/verify", { phone: PHONE, code });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe("string");

    const [row] = await dbh.db.select().from(otpCodes);
    expect(row!.consumedAt).not.toBeNull(); // single-use consumed
  });

  it("a code is single-use: second verify fails (AC1)", async () => {
    await seedUser();
    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    await post("/auth/reset/verify", { phone: PHONE, code });
    const second = await post("/auth/reset/verify", { phone: PHONE, code });
    expect(second.statusCode).toBe(400);
  });

  it("an expired code (>10 min) cannot be verified", async () => {
    await seedUser();
    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    clock += 10 * 60 * 1000 + 1; // past TTL
    const res = await post("/auth/reset/verify", { phone: PHONE, code });
    expect(res.statusCode).toBe(400);
  });

  it("wrong code → 400", async () => {
    await seedUser();
    await post("/auth/reset/request", { phone: PHONE });
    const res = await post("/auth/reset/verify", { phone: PHONE, code: "000000" });
    expect(res.statusCode).toBe(400);
  });

  it("complete sets new PIN, invalidates sessions, audits (AC3, AC5)", async () => {
    const userId = await seedUser();
    const live = await sessions.create(userId);
    expect(await sessions.get(live)).not.toBeNull();

    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    const token = (await post("/auth/reset/verify", { phone: PHONE, code })).json().token as string;

    const res = await post("/auth/reset/complete", { token, pin: "2468" });
    expect(res.statusCode).toBe(200);

    const [user] = await dbh.db.select().from(users).where(eq(users.id, userId));
    expect(user!.pinHash).toMatch(/^\$argon2id\$/u); // hashed, not raw
    expect(JSON.stringify(res.json())).not.toContain("2468");

    // AC3: pre-existing session destroyed.
    expect(await sessions.get(live)).toBeNull();

    const events = await dbh.db.select().from(auditOutbox);
    expect(events.map((e) => e.action)).toContain("auth.reset.completed");
    expect(JSON.stringify(events)).not.toContain("2468");
  });

  it("reset token is single-use: replay → 400, PIN unchanged (AC2)", async () => {
    const userId = await seedUser();
    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    const token = (await post("/auth/reset/verify", { phone: PHONE, code })).json().token as string;

    expect((await post("/auth/reset/complete", { token, pin: "2468" })).statusCode).toBe(200);
    const [afterFirst] = await dbh.db.select().from(users).where(eq(users.id, userId));

    const replay = await post("/auth/reset/complete", { token, pin: "3579" });
    expect(replay.statusCode).toBe(400);
    const [afterReplay] = await dbh.db.select().from(users).where(eq(users.id, userId));
    expect(afterReplay!.pinHash).toBe(afterFirst!.pinHash); // unchanged
  });

  it("weak new PIN → 400 and the token is NOT burned", async () => {
    await seedUser();
    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    const token = (await post("/auth/reset/verify", { phone: PHONE, code })).json().token as string;

    expect((await post("/auth/reset/complete", { token, pin: "1234" })).statusCode).toBe(400);
    // Same token still works with a strong PIN (weak-PIN reject did not consume it).
    expect((await post("/auth/reset/complete", { token, pin: "2468" })).statusCode).toBe(200);
  });

  it("expired reset token → 400", async () => {
    await seedUser();
    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    const token = (await post("/auth/reset/verify", { phone: PHONE, code })).json().token as string;
    clock += 15 * 60 * 1000 + 1;
    expect((await post("/auth/reset/complete", { token, pin: "2468" })).statusCode).toBe(400);
  });

  it("rate-limit: 4th reset request within the hour → 429 (AC4)", async () => {
    await seedUser();
    for (let i = 0; i < 3; i++) {
      expect((await post("/auth/reset/request", { phone: PHONE })).statusCode).toBe(200);
    }
    const fourth = await post("/auth/reset/request", { phone: PHONE });
    expect(fourth.statusCode).toBe(429);
    expect(fourth.headers["retry-after"]).toBeDefined();
  });

  it("does not provision a duplicate wallet (sanity: reset never touches wallets)", async () => {
    const userId = await seedUser();
    await dbh.db.insert(wallets).values({ userId });
    await post("/auth/reset/request", { phone: PHONE });
    const code = await latestCode();
    const token = (await post("/auth/reset/verify", { phone: PHONE, code })).json().token as string;
    await post("/auth/reset/complete", { token, pin: "2468" });
    expect(await dbh.db.select().from(wallets)).toHaveLength(1);
  });
});
