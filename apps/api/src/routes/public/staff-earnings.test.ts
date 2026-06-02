import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@bm/db/testing";
import {
  bookings,
  children,
  commissionLedger,
  commissionRunLines,
  commissionRuns,
  invoices,
  parents,
  services,
  staff,
  users,
} from "@bm/db";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";
import { StaffEarningsRateLimiter } from "./staff-earnings.js";

/**
 * Public staff-earnings viewer (P3-E02-S01). Unauthenticated read surface for the
 * reception PC: a dropdown of active staff display-names, and per-staff
 * month-to-date / last-month / last-payout figures. No auth (AC1), no PII beyond
 * display name (AC4), rate-limited (AC5), cached 60s (Dev Notes).
 */

let phoneSeq = 0;
const nextPhone = () => `+2547${String(++phoneSeq).padStart(8, "0")}`;

describe("public staff earnings (P3-E02-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  const NOW = new Date("2026-06-15T12:00:00.000Z");

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({
      db: dbh.db,
      sessions: new InMemorySessionStore(),
      now: () => NOW.getTime(),
    });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  async function seedStaff(name: string, active = true): Promise<string> {
    const [s] = await dbh.db
      .insert(staff)
      .values({ displayName: name, role: "stylist", phone: nextPhone(), active })
      .returning();
    return s!.id;
  }

  /** Create a service and return its id (for per-service breakdown seeding). */
  async function seedService(name: string): Promise<string> {
    const [s] = await dbh.db.insert(services).values({ name, unit: "salon" }).returning();
    return s!.id;
  }

  /**
   * Append a commission-ledger accrual (or reversal) for `staffId` with a minimal
   * booking graph. `serviceId` attributes the booking to a service so the
   * breakdown can group by service name; `source` toggles accrual vs reversal.
   */
  async function seedLedger(
    staffId: string,
    amountCents: number,
    occurredAt: Date,
    opts: { serviceId?: string | null; source?: "booking" | "refund_reversal" } = {},
  ): Promise<void> {
    const serviceId = opts.serviceId ?? null;
    const source = opts.source ?? "booking";
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Parent", lastName: "Secret" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "ChildSecret", dateOfBirth: "2024-01-15" })
      .returning();
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: p!.id, amountDue: 0, serviceId, status: "settled" })
      .returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({
        parentId: p!.id,
        childId: c!.id,
        serviceId,
        staffId,
        staffNameSnapshot: "x",
        staffRateSnapshot: 0,
        invoiceId: inv!.id,
      })
      .returning();
    await dbh.db.insert(commissionLedger).values({
      staffId,
      bookingId: b!.id,
      amountCents,
      rateSnapshot: "10.00",
      source,
      occurredAt,
    });
  }

  /** Record a confirmed (paid-out) commission run with a line for `staffId`. */
  async function seedPaidPayout(
    staffId: string,
    amountCents: number,
    paidOutAt: Date,
  ): Promise<void> {
    const [run] = await dbh.db
      .insert(commissionRuns)
      .values({
        kind: "monthly",
        periodStart: new Date(paidOutAt.getTime() - 30 * 86400_000),
        periodEnd: paidOutAt,
        totalCents: amountCents,
        paidOutAt,
      })
      .returning();
    await dbh.db.insert(commissionRunLines).values({
      runId: run!.id,
      staffId,
      staffNameSnapshot: "snap",
      amountCents,
    });
  }

  it("lists only active staff with display names (AC2), no auth (AC1)", async () => {
    await seedStaff("Asha");
    await seedStaff("Bina");
    await seedStaff("Retired", false);

    const res = await app.inject({ method: "GET", url: "/public/staff-earnings" }); // no cookie
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const names = body.staff.map((s: { displayName: string }) => s.displayName).sort();
    expect(names).toEqual(["Asha", "Bina"]);
  });

  it("exposes ONLY id + displayName in the dropdown — no phone/role/PII (AC4)", async () => {
    await seedStaff("Asha");
    const res = await app.inject({ method: "GET", url: "/public/staff-earnings" });
    const option = res.json().staff[0];
    expect(Object.keys(option).sort()).toEqual(["displayName", "id"]);
    expect(option.phone).toBeUndefined();
    expect(option.role).toBeUndefined();
    expect(option.active).toBeUndefined();
  });

  it("returns MTD, last-month, and last-payout figures for a staff member (AC3)", async () => {
    const asha = await seedStaff("Asha");
    // This month (June): net 75000.
    await seedLedger(asha, 50000, new Date("2026-06-02T10:00:00.000Z"));
    await seedLedger(asha, 25000, new Date("2026-06-14T10:00:00.000Z"));
    // Last month (May): net 40000.
    await seedLedger(asha, 40000, new Date("2026-05-10T10:00:00.000Z"));
    // Two months ago — excluded.
    await seedLedger(asha, 9999, new Date("2026-04-10T10:00:00.000Z"));
    // Confirmed payouts; the latest (May 31) is the one shown.
    await seedPaidPayout(asha, 30000, new Date("2026-04-30T00:00:00.000Z"));
    await seedPaidPayout(asha, 45000, new Date("2026-05-31T00:00:00.000Z"));

    const res = await app.inject({ method: "GET", url: `/public/staff-earnings/${asha}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.displayName).toBe("Asha");
    expect(body.monthToDateCents).toBe(75000);
    expect(body.lastMonthCents).toBe(40000);
    expect(body.lastPayoutCents).toBe(45000);
    expect(body.lastPayoutAt).toBe("2026-05-31T00:00:00.000Z");
  });

  it("reports zeros / null payout for a staff member with no commission yet", async () => {
    const fresh = await seedStaff("Fresh");
    const res = await app.inject({ method: "GET", url: `/public/staff-earnings/${fresh}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.monthToDateCents).toBe(0);
    expect(body.lastMonthCents).toBe(0);
    expect(body.lastPayoutCents).toBeNull();
    expect(body.lastPayoutAt).toBeNull();
  });

  it("does NOT leak parent/booking PII in the earnings response (AC4 / S02 AC2)", async () => {
    const asha = await seedStaff("Asha");
    const wash = await seedService("Wash & Style");
    await seedLedger(asha, 50000, new Date("2026-06-02T10:00:00.000Z"), { serviceId: wash });
    const res = await app.inject({ method: "GET", url: `/public/staff-earnings/${asha}` });
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual([
      "completedVisits",
      "displayName",
      "lastMonthCents",
      "lastPayoutAt",
      "lastPayoutCents",
      "monthToDateCents",
      "staffId",
      "topServicesByCount",
      "topServicesByRevenue",
    ]);
    const raw = res.payload;
    // None of the seeded parent/child PII should appear anywhere in the payload.
    expect(raw).not.toContain("Parent");
    expect(raw).not.toContain("Secret");
    expect(raw).not.toContain("ChildSecret");
    expect(raw).not.toMatch(/booking/i);
    expect(raw).not.toMatch(/invoice/i);
    expect(raw).not.toMatch(/parent/i);
    // The service NAME is allowed; the breakdown is present and customer-free.
    expect(raw).toContain("Wash & Style");
  });

  it("returns the earnings breakdown: completed visits + top services (S02 AC1)", async () => {
    const asha = await seedStaff("Asha");
    const braids = await seedService("Braids");
    const wash = await seedService("Wash");
    const cut = await seedService("Cut");
    // This month (June). Braids: 2 visits / 80000. Wash: 1 visit / 30000 net
    // (50000 accrual minus 20000 reversal). Cut: 1 visit / 25000.
    await seedLedger(asha, 50000, new Date("2026-06-02T10:00:00.000Z"), { serviceId: braids });
    await seedLedger(asha, 30000, new Date("2026-06-09T10:00:00.000Z"), { serviceId: braids });
    await seedLedger(asha, 50000, new Date("2026-06-03T10:00:00.000Z"), { serviceId: wash });
    await seedLedger(asha, -20000, new Date("2026-06-10T10:00:00.000Z"), {
      serviceId: wash,
      source: "refund_reversal",
    });
    await seedLedger(asha, 25000, new Date("2026-06-05T10:00:00.000Z"), { serviceId: cut });
    // Last month — excluded from the MTD breakdown.
    await seedLedger(asha, 99999, new Date("2026-05-20T10:00:00.000Z"), { serviceId: braids });

    const res = await app.inject({ method: "GET", url: `/public/staff-earnings/${asha}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // 4 booking accruals this month (the reversal is not a visit).
    expect(body.completedVisits).toBe(4);
    expect(body.topServicesByCount).toEqual([
      { serviceName: "Braids", count: 2 },
      { serviceName: "Cut", count: 1 },
      { serviceName: "Wash", count: 1 },
    ]);
    expect(body.topServicesByRevenue).toEqual([
      { serviceName: "Braids", revenueCents: 80000 },
      { serviceName: "Wash", revenueCents: 30000 },
      { serviceName: "Cut", revenueCents: 25000 },
    ]);
  });

  it("reports zero visits / empty breakdown for a staff member with no MTD activity", async () => {
    const fresh = await seedStaff("Fresh");
    const res = await app.inject({ method: "GET", url: `/public/staff-earnings/${fresh}` });
    const body = res.json();
    expect(body.completedVisits).toBe(0);
    expect(body.topServicesByCount).toEqual([]);
    expect(body.topServicesByRevenue).toEqual([]);
  });

  it("404s for an inactive or unknown staff member", async () => {
    const retired = await seedStaff("Retired", false);
    expect(
      (await app.inject({ method: "GET", url: `/public/staff-earnings/${retired}` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: `/public/staff-earnings/${randomUUID()}` })).statusCode,
    ).toBe(404);
  });

  it("sets a 60s cache-control header (Dev Notes)", async () => {
    await seedStaff("Asha");
    const list = await app.inject({ method: "GET", url: "/public/staff-earnings" });
    expect(list.headers["cache-control"]).toMatch(/max-age=60/);
  });

  it("rate-limits the endpoint to defend against scraping (AC5)", async () => {
    // A tight limiter: 3 requests per window, then 429.
    const limited = buildApp({
      db: dbh.db,
      sessions: new InMemorySessionStore(),
      staffEarningsRateLimiter: new StaffEarningsRateLimiter(3, 60_000),
    });
    try {
      for (let i = 0; i < 3; i++) {
        const ok = await limited.inject({ method: "GET", url: "/public/staff-earnings" });
        expect(ok.statusCode).toBe(200);
      }
      const blocked = await limited.inject({ method: "GET", url: "/public/staff-earnings" });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers["retry-after"]).toBeDefined();
    } finally {
      await limited.close();
    }
  });
});

describe("StaffEarningsRateLimiter (P3-E02-S01 AC5)", () => {
  it("allows up to the cap per IP in a window, then blocks", () => {
    const rl = new StaffEarningsRateLimiter(2, 1000, () => 0);
    expect(rl.check("1.1.1.1").allowed).toBe(true);
    expect(rl.check("1.1.1.1").allowed).toBe(true);
    const blocked = rl.check("1.1.1.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("scopes the budget per IP", () => {
    const rl = new StaffEarningsRateLimiter(1, 1000, () => 0);
    expect(rl.check("1.1.1.1").allowed).toBe(true);
    expect(rl.check("1.1.1.1").allowed).toBe(false);
    expect(rl.check("2.2.2.2").allowed).toBe(true); // different IP, fresh budget
  });

  it("resets the budget once the window elapses", () => {
    let t = 0;
    const rl = new StaffEarningsRateLimiter(1, 1000, () => t);
    expect(rl.check("1.1.1.1").allowed).toBe(true);
    expect(rl.check("1.1.1.1").allowed).toBe(false);
    t = 1001;
    expect(rl.check("1.1.1.1").allowed).toBe(true);
  });
});
