import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStaffLeaderboard,
  fetchStaffCommission,
  leaderboardRows,
  commissionView,
  roleOptions,
  defaultLeaderboardRange,
  isValidLeaderboardRange,
  type StaffLeaderboard,
  type StaffCommissionDrilldown,
} from "./staff-leaderboard";

/**
 * P3-E05-S03 (Story 27.3) — admin top-staff-leaderboard client logic. Framework-
 * free so it unit-tests without React: the read seams over the admin-gated
 * `/admin/staff-leaderboard` (+ `/:staffId/commission`) API (date-range + role
 * filter), the render-ready row + drill-down view-models (re-exported from
 * `@bm/contracts`), the role-filter options (AC2), and the range helpers.
 */

function report(over: Partial<StaffLeaderboard> = {}): StaffLeaderboard {
  return {
    from: "2026-06-01",
    to: "2026-06-07",
    rows: [
      { staffId: "s1", staffName: "Asha", role: "stylist", revenueCents: 12_000, serviceCount: 4, avgTicketCents: 3000 },
      { staffId: "s2", staffName: "Bree", role: "stylist", revenueCents: 0, serviceCount: 0, avgTicketCents: 0 },
    ],
    ...over,
  };
}

describe("fetchStaffLeaderboard (Story 27.3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the leaderboard with the date-range + role filter (credentialed) (AC1/AC2)", async () => {
    const dto = report();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchStaffLeaderboard({ fromDate: "2026-06-01", toDate: "2026-06-07", role: "stylist" });
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/staff-leaderboard?");
    expect(String(url)).toContain("fromDate=2026-06-01");
    expect(String(url)).toContain("toDate=2026-06-07");
    expect(String(url)).toContain("role=stylist");
    expect(init?.credentials).toBe("include");
  });

  it("omits the role param when no role is selected (AC2)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(report()), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchStaffLeaderboard({ fromDate: "2026-06-01", toDate: "2026-06-07", role: "" });
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("role=");
  });

  it("surfaces a 403 (forbidden) as the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Forbidden: missing permission" }), { status: 403, headers: { "content-type": "application/json" } })),
    );
    await expect(fetchStaffLeaderboard({ fromDate: "2026-06-01", toDate: "2026-06-07", role: "" })).rejects.toThrow(/forbidden/i);
  });
});

describe("fetchStaffCommission drill-down (AC3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads one staff member's commission totals for the same range (credentialed)", async () => {
    const drill: StaffCommissionDrilldown = {
      staffId: "s1",
      staffName: "Asha",
      role: "stylist",
      from: "2026-06-01",
      to: "2026-06-07",
      totals: { netCents: 1800, accruedCents: 2300, reversedCents: 500, entryCount: 3 },
    };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(drill), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchStaffCommission("s1", { fromDate: "2026-06-01", toDate: "2026-06-07" });
    expect(out.totals.netCents).toBe(1800);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/staff-leaderboard/s1/commission?");
    expect(init?.credentials).toBe("include");
  });
});

describe("leaderboard view-models + role options (AC1/AC2/AC3)", () => {
  it("shapes the leaderboard rows with formatted metrics + a drill-down href (AC1/AC3)", () => {
    const rows = leaderboardRows(report());
    expect(rows[0]).toMatchObject({ staffName: "Asha", revenue: "KES 120.00", serviceCount: "4", avgTicket: "KES 30.00" });
    expect(rows[0]!.href).toContain("/operations/leaderboard/s1");
    // Zero-service staff renders zero, not NaN.
    expect(rows[1]).toMatchObject({ staffName: "Bree", avgTicket: "KES 0.00" });
  });

  it("shapes the commission drill-down totals (AC3)", () => {
    const view = commissionView({
      staffId: "s1",
      staffName: "Asha",
      role: "stylist",
      from: "2026-06-01",
      to: "2026-06-07",
      totals: { netCents: 1800, accruedCents: 2300, reversedCents: 500, entryCount: 3 },
    });
    expect(view.netCommission).toBe("KES 18.00");
    expect(view.roleLabel).toBe("Stylist");
  });

  it("offers an 'all roles' option plus every attribution role (AC2)", () => {
    const opts = roleOptions();
    expect(opts[0]).toEqual({ value: "", label: "All roles" });
    expect(opts.map((o) => o.value)).toContain("stylist");
  });
});

describe("range helpers (AC1)", () => {
  it("defaults to a 7-day range ending today (inclusive)", () => {
    const r = defaultLeaderboardRange(new Date("2026-06-14T12:00:00Z"));
    expect(r.toDate).toBe("2026-06-14");
    expect(r.fromDate).toBe("2026-06-08");
  });

  it("validates fromDate <= toDate", () => {
    expect(isValidLeaderboardRange({ fromDate: "2026-06-01", toDate: "2026-06-07" })).toBe(true);
    expect(isValidLeaderboardRange({ fromDate: "2026-06-08", toDate: "2026-06-01" })).toBe(false);
  });
});
