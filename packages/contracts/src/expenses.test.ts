import { describe, expect, it } from "vitest";
import {
  EXPENSE_BUSINESS_UNITS,
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseRecurringTemplateCreateSchema,
  expenseRecurringTemplateUpdateSchema,
  expensesListQuerySchema,
} from "./index.js";

/**
 * P6-E05-S05 (Story 35.5) — Expenses contracts. Zod schemas the admin/accountant
 * CRUD surface validates against; mirror the catalog validation + the DB CHECKs.
 */
describe("expenses contracts (P6-E05-S05 / Story 35.5)", () => {
  it("the business-unit set is the service units + shop", () => {
    expect(EXPENSE_BUSINESS_UNITS).toEqual(["play", "talent", "salon", "coaching", "event", "shop"]);
  });

  describe("expenseCreateSchema", () => {
    it("accepts a valid expense", () => {
      const r = expenseCreateSchema.safeParse({
        expenseDate: "2026-06-01",
        category: "Rent",
        businessUnit: "salon",
        amountCents: 15000,
        paymentMethod: "bank_transfer",
        reference: "INV-1",
        receiptAttachmentUrl: "https://x/y.pdf",
      });
      expect(r.success).toBe(true);
    });

    it("collapses an empty business unit to null (shared overhead)", () => {
      const r = expenseCreateSchema.parse({
        expenseDate: "2026-06-01",
        category: "Insurance",
        businessUnit: "",
        amountCents: 5000,
        paymentMethod: "mpesa",
      });
      expect(r.businessUnit).toBeNull();
      expect(r.reference).toBeNull();
      expect(r.receiptAttachmentUrl).toBeNull();
    });

    it("accepts an explicit null business unit", () => {
      const r = expenseCreateSchema.parse({
        expenseDate: "2026-06-01",
        category: "Insurance",
        businessUnit: null,
        amountCents: 5000,
        paymentMethod: "mpesa",
      });
      expect(r.businessUnit).toBeNull();
    });

    it("rejects a non-positive amount", () => {
      const r = expenseCreateSchema.safeParse({
        expenseDate: "2026-06-01",
        category: "Rent",
        businessUnit: "salon",
        amountCents: 0,
        paymentMethod: "cash",
      });
      expect(r.success).toBe(false);
    });

    it("rejects an empty category", () => {
      const r = expenseCreateSchema.safeParse({
        expenseDate: "2026-06-01",
        category: "   ",
        businessUnit: "salon",
        amountCents: 100,
        paymentMethod: "cash",
      });
      expect(r.success).toBe(false);
    });

    it("rejects an unknown business unit", () => {
      const r = expenseCreateSchema.safeParse({
        expenseDate: "2026-06-01",
        category: "Rent",
        businessUnit: "warehouse",
        amountCents: 100,
        paymentMethod: "cash",
      });
      expect(r.success).toBe(false);
    });

    it("rejects a malformed date", () => {
      const r = expenseCreateSchema.safeParse({
        expenseDate: "01-06-2026",
        category: "Rent",
        businessUnit: "salon",
        amountCents: 100,
        paymentMethod: "cash",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("expenseUpdateSchema", () => {
    it("accepts a partial patch", () => {
      const r = expenseUpdateSchema.safeParse({ amountCents: 200 });
      expect(r.success).toBe(true);
    });
    it("rejects an empty patch", () => {
      const r = expenseUpdateSchema.safeParse({});
      expect(r.success).toBe(false);
    });
  });

  describe("expenseRecurringTemplateCreateSchema", () => {
    it("accepts a valid template (defaults active)", () => {
      const r = expenseRecurringTemplateCreateSchema.parse({
        category: "Salaries",
        businessUnit: null,
        amountCents: 500000,
        paymentMethod: "bank_transfer",
        dayOfMonth: 1,
      });
      expect(r.active).toBe(true);
    });
    it("rejects day_of_month above 28", () => {
      const r = expenseRecurringTemplateCreateSchema.safeParse({
        category: "Rent",
        businessUnit: "salon",
        amountCents: 100,
        paymentMethod: "cash",
        dayOfMonth: 31,
      });
      expect(r.success).toBe(false);
    });
    it("rejects day_of_month below 1", () => {
      const r = expenseRecurringTemplateCreateSchema.safeParse({
        category: "Rent",
        businessUnit: "salon",
        amountCents: 100,
        paymentMethod: "cash",
        dayOfMonth: 0,
      });
      expect(r.success).toBe(false);
    });
  });

  describe("expenseRecurringTemplateUpdateSchema", () => {
    it("accepts toggling active", () => {
      expect(expenseRecurringTemplateUpdateSchema.safeParse({ active: false }).success).toBe(true);
    });
    it("rejects an empty patch", () => {
      expect(expenseRecurringTemplateUpdateSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("expensesListQuerySchema", () => {
    it("accepts a date range with an optional unit", () => {
      expect(
        expensesListQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-07-01", unit: "salon" }).success,
      ).toBe(true);
      expect(
        expensesListQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-07-01" }).success,
      ).toBe(true);
    });
    it("rejects a bad unit", () => {
      expect(
        expensesListQuerySchema.safeParse({ fromDate: "2026-06-01", toDate: "2026-07-01", unit: "nope" }).success,
      ).toBe(false);
    });
  });
});
