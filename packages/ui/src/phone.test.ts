import { describe, expect, it } from "vitest";
import { formatKePhoneDisplay, normalizeKePhone } from "./phone.js";

describe("normalizeKePhone", () => {
  it("normalizes the common KE input variants to E.164", () => {
    expect(normalizeKePhone("0712345678")).toBe("+254712345678");
    expect(normalizeKePhone("712345678")).toBe("+254712345678");
    expect(normalizeKePhone("254712345678")).toBe("+254712345678");
    expect(normalizeKePhone("+254712345678")).toBe("+254712345678");
    expect(normalizeKePhone("0712 345 678")).toBe("+254712345678");
  });

  it("supports the 01x Safaricom range", () => {
    expect(normalizeKePhone("0112345678")).toBe("+254112345678");
  });

  it("returns null for incomplete or non-KE numbers", () => {
    expect(normalizeKePhone("0712")).toBeNull();
    expect(normalizeKePhone("")).toBeNull();
    expect(normalizeKePhone("123")).toBeNull();
  });
});

describe("formatKePhoneDisplay", () => {
  it("groups a complete number as 0712 345 678", () => {
    expect(formatKePhoneDisplay("0712345678")).toBe("0712 345 678");
    expect(formatKePhoneDisplay("+254712345678")).toBe("0712 345 678");
  });

  it("shows raw digits while still typing", () => {
    expect(formatKePhoneDisplay("0712")).toBe("0712");
  });
});
