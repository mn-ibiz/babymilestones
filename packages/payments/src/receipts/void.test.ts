import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, receiptLines, receipts, services } from "@bm/db";
import {
  AlreadyVoidedError,
  LocalReceiptWriter,
  VoidReceiptNotFoundError,
  VoidTargetIsVoidError,
  voidReceipt,
} from "./index.js";

/**
 * P1-E08-S05 — receipt void as a reversing entry. Voiding NEVER deletes the
 * original; it appends a new `kind='void'` receipt with `reverses_receipt_id`
 * set and negated totals/lines so original + void nets to 0 (mirrors the wallet
 * refund reversing pattern). Double-void is rejected, as is voiding a void row.
 */
// audit_outbox.actor_user_id is a uuid column, so postedBy must be a uuid.
const ADMIN_1 = "00000000-0000-0000-0000-0000000000a1";
const ADMIN_2 = "00000000-0000-0000-0000-0000000000a2";

describe("receipt void (P1-E08-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  async function seedService(): Promise<string> {
    const [s] = await dbh.db.insert(services).values({ name: "Haircut", unit: "salon" }).returning();
    return s!.id;
  }

  async function seedReceipt(): Promise<string> {
    const serviceId = await seedService();
    const r = await new LocalReceiptWriter().writeReceipt(dbh.db, {
      series: "BM-2026",
      paymentMethod: "cash",
      postedBy: "cashier-1",
      lines: [
        { serviceId, quantity: 2, unitPrice: 25000, lineTax: 1600, lineTotal: 50000 },
      ],
    });
    return r.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("creates a kind='void' reversing receipt with reverses_receipt_id (AC1)", async () => {
    const originalId = await seedReceipt();
    const result = await voidReceipt(dbh.db, { receiptId: originalId, postedBy: ADMIN_1 });

    const [voidRow] = await dbh.db.select().from(receipts).where(eq(receipts.id, result.voidReceiptId));
    expect(voidRow!.kind).toBe("void");
    expect(voidRow!.reversesReceiptId).toBe(originalId);
    expect(voidRow!.series).toBe("BM-2026");
    // The void reuses the original's series and gets its own monotonic sequence.
    expect(voidRow!.sequenceNumber).toBe(2);

    // Original untouched (append-only).
    const [orig] = await dbh.db.select().from(receipts).where(eq(receipts.id, originalId));
    expect(orig!.kind).toBe("normal");
    expect(orig!.total).toBe(50000);
  });

  it("negates totals and lines so original + void = 0 (AC2)", async () => {
    const originalId = await seedReceipt();
    const result = await voidReceipt(dbh.db, { receiptId: originalId, postedBy: ADMIN_1 });

    const [orig] = await dbh.db.select().from(receipts).where(eq(receipts.id, originalId));
    const [voidRow] = await dbh.db.select().from(receipts).where(eq(receipts.id, result.voidReceiptId));
    expect(orig!.total + voidRow!.total).toBe(0);
    expect(orig!.taxTotal + voidRow!.taxTotal).toBe(0);

    // Per-line net is zero too: void lines mirror the original negated.
    const [agg] = await dbh.db
      .select({
        totalSum: sql<string>`COALESCE(SUM(${receiptLines.lineTotal}), 0)`,
        taxSum: sql<string>`COALESCE(SUM(${receiptLines.lineTax}), 0)`,
      })
      .from(receiptLines)
      .where(
        sql`${receiptLines.receiptId} IN (${originalId}, ${result.voidReceiptId})`,
      );
    expect(Number(agg!.totalSum)).toBe(0);
    expect(Number(agg!.taxSum)).toBe(0);

    const voidLines = await dbh.db
      .select()
      .from(receiptLines)
      .where(eq(receiptLines.receiptId, result.voidReceiptId));
    expect(voidLines).toHaveLength(1);
    expect(voidLines[0]!.lineTotal).toBe(-50000);
    expect(voidLines[0]!.quantity).toBe(2);
  });

  it("writes an audit row referencing both original and void (AC2)", async () => {
    const originalId = await seedReceipt();
    const result = await voidReceipt(dbh.db, { receiptId: originalId, postedBy: ADMIN_1 });

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "receipt.voided"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBe(ADMIN_1);
    expect(audits[0]!.targetId).toBe(originalId);
    const payload = audits[0]!.payload as Record<string, unknown>;
    expect(payload.void_receipt_id).toBe(result.voidReceiptId);
    expect(payload.original_receipt_id).toBe(originalId);
  });

  it("rejects voiding an already-voided receipt (AC3)", async () => {
    const originalId = await seedReceipt();
    await voidReceipt(dbh.db, { receiptId: originalId, postedBy: ADMIN_1 });
    await expect(
      voidReceipt(dbh.db, { receiptId: originalId, postedBy: ADMIN_2 }),
    ).rejects.toBeInstanceOf(AlreadyVoidedError);

    // Exactly one void row exists for the original.
    const voids = await dbh.db
      .select()
      .from(receipts)
      .where(and(eq(receipts.kind, "void"), eq(receipts.reversesReceiptId, originalId)));
    expect(voids).toHaveLength(1);
  });

  it("rejects voiding a void row itself (AC3)", async () => {
    const originalId = await seedReceipt();
    const result = await voidReceipt(dbh.db, { receiptId: originalId, postedBy: ADMIN_1 });
    await expect(
      voidReceipt(dbh.db, { receiptId: result.voidReceiptId, postedBy: ADMIN_1 }),
    ).rejects.toBeInstanceOf(VoidTargetIsVoidError);
  });

  it("rejects voiding a non-existent receipt", async () => {
    await expect(
      voidReceipt(dbh.db, {
        receiptId: "00000000-0000-0000-0000-000000000999",
        postedBy: ADMIN_1,
      }),
    ).rejects.toBeInstanceOf(VoidReceiptNotFoundError);
  });
});
