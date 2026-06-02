import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.js";
import { parents } from "./parents.js";
import { staff } from "./staff.js";
import { users } from "./users.js";

/**
 * `coaching_session_notes` (P5-E01-S04 / Story 31.4) — PRIVATE per-session coach
 * notes. After a coaching session check-out, Reception (or an admin acting for the
 * coach) records a private note for the parent/session (AC1).
 *
 * Sensitivity (Dev Note): coaching content is sensitive, so the note is ENCRYPTED
 * AT REST, column-level. `noteEnc` holds the AES-256-GCM `v1:salt:iv:tag:ciphertext`
 * envelope produced by `@bm/woocommerce`'s `encryptSecret` (the same scheme used
 * for the Woo consumer secrets) — plaintext never touches a column. Decryption is
 * gated to the authenticated admin/reception path; the parent app has NO surface
 * for this table (AC3), and the unauthenticated coach viewer sees a non-sensitive
 * summary only, never the text (AC2).
 *
 * `parentId` / `staffId` are denormalised owner ids so the 24-month anonymisation
 * job (AC4, Decision 29) can NULL them and `noteEnc` in place; `anonymisedAt` marks
 * a cleared row, exactly like `observations`. The note is keyed to the coaching
 * `bookingId` — the session's natural check-out anchor.
 */
export const coachingSessionNotes = pgTable(
  "coaching_session_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** The coaching session (booking) the note belongs to. */
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    /** Denormalised parent owner — NULLed by the anonymisation job. */
    parentId: uuid("parent_id").references(() => parents.id),
    /** The coach this note is scoped to (AC2) — NULLed by the anonymisation job. */
    staffId: uuid("staff_id").references(() => staff.id),
    /** Coach display-name snapshot (history-stable attribution). */
    staffNameSnapshot: text("staff_name_snapshot"),
    /** AES-256-GCM `v1:...` envelope of the private note. NULLed once anonymised. */
    noteEnc: text("note_enc"),
    /** Acting user who recorded the note (Reception / admin actor). */
    createdBy: uuid("created_by").references(() => users.id),
    /** Set by the 24-month anonymisation job once the note + PII are cleared. */
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffIdCreatedAtIdx: index("coaching_session_notes_staff_id_created_at_idx").on(
      t.staffId,
      t.createdAt,
    ),
    bookingIdIdx: index("coaching_session_notes_booking_id_idx").on(t.bookingId),
    createdAtIdx: index("coaching_session_notes_created_at_idx").on(t.createdAt),
  }),
);

export type CoachingSessionNoteRow = typeof coachingSessionNotes.$inferSelect;
export type CoachingSessionNoteInsert = typeof coachingSessionNotes.$inferInsert;
