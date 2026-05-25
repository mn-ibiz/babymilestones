import { describe, expect, it } from "vitest";
import type { RecentTransaction, WalletOverview } from "@bm/contracts";
import {
  formatCentsKes,
  shouldShowOutstanding,
  autoCreditLabel,
  loyaltyLabel,
  walletTransactionRow,
  walletTransactionRows,
  walletHeroViewModel,
  TOP_UP_METHODS,
} from "./wallet";

const tx = (over: Partial<RecentTransaction> = {}): RecentTransaction => ({
  id: "t1",
  createdAt: "2026-03-12T10:00:00.000Z",
  kind: "topup",
  direction: "credit",
  amountCents: 100_000,
  source: "mpesa",
  balanceAfterCents: 100_000,
  ...over,
});

const overview = (over: Partial<WalletOverview> = {}): WalletOverview => ({
  balanceCents: 70_000,
  outstandingCents: 0,
  autoCreditEnabled: false,
  loyaltyPoints: 0,
  recentTransactions: [],
  ...over,
});

describe("formatCentsKes (money: integer cents → KES)", () => {
  it("formats whole and fractional amounts with two decimals", () => {
    expect(formatCentsKes(0)).toBe("KES 0.00");
    expect(formatCentsKes(70_000)).toBe("KES 700.00");
    expect(formatCentsKes(150_050)).toBe("KES 1,500.50");
  });
  it("formats negative amounts (overdraw) with a sign", () => {
    expect(formatCentsKes(-20_000)).toBe("KES -200.00");
  });
});

describe("shouldShowOutstanding (AC1: indicator only when > 0)", () => {
  it("hidden at zero", () => {
    expect(shouldShowOutstanding(0)).toBe(false);
  });
  it("hidden for negative (defensive — never owe a negative)", () => {
    expect(shouldShowOutstanding(-1)).toBe(false);
  });
  it("shown when the parent owes money", () => {
    expect(shouldShowOutstanding(50_000)).toBe(true);
  });
});

describe("autoCreditLabel (AC1: read-only status)", () => {
  it("reflects on/off", () => {
    expect(autoCreditLabel(true)).toBe("On");
    expect(autoCreditLabel(false)).toBe("Off");
  });
});

describe("loyaltyLabel (AC4: read-only points)", () => {
  it("renders the points count", () => {
    expect(loyaltyLabel(0)).toBe("0 points");
    expect(loyaltyLabel(1)).toBe("1 point");
    expect(loyaltyLabel(240)).toBe("240 points");
  });
});

describe("walletTransactionRow / walletTransactionRows (AC3)", () => {
  it("maps a posting onto display labels", () => {
    const row = walletTransactionRow(tx({ amountCents: -30_000, direction: "debit", kind: "debit" }));
    expect(row.dateLabel).toBe("2026-03-12");
    expect(row.kind).toBe("debit");
    expect(row.amountLabel).toBe("KES -300.00");
    expect(row.balanceAfterLabel).toBe("KES 1,000.00");
    expect(row.isCredit).toBe(false);
  });
  it("preserves newest-first order from the API", () => {
    const rows = walletTransactionRows([
      tx({ id: "a", createdAt: "2026-03-12T10:00:00.000Z" }),
      tx({ id: "b", createdAt: "2026-03-11T10:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("empty list → empty rows", () => {
    expect(walletTransactionRows([])).toEqual([]);
  });
});

describe("walletHeroViewModel (AC1)", () => {
  it("composes balance, outstanding (hidden at 0), auto-credit, loyalty", () => {
    const vm = walletHeroViewModel(overview({ balanceCents: 70_000, outstandingCents: 0 }));
    expect(vm.balanceLabel).toBe("KES 700.00");
    expect(vm.showOutstanding).toBe(false);
    expect(vm.autoCreditLabel).toBe("Off");
    expect(vm.loyaltyLabel).toBe("0 points");
  });
  it("shows outstanding when owed", () => {
    const vm = walletHeroViewModel(overview({ outstandingCents: 50_000, autoCreditEnabled: true }));
    expect(vm.showOutstanding).toBe(true);
    expect(vm.outstandingLabel).toBe("KES 500.00");
    expect(vm.autoCreditLabel).toBe("On");
  });
});

describe("TOP_UP_METHODS (AC2: method picker)", () => {
  it("offers M-Pesa STK, Paystack card, and bank transfer", () => {
    const keys = TOP_UP_METHODS.map((m) => m.key);
    expect(keys).toEqual(["mpesa", "card", "bank"]);
    for (const m of TOP_UP_METHODS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.href.startsWith("/")).toBe(true);
    }
  });
});
