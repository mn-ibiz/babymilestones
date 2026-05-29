import { describe, expect, it } from "vitest";
import {
  emptyStaffLogin,
  mapStaffAuthError,
  normalizePhoneInput,
  validateStaffLogin,
} from "./staff-login.js";

describe("POS staff login (P2-E04-S01 — log in and start selling)", () => {
  describe("normalizePhoneInput", () => {
    it("accepts canonical +2547 numbers", () => {
      expect(normalizePhoneInput("+254712000001")).toBe("+254712000001");
    });
    it("converts local 07 numbers", () => {
      expect(normalizePhoneInput("0712000001")).toBe("+254712000001");
    });
    it("rejects nonsense", () => {
      expect(normalizePhoneInput("hello")).toBeNull();
      expect(normalizePhoneInput("12345")).toBeNull();
    });
  });

  describe("validateStaffLogin", () => {
    it("passes a valid phone + 4-digit PIN", () => {
      expect(validateStaffLogin({ phone: "0712000001", pin: "7421" })).toEqual({});
    });
    it("flags a bad phone", () => {
      expect(validateStaffLogin({ phone: "nope", pin: "7421" }).phone).toBeDefined();
    });
    it("flags a non-4-digit PIN", () => {
      expect(validateStaffLogin({ phone: "0712000001", pin: "12" }).pin).toBeDefined();
    });
    it("starts empty", () => {
      expect(emptyStaffLogin).toEqual({ phone: "", pin: "" });
    });
  });

  describe("mapStaffAuthError", () => {
    it("maps invalid credentials (401)", () => {
      expect(mapStaffAuthError(401, null).message).toMatch(/phone or pin/iu);
    });
    it("maps a role mismatch (403) to a POS-specific message", () => {
      expect(mapStaffAuthError(403, null).message).toMatch(/not.*permitted|cannot use the pos/iu);
    });
    it("maps rate limiting (429)", () => {
      expect(mapStaffAuthError(429, null).message).toMatch(/too many/iu);
    });
    it("falls back for unexpected statuses", () => {
      expect(mapStaffAuthError(500, null).message.length).toBeGreaterThan(0);
    });
  });
});
