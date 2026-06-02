import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { expenses, expenseRecurringTemplates, users } from "@bm/db";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { createRecurringTemplate } from "@bm/catalog";
import { createRecurringExpensesJob } from "./recurring-expenses.js";

/**
 * P6-E05-S05 (Story 35.5 AC3) — recurring-expenses materialisation cron. DB-backed
 * via PGlite with an injected clock. Materialises a concrete expense for every
 * active template whose day_of_month matches today; idempotent per calendar month
 * (a re-run the same month creates nothing); skips off-day + inactive templates.
 */
describe("recurring-expenses cron (P6-E05-S05 / Story 35.5 AC3)", () => {
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

  const at = (date: string) => new Date(`${date}T01:00:00.000Z`);

  it("materialises a due template into one expense, idempotent per month", async () => {
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

    const job = createRecurringExpensesJob({ db: dbh.db, now: () => at("2026-06-15") });

    await job.run();
    const after1 = await dbh.db.select().from(expenses);
    expect(after1.length).toBe(1);
    expect(after1[0]!.recurringTemplateId).toBe(tpl.id);
    expect(after1[0]!.expenseDate).toBe("2026-06-15");
    expect(after1[0]!.amountCents).toBe(200_00);
    expect(after1[0]!.businessUnit).toBe("salon");

    // Re-run same day → idempotent.
    await job.run();
    expect((await dbh.db.select().from(expenses)).length).toBe(1);

    // last_run_month stamped.
    const [tplAfter] = await dbh.db
      .select()
      .from(expenseRecurringTemplates)
      .where(eq(expenseRecurringTemplates.id, tpl.id));
    expect(tplAfter!.lastRunMonth).toBe("2026-06");

    // Next month, same day → a new expense.
    const julyJob = createRecurringExpensesJob({ db: dbh.db, now: () => at("2026-07-15") });
    await julyJob.run();
    expect((await dbh.db.select().from(expenses)).length).toBe(2);
  });

  it("does nothing on a non-matching day", async () => {
    const actor = await seedActor();
    await createRecurringTemplate(dbh.db, {
      category: "Rent",
      businessUnit: "salon",
      amountCents: 100,
      paymentMethod: "cash",
      dayOfMonth: 10,
      createdBy: actor,
    });
    const job = createRecurringExpensesJob({ db: dbh.db, now: () => at("2026-06-11") });
    await job.run();
    expect((await dbh.db.select().from(expenses)).length).toBe(0);
  });

  it("exposes the daily cron descriptor", () => {
    const job = createRecurringExpensesJob({ db: dbh.db });
    expect(job.name).toBe("recurring-expenses");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);
    expect(job.cron).toBe("0 1 * * *");
  });

  it("logs a per-run summary with the created count", async () => {
    const actor = await seedActor();
    await createRecurringTemplate(dbh.db, {
      category: "Salaries",
      businessUnit: null,
      amountCents: 5_000_00,
      paymentMethod: "bank_transfer",
      dayOfMonth: 1,
      createdBy: actor,
    });
    const logs: Array<Record<string, unknown>> = [];
    const job = createRecurringExpensesJob({
      db: dbh.db,
      now: () => at("2026-06-01"),
      logger: { info: (obj) => logs.push(obj) },
    });
    await job.run();
    const summary = logs.find((l) => l.event === "recurring.expenses.materialised");
    expect(summary).toBeTruthy();
    expect(summary!.created).toBe(1);
    expect(summary!.as_of_date).toBe("2026-06-01");
  });
});
