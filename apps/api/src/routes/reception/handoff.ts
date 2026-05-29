import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  attendances,
  audit,
  bookings,
  children,
  observations,
  parents,
  services,
  settings,
  users,
  type Database,
} from "@bm/db";
import { validateSession, requirePermission, CSRF_HEADER_NAME } from "@bm/auth";
import { writeReceipt } from "@bm/payments";
import { StubSmsSender, type SmsSender } from "@bm/sms";
import {
  handoffSchema,
  handoffSummary,
  inclusiveVatCents,
  OBSERVATION_ACTIVITIES_DEFAULT,
  OBSERVATION_ACTIVITIES_SETTING_KEY,
  OBSERVATION_ACTIVITIES_MAX,
  OBSERVATION_ACTIVITY_LABEL_MAX,
  OBSERVATION_DEFAULT_MOOD,
  OBSERVATION_MOODS,
  type HandoffResult,
  type ObservationOptions,
} from "@bm/contracts";
import type { ReceptionDeps } from "./index.js";

/**
 * True only for the observations `booking_id` unique-fence violation (the durable
 * "one hand-off per booking" guard). Deliberately NARROW: a concurrent receipt
 * sequence-number collision is a different 23505 (on the shared `BM-<year>`
 * receipt series, see @bm/payments) and must NOT be mistaken for an
 * already-handed-over conflict — it should surface as a retryable 500, not a
 * misleading "Child has already been handed over" 409.
 */
function isObservationBookingConflict(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string };
  return (
    e?.constraint === "observations_booking_id_uniq" ||
    (typeof e?.message === "string" && /observations_booking_id_uniq/iu.test(e.message))
  );
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

/** Read the configurable activity-chip list from settings, else the default (AC1). */
async function loadActivityOptions(db: Database): Promise<string[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, OBSERVATION_ACTIVITIES_SETTING_KEY));
  const value = row?.value as { activities?: unknown } | undefined;
  const configured = value?.activities;
  if (Array.isArray(configured) && configured.every((a) => typeof a === "string") && configured.length > 0) {
    // Clamp to the same caps the hand-off schema enforces, so the screen never
    // offers a chip the server would reject (no offer/accept asymmetry).
    return (configured as string[])
      .map((a) => a.trim())
      .filter((a) => a.length > 0 && a.length <= OBSERVATION_ACTIVITY_LABEL_MAX)
      .slice(0, OBSERVATION_ACTIVITIES_MAX);
  }
  return [...OBSERVATION_ACTIVITIES_DEFAULT];
}

/**
 * Pickup hand-off with free-text observations (P2-E03-S03). Operated via
 * Reception's screen (same auth). The mood picker + activity chips come from
 * `GET …/observation-options` (AC1); `POST …/handoff` records the check-out +
 * observation, auto-generates the visit receipt (AC4), and SMS-stubs a one-line
 * summary to the parent (AC2). The check-out + observation + receipt + audit all
 * commit in ONE transaction; the SMS is best-effort (never fails a committed
 * hand-off). Reads gated to `read wallet`, the hand-off to `create payment`.
 *
 *  GET  /reception/attendance/observation-options
 *  POST /reception/attendance/handoff
 */
export function registerHandoff(app: FastifyInstance, deps: ReceptionDeps): void {
  const { db, sessions } = deps;
  const resolveUser = makeResolveUser(db);
  const readGuard = requirePermission("read", "wallet");
  const writeGuard = requirePermission("create", "payment");
  const sender: SmsSender = deps.sms ?? new StubSmsSender(db);
  const clock = deps.now ?? (() => new Date());

  async function authStaff(
    req: FastifyRequest,
    reply: FastifyReply,
    guard: ReturnType<typeof requirePermission>,
  ): Promise<{ userId: string } | null> {
    const auth = await validateSession(
      { method: req.method, cookieHeader: req.headers.cookie ?? null, csrfHeader: csrfHeaderOf(req) },
      { sessions, resolveUser },
    );
    if (!auth.ok) {
      reply.code(auth.status).send({ error: auth.error });
      return null;
    }
    const perm = guard(auth.user);
    if (!perm.ok) {
      reply.code(perm.status).send({ error: perm.error });
      return null;
    }
    return { userId: auth.user.id };
  }

  // AC1: the mood + activity options the hand-off screen renders.
  app.get(
    "/reception/attendance/observation-options",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!(await authStaff(req, reply, readGuard))) return reply;
      const out: ObservationOptions = {
        moods: OBSERVATION_MOODS,
        defaultMood: OBSERVATION_DEFAULT_MOOD,
        activities: await loadActivityOptions(db),
      };
      return reply.code(200).send(out);
    },
  );

  // AC2/AC4: record the hand-off — check-out + observation + receipt + SMS.
  app.post("/reception/attendance/handoff", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await authStaff(req, reply, writeGuard);
    if (!ctx) return reply;
    const parsed = handoffSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return reply.code(400).send({ error: first?.message ?? "Invalid input", field: first?.path[0] });
    }
    const { bookingId, mood, activities, note, attendantName } = parsed.data;

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!booking) return reply.code(404).send({ error: "Booking not found" });
    if (!booking.serviceId) return reply.code(409).send({ error: "Booking has no service to hand over" });

    // The child must already be checked in, and not yet handed over.
    const [attendance] = await db.select().from(attendances).where(eq(attendances.bookingId, bookingId));
    if (!attendance) return reply.code(409).send({ error: "Check the child in before handing over" });
    if (attendance.checkedOutAt) return reply.code(409).send({ error: "Child has already been handed over" });

    // Attendant display name for the parent feed (S04): the operator's provided
    // name, else a generic label — never leak the staff phone to parents.
    const attendantSnapshot = attendantName ?? "Attendant";

    // VAT line-tax for the visit receipt comes from the service's tax treatment
    // (P1-E07-S04). The wallet was charged exactly the service price, so the
    // receipt total equals it; only a vat_inclusive service carries embedded VAT.
    const [service] = await db.select().from(services).where(eq(services.id, booking.serviceId));
    const now = clock();
    const serviceId = booking.serviceId;
    const amount = booking.staffRateSnapshot;
    const lineTax = inclusiveVatCents(amount, service?.taxTreatment ?? "vat_exempt");
    const paymentMethod = booking.paidVia === "subscription" ? "subscription" : "wallet";

    let result: { observationId: string; receiptId: string };
    try {
      result = await db.transaction(async (tx) => {
        await tx
          .update(attendances)
          .set({ checkedOutAt: now, checkedOutBy: ctx.userId, updatedAt: now })
          .where(eq(attendances.id, attendance.id));
        const [obs] = await tx
          .insert(observations)
          .values({
            bookingId,
            attendanceId: attendance.id,
            childId: booking.childId,
            parentId: booking.parentId,
            mood,
            activities,
            note,
            attendantId: ctx.userId,
            attendantNameSnapshot: attendantSnapshot,
          })
          .returning();
        // AC4: a receipt is generated for the visit through the KRA/eTIMS writer
        // seam — including a zero-total receipt for an entitlement-covered
        // subscription visit (it documents the service delivered).
        const receipt = await writeReceipt(tx, {
          series: `BM-${now.getUTCFullYear()}`,
          paymentMethod,
          postedBy: ctx.userId,
          parentAccountId: booking.parentId,
          lines: [{ serviceId, quantity: 1, unitPrice: amount, lineTax, lineTotal: amount }],
        });
        await audit(tx, {
          actor: ctx.userId,
          action: "attendance.checked_out",
          target: { table: "observations", id: obs!.id },
          payload: {
            booking_id: bookingId,
            child_id: booking.childId,
            attendance_id: attendance.id,
            receipt_id: receipt.id,
            mood,
            activities,
            ip: req.ip,
          },
        });
        return { observationId: obs!.id, receiptId: receipt.id };
      });
    } catch (err) {
      // The observations UNIQUE(booking_id) fence is the durable "one hand-off
      // per booking" guard — a concurrent second hand-off loses the race here.
      if (isObservationBookingConflict(err)) {
        return reply.code(409).send({ error: "Child has already been handed over" });
      }
      throw err;
    }

    // AC2: SMS-stub summary to the parent. Best-effort — never fail a committed
    // hand-off on a notification error.
    const [child] = await db.select().from(children).where(eq(children.id, booking.childId));
    const [parent] = await db.select().from(parents).where(eq(parents.id, booking.parentId));
    const [parentUser] = parent
      ? await db.select().from(users).where(eq(users.id, parent.userId))
      : [];
    if (parentUser?.phone && child) {
      try {
        await sender.send({
          to: parentUser.phone,
          template: "pickup.handoff",
          data: { childName: child.firstName, summary: handoffSummary(mood, activities, note) },
        });
      } catch {
        req.log.warn({ event: "handoff.sms_failed", bookingId }, "hand-off SMS failed");
      }
    }

    const out: HandoffResult = {
      observationId: result.observationId,
      receiptId: result.receiptId,
      checkedOutAt: now.toISOString(),
    };
    return reply.code(201).send(out);
  });
}
