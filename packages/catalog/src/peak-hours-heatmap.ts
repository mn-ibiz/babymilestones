/**
 * P3-E05-S05 (Story 27.5) — peak-hours heatmap aggregation.
 *
 * "When is the complex busiest?" expressed as a weekday × hour-of-day grid whose
 * cell intensity is the count of ACTIVE SESSIONS that fall in that bucket over the
 * selected range (AC1). A "session" is an attendance check-in (`attendances` row);
 * its timestamp is `attendances.checkedInAt` and its unit comes via the attendance's
 * booking → service → `services.unit` (the unit filter, AC2, is applied by the DB
 * read). The range is capped at 12 months by the contract layer (AC3).
 *
 * CONVENTIONS (consistent with the rest of reporting — 27.1 / 27.2 key on UTC):
 *  - WEEKDAY: 0 = Sunday … 6 = Saturday — JS `Date#getUTCDay()`, in UTC.
 *  - HOUR: 0 … 23 — `Date#getUTCHours()`, in UTC.
 *
 * The pure {@link aggregatePeakHoursHeatmap} reducer takes the period's already-
 * projected session timestamps (the DB read does the join + filter) and returns a
 * fully zero-filled 7×24 grid, the total session count, and the single hottest cell
 * (the peak). No I/O — exhaustively unit-tested, the same split 27.1 / 27.2 use.
 */

/** The weekday axis of the heatmap: 0=Sun … 6=Sat (UTC). */
export const HEATMAP_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** The hour-of-day axis of the heatmap: 0 … 23 (UTC). */
export const HEATMAP_HOURS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
] as const;

const WEEKDAY_COUNT = 7;
const HOUR_COUNT = 24;

/** One active session, projected to exactly what the heatmap needs. */
export interface PeakHoursSessionRow {
  /** When the session checked in — ISO-8601 instant (the DB read serialises it). */
  checkedInAt: string | Date;
}

/** Inputs the heatmap aggregation reduces — the DB read hands these in. */
export interface PeakHoursHeatmapInput {
  /** Inclusive range start (`YYYY-MM-DD`). Echoed back on the result. */
  from: string;
  /** Inclusive range end (`YYYY-MM-DD`). Echoed back on the result. */
  to: string;
  /** The range's active-session check-ins (already unit-filtered upstream). */
  sessions: readonly PeakHoursSessionRow[];
}

/** The single hottest weekday+hour cell in the grid (null when the grid is empty). */
export interface PeakHoursCell {
  /** 0=Sun … 6=Sat (UTC). */
  weekday: number;
  /** 0 … 23 (UTC). */
  hour: number;
  /** Active sessions in this cell. */
  count: number;
}

/** The fully-reduced peak-hours heatmap (AC1). */
export interface PeakHoursHeatmap {
  from: string;
  to: string;
  /**
   * A 7×24 grid: `cells[weekday][hour]` = active sessions in that bucket. Always
   * fully populated (zero-filled) so the heatmap renders a stable grid.
   */
  cells: number[][];
  /** Total active sessions across the grid (sums every cell). */
  totalSessions: number;
  /** The single hottest cell, or null when no sessions fell in the range. */
  peak: PeakHoursCell | null;
}

/** A fresh 7×24 grid of zeros. */
function emptyGrid(): number[][] {
  return Array.from({ length: WEEKDAY_COUNT }, () => Array.from({ length: HOUR_COUNT }, () => 0));
}

/**
 * Reduce the range's session check-ins to the 7×24 weekday×hour grid (AC1). Pure —
 * no I/O. Each session is bucketed by its UTC weekday (0=Sun … 6=Sat) and UTC hour
 * (0 … 23); the grid is always fully zero-filled. The peak is the single hottest
 * cell (ties resolve to the earliest weekday, then earliest hour); null when empty.
 */
export function aggregatePeakHoursHeatmap(inputData: PeakHoursHeatmapInput): PeakHoursHeatmap {
  const cells = emptyGrid();
  let totalSessions = 0;

  for (const s of inputData.sessions) {
    const when = s.checkedInAt instanceof Date ? s.checkedInAt : new Date(s.checkedInAt);
    const weekday = when.getUTCDay();
    const hour = when.getUTCHours();
    cells[weekday]![hour]! += 1;
    totalSessions += 1;
  }

  let peak: PeakHoursCell | null = null;
  for (const weekday of HEATMAP_WEEKDAYS) {
    for (const hour of HEATMAP_HOURS) {
      const count = cells[weekday]![hour]!;
      if (count > 0 && (peak === null || count > peak.count)) {
        peak = { weekday, hour, count };
      }
    }
  }

  return { from: inputData.from, to: inputData.to, cells, totalSessions, peak };
}
