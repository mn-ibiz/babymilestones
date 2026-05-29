import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  auditOutbox,
  bookings,
  children,
  commissionLedger,
  commissionRuns,
  invoices,
  parents,
  staff,
  users,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E01-S04 — ad-hoc commission run admin API. Integration via app.inject with
 * real staff sessions (+ CSRF). Covers preview (AC1), confirm → ad_hoc run (AC2),
 * and that a later monthly run excludes the already-run period (AC3).
 */
describe("Ad-hoc commission run admin API (P3-E01-S04)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

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
    payload?: Record<string, unknown>,
    opts: { csrf?: boolean } = {},
  ) => {
    const { csrf = true } = opts;
    const cookie = [creds.session, ...(csrf ? [creds.csrfCookie] : [])].join("; ");
    return app.inject({
      method,
      url,
      headers: { cookie, ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}) },
      ...(payload ? { payload } : {}),
    });
  };

  async function seedJune(name: string, amountCents: number, day = 10) {
    const [s] = await dbh.db.insert(staff).values({ displayName: name, role: "stylist" }).returning();
    const [u] = await dbh.db.insert(users).values({ phone: `+2547${Math.floor(Math.random() * 1e8)}`, pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "A", lastName: "B" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Z", dateOfBirth: "2024-01-15" }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, serviceId: null, status: "paid" }).returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({ parentId: p!.id, childId: c!.id, serviceId: null, staffId: s!.id, staffNameSnapshot: name, staffRateSnapshot: 0, invoiceId: inv!.id })
      .returning();
    await dbh.db.insert(commissionLedger).values({
      staffId: s!.id, bookingId: b!.id, amountCents, rateSnapshot: "10.00", source: "booking",
      occurredAt: new Date(`2026-06-${String(day).padStart(2, "0")}T10:00:00Z`),
    });
    return s!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("previews totals for a range without persisting (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedJune("Asha", 1500);
    await seedJune("Bina", 2000);
    const res = await req("POST", "/admin/commission-runs/preview", creds, {
      periodStart: "2026-06-01T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().totalCents).toBe(3500);
    expect(res.json().lines).toHaveLength(2);
    // No run persisted by a preview.
    const runs = await dbh.db.select().from(commissionRuns);
    expect(runs).toHaveLength(0);
  });

  it("confirming creates an ad_hoc run, audited (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedJune("Asha", 1500);
    const res = await req("POST", "/admin/commission-runs", creds, {
      periodStart: "2026-06-01T00:00:00Z",
      periodEnd: "2026-06-15T00:00:00Z",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().run.kind).toBe("ad_hoc");
    expect(res.json().run.totalCents).toBe(1500);
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.run.created"));
    expect(audits).toHaveLength(1);
  });

  it("a later month-end run excludes the already-run ad-hoc period (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedJune("Asha", 1500, 5); // covered by ad-hoc
    await seedJune("Asha", 700, 20); // after ad-hoc

    const adhoc = await req("POST", "/admin/commission-runs", creds, {
      periodStart: "2026-06-01T00:00:00Z",
      periodEnd: "2026-06-15T00:00:00Z",
    });
    expect(adhoc.json().run.totalCents).toBe(1500);

    // Month-end run over all of June must exclude the claimed 1500.
    const { createCommissionRun } = await import("@bm/catalog");
    const monthly = await createCommissionRun(dbh.db, {
      kind: "monthly",
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-07-01T00:00:00Z"),
    });
    expect(monthly.run.totalCents).toBe(700);
  });

  it("rejects an inverted range (400)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/commission-runs", creds, {
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-06-01T00:00:00Z",
    });
    expect(res.statusCode).toBe(400);
  });

  it("403s a role lacking manage-service on confirm (reception)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await req("POST", "/admin/commission-runs", creds, {
      periodStart: "2026-06-01T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists runs and reads one with its lines", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    await seedJune("Asha", 1500);
    const created = await req("POST", "/admin/commission-runs", creds, {
      periodStart: "2026-06-01T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });
    const runId = created.json().run.id as string;

    const list = await req("GET", "/admin/commission-runs", creds);
    expect(list.statusCode).toBe(200);
    expect(list.json().runs.length).toBeGreaterThanOrEqual(1);

    const detail = await req("GET", `/admin/commission-runs/${runId}`, creds);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().lines).toHaveLength(1);
    expect(detail.json().lines[0].amountCents).toBe(1500);
  });
});
