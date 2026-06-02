import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { adminAlerts } from "@bm/db";
import { dismissAdminAlert, listUnreadAdminAlerts } from "./admin-alerts.js";

/**
 * P6-E04-S03 (Story 34.3) — admin in-app alert read model. The bell / alerts list
 * reads UNREAD, active alerts newest-first; an admin can dismiss one (stamps
 * `dismissed_at` so it drops off the list). Pure DB read/write — the route layer
 * gates + audits.
 */
describe("admin alerts read model (P6-E04-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedAlert(opts: {
    sourceId: string;
    createdAt?: Date;
    readAt?: Date | null;
    dismissedAt?: Date | null;
  }) {
    const [a] = await dbh.db
      .insert(adminAlerts)
      .values({
        type: "negative_feedback",
        severity: "warning",
        sourceType: "feedback",
        sourceId: opts.sourceId,
        title: `Low rating for ${opts.sourceId}`,
        body: "x",
        linkPath: `/feedback?focus=${opts.sourceId}`,
        createdAt: opts.createdAt ?? new Date("2026-06-12T10:00:00Z"),
        readAt: opts.readAt ?? null,
        dismissedAt: opts.dismissedAt ?? null,
      })
      .returning();
    return a!;
  }

  it("lists unread, active alerts newest-first", async () => {
    await seedAlert({ sourceId: "f1", createdAt: new Date("2026-06-10T08:00:00Z") });
    await seedAlert({ sourceId: "f2", createdAt: new Date("2026-06-12T08:00:00Z") });
    const rows = await listUnreadAdminAlerts(dbh.db);
    expect(rows.map((r) => r.sourceId)).toEqual(["f2", "f1"]);
    expect(rows[0]!.linkPath).toContain("/feedback");
  });

  it("excludes dismissed alerts from the unread list", async () => {
    await seedAlert({ sourceId: "f1" });
    await seedAlert({ sourceId: "f2", dismissedAt: new Date("2026-06-12T11:00:00Z") });
    const rows = await listUnreadAdminAlerts(dbh.db);
    expect(rows.map((r) => r.sourceId)).toEqual(["f1"]);
  });

  it("excludes already-read alerts from the unread list", async () => {
    await seedAlert({ sourceId: "f1", readAt: new Date("2026-06-12T11:00:00Z") });
    const rows = await listUnreadAdminAlerts(dbh.db);
    expect(rows).toHaveLength(0);
  });

  it("dismisses an alert — stamps dismissed_at and drops it off the list", async () => {
    const a = await seedAlert({ sourceId: "f1" });
    const at = new Date("2026-06-12T12:00:00Z");
    const dismissed = await dismissAdminAlert(dbh.db, a.id, at);
    expect(dismissed).not.toBeNull();
    const [row] = await dbh.db.select().from(adminAlerts).where(eq(adminAlerts.id, a.id));
    expect(row!.dismissedAt?.toISOString()).toBe(at.toISOString());
    expect(await listUnreadAdminAlerts(dbh.db)).toHaveLength(0);
  });

  it("dismissing an unknown alert id returns null (no throw)", async () => {
    const res = await dismissAdminAlert(
      dbh.db,
      "00000000-0000-0000-0000-000000000000",
      new Date(),
    );
    expect(res).toBeNull();
  });

  it("dismissing an already-dismissed alert is idempotent (keeps first stamp)", async () => {
    const a = await seedAlert({ sourceId: "f1" });
    const first = new Date("2026-06-12T12:00:00Z");
    await dismissAdminAlert(dbh.db, a.id, first);
    const second = await dismissAdminAlert(dbh.db, a.id, new Date("2026-06-12T13:00:00Z"));
    // Second dismiss is a no-op (already dismissed) → null, first stamp preserved.
    expect(second).toBeNull();
    const [row] = await dbh.db.select().from(adminAlerts).where(eq(adminAlerts.id, a.id));
    expect(row!.dismissedAt?.toISOString()).toBe(first.toISOString());
  });
});
