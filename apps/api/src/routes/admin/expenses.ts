import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import type { SessionStore } from "@bm/auth";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  createRecurringTemplate,
  updateRecurringTemplate,
  listRecurringTemplates,
  expensesByUnitInPeriod,
  ExpenseValidationError,
} from "@bm/catalog";
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseRecurringTemplateCreateSchema,
  expenseRecurringTemplateUpdateSchema,
  expensesListQuerySchema,
  type ExpenseDto,
  type ExpenseRecurringTemplateDto,
  type ExpensesByUnitDto,
  type ExpenseBusinessUnit,
} from "@bm/contracts";

export interface AdminExpensesDeps {
  db: Database;
  sessions: SessionStore;
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

type ExpenseRow = Awaited<ReturnType<typeof createExpense>>;
type TemplateRow = Awaited<ReturnType<typeof createRecurringTemplate>>;

function toExpenseDto(e: ExpenseRow): ExpenseDto {
  return {
    id: e.id,
    expenseDate: e.expenseDate,
    category: e.category,
    businessUnit: (e.businessUnit as ExpenseBusinessUnit | null) ?? null,
    amountCents: e.amountCents,
    paymentMethod: e.paymentMethod,
    reference: e.reference,
    receiptAttachmentUrl: e.receiptAttachmentUrl,
    recurringTemplateId: e.recurringTemplateId,
    createdAt: e.createdAt.toISOString(),
  };
}

function toTemplateDto(t: TemplateRow): ExpenseRecurringTemplateDto {
  return {
    id: t.id,
    category: t.category,
    businessUnit: (t.businessUnit as ExpenseBusinessUnit | null) ?? null,
    amountCents: t.amountCents,
    paymentMethod: t.paymentMethod,
    dayOfMonth: t.dayOfMonth,
    reference: t.reference,
    active: t.active,
    lastRunMonth: t.lastRunMonth,
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Admin/accountant Expenses CRUD (P6-E05-S05 / Story 35.5). The Expenses module is
 * the FOUNDATION the consolidated P&L (35.1) consumes. Gated on `manage expense`
 * — admin / accountant / super_admin (treasury, reception, … are 403). Every
 * mutation writes an audit row keyed to the SESSION user (never the client).
 *
 *   POST   /admin/expenses                       — create an expense (AC1/AC2)
 *   GET    /admin/expenses?fromDate&toDate&unit   — list a period (+ optional unit)
 *   PATCH  /admin/expenses/:id                    — update (AC2)
 *   DELETE /admin/expenses/:id                    — delete (AC2)
 *   GET    /admin/expenses/by-unit?fromDate&toDate — the P&L read model (AC4)
 *   POST   /admin/expense-templates               — create a recurring template (AC3)
 *   GET    /admin/expense-templates               — list templates (AC3)
 *   PATCH  /admin/expense-templates/:id           — update a template (AC2/AC3)
 *   DELETE /admin/expense-templates/:id           — delete a template (AC2/AC3)
 */
export function registerAdminExpenses(app: FastifyInstance, deps: AdminExpensesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = async (userId: string) => {
    const [u] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };

  async function authorize(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<PermissionPrincipal | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    if (!can(auth.user.role, "manage", "expense")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  /* ----------------------------------------------------------- expenses CRUD */

  app.post("/admin/expenses", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = expenseCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;

    let row: ExpenseRow;
    try {
      row = await createExpense(db, {
        expenseDate: data.expenseDate,
        category: data.category,
        businessUnit: data.businessUnit,
        amountCents: data.amountCents,
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        receiptAttachmentUrl: data.receiptAttachmentUrl,
        createdBy: actor.id,
      });
    } catch (err) {
      if (err instanceof ExpenseValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }

    await audit(db, {
      actor: actor.id,
      action: "expense.created",
      target: { table: "expenses", id: row.id },
      payload: {
        category: row.category,
        business_unit: row.businessUnit,
        amount_cents: row.amountCents,
        expense_date: row.expenseDate,
        ip: req.ip,
      },
    });

    return reply.code(201).send({ expense: toExpenseDto(row) });
  });

  app.get("/admin/expenses", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = expensesListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
    }
    const { fromDate, toDate, unit } = parsed.data;
    const rows = await listExpenses(db, { from: fromDate, to: toDate, ...(unit ? { unit } : {}) });
    return reply.code(200).send({ expenses: rows.map(toExpenseDto) });
  });

  app.get("/admin/expenses/by-unit", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = expensesListQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
    }
    const { fromDate, toDate } = parsed.data;
    const agg = await expensesByUnitInPeriod(db, fromDate, toDate);
    const dto: ExpensesByUnitDto = agg;
    return reply.code(200).send(dto);
  });

  app.patch("/admin/expenses/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = expenseUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };

    let row: ExpenseRow | null;
    try {
      row = await updateExpense(db, id, parsed.data);
    } catch (err) {
      if (err instanceof ExpenseValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }
    if (!row) return reply.code(404).send({ error: "Expense not found" });

    await audit(db, {
      actor: actor.id,
      action: "expense.updated",
      target: { table: "expenses", id },
      payload: { fields: Object.keys(parsed.data), ip: req.ip },
    });

    return reply.code(200).send({ expense: toExpenseDto(row) });
  });

  app.delete("/admin/expenses/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const { id } = req.params as { id: string };
    const removed = await deleteExpense(db, id);
    if (!removed) return reply.code(404).send({ error: "Expense not found" });

    await audit(db, {
      actor: actor.id,
      action: "expense.deleted",
      target: { table: "expenses", id },
      payload: { ip: req.ip },
    });

    return reply.code(200).send({ expense: { id, deleted: true } });
  });

  /* --------------------------------------------------- recurring templates */

  app.post("/admin/expense-templates", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = expenseRecurringTemplateCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const data = parsed.data;

    let row: TemplateRow;
    try {
      row = await createRecurringTemplate(db, {
        category: data.category,
        businessUnit: data.businessUnit,
        amountCents: data.amountCents,
        paymentMethod: data.paymentMethod,
        dayOfMonth: data.dayOfMonth,
        reference: data.reference,
        active: data.active,
        createdBy: actor.id,
      });
    } catch (err) {
      if (err instanceof ExpenseValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }

    await audit(db, {
      actor: actor.id,
      action: "expense.recurring.created",
      target: { table: "expense_recurring_templates", id: row.id },
      payload: {
        category: row.category,
        business_unit: row.businessUnit,
        amount_cents: row.amountCents,
        day_of_month: row.dayOfMonth,
        ip: req.ip,
      },
    });

    return reply.code(201).send({ template: toTemplateDto(row) });
  });

  app.get("/admin/expense-templates", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const rows = await listRecurringTemplates(db);
    return reply.code(200).send({ templates: rows.map(toTemplateDto) });
  });

  app.patch("/admin/expense-templates/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const parsed = expenseRecurringTemplateUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { id } = req.params as { id: string };

    let row: TemplateRow | null;
    try {
      row = await updateRecurringTemplate(db, id, parsed.data);
    } catch (err) {
      if (err instanceof ExpenseValidationError) {
        return reply.code(400).send({ error: err.message, field: err.field });
      }
      throw err;
    }
    if (!row) return reply.code(404).send({ error: "Template not found" });

    await audit(db, {
      actor: actor.id,
      action: "expense.recurring.updated",
      target: { table: "expense_recurring_templates", id },
      payload: { fields: Object.keys(parsed.data), ip: req.ip },
    });

    return reply.code(200).send({ template: toTemplateDto(row) });
  });

  app.delete("/admin/expense-templates/:id", async (req, reply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;

    const { id } = req.params as { id: string };
    const row = await updateRecurringTemplate(db, id, { active: false });
    if (!row) return reply.code(404).send({ error: "Template not found" });

    await audit(db, {
      actor: actor.id,
      action: "expense.recurring.deleted",
      target: { table: "expense_recurring_templates", id },
      payload: { ip: req.ip },
    });

    return reply.code(200).send({ template: { id, deactivated: true } });
  });
}
