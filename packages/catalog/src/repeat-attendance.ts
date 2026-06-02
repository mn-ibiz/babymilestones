/**
 * P6-E06-S03 (Story 35.3) — Repeat-attendance metrics for events and classes.
 *
 * A pure read-model that turns a flat list of attendance records (a parent
 * identity attended a class on a date, already narrowed to the window by the DB
 * read) into a per-class table (AC1) plus an overall summary:
 *
 *  - totalAttendees       = distinct parents who attended THIS class,
 *  - repeatAttendeePct    = share of this class's attendees who ALSO attended ≥1
 *                           OTHER distinct class in the window (a "repeat"),
 *  - avgClassesAttended   = mean number of DISTINCT classes attended (across all
 *                           classes in the window) per attendee of this class.
 *
 * Definitions:
 *  - A "class" is one event (Epic 30) OR one class-type booking-cohort (a `talent`
 *    or `coaching` service) — the DB read decides the set + assigns each a stable
 *    `classId` + human `classLabel`.
 *  - A parent "attended another class" iff they attended ≥2 DISTINCT classes in the
 *    window. So a parent in exactly one class is never a repeat; a parent in N≥2
 *    classes is a repeat in EVERY one of them.
 *  - Attending the SAME class twice (two records, same parentId+classId) is one
 *    attendance — de-duped — and never makes the parent a repeat on its own.
 *
 * The DB read ({@link loadRepeatAttendance} in `repeat-attendance-db.ts`) stays a
 * thin projection — it applies the AC2 date filter and emits the records — so this
 * aggregation is exhaustively unit-tested with no I/O (the Epic-27 reporting split).
 */

/** One attendance record: a parent identity attended a class on a date (in window). */
export interface RepeatAttendanceRecord {
  /** The attendee identity — a parent id (class bookings) or buyer phone (events). */
  parentId: string;
  /** Stable id of the class/event attended. */
  classId: string;
  /** Human label for the class/event (carried through to the row). */
  classLabel: string;
  /** Attendance date (`YYYY-MM-DD`, UTC) — informational; window is applied upstream. */
  date: string;
}

/** The inputs the aggregation reduces — the DB read hands these in (already in window). */
export interface RepeatAttendanceInput {
  /** Inclusive lower bound of the window (`YYYY-MM-DD`). Echoed back. */
  from: string;
  /** Inclusive upper bound of the window (`YYYY-MM-DD`). Echoed back. */
  to: string;
  /** Every attendance record in the window. Order/duplicates don't matter. */
  records: readonly RepeatAttendanceRecord[];
}

/** One per-class row of the metrics table (AC1). */
export interface RepeatAttendanceRow {
  classId: string;
  label: string;
  /** Distinct parents who attended this class. */
  totalAttendees: number;
  /** Of {@link totalAttendees}, how many also attended ≥1 other class in the window. */
  repeatAttendees: number;
  /** `repeatAttendees / totalAttendees` as a percentage, one decimal place. */
  repeatAttendeePct: number;
  /** Mean distinct classes (in the window) per attendee of this class, one decimal. */
  avgClassesAttended: number;
}

/** The overall summary across every class in the window (AC1). */
export interface RepeatAttendanceSummary {
  /** Distinct classes that had ≥1 attendee in the window. */
  totalClasses: number;
  /** Distinct parents who attended ANY class in the window. */
  totalAttendees: number;
  /** Of {@link totalAttendees}, how many attended ≥2 distinct classes (repeats). */
  repeatAttendees: number;
  /** `repeatAttendees / totalAttendees` as a percentage, one decimal place. */
  repeatAttendeePct: number;
  /** Mean distinct classes per attendee across the window, one decimal place. */
  avgClassesAttended: number;
}

/** The fully-reduced repeat-attendance report (AC1). */
export interface RepeatAttendanceReport {
  from: string;
  to: string;
  /** Per-class rows, ordered by attendees desc, then label, then id. */
  classes: RepeatAttendanceRow[];
  summary: RepeatAttendanceSummary;
}

/** Round to one decimal place (avoids binary float noise like 66.66666…). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Reduce attendance records to the per-class table + overall summary (AC1). Pure —
 * no I/O. Each parent's DISTINCT-class set is built first, so a parent is a "repeat"
 * exactly when that set has ≥2 entries; that flag is then projected onto every class
 * the parent attended. Attending one class multiple times is de-duped to a single
 * attendance. Per-class rows are ordered attendees desc, then label, then id.
 */
export function aggregateRepeatAttendance(inputData: RepeatAttendanceInput): RepeatAttendanceReport {
  // parentId -> set of distinct classIds that parent attended in the window.
  const classesByParent = new Map<string, Set<string>>();
  // classId -> { label, attendees (distinct parentIds) }.
  const classInfo = new Map<string, { label: string; attendees: Set<string> }>();

  for (const r of inputData.records) {
    let parentSet = classesByParent.get(r.parentId);
    if (!parentSet) {
      parentSet = new Set<string>();
      classesByParent.set(r.parentId, parentSet);
    }
    parentSet.add(r.classId);

    let info = classInfo.get(r.classId);
    if (!info) {
      info = { label: r.classLabel, attendees: new Set<string>() };
      classInfo.set(r.classId, info);
    }
    info.attendees.add(r.parentId);
  }

  /** True iff this parent attended ≥2 distinct classes in the window. */
  const isRepeat = (parentId: string): boolean => (classesByParent.get(parentId)?.size ?? 0) >= 2;

  const classes: RepeatAttendanceRow[] = [...classInfo.entries()].map(([classId, info]) => {
    const attendees = [...info.attendees];
    const totalAttendees = attendees.length;
    const repeatAttendees = attendees.filter(isRepeat).length;
    const sumDistinct = attendees.reduce(
      (acc, parentId) => acc + (classesByParent.get(parentId)?.size ?? 0),
      0,
    );
    return {
      classId,
      label: info.label,
      totalAttendees,
      repeatAttendees,
      repeatAttendeePct: totalAttendees > 0 ? round1((repeatAttendees / totalAttendees) * 100) : 0,
      avgClassesAttended: totalAttendees > 0 ? round1(sumDistinct / totalAttendees) : 0,
    };
  });

  classes.sort(
    (a, b) =>
      b.totalAttendees - a.totalAttendees ||
      a.label.localeCompare(b.label) ||
      (a.classId < b.classId ? -1 : a.classId > b.classId ? 1 : 0),
  );

  const totalAttendees = classesByParent.size;
  let repeatAttendees = 0;
  let sumDistinctAll = 0;
  for (const set of classesByParent.values()) {
    if (set.size >= 2) repeatAttendees += 1;
    sumDistinctAll += set.size;
  }

  const summary: RepeatAttendanceSummary = {
    totalClasses: classInfo.size,
    totalAttendees,
    repeatAttendees,
    repeatAttendeePct: totalAttendees > 0 ? round1((repeatAttendees / totalAttendees) * 100) : 0,
    avgClassesAttended: totalAttendees > 0 ? round1(sumDistinctAll / totalAttendees) : 0,
  };

  return { from: inputData.from, to: inputData.to, classes, summary };
}
