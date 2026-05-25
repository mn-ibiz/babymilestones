import { and, asc, isNull, lte, or, sql } from "drizzle-orm";
import { auditLog, auditOutbox, type AuditOutboxRow, type Database } from "@bm/db";
import type { Job } from "../registry.js";

/** AC1: poll cadence. */
const POLL_INTERVAL_MS = 5_000;
/** Rows drained per run, oldest-first; the rest follow on the next tick. */
const DEFAULT_BATCH_SIZE = 500;
/** AC4: backoff base (1s) — doubled per failed attempt, capped below. */
const BACKOFF_BASE_MS = 1_000;
/** Cap a single backoff so attemptCount growth never overflows the delay. */
const BACKOFF_MAX_MS = 60 * 60 * 1000; // 1h
/** AC4: rows still unprocessed this long after creation are dead-lettered. */
const DEAD_LETTER_AFTER_MS = 24 * 60 * 60 * 1000;

/** Project one outbox row into `audit_log`. Idempotent (PK = outbox id). */
export type Projector = (db: Database, row: AuditOutboxRow) => Promise<void>;

export interface AuditDrainJobDeps {
  db: Database;
  /** Rows per run (default 500). */
  batchSize?: number;
  /** Clock injection for deterministic backoff/dead-letter windows in tests. */
  now?: () => Date;
  /** Override the projection (tests inject a failing projector). */
  project?: Projector;
}

/** Default projection: copy the outbox columns into audit_log, id-keyed. */
const defaultProject: Projector = async (db, row) => {
  await db
    .insert(auditLog)
    .values({
      id: row.id,
      actorUserId: row.actorUserId,
      action: row.action,
      targetTable: row.targetTable,
      targetId: row.targetId,
      payload: row.payload,
      createdAt: row.createdAt,
    })
    .onConflictDoNothing({ target: auditLog.id });
};

/** Exponential backoff for the Nth failed attempt (1-indexed), capped. */
function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
}

/**
 * Async drain worker (X5-S02) — the second half of the audit outbox pattern.
 *
 * Reads unprocessed `audit_outbox` rows oldest-first, projects each into the
 * query-optimised `audit_log` table, and stamps `processed_at` on success. The
 * projection is keyed on the source outbox id, so a re-run (or a crash mid-batch)
 * never double-projects: the worker is idempotent and resumable, and the
 * audit-log viewer (P1-E10-S03) can read `audit_log` directly.
 *
 * Failure handling (AC4): a row that fails to project gets `attempt_count++` and
 * a `next_attempt_at` set by exponential backoff, so it is skipped until the
 * window elapses and never blocks healthy rows behind it. A row still
 * unprocessed 24h after creation is dead-lettered (`dead_lettered_at`) and
 * skipped thereafter — a poisoned row can never wedge the queue.
 */
export function createAuditDrainJob(deps: AuditDrainJobDeps): Job {
  const now = deps.now ?? (() => new Date());
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const project = deps.project ?? defaultProject;

  return {
    name: "audit-drain",
    intervalMs: POLL_INTERVAL_MS,
    run: async () => {
      const at = now();

      // Eligible: unprocessed, not dead-lettered, and past any backoff gate.
      const rows = await deps.db
        .select()
        .from(auditOutbox)
        .where(
          and(
            isNull(auditOutbox.processedAt),
            isNull(auditOutbox.deadLetteredAt),
            or(isNull(auditOutbox.nextAttemptAt), lte(auditOutbox.nextAttemptAt, at)),
          ),
        )
        .orderBy(asc(auditOutbox.createdAt), asc(auditOutbox.id))
        .limit(batchSize);

      for (const row of rows) {
        try {
          await project(deps.db, row);
          await deps.db
            .update(auditOutbox)
            .set({ processedAt: at })
            .where(sql`${auditOutbox.id} = ${row.id}`);
        } catch {
          await onFailure(deps.db, row, at);
        }
      }
    },
  };
}

/** AC4 — bump attempt + schedule backoff, or dead-letter once past 24h. */
async function onFailure(db: Database, row: AuditOutboxRow, at: Date): Promise<void> {
  const attempt = row.attemptCount + 1;
  const agedOut = at.getTime() - row.createdAt.getTime() >= DEAD_LETTER_AFTER_MS;

  await db
    .update(auditOutbox)
    .set({
      attemptCount: attempt,
      nextAttemptAt: new Date(at.getTime() + backoffMs(attempt)),
      deadLetteredAt: agedOut ? at : null,
    })
    .where(sql`${auditOutbox.id} = ${row.id}`);
}
