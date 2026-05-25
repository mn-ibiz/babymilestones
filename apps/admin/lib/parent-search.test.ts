import { describe, expect, it, vi } from "vitest";
import {
  SEARCH_DEBOUNCE_MS,
  shouldSearch,
  formatCentsKes,
  formatPhoneLast4,
  formatLastVisit,
  debounce,
} from "./parent-search";

describe("parent-search client logic (P1-E05-S01)", () => {
  it("gates the query at the minimum length (AC1/AC2)", () => {
    expect(shouldSearch("")).toBe(false);
    expect(shouldSearch(" a ")).toBe(false);
    expect(shouldSearch("as")).toBe(true);
    expect(shouldSearch("0712")).toBe(true);
  });

  it("formats cents as KES money (AC3)", () => {
    expect(formatCentsKes(30_000)).toBe("KES 300.00");
    expect(formatCentsKes(0)).toBe("KES 0.00");
  });

  it("renders only the phone last-4, never the full number (AC3)", () => {
    expect(formatPhoneLast4("3456")).toBe("••• 3456");
  });

  it("formats last visit, with a placeholder when never visited (AC3)", () => {
    expect(formatLastVisit("2026-05-20T10:00:00.000Z")).toBe("2026-05-20");
    expect(formatLastVisit(null)).toBe("No visits yet");
    expect(formatLastVisit("not-a-date")).toBe("No visits yet");
  });

  it("debounce delays and coalesces calls (AC2)", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, SEARCH_DEBOUNCE_MS);
    d("a");
    d("ab");
    d("abc");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("abc");
    vi.useRealTimers();
  });

  it("debounce cancel drops a pending call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, SEARCH_DEBOUNCE_MS);
    d("x");
    d.cancel();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
