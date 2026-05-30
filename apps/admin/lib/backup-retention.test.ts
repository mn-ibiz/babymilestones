import { describe, it, expect } from "vitest";
import {
  parseRetentionForm,
  describeRetentionPolicy,
} from "./backup-retention.js";

describe("parseRetentionForm", () => {
  it("accepts a valid form and returns the typed policy", () => {
    const result = parseRetentionForm({
      dailyKeep: "7",
      monthlyKeep: "6",
      graceDays: "3",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy).toEqual({
        dailyKeep: 7,
        monthlyKeep: 6,
        graceDays: 3,
      });
    }
  });

  it("rejects a daily keep below one with a field message", () => {
    const result = parseRetentionForm({
      dailyKeep: "0",
      monthlyKeep: "6",
      graceDays: "3",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dailyKeep).toBeDefined();
  });

  it("rejects negative and non-integer values", () => {
    const result = parseRetentionForm({
      dailyKeep: "7",
      monthlyKeep: "-2",
      graceDays: "1.5",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.monthlyKeep).toBeDefined();
      expect(result.errors.graceDays).toBeDefined();
    }
  });

  it("rejects empty / non-numeric input", () => {
    const result = parseRetentionForm({
      dailyKeep: "",
      monthlyKeep: "abc",
      graceDays: "3",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.dailyKeep).toBeDefined();
      expect(result.errors.monthlyKeep).toBeDefined();
    }
  });
});

describe("describeRetentionPolicy", () => {
  it("summarises the policy in plain language", () => {
    expect(
      describeRetentionPolicy({ dailyKeep: 7, monthlyKeep: 6, graceDays: 3 }),
    ).toBe(
      "Keep the 7 most recent daily backups and 6 monthly backups; never prune anything from the last 3 days.",
    );
  });

  it("uses singular wording for a one-day grace window", () => {
    expect(
      describeRetentionPolicy({ dailyKeep: 1, monthlyKeep: 0, graceDays: 1 }),
    ).toBe(
      "Keep the 1 most recent daily backups and 0 monthly backups; never prune anything from the last 1 day.",
    );
  });
});
