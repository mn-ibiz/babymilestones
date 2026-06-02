"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LeaderboardPage from "./page";

/**
 * P3-E05-S03 (Story 27.3) — top-staff-leaderboard page render-contract. First
 * paint shows the heading, the date-range picker (AC1), and the role-filter
 * control (AC2) before the fetch resolves. The leaderboard table + per-row
 * drill-down links (AC1/AC3) render once data arrives — the row→drill-down link
 * shape is covered by the lib/contract tests; here we assert the first-paint
 * controls.
 */
describe("Operations staff leaderboard page (P3-E05-S03)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof LeaderboardPage).toBe("function");
  });

  it("renders the heading + date-range picker + role filter on first paint (AC1/AC2)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<LeaderboardPage />);
    expect(html).toContain("Top staff");
    // Date-range picker (AC1).
    expect(html).toContain('type="date"');
    expect(html).toContain("From");
    expect(html).toContain("To");
    // Role-filter control (AC2): an "all roles" option + the attribution roles.
    expect(html).toContain("All roles");
    expect(html).toContain("Stylist");
    expect(html).toContain("Instructor");
    expect(html).toContain("Attendant");
    // Table column headers (AC1).
    expect(html).toContain("Revenue");
    expect(html).toContain("Services");
    expect(html).toContain("Avg ticket");
  });
});
