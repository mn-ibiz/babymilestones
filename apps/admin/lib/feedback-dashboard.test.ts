import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchFeedbackDashboard,
  fetchFeedbackResponses,
  feedbackUnitView,
  feedbackStaffView,
  feedbackResponsesView,
  feedbackDistributionView,
  type FeedbackDashboard,
  type FeedbackResponse,
} from "./feedback-dashboard";

/**
 * P6-E04-S02 (Story 34.2) — admin feedback-dashboard client logic. Framework-free
 * so it unit-tests without React: the read seam over the admin-gated
 * `/admin/feedback-dashboard` API + the unit / staff / response view-models
 * (formatting averages, distribution bars, the low-sample badge). The reveal seam
 * is exercised via the `reveal` flag.
 */

function dashboard(over: Partial<FeedbackDashboard> = {}): FeedbackDashboard {
  return {
    from: "2026-06-01",
    to: "2026-06-30",
    totalResponses: 7,
    units: [
      { unit: "salon", count: 5, average: 4.2, distribution: [0, 1, 0, 0, 0, 4] },
      { unit: "coaching", count: 2, average: 3, distribution: [0, 0, 1, 0, 1, 0] },
    ],
    staff: [
      { staffId: "s1", staffName: "Asha", count: 5, average: 4.2, enoughSamples: true },
      { staffId: "s2", staffName: "Bree", count: 2, average: null, enoughSamples: false },
    ],
    ...over,
  };
}

describe("fetchFeedbackDashboard (Story 34.2)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the dashboard from the admin endpoint with the date range (credentialed)", async () => {
    const dto = dashboard();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(dto), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchFeedbackDashboard({ fromDate: "2026-06-01", toDate: "2026-06-30" });
    expect(out).toEqual(dto);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/feedback-dashboard?");
    expect(String(url)).toContain("fromDate=2026-06-01");
    expect(String(url)).toContain("toDate=2026-06-30");
    expect(init?.credentials).toBe("include");
  });

  it("surfaces a 403 (forbidden) as the server error", async () => {
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
    await expect(fetchFeedbackDashboard({ fromDate: "2026-06-01", toDate: "2026-06-30" })).rejects.toThrow(/forbidden/i);
  });
});

describe("fetchFeedbackResponses (Story 34.2 AC3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests anonymised responses by default", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ responses: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchFeedbackResponses({ fromDate: "2026-06-01", toDate: "2026-06-30", unit: "salon" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/feedback-dashboard/responses?");
    expect(String(url)).toContain("unit=salon");
    expect(String(url)).not.toContain("reveal=true");
  });

  it("adds reveal=true when de-anonymising (AC3)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ responses: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchFeedbackResponses({ fromDate: "2026-06-01", toDate: "2026-06-30", staffId: "s1", reveal: true });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("reveal=true");
    expect(String(url)).toContain("staffId=s1");
  });
});

describe("feedback dashboard view-models (AC1/AC3)", () => {
  it("shapes per-unit rows: label, formatted average, drill-down (AC1)", () => {
    const rows = feedbackUnitView(dashboard());
    const salon = rows.find((r) => r.unit === "salon")!;
    expect(salon.label).toBe("Salon");
    expect(salon.average).toBe("4.2");
    expect(salon.href).toContain("unit=salon");
  });

  it("shapes per-staff rows: surfaces a low-sample badge instead of the average (AC1 guardrail)", () => {
    const rows = feedbackStaffView(dashboard());
    const asha = rows.find((r) => r.staffId === "s1")!;
    expect(asha.average).toBe("4.2");
    expect(asha.lowSample).toBe(false);
    const bree = rows.find((r) => r.staffId === "s2")!;
    expect(bree.average).toBe("—");
    expect(bree.lowSample).toBe(true);
  });

  it("renders a 0..5 distribution bar that sums to the unit count (AC1)", () => {
    const bars = feedbackDistributionView([0, 1, 0, 0, 0, 4]);
    expect(bars).toHaveLength(6);
    expect(bars.reduce((a, b) => a + b.count, 0)).toBe(5);
  });

  it("shapes anonymised responses WITHOUT a parent name (AC3)", () => {
    const responses: FeedbackResponse[] = [
      { id: "f1", unit: "salon", staffId: "s1", staffName: "Asha", rating: 5, comment: "Lovely", submittedAt: "2026-06-12T10:00:00.000Z" },
    ];
    const rows = feedbackResponsesView(responses);
    expect(rows[0]!.parentName).toBeUndefined();
    expect(rows[0]).toMatchObject({ staffName: "Asha", rating: 5 });
  });

  it("surfaces the parent name on a de-anonymised response (AC3)", () => {
    const responses: FeedbackResponse[] = [
      { id: "f1", unit: "salon", staffId: "s1", staffName: "Asha", rating: 5, comment: null, submittedAt: "2026-06-12T10:00:00.000Z", parentId: "p1", parentName: "Pat Doe" },
    ];
    const rows = feedbackResponsesView(responses);
    expect(rows[0]!.parentName).toBe("Pat Doe");
  });
});
