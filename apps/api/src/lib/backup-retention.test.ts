import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { settings, users } from "@bm/db";
import {
  BACKUP_RETENTION_SETTING_KEY,
  DEFAULT_BACKUP_RETENTION_POLICY,
} from "@bm/contracts";
import {
  getEffectiveBackupRetentionPolicy,
  saveBackupRetentionPolicy,
} from "./backup-retention.js";

describe("getEffectiveBackupRetentionPolicy", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("returns defaults when no setting row exists", async () => {
    expect(await getEffectiveBackupRetentionPolicy(dbh.db)).toEqual(
      DEFAULT_BACKUP_RETENTION_POLICY,
    );
  });

  it("returns the stored policy when present and valid", async () => {
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: 14, monthlyKeep: 6, graceDays: 5 },
    });
    expect(await getEffectiveBackupRetentionPolicy(dbh.db)).toEqual({
      dailyKeep: 14,
      monthlyKeep: 6,
      graceDays: 5,
    });
  });

  it("falls back to defaults (never throws) when the stored value is malformed", async () => {
    await dbh.db.insert(settings).values({
      key: BACKUP_RETENTION_SETTING_KEY,
      value: { dailyKeep: -3, monthlyKeep: "lots" },
    });
    expect(await getEffectiveBackupRetentionPolicy(dbh.db)).toEqual(
      DEFAULT_BACKUP_RETENTION_POLICY,
    );
  });
});

describe("saveBackupRetentionPolicy", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("inserts a new policy row", async () => {
    await saveBackupRetentionPolicy(dbh.db, {
      dailyKeep: 10,
      monthlyKeep: 4,
      graceDays: 2,
    });
    expect(await getEffectiveBackupRetentionPolicy(dbh.db)).toEqual({
      dailyKeep: 10,
      monthlyKeep: 4,
      graceDays: 2,
    });
  });

  it("upserts on the key so there is only ever one policy row, stamping updatedBy", async () => {
    const actor = "11111111-1111-1111-1111-111111111111";
    // `settings.updated_by` is FK→users(id), so the actor must exist.
    await dbh.db.insert(users).values({
      id: actor,
      phone: "+254712000099",
      pinHash: "x",
      role: "admin",
    });
    await saveBackupRetentionPolicy(dbh.db, {
      dailyKeep: 10,
      monthlyKeep: 4,
      graceDays: 2,
    });
    await saveBackupRetentionPolicy(
      dbh.db,
      { dailyKeep: 30, monthlyKeep: 12, graceDays: 7 },
      actor,
    );
    expect(await getEffectiveBackupRetentionPolicy(dbh.db)).toEqual({
      dailyKeep: 30,
      monthlyKeep: 12,
      graceDays: 7,
    });
    const rows = await dbh.db.select().from(settings);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.updatedBy).toBe(actor);
  });
});
