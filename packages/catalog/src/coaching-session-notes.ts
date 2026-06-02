import { and, desc, eq, isNull } from "drizzle-orm";
import {
  audit,
  bookings,
  coachingSessionNotes,
  services,
  staff,
  type CoachingSessionNoteRow,
  type Database,
} from "@bm/db";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@bm/woocommerce";
import type { Executor } from "./services.js";

/**
 * P5-E01-S04 (Story 31.4) — PRIVATE coach session notes.
 *
 * After a coaching session check-out, Reception (or an admin acting for the coach)
 * records a PRIVATE note per parent/session (AC1). Coaching content is SENSITIVE, so
 * the note is ENCRYPTED AT REST, column-level: it is sealed with the SAME AES-256-GCM
 * `v1:salt:iv:tag:ciphertext` scheme used for the Woo consumer secrets
 * (`@bm/woocommerce` `encryptSecret` — scrypt-derived per-record key + random
 * salt/IV + GCM auth tag). Plaintext never touches a column, and the master key
 * comes from the same operator-provisioned env material (`WOO_SECRET_KEY`).
 *
 * Visibility (AC2/AC3):
 *  - {@link getCoachingSessionNotesForAdmin} decrypts for the authenticated ADMIN
 *    path; {@link listCoachingSessionNotesForCoach} decrypts SCOPED to one coach's
 *    own records (Reception decrypts on the coach's behalf — the coach has no login).
 *  - {@link listCoachingSessionNoteSummaryForCoach} is the ONLY surface safe for the
 *    UNAUTHENTICATED P3-E02-style coach viewer: it returns counts + dates and NEVER
 *    any note content (neither plaintext nor the ciphertext envelope).
 *  - There is NO parent surface — parents never see these notes (AC3).
 */

/** The booking the note is anchored to does not exist. */
export class CoachingSessionNoteBookingNotFoundError extends Error {
  constructor(public readonly bookingId: string) {
    super(`Coaching booking not found: ${bookingId}`);
    this.name = "CoachingSessionNoteBookingNotFoundError";
  }
}

/** The booking is not a coaching session — only coaching sessions carry coach notes. */
export class CoachingSessionNoteNotCoachingError extends Error {
  constructor(public readonly bookingId: string) {
    super(`Booking is not a coaching session: ${bookingId}`);
    this.name = "CoachingSessionNoteNotCoachingError";
  }
}

export interface RecordCoachingSessionNoteInput {
  /** The coaching session (booking) the note belongs to — the check-out anchor. */
  bookingId: string;
  /** The free-text private note. Encrypted at rest before insert (Dev Note). */
  note: string;
  /** Acting user id (Reception / admin) — the audit actor + `created_by`. */
  actor: string;
  /** Master key material for the at-rest encryption (env `WOO_SECRET_KEY`). */
  masterKey: string;
  ip?: string | null;
}

export interface RecordCoachingSessionNoteResult {
  id: string;
  bookingId: string;
  staffId: string | null;
  parentId: string | null;
}

/**
 * Record a PRIVATE coach session note (AC1). Resolves the coaching booking (it MUST
 * be a `unit='coaching'` session), encrypts the note at rest, inserts the row with
 * the denormalised parent + coach owner ids (for AC2 scoping + AC4 anonymisation),
 * and audits `coaching.session_note.recorded` — atomically (outbox). The note
 * CONTENT never enters the audit payload (only ids).
 *
 * Throws {@link CoachingSessionNoteBookingNotFoundError} when the booking is unknown
 * and {@link CoachingSessionNoteNotCoachingError} when it is not a coaching session.
 */
export async function recordCoachingSessionNote(
  db: Database,
  input: RecordCoachingSessionNoteInput,
): Promise<RecordCoachingSessionNoteResult> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      parentId: bookings.parentId,
      staffId: bookings.staffId,
      staffNameSnapshot: bookings.staffNameSnapshot,
      serviceUnit: services.unit,
      coachingSlotId: bookings.coachingSlotId,
    })
    .from(bookings)
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(eq(bookings.id, input.bookingId));
  if (!row) throw new CoachingSessionNoteBookingNotFoundError(input.bookingId);

  // A coaching session is a booking whose offering unit is 'coaching' (it may also
  // carry a coachingSlotId). A non-coaching booking (e.g. a salon visit) is rejected.
  const isCoaching = row.serviceUnit === "coaching" || row.coachingSlotId != null;
  if (!isCoaching) throw new CoachingSessionNoteNotCoachingError(input.bookingId);

  // Column-level encryption at rest (Dev Note): seal with the Woo AES-256-GCM scheme.
  const noteEnc = encryptSecret(input.note, input.masterKey);

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(coachingSessionNotes)
      .values({
        bookingId: row.bookingId,
        parentId: row.parentId,
        staffId: row.staffId,
        staffNameSnapshot: row.staffNameSnapshot ?? null,
        noteEnc,
        createdBy: input.actor,
      })
      .returning();

    // Audit — ids only. The note plaintext + ciphertext are deliberately ABSENT.
    await audit(tx, {
      actor: input.actor,
      action: "coaching.session_note.recorded",
      target: { table: "coaching_session_notes", id: inserted!.id },
      payload: {
        booking_id: row.bookingId,
        staff_id: row.staffId,
        parent_id: row.parentId,
        ip: input.ip ?? undefined,
      },
    });

    return {
      id: inserted!.id,
      bookingId: inserted!.bookingId,
      staffId: inserted!.staffId,
      parentId: inserted!.parentId,
    };
  });
}

/** A decrypted coach session note (admin / coach-scoped reads, AC2). */
export interface DecryptedCoachingSessionNote {
  id: string;
  bookingId: string;
  parentId: string | null;
  staffId: string | null;
  staffNameSnapshot: string | null;
  /** The decrypted note, or null when the row has been anonymised (AC4). */
  note: string | null;
  anonymisedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
}

/** Decrypt one stored row's note, tolerating an anonymised (null) ciphertext. */
function decryptRow(row: CoachingSessionNoteRow, masterKey: string): DecryptedCoachingSessionNote {
  // An anonymised row has a null ciphertext (AC4) — return null content rather
  // than attempting (and failing) a decrypt. A malformed/foreign envelope also
  // yields null content rather than throwing, so one bad row never aborts a list.
  let note: string | null = null;
  if (row.noteEnc && isEncryptedSecret(row.noteEnc)) {
    note = decryptSecret(row.noteEnc, masterKey);
  }
  return {
    id: row.id,
    bookingId: row.bookingId,
    parentId: row.parentId,
    staffId: row.staffId,
    staffNameSnapshot: row.staffNameSnapshot,
    note,
    anonymisedAt: row.anonymisedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/**
 * ADMIN read (AC2): every coach session note, DECRYPTED. Optionally filter to one
 * booking. Reserved to the authenticated admin/reception path — never the public
 * coach viewer. Anonymised rows surface with a null `note`.
 */
export async function getCoachingSessionNotesForAdmin(
  db: Executor,
  opts: { masterKey: string; bookingId?: string },
): Promise<DecryptedCoachingSessionNote[]> {
  const where = opts.bookingId !== undefined
    ? eq(coachingSessionNotes.bookingId, opts.bookingId)
    : undefined;
  const rows = await db
    .select()
    .from(coachingSessionNotes)
    .where(where)
    .orderBy(desc(coachingSessionNotes.createdAt));
  return rows.map((r) => decryptRow(r, opts.masterKey));
}

/**
 * COACH-scoped read (AC2): the notes belonging to ONE coach's own records,
 * DECRYPTED, most-recent first. Reception decrypts on the coach's behalf (the coach
 * has no login). NEVER widen this beyond a single `staffId`.
 */
export async function listCoachingSessionNotesForCoach(
  db: Executor,
  opts: { staffId: string; masterKey: string },
): Promise<DecryptedCoachingSessionNote[]> {
  const rows = await db
    .select()
    .from(coachingSessionNotes)
    .where(eq(coachingSessionNotes.staffId, opts.staffId))
    .orderBy(desc(coachingSessionNotes.createdAt));
  return rows.map((r) => decryptRow(r, opts.masterKey));
}

/** One session line in a coach's non-sensitive summary — dates + booking, NO content. */
export interface CoachingSessionNoteSummaryLine {
  noteId: string;
  bookingId: string;
  recordedAt: Date;
}

/** A coach's non-sensitive session-note summary (AC2 security): counts + dates only. */
export interface CoachingSessionNoteSummary {
  staffId: string;
  /** Number of LIVE (non-anonymised) notes recorded for this coach. */
  noteCount: number;
  /** Per-note metadata — id, booking, date. Deliberately carries NO note content. */
  sessions: CoachingSessionNoteSummaryLine[];
}

/**
 * The ONLY surface safe for the UNAUTHENTICATED P3-E02-style coach viewer (AC2
 * security decision): a coach's own session-note SUMMARY — how many notes exist and
 * when — with NO note content whatsoever (neither plaintext nor the ciphertext
 * envelope). The full decrypted content requires the authenticated admin/reception
 * path. Anonymised rows (AC4) are excluded from the live count.
 *
 * This is the deliberate AC2 interpretation: the coach has no login and the public
 * viewer is internet-reachable, so exposing decrypted PRIVATE content there would
 * leak it to anyone who picks the coach's name. We expose metadata only.
 */
export async function listCoachingSessionNoteSummaryForCoach(
  db: Executor,
  opts: { staffId: string },
): Promise<CoachingSessionNoteSummary> {
  const rows = await db
    .select({ id: coachingSessionNotes.id, bookingId: coachingSessionNotes.bookingId, createdAt: coachingSessionNotes.createdAt })
    .from(coachingSessionNotes)
    .where(and(eq(coachingSessionNotes.staffId, opts.staffId), isNull(coachingSessionNotes.anonymisedAt)))
    .orderBy(desc(coachingSessionNotes.createdAt));
  return {
    staffId: opts.staffId,
    noteCount: rows.length,
    sessions: rows.map((r) => ({ noteId: r.id, bookingId: r.bookingId, recordedAt: r.createdAt })),
  };
}

/** Resolve a coach by id (active or retired) — for the coach-viewer name display. */
export async function getCoachById(
  db: Executor,
  staffId: string,
): Promise<{ id: string; displayName: string; active: boolean } | null> {
  const [row] = await db
    .select({ id: staff.id, displayName: staff.displayName, active: staff.active })
    .from(staff)
    .where(eq(staff.id, staffId));
  return row ?? null;
}
