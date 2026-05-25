import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  audit,
  parents,
  receiptLines,
  receipts,
  services,
  users,
  type Database,
} from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { formatReceiptNumber } from "@bm/payments";
import { StubSmsSender } from "@bm/sms";
import {
  receiptContentType,
  renderReceipt,
  toReceiptDocument,
  type ReceiptDocumentLine,
} from "@bm/ui";
import type { ReceiptsDeps } from "./index.js";

/** Resolve a session userId to its live id+role (for the permission guard). */
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

/** Everything a reprint needs: render inputs PLUS the unmasked phone for re-SMS. */
interface LoadedReceipt {
  displayNumber: string;
  paymentMethod: string;
  total: number;
  taxTotal: number;
  createdAt: Date;
  customerName: string | null;
  /** Raw (unmasked) phone — needed to actually re-send the SMS, never rendered. */
  customerPhone: string | null;
  lines: ReceiptDocumentLine[];
}

/**
 * Load a persisted receipt verbatim (P1-E08-S01 schema, S02 writer). Reads the
 * stored header + lines as-is — never recomputes totals, never re-allocates a
 * sequence (AC3 immutability). Returns null when the id is unknown.
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
      quantity: receiptLines.quantity,
      unitPrice: receiptLines.unitPrice,
      lineTax: receiptLines.lineTax,
      lineTotal: receiptLines.lineTotal,
    })
    .from(receiptLines)
    .leftJoin(services, eq(receiptLines.serviceId, services.id))
    .where(eq(receiptLines.receiptId, header.id));

  const lines: ReceiptDocumentLine[] = lineRows.map((l) => ({
    description: l.serviceName ?? (l.serviceId ? "Service" : "Item"),
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
 * Receipt reprint / re-send (P1-E08-S04).
 *
 * POST /receipts/:id/reprint — re-issue an *existing* receipt. The body is
 * re-rendered from the persisted immutable record (Story 8.2/8.3) so output is
 * **byte-identical** to the original render of the same format — no new receipt
 * row, no new sequence (AC3). Optionally re-SMS the receipt to the customer
 * (`{ resend: true }`) via `@bm/sms` (stub writes `sms_outbox`). Every reprint
 * is audited as `receipt.reprinted` (actor + receipt id, AC2). Staff-only:
 * guarded to `read receipt`; mutating verb requires the CSRF double-submit
 * token. Returns the re-rendered body (thermal text by default; `format=a4`
 * HTML), matching the S03 render route byte-for-byte.
 */
export function registerReceiptReprint(app: FastifyInstance, deps: ReceiptsDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("read", "receipt");

  app.post("/receipts/:id/reprint", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const perm = guard(auth.user);
    if (!perm.ok) return reply.code(perm.status).send({ error: perm.error });

    const body = (req.body ?? {}) as { resend?: unknown; format?: unknown };
    const format = body.format == null || body.format === "" ? "a4" : body.format;
    if (format !== "a4" && format !== "thermal") {
      return reply.code(400).send({ error: "format must be 'a4' or 'thermal'" });
    }
    const resend = body.resend === true;

    const { id } = req.params as { id: string };
    const found = await loadReceipt(db, id);
    if (!found) return reply.code(404).send({ error: "Receipt not found" });

    // AC3: re-render the persisted record verbatim — identical to the original.
    const document = toReceiptDocument(found, {
      customerName: found.customerName,
      customerPhone: found.customerPhone,
    });
    const rendered = renderReceipt(document, format);

    let smsResent = false;
    await db.transaction(async (tx) => {
      // Optional re-SMS: a transactional receipt copy (never marketing-gated —
      // it is the parent's own receipt). The thermal text is the SMS body so the
      // customer gets the same content they would have received originally.
      if (resend && found.customerPhone) {
        await new StubSmsSender(tx).send({
          to: found.customerPhone,
          template: "receipt.reprint",
          data: { body: renderReceipt(document, "thermal") },
        });
        smsResent = true;
      }
      // AC2: audit every reprint with who + which receipt.
      await audit(tx, {
        actor: auth.user.id,
        action: "receipt.reprinted",
        target: { table: "receipts", id },
        payload: {
          staff_user_id: auth.user.id,
          format,
          resend: smsResent,
          ip: req.ip,
          user_agent: req.headers["user-agent"] ?? null,
        },
      });
    });

    return reply
      .code(200)
      .header("content-type", receiptContentType(format))
      .header("x-receipt-resent", smsResent ? "true" : "false")
      .send(rendered);
  });
}
