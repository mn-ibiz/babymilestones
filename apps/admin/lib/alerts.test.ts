import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAdminAlerts,
  dismissAdminAlert,
  adminAlertView,
  unreadAlertCount,
  type AdminAlert,
} from "./alerts";

/**
 * P6-E04-S03 (Story 34.3) — admin in-app alerts client logic. Framework-free so it
 * unit-tests without React: the read seam over the admin-gated `/admin/alerts` API
 * (the bell), the dismiss seam, and the alert-list view-model (each row links to
 * the feedback detail, AC2).
 */

function alert(over: Partial<AdminAlert> = {}): AdminAlert {
  return {
    id: "a1",
    type: "negative_feedback",
    severity: "warning",
    sourceType: "feedback",
    sourceId: "f1",
    title: "Low rating (1/5) for Salon",
    body: "A 1/5 rating was left for Salon.",
    linkPath: "/feedback?focus=f1",
    createdAt: "2026-06-12T10:05:00.000Z",
    ...over,
  };
}

describe("fetchAdminAlerts (Story 34.3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the unread alerts from the admin endpoint (credentialed)", async () => {
    const payload = { alerts: [alert()], count: 1 };
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchAdminAlerts();
    expect(out.count).toBe(1);
    expect(out.alerts[0]!.sourceId).toBe("f1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/alerts");
    expect(init?.credentials).toBe("include");
  });

  it("surfaces a 403 (forbidden) as the server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Forbidden: missing permission" }), { status: 403 }),
      ),
    );
    await expect(fetchAdminAlerts()).rejects.toThrow(/forbidden/i);
  });
});

describe("dismissAdminAlert (Story 34.3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POSTs the dismiss to the admin endpoint with the alert id (credentialed + CSRF)", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "a1", dismissed: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await dismissAdminAlert("a1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/admin/alerts/a1/dismiss");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
  });
});

describe("admin alert view-model (AC2)", () => {
  it("shapes alerts into rows that link to the feedback detail, newest-first", () => {
    const older = alert({ id: "a0", createdAt: "2026-06-10T08:00:00.000Z" });
    const rows = adminAlertView([older, alert()]);
    expect(rows.map((r) => r.id)).toEqual(["a1", "a0"]);
    expect(rows[0]!.href).toBe("/feedback?focus=f1");
    expect(rows[0]!.date).toBe("2026-06-12");
  });

  it("reports the unread count for the bell badge", () => {
    expect(unreadAlertCount([alert(), alert({ id: "a2" })])).toBe(2);
    expect(unreadAlertCount([])).toBe(0);
  });
});
