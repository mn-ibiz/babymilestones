/** @bm/wallet — admin manual loyalty adjustment (P3-E04-S03).
 *
 * An admin credits (positive) or debits (negative) a parent's points balance for
 * goodwill or correction. Append-only: writes a NEW `loyalty_ledger` row
 * (`kind='adjustment'`) stamped with the acting admin in `posted_by`. Integer
 * points only; zero is rejected. A debit may legitimately push the balance below
 * zero (negative carry, S02) — that is flagged on the row. Permission gating and
 * audit logging live at the API layer (admin/loyalty route); this is the pure
 * ledger service so it stays free of the auth dependency.
 */
import type { Database, Transaction } from "@bm/db";
import { loyaltyLedger } from "@bm/db";
import { loyaltyBalance } from "./loyalty.js";

type LedgerReader = Database | Transaction;

/** Thrown when an adjustment request is invalid (non-integer, zero, no reason). */
export class LoyaltyAdjustmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoyaltyAdjustmentError";
  }
}

export interface AdjustLoyaltyPointsInput {
  db: LedgerReader;
  parentId: string;
  /** Signed integer points. Positive credits, negative debits. Must be != 0. */
  points: number;
  /** Free-text reason for the adjustment (goodwill / correction). Required. */
  reason: string;
  /** The admin user id performing the adjustment (stored in posted_by). */
  adminUserId: string;
}

export interface AdjustLoyaltyPointsResult {
  ledgerId: string;
  pointsDelta: number;
  balanceAfter: number;
  negativeCarry: boolean;
}

/**
 * Apply a manual loyalty adjustment. See module doc for the append-only /
 * integer-points / negative-carry rules.
 */
export async function adjustLoyaltyPoints(
  input: AdjustLoyaltyPointsInput,
): Promise<AdjustLoyaltyPointsResult> {
  const { db, parentId, points, reason, adminUserId } = input;

  if (!Number.isInteger(points)) {
    throw new LoyaltyAdjustmentError("adjustment points must be an integer");
  }
  if (points === 0) {
    throw new LoyaltyAdjustmentError("adjustment points must be non-zero");
  }
  if (!reason || reason.trim().length === 0) {
    throw new LoyaltyAdjustmentError("adjustment reason is required");
  }

  const balance = await loyaltyBalance(db, parentId);
  const balanceAfter = balance + points;
  const negativeCarry = balanceAfter < 0;

  const [row] = await db
    .insert(loyaltyLedger)
    .values({
      parentId,
      pointsDelta: points,
      kind: "adjustment",
      postedBy: adminUserId,
      // Persist the WHY on the ledger row itself (the column exists for this) — not
      // only in the audit payload — so anyone reading the ledger sees the reason.
      reason: reason.trim(),
      negativeCarry,
    })
    .returning();

  return {
    ledgerId: row!.id,
    pointsDelta: points,
    balanceAfter,
    negativeCarry,
  };
}
