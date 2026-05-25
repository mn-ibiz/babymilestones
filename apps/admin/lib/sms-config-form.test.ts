import { describe, expect, it } from "vitest";
import {
  canManageSmsConfig,
  validateSmsConfigForm,
  isLikelySafeUrl,
  smsConfigStatusLabel,
  apiKeyRefDisplay,
  sortConfigsForDisplay,
} from "./sms-config-form.js";
import type { SmsConfigPublic } from "@bm/contracts";

describe("sms-config-form (P1-E09-S02 admin UI logic)", () => {
  it("gates management to admin / super_admin (AC2)", () => {
    expect(canManageSmsConfig("admin")).toBe(true);
    expect(canManageSmsConfig("super_admin")).toBe(true);
    expect(canManageSmsConfig("reception")).toBe(false);
    expect(canManageSmsConfig("parent")).toBe(false);
  });

  const valid = {
    senderId: "BABYCARE",
    apiUrl: "https://api.africastalking.com/v1/messaging",
    apiKeyRef: "SMS_API_KEY",
  };

  it("accepts a valid form", () => {
    expect(validateSmsConfigForm(valid)).toEqual({});
  });

  it("flags missing sender ID and bad key ref (AC1/AC2)", () => {
    const e = validateSmsConfigForm({ ...valid, senderId: "", apiKeyRef: "sk_live_secret!" });
    expect(e.senderId).toBeDefined();
    expect(e.apiKeyRef).toBeDefined();
  });

  it("flags non-HTTPS and SSRF URLs (AC3)", () => {
    for (const apiUrl of [
      "http://api.provider.com",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://169.254.169.254/x",
      "https://localhost/x",
      "https://192.168.0.1/x",
    ]) {
      expect(validateSmsConfigForm({ ...valid, apiUrl }).apiUrl, apiUrl).toBeDefined();
      expect(isLikelySafeUrl(apiUrl), apiUrl).toBe(false);
    }
    expect(isLikelySafeUrl("https://api.provider.co.ke/send")).toBe(true);
  });

  it("status label reflects active flag (AC4)", () => {
    expect(smsConfigStatusLabel(true)).toBe("Active");
    expect(smsConfigStatusLabel(false)).toBe("Inactive");
  });

  it("key-ref display shows the env name but never a value (AC2)", () => {
    const out = apiKeyRefDisplay("SMS_API_KEY");
    expect(out).toContain("SMS_API_KEY");
    expect(out.toLowerCase()).toContain("hidden");
  });

  it("sorts active first then newest", () => {
    const rows: SmsConfigPublic[] = [
      { id: "1", senderId: "A", apiUrl: "https://a", apiKeyRef: "R", isActive: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "2", senderId: "B", apiUrl: "https://b", apiKeyRef: "R", isActive: true, createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z" },
      { id: "3", senderId: "C", apiUrl: "https://c", apiKeyRef: "R", isActive: false, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
    ];
    expect(sortConfigsForDisplay(rows).map((r) => r.id)).toEqual(["2", "3", "1"]);
  });
});
