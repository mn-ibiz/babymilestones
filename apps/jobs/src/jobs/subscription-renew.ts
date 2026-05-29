import { and, eq, inArray, or } from "drizzle-orm";
import {
  audit,
  invoices,
  parents,
  subscriptionPlans,
  subscriptions,
  users,
  wallets,
  type Database,
} from "@bm/db";
import { addPeriod, resolvePlanPriceAt } from "@bm/catalog";
import { debit } from "@bm/wallet";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import type { Job } from "../registry.js";

export interface SubscriptionRenewJobDeps {
  db: Database;
  /** SMS sender for dunning notices. Defaults to the DB-backed stub. */
  sms?: SmsSender;
  /** Clock injection for tests; defaults to real time. */
  now?: () => Date;
}

const DAILY_MS = 24 * 60 * 60 * 1000;
/** Grace window before a dunning subscription is paused (P2-E02-S05 AC4). */
const DUNNING_GRACE_MS = 3 * DAILY_MS;
/** System actor for the automated renewal charge (the debit audits its actor). */
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

/**
 * Subscription renewal / dunning cron (P2-E02-S05). Daily:
 *  - active + period ended → charge the next period from the wallet (AC1). Success
 *    rolls the period + resets entitlement (AC2); auto-credit charges through to a
 *    negative balance and counts as success (AC5).
 *  - charge fails (insufficient + auto-credit off) → `dunning`, SMS the parent,
 *    retried each run (AC3); after the 3-day grace window → `paused` (AC4).
 * Every transition is audited. Paused/cancelled subscriptions are skipped.
 */
export function createSubscriptionRenewJob(deps: SubscriptionRenewJobDeps): Job {
  const db = deps.db;
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());

  /** Attempt to charge the next period for one subscription; roll or dunning. */
  async function attemptRenewal(sub: typeof subscriptions.$inferSelect, at: Date): Promise<void> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, sub.planId));
    if (!plan) return;
    const price = await resolvePlanPriceAt(db, sub.planId, at.toISOString().slice(0, 10));
    if (!price) return; // no effective price → can't charge; retried next run
    const [parent] = await db.select().from(parents).where(eq(parents.id, sub.parentId));
    if (!parent) return;
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, parent.userId));
    if (!wallet) return;

    const [invoice] = await db
      .insert(invoices)
      .values({ parentId: sub.parentId, amountDue: price.amountCents, serviceId: plan.serviceId, status: "pending" })
      .returning();
    const result = await debit(db, {
      walletId: wallet.id,
      invoiceId: invoice!.id,
      // Stable per period — a same-period retry re-attempts (a failed debit posts
      // nothing), and a settled charge can't be double-applied.
      idempotencyKey: `renewal:${sub.id}:${sub.currentPeriodEnd.toISOString()}`,
      source: "subscription_renewal",
      postedBy: SYSTEM_ACTOR,
    });

    if (result.outcome === "outstanding") {
      await db.update(invoices).set({ status: "void", amountDue: 0 }).where(eq(invoices.id, invoice!.id));
      const wasDunning = sub.status === "dunning";
      await db
        .update(subscriptions)
        .set({ status: "dunning", dunningSince: wasDunning ? sub.dunningSince : at, updatedAt: at })
        .where(eq(subscriptions.id, sub.id));
      await audit(db, {
        actor: null,
        action: "subscription.dunning",
        target: { table: "subscriptions", id: sub.id },
        payload: { invoice_id: invoice!.id, retry: wasDunning },
      });
      const [user] = await db.select().from(users).where(eq(users.id, parent.userId));
      if (user?.phone) {
        try {
          await sender.send({ to: user.phone, template: "subscription.dunning", data: { planName: plan.name } });
        } catch {
          /* dunning SMS is best-effort */
        }
      }
      return;
    }

    // Crash-recovery: if the debit was an idempotent REPLAY, a prior run already
    // charged + settled a different invoice for this period but may have died
    // before rolling. The invoice we just created is redundant — void it so it
    // can't be settled out-of-band by a later wallet top-up (no double charge).
    if (result.replayed && result.invoiceId !== invoice!.id) {
      await db.update(invoices).set({ status: "void", amountDue: 0 }).where(eq(invoices.id, invoice!.id));
    }

    // Success (AC2 / AC5): roll the period from the prior end + reset entitlement.
    await db
      .update(subscriptions)
      .set({
        status: "active",
        dunningSince: null,
        currentPeriodStart: sub.currentPeriodEnd,
        currentPeriodEnd: addPeriod(sub.currentPeriodEnd, plan.period),
        entitlementRemaining: plan.entitlementCount,
        updatedAt: at,
      })
      .where(eq(subscriptions.id, sub.id));
    await audit(db, {
      actor: null,
      action: "subscription.renewed",
      target: { table: "subscriptions", id: sub.id },
      payload: { invoice_id: invoice!.id, amount_cents: price.amountCents, outcome: result.outcome },
    });
  }

  return {
    name: "subscription-renew",
    intervalMs: DAILY_MS,
    run: async () => {
      const at = clock();
      // Renewal candidates (active/dunning) + any paused sub set to cancel, so a
      // cancelled-then-paused subscription is still reaped (not left a zombie).
      const due = await db
        .select()
        .from(subscriptions)
        .where(
          or(
            inArray(subscriptions.status, ["active", "dunning"]),
            and(eq(subscriptions.status, "paused"), eq(subscriptions.cancelAtPeriodEnd, true)),
          ),
        );
      for (const sub of due) {
        // Scheduled cancellation (P2-E02-S06): terminate at period end instead of
        // charging — an active sub when its paid period ends, or a dunning sub
        // immediately (stop chasing a subscription the parent asked to end).
        if (sub.cancelAtPeriodEnd) {
          const periodEnded = sub.currentPeriodEnd.getTime() <= at.getTime();
          if (sub.status === "dunning" || sub.status === "paused" || periodEnded) {
            // Conditional on the flag still set so a concurrent un-cancel wins the race.
            await db
              .update(subscriptions)
              .set({ status: "cancelled", dunningSince: null, updatedAt: at })
              .where(and(eq(subscriptions.id, sub.id), eq(subscriptions.cancelAtPeriodEnd, true)));
            await audit(db, {
              actor: null,
              action: "subscription.cancelled",
              target: { table: "subscriptions", id: sub.id },
              payload: { reason: "scheduled_cancel" },
            });
          }
          continue; // never renew a subscription set to cancel
        }
        if (sub.status === "active") {
          if (sub.currentPeriodEnd.getTime() > at.getTime()) continue; // not due yet
          await attemptRenewal(sub, at);
        } else if (sub.status === "dunning") {
          // dunning: pause after the grace window (AC4), else retry the charge.
          if (sub.dunningSince && at.getTime() - sub.dunningSince.getTime() >= DUNNING_GRACE_MS) {
            // Set pausedAt so the parent can manually resume (AC4) — resume then
            // reactivates and the next renewal run re-charges the lapsed period.
            await db
              .update(subscriptions)
              .set({ status: "paused", pausedAt: at, dunningSince: null, updatedAt: at })
              .where(eq(subscriptions.id, sub.id));
            await audit(db, {
              actor: null,
              action: "subscription.paused",
              target: { table: "subscriptions", id: sub.id },
              payload: { reason: "dunning_exhausted" },
            });
          } else {
            await attemptRenewal(sub, at);
          }
        }
      }
    },
  };
}
