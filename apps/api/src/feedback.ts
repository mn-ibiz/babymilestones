import { eq } from "drizzle-orm";
import { parents, services, users, type Database } from "@bm/db";
import { createFeedbackInvitation } from "@bm/catalog";
import type { SalonFeedbackHook } from "@bm/catalog";
import { createSmsSender, type SmsSender } from "@bm/sms";

/**
 * Feedback-invitation wiring (P6-E04-S01 / Story 34.1) — the REAL implementation
 * behind the forward-compatible {@link SalonFeedbackHook} the salon completion
 * already fires, plus the reusable creator the OTHER completion points
 * (attendance pickup, order fulfilment, coaching session end) call with the same
 * shape.
 *
 * On a completed paid touchpoint it (1) creates an idempotent invitation row via
 * `@bm/catalog`'s `createFeedbackInvitation` (one per source touchpoint, AC1/AC3)
 * and (2) — ONLY when THIS call created the row — fires a `feedback.invite`
 * SMS-stub carrying the one-tap link (the public token). The SMS is best-effort:
 * a send failure is caught + warned and never fails the completion (the feedback
 * engine is a downstream concern). A replay creates nothing and sends nothing.
 */

/** Build the one-tap feedback link the SMS-stub points at (carries the token). */
export function feedbackLink(token: string): string {
  return `/feedback/${token}`;
}

export interface FeedbackInvitationContext {
  /** The completion kind: 'salon' | 'attendance' | 'order' | 'coaching'. */
  sourceType: string;
  /** The source touchpoint id (booking id, attendance id, order id, …). */
  sourceId: string;
  /** The parent the touchpoint belongs to — the PARENTS row id (`parents.id`). */
  parentProfileId: string;
  /** The staff the touchpoint is attributed to (nullable). */
  attributedStaffId?: string | null;
  /** The service the touchpoint was for (drives the SMS copy). Nullable. */
  serviceId?: string | null;
  /** Completion time (defaults to now). */
  completedAt?: Date;
}

/**
 * The reusable feedback-invitation creator. Resolves the parent's `users.id` +
 * phone (the feedback table keys on `users.id`, matching the parent-scoped read
 * surfaces) and the service name, creates the idempotent invitation, then fires
 * the one-tap SMS-stub on a NEWLY-created invitation only. Returns the created
 * row's token, or null on a replay (nothing created).
 */
export type FeedbackInvitationCreator = (
  ctx: FeedbackInvitationContext,
) => Promise<{ token: string } | null>;

export function makeFeedbackInvitationCreator(
  db: Database,
  smsSender: SmsSender,
  logger?: { warn: (obj: unknown, msg?: string) => void },
): FeedbackInvitationCreator {
  return async (ctx) => {
    // The feedback table keys the parent on `users.id` (matching the parent
    // read surfaces). Resolve it + the phone from the parents profile id.
    const [parent] = await db
      .select({ userId: parents.userId })
      .from(parents)
      .where(eq(parents.id, ctx.parentProfileId));
    if (!parent) return null;

    const created = await createFeedbackInvitation(db, {
      sourceType: ctx.sourceType,
      sourceId: ctx.sourceId,
      parentId: parent.userId,
      attributedStaffId: ctx.attributedStaffId ?? null,
      invitedAt: ctx.completedAt,
    });
    // A replay (the touchpoint already has an invitation) creates nothing and
    // must NOT re-send the SMS-stub (idempotent, AC3).
    if (!created) return null;

    // Best-effort one-tap SMS-stub (AC2). A send failure never fails completion.
    try {
      const [u] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, parent.userId));
      let serviceName = "your visit";
      if (ctx.serviceId) {
        const [svc] = await db
          .select({
            name: services.name,
            discreetBillingEnabled: services.discreetBillingEnabled,
            discreetBillingLabel: services.discreetBillingLabel,
          })
          .from(services)
          .where(eq(services.id, ctx.serviceId));
        // Honour discreet billing (Epic 31 / P5-E01-S05): a sensitive service
        // must show its neutral label on the parent's phone, never the real name.
        // Same substitution the coaching booking + reminder SMS apply.
        if (svc) {
          const label = (svc.discreetBillingLabel ?? "").trim();
          serviceName =
            svc.discreetBillingEnabled && label !== "" ? label : (svc.name ?? serviceName);
        }
      }
      if (u?.phone) {
        await smsSender.send({
          to: u.phone,
          template: "feedback.invite",
          data: { serviceName, link: feedbackLink(created.token) },
        });
      }
    } catch (err) {
      logger?.warn({ err, sourceType: ctx.sourceType, sourceId: ctx.sourceId }, "feedback.invite SMS-stub failed");
    }

    return { token: created.token };
  };
}

/**
 * Adapt the reusable creator to the salon completion's {@link SalonFeedbackHook}
 * event shape. The salon touchpoint is keyed by its BOOKING id (one salon
 * completion per booking), `source_type='salon'`. The hook's `parentId` is the
 * parents-profile id; the creator resolves it to the `users.id`.
 */
export function makeSalonFeedbackHook(
  db: Database,
  smsSender: SmsSender,
  logger?: { warn: (obj: unknown, msg?: string) => void },
): SalonFeedbackHook {
  const create = makeFeedbackInvitationCreator(db, smsSender, logger);
  return async (event) => {
    await create({
      sourceType: "salon",
      sourceId: event.bookingId,
      parentProfileId: event.parentId,
      attributedStaffId: event.staffId,
      serviceId: event.serviceId,
      completedAt: new Date(event.completedAt),
    });
  };
}

/** Convenience for production wiring: the real salon hook over the stub SMS sender. */
export function defaultSalonFeedbackHook(
  db: Database,
  logger?: { warn: (obj: unknown, msg?: string) => void },
): SalonFeedbackHook {
  return makeSalonFeedbackHook(db, createSmsSender(db), logger);
}
