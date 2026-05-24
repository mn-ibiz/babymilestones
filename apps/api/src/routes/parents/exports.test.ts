import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, dataExports, parents, smsOutbox, users, wallets } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { InMemoryExportStorage, runExport } from "@bm/export";
import { listZipEntryNames } from "@bm/export";
import { buildApp } from "../../app.js";

describe("data export routes (P1-E02-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let storage: InMemoryExportStorage;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let userId: string;
  let nowMs: number;
  let runQueue: Promise<void>[];

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    storage = new InMemoryExportStorage();
    nowMs = Date.parse("2026-05-25T12:00:00Z");
    runQueue = [];
    app = buildApp({
      db: dbh.db,
      sessions,
      exportStorage: storage,
      now: () => nowMs,
      // Deterministic enqueue: capture the export promise so the test can await
      // it (`drain`) instead of relying on timers.
      enqueueExport: (exportId) => {
        runQueue.push(runExport(exportId, { db: dbh.db, storage, now: () => nowMs }));
      },
    });

    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: await hashPin("1357") })
      .returning();
    userId = u!.id;
    await dbh.db.insert(wallets).values({ userId });
    await dbh.db.insert(parents).values({ userId, firstName: "Amina", lastName: "Otieno" });

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

  const requestExport = (opts: { auth?: boolean; csrf?: boolean } = {}) => {
    const { auth = true, csrf = true } = opts;
    const headers: Record<string, string> = {};
    const parts: string[] = [];
    if (auth) parts.push(sessionCookie);
    if (csrf) parts.push(csrfCookie);
    if (parts.length) headers["cookie"] = parts.join("; ");
    if (csrf) headers["x-csrf-token"] = csrfToken;
    return app.inject({ method: "POST", url: "/parents/me/exports", headers });
  };

  const drain = () => Promise.all(runQueue);

  it("rejects an unauthenticated export request (ownership)", async () => {
    const res = await requestExport({ auth: false, csrf: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a request without CSRF (mutating verb)", async () => {
    const res = await requestExport({ csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("enqueues async, returns 202, audits the request (AC2, AC3)", async () => {
    const res = await requestExport();
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("pending");
    const exportId = res.json().exportId as string;

    const events = await dbh.db.select().from(auditOutbox);
    const requested = events.find((e) => e.action === "parent.data.export.requested");
    expect(requested).toBeDefined();
    expect(requested!.actorUserId).toBe(userId);
    expect(requested!.targetId).toBe(exportId);
  });

  it("job produces a ready, single-use, 7-day, SMS-notified download (AC1, AC2, AC3)", async () => {
    const res = await requestExport();
    await drain();

    const [row] = await dbh.db.select().from(dataExports).where(eq(dataExports.id, res.json().exportId));
    expect(row!.status).toBe("ready");
    expect(row!.expiresAt!.getTime()).toBe(nowMs + 7 * 24 * 60 * 60 * 1000);

    // SMS stub carries the single-use link with the token.
    const sms = await dbh.db.select().from(smsOutbox);
    expect(sms).toHaveLength(1);
    expect(sms[0]!.body).toContain(row!.downloadToken!);

    // Download the ZIP — valid, contains all data sets.
    const dl = await app.inject({ method: "GET", url: `/exports/download?token=${row!.downloadToken}` });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"]).toBe("application/zip");
    const names = listZipEntryNames(dl.rawPayload);
    expect(names).toEqual(
      expect.arrayContaining(["parent.json", "children.json", "consent.json", "wallet-ledger.json"]),
    );
  });

  it("enforces single-use: a second download is rejected (AC2)", async () => {
    const res = await requestExport();
    await drain();
    const [row] = await dbh.db.select().from(dataExports).where(eq(dataExports.id, res.json().exportId));
    const url = `/exports/download?token=${row!.downloadToken}`;

    expect((await app.inject({ method: "GET", url })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(410);
  });

  it("enforces 7-day expiry (AC2)", async () => {
    const res = await requestExport();
    await drain();
    const [row] = await dbh.db.select().from(dataExports).where(eq(dataExports.id, res.json().exportId));
    nowMs += 8 * 24 * 60 * 60 * 1000; // jump past the window
    const dl = await app.inject({ method: "GET", url: `/exports/download?token=${row!.downloadToken}` });
    expect(dl.statusCode).toBe(410);
  });

  it("404s an unknown token without leaking", async () => {
    const dl = await app.inject({ method: "GET", url: "/exports/download?token=does-not-exist" });
    expect(dl.statusCode).toBe(404);
  });

  it("audits the download action (AC3)", async () => {
    const res = await requestExport();
    await drain();
    const [row] = await dbh.db.select().from(dataExports).where(eq(dataExports.id, res.json().exportId));
    await app.inject({ method: "GET", url: `/exports/download?token=${row!.downloadToken}` });
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "parent.data.export.downloaded")).toBe(true);
  });
});
