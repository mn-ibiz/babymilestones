import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { invoices, parents, users, wallets, walletLedger } from "@bm/db";
import { balance } from "@bm/wallet";
import { confirmBankTransfer, BANK_MANUAL_SOURCE, BankTransferAmountError } from "./topup.js";

/**
 * P1-E04-S07 — bank transfer top-up adapter. Verifies the ledger posting shape
 * (`kind='topup'`, `source='bank:manual'`, `posted_by=<admin>`), FIFO settlement,
 * the double-confirm guard (idempotency keyed on the pending row id), and amount
 * validation.
 */
describe("confirmBankTransfer (P1-E04-S07)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  async function seedParent(): Promise<{ parentId: string; walletId: string }> {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712000088", pinHash: "x" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
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
    const charge = await confirmBankTransfer(dbh.db, {
      pendingId: "11111111-1111-1111-1111-111111111111",
      parentId,
      walletId,
      amount: 40_000,
      postedBy: "admin-1",
    });
    expect(charge.provider).toBe("bank");
    expect(charge.status).toBe("settled");
    expect(charge.source).toBe(BANK_MANUAL_SOURCE);

    const [row] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, charge.ledgerEntryId));
    expect(row!.kind).toBe("topup");
    expect(row!.direction).toBe("credit");
    expect(row!.source).toBe("bank:manual");
    expect(row!.postedBy).toBe("admin-1");
    expect(row!.amount).toBe(40_000);
    // The wallet idempotency key IS the pending row id.
    expect(row!.idempotencyKey).toBe("11111111-1111-1111-1111-111111111111");
    expect(await balance(dbh.db, walletId)).toBe(40_000);
  });

  it("settles the oldest outstanding invoice first (FIFO)", async () => {
    const { parentId, walletId } = await seedParent();
    await dbh.db.insert(invoices).values({ parentId, amountDue: 10_000, status: "pending" });
    const charge = await confirmBankTransfer(dbh.db, {
      pendingId: "22222222-2222-2222-2222-222222222222",
      parentId,
      walletId,
      amount: 25_000,
      postedBy: "admin-1",
    });
    expect(charge.settled).toBe(10_000);
    expect(charge.residual).toBe(15_000);
    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.parentId, parentId));
    expect(inv!.status).toBe("settled");
    expect(await balance(dbh.db, walletId)).toBe(15_000);
  });

  it("double-confirm credits nothing the second time (idempotent on pending id)", async () => {
    const { parentId, walletId } = await seedParent();
    const input = {
      pendingId: "33333333-3333-3333-3333-333333333333",
      parentId,
      walletId,
      amount: 20_000,
      postedBy: "admin-1",
    };
    const first = await confirmBankTransfer(dbh.db, input);
    const second = await confirmBankTransfer(dbh.db, input);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    const topups = (await dbh.db.select().from(walletLedger)).filter((r) => r.kind === "topup");
    expect(topups).toHaveLength(1);
    expect(await balance(dbh.db, walletId)).toBe(20_000);
  });

  it("rejects a non-positive / non-integer amount", async () => {
    const { parentId, walletId } = await seedParent();
    await expect(
      confirmBankTransfer(dbh.db, {
        pendingId: "44444444-4444-4444-4444-444444444444",
        parentId,
        walletId,
        amount: 0,
        postedBy: "a",
      }),
    ).rejects.toBeInstanceOf(BankTransferAmountError);
    await expect(
      confirmBankTransfer(dbh.db, {
        pendingId: "55555555-5555-5555-5555-555555555555",
        parentId,
        walletId,
        amount: 12.5,
        postedBy: "a",
      }),
    ).rejects.toBeInstanceOf(BankTransferAmountError);
  });
});
