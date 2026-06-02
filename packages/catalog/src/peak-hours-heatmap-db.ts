import { and, eq, gte, lt } from "drizzle-orm";
import { attendances, bookings, services } from "@bm/db";
import type { Executor, ServiceUnit } from "./services.js";
import {
  aggregatePeakHoursHeatmap,
  type PeakHoursHeatmap,
  type PeakHoursSessionRow,
} from "./peak-hours-heatmap.js";

/**
 * P3-E05-S05 (Story 27.5) — DB read behind the peak-hours heatmap. A thin
 * projection: for the selected `[from, to]` range it loads each active session
 * (an `attendances` check-in) joined to its booking → service → unit, optionally
 * narrowed to a single unit (AC2), then hands the check-in timestamps to the pure
 * {@link aggregatePeakHoursHeatmap} reducer. Read-only.
 *
 * Boundaries are UTC `[from 00:00, (to+1) 00:00)` — the inclusive calendar range
 * `[from, to]` — keyed on `attendances.checkedInAt` (the session start; the same
 * field the operations dashboard counts active sessions on), matching how the rest
 * of reporting keys time. The reducer buckets by UTC weekday × hour (AC1).
 */
export interface LoadPeakHoursHeatmapOpts {
  /** Inclusive range start (`YYYY-MM-DD`). */
  from: string;
  /** Inclusive range end (`YYYY-MM-DD`). */
  to: string;
  /** Optional single-unit filter (AC2). Absent = all units. */
  unit?: ServiceUnit;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → the UTC start of that calendar day. */
function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` → the UTC start of the NEXT calendar day (exclusive upper bound). */
function nextDayStart(date: string): Date {
  return new Date(dayStart(date).getTime() + DAY_MS);
}

/**
 * Load the peak-hours heatmap for an inclusive `[from, to]` range (AC1/AC2). Loads
 * the range's attendance check-ins joined to the service unit (optionally narrowed
 * to one unit), then delegates the weekday×hour bucketing to the pure
 * {@link aggregatePeakHoursHeatmap}. Read-only — no audit.
 */
export async function loadPeakHoursHeatmap(
  db: Executor,
  opts: LoadPeakHoursHeatmapOpts,
): Promise<PeakHoursHeatmap> {
  const rangeStart = dayStart(opts.from);
  const rangeEnd = nextDayStart(opts.to);

  const rows = await db
    .select({ checkedInAt: attendances.checkedInAt, unit: services.unit })
    .from(attendances)
    .innerJoin(bookings, eq(attendances.bookingId, bookings.id))
    .leftJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        gte(attendances.checkedInAt, rangeStart),
        lt(attendances.checkedInAt, rangeEnd),
        opts.unit ? eq(services.unit, opts.unit) : undefined,
      ),
    );

  const sessions: PeakHoursSessionRow[] = rows.map((r) => ({ checkedInAt: r.checkedInAt }));

  return aggregatePeakHoursHeatmap({ from: opts.from, to: opts.to, sessions });
}
