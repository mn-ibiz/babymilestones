import type { FastifyInstance } from "fastify";
import { audit } from "@bm/db";
import { getStaff, listCommissionRates, setCommissionRate } from "@bm/catalog";
import { auditAction } from "@bm/auth";
import type { AdminDeps } from "./index.js";
import { requireStaffPermission } from "../../lib/require-permission.js";

/**
 * Admin per-staff commission-rate CRUD (P3-E01-S01 AC2). Admin-guarded under the
 * service-catalogue surface (`manage service`, same gate as the staff records the
 * rates attach to). Setting a rate auto-closes the previous open one in the
 * catalog layer; every rate change is audited (AC4). The history read is not
 * audited (reads are never audited).
 */
export function registerCommissionRateRoutes(app: FastifyInstance, deps: AdminDeps): void {
  const { db } = deps;

  // List a staff member's rate history (newest-first). Read — not audited.
  app.get("/admin/staff/:id/commission-rates", async (request, reply) => {
    const auth = await requireStaffPermission(request, reply, deps, "manage", "service");
    if (!auth) return;
    const { id } = request.params as { id: string };
    const member = await getStaff(db, id);
    if (!member) return reply.code(404).send({ error: "staff not found" });
    const rates = await listCommissionRates(db, id);
    return reply.send({ rates });
  });

  // Set (or correct) a staff member's commission rate effective from an instant.
  app.post("/admin/staff/:id/commission-rates", async (request, reply) => {
    const auth = await requireStaffPermission(request, reply, deps, "manage", "service");
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    const rateRaw = body.ratePercent;
    const rateNum = typeof rateRaw === "number" ? rateRaw : typeof rateRaw === "string" ? Number(rateRaw) : NaN;
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
      return reply.code(400).send({ error: "ratePercent must be a number between 0 and 100" });
    }
    const effFromStr = typeof body.effectiveFrom === "string" ? body.effectiveFrom : "";
    const effectiveFrom = effFromStr ? new Date(effFromStr) : null;
    if (!effectiveFrom || Number.isNaN(effectiveFrom.getTime())) {
      return reply.code(400).send({ error: "effectiveFrom must be a valid ISO timestamp" });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    const member = await getStaff(db, id);
    if (!member) return reply.code(404).send({ error: "staff not found" });

    let rate;
    try {
      rate = await setCommissionRate(db, { staffId: id, ratePercent: rateNum, effectiveFrom, reason });
    } catch (err) {
      // e.g. effective_from before the current open rate's start.
      return reply.code(400).send({ error: err instanceof Error ? err.message : "invalid rate change" });
    }

    await audit(db, {
      actor: auth.userId,
      action: auditAction("commission.rate.set"),
      target: { table: "staff_commission_rates", id: rate.id },
      payload: {
        staff_id: id,
        rate_percent: rate.ratePercent,
        effective_from: effectiveFrom.toISOString(),
        reason,
      },
    });
    return reply.code(201).send({ rate });
  });
}
