import { and, asc, eq, isNull, lt, notInArray } from "drizzle-orm";
import { audit, coachingSessionNotes, type Database } from "@bm/db";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";
import { subtractMonths } from "./anonymise-observations.js";

const DAILY_MS = 24 * 60 * 60 * 1000;
/** PRIVATE coach notes are anonymised after this many months (Decision 29, AC4). */
export const RETENTION_MONTHS = 24;
/** Rows processed per batch — bounds memory on a large first-run backlog. */
const DEFAULT_BATCH_SIZE = 500;
/** Hard cap on batches per run, so a persistent failure can never loop forever. */
const MAX_BATCHES = 10_000;

/** Minimal structured-logger shape the job needs (the shared jobs logger fits). */
export interface AnonymiseLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface AnonymiseCoachingNotesJobDeps {
  db: Database;
  /** Clock injection for deterministic cutoffs in tests; defaults to real time. */
  now?: () => Date;
  /** Structured logger for the run summary; defaults to the jobs logger. */
  logger?: AnonymiseLogger;
  /** Override the per-batch size (tests use a small value to exercise draining). */
  batchSize?: number;
}

/**
 * 24-month retention + anonymisation cron for PRIVATE coach session notes
 * (P5-E01-S04 / Story 31.4 AC4), consistent with the Decision-29 observations
 * worker. Nightly it scans `coaching_session_notes` older than
 * {@link RETENTION_MONTHS} that have not been anonymised and, for each: PURGES the
 * encrypted note (`note_enc` → NULL) and strips the denormalised owner ids
 * (`parent_id` / `staff_id`). Unlike `observations` (which retains scrubbed
 * aggregate text), a coach note is sensitive content end-to-end, so the whole
 * ciphertext is purged — nothing decryptable remains. `staffNameSnapshot` is also
 * cleared (it is the data subject's coach attribution, not retained-operational
 * text). Each row's clear + audit commit together (outbox); the run logs its total
 * + any failed counts. Idempotent: an already-anonymised row is skipped, so re-runs
 * are no-ops. Processed in bounded batches.
 */
export function createAnonymiseCoachingNotesJob(deps: AnonymiseCoachingNotesJobDeps): Job {
  const db = deps.db;
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;

  return {
    name: "anonymise-coaching-notes",
    intervalMs: DAILY_MS,
    // 02:00 daily — the same cadence as the observations anonymiser.
    cron: "0 2 * * *",
    onFailure: "retry-next-tick",
    run: async () => {
      const at = clock();
      const cutoff = subtractMonths(at, RETENTION_MONTHS);
      let total = 0;
      let failed = 0;
      // Ids whose per-row transaction failed this run — excluded from the next
      // page so the oldest-first scan makes forward progress (no starvation). They
      // keep `anonymisedAt` NULL and retry on the next nightly run.
      const failedIds: string[] = [];

      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const due = await db
          .select({ id: coachingSessionNotes.id, bookingId: coachingSessionNotes.bookingId, parentId: coachingSessionNotes.parentId, staffId: coachingSessionNotes.staffId })
          .from(coachingSessionNotes)
          .where(
            and(
              lt(coachingSessionNotes.createdAt, cutoff),
              isNull(coachingSessionNotes.anonymisedAt),
              ...(failedIds.length > 0 ? [notInArray(coachingSessionNotes.id, failedIds)] : []),
            ),
          )
          .orderBy(asc(coachingSessionNotes.createdAt))
          .limit(batchSize);
        if (due.length === 0) break;

        for (const note of due) {
          try {
            await db.transaction(async (tx) => {
              await tx
                .update(coachingSessionNotes)
                .set({ noteEnc: null, parentId: null, staffId: null, staffNameSnapshot: null, anonymisedAt: at })
                .where(eq(coachingSessionNotes.id, note.id));
              await audit(tx, {
                actor: null,
                action: "coaching.session_note.anonymised",
                target: { table: "coaching_session_notes", id: note.id },
                // ids only — the note content is purged, never echoed.
                payload: { booking_id: note.bookingId, staff_id: note.staffId, parent_id: note.parentId, cutoff: cutoff.toISOString() },
              });
            });
            total += 1;
          } catch (err) {
            failed += 1;
            failedIds.push(note.id);
            log.warn(
              { event: "anonymise.coaching_notes.row_failed", note_id: note.id, err: String(err) },
              "anonymise: coaching-note row failed, continuing",
            );
          }
        }

        if (due.length < batchSize) break;
      }

      log.info(
        { event: "anonymise.coaching_notes", count: total, failed, cutoff: cutoff.toISOString() },
        `anonymised ${total} coaching session note(s) older than ${RETENTION_MONTHS} months`,
      );
    },
  };
}
