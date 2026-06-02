import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, expenses, expenseRecurringTemplates, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P6-E05-S05 (Story 35.5) — admin/accountant Expenses CRUD API. Integration via
 * app.inject with real staff sessions (+ CSRF). CRUD round-trip + validation
 * (AC1/AC2), recurring templates (AC3), the P&L by-unit read model (AC4), RBAC
 * (accountant allowed; reception 403; unauth 401), and audit on mutations.
 */
describe("Admin expenses API (P6-E05-S05 / Story 35.5)", () => {
  let dbh: TestDb;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, creds: Creds, body?: unknown) =>
    app.inject({
      method,
      url,
      headers: { cookie: [creds.session, creds.csrfCookie].join("; "), "x-csrf-token": creds.csrfToken },
      payload: body as Record<string, unknown> | undefined,
    });

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000005", "7425", "accountant"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await dbh.close();
  });

  const validExpense = {
    expenseDate: "2026-06-01",
    category: "Rent",
    businessUnit: "salon",
    amountCents: 150_00,
    paymentMethod: "bank_transfer",
    reference: "INV-001",
  };

  describe("RBAC", () => {
    it("401s an unauthenticated request", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/expenses?fromDate=2026-06-01&toDate=2026-07-01" });
      expect(res.statusCode).toBe(401);
    });

    it("allows an accountant to create an expense (AC2)", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const res = await req("POST", "/admin/expenses", creds, validExpense);
      expect(res.statusCode).toBe(201);
      expect(res.json().expense.category).toBe("Rent");
    });

    it("allows an admin to create an expense", async () => {
      const creds = await loginStaff("+254712000001", "7421");
      const res = await req("POST", "/admin/expenses", creds, validExpense);
      expect(res.statusCode).toBe(201);
    });

    it("403s a reception user (lacks manage expense)", async () => {
      const creds = await loginStaff("+254712000003", "7423");
      const res = await req("POST", "/admin/expenses", creds, validExpense);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("expense CRUD + validation (AC1/AC2)", () => {
    it("creates, lists, updates and deletes an expense", async () => {
      const creds = await loginStaff("+254712000005", "7425");

      const created = await req("POST", "/admin/expenses", creds, validExpense);
      expect(created.statusCode).toBe(201);
      const id = created.json().expense.id as string;

      const listed = await req("GET", "/admin/expenses?fromDate=2026-06-01&toDate=2026-07-01", creds);
      expect(listed.statusCode).toBe(200);
      expect(listed.json().expenses.map((e: { id: string }) => e.id)).toContain(id);

      const updated = await req("PATCH", `/admin/expenses/${id}`, creds, { amountCents: 175_00 });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().expense.amountCents).toBe(175_00);

      const deleted = await req("DELETE", `/admin/expenses/${id}`, creds);
      expect(deleted.statusCode).toBe(200);
      const rows = await dbh.db.select().from(expenses).where(eq(expenses.id, id));
      expect(rows.length).toBe(0);
    });

    it("rejects a non-positive amount with 400", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const res = await req("POST", "/admin/expenses", creds, { ...validExpense, amountCents: 0 });
      expect(res.statusCode).toBe(400);
    });

    it("rejects an unknown business unit with 400", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const res = await req("POST", "/admin/expenses", creds, { ...validExpense, businessUnit: "warehouse" });
      expect(res.statusCode).toBe(400);
    });

    it("404s updating an unknown expense", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const res = await req("PATCH", "/admin/expenses/00000000-0000-0000-0000-000000000000", creds, {
        amountCents: 1,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("audit on mutations", () => {
    it("writes expense.created / .updated / .deleted keyed to the session user", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const [actor] = await dbh.db
        .select()
        .from(users)
        .where(eq(users.phone, "+254712000005"));

      const created = await req("POST", "/admin/expenses", creds, validExpense);
      const id = created.json().expense.id as string;
      await req("PATCH", `/admin/expenses/${id}`, creds, { amountCents: 200_00 });
      await req("DELETE", `/admin/expenses/${id}`, creds);

      const rows = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.targetId, id));
      const actions = rows.map((r) => r.action).sort();
      expect(actions).toEqual(["expense.created", "expense.deleted", "expense.updated"]);
      for (const r of rows) {
        expect(r.actorUserId).toBe(actor!.id);
      }
    });
  });

  describe("recurring templates (AC3)", () => {
    it("creates, lists and deactivates a recurring template + audits", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const created = await req("POST", "/admin/expense-templates", creds, {
        category: "Salaries",
        businessUnit: null,
        amountCents: 5_000_00,
        paymentMethod: "bank_transfer",
        dayOfMonth: 1,
      });
      expect(created.statusCode).toBe(201);
      const id = created.json().template.id as string;
      expect(created.json().template.active).toBe(true);

      const listed = await req("GET", "/admin/expense-templates", creds);
      expect(listed.json().templates.map((t: { id: string }) => t.id)).toContain(id);

      const removed = await req("DELETE", `/admin/expense-templates/${id}`, creds);
      expect(removed.statusCode).toBe(200);
      const [tpl] = await dbh.db
        .select()
        .from(expenseRecurringTemplates)
        .where(eq(expenseRecurringTemplates.id, id));
      expect(tpl!.active).toBe(false); // soft-deactivate so materialised FKs survive

      const recurAudits = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.targetId, id));
      expect(recurAudits.map((r) => r.action).sort()).toEqual([
        "expense.recurring.created",
        "expense.recurring.deleted",
      ]);
    });

    it("rejects a day_of_month above 28 with 400", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const res = await req("POST", "/admin/expense-templates", creds, {
        category: "Rent",
        businessUnit: "salon",
        amountCents: 100,
        paymentMethod: "cash",
        dayOfMonth: 31,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("expensesByUnitInPeriod read model (AC4 — P&L)", () => {
    it("returns per-unit totals + shared overhead bucket within the period", async () => {
      const creds = await loginStaff("+254712000005", "7425");
      const mk = (businessUnit: string | null, amountCents: number, expenseDate = "2026-06-10") =>
        req("POST", "/admin/expenses", creds, {
          expenseDate,
          category: "C",
          businessUnit,
          amountCents,
          paymentMethod: "cash",
        });
      await mk("salon", 100);
      await mk("salon", 50);
      await mk("play", 200);
      await mk(null, 300); // shared overhead
      await mk("salon", 9999, "2026-07-05"); // out of range

      const res = await req("GET", "/admin/expenses/by-unit?fromDate=2026-06-01&toDate=2026-07-01", creds);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.perUnit.salon).toBe(150);
      expect(body.perUnit.play).toBe(200);
      expect(body.sharedOverheadCents).toBe(300);
      expect(body.totalCents).toBe(650);
    });

    it("403s a reception user on the read model", async () => {
      const creds = await loginStaff("+254712000003", "7423");
      const res = await req("GET", "/admin/expenses/by-unit?fromDate=2026-06-01&toDate=2026-07-01", creds);
      expect(res.statusCode).toBe(403);
    });
  });
});
