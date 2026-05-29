import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database, type ProductRow } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { findProductByCode, searchProductsByName } from "@bm/catalog";
import {
  posProductLookupQuerySchema,
  posProductSearchQuerySchema,
  type PosProduct,
} from "@bm/contracts";
import type { PosDeps } from "./index.js";

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

/** Shape a product row into the POS wire DTO (adds the derived `inStock` flag). */
function toPosProduct(row: ProductRow): PosProduct {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    priceCents: row.priceCents,
    stockQty: row.stockQty,
    inStock: row.stockQty > 0,
    taxTreatment: row.taxTreatment ?? "vat_exempt",
  };
}

/**
 * POS product catalogue read (P2-E04-S02). Two read-only endpoints for the till:
 *
 *  - GET /pos/products/lookup?code=… — exact SKU OR barcode match (AC1, the
 *    scanner / keyed-code path). Returns `{ product }` (null when no active
 *    product matches) so the client can show a clear "no match" without a 404.
 *  - GET /pos/products/search?q=… — case-insensitive name substring (AC2),
 *    out-of-stock products included so the UI can grey them (AC3).
 *
 * Guarded by `read product`, held by the till roles (reception, cashier, packer).
 * Read-only — no audit, no SMS, no CSRF (GET).
 */
export function registerPosProducts(app: FastifyInstance, { db, sessions }: PosDeps): void {
  const resolveUser = makeResolveUser(db);
  const guard = requirePermission("read", "product");

  async function authorize(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const auth = await validateSession(
      {
        method: req.method,
        cookieHeader: req.headers.cookie ?? null,
        csrfHeader: csrfHeaderOf(req),
      },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return false;
    }
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return false;
    }
    return true;
  }

  app.get("/pos/products/lookup", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authorize(req, reply))) return reply;
    const query = (req.query ?? {}) as Record<string, unknown>;
    const parsed = posProductLookupQuerySchema.safeParse({ code: query.code ?? "" });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid code", field: first?.path[0] });
    }
    const row = await findProductByCode(db, parsed.data.code);
    return reply.code(200).send({ product: row ? toPosProduct(row) : null });
  });

  app.get("/pos/products/search", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authorize(req, reply))) return reply;
    const query = (req.query ?? {}) as Record<string, unknown>;
    const parsed = posProductSearchQuerySchema.safeParse({ q: query.q ?? "" });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid query", field: first?.path[0] });
    }
    const rows = await searchProductsByName(db, parsed.data.q);
    return reply.code(200).send({ products: rows.map(toPosProduct) });
  });
}
