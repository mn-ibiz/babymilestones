import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, kraEtimsQueue, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import {
  enqueueEtimsSubmission,
  recordEtimsSubmissionFailure,
} from "@bm/payments";
import { buildApp } from "../../app.js";

/**
 * P5-E02-S02 (AC3) — admin eTIMS dead-letter inspection + manual retry.
 * Integration via app.inject with real staff sessions (+ CSRF). Covers the
 * dead-letter list, manual requeue (which flips the row back to pending and
 * audits), permission enforcement, and 404 for a non-dead-letter id.
 */
describe("Admin eTIMS dead-letters (P5-E02-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
    const session = cookies.find((c) => c.startsWith("bm_session="))?.split(";")[0] ?? "";
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))?.split(";")[0] ?? "";
    return { session, csrfCookie, csrfToken: (res.json().csrfToken as string) ?? "" };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "POST",
    url: string,
    creds: Creds,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const parts: string[] = [];
    if (auth) parts.push(creds.session);
    if (csrf) parts.push(creds.csrfCookie);
    return app.inject({
      method,
      url,
      headers: { cookie: parts.join("; "), ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}) },
      payload: {},
    });
  };

  async function seedDeadLetter(seq: number): Promise<string> {
    const row = await enqueueEtimsSubmission(dbh.db, {
      series: "BM-2026",
      sequenceNumber: seq,
      payload: { series: "BM-2026", paymentMethod: "cash", postedBy: "s", lines: [] },
      error: "down",
      maxAttempts: 1,
    });
    await recordEtimsSubmissionFailure(dbh.db, { id: row.id, error: "terminal" });
    return row.id;
  }

  let admin: Creds;
  let reception: Creds;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    admin = await loginStaff("+254712000001", "7421");
    reception = await loginStaff("+254712000003", "7423");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("lists dead-lettered eTIMS submissions (AC3)", async () => {
    await seedDeadLetter(1);
    const res = await req("GET", "/admin/etims/dead-letters", admin);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { deadLetters: { idempotencyKey: string; lastError: string }[] };
    expect(body.deadLetters).toHaveLength(1);
    expect(body.deadLetters[0]!.idempotencyKey).toBe("BM-2026-000001");
    expect(body.deadLetters[0]!.lastError).toBe("terminal");
  });

  it("requeues a dead letter back to pending and audits it (AC3)", async () => {
    const id = await seedDeadLetter(1);
    const res = await req("POST", `/admin/etims/dead-letters/${id}/retry`, admin);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("pending");

    const [row] = await dbh.db.select().from(kraEtimsQueue).where(eq(kraEtimsQueue.id, id));
    expect(row!.status).toBe("pending");
    expect(row!.deadLetteredAt).toBeNull();
    expect(row!.attempts).toBe(0);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "etims.submission.requeued"));
    expect(audits).toHaveLength(1);
  });

  it("404s retrying an id that is not a dead letter", async () => {
    const res = await req("POST", "/admin/etims/dead-letters/00000000-0000-0000-0000-000000000000/retry", admin);
    expect(res.statusCode).toBe(404);
  });

  it("forbids a reception user (no manage config)", async () => {
    await seedDeadLetter(1);
    expect((await req("GET", "/admin/etims/dead-letters", reception)).statusCode).toBe(403);
  });

  it("rejects an unauthenticated read", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/etims/dead-letters" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a requeue without CSRF", async () => {
    const id = await seedDeadLetter(1);
    const res = await req("POST", `/admin/etims/dead-letters/${id}/retry`, admin, { csrf: false });
    expect(res.statusCode).toBe(403);
  });
});
