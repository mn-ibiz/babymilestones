import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME, type PermissionPrincipal } from "@bm/auth";
import {
  listSkuMappings,
  updateSkuMapping,
  applySkuMappingCsv,
  getLatestReconciliation,
} from "@bm/woocommerce";
import { skuMappingUpdateSchema } from "@bm/contracts";
import type { SessionStore } from "@bm/auth";

export interface AdminWooCommerceStockDeps {
  db: Database;
  sessions: SessionStore;
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

/**
 * Admin WooCommerce stock surface (Story 29.5 / P4-E04-S05). Under the catalogue,
 * reserved to `manage config` (admin / super_admin), enforced server-side:
 *
 *   GET  /admin/woocommerce-stock/sku-mappings          — list each product + woo_product_id (AC5)
 *   PATCH /admin/woocommerce-stock/sku-mappings/:id      — manual-entry mapping edit (AC5)
 *   POST /admin/woocommerce-stock/sku-mappings/import    — bulk CSV import (AC5)
 *   GET  /admin/woocommerce-stock/reconciliation         — newest nightly drift report (AC6)
 *
 * Reads are not audited; the mapping edit + CSV import are audited mutations.
 */
export function registerAdminWooCommerceStock(
  app: FastifyInstance,
  deps: AdminWooCommerceStockDeps,
): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);

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
    if (!can(auth.user.role, "manage", "config")) {
      reply.code(403).send({ error: "Forbidden: missing permission" });
      return null;
    }
    return auth.user;
  }

  // AC5: list each local product with its Woo mapping (read-only).
  app.get("/admin/woocommerce-stock/sku-mappings", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const rows = await listSkuMappings(db);
    return reply.code(200).send({ mappings: rows });
  });

  // AC5: manual-entry mapping edit (set or clear a single product's woo_product_id).
  app.patch(
    "/admin/woocommerce-stock/sku-mappings/:id",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const { id } = req.params as { id: string };
      const parsed = skuMappingUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid mapping" });
      }
      const updated = await updateSkuMapping(db, { productId: id, wooProductId: parsed.data.wooProductId });
      if (!updated) return reply.code(404).send({ error: "Product not found" });
      await audit(db, {
        actor: actor.id,
        action: "woocommerce.sku_mapping.updated",
        target: { table: "products", id },
        payload: { woo_product_id: parsed.data.wooProductId, mode: "manual", ip: req.ip },
      });
      return reply.code(200).send({ id, wooProductId: updated.wooProductId });
    },
  );

  // AC5: bulk CSV import (parse + apply + report errors).
  app.post(
    "/admin/woocommerce-stock/sku-mappings/import",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const actor = await authorize(req, reply);
      if (!actor) return reply;
      const body = req.body as { csv?: unknown } | undefined;
      const csv = typeof body?.csv === "string" ? body.csv : null;
      if (csv === null) return reply.code(400).send({ error: "Expected a `csv` string body" });

      const result = await applySkuMappingCsv(db, csv);
      await audit(db, {
        actor: actor.id,
        action: "woocommerce.sku_mapping.updated",
        target: { table: "products", id: null },
        payload: { mode: "csv_import", applied: result.applied, errors: result.errors.length, ip: req.ip },
      });
      return reply.code(200).send(result);
    },
  );

  // AC6: the newest nightly reconciliation drift report (read-only).
  app.get("/admin/woocommerce-stock/reconciliation", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await authorize(req, reply);
    if (!actor) return reply;
    const report = await getLatestReconciliation(db);
    return reply.code(200).send({ report });
  });
}
