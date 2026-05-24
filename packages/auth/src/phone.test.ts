import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone } from "./phone.js";

describe("normalizePhone (P1-E01-S01)", () => {
  it("accepts already-normalised +2547XXXXXXXX", () => {
    expect(normalizePhone("+254712345678")).toBe("+254712345678");
  });
  it("normalises local 07XXXXXXXX", () => {
    expect(normalizePhone("0712345678")).toBe("+254712345678");
  });
  it("strips incidental whitespace", () => {
    expect(normalizePhone(" 0712 345 678 ")).toBe("+254712345678");
  });
  it.each(["123", "0812345678", "+254812345678", "0712", "abc", "+2547123456789"])(
    "rejects invalid %s",
    (bad) => {
      expect(normalizePhone(bad)).toBeNull();
      expect(isValidPhone(bad)).toBe(false);
    },
  );
});
