import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users, wcOutbox, wcOutboxDead } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import {
  enqueueWcWriteback,
  recordWcWritebackFailure,
  advanceCheckpoint,
} from "@bm/woocommerce";
import { buildApp } from "../../app.js";

/**
 * Story 29.7 (P4-E04-S07) — admin sync surface API. Integration via app.inject
 * with real staff sessions (+ CSRF). Covers: `manage config` enforcement, the
 * health snapshot (AC5), dead-letter list + replay/resolve/discard (AC4), and the
 * admin-only "Sync now" trigger emitting a `woocommerce.sync.triggered` audit (AC7).
 */
describe("WooCommerce sync admin API (Story 29.7)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let pullRan: number;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "POST",
    url: string,
    creds: Creds,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method,
      url,
      headers: { cookie: cookieParts.join("; "), ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}) },
    });
  };

  let admin: Creds;
  let reception: Creds;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    pullRan = 0;
    app = buildApp({
      db: dbh.db,
      sessions,
      // The sync-now endpoint triggers the registered wc-sync-pull job.
      jobs: [{ name: "wc-sync-pull", run: async () => { pullRan += 1; } }],
    });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    admin = await loginStaff("+254712000001", "7421");
    reception = await loginStaff("+254712000003", "7423");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  /** Dead-letter one writeback (two non-retryable failures) and return its dead-row id. */
  async function deadLetterOne(key: string) {
    const row = await enqueueWcWriteback(dbh.db, {
      idempotencyKey: key,
      kind: "order_status",
      request: { wooOrderId: 5, status: "completed" },
      now: new Date("2026-06-02T11:00:00Z"),
    });
    await recordWcWritebackFailure(dbh.db, { id: row.id, error: "400", retryable: false });
    await recordWcWritebackFailure(dbh.db, { id: row.id, error: "400", retryable: false });
    const [dead] = await dbh.db.select().from(wcOutboxDead).where(eq(wcOutboxDead.idempotencyKey, key));
    return dead!.id;
  }

  it("health reports last-pull / queue depth / dead-letter count / staleness (AC5)", async () => {
    await enqueueWcWriteback(dbh.db, { idempotencyKey: "p1", kind: "order_status", request: {} });
    await deadLetterOne("d1");
    await advanceCheckpoint(dbh.db, { lastSyncAt: new Date(), now: new Date() });

    const res = await req("GET", "/admin/woocommerce-sync/health", admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.queueDepth).toBe(1);
    expect(body.deadLetterCount).toBe(1);
    expect(body.lastPullAt).not.toBeNull();
    expect(typeof body.stale).toBe("boolean");
    expect(Array.isArray(body.recentErrors)).toBe(true);
  });

  it("rejects reception (lacks manage config) from health", async () => {
    const res = await req("GET", "/admin/woocommerce-sync/health", reception);
    expect(res.statusCode).toBe(403);
  });

  it("rejects unauthenticated health reads", async () => {
    const res = await req("GET", "/admin/woocommerce-sync/health", admin, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("lists dead-letter items (AC4)", async () => {
    await deadLetterOne("d1");
    const res = await req("GET", "/admin/woocommerce-sync/dead-letters", admin);
    expect(res.statusCode).toBe(200);
    expect(res.json().deadLetters).toHaveLength(1);
    expect(res.json().deadLetters[0].idempotencyKey).toBe("d1");
  });

  it("replays a dead-letter — re-enqueues it + audits, removes from the list (AC4)", async () => {
    const id = await deadLetterOne("d1");
    const res = await req("POST", `/admin/woocommerce-sync/dead-letters/${id}/replay`, admin);
    expect(res.statusCode).toBe(200);

    const live = await dbh.db.select().from(wcOutbox).where(eq(wcOutbox.idempotencyKey, "d1"));
    expect(live).toHaveLength(1);
    expect(live[0]!.status).toBe("pending");

    const list = await req("GET", "/admin/woocommerce-sync/dead-letters", admin);
    expect(list.json().deadLetters).toHaveLength(0);

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "woocommerce.deadletter.replayed"));
    expect(audits).toHaveLength(1);
  });

  it("marks a dead-letter resolved + audits (AC4)", async () => {
    const id = await deadLetterOne("d1");
    const res = await req("POST", `/admin/woocommerce-sync/dead-letters/${id}/resolve`, admin);
    expect(res.statusCode).toBe(200);
    const [row] = await dbh.db.select().from(wcOutboxDead).where(eq(wcOutboxDead.id, id));
    expect(row!.status).toBe("resolved");
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "woocommerce.deadletter.resolved"));
    expect(audits).toHaveLength(1);
  });

  it("discards a dead-letter + audits (AC4)", async () => {
    const id = await deadLetterOne("d1");
    const res = await req("POST", `/admin/woocommerce-sync/dead-letters/${id}/discard`, admin);
    expect(res.statusCode).toBe(200);
    const [row] = await dbh.db.select().from(wcOutboxDead).where(eq(wcOutboxDead.id, id));
    expect(row!.status).toBe("discarded");
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "woocommerce.deadletter.discarded"));
    expect(audits).toHaveLength(1);
  });

  it("rejects reception from dead-letter mutations", async () => {
    const id = await deadLetterOne("d1");
    const res = await req("POST", `/admin/woocommerce-sync/dead-letters/${id}/discard`, reception);
    expect(res.statusCode).toBe(403);
  });

  it("404s a replay of an unknown dead-letter id", async () => {
    const res = await req("POST", "/admin/woocommerce-sync/dead-letters/00000000-0000-0000-0000-000000000000/replay", admin);
    expect(res.statusCode).toBe(404);
  });

  it("Sync now triggers the pull + audits (admin-only, AC7)", async () => {
    const res = await req("POST", "/admin/woocommerce-sync/sync-now", admin);
    expect(res.statusCode).toBe(200);
    expect(pullRan).toBe(1);
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "woocommerce.sync.triggered"));
    expect(audits).toHaveLength(1);
  });

  it("rejects reception from Sync now (admin-only, AC7)", async () => {
    const res = await req("POST", "/admin/woocommerce-sync/sync-now", reception);
    expect(res.statusCode).toBe(403);
    expect(pullRan).toBe(0);
  });
});
