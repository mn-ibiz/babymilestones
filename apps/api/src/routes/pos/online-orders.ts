import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { users, type Database } from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { listOnlineOrders } from "@bm/woocommerce";
import type { OnlineOrdersResponse } from "@bm/contracts";
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

/**
 * POS "Online orders" read (Story 29.1 / P4-E04-S01). ONE read-only endpoint:
 *
 *  - GET /pos/online-orders — every mirrored WooCommerce order shaped into a card
 *    (items + qty, customer name, phone LAST 4 ONLY, delivery method, payment
 *    status, source Woo id + last-synced), New-first (AC2). Read STRICTLY from the
 *    local `wc_orders` mirror (AC5) — `listOnlineOrders` has no Woo client, so the
 *    render path cannot call Woo. The POS UI applies the chip filter client-side.
 *
 * Guarded by `read product`, held by the till roles (reception, cashier, packer).
 * Read-only — no audit, no SMS, no CSRF (GET).
 */
export function registerPosOnlineOrders(app: FastifyInstance, { db, sessions }: PosDeps): void {
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

  app.get("/pos/online-orders", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await authorize(req, reply))) return reply;
    const orders = await listOnlineOrders(db);
    const body: OnlineOrdersResponse = { orders };
    return reply.code(200).send(body);
  });
}
