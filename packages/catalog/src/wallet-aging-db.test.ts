import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { invoices, parents, users } from "@bm/db";
import { loadWalletAging } from "./wallet-aging-db.js";

/**
 * P3-E05-S04 (Story 27.4) — DB read behind the wallet aging report. DB-backed via
 * the PGlite harness. Verifies the read loads every OUTSTANDING invoice (status
 * NOT IN settled/void, positive amount_due), joins to the parent + user for the
 * profile-link key + display name, and ages each invoice by its `createdAt` into
 * the right bucket (AC1/AC2). Settled / void / zero invoices are excluded.
 */
describe("loadWalletAging (Story 27.4)", () => {
  let dbh: TestDb;
  let phoneSeq = 0;
  const nextPhone = () => `+25471${String(3_000_000 + phoneSeq++).padStart(7, "0")}`;
  const asOf = new Date("2026-06-02T12:00:00.000Z");
  const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedParent(firstName: string, lastName: string) {
    const [u] = await dbh.db.insert(users).values({ phone: nextPhone(), pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName, lastName })
      .returning();
    return { parentId: p!.id, userId: u!.id };
  }

  async function seedInvoice(opts: {
    parentId: string;
    amountDue: number;
    createdAt: Date;
    status?: string;
  }) {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({
        parentId: opts.parentId,
        amountDue: opts.amountDue,
        status: opts.status ?? "outstanding",
        createdAt: opts.createdAt,
      })
      .returning();
    return inv!.id;
  }

  it("buckets outstanding invoices by createdAt age and carries the profile-link key (AC1/AC2)", async () => {
    const a = await seedParent("Ann", "Aye");
    const b = await seedParent("Bea", "Bee");
    await seedInvoice({ parentId: a.parentId, amountDue: 1000, createdAt: daysAgo(3) }); // 0–7
    await seedInvoice({ parentId: a.parentId, amountDue: 2000, createdAt: daysAgo(45) }); // 31–60
    await seedInvoice({ parentId: b.parentId, amountDue: 5000, createdAt: daysAgo(120) }); // 90+

    const report = await loadWalletAging(dbh.db, { asOf });
    const byKey = Object.fromEntries(report.buckets.map((x) => [x.key, x]));

    expect(byKey.d0_7!.rows).toHaveLength(1);
    expect(byKey.d0_7!.rows[0]).toMatchObject({ userId: a.userId, parentName: "Ann Aye", amountCents: 1000 });
    expect(byKey.d31_60!.rows[0]).toMatchObject({ parentId: a.parentId, amountCents: 2000 });
    expect(byKey.d90_plus!.rows[0]).toMatchObject({ userId: b.userId, parentName: "Bea Bee", amountCents: 5000 });
    expect(report.totalCents).toBe(8000);
  });

  it("excludes settled / void invoices (AC2)", async () => {
    const a = await seedParent("Ann", "Aye");
    await seedInvoice({ parentId: a.parentId, amountDue: 1000, createdAt: daysAgo(3), status: "settled" });
    await seedInvoice({ parentId: a.parentId, amountDue: 2000, createdAt: daysAgo(3), status: "void" });
    await seedInvoice({ parentId: a.parentId, amountDue: 0, createdAt: daysAgo(3), status: "outstanding" });
    await seedInvoice({ parentId: a.parentId, amountDue: 700, createdAt: daysAgo(3), status: "pending" });

    const report = await loadWalletAging(dbh.db, { asOf });
    const byKey = Object.fromEntries(report.buckets.map((x) => [x.key, x]));
    expect(byKey.d0_7!.rows).toHaveLength(1);
    expect(byKey.d0_7!.rows[0]).toMatchObject({ amountCents: 700 });
    expect(report.totalCents).toBe(700);
  });

  it("returns all five empty buckets when nobody owes anything", async () => {
    const report = await loadWalletAging(dbh.db, { asOf });
    expect(report.buckets).toHaveLength(5);
    expect(report.totalCents).toBe(0);
  });
});
