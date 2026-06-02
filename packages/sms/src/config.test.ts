import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { smsConfig } from "@bm/db";
import {
  createSmsConfig,
  updateSmsConfig,
  listSmsConfigs,
  getSmsConfig,
  getActiveSmsConfig,
  deleteSmsConfig,
  toPublicSmsConfig,
} from "./config.js";

/**
 * P1-E09-S02 — sms_config CRUD + single-active invariant (AC1/AC4) against real
 * Postgres (PGlite). Secret hygiene is structural: only `api_key_ref` exists.
 */
describe("sms_config CRUD (P1-E09-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  const base = {
    senderId: "BABYCARE",
    apiUrl: "https://api.africastalking.com/v1/messaging",
    apiKeyRef: "SMS_API_KEY",
  };

  it("creates a config, inactive by default (AC1)", async () => {
    const row = await createSmsConfig(dbh.db, base);
    expect(row.senderId).toBe("BABYCARE");
    expect(row.apiKeyRef).toBe("SMS_API_KEY");
    expect(row.isActive).toBe(false);
    // No raw-key field is ever materialised — only the env-var reference (AC2).
    expect(Object.keys(row)).not.toContain("apiKey");
    expect(Object.keys(row)).not.toContain("api_key");
  });

  it("creating active deactivates a previously active row (AC4)", async () => {
    const a = await createSmsConfig(dbh.db, { ...base, isActive: true });
    const b = await createSmsConfig(dbh.db, { ...base, senderId: "OTHER", isActive: true });
    const active = await getActiveSmsConfig(dbh.db);
    expect(active?.id).toBe(b.id);
    expect((await getSmsConfig(dbh.db, a.id))?.isActive).toBe(false);
    // Exactly one active row across the table (AC4).
    const all = await listSmsConfigs(dbh.db);
    expect(all.filter((r) => r.isActive)).toHaveLength(1);
  });

  it("activating via update deactivates the prior active row (AC4)", async () => {
    const a = await createSmsConfig(dbh.db, { ...base, isActive: true });
    const b = await createSmsConfig(dbh.db, { ...base, senderId: "OTHER" });
    await updateSmsConfig(dbh.db, b.id, { isActive: true });
    expect((await getSmsConfig(dbh.db, a.id))?.isActive).toBe(false);
    expect((await getSmsConfig(dbh.db, b.id))?.isActive).toBe(true);
    expect((await listSmsConfigs(dbh.db)).filter((r) => r.isActive)).toHaveLength(1);
  });

  it("patches fields and returns null for unknown id", async () => {
    const a = await createSmsConfig(dbh.db, base);
    const updated = await updateSmsConfig(dbh.db, a.id, { senderId: "RENAMED" });
    expect(updated?.senderId).toBe("RENAMED");
    expect(await updateSmsConfig(dbh.db, "00000000-0000-0000-0000-000000000000", { senderId: "x" })).toBeNull();
  });

  it("lists newest-first, reads one, and deletes", async () => {
    const a = await createSmsConfig(dbh.db, base);
    const b = await createSmsConfig(dbh.db, { ...base, senderId: "TWO" });
    // Pin distinct created_at so "newest-first" is deterministic: the test DB's
    // clock is millisecond-coarse, so two back-to-back inserts can otherwise share
    // a created_at and the ordering would depend on physical row order.
    await dbh.db
      .update(smsConfig)
      .set({ createdAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(smsConfig.id, a.id));
    await dbh.db
      .update(smsConfig)
      .set({ createdAt: new Date("2026-01-02T00:00:00.000Z") })
      .where(eq(smsConfig.id, b.id));
    const list = await listSmsConfigs(dbh.db);
    expect(list[0]!.id).toBe(b.id);
    expect((await getSmsConfig(dbh.db, a.id))?.id).toBe(a.id);
    expect(await deleteSmsConfig(dbh.db, a.id)).toBe(true);
    expect(await getSmsConfig(dbh.db, a.id)).toBeNull();
    expect(await deleteSmsConfig(dbh.db, a.id)).toBe(false);
  });

  it("toPublicSmsConfig exposes only safe fields (AC2)", async () => {
    const a = await createSmsConfig(dbh.db, base);
    const pub = toPublicSmsConfig(a);
    expect(Object.keys(pub).sort()).toEqual(
      ["apiKeyRef", "apiUrl", "createdAt", "id", "isActive", "senderId", "updatedAt"].sort(),
    );
    // The only key-related field is the reference, never a literal "apiKey".
    expect(Object.keys(pub)).not.toContain("apiKey");
  });

  it("getActiveSmsConfig returns null when none active", async () => {
    await createSmsConfig(dbh.db, base);
    expect(await getActiveSmsConfig(dbh.db)).toBeNull();
  });
});
