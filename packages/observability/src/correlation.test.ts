import { describe, expect, it } from "vitest";
import {
  CORRELATION_ID_HEADER,
  generateCorrelationId,
  resolveCorrelationId,
} from "./correlation.js";

describe("correlation id", () => {
  it("exposes the canonical header name", () => {
    expect(CORRELATION_ID_HEADER).toBe("x-correlation-id");
  });

  it("generates a unique, non-empty id each call", () => {
    const a = generateCorrelationId();
    const b = generateCorrelationId();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("reuses an inbound correlation id when present", () => {
    expect(resolveCorrelationId("abc-123")).toBe("abc-123");
  });

  it("reuses the first value of an inbound header array", () => {
    expect(resolveCorrelationId(["first", "second"])).toBe("first");
  });

  it("generates a fresh id when none is supplied", () => {
    const id = resolveCorrelationId(undefined);
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("generates a fresh id when the inbound value is blank", () => {
    const id = resolveCorrelationId("   ");
    expect(id.trim()).not.toBe("");
  });
});
