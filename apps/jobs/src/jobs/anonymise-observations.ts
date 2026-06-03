import { and, asc, eq, inArray, isNull, lt, notInArray } from "drizzle-orm";
import { audit, children, observations, parents, type Database } from "@bm/db";
import { logger as defaultLogger } from "../logger.js";
import type { Job } from "../registry.js";

const DAILY_MS = 24 * 60 * 60 * 1000;
/** Free-text observations are anonymised after this many months (Decision 29). */
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

export interface AnonymiseObservationsJobDeps {
  db: Database;
  /** Clock injection for deterministic cutoffs in tests; defaults to real time. */
  now?: () => Date;
  /** Structured logger for the run summary (AC4); defaults to the jobs logger. */
  logger?: AnonymiseLogger;
  /** Override the per-batch size (tests use a small value to exercise draining). */
  batchSize?: number;
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Subtract whole months from a date (UTC), clamping to the last valid day of the
 * target month so a month-end date never rolls forward into the next month
 * (e.g. 2026-03-31 − 1 month → 2026-02-28, not 2026-03-03).
 */
export function subtractMonths(d: Date, months: number): Date {
  const day = d.getUTCDate();
  const r = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()),
  );
  const lastDayOfTarget = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDayOfTarget));
  return r;
}

/**
 * Replace each child / parent name (first AND last) in free-text observation
 * `note` with `[child]` / `[parent]` (AC2). AC2 calls for first names; surnames
 * are scrubbed too as defence-in-depth since both are PII. Matching is
 * case-insensitive and whole-word so a name that is a substring of another word
 * is left alone; names are regex-escaped. A null/empty note or an empty name is
 * left untouched. Pure + exported for unit testing.
 */
export function anonymiseNote(
  note: string | null,
  childNames: Array<string | null | undefined>,
  parentNames: Array<string | null | undefined>,
): string | null {
  if (!note) return note;
  let out = note;
  // Unicode-aware word boundaries: JS `\b` is ASCII-only even under /u, so an
  // accented name (José, Zoë, Élodie, Òmar) would slip through un-redacted and the
  // PII would survive irreversibly. Use \p{L}\p{N}_ lookarounds instead.
  const boundary = (t: string) =>
    new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(t)}(?![\\p{L}\\p{N}_])`, "giu");
  for (const name of childNames) {
    const t = (name ?? "").trim();
    if (t) out = out.replace(boundary(t), "[child]");
  }
  for (const name of parentNames) {
    const t = (name ?? "").trim();
    if (t) out = out.replace(boundary(t), "[parent]");
  }
  return out;
}

/**
 * 24-month retention + anonymisation cron (P2-E03-S05). Nightly it scans
 * `observations` older than {@link RETENTION_MONTHS} that have not been
 * anonymised (AC1) and, for each: strips `child_id` / `parent_id` and scrubs the
 * child's + parent's names from the free-text `note` (AC2). The mood, activities
 * and scrubbed note are retained for operational learning — only PII is cleared
 * (AC3). NOTE: `attendant_name_snapshot` is intentionally retained — it is staff
 * operational attribution (who logged the note), not the anonymised data
 * subject's PII. Each row's clear + audit commit together (outbox); the run logs
 * its total + any skipped/failed counts (AC4). Idempotent: an already-anonymised
 * row is skipped, so re-runs are no-ops. Processed in bounded batches so a large
 * first-run backlog never loads wholesale into memory.
 */
export function createAnonymiseObservationsJob(deps: AnonymiseObservationsJobDeps): Job {
  const db = deps.db;
  const clock = deps.now ?? (() => new Date());
  const log = deps.logger ?? defaultLogger;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;

  return {
    name: "anonymise-observations",
    intervalMs: DAILY_MS,
    // AC1 (P3-E06-S02): 02:00 daily. The single-worker scheduler runs off
    // intervalMs; this is the canonical cron surfaced in the registry.
    cron: "0 2 * * *",
    onFailure: "retry-next-tick",
    run: async () => {
      const at = clock();
      const cutoff = subtractMonths(at, RETENTION_MONTHS);
      let total = 0;
      let failed = 0;
      let unresolved = 0;
      // Ids whose per-row transaction failed this run. They keep `anonymisedAt`
      // NULL, so without excluding them the oldest-first scan would re-fetch the
      // same failing page every batch — a full page of failures would then starve
      // every newer (still-expired) row. Excluding them guarantees the scan makes
      // forward progress through the whole backlog; the failed rows are retried on
      // the next nightly run.
      const failedIds: string[] = [];

      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        // AC1: oldest-first page of identifiable observations past the window.
        const due = await db
          .select()
          .from(observations)
          .where(
            and(
              lt(observations.createdAt, cutoff),
              isNull(observations.anonymisedAt),
              ...(failedIds.length > 0 ? [notInArray(observations.id, failedIds)] : []),
            ),
          )
          .orderBy(asc(observations.createdAt))
          .limit(batchSize);
        if (due.length === 0) break;

        // Batch-load the names to scrub (avoid per-row name queries).
        const childIds = [...new Set(due.map((o) => o.childId).filter((id): id is string => id !== null))];
        const parentIds = [...new Set(due.map((o) => o.parentId).filter((id): id is string => id !== null))];
        const childMap = new Map<string, { firstName: string; lastName: string | null }>();
        const parentMap = new Map<string, { firstName: string | null; lastName: string | null }>();
        if (childIds.length) {
          for (const c of await db.select().from(children).where(inArray(children.id, childIds))) {
            childMap.set(c.id, { firstName: c.firstName, lastName: c.lastName });
          }
        }
        if (parentIds.length) {
          for (const p of await db.select().from(parents).where(inArray(parents.id, parentIds))) {
            parentMap.set(p.id, { firstName: p.firstName, lastName: p.lastName });
          }
        }

        for (const obs of due) {
          const child = obs.childId ? childMap.get(obs.childId) : undefined;
          const parent = obs.parentId ? parentMap.get(obs.parentId) : undefined;
          // If an owner row can't be resolved (defensive — the child_id/parent_id
          // FKs plus soft-delete-only make this unreachable today) we cannot scrub
          // its name from the note. Rather than seal un-scrubbed PII into a row
          // marked "anonymised", clear the note entirely (PII cleared, AC2/AC3) and
          // surface the anomaly loudly.
          const ownerUnresolved = Boolean((obs.childId && !child) || (obs.parentId && !parent));
          if (ownerUnresolved) {
            unresolved += 1;
            log.warn(
              { event: "anonymise.observations.unresolved_name", observation_id: obs.id },
              "anonymise: could not resolve an owner name; clearing note to avoid sealing PII",
            );
          }
          const scrubbed = ownerUnresolved
            ? null
            : anonymiseNote(
                obs.note,
                child ? [child.firstName, child.lastName] : [],
                parent ? [parent.firstName, parent.lastName] : [],
              );
          try {
            await db.transaction(async (tx) => {
              await tx
                .update(observations)
                .set({ note: scrubbed, childId: null, parentId: null, anonymisedAt: at })
                .where(eq(observations.id, obs.id));
              await audit(tx, {
                actor: null,
                action: "observation.anonymised",
                target: { table: "observations", id: obs.id },
                // child_id/parent_id are opaque UUIDs (not names) — recording them
                // keeps a forensic "subject X was anonymised" trail post-clear.
                payload: { booking_id: obs.bookingId, child_id: obs.childId, parent_id: obs.parentId, cutoff: cutoff.toISOString() },
              });
            });
            total += 1;
          } catch (err) {
            // Isolate a bad row so it never aborts the rest of the nightly run.
            // Record it so the scan skips past it instead of re-fetching the same
            // failing page (which would starve newer rows); it retries next run.
            failed += 1;
            failedIds.push(obs.id);
            log.warn(
              { event: "anonymise.observations.row_failed", observation_id: obs.id, err: String(err) },
              "anonymise: row failed, continuing",
            );
          }
        }

        if (due.length < batchSize) break;
      }

      // AC4: the run + counts are logged.
      log.info(
        { event: "anonymise.observations", count: total, failed, unresolved, cutoff: cutoff.toISOString() },
        `anonymised ${total} observation(s) older than ${RETENTION_MONTHS} months`,
      );
    },
  };
}
