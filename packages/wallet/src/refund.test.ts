import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditOutbox, users, wallets, walletLedger } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { balance, post } from "./index.js";
import {
  refund,
  RefundExceedsRefundableError,
  RefundReasonRequiredError,
  RefundTargetNotFoundError,
} from "./refund.js";

describe("wallet.refund() — reversing entry (P1-E03-S06)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  // audit_outbox.actor_user_id is a uuid; postedBy must be a real user id.
  let admin = "";
  beforeEach(async () => {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254700000001", pinHash: "x", role: "admin" })
      .returning();
    admin = u!.id;
  });

  let seq = 0;
  async function seedWallet(): Promise<string> {
    seq += 1;
    const phone = `+25471${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return w!.id;
  }

  /** Seed a wallet with a topup credit and an original debit to refund against. */
  async function seedDebit(amount = 50_000): Promise<{ walletId: string; debitId: string }> {
    const walletId = await seedWallet();
    await post(dbh.db, {
      walletId,
      amount: 200_000,
      kind: "topup",
      idempotencyKey: `topup:${walletId}`,
      source: "mpesa",
      postedBy: "system",
    });
    const debitRow = await post(dbh.db, {
      walletId,
      amount: -amount,
      kind: "debit",
      idempotencyKey: `debit:${walletId}`,
      source: "checkin",
      postedBy: "reception",
    });
    return { walletId, debitId: debitRow.id };
  }

  it("inserts a kind='refund' row with reverses_entry_id = original (AC2)", async () => {
    const { walletId, debitId } = await seedDebit(50_000);
    const res = await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 50_000,
      reasonCode: "service_not_rendered",
      note: "Class cancelled",
      postedBy: admin,
    });
    const [row] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, res.ledgerEntryId));
    expect(row!.kind).toBe("refund");
    expect(row!.reversesEntryId).toBe(debitId);
    expect(row!.walletId).toBe(walletId);
    expect(row!.loyaltyClawbackPending).toBe(true);
  });

  it("reverses the net effect: a refund of a -50000 debit posts +50000 (AC2)", async () => {
    const { walletId, debitId } = await seedDebit(50_000);
    // balance after topup(+200k) and debit(-50k) = 150k.
    expect(await balance(dbh.db, walletId)).toBe(150_000);
    await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 50_000,
      reasonCode: "service_not_rendered",
      postedBy: admin,
    });
    // The reversing credit returns the 50k → 200k.
    expect(await balance(dbh.db, walletId)).toBe(200_000);
  });

  it("flags loyalty_clawback_pending=true (clawback deferred to P3)", async () => {
    const { debitId } = await seedDebit();
    const res = await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 10_000,
      reasonCode: "goodwill",
      postedBy: admin,
    });
    const [row] = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, res.ledgerEntryId));
    expect(row!.loyaltyClawbackPending).toBe(true);
  });

  it("requires a reason code (AC1)", async () => {
    const { debitId } = await seedDebit();
    await expect(
      refund(dbh.db, {
        originalEntryId: debitId,
        amount: 10_000,
        reasonCode: "  ",
        postedBy: admin,
      }),
    ).rejects.toBeInstanceOf(RefundReasonRequiredError);
  });

  it("rejects a refund exceeding the original amount (AC1/AC4)", async () => {
    const { debitId } = await seedDebit(50_000);
    await expect(
      refund(dbh.db, {
        originalEntryId: debitId,
        amount: 50_001,
        reasonCode: "x",
        postedBy: admin,
      }),
    ).rejects.toBeInstanceOf(RefundExceedsRefundableError);
  });

  it("rejects a non-positive amount", async () => {
    const { debitId } = await seedDebit();
    await expect(
      refund(dbh.db, { originalEntryId: debitId, amount: 0, reasonCode: "x", postedBy: admin }),
    ).rejects.toThrow();
  });

  it("tracks partial refunds: remaining-refundable shrinks (AC4)", async () => {
    const { debitId } = await seedDebit(50_000);
    await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 30_000,
      reasonCode: "partial",
      idempotencyKey: "r1",
      postedBy: admin,
    });
    // 20k remains refundable; 20k is OK, 20_001 is not.
    await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 20_000,
      reasonCode: "partial",
      idempotencyKey: "r2",
      postedBy: admin,
    });
    await expect(
      refund(dbh.db, {
        originalEntryId: debitId,
        amount: 1,
        reasonCode: "partial",
        idempotencyKey: "r3",
        postedBy: admin,
      }),
    ).rejects.toBeInstanceOf(RefundExceedsRefundableError);
  });

  it("is idempotent: same key returns the same entry, posts once", async () => {
    const { walletId, debitId } = await seedDebit(50_000);
    const a = await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 50_000,
      reasonCode: "x",
      idempotencyKey: "dup",
      postedBy: admin,
    });
    const b = await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 50_000,
      reasonCode: "x",
      idempotencyKey: "dup",
      postedBy: admin,
    });
    expect(b.ledgerEntryId).toBe(a.ledgerEntryId);
    expect(b.replayed).toBe(true);
    const refunds = (await dbh.db.select().from(walletLedger)).filter(
      (r) => r.kind === "refund",
    );
    expect(refunds).toHaveLength(1);
    // Balance reflects exactly one reversing credit.
    expect(await balance(dbh.db, walletId)).toBe(200_000);
  });

  it("rejects an unknown original entry", async () => {
    await expect(
      refund(dbh.db, {
        originalEntryId: "00000000-0000-0000-0000-000000000000",
        amount: 10,
        reasonCode: "x",
        postedBy: admin,
      }),
    ).rejects.toBeInstanceOf(RefundTargetNotFoundError);
  });

  it("writes an audit row to audit_outbox (DoD)", async () => {
    const { debitId } = await seedDebit();
    await refund(dbh.db, {
      originalEntryId: debitId,
      amount: 10_000,
      reasonCode: "goodwill",
      note: "n",
      postedBy: admin,
    });
    const rows = (await dbh.db.select().from(auditOutbox)).filter(
      (r) => r.action === "wallet.refund",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(admin);
  });
});
