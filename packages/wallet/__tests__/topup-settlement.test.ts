import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import {
  invoices,
  parents,
  users,
  walletLedger,
  walletLedgerInvoiceSettlement,
  wallets,
} from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { applyTopup, balance } from "../src/index.js";

describe("applyTopup() — FIFO settlement of outstanding invoices (P1-E03-S04)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  /** Seed a user + parent + wallet, return their ids. */
  async function seedParent(): Promise<{ parentId: string; walletId: string }> {
    seq += 1;
    const phone = `+25471${String(1000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Test", lastName: "Parent" })
      .returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    return { parentId: p!.id, walletId: w!.id };
  }

  /** Insert an invoice with an explicit createdAt so FIFO order is deterministic. */
  async function seedInvoice(
    parentId: string,
    amountDue: number,
    createdAt: Date,
  ): Promise<string> {
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId, amountDue, createdAt })
      .returning();
    return inv!.id;
  }

  function listInvoices(parentId: string) {
    return dbh.db
      .select()
      .from(invoices)
      .where(eq(invoices.parentId, parentId))
      .orderBy(asc(invoices.createdAt));
  }

  // AC4 case 1: top-up 2000 / owed 800 → wallet=1200, invoice closed.
  it("top-up 2000 against owed 800 closes the invoice, residual 1200 to wallet", async () => {
    const { parentId, walletId } = await seedParent();
    const invId = await seedInvoice(parentId, 800, new Date("2026-01-01T00:00:00Z"));

    await applyTopup(dbh.db, {
      parentId,
      walletId,
      amount: 2000,
      idempotencyKey: "tu-1",
      source: "mpesa",
      postedBy: "system",
    });

    const [inv] = await listInvoices(parentId);
    expect(inv!.status).toBe("settled");
    expect(inv!.amountDue).toBe(0);
    expect(await balance(dbh.db, walletId)).toBe(1200);

    // AC5: a ledger row and a linkage row exist for the settlement.
    const links = await dbh.db
      .select()
      .from(walletLedgerInvoiceSettlement)
      .where(eq(walletLedgerInvoiceSettlement.invoiceId, invId));
    expect(links).toHaveLength(1);
    expect(links[0]!.amount).toBe(800);
    const ledger = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.id, links[0]!.ledgerEntryId));
    expect(ledger).toHaveLength(1);
  });

  // AC4 case 2 + AC3: top-up 500 / owed 800 → wallet=0, invoice partial 300 left.
  it("top-up 500 against owed 800 partially settles, 300 left, wallet 0", async () => {
    const { parentId, walletId } = await seedParent();
    await seedInvoice(parentId, 800, new Date("2026-01-01T00:00:00Z"));

    await applyTopup(dbh.db, {
      parentId,
      walletId,
      amount: 500,
      idempotencyKey: "tu-2",
      source: "mpesa",
      postedBy: "system",
    });

    const [inv] = await listInvoices(parentId);
    expect(inv!.status).toBe("pending");
    expect(inv!.amountDue).toBe(300);
    expect(await balance(dbh.db, walletId)).toBe(0);
  });

  // AC4 case 3 + AC1: top-up 2000 / owed [500,400,200] → wallet=900, all closed.
  it("top-up 2000 settles three invoices oldest-first, residual 900 to wallet", async () => {
    const { parentId, walletId } = await seedParent();
    const a = await seedInvoice(parentId, 500, new Date("2026-01-01T00:00:00Z"));
    const b = await seedInvoice(parentId, 400, new Date("2026-01-02T00:00:00Z"));
    const c = await seedInvoice(parentId, 200, new Date("2026-01-03T00:00:00Z"));

    await applyTopup(dbh.db, {
      parentId,
      walletId,
      amount: 2000,
      idempotencyKey: "tu-3",
      source: "mpesa",
      postedBy: "system",
    });

    const invs = await listInvoices(parentId);
    expect(invs.map((i) => i.status)).toEqual(["settled", "settled", "settled"]);
    expect(invs.map((i) => i.amountDue)).toEqual([0, 0, 0]);
    expect(await balance(dbh.db, walletId)).toBe(900);

    // AC5: three linkage rows, one per invoice, correct amounts.
    for (const [id, amt] of [
      [a, 500],
      [b, 400],
      [c, 200],
    ] as const) {
      const links = await dbh.db
        .select()
        .from(walletLedgerInvoiceSettlement)
        .where(eq(walletLedgerInvoiceSettlement.invoiceId, id));
      expect(links).toHaveLength(1);
      expect(links[0]!.amount).toBe(amt);
    }
  });

  // AC1: FIFO order is by created_at even when rows are inserted out of order.
  it("settles strictly oldest-first regardless of insert order", async () => {
    const { parentId, walletId } = await seedParent();
    // Insert the NEWER invoice first; older one second.
    const newer = await seedInvoice(parentId, 600, new Date("2026-02-01T00:00:00Z"));
    const older = await seedInvoice(parentId, 600, new Date("2026-01-01T00:00:00Z"));

    // Top-up only enough to fully clear ONE invoice (the older) + dent nothing else.
    await applyTopup(dbh.db, {
      parentId,
      walletId,
      amount: 600,
      idempotencyKey: "tu-4",
      source: "mpesa",
      postedBy: "system",
    });

    const [olderRow] = await dbh.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, older));
    const [newerRow] = await dbh.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, newer));
    expect(olderRow!.status).toBe("settled");
    expect(olderRow!.amountDue).toBe(0);
    expect(newerRow!.status).toBe("pending");
    expect(newerRow!.amountDue).toBe(600);
    expect(await balance(dbh.db, walletId)).toBe(0);
  });

  it("with no outstanding invoices the whole top-up becomes wallet balance", async () => {
    const { parentId, walletId } = await seedParent();
    await applyTopup(dbh.db, {
      parentId,
      walletId,
      amount: 1500,
      idempotencyKey: "tu-5",
      source: "mpesa",
      postedBy: "system",
    });
    expect(await balance(dbh.db, walletId)).toBe(1500);
    const links = await dbh.db.select().from(walletLedgerInvoiceSettlement);
    expect(links).toHaveLength(0);
  });

  it("is idempotent: replaying the same idempotencyKey is a no-op", async () => {
    const { parentId, walletId } = await seedParent();
    await seedInvoice(parentId, 800, new Date("2026-01-01T00:00:00Z"));

    const input = {
      parentId,
      walletId,
      amount: 2000,
      idempotencyKey: "tu-6",
      source: "mpesa" as const,
      postedBy: "system",
    };
    await applyTopup(dbh.db, input);
    await applyTopup(dbh.db, input); // replay

    expect(await balance(dbh.db, walletId)).toBe(1200);
    // Exactly one credit (top-up) + one debit (settlement) ledger row — the
    // replay added nothing.
    const ledgerRows = await dbh.db
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.walletId, walletId));
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows.filter((r) => r.direction === "credit")).toHaveLength(1);
    expect(ledgerRows.filter((r) => r.direction === "debit")).toHaveLength(1);
    // Exactly one linkage row.
    const links = await dbh.db.select().from(walletLedgerInvoiceSettlement);
    expect(links).toHaveLength(1);
  });

  it("only settles the requesting parent's invoices", async () => {
    const me = await seedParent();
    const other = await seedParent();
    await seedInvoice(other.parentId, 500, new Date("2026-01-01T00:00:00Z"));

    await applyTopup(dbh.db, {
      parentId: me.parentId,
      walletId: me.walletId,
      amount: 1000,
      idempotencyKey: "tu-7",
      source: "mpesa",
      postedBy: "system",
    });

    // Other parent's invoice untouched.
    const [otherInv] = await dbh.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.parentId, other.parentId), eq(invoices.status, "pending")));
    expect(otherInv!.amountDue).toBe(500);
    expect(await balance(dbh.db, me.walletId)).toBe(1000);
  });
});
