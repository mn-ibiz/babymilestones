import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { users, auditOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E10-S03 — Audit log viewer (admin, READ-ONLY).
 *
 * Integration via app.inject with real staff sessions. The viewer reads from
 * `audit_outbox` (the durable outbox; the async `audit_log` projection — X5-S02
 * / 13-2 — is not landed yet, so this story consumes the outbox directly and
 * will switch its source table once 13-2 ships). Covers:
 *  - lists the most-recent events, newest-first (AC1),
 *  - each filter (actor / action / target id / date range) narrows results (AC1),
 *  - pagination via limit/offset (AC2),
 *  - CSV export contents + headers (AC2),
 *  - permission: only `read audit` (admin/super_admin); others 403, anon 401,
 *  - read-only by construction: no POST/PATCH/PUT/DELETE path exists (AC3).
 */
describe("Audit log viewer (P1-E10-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
    const session = cookies.find((c) => c.startsWith("bm_session="))?.split(";")[0] ?? "";
    return { session, status: res.statusCode };
  };

  const list = (query: string, session: string) =>
    app.inject({ method: "GET", url: `/admin/audit${query}`, headers: { cookie: session } });

  // Two distinct actor ids so the actor filter is meaningful.
  let actorA = "";
  let actorB = "";

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));

    const [a] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000001", role: "cashier" })
      .returning();
    const [b] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000002", role: "cashier" })
      .returning();
    actorA = a!.id;
    actorB = b!.id;

    // Seed audit events across actors, actions, targets, and times.
    await dbh.db.insert(auditOutbox).values([
      {
        actorUserId: actorA,
        action: "wallet.topup",
        targetTable: "wallets",
        targetId: "wallet-1",
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
      },
      {
        actorUserId: actorA,
        action: "wallet.refund",
        targetTable: "wallets",
        targetId: "wallet-1",
        createdAt: new Date("2026-05-10T10:00:00.000Z"),
      },
      {
        actorUserId: actorB,
        action: "wallet.topup",
        targetTable: "wallets",
        targetId: "wallet-2",
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      },
      {
        actorUserId: null,
        action: "auth.signup",
        targetTable: "users",
        targetId: "u-9",
        createdAt: new Date("2026-05-24T10:00:00.000Z"),
      },
    ]);
  });

  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("lists events newest-first for an admin (AC1) → 200", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await list("", admin.session);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { events: Array<{ action: string }>; total: number };
    // The 4 seeded rows + the staff-login audit row this very test minted.
    expect(body.total).toBe(5);
    // Seeded events appear newest-first below the just-now login row at the top.
    const seeded = body.events.map((e) => e.action).filter((a) => a !== "auth.staff.login");
    expect(seeded).toEqual(["auth.signup", "wallet.topup", "wallet.refund", "wallet.topup"]);
  });

  it("filters by actor (AC1)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await list(`?actor=${actorA}`, admin.session);
    const body = res.json() as { events: Array<{ actorUserId: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.events.every((e) => e.actorUserId === actorA)).toBe(true);
  });

  it("filters by action (AC1)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await list("?action=wallet.topup", admin.session);
    const body = res.json() as { events: Array<{ action: string }>; total: number };
    expect(body.total).toBe(2);
    expect(body.events.every((e) => e.action === "wallet.topup")).toBe(true);
  });

  it("filters by target id (AC1)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await list("?targetId=wallet-2", admin.session);
    const body = res.json() as { events: Array<{ targetId: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.events[0]!.targetId).toBe("wallet-2");
  });

  it("filters by date range, inclusive (AC1)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await list("?fromDate=2026-05-10&toDate=2026-05-20", admin.session);
    const body = res.json() as { events: Array<{ action: string }>; total: number };
    expect(body.total).toBe(2);
    // 2026-05-10 (refund) and 2026-05-20 (topup) included; 05-01 and 05-24 excluded.
    expect(new Set(body.events.map((e) => e.action))).toEqual(
      new Set(["wallet.refund", "wallet.topup"]),
    );
  });

  it("paginates with limit + offset (AC2)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    // Constrain to the seeded wallet.* events so the just-now login row (which
    // sorts to the very top) does not perturb the pagination boundaries.
    const page1 = await list("?action=wallet.topup&limit=1&offset=0", admin.session);
    const b1 = page1.json() as { events: Array<{ targetId: string }>; total: number };
    expect(b1.total).toBe(2);
    expect(b1.events).toHaveLength(1);
    expect(b1.events[0]!.targetId).toBe("wallet-2"); // newest topup first

    const page2 = await list("?action=wallet.topup&limit=1&offset=1", admin.session);
    const b2 = page2.json() as { events: Array<{ targetId: string }> };
    expect(b2.events).toHaveLength(1);
    expect(b2.events[0]!.targetId).toBe("wallet-1"); // older topup second
  });

  it("rejects an invalid query (bad actor uuid) → 400", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await list("?actor=not-a-uuid", admin.session);
    expect(res.statusCode).toBe(400);
  });

  it("exports CSV with headers + matching rows (AC2)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const res = await list("/export?action=wallet.topup", admin.session);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");
    const lines = res.body.split("\r\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe("time,actor,action,target_table,target_id");
    expect(lines).toHaveLength(3); // header + 2 topups
    expect(lines.every((l, i) => i === 0 || l.includes("wallet.topup"))).toBe(true);
  });

  it("reception (no read audit) is rejected → 403", async () => {
    const recep = await loginStaff("0712000003", "7423");
    expect((await list("", recep.session)).statusCode).toBe(403);
    expect((await list("/export", recep.session)).statusCode).toBe(403);
  });

  it("unauthenticated → 401", async () => {
    expect((await list("", "")).statusCode).toBe(401);
    expect((await list("/export", "")).statusCode).toBe(401);
  });

  it("is read-only: no write route exists for audit data (AC3)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const auth = { cookie: admin.session };
    const before = (await dbh.db.select().from(auditOutbox)).length;
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await app.inject({ method, url: "/admin/audit", headers: auth });
      // Fastify returns 404 for an unregistered method+path — proving no
      // create/update/delete handler is wired against the audit log.
      expect(res.statusCode).toBe(404);
      const byId = await app.inject({ method, url: "/admin/audit/some-id", headers: auth });
      expect(byId.statusCode).toBe(404);
    }
    // The audit rows are untouched by anything this read-only surface can do.
    const after = (await dbh.db.select().from(auditOutbox)).length;
    expect(after).toBe(before);
  });
});
