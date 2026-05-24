import { describe, expect, it } from "vitest";
import { hashPin, isValidPinFormat, isWeakPin, verifyPin } from "./pin.js";

describe("pin format + weak list (P1-E01-S01)", () => {
  it("requires exactly 4 digits", () => {
    expect(isValidPinFormat("1357")).toBe(true);
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat("12345")).toBe(false);
  });
  it.each(["0000", "1234", "1111", "2580", "9999"])("rejects weak PIN %s", (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });
  it("allows a non-obvious PIN", () => {
    expect(isWeakPin("1357")).toBe(false);
  });
});

describe("argon2id hashing (AC5)", () => {
  it("hashes to argon2id and never echoes the raw PIN", async () => {
    const h = await hashPin("1357");
    expect(h).toMatch(/^\$argon2id\$/u);
    expect(h).not.toContain("1357");
  });
  it("verifies correct and rejects wrong PIN", async () => {
    const h = await hashPin("1357");
    expect(await verifyPin(h, "1357")).toBe(true);
    expect(await verifyPin(h, "1358")).toBe(false);
  });
});
