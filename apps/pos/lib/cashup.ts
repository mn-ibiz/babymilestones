import { cashupReasonRequired } from "@bm/contracts";
import { formatKes } from "./products.js";

/**
 * Pure end-of-day cash-up helpers (P2-E04-S05). The reason-threshold rule is the
 * shared `@bm/contracts` `cashupReasonRequired` so the client and the API agree.
 */

/** Variance = counted − expected cash (signed), integer cents (AC2). */
export function computeVariance(countedCents: number, expectedCents: number): number {
  return countedCents - expectedCents;
}

/** A variance over the KES 500 threshold needs a reason (AC3). */
export function isReasonRequired(varianceCents: number): boolean {
  return cashupReasonRequired(varianceCents);
}

/** Human label for a variance ("balanced" / "over by …" / "short by …"). */
export function varianceLabel(varianceCents: number): string {
  if (varianceCents === 0) return "Balanced";
  return varianceCents > 0
    ? `Over by ${formatKes(varianceCents)}`
    : `Short by ${formatKes(-varianceCents)}`;
}
