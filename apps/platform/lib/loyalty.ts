import type { LoyaltyHistoryItem } from "@bm/contracts";

/**
 * Pure view-model helpers for the parent loyalty page (P2-E05-S04). Keep all
 * formatting here so the page component stays declarative and these stay
 * unit-testable.
 */

/** Format integer KES cents as a localized "KES 1,234.56" string. */
export function formatKes(cents: number): string {
  const kes = cents / 100;
  return `KES ${kes.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format a points count, e.g. "1,250 pts" / "1 pt". */
export function formatPoints(points: number): string {
  return `${points.toLocaleString("en-KE")} ${points === 1 ? "pt" : "pts"}`;
}

/** Human label for a loyalty ledger source (booking, top-up, etc. — AC2). */
export function sourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "topup":
      return "Top-up";
    case "booking":
      return "Booking";
    case "pos_sale":
      return "In-store purchase";
    case "redemption":
    case "parent_checkout":
      return "Redeemed at checkout";
    case "adjustment":
      return "Adjustment";
    default:
      return sourceType;
  }
}

/** A loyalty history row shaped for display. */
export interface LoyaltyHistoryView {
  id: string;
  label: string;
  /** Signed points string, e.g. "+10 pts" for earn, "-40 pts" for redeem. */
  points: string;
  direction: "earn" | "redeem";
  date: string;
}

export function toLoyaltyHistoryView(item: LoyaltyHistoryItem): LoyaltyHistoryView {
  const sign = item.direction === "earn" ? "+" : "-";
  return {
    id: item.id,
    label: sourceLabel(item.sourceType),
    points: `${sign}${formatPoints(item.points)}`,
    direction: item.direction,
    date: new Date(item.date).toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  };
}
