import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users, wallets } from "@bm/db";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";

describe("POST /auth/signup (P1-E01-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const signup = (body: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    app.inject({ method: "POST", url: "/auth/signup", payload: body });

  it("creates account, provisions wallet, audits, sets cookie (AC1, AC5, AC6)", async () => {
    const res = await signup({ phone: "0712345678", pin: "1357", pinConfirm: "1357" });
    expect(res.statusCode).toBe(201);

    const [user] = await dbh.db.select().from(users);
    expect(user!.phone).toBe("+254712345678");
    expect(user!.pinHash).toMatch(/^\$argon2id\$/u); // AC5: hashed, not raw
    expect(JSON.stringify(res.json())).not.toContain("1357"); // PIN never echoed

    const w = await dbh.db.select().from(wallets);
    expect(w).toHaveLength(1); // AC1: wallet auto-provisioned
    expect(w[0]!.userId).toBe(user!.id);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events[0]!.action).toBe("auth.signup"); // AC6
    expect(events[0]!.actorUserId).toBe(user!.id);
    const payload = events[0]!.payload as Record<string, unknown>;
    expect("ip" in payload).toBe(true);
    expect("user_agent" in payload).toBe(true);
    expect(events[0]!.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(payload)).not.toContain("1357");

    // AC1: the issued cookie is a real, resolvable session for this user.
    const cookie = res.headers["set-cookie"] as string;
    expect(cookie).toMatch(/bm_session=.*HttpOnly.*Secure.*SameSite=Lax/u);
    const token = cookie.match(/bm_session=([^;]+)/u)![1]!;
    expect((await sessions.get(token))?.userId).toBe(user!.id);
  });

  it("duplicate phone → 409 login redirect, no second account (AC2)", async () => {
    await signup({ phone: "0712345678", pin: "1357", pinConfirm: "1357" });
    const res = await signup({ phone: "+254712345678", pin: "2468", pinConfirm: "2468" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ action: "login" });
    expect(await dbh.db.select().from(users)).toHaveLength(1);
  });

  it("invalid phone → 400 field error, no account (AC3)", async () => {
    const res = await signup({ phone: "123", pin: "1357", pinConfirm: "1357" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ field: "phone" });
    expect(await dbh.db.select().from(users)).toHaveLength(0);
  });

  it("weak PIN → 400 field error (AC4)", async () => {
    const res = await signup({ phone: "0712345678", pin: "1234", pinConfirm: "1234" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ field: "pin" });
  });

  it("mismatched PINs → 400", async () => {
    const res = await signup({ phone: "0712345678", pin: "1357", pinConfirm: "1358" });
    expect(res.statusCode).toBe(400);
  });
});
