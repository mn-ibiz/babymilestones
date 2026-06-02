"use client";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RepeatAttendancePage from "./page";

/**
 * P6-E06-S03 (Story 35.3) — repeat-attendance page render-contract. First paint
 * shows the heading, the date-range picker (AC2), and the per-class table scaffold
 * (AC1 — total attendees / repeat rate / avg classes columns) before the fetch
 * resolves.
 */
describe("Operations repeat-attendance page (P6-E06-S03)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a client component function", () => {
    expect(typeof RepeatAttendancePage).toBe("function");
  });

  it("renders the heading + range picker + table columns on first paint (AC1/AC2)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const html = renderToStaticMarkup(<RepeatAttendancePage />);
    expect(html).toContain("Repeat attendance");
    // Date-range picker (AC2).
    expect(html).toContain('type="date"');
    expect(html).toContain("From");
    expect(html).toContain("To");
    // Per-class table columns (AC1).
    expect(html).toContain("Class");
    expect(html).toContain("Attendees");
    expect(html).toContain("Repeat rate");
    expect(html).toContain("Avg classes");
  });
});
