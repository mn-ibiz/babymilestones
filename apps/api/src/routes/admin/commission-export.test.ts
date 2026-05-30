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
import { createCommissionRun } from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P3-E01-S05 — commission payout export (CSV) + mark-paid. Integration via
 * app.inject. Covers the CSV columns incl. phone (AC1), the download audit (AC2),
 * and marking a run paid out (AC3).
 */
let phoneSeq = 0;
const nextPhone = () => `+25471${String(4_000_000 + phoneSeq++).padStart(7, "0")}`;

describe("Commission payout export (P3-E01-S05)", () => {
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

  const reqGet = (url: string, creds: Creds) =>
    app.inject({ method: "GET", url, headers: { cookie: [creds.session, creds.csrfCookie].join("; ") } });
  const reqPost = (url: string, creds: Creds) =>
    app.inject({
      method: "POST",
      url,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; "), "x-csrf-token": creds.csrfToken },
    });

  async function seedRunWithLine(name: string, phone: string | null, amountCents: number) {
    const [s] = await dbh.db.insert(staff).values({ displayName: name, role: "stylist", phone }).returning();
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "A", lastName: "B" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Z", dateOfBirth: "2024-01-15" }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, serviceId: null, status: "settled" }).returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({ parentId: p!.id, childId: c!.id, serviceId: null, staffId: s!.id, staffNameSnapshot: name, staffRateSnapshot: 0, invoiceId: inv!.id })
      .returning();
    await dbh.db.insert(commissionLedger).values({
      staffId: s!.id, bookingId: b!.id, amountCents, rateSnapshot: "10.00", source: "booking",
      occurredAt: new Date("2026-06-10T10:00:00Z"),
    });
    return s!.id;
  }

  async function runJune() {
    return createCommissionRun(dbh.db, {
      kind: "monthly",
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-07-01T00:00:00Z"),
    });
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000005", "7425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("exports a CSV with staff name, phone, amount, reference + audits the download (AC1/AC2)", async () => {
    await seedRunWithLine("Asha", "+254799000001", 150000);
    const run = await runJune();
    const creds = await loginStaff("+254712000001", "7421");

    const res = await reqGet(`/admin/commission-runs/${run.run.id}/export.csv`, creds);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const lines = res.body.trimEnd().split("\r\n");
    expect(lines[0]).toBe("staff_name,phone,amount,reference");
    expect(lines[1]).toContain("Asha");
    expect(lines[1]).toContain("+254799000001");
    expect(lines[1]).toContain("1500.00");

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.run.export"));
    expect(audits).toHaveLength(1);
  });

  it("emits a blank phone field for a staff member with no phone (AC1)", async () => {
    await seedRunWithLine("Bina", null, 5000);
    const run = await runJune();
    const creds = await loginStaff("+254712000001", "7421");
    const res = await reqGet(`/admin/commission-runs/${run.run.id}/export.csv`, creds);
    const line = res.body.trimEnd().split("\r\n")[1]!;
    expect(line.startsWith("Bina,,50.00,")).toBe(true);
  });

  it("an accountant (read report) can export", async () => {
    await seedRunWithLine("Asha", "+254799000001", 1000);
    const run = await runJune();
    const creds = await loginStaff("+254712000005", "7425");
    const res = await reqGet(`/admin/commission-runs/${run.run.id}/export.csv`, creds);
    expect(res.statusCode).toBe(200);
  });

  it("marks a run paid out, audited; a second mark is a no-op (AC3)", async () => {
    await seedRunWithLine("Asha", "+254799000001", 1000);
    const run = await runJune();
    const creds = await loginStaff("+254712000001", "7421");

    const first = await reqPost(`/admin/commission-runs/${run.run.id}/mark-paid`, creds);
    expect(first.statusCode).toBe(200);
    expect(first.json().run.paidOutAt).not.toBeNull();
    expect(first.json().alreadyPaid).toBe(false);

    const second = await reqPost(`/admin/commission-runs/${run.run.id}/mark-paid`, creds);
    expect(second.json().alreadyPaid).toBe(true);

    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.run.paid_out"));
    expect(audits).toHaveLength(1); // only the first mark audits
  });

  it("403s reception on mark-paid; 404s an unknown run on export", async () => {
    const recep = await loginStaff("+254712000003", "7423");
    await seedRunWithLine("Asha", "+254799000001", 1000);
    const run = await runJune();
    const denied = await reqPost(`/admin/commission-runs/${run.run.id}/mark-paid`, recep);
    expect(denied.statusCode).toBe(403);

    const admin = await loginStaff("+254712000001", "7421");
    const missing = await reqGet(`/admin/commission-runs/00000000-0000-0000-0000-0000000000ff/export.csv`, admin);
    expect(missing.statusCode).toBe(404);
  });
});
