import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import {
  bookings,
  children,
  expenses,
  invoices,
  parents,
  services,
  users,
  wallets,
} from "@bm/db";
import { loadPnlReport, shopCogsByUnitInPeriod } from "./pnl-report-db.js";

/**
 * P6-E05-S01 (Story 35.1) — DB assembler behind the consolidated P&L. DB-backed
 * via the PGlite harness. Verifies the assembler COMPOSES the revenue read model,
 * the expenses read model and the (GRN) direct-costs source into a per-unit P&L +
 * MoM / YoY comparison (AC1/AC2), and that shop COGS is 0 today (no cost data).
 */
describe("loadPnlReport (Story 35.1)", () => {
  let dbh: TestDb;
  let seq = 0;
  const nextPhone = () => `+25472${String(1_000_000 + seq++).padStart(7, "0")}`;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedActor(): Promise<string> {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    return u!.id;
  }

  async function seedFamily() {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Pat", lastName: "Doe" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01" })
      .returning();
    await dbh.db.insert(wallets).values({ userId: u!.id });
    return { parentId: p!.id, childId: c!.id };
  }

  async function seedBooking(opts: {
    parentId: string;
    childId: string;
    serviceId: string;
    revenueCents: number;
    checkedInAt: Date;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: opts.parentId, amountDue: opts.revenueCents, serviceId: opts.serviceId })
      .returning();
    await dbh.db.insert(bookings).values({
      parentId: opts.parentId,
      childId: opts.childId,
      serviceId: opts.serviceId,
      staffNameSnapshot: "Staff",
      staffRateSnapshot: opts.revenueCents,
      invoiceId: inv!.id,
      status: "confirmed",
      checkedInAt: opts.checkedInAt,
    });
  }

  async function seedExpense(opts: {
    expenseDate: string;
    businessUnit: string | null;
    amountCents: number;
    actor: string;
  }) {
    await dbh.db.insert(expenses).values({
      expenseDate: opts.expenseDate,
      category: "Rent",
      businessUnit: opts.businessUnit,
      amountCents: opts.amountCents,
      paymentMethod: "cash",
      createdBy: opts.actor,
    });
  }

  it("assembles per-unit revenue/directCosts/expenses/net + consolidated totals for a month (AC1)", async () => {
    const actor = await seedActor();
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const [salon] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const fam = await seedFamily();

    // May 2026 revenue: play 100.00, salon 50.00
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 100_00, checkedInAt: new Date("2026-05-10T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: salon!.id, revenueCents: 50_00, checkedInAt: new Date("2026-05-20T10:00:00Z") });
    // A June booking — outside the May window, excluded.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 9_99, checkedInAt: new Date("2026-06-02T10:00:00Z") });

    // May 2026 expenses: play 30.00, shop 5.00, shared overhead 10.00
    await seedExpense({ expenseDate: "2026-05-03", businessUnit: "play", amountCents: 30_00, actor });
    await seedExpense({ expenseDate: "2026-05-04", businessUnit: "shop", amountCents: 5_00, actor });
    await seedExpense({ expenseDate: "2026-05-05", businessUnit: null, amountCents: 10_00, actor });

    const cmp = await loadPnlReport(dbh.db, { anchor: "2026-05-17", granularity: "month" });
    const cur = cmp.current;

    expect(cur.from).toBe("2026-05-01");
    expect(cur.to).toBe("2026-06-01");

    const play_ = cur.byUnit.find((u) => u.unit === "play")!;
    expect(play_.revenueCents).toBe(100_00);
    expect(play_.directCostsCents).toBe(0); // no GRN/cost data
    expect(play_.expensesCents).toBe(30_00);
    expect(play_.netCents).toBe(100_00 - 30_00);

    const salon_ = cur.byUnit.find((u) => u.unit === "salon")!;
    expect(salon_.revenueCents).toBe(50_00);

    const shop_ = cur.byUnit.find((u) => u.unit === "shop")!;
    expect(shop_.revenueCents).toBe(0);
    expect(shop_.directCostsCents).toBe(0);
    expect(shop_.expensesCents).toBe(5_00);

    expect(cur.totals.revenueCents).toBe(150_00);
    expect(cur.totals.directCostsCents).toBe(0);
    expect(cur.totals.expensesCents).toBe(35_00); // 30 + 5 unit expenses
    expect(cur.totals.sharedOverheadCents).toBe(10_00);
    expect(cur.totals.netCents).toBe(150_00 - 0 - 35_00 - 10_00);
  });

  it("computes MoM comparison deltas (this month vs last month) (AC2)", async () => {
    const actor = await seedActor();
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();

    // May (current): 100.00 revenue. April (prior): 60.00 revenue.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 100_00, checkedInAt: new Date("2026-05-10T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 60_00, checkedInAt: new Date("2026-04-10T10:00:00Z") });
    await seedExpense({ expenseDate: "2026-05-03", businessUnit: "play", amountCents: 30_00, actor });
    await seedExpense({ expenseDate: "2026-04-03", businessUnit: "play", amountCents: 20_00, actor });

    const cmp = await loadPnlReport(dbh.db, { anchor: "2026-05-17", granularity: "month" });

    expect(cmp.previous.from).toBe("2026-04-01");
    expect(cmp.previous.to).toBe("2026-05-01");
    expect(cmp.current.totals.revenueCents).toBe(100_00);
    expect(cmp.previous.totals.revenueCents).toBe(60_00);
    expect(cmp.totalsDelta.revenueDeltaCents).toBe(40_00);
    expect(cmp.totalsDelta.netDeltaCents).toBe((100_00 - 30_00) - (60_00 - 20_00));

    const playDelta = cmp.deltaByUnit.find((u) => u.unit === "play")!;
    expect(playDelta.revenueDeltaCents).toBe(40_00);
  });

  it("computes YoY comparison deltas (this year vs last year) (AC2)", async () => {
    const [play] = await dbh.db.insert(services).values({ name: "Play", unit: "play" }).returning();
    const fam = await seedFamily();

    // 2026 (current): 200.00. 2025 (prior): 150.00.
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 200_00, checkedInAt: new Date("2026-03-10T10:00:00Z") });
    await seedBooking({ ...fam, serviceId: play!.id, revenueCents: 150_00, checkedInAt: new Date("2025-03-10T10:00:00Z") });

    const cmp = await loadPnlReport(dbh.db, { anchor: "2026-05-17", granularity: "year" });

    expect(cmp.current.from).toBe("2026-01-01");
    expect(cmp.current.to).toBe("2027-01-01");
    expect(cmp.previous.from).toBe("2025-01-01");
    expect(cmp.previous.to).toBe("2026-01-01");
    expect(cmp.current.totals.revenueCents).toBe(200_00);
    expect(cmp.previous.totals.revenueCents).toBe(150_00);
    expect(cmp.totalsDelta.revenueDeltaCents).toBe(50_00);
  });

  it("zero data → all zeros, both periods present (AC1)", async () => {
    const cmp = await loadPnlReport(dbh.db, { anchor: "2026-05-17", granularity: "month" });
    expect(cmp.current.totals.netCents).toBe(0);
    expect(cmp.previous.totals.netCents).toBe(0);
    expect(cmp.current.byUnit).toHaveLength(6); // 5 service units + shop
    expect(cmp.totalsDelta.netDeltaCents).toBe(0);
  });

  it("shopCogsByUnitInPeriod returns no direct costs today (no GRN/cost data)", async () => {
    const cogs = await shopCogsByUnitInPeriod(dbh.db, "2026-05-01", "2026-06-01");
    expect(cogs).toEqual({});
  });
});
