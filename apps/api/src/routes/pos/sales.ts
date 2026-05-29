import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  audit,
  parents,
  posSales,
  products,
  users,
  wallets,
  type Database,
  type PosSaleLine,
  type PosSaleRow,
  type ProductRow,
  type Transaction,
} from "@bm/db";
import {
  validateSession,
  requirePermission,
  CSRF_HEADER_NAME,
  normalizePhone,
} from "@bm/auth";
import {
  computeSaleTotals,
  posSaleRequestSchema,
  POS_RECEIPT_SERIES,
  type PosSaleMethod,
  type PosSaleResponse,
  type SaleLineInput,
} from "@bm/contracts";
import { writeReceipt, createMpesaAdapter, createPaystackAdapter } from "@bm/payments";
import { balance, post } from "@bm/wallet";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { PosDeps } from "./index.js";

/** Thrown inside the settle tx when a line can't be decremented (stock race). */
class InsufficientStockError extends Error {
  constructor(readonly productId: string) {
    super("Insufficient stock");
    this.name = "InsufficientStockError";
  }
}
/** Thrown inside the wallet settle tx when the balance is short (re-checked in-tx). */
class InsufficientFundsError extends Error {
  constructor(readonly balanceCents: number) {
    super("Insufficient wallet balance");
    this.name = "InsufficientFundsError";
  }
}

function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

function csrfHeaderOf(req: FastifyRequest): string | null {
  const raw = req.headers[CSRF_HEADER_NAME];
  return (Array.isArray(raw) ? raw[0] : raw) ?? null;
}

/** The cents → whole-KES amount M-Pesa STK requires (totals are guarded whole-shilling). */
function toAmountKes(totalCents: number): number {
  return Math.round(totalCents / 100);
}

function toResponse(sale: PosSaleRow, extra: Partial<PosSaleResponse> = {}): PosSaleResponse {
  return {
    saleId: sale.id,
    status: sale.status as PosSaleResponse["status"],
    method: sale.method as PosSaleMethod,
    totalCents: sale.totalCents,
    ...(sale.failureReason ? { failureReason: sale.failureReason } : {}),
    ...extra,
  };
}

/**
 * Settle a pending sale (AC6): atomically CLAIM it (status pending→paid) so a
 * concurrent/double confirm can't settle twice, then write the receipt and
 * decrement stock with a guarded `WHERE stock_qty >= qty` (rolls the whole tx
 * back via {@link InsufficientStockError} rather than going negative), link the
 * receipt, and audit. Runs in the caller's transaction. Returns the receipt
 * number, or null if the sale was already settled (idempotent no-op).
 */
async function settleSale(tx: Transaction, sale: PosSaleRow): Promise<string | null> {
  const claimed = await tx
    .update(posSales)
    .set({ status: "paid", updatedAt: new Date() })
    .where(and(eq(posSales.id, sale.id), eq(posSales.status, "pending")))
    .returning({ id: posSales.id });
  if (claimed.length === 0) return null; // already settled — do nothing

  const receipt = await writeReceipt(tx, {
    series: POS_RECEIPT_SERIES,
    paymentMethod: sale.method,
    postedBy: sale.cashierUserId,
    // `parentAccountId` is the customer parent (FK → parents); `parentId` on a
    // receipt is the reversal self-pointer, so it stays null for a normal sale.
    parentAccountId: sale.parentId,
    lines: sale.lines.map((l) => ({
      productId: l.productId,
      quantity: l.qty,
      unitPrice: l.unitPriceCents,
      lineTax: l.lineTaxCents,
      lineTotal: l.lineTotalCents,
    })),
  });

  // Guarded decrement: never oversell / go negative. A losing race rolls back.
  for (const line of sale.lines) {
    const dec = await tx
      .update(products)
      .set({ stockQty: sql`${products.stockQty} - ${line.qty}`, updatedAt: new Date() })
      .where(and(eq(products.id, line.productId), sql`${products.stockQty} >= ${line.qty}`))
      .returning({ id: products.id });
    if (dec.length === 0) throw new InsufficientStockError(line.productId);
  }

  await tx.update(posSales).set({ receiptId: receipt.id, updatedAt: new Date() }).where(eq(posSales.id, sale.id));

  await audit(tx, {
    actor: sale.cashierUserId,
    action: "pos.sale.paid",
    target: { table: "pos_sales", id: sale.id },
    payload: { method: sale.method, total_cents: sale.totalCents, receipt_id: receipt.id },
  });

  return receipt.displayNumber;
}

/** Send the receipt SMS copy (best-effort; transactional, no consent gate needed). */
async function sendReceiptSms(
  db: Database,
  deps: PosDeps,
  phone: string,
  receiptNumber: string,
  totalCents: number,
): Promise<void> {
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const body = `Receipt ${receiptNumber}: KES ${(totalCents / 100).toFixed(2)} paid. Thank you — Baby Milestones.`;
  await sender.send({ to: phone, template: "raw", data: { body } }).catch(() => {});
}

export function registerPosSales(app: FastifyInstance, deps: PosDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("create", "payment");
  const mpesaAdapter = deps.mpesa
    ? createMpesaAdapter({ config: deps.mpesa.config, transport: deps.mpesa.transport, now: deps.mpesa.now })
    : null;
  const paystackAdapter = deps.paystack
    ? createPaystackAdapter({ config: deps.paystack.config, transport: deps.paystack.transport })
    : null;

  async function authorize(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return null;
    }
    return auth.user.id;
  }

  // POST /pos/sales — create a sale and (cash/wallet) settle it synchronously.
  app.post("/pos/sales", async (req: FastifyRequest, reply: FastifyReply) => {
    const cashierId = await authorize(req, reply);
    if (!cashierId) return reply;

    const parsed = posSaleRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid sale", field: first?.path.join(".") });
    }
    const body = parsed.data;

    // Idempotent replay: a repeated create with the same key returns the prior sale.
    if (body.idempotencyKey) {
      const [existing] = await db.select().from(posSales).where(eq(posSales.idempotencyKey, body.idempotencyKey));
      if (existing) return reply.code(200).send(toResponse(existing));
    }

    const ids = body.lines.map((l) => l.productId);
    if (new Set(ids).size !== ids.length) {
      return reply.code(400).send({ error: "Each product may appear once; set its quantity instead" });
    }

    // Load the products (active only) and validate them + stock authoritatively.
    const rows = await db.select().from(products).where(inArray(products.id, ids));
    const byId = new Map<string, ProductRow>(rows.map((r) => [r.id, r]));
    const missing = ids.filter((id) => !byId.get(id)?.isActive);
    if (missing.length > 0) {
      return reply.code(400).send({ error: "Unknown or inactive product in sale", productIds: missing });
    }
    const violations = body.lines
      .filter((l) => l.qty > byId.get(l.productId)!.stockQty)
      .map((l) => ({
        productId: l.productId,
        name: byId.get(l.productId)!.name,
        requested: l.qty,
        available: byId.get(l.productId)!.stockQty,
      }));
    if (violations.length > 0) {
      return reply.code(409).send({ error: "Insufficient stock", violations });
    }

    // Authoritative totals from DB prices (never trust client prices).
    const saleInputs: SaleLineInput[] = body.lines.map((l) => ({
      priceCents: byId.get(l.productId)!.priceCents,
      qty: l.qty,
      lineDiscountPct: l.lineDiscountPct,
      taxTreatment: byId.get(l.productId)!.taxTreatment ?? "vat_exempt",
    }));
    const totals = computeSaleTotals(saleInputs, body.overallDiscount);
    const total = totals.grandTotalCents;
    const saleLines: PosSaleLine[] = body.lines.map((l, i) => ({
      productId: l.productId,
      name: byId.get(l.productId)!.name,
      qty: l.qty,
      unitPriceCents: byId.get(l.productId)!.priceCents,
      lineDiscountPct: l.lineDiscountPct,
      lineTaxCents: totals.lines[i]!.taxCents,
      lineTotalCents: totals.lines[i]!.grossCents,
    }));

    const normalizedPhone = body.customerPhone ? normalizePhone(body.customerPhone) : null;
    const baseInsert = {
      cashierUserId: cashierId,
      method: body.method,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountTotalCents,
      taxCents: totals.taxTotalCents,
      totalCents: total,
      lines: saleLines,
      customerPhone: normalizedPhone,
      idempotencyKey: body.idempotencyKey ?? null,
    };

    // ---- Cash: settle now, compute change + drawer message (AC2). ----
    if (body.method === "cash") {
      if (body.cashTenderedCents == null || body.cashTenderedCents < total) {
        return reply.code(400).send({ error: "Cash tendered is less than the total due" });
      }
      const change = body.cashTenderedCents - total;
      try {
        const result = await db.transaction(async (tx) => {
          const [s] = await tx.insert(posSales).values(baseInsert).returning();
          const receiptNumber = await settleSale(tx, s!);
          return { sale: s!, receiptNumber: receiptNumber! };
        });
        if (normalizedPhone) await sendReceiptSms(db, deps, normalizedPhone, result.receiptNumber, total);
        return reply.code(200).send(
          toResponse({ ...result.sale, status: "paid" }, {
            changeCents: change,
            drawerMessage: change > 0 ? `Open drawer — give change KES ${(change / 100).toFixed(2)}.` : "Open drawer — exact cash.",
            receiptNumber: result.receiptNumber,
          }),
        );
      } catch (e) {
        if (e instanceof InsufficientStockError) return reply.code(409).send({ error: "Stock changed during the sale; please retry" });
        throw e;
      }
    }

    // ---- Wallet: parent phone lookup + in-tx balance recheck + debit (AC5). ----
    if (body.method === "wallet") {
      if (!normalizedPhone) return reply.code(400).send({ error: "Customer phone is required for a wallet payment" });
      const [parent] = await db
        .select({ parentId: parents.id, walletId: wallets.id })
        .from(users)
        .innerJoin(parents, eq(parents.userId, users.id))
        .innerJoin(wallets, eq(wallets.userId, users.id))
        .where(eq(users.phone, normalizedPhone))
        .limit(1);
      if (!parent) return reply.code(404).send({ error: "No parent wallet found for that phone" });

      try {
        const result = await db.transaction(async (tx) => {
          const bal = await balance(tx, parent.walletId);
          if (bal < total) throw new InsufficientFundsError(bal);
          const [s] = await tx.insert(posSales).values({ ...baseInsert, parentId: parent.parentId }).returning();
          await post(tx, {
            walletId: parent.walletId,
            amount: -total,
            kind: "debit",
            idempotencyKey: `pos:${s!.id}`,
            source: "pos:wallet",
            postedBy: cashierId,
          });
          const receiptNumber = await settleSale(tx, s!);
          return { sale: s!, receiptNumber: receiptNumber! };
        });
        if (normalizedPhone) await sendReceiptSms(db, deps, normalizedPhone, result.receiptNumber, total);
        return reply.code(200).send(toResponse({ ...result.sale, status: "paid" }, { receiptNumber: result.receiptNumber }));
      } catch (e) {
        if (e instanceof InsufficientFundsError) {
          const [s] = await db
            .insert(posSales)
            .values({ ...baseInsert, parentId: parent.parentId, status: "failed", failureReason: "Insufficient wallet balance" })
            .returning();
          await audit(db, {
            actor: cashierId,
            action: "pos.sale.failed",
            target: { table: "pos_sales", id: s!.id },
            payload: { method: "wallet", reason: "insufficient_balance", balance_cents: e.balanceCents, total_cents: total },
          });
          return reply.code(200).send(toResponse(s!));
        }
        if (e instanceof InsufficientStockError) return reply.code(409).send({ error: "Stock changed during the sale; please retry" });
        throw e;
      }
    }

    // ---- M-Pesa STK: push to the customer phone, leave pending (AC3). ----
    if (body.method === "mpesa") {
      if (!mpesaAdapter) return reply.code(503).send({ error: "M-Pesa is not configured" });
      if (!normalizedPhone) return reply.code(400).send({ error: "Customer phone is required for M-Pesa" });
      if (total % 100 !== 0) {
        return reply.code(400).send({ error: "M-Pesa can only charge whole shillings — adjust the total" });
      }
      const [sale] = await db.insert(posSales).values(baseInsert).returning();
      const charge = await mpesaAdapter.stkPush({
        amountKes: toAmountKes(total),
        phone: normalizedPhone,
        accountRef: sale!.id,
        description: `POS sale ${sale!.id}`,
      });
      if (charge.status !== "pending" || !charge.checkoutRequestId) {
        return reply.code(200).send(await failSale(db, sale!, cashierId, "mpesa", charge.failureReason ?? "STK push failed"));
      }
      await db.update(posSales).set({ paymentRef: charge.checkoutRequestId, updatedAt: new Date() }).where(eq(posSales.id, sale!.id));
      await audit(db, {
        actor: cashierId,
        action: "pos.sale.initiated",
        target: { table: "pos_sales", id: sale!.id },
        payload: { method: "mpesa", checkout_request_id: charge.checkoutRequestId, total_cents: total },
      });
      return reply.code(200).send(toResponse(sale!, { checkoutRequestId: charge.checkoutRequestId }));
    }

    // ---- Paystack: open a hosted checkout, leave pending (AC4). ----
    if (body.method === "paystack") {
      if (!paystackAdapter) return reply.code(503).send({ error: "Paystack is not configured" });
      const [sale] = await db.insert(posSales).values(baseInsert).returning();
      const digits = normalizedPhone ? normalizedPhone.replace(/\D/gu, "") : "walkin";
      const charge = await paystackAdapter.init({ email: `pos.${digits}@babymilestones.co.ke`, amount: total, reference: sale!.id });
      if (charge.status !== "pending") {
        return reply.code(200).send(await failSale(db, sale!, cashierId, "paystack", charge.failureReason ?? "Checkout init failed"));
      }
      await db.update(posSales).set({ paymentRef: charge.reference, updatedAt: new Date() }).where(eq(posSales.id, sale!.id));
      await audit(db, {
        actor: cashierId,
        action: "pos.sale.initiated",
        target: { table: "pos_sales", id: sale!.id },
        payload: { method: "paystack", reference: charge.reference, total_cents: total },
      });
      return reply.code(200).send(toResponse(sale!, { authorizationUrl: charge.authorizationUrl }));
    }

    return reply.code(400).send({ error: "Unsupported payment method" });
  });

  // POST /pos/sales/:id/confirm — poll M-Pesa / verify Paystack and settle (AC3/AC4).
  app.post("/pos/sales/:id/confirm", async (req: FastifyRequest, reply: FastifyReply) => {
    const cashierId = await authorize(req, reply);
    if (!cashierId) return reply;
    const { id } = req.params as { id: string };
    const [sale] = await db.select().from(posSales).where(eq(posSales.id, id));
    if (!sale) return reply.code(404).send({ error: "Sale not found" });
    if (sale.status !== "pending") return reply.code(200).send(toResponse(sale)); // idempotent
    if (!sale.paymentRef) return reply.code(409).send({ error: "Sale has no payment to confirm" });

    /** Settle a confirmed pending sale; returns the wire response. */
    const settleAndRespond = async (): Promise<PosSaleResponse> => {
      const receiptNumber = await db.transaction((tx) => settleSale(tx, sale));
      if (receiptNumber === null) {
        const [fresh] = await db.select().from(posSales).where(eq(posSales.id, sale.id));
        return toResponse(fresh!); // a concurrent confirm already settled it
      }
      if (sale.customerPhone) await sendReceiptSms(db, deps, sale.customerPhone, receiptNumber, sale.totalCents);
      return toResponse({ ...sale, status: "paid" }, { receiptNumber });
    };

    if (sale.method === "mpesa") {
      if (!mpesaAdapter) return reply.code(503).send({ error: "M-Pesa is not configured" });
      const result = await mpesaAdapter.stkQuery({ checkoutRequestId: sale.paymentRef });
      if (result.status === "success") {
        try {
          return reply.code(200).send(await settleAndRespond());
        } catch (e) {
          if (e instanceof InsufficientStockError) return reply.code(409).send({ error: "Stock changed; cannot complete the sale" });
          throw e;
        }
      }
      if (result.status === "failed") {
        return reply.code(200).send(await failSale(db, sale, cashierId, "mpesa", result.resultDesc ?? "Payment failed"));
      }
      return reply.code(200).send(toResponse(sale)); // still pending
    }

    if (sale.method === "paystack") {
      if (!paystackAdapter) return reply.code(503).send({ error: "Paystack is not configured" });
      const result = await paystackAdapter.verify({ reference: sale.paymentRef });
      if (result.status === "success") {
        // Settle only when the verified amount matches the recorded total.
        if (result.amount != null && result.amount !== sale.totalCents) {
          return reply.code(200).send(await failSale(db, sale, cashierId, "paystack", "Paid amount did not match the sale total"));
        }
        try {
          return reply.code(200).send(await settleAndRespond());
        } catch (e) {
          if (e instanceof InsufficientStockError) return reply.code(409).send({ error: "Stock changed; cannot complete the sale" });
          throw e;
        }
      }
      if (result.status === "failed") {
        return reply.code(200).send(await failSale(db, sale, cashierId, "paystack", "Payment failed"));
      }
      return reply.code(200).send(toResponse(sale));
    }

    return reply.code(409).send({ error: "This sale settles synchronously; nothing to confirm" });
  });

  // GET /pos/sales/:id — status snapshot for the live panel (read-only).
  app.get("/pos/sales/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const cashierId = await authorize(req, reply);
    if (!cashierId) return reply;
    const { id } = req.params as { id: string };
    const [sale] = await db.select().from(posSales).where(eq(posSales.id, id));
    if (!sale) return reply.code(404).send({ error: "Sale not found" });
    return reply.code(200).send(toResponse(sale));
  });
}

/** Mark a pending sale failed + audit; returns the wire response (AC7). */
async function failSale(
  db: Database,
  sale: PosSaleRow,
  cashierId: string,
  method: string,
  reason: string,
): Promise<PosSaleResponse> {
  await db
    .update(posSales)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(eq(posSales.id, sale.id));
  await audit(db, {
    actor: cashierId,
    action: "pos.sale.failed",
    target: { table: "pos_sales", id: sale.id },
    payload: { method, reason },
  });
  return toResponse({ ...sale, status: "failed", failureReason: reason });
}
