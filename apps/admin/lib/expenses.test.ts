import { describe, expect, it } from "vitest";
import type { ExpenseDto, ExpenseRecurringTemplateDto } from "@bm/contracts";
import {
  EXPENSE_UNIT_OPTIONS,
  formatCents,
  unitLabel,
  expenseRows,
  templateRows,
} from "./expenses";

/**
 * P6-E05-S05 (Story 35.5) — admin expenses view-model shaping. Pure helpers
 * unit-tested without React.
 */
describe("admin expenses lib (P6-E05-S05 / Story 35.5)", () => {
  it("offers shared overhead + every unit in the picker", () => {
    expect(EXPENSE_UNIT_OPTIONS[0]!.value).toBe("");
    expect(EXPENSE_UNIT_OPTIONS.map((o) => o.value)).toEqual([
      "",
      "play",
      "talent",
      "salon",
      "coaching",
      "event",
      "shop",
    ]);
  });

  it("formats integer cents as KES", () => {
    expect(formatCents(150000)).toBe("1,500.00");
    expect(formatCents(0)).toBe("0.00");
  });

  it("labels a null unit as shared overhead", () => {
    expect(unitLabel(null)).toBe("Shared overhead");
    expect(unitLabel("salon")).toBe("Salon");
  });

  it("shapes expense rows, flagging recurring", () => {
    const dtos: ExpenseDto[] = [
      {
        id: "e1",
        expenseDate: "2026-06-01",
        category: "Rent",
        businessUnit: "salon",
        amountCents: 200000,
        paymentMethod: "bank_transfer",
        reference: "INV-1",
        receiptAttachmentUrl: null,
        recurringTemplateId: "t1",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "e2",
        expenseDate: "2026-06-02",
        category: "Insurance",
        businessUnit: null,
        amountCents: 5000,
        paymentMethod: "mpesa",
        reference: null,
        receiptAttachmentUrl: null,
        recurringTemplateId: null,
        createdAt: "2026-06-02T00:00:00.000Z",
      },
    ];
    const rows = expenseRows(dtos);
    expect(rows[0]!.unit).toBe("Salon");
    expect(rows[0]!.amount).toBe("2,000.00");
    expect(rows[0]!.recurring).toBe(true);
    expect(rows[1]!.unit).toBe("Shared overhead");
    expect(rows[1]!.reference).toBe("");
    expect(rows[1]!.recurring).toBe(false);
  });

  it("shapes recurring-template rows", () => {
    const dtos: ExpenseRecurringTemplateDto[] = [
      {
        id: "t1",
        category: "Salaries",
        businessUnit: null,
        amountCents: 500000,
        paymentMethod: "bank_transfer",
        dayOfMonth: 1,
        reference: null,
        active: true,
        lastRunMonth: "2026-05",
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ];
    const rows = templateRows(dtos);
    expect(rows[0]!.unit).toBe("Shared overhead");
    expect(rows[0]!.amount).toBe("5,000.00");
    expect(rows[0]!.dayOfMonth).toBe(1);
    expect(rows[0]!.lastRunMonth).toBe("2026-05");
  });
});
