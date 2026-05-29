import type { PosSaleMethod } from "@bm/contracts";

/**
 * Pure POS payment helpers (P2-E04-S04). Kept dependency-free + unit-tested so
 * the `PayPanel` component stays a thin render. All amounts are integer cents.
 */

/** The four payment methods offered on the pay screen (AC1). */
export const POS_PAY_METHODS: PosSaleMethod[] = ["cash", "mpesa", "paystack", "wallet"];

export function methodLabel(method: PosSaleMethod): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "mpesa":
      return "M-Pesa";
    case "paystack":
      return "Card (Paystack)";
    case "wallet":
      return "Wallet";
  }
}

/** Cash change due — tendered − total, never negative (AC2). */
export function changeDueCents(totalCents: number, tenderedCents: number): number {
  return Math.max(0, tenderedCents - totalCents);
}

/** Whether the cash tendered covers the total (AC2). */
export function isTenderSufficient(totalCents: number, tenderedCents: number): boolean {
  return tenderedCents >= totalCents;
}

/** Drawer instruction shown after a cash sale (AC2). */
export function drawerMessage(changeCents: number): string {
  return changeCents > 0
    ? `Open drawer — give change KES ${(changeCents / 100).toFixed(2)}.`
    : "Open drawer — exact cash.";
}

/** M-Pesa (STK target) and wallet (parent lookup) need a customer phone (AC3/AC5). */
export function requiresCustomerPhone(method: PosSaleMethod): boolean {
  return method === "mpesa" || method === "wallet";
}
