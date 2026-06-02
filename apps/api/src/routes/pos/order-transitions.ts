import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { audit, users, type Database } from "@bm/db";
import { validateSession, can, CSRF_HEADER_NAME } from "@bm/auth";
import { applyOrderTransition } from "@bm/woocommerce";
import {
  actionTargetStatus,
  canReverseTransition,
  orderTransitionRequestSchema,
  type DispatchDetail,
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

/**
 * POS order-status transition (Story 29.2 / P4-E04-S02).
 *
 *   POST /pos/online-orders/:wooOrderId/transition  { action, dispatch? }
 *
 * The action is one of the five action-sheet keys (AC1). The base gate is the
 * till role (`read product`, same as the Online-orders queue read); the write
 * path itself enforces the state machine + the admin-only reversal rule (AC4) —
 * a reversal attempt by a POS staffer returns 403. Forward + cancel are 200.
 * Each successful transition writes an order_events row + enqueues a Woo writeback
 * (AC2) and is AUDITED (a reversal under a distinct action). Woo is never called
 * synchronously, and no SMS is triggered for online orders (Woo owns those).
 */
export function registerPosOrderTransitions(app: FastifyInstance, { db, sessions, now }: PosDeps): void {
  const resolveUser = makeResolveUser(db);
  const clock = now ?? (() => new Date());

  /**
   * The base gate: a till-role staffer (holds `read product`, like the queue
   * read) OR an admin (who reverses — AC4). The finer rules (the state machine +
   * the admin-only reversal) are enforced by the write path, so a till staffer
   * who attempts a reversal still gets a 403 from `applyOrderTransition`.
   */
  function mayTransition(role: string): boolean {
    return can(role, "read", "product") || canReverseTransition(role);
  }

  app.post(
    "/pos/online-orders/:wooOrderId/transition",
    async (req: FastifyRequest, reply: FastifyReply) => {
      // Authn + CSRF (POST) + the base till-role gate.
      const authn = await validateSession(
        {
          method: req.method,
          cookieHeader: req.headers.cookie ?? null,
          csrfHeader: csrfHeaderOf(req),
        },
        { sessions, resolveUser },
      );
      if (!authn.ok) {
        reply.code(authn.status).send({ error: authn.error });
        return reply;
      }
      if (!mayTransition(authn.user.role)) {
        reply.code(403).send({ error: "Forbidden: missing permission" });
        return reply;
      }

      // Parse the route param + body.
      const { wooOrderId: rawId } = req.params as { wooOrderId: string };
      const wooOrderId = Number(rawId);
      if (!Number.isInteger(wooOrderId) || wooOrderId <= 0) {
        reply.code(400).send({ error: "Invalid order id" });
        return reply;
      }
      const parsed = orderTransitionRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: "Invalid transition request" });
        return reply;
      }
      const { action, dispatch } = parsed.data;
      const to = actionTargetStatus(action);
      if (!to) {
        reply.code(400).send({ error: "Unknown action" });
        return reply;
      }

      // The dispatch detail (rider/vehicle/contact) plus the server-stamped time (AC5).
      const at = clock();
      const dispatchDetail: DispatchDetail | undefined = dispatch
        ? {
            riderName: dispatch.riderName,
            ...(dispatch.vehicle ? { vehicle: dispatch.vehicle } : {}),
            ...(dispatch.contact ? { contact: dispatch.contact } : {}),
            dispatchedAt: at.toISOString(),
          }
        : undefined;

      const result = await applyOrderTransition(db, {
        wooOrderId,
        to,
        actorUserId: authn.user.id,
        role: authn.user.role,
        // The audit row id doubles as the attempt id — a fresh, unique key per call
        // so each operator tap is a distinct writeback while a network retry of the
        // SAME drained row never double-applies (idempotency keyed on it).
        attemptId: at.getTime().toString(36) + "-" + Math.random().toString(36).slice(2, 10),
        ...(dispatchDetail ? { dispatch: dispatchDetail } : {}),
        now: at,
      });

      if (!result.ok) {
        // Map the write-path rejections onto HTTP codes.
        if (result.reason === "not_found") {
          reply.code(404).send({ error: "Order not found" });
        } else if (result.reason === "forbidden") {
          reply.code(403).send({ error: "Forbidden: reversing requires an admin role" });
        } else if (result.reason === "dispatch_required") {
          reply.code(422).send({ error: "Rider/courier detail is required to dispatch" });
        } else {
          reply.code(422).send({ error: "That transition is not allowed from the current status" });
        }
        return reply;
      }

      // Audit the mutation (AC2). A reversal is a distinct, higher-trust action (AC4).
      const auditAction =
        result.kind === "reversal"
          ? "woocommerce.order.transition_reversed"
          : "woocommerce.order.transition";
      await audit(db, {
        actor: authn.user.id,
        action: auditAction,
        target: { table: "wc_orders", id: String(wooOrderId) },
        payload: {
          woo_order_id: wooOrderId,
          from: result.fromStatus,
          to: result.toStatus,
          kind: result.kind,
          outbox_idempotency_key: result.outboxIdempotencyKey,
          ip: req.ip,
        },
      });

      reply.code(200).send({
        wooOrderId,
        localStatus: result.toStatus,
        kind: result.kind,
      });
      return reply;
    },
  );
}
