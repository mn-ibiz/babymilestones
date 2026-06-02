import { describe, expect, it } from "vitest";
import {
  aggregateRepeatAttendance,
  type RepeatAttendanceInput,
  type RepeatAttendanceRecord,
} from "./repeat-attendance.js";

/**
 * P6-E06-S03 (Story 35.3) — repeat-attendance metrics. The pure
 * {@link aggregateRepeatAttendance} reducer turns a flat list of attendance records
 * (a parent identity attended a class on a date, in the window) into a per-class
 * table (AC1) + an overall summary:
 *
 *  - totalAttendees       = distinct parents who attended THIS class,
 *  - repeatAttendeePct    = share of this class's attendees who ALSO attended ≥1
 *                           OTHER distinct class in the window (a "repeat"),
 *  - avgClassesAttended   = mean number of DISTINCT classes attended (across all
 *                           classes in the window) per attendee of this class.
 *
 * "Attended another class" = the same parent attended ≥2 distinct classes in the
 * window. The reducer is pure — no I/O; the DB read does the projection (AC2 date
 * filter is applied at the read seam over the records it hands in).
 */

function input(over: Partial<RepeatAttendanceInput> = {}): RepeatAttendanceInput {
  return {
    from: "2026-06-01",
    to: "2026-06-30",
    records: [],
    ...over,
  };
}

function rec(over: Partial<RepeatAttendanceRecord> = {}): RepeatAttendanceRecord {
  return {
    parentId: "p1",
    classId: "c1",
    classLabel: "Class 1",
    date: "2026-06-10",
    ...over,
  };
}

describe("aggregateRepeatAttendance (Story 35.3)", () => {
  it("returns an empty report for no records (AC1)", () => {
    const out = aggregateRepeatAttendance(input());
    expect(out.classes).toEqual([]);
    expect(out.summary).toEqual({
      totalClasses: 0,
      totalAttendees: 0,
      repeatAttendees: 0,
      repeatAttendeePct: 0,
      avgClassesAttended: 0,
    });
  });

  it("counts distinct attendees per class, de-duping repeat attendance of the SAME class (AC1)", () => {
    const out = aggregateRepeatAttendance(
      input({
        records: [
          rec({ parentId: "p1", classId: "c1" }),
          rec({ parentId: "p1", classId: "c1", date: "2026-06-12" }), // same parent, same class twice
          rec({ parentId: "p2", classId: "c1" }),
        ],
      }),
    );
    const c1 = out.classes.find((c) => c.classId === "c1")!;
    expect(c1.totalAttendees).toBe(2);
  });

  it("marks a parent in 2 classes as a repeat in BOTH classes (AC1)", () => {
    // p1 attends c1 + c2 → repeat in both. p2 attends only c1 → not a repeat.
    const out = aggregateRepeatAttendance(
      input({
        records: [
          rec({ parentId: "p1", classId: "c1", classLabel: "Class 1" }),
          rec({ parentId: "p1", classId: "c2", classLabel: "Class 2" }),
          rec({ parentId: "p2", classId: "c1", classLabel: "Class 1" }),
        ],
      }),
    );
    const c1 = out.classes.find((c) => c.classId === "c1")!;
    const c2 = out.classes.find((c) => c.classId === "c2")!;

    // c1: 2 attendees (p1, p2); only p1 is a repeat → 50%.
    expect(c1.totalAttendees).toBe(2);
    expect(c1.repeatAttendees).toBe(1);
    expect(c1.repeatAttendeePct).toBe(50);
    // c2: 1 attendee (p1); p1 is a repeat → 100%.
    expect(c2.totalAttendees).toBe(1);
    expect(c2.repeatAttendees).toBe(1);
    expect(c2.repeatAttendeePct).toBe(100);
  });

  it("does not count a single-class attendee as a repeat (AC1)", () => {
    const out = aggregateRepeatAttendance(
      input({
        records: [
          rec({ parentId: "p1", classId: "c1" }),
          rec({ parentId: "p2", classId: "c1" }),
          rec({ parentId: "p3", classId: "c1" }),
        ],
      }),
    );
    const c1 = out.classes.find((c) => c.classId === "c1")!;
    expect(c1.totalAttendees).toBe(3);
    expect(c1.repeatAttendees).toBe(0);
    expect(c1.repeatAttendeePct).toBe(0);
  });

  it("computes avgClassesAttended as the mean DISTINCT classes per attendee of the class (AC1)", () => {
    // c1 attendees: p1 (in c1,c2,c3 → 3 distinct), p2 (in c1,c2 → 2), p3 (in c1 → 1).
    // avg = (3 + 2 + 1) / 3 = 2.0
    const out = aggregateRepeatAttendance(
      input({
        records: [
          rec({ parentId: "p1", classId: "c1" }),
          rec({ parentId: "p1", classId: "c2" }),
          rec({ parentId: "p1", classId: "c3" }),
          rec({ parentId: "p2", classId: "c1" }),
          rec({ parentId: "p2", classId: "c2" }),
          rec({ parentId: "p3", classId: "c1" }),
        ],
      }),
    );
    const c1 = out.classes.find((c) => c.classId === "c1")!;
    expect(c1.avgClassesAttended).toBe(2);
  });

  it("rounds repeatAttendeePct + avgClassesAttended to one decimal place", () => {
    // c1 attendees: p1 (c1,c2 → 2), p2 (c1,c2,c3 → 3), p3 (c1 → 1).
    // avg = (2 + 3 + 1) / 3 = 2.0; repeat = p1,p2 → 2/3 = 66.7%.
    const out = aggregateRepeatAttendance(
      input({
        records: [
          rec({ parentId: "p1", classId: "c1" }),
          rec({ parentId: "p1", classId: "c2" }),
          rec({ parentId: "p2", classId: "c1" }),
          rec({ parentId: "p2", classId: "c2" }),
          rec({ parentId: "p2", classId: "c3" }),
          rec({ parentId: "p3", classId: "c1" }),
        ],
      }),
    );
    const c1 = out.classes.find((c) => c.classId === "c1")!;
    expect(c1.repeatAttendeePct).toBe(66.7);
    expect(c1.avgClassesAttended).toBe(2);
  });

  it("orders classes by totalAttendees desc, then label, then id", () => {
    const out = aggregateRepeatAttendance(
      input({
        records: [
          rec({ parentId: "p1", classId: "c1", classLabel: "Alpha" }),
          rec({ parentId: "p2", classId: "c2", classLabel: "Beta" }),
          rec({ parentId: "p3", classId: "c2", classLabel: "Beta" }),
        ],
      }),
    );
    // c2 has 2 attendees, c1 has 1 → c2 first.
    expect(out.classes.map((c) => c.classId)).toEqual(["c2", "c1"]);
  });

  it("carries the class label through to the row", () => {
    const out = aggregateRepeatAttendance(
      input({ records: [rec({ classId: "c9", classLabel: "Recital Night" })] }),
    );
    expect(out.classes[0]!.label).toBe("Recital Night");
  });

  it("summarises across the window: total classes/attendees + overall repeat % + avg (AC1)", () => {
    // p1: c1,c2 (repeat). p2: c1 only (not). p3: c2 only (not).
    // distinct attendees = 3; repeat attendees = 1 → 33.3%.
    // avg distinct classes per attendee = (2 + 1 + 1) / 3 = 1.333… → 1.3.
    const out = aggregateRepeatAttendance(
      input({
        records: [
          rec({ parentId: "p1", classId: "c1" }),
          rec({ parentId: "p1", classId: "c2" }),
          rec({ parentId: "p2", classId: "c1" }),
          rec({ parentId: "p3", classId: "c2" }),
        ],
      }),
    );
    expect(out.summary.totalClasses).toBe(2);
    expect(out.summary.totalAttendees).toBe(3);
    expect(out.summary.repeatAttendees).toBe(1);
    expect(out.summary.repeatAttendeePct).toBe(33.3);
    expect(out.summary.avgClassesAttended).toBe(1.3);
  });

  it("echoes the window bounds on the report (AC2)", () => {
    const out = aggregateRepeatAttendance(input({ from: "2026-05-01", to: "2026-05-31" }));
    expect(out.from).toBe("2026-05-01");
    expect(out.to).toBe("2026-05-31");
  });
});
