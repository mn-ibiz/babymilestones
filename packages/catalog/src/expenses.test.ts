import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { expenses, expenseRecurringTemplates, users } from "@bm/db";
import {
  EXPENSE_BUSINESS_UNITS,
  isExpenseBusinessUnit,
  createExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  createRecurringTemplate,
  updateRecurringTemplate,
  listRecurringTemplates,
  materialiseDueRecurringExpenses,
  expensesByUnitInPeriod,
  ExpenseValidationError,
} from "./expenses.js";

/**
 * P6-E05-S05 (Story 35.5) — Expenses module. The FOUNDATION the consolidated P&L
 * (35.1) consumes. DB-backed via PGlite. Covers: expense CRUD round-trip +
 * validation (AC1/AC2); recurring template → materialise (idempotent per month,
 * AC3); `expensesByUnitInPeriod` per-unit + shared-overhead aggregation over a
 * half-open [from, to) range (AC4).
 */
describe("expenses module (P6-E05-S05 / Story 35.5)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  let seq = 0;
  async function seedActor(): Promise<string> {
    seq += 1;
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: `+254711${String(100000 + seq).slice(-6)}`, pinHash: "x", role: "accountant" })
      .returning();
    return u!.id;
  }

  describe("business-unit taxonomy", () => {
    it("includes every service unit plus shop, and nothing else", () => {
      expect(EXPENSE_BUSINESS_UNITS).toEqual(["play", "talent", "salon", "coaching", "event", "shop"]);
    });
    it("narrows known unit codes; rejects junk + null", () => {
      expect(isExpenseBusinessUnit("salon")).toBe(true);
      expect(isExpenseBusinessUnit("shop")).toBe(true);
      expect(isExpenseBusinessUnit("nope")).toBe(false);
      expect(isExpenseBusinessUnit(null)).toBe(false);
    });
  });

  describe("expense CRUD (AC1/AC2)", () => {
    it("creates and reads back an expense round-trip", async () => {
      const actor = await seedActor();
      const row = await createExpense(dbh.db, {
        expenseDate: "2026-06-01",
        category: "Rent",
        businessUnit: "salon",
        amountCents: 150_00,
        paymentMethod: "bank_transfer",
        reference: "INV-001",
        receiptAttachmentUrl: "https://files.example/r1.pdf",
        createdBy: actor,
      });
      expect(row.id).toBeTruthy();
      expect(row.amountCents).toBe(150_00);
      expect(row.businessUnit).toBe("salon");

      const [persisted] = await dbh.db.select().from(expenses).where(eq(expenses.id, row.id));
      expect(persisted!.category).toBe("Rent");
      expect(persisted!.reference).toBe("INV-001");
      expect(persisted!.receiptAttachmentUrl).toBe("https://files.example/r1.pdf");
      expect(persisted!.recurringTemplateId).toBeNull();
    });

    it("allows a NULL business unit (shared overhead)", async () => {
      const actor = await seedActor();
      const row = await createExpense(dbh.db, {
        expenseDate: "2026-06-02",
        category: "Head office insurance",
        businessUnit: null,
        amountCents: 50_00,
        paymentMethod: "mpesa",
        createdBy: actor,
      });
      expect(row.businessUnit).toBeNull();
    });

    it("updates a partial patch", async () => {
      const actor = await seedActor();
      const row = await createExpense(dbh.db, {
        expenseDate: "2026-06-03",
        category: "Supplies",
        businessUnit: "play",
        amountCents: 10_00,
        paymentMethod: "cash",
        createdBy: actor,
      });
      const updated = await updateExpense(dbh.db, row.id, { amountCents: 12_00, reference: "REF-9" });
      expect(updated!.amountCents).toBe(12_00);
      expect(updated!.reference).toBe("REF-9");
      expect(updated!.category).toBe("Supplies");
    });

    it("returns null when updating an unknown expense", async () => {
      const updated = await updateExpense(dbh.db, "00000000-0000-0000-0000-000000000000", { amountCents: 1 });
      expect(updated).toBeNull();
    });

    it("deletes an expense", async () => {
      const actor = await seedActor();
      const row = await createExpense(dbh.db, {
        expenseDate: "2026-06-04",
        category: "Utilities",
        businessUnit: "coaching",
        amountCents: 30_00,
        paymentMethod: "cash",
        createdBy: actor,
      });
      const deleted = await deleteExpense(dbh.db, row.id);
      expect(deleted).toBe(true);
      const rows = await dbh.db.select().from(expenses).where(eq(expenses.id, row.id));
      expect(rows.length).toBe(0);
      // Deleting again is a no-op (false).
      expect(await deleteExpense(dbh.db, row.id)).toBe(false);
    });

    it("rejects a non-positive amount", async () => {
      const actor = await seedActor();
      await expect(
        createExpense(dbh.db, {
          expenseDate: "2026-06-05",
          category: "Bad",
          businessUnit: "salon",
          amountCents: 0,
          paymentMethod: "cash",
          createdBy: actor,
        }),
      ).rejects.toBeInstanceOf(ExpenseValidationError);
    });

    it("rejects an empty category", async () => {
      const actor = await seedActor();
      await expect(
        createExpense(dbh.db, {
          expenseDate: "2026-06-05",
          category: "   ",
          businessUnit: "salon",
          amountCents: 100,
          paymentMethod: "cash",
          createdBy: actor,
        }),
      ).rejects.toBeInstanceOf(ExpenseValidationError);
    });

    it("rejects an unknown business unit", async () => {
      const actor = await seedActor();
      await expect(
        createExpense(dbh.db, {
          expenseDate: "2026-06-05",
          category: "Bad unit",
          // @ts-expect-error — deliberately invalid unit code
          businessUnit: "warehouse",
          amountCents: 100,
          paymentMethod: "cash",
          createdBy: actor,
        }),
      ).rejects.toBeInstanceOf(ExpenseValidationError);
    });
  });

  describe("listExpenses filter by period + unit", () => {
    it("filters to the half-open [from, to) range and an optional unit", async () => {
      const actor = await seedActor();
      const mk = (expenseDate: string, businessUnit: "salon" | "play" | null, cents: number) =>
        createExpense(dbh.db, {
          expenseDate,
          category: "C",
          businessUnit,
          amountCents: cents,
          paymentMethod: "cash",
          createdBy: actor,
        });
      await mk("2026-05-31", "salon", 1); // before range
      await mk("2026-06-01", "salon", 2); // in range (inclusive from)
      await mk("2026-06-15", "play", 3); // in range
      await mk("2026-06-30", "salon", 4); // in range
      await mk("2026-07-01", "salon", 5); // at `to` — EXCLUSIVE upper bound, excluded

      const inJune = await listExpenses(dbh.db, { from: "2026-06-01", to: "2026-07-01" });
      expect(inJune.map((r) => r.amountCents).sort((a, b) => a - b)).toEqual([2, 3, 4]);

      const salonJune = await listExpenses(dbh.db, { from: "2026-06-01", to: "2026-07-01", unit: "salon" });
      expect(salonJune.map((r) => r.amountCents).sort((a, b) => a - b)).toEqual([2, 4]);

      const overheadJune = await listExpenses(dbh.db, { from: "2026-06-01", to: "2026-07-01", unit: null });
      expect(overheadJune.length).toBe(0);
    });
  });

  describe("recurring templates + materialise (AC3)", () => {
    it("creates and lists a template", async () => {
      const actor = await seedActor();
      const tpl = await createRecurringTemplate(dbh.db, {
        category: "Salaries",
        businessUnit: null,
        amountCents: 5_000_00,
        paymentMethod: "bank_transfer",
        dayOfMonth: 1,
        createdBy: actor,
      });
      expect(tpl.active).toBe(true);
      expect(tpl.lastRunMonth).toBeNull();
      const all = await listRecurringTemplates(dbh.db);
      expect(all.map((t) => t.id)).toContain(tpl.id);
    });

    it("rejects an out-of-range day_of_month", async () => {
      const actor = await seedActor();
      await expect(
        createRecurringTemplate(dbh.db, {
          category: "Rent",
          businessUnit: "salon",
          amountCents: 100,
          paymentMethod: "cash",
          dayOfMonth: 31,
          createdBy: actor,
        }),
      ).rejects.toBeInstanceOf(ExpenseValidationError);
    });

    it("materialises a due template into one expense, idempotently per month", async () => {
      const actor = await seedActor();
      const tpl = await createRecurringTemplate(dbh.db, {
        category: "Rent",
        businessUnit: "salon",
        amountCents: 200_00,
        paymentMethod: "bank_transfer",
        dayOfMonth: 15,
        reference: "LEASE-1",
        createdBy: actor,
      });

      // Run ON the 15th → materialises one expense.
      const first = await materialiseDueRecurringExpenses(dbh.db, "2026-06-15");
      expect(first.created).toBe(1);
      const after1 = await dbh.db.select().from(expenses);
      expect(after1.length).toBe(1);
      expect(after1[0]!.recurringTemplateId).toBe(tpl.id);
      expect(after1[0]!.expenseDate).toBe("2026-06-15");
      expect(after1[0]!.amountCents).toBe(200_00);
      expect(after1[0]!.businessUnit).toBe("salon");
      expect(after1[0]!.reference).toBe("LEASE-1");
      expect(after1[0]!.createdBy).toBe(actor);

      // Re-run the SAME day → idempotent, no second row.
      const rerun = await materialiseDueRecurringExpenses(dbh.db, "2026-06-15");
      expect(rerun.created).toBe(0);
      expect((await dbh.db.select().from(expenses)).length).toBe(1);

      // last_run_month is stamped.
      const [tplAfter] = await dbh.db
        .select()
        .from(expenseRecurringTemplates)
        .where(eq(expenseRecurringTemplates.id, tpl.id));
      expect(tplAfter!.lastRunMonth).toBe("2026-06");

      // Next month, same day → a new expense (per-month, not per-template-once).
      const july = await materialiseDueRecurringExpenses(dbh.db, "2026-07-15");
      expect(july.created).toBe(1);
      expect((await dbh.db.select().from(expenses)).length).toBe(2);
    });

    it("does not materialise on a non-matching day, or for inactive templates", async () => {
      const actor = await seedActor();
      await createRecurringTemplate(dbh.db, {
        category: "Rent",
        businessUnit: "salon",
        amountCents: 100,
        paymentMethod: "cash",
        dayOfMonth: 10,
        createdBy: actor,
      });
      const inactive = await createRecurringTemplate(dbh.db, {
        category: "Old lease",
        businessUnit: "salon",
        amountCents: 100,
        paymentMethod: "cash",
        dayOfMonth: 5,
        createdBy: actor,
      });
      await updateRecurringTemplate(dbh.db, inactive.id, { active: false });

      // The 5th: only the inactive template matches → nothing materialises.
      const r5 = await materialiseDueRecurringExpenses(dbh.db, "2026-06-05");
      expect(r5.created).toBe(0);
      // The 11th: no template matches.
      const r11 = await materialiseDueRecurringExpenses(dbh.db, "2026-06-11");
      expect(r11.created).toBe(0);
      expect((await dbh.db.select().from(expenses)).length).toBe(0);
    });
  });

  describe("expensesByUnitInPeriod (AC4 — the P&L read model)", () => {
    it("aggregates per-unit totals + a shared-overhead bucket within [from, to)", async () => {
      const actor = await seedActor();
      const mk = (expenseDate: string, businessUnit: "salon" | "play" | "shop" | null, cents: number) =>
        createExpense(dbh.db, {
          expenseDate,
          category: "C",
          businessUnit,
          amountCents: cents,
          paymentMethod: "cash",
          createdBy: actor,
        });
      // In range.
      await mk("2026-06-01", "salon", 100);
      await mk("2026-06-10", "salon", 50);
      await mk("2026-06-12", "play", 200);
      await mk("2026-06-20", "shop", 70);
      await mk("2026-06-05", null, 300); // shared overhead
      await mk("2026-06-06", null, 25); // shared overhead
      // Out of range — must NOT contribute.
      await mk("2026-05-31", "salon", 9999); // before
      await mk("2026-07-01", "play", 8888); // at `to` (exclusive)

      const agg = await expensesByUnitInPeriod(dbh.db, "2026-06-01", "2026-07-01");
      expect(agg.perUnit.salon).toBe(150);
      expect(agg.perUnit.play).toBe(200);
      expect(agg.perUnit.shop).toBe(70);
      expect(agg.perUnit.coaching).toBeUndefined();
      expect(agg.sharedOverheadCents).toBe(325);
      // total = 150 + 200 + 70 + 325
      expect(agg.totalCents).toBe(745);
    });

    it("returns zeroed buckets for an empty period", async () => {
      const agg = await expensesByUnitInPeriod(dbh.db, "2026-06-01", "2026-07-01");
      expect(agg.perUnit).toEqual({});
      expect(agg.sharedOverheadCents).toBe(0);
      expect(agg.totalCents).toBe(0);
    });
  });
});
