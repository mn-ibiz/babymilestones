import { describe, expect, it } from "vitest";
import type { RecentTransaction } from "@bm/contracts";
import {
  recentTransactionRow,
  recentTransactionsViewModel,
  fullStatementHref,
} from "./recent-transactions";

/**
 * P1-E05-S05 — recent-transactions panel view logic. Pure + dependency-free so
 * it unit-tests without a DOM. Covers per-row formatting (date, kind, amount,
 * balance-after — AC1), newest-first mapping/limit preservation, the empty case,
 * and the "View full statement" link target (AC2 → P1-E03-S08 export).
 */
function tx(over: Partial<RecentTransaction> = {}): RecentTransaction {
  return {
    id: "L1",
    createdAt: "2026-02-03T09:30:00.000Z",
    kind: "topup",
    direction: "credit",
    amountCents: 5_000,
    source: "cash:reception",
    balanceAfterCents: 35_000,
    ...over,
  };
}

describe("recentTransactionRow", () => {
  it("formats date, kind, amount and balance-after (AC1)", () => {
    const row = recentTransactionRow(tx());
    expect(row).toEqual({
      id: "L1",
      dateLabel: "2026-02-03",
      kind: "topup",
      amountLabel: "KES 50.00",
      balanceAfterLabel: "KES 350.00",
      isCredit: true,
    });
  });

  it("renders a debit's signed amount and marks it not-credit", () => {
    const row = recentTransactionRow(
      tx({ direction: "debit", kind: "debit", amountCents: -20_000, balanceAfterCents: 30_000 }),
    );
    expect(row.amountLabel).toBe("KES -200.00");
    expect(row.balanceAfterLabel).toBe("KES 300.00");
    expect(row.isCredit).toBe(false);
  });
});

describe("recentTransactionsViewModel", () => {
  it("maps the list preserving newest-first order (AC1)", () => {
    const rows = recentTransactionsViewModel([
      tx({ id: "newest", createdAt: "2026-02-03T00:00:00.000Z" }),
      tx({ id: "older", createdAt: "2026-02-01T00:00:00.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["newest", "older"]);
  });

  it("empty list → empty rows (empty case)", () => {
    expect(recentTransactionsViewModel([])).toEqual([]);
  });
});

describe("fullStatementHref", () => {
  it("points at the parent's statement export surface (AC2)", () => {
    expect(fullStatementHref("u42")).toBe("/parents/u42/statement");
  });
});
