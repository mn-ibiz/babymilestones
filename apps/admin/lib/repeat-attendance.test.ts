import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchRepeatAttendance,
  repeatAttendanceTable,
  defaultRepeatAttendanceRange,
  isValidRepeatAttendanceRange,
  type RepeatAttendanceReport,
  type RepeatAttendanceRange,
} from "./repeat-attendance";

/**
 * P6-E06-S03 (Story 35.3) — admin repeat-attendance client logic. Verifies the
 * fetch posture (credentialed, range params), the range validity guard (reuses the
 * shared schema), the default 30-day range, and the table shaping (delegates to the
 * contracts view-model).
 */
describe("admin repeat-attendance lib (Story 35.3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function dto(): RepeatAttendanceReport {
    return {
      from: "2026-06-01",
      to: "2026-06-30",
      classes: [
        { classId: "service:a", label: "Music", totalAttendees: 4, repeatAttendees: 3, repeatAttendeePct: 75, avgClassesAttended: 1.8 },
      ],
      summary: { totalClasses: 1, totalAttendees: 4, repeatAttendees: 3, repeatAttendeePct: 75, avgClassesAttended: 1.8 },
    };
  }

  it("fetches the report with credentials + range params (AC2)", async () => {
    const body = dto();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchRepeatAttendance({ fromDate: "2026-06-01", toDate: "2026-06-30" });
    expect(out.summary.totalAttendees).toBe(4);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/repeat-attendance?fromDate=2026-06-01&toDate=2026-06-30");
    expect(init?.credentials).toBe("include");
  });

  it("throws the server error on a non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Forbidden: missing permission" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(fetchRepeatAttendance({ fromDate: "2026-06-01", toDate: "2026-06-30" })).rejects.toThrow(
      "Forbidden: missing permission",
    );
  });

  it("shapes the report into the labelled table (AC1)", () => {
    const vm = repeatAttendanceTable(dto());
    expect(vm.rows[0]!.repeatAttendeePctLabel).toBe("75.0%");
    expect(vm.rows[0]!.avgClassesAttendedLabel).toBe("1.8");
    expect(vm.summary.totalAttendees).toBe(4);
  });

  it("defaults to a 30-day range ending today", () => {
    const r = defaultRepeatAttendanceRange(new Date("2026-06-30T12:00:00Z"));
    expect(r.toDate).toBe("2026-06-30");
    expect(r.fromDate).toBe("2026-06-01");
  });

  it("validates the range with the shared schema (AC2)", () => {
    expect(isValidRepeatAttendanceRange({ fromDate: "2026-06-01", toDate: "2026-06-30" })).toBe(true);
    expect(isValidRepeatAttendanceRange({ fromDate: "2026-06-30", toDate: "2026-06-01" })).toBe(false);
  });

  // Re-export type alias is exercised by the calls above.
  it("re-exports the report type", () => {
    const _r: RepeatAttendanceRange = { fromDate: "2026-06-01", toDate: "2026-06-30" };
    expect(_r.fromDate).toBe("2026-06-01");
  });
});
