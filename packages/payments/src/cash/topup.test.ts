import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { invoices, parents, users, wallets, walletLedger } from "@bm/db";
import { balance } from "@bm/wallet";
import { recordCashTopup, CASH_RECEPTION_SOURCE, CashTopupAmountError } from "./topup.js";

/**
 * P1-E04-S06 — cash top-up adapter. Verifies the ledger posting shape
 * (`kind='topup'`, `source='cash:reception'`, `posted_by=<staff>`), FIFO
 * settlement of outstanding invoices, idempotency, and amount validation.
 */
describe("recordCashTopup (P1-E04-S06)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  async function seedParent(): Promise<{ parentId: string; walletId: string }> {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712000099", pinHash: "x" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    // FIFO keys on the parent *profile* id (invoices.parent_id → parents.id).
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Q" })
      .returning();
    return { parentId: p!.id, walletId: w!.id };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("posts a topup credit with kind/source/posted_by (AC2)", async () => {
    const { parentId, walletId } = await seedParent();
    const charge = await recordCashTopup(dbh.db, {
      parentId,
      walletId,
      amount: 30_000,
      postedBy: "staff-reception-1",
      idempotencyKey: "k1",
    });
    expect(charge.provider).toBe("cash");
    expect(charge.status).toBe("settled");
    expect(charge.source).toBe(CASH_RECEPTION_SOURCE);

    const [row] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, charge.ledgerEntryId));
    expect(row!.kind).toBe("topup");
    expect(row!.direction).toBe("credit");
    expect(row!.source).toBe("cash:reception");
    expect(row!.postedBy).toBe("staff-reception-1");
    expect(row!.amount).toBe(30_000);
    expect(await balance(dbh.db, walletId)).toBe(30_000);
  });

  it("settles the oldest outstanding invoice first (AC: FIFO)", async () => {
    const { parentId, walletId } = await seedParent();
    await dbh.db
      .insert(invoices)
      .values({ parentId, amountDue: 10_000, status: "pending" });
    const charge = await recordCashTopup(dbh.db, {
      parentId,
      walletId,
      amount: 25_000,
      postedBy: "staff-1",
      idempotencyKey: "k2",
    });
    expect(charge.settled).toBe(10_000);
    expect(charge.residual).toBe(15_000);
    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.parentId, parentId));
    expect(inv!.status).toBe("settled");
    expect(await balance(dbh.db, walletId)).toBe(15_000);
  });

  it("is idempotent: a replay credits nothing (AC: idempotent)", async () => {
    const { parentId, walletId } = await seedParent();
    const input = {
      parentId,
      walletId,
      amount: 20_000,
      postedBy: "staff-1",
      idempotencyKey: "dup",
    };
    const first = await recordCashTopup(dbh.db, input);
    const second = await recordCashTopup(dbh.db, input);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    const topups = (await dbh.db.select().from(walletLedger)).filter(
      (r) => r.kind === "topup",
    );
    expect(topups).toHaveLength(1);
    expect(await balance(dbh.db, walletId)).toBe(20_000);
  });

  it("rejects a non-positive / non-integer amount", async () => {
    const { parentId, walletId } = await seedParent();
    await expect(
      recordCashTopup(dbh.db, {
        parentId,
        walletId,
        amount: 0,
        postedBy: "s",
        idempotencyKey: "z",
      }),
    ).rejects.toBeInstanceOf(CashTopupAmountError);
    await expect(
      recordCashTopup(dbh.db, {
        parentId,
        walletId,
        amount: 12.5,
        postedBy: "s",
        idempotencyKey: "z2",
      }),
    ).rejects.toBeInstanceOf(CashTopupAmountError);
  });
});
