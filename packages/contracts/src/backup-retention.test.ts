import { describe, expect, it } from "vitest";
import {
  backupRetentionPolicySchema,
  BACKUP_RETENTION_SETTING_KEY,
  DEFAULT_BACKUP_RETENTION_POLICY,
} from "./index.js";

describe("backupRetentionPolicySchema", () => {
  it("accepts a valid policy", () => {
    expect(
      backupRetentionPolicySchema.safeParse({
        dailyKeep: 7,
        monthlyKeep: 6,
        graceDays: 3,
      }).success,
    ).toBe(true);
  });

  it("accepts the minimum boundary (dailyKeep 1, others 0)", () => {
    expect(
      backupRetentionPolicySchema.safeParse({
        dailyKeep: 1,
        monthlyKeep: 0,
        graceDays: 0,
      }).success,
    ).toBe(true);
  });

  it("rejects dailyKeep below 1 (must always keep a baseline)", () => {
    expect(
      backupRetentionPolicySchema.safeParse({
        dailyKeep: 0,
        monthlyKeep: 6,
        graceDays: 3,
      }).success,
    ).toBe(false);
  });

  it("rejects negative monthlyKeep", () => {
    expect(
      backupRetentionPolicySchema.safeParse({
        dailyKeep: 7,
        monthlyKeep: -1,
        graceDays: 3,
      }).success,
    ).toBe(false);
  });

  it("rejects negative graceDays", () => {
    expect(
      backupRetentionPolicySchema.safeParse({
        dailyKeep: 7,
        monthlyKeep: 6,
        graceDays: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer values", () => {
    expect(
      backupRetentionPolicySchema.safeParse({
        dailyKeep: 7.5,
        monthlyKeep: 6,
        graceDays: 3,
      }).success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(
      backupRetentionPolicySchema.safeParse({ dailyKeep: 7 }).success,
    ).toBe(false);
  });
});

describe("backup retention constants", () => {
  it("exposes a stable settings key", () => {
    expect(BACKUP_RETENTION_SETTING_KEY).toBe("backup.retention");
  });

  it("exposes defaults that satisfy the schema", () => {
    expect(DEFAULT_BACKUP_RETENTION_POLICY).toEqual({
      dailyKeep: 30,
      monthlyKeep: 12,
      graceDays: 7,
    });
    expect(
      backupRetentionPolicySchema.safeParse(DEFAULT_BACKUP_RETENTION_POLICY)
        .success,
    ).toBe(true);
  });
});
