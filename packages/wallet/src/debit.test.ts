import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditOutbox,
  invoices,
  users,
  wallets,
  walletLedger,
  walletLedgerInvoiceSettlement,
} from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { eq } from "drizzle-orm";
import { debit, DoubleCheckInError } from "./index.js";
import { post, balance } from "./index.js";

/**
 * P1-E03-S05 — debit at check-in. Tests cover the four mutually-exclusive
 * outcomes (AC3 sufficient → settled, AC4 underfunded + auto-credit →
 * settled_on_credit, AC5 underfunded + no auto-credit → outstanding), the
 * idempotent repeat, and the double-check-in fence (AC6). Written test-first.
 */
describe("wallet.debit() — check-in debit + invoice settlement (P1-E03-S05)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  /** Seed a user + parent + wallet. Returns ids. */
  async function seed(opts: { autoCredit?: boolean } = {}): Promise<{
    walletId: string;
    parentId: string;
    userId: string;
  }> {
    seq += 1;
    const phone = `+25471${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db
      .insert(wallets)
      .values({ userId: u!.id, autoCreditEnabled: opts.autoCredit ?? false })
      .returning();
    // parents.user_id is UNIQUE; reuse the same user as the parent owner.
    const { parents } = await import("@bm/db");
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "A", lastName: "B" })
      .returning();
    return { walletId: w!.id, parentId: p!.id, userId: u!.id };
  }

  /** Create a pending invoice for the parent (AC1 shape). */
  async function pendingInvoice(parentId: string, amount: number): Promise<string> {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId, amountDue: amount, status: "pending", serviceId: null })
      .returning();
    return inv!.id;
  }

  async function topup(walletId: string, amount: number, key: string) {
    await post(dbh.db, {
      walletId,
      amount,
      kind: "topup",
      idempotencyKey: key,
      source: "cash",
      postedBy: "system",
    });
  }

  function input(
    walletId: string,
    invoiceId: string,
    staffId: string,
    extra: Partial<Parameters<typeof debit>[1]> = {},
  ) {
    return {
      walletId,
      invoiceId,
      idempotencyKey: `checkin:${invoiceId}`,
      source: "checkin",
      postedBy: staffId,
      ...extra,
    };
  }

  it("AC3: wallet >= amount → debit posted, invoice settled, balance reduced", async () => {
    const { walletId, parentId, userId } = await seed();
    await topup(walletId, 5_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    const res = await debit(dbh.db, input(walletId, invoiceId, userId));

    expect(res.outcome).toBe("settled");
    expect(res.debited).toBe(3_000);
    expect(res.ledgerEntryId).toBeTruthy();
    expect(res.replayed).toBe(false);

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.status).toBe("settled");
    expect(await balance(dbh.db, walletId)).toBe(2_000);

    // Linkage row recorded with kind 'checkin'.
    const links = await dbh.db
      .select()
      .from(walletLedgerInvoiceSettlement)
      .where(eq(walletLedgerInvoiceSettlement.invoiceId, invoiceId));
    expect(links).toHaveLength(1);
    expect(links[0]!.kind).toBe("checkin");
    expect(links[0]!.amount).toBe(3_000);
  });

  it("AC4: wallet < amount AND auto_credit_enabled → debit anyway, balance negative, settled_on_credit", async () => {
    const { walletId, parentId, userId } = await seed({ autoCredit: true });
    await topup(walletId, 1_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    const res = await debit(dbh.db, input(walletId, invoiceId, userId));

    expect(res.outcome).toBe("settled_on_credit");
    expect(res.debited).toBe(3_000);

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.status).toBe("settled_on_credit");
    expect(await balance(dbh.db, walletId)).toBe(-2_000);
  });

  it("AC5: wallet < amount AND auto_credit disabled → NO debit, invoice outstanding, booking proceeds", async () => {
    const { walletId, parentId, userId } = await seed({ autoCredit: false });
    await topup(walletId, 1_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    const res = await debit(dbh.db, input(walletId, invoiceId, userId));

    expect(res.outcome).toBe("outstanding");
    expect(res.debited).toBe(0);
    expect(res.ledgerEntryId).toBeNull();

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.status).toBe("outstanding");
    // No debit posted: balance unchanged, no ledger debit, no linkage row.
    expect(await balance(dbh.db, walletId)).toBe(1_000);
    const debits = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, walletId));
    expect(debits.every((d) => d.direction === "credit")).toBe(true);
    const links = await dbh.db
      .select()
      .from(walletLedgerInvoiceSettlement)
      .where(eq(walletLedgerInvoiceSettlement.invoiceId, invoiceId));
    expect(links).toHaveLength(0);
  });

  it("AC2/idempotent: a replayed check-in with the same key is a no-op returning replayed=true", async () => {
    const { walletId, parentId, userId } = await seed();
    await topup(walletId, 5_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    const first = await debit(dbh.db, input(walletId, invoiceId, userId));
    const second = await debit(dbh.db, input(walletId, invoiceId, userId));

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.outcome).toBe("settled");
    // Exactly one debit posted; balance reflects a single charge.
    expect(await balance(dbh.db, walletId)).toBe(2_000);
    const links = await dbh.db
      .select()
      .from(walletLedgerInvoiceSettlement)
      .where(eq(walletLedgerInvoiceSettlement.invoiceId, invoiceId));
    expect(links).toHaveLength(1);
  });

  it("AC6: a distinct second check-in for the same invoice is rejected (double-check-in fence)", async () => {
    const { walletId, parentId, userId } = await seed();
    await topup(walletId, 10_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    await debit(dbh.db, input(walletId, invoiceId, userId));
    // A second check-in with a DIFFERENT idempotency key must not double-charge.
    await expect(
      debit(dbh.db, input(walletId, invoiceId, userId, { idempotencyKey: "checkin:retry" })),
    ).rejects.toBeInstanceOf(DoubleCheckInError);

    expect(await balance(dbh.db, walletId)).toBe(7_000);
  });

  it("audits the check-in debit with the acting staff id and outcome", async () => {
    const { walletId, parentId, userId } = await seed();
    await topup(walletId, 5_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);

    await debit(dbh.db, input(walletId, invoiceId, userId));

    const rows = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "wallet.checkin_debit"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(userId);
    expect(rows[0]!.targetId).toBe(invoiceId);
  });

  it("rejects a missing invoice", async () => {
    const { walletId, userId } = await seed();
    await topup(walletId, 5_000, "t1");
    await expect(
      debit(dbh.db, input(walletId, "00000000-0000-0000-0000-000000000000", userId)),
    ).rejects.toThrow(/invoice/i);
  });

  it("rejects an invoice that is not pending", async () => {
    const { walletId, parentId, userId } = await seed();
    await topup(walletId, 5_000, "t1");
    const invoiceId = await pendingInvoice(parentId, 3_000);
    await dbh.db.update(invoices).set({ status: "settled" }).where(eq(invoices.id, invoiceId));
    await expect(debit(dbh.db, input(walletId, invoiceId, userId))).rejects.toThrow(/pending/i);
  });
});
