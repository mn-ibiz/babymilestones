import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, hashPin, verifyPin } from "@bm/auth";
import { buildApp } from "../../app.js";

describe("PUT /parents/me/pin (P1-E11-S04 AC3)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let userId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: await hashPin("1357") })
      .returning();
    userId = u!.id;
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone: "0712345678", pin: "1357" },
    });
    const cookies = login.headers["set-cookie"] as string[];
    sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    csrfToken = login.json().csrfToken as string;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const putPin = (body: Record<string, unknown>, opts: { auth?: boolean; csrf?: boolean } = {}) => {
    const { auth = true, csrf = true } = opts;
    const headers: Record<string, string> = {};
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(sessionCookie);
    if (csrf) cookieParts.push(csrfCookie);
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = csrfToken;
    return app.inject({ method: "PUT", url: "/parents/me/pin", headers, payload: body });
  };

  it("rejects an unauthenticated change", async () => {
    const res = await putPin(
      { currentPin: "1357", newPin: "8642" },
      { auth: false, csrf: false },
    );
    expect(res.statusCode).toBe(401);
  });

  it("rejects a change without a CSRF token (mutating verb)", async () => {
    const res = await putPin({ currentPin: "1357", newPin: "8642" }, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a wrong current PIN and leaves the hash unchanged", async () => {
    const before = (await dbh.db.select().from(users).where(eq(users.id, userId)))[0]!.pinHash;
    const res = await putPin({ currentPin: "0001", newPin: "8642" });
    expect(res.statusCode).toBe(400);
    const after = (await dbh.db.select().from(users).where(eq(users.id, userId)))[0]!.pinHash;
    expect(after).toBe(before);
  });

  it("rejects a malformed new PIN (AC3)", async () => {
    const res = await putPin({ currentPin: "1357", newPin: "12" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("newPin");
  });

  it("rejects a weak new PIN", async () => {
    const res = await putPin({ currentPin: "1357", newPin: "1234" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("newPin");
  });

  it("rejects reusing the current PIN as the new PIN", async () => {
    const res = await putPin({ currentPin: "1357", newPin: "1357" });
    expect(res.statusCode).toBe(400);
  });

  it("changes the PIN with the correct current PIN, rotates the hash, audits, and clears sessions", async () => {
    const res = await putPin({ currentPin: "1357", newPin: "8642" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const row = (await dbh.db.select().from(users).where(eq(users.id, userId)))[0]!;
    const hash = row.pinHash!;
    expect(await verifyPin(hash, "8642")).toBe(true);
    expect(await verifyPin(hash, "1357")).toBe(false);

    // AC3: every existing session is invalidated → the old cookie no longer works.
    const reuse = await app.inject({
      method: "GET",
      url: "/parents/me",
      headers: { cookie: sessionCookie },
    });
    expect(reuse.statusCode).toBe(401);

    const events = await dbh.db.select().from(auditOutbox);
    const pinEvents = events.filter((e) => e.action === "parent.pin.change");
    expect(pinEvents).toHaveLength(1);
    expect(pinEvents[0]!.actorUserId).toBe(userId);
    // The raw PIN is never persisted in the audit payload.
    expect(JSON.stringify(pinEvents[0]!.payload)).not.toContain("8642");
  });
});
