import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, ne } from "drizzle-orm";
import {
  audit,
  children,
  invoices,
  parents,
  subscriptions,
  users,
  wallets,
  type Database,
} from "@bm/db";
import { validateSession, CSRF_HEADER_NAME } from "@bm/auth";
import {
  ageInMonths,
  slotFitsAge,
  subscriptionCreateSchema,
  type BookablePlan,
} from "@bm/contracts";
import {
  addPeriod,
  getPlan,
  getService,
  listPlans,
  pauseSubscription,
  requestSubscriptionCancellation,
  resolvePlanPriceAt,
  resumeSubscription,
  reverseSubscriptionCancellation,
  SubscriptionNotFoundError,
  SubscriptionStateError,
} from "@bm/catalog";
import { debit } from "@bm/wallet";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { ParentsDeps } from "./index.js";

export interface SubscriptionRoutesDeps extends ParentsDeps {
  sms?: SmsSender;
  now?: () => Date;
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
 * Parent subscriptions (P2-E02-S02). `POST /parents/me/subscriptions { planId,
 * childId }` enrols a child in a plan: the full period is pre-paid from the
 * wallet (AC2) — if the wallet can't cover it, nothing is created (402) — then a
 * `subscriptions` row is created with the period dates + entitlement (AC3) and an
 * SMS-stub confirmation is sent (AC4). Loyalty earn on the settled charge is
 * DEFERRED to the loyalty engine (P2-E05): no loyalty-points ledger exists yet
 * (the wallet overview returns 0), so there is nowhere to record an earn.
 */
export function registerParentSubscriptions(app: FastifyInstance, deps: SubscriptionRoutesDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());

  // Active plans a parent can subscribe to for a service (AC1 — the service-page
  // "Subscribe" list). Read-only; the subscribe POST enforces eligibility + funds.
  app.get(
    "/parents/me/services/:serviceId/plans",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const auth = await validateSession(
        { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
        { sessions, resolveUser },
      );
      if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
      const { serviceId } = req.params as { serviceId: string };
      const rows = await listPlans(db, { serviceId, activeOnly: true });
      const today = clock().toISOString().slice(0, 10);
      const plans: BookablePlan[] = [];
      for (const p of rows) {
        const price = await resolvePlanPriceAt(db, p.id, today);
        plans.push({
          id: p.id,
          name: p.name,
          entitlementCount: p.entitlementCount,
          period: p.period,
          amountCents: price?.amountCents ?? null,
        });
      }
      return reply.code(200).send({ plans });
    },
  );

  app.post("/parents/me/subscriptions", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) return reply.code(auth.status).send({ error: auth.error });
    const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
    if (!profile) return reply.code(404).send({ error: "Parent profile not found" });
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, auth.user.id));
    if (!wallet) return reply.code(404).send({ error: "Wallet not found" });
    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id));

    const parsed = subscriptionCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { planId, childId } = parsed.data;

    const [child] = await db.select().from(children).where(eq(children.id, childId));
    if (!child || child.parentId !== profile.id || child.archivedAt !== null) {
      return reply.code(404).send({ error: "Child not found" });
    }
    const plan = await getPlan(db, planId);
    if (!plan || !plan.isActive) return reply.code(404).send({ error: "Plan not found" });

    const service = await getService(db, plan.serviceId);
    if (!service || !service.isActive) return reply.code(404).send({ error: "Service not found" });

    const now = clock();
    // Eligibility: the child must fit the service's age range (AC1 — eligible plans).
    if (!slotFitsAge(ageInMonths(child.dateOfBirth, now), service.ageMinMonths, service.ageMaxMonths)) {
      return reply.code(422).send({ error: "Child is not eligible for this plan" });
    }

    // One LIVE subscription per (child, plan) — a paused one still counts (a
    // re-subscribe would double-charge), so block until it's cancelled.
    const [existing] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.childId, childId),
          eq(subscriptions.planId, planId),
          ne(subscriptions.status, "cancelled"),
        ),
      );
    if (existing) return reply.code(409).send({ error: "Child is already subscribed to this plan" });

    const today = now.toISOString().slice(0, 10);
    const price = await resolvePlanPriceAt(db, planId, today);
    if (!price) return reply.code(409).send({ error: "This plan has no price set yet" });

    // Create the subscription + its pending invoice atomically FIRST. The
    // subscription row is the idempotency anchor: the partial-unique index on
    // (child_id, plan_id) WHERE active makes a retry 409 BEFORE any second wallet
    // charge can post (closing the cross-request double-charge window). Then
    // debit the wallet; if it can't be covered, roll the subscription back to
    // cancelled + void the invoice (402) — never leaves a charged-but-unsubscribed
    // or stranded state.
    let created;
    try {
      created = await db.transaction(async (tx) => {
        const [invoice] = await tx
          .insert(invoices)
          .values({ parentId: profile.id, amountDue: price.amountCents, serviceId: plan.serviceId, status: "pending" })
          .returning();
        const [subscription] = await tx
          .insert(subscriptions)
          .values({
            parentId: profile.id,
            childId,
            planId,
            startedAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: addPeriod(now, plan.period),
            status: "active",
            entitlementRemaining: plan.entitlementCount,
          })
          .returning();
        return { invoiceId: invoice!.id, subscription: subscription! };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.code(409).send({ error: "Child is already subscribed to this plan" });
      }
      throw err;
    }

    const subscription = created.subscription;
    const result = await debit(db, {
      walletId: wallet.id,
      invoiceId: created.invoiceId,
      idempotencyKey: `subscription:${subscription.id}`, // stable anchor — retry-safe
      source: "subscription",
      postedBy: auth.user.id,
    });

    if (result.outcome === "outstanding") {
      // Couldn't cover the charge → undo: cancel the subscription (frees the
      // active-uniq fence) and void the unpaid invoice.
      await db.transaction(async (tx) => {
        await tx.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(subscriptions.id, subscription.id));
        await tx.update(invoices).set({ status: "void", amountDue: 0 }).where(eq(invoices.id, created.invoiceId));
      });
      return reply.code(402).send({ error: "Insufficient wallet balance — top up to subscribe" });
    }

    await audit(db, {
      actor: auth.user.id,
      action: "subscription.created",
      target: { table: "subscriptions", id: subscription.id },
      payload: {
        plan_id: planId,
        child_id: childId,
        invoice_id: created.invoiceId,
        amount_cents: price.amountCents,
        outcome: result.outcome,
        ip: req.ip,
      },
    });

    if (user?.phone) {
      try {
        await sender.send({
          to: user.phone,
          template: "subscription.confirmed",
          data: { childName: child.firstName, planName: plan.name, entitlement: String(plan.entitlementCount) },
        });
      } catch {
        req.log.warn({ event: "subscription.sms_failed", subscriptionId: subscription.id }, "subscription SMS failed");
      }
    }

    return reply.code(201).send({
      subscriptionId: subscription.id,
      planId,
      childId,
      status: subscription.status,
      entitlementRemaining: subscription.entitlementRemaining,
      currentPeriodEnd: subscription.currentPeriodEnd,
      amountCents: price.amountCents,
    });
  });

  /** Resolve the caller's parent profile id + user id, or reply + return null. */
  async function requireParent(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ parentId: string; userId: string } | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    const [profile] = await db.select().from(parents).where(eq(parents.userId, auth.user.id));
    if (!profile) {
      reply.code(404).send({ error: "Parent profile not found" });
      return null;
    }
    return { parentId: profile.id, userId: auth.user.id };
  }

  /** Verify the subscription belongs to this parent; reply 404 + return null if not. */
  async function ownedSubscription(reply: FastifyReply, parentId: string, id: string) {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
    if (!sub || sub.parentId !== parentId) {
      reply.code(404).send({ error: "Subscription not found" });
      return null;
    }
    return sub;
  }

  // Pause (P2-E02-S04 AC1) — parent freezes their own subscription.
  app.post("/parents/me/subscriptions/:id/pause", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return reply;
    const { id } = req.params as { id: string };
    if (!(await ownedSubscription(reply, ctx.parentId, id))) return reply;
    try {
      const updated = await pauseSubscription(db, { subscriptionId: id, actor: ctx.userId, ip: req.ip, now: clock() });
      return reply.code(200).send({ subscriptionId: updated.id, status: updated.status });
    } catch (err) {
      if (err instanceof SubscriptionStateError) return reply.code(409).send({ error: err.message });
      if (err instanceof SubscriptionNotFoundError) return reply.code(404).send({ error: "Subscription not found" });
      throw err;
    }
  });

  // Resume (P2-E02-S04 AC3) — period dates shift by the pause duration.
  app.post("/parents/me/subscriptions/:id/resume", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return reply;
    const { id } = req.params as { id: string };
    if (!(await ownedSubscription(reply, ctx.parentId, id))) return reply;
    try {
      const updated = await resumeSubscription(db, { subscriptionId: id, actor: ctx.userId, ip: req.ip, now: clock() });
      return reply.code(200).send({
        subscriptionId: updated.id,
        status: updated.status,
        currentPeriodEnd: updated.currentPeriodEnd,
      });
    } catch (err) {
      if (err instanceof SubscriptionStateError) return reply.code(409).send({ error: err.message });
      if (err instanceof SubscriptionNotFoundError) return reply.code(404).send({ error: "Subscription not found" });
      throw err;
    }
  });

  // Cancel (P2-E02-S06 AC1) — scheduled for period end; current period plays out.
  app.post("/parents/me/subscriptions/:id/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return reply;
    const { id } = req.params as { id: string };
    if (!(await ownedSubscription(reply, ctx.parentId, id))) return reply;
    try {
      const updated = await requestSubscriptionCancellation(db, { subscriptionId: id, actor: ctx.userId, ip: req.ip });
      return reply.code(200).send({ subscriptionId: updated.id, status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd, currentPeriodEnd: updated.currentPeriodEnd });
    } catch (err) {
      if (err instanceof SubscriptionStateError) return reply.code(409).send({ error: err.message });
      if (err instanceof SubscriptionNotFoundError) return reply.code(404).send({ error: "Subscription not found" });
      throw err;
    }
  });

  // Reverse a scheduled cancellation (P2-E02-S06 AC2) — reversible until period end.
  app.post("/parents/me/subscriptions/:id/uncancel", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await requireParent(req, reply);
    if (!ctx) return reply;
    const { id } = req.params as { id: string };
    if (!(await ownedSubscription(reply, ctx.parentId, id))) return reply;
    try {
      const updated = await reverseSubscriptionCancellation(db, { subscriptionId: id, actor: ctx.userId, ip: req.ip });
      return reply.code(200).send({ subscriptionId: updated.id, status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd });
    } catch (err) {
      if (err instanceof SubscriptionStateError) return reply.code(409).send({ error: err.message });
      if (err instanceof SubscriptionNotFoundError) return reply.code(404).send({ error: "Subscription not found" });
      throw err;
    }
  });
}

/** Postgres unique-constraint violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "23505" ||
    (typeof e?.message === "string" && /duplicate key|unique constraint/iu.test(e.message))
  );
}
