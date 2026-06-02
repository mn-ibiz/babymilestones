import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  parents,
  receiptLines,
  receipts,
  services,
  users,
  type Database,
} from "@bm/db";
import { validateSession, requirePermission } from "@bm/auth";
import { formatReceiptNumber } from "@bm/payments";
import {
  receiptContentType,
  receiptLineDescription,
  renderReceipt,
  toReceiptDocument,
  type ReceiptDocumentLine,
  type ReceiptFormat,
} from "@bm/ui";
import type { ReceiptsDeps } from "./index.js";

/** Resolve a session userId to its live id+role (for the permission guard). */
function makeResolveUser(db: Database) {
  return async (userId: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ? { id: u.id, role: u.role } : null;
  };
}

/** Parse the `format` query into a supported {@link ReceiptFormat}; default `a4`. */
function parseFormat(raw: unknown): ReceiptFormat | null {
  if (raw == null || raw === "") return "a4";
  if (raw === "a4" || raw === "thermal") return raw;
  return null;
}

/** Everything the render needs: header, customer identity, and named lines. */
interface LoadedReceipt {
  displayNumber: string;
  paymentMethod: string;
  total: number;
  taxTotal: number;
  createdAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  lines: ReceiptDocumentLine[];
}

/**
 * Load a persisted receipt (P1-E08-S01 schema, written by the S02 writer) by id,
 * resolving the display sequence, the customer name/phone (via the parent
 * account), and per-line descriptions (service name when present). Returns null
 * when the receipt id is unknown.
 */
async function loadReceipt(db: Database, receiptId: string): Promise<LoadedReceipt | null> {
  const [header] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
  if (!header) return null;

  let customerName: string | null = null;
  let customerPhone: string | null = null;
  if (header.parentAccountId) {
    const [p] = await db
      .select({
        firstName: parents.firstName,
        lastName: parents.lastName,
        phone: users.phone,
      })
      .from(parents)
      .innerJoin(users, eq(parents.userId, users.id))
      .where(eq(parents.id, header.parentAccountId));
    if (p) {
      customerName = `${p.firstName} ${p.lastName}`.trim();
      customerPhone = p.phone;
    }
  }

  const lineRows = await db
    .select({
      serviceId: receiptLines.serviceId,
      serviceName: services.name,
      // P5-E01-S05: the discreet-billing facts drive the display label (AC1).
      discreetBillingEnabled: services.discreetBillingEnabled,
      discreetBillingLabel: services.discreetBillingLabel,
      quantity: receiptLines.quantity,
      unitPrice: receiptLines.unitPrice,
      lineTax: receiptLines.lineTax,
      lineTotal: receiptLines.lineTotal,
    })
    .from(receiptLines)
    .leftJoin(services, eq(receiptLines.serviceId, services.id))
    .where(eq(receiptLines.receiptId, header.id));

  const lines: ReceiptDocumentLine[] = lineRows.map((l) => ({
    // Discreet coaching services render a neutral label instead of the real,
    // sensitive name (P5-E01-S05 AC1) — amounts are unchanged.
    description: receiptLineDescription({
      serviceId: l.serviceId,
      serviceName: l.serviceName,
      discreetBillingEnabled: l.discreetBillingEnabled ?? false,
      discreetBillingLabel: l.discreetBillingLabel ?? null,
    }),
    quantity: l.quantity,
    unitPrice: Number(l.unitPrice),
    lineTax: Number(l.lineTax),
    lineTotal: Number(l.lineTotal),
  }));

  return {
    displayNumber: formatReceiptNumber(header.series, header.sequenceNumber),
    paymentMethod: header.paymentMethod,
    total: Number(header.total),
    taxTotal: Number(header.taxTotal),
    createdAt: header.createdAt,
    customerName,
    customerPhone,
    lines,
  };
}

/**
 * Receipt render route (P1-E08-S03).
 *
 * GET /receipts/:id?format=a4|thermal — render a persisted receipt server-side
 * (AC1). `a4` returns a branded, self-contained printable HTML document
 * (Decision 13: the browser prints it); `thermal` returns 80mm fixed-width plain
 * text. The body carries business details, the display sequence number, date,
 * line items, totals, payment method, and the customer phone **masked to the
 * last 4 digits** (AC3) — the full number is never emitted. Staff-only: guarded
 * to `read wallet` (read-only, no mutation, no CSRF).
 */
export function registerReceiptRender(app: FastifyInstance, deps: ReceiptsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const readGuard = requirePermission("read", "wallet");

  app.get("/receipts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: null,
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = readGuard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const format = parseFormat((req.query as { format?: unknown }).format);
    if (!format) {
      return reply.code(400).send({ error: "format must be 'a4' or 'thermal'" });
    }

    const { id } = req.params as { id: string };
    const found = await loadReceipt(db, id);
    if (!found) return reply.code(404).send({ error: "Receipt not found" });

    const document = toReceiptDocument(found, {
      customerName: found.customerName,
      customerPhone: found.customerPhone,
    });
    const body = renderReceipt(document, format);
    return reply
      .code(200)
      .header("content-type", receiptContentType(format))
      .send(body);
  });
}
