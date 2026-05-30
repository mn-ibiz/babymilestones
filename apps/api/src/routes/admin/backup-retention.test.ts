import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, settings, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import {
  BACKUP_RETENTION_SETTING_KEY,
  DEFAULT_BACKUP_RETENTION_POLICY,
} from "@bm/contracts";
import { buildApp } from "../../app.js";

/**
 * P2-E06-S01 — Backup retention policy admin API. Integration via app.inject
 * with real staff sessions (+ CSRF). Covers reading the effective policy
 * (default + stored), `manage config` enforcement, validated writes, audit on
 * save, and the invalid-input path.
 */
describe("Backup retention admin API (P2-E06-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "PUT",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        cookie: `${creds.session}; ${creds.csrfCookie}`,
        "x-csrf-token": creds.csrfToken,
      },
      ...(payload ? { payload } : {}),
    });

  let admin: Creds;
  let reception: Creds;
  let adminId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    const [adminRow] = await dbh.db
      .insert(users)
      .values(await staffUserSeed("+254712000001", "7421", "admin"))
      .returning();
    adminId = adminRow!.id;
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    admin = await loginStaff("+254712000001", "7421");
    reception = await loginStaff("+254712000003", "7423");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  describe("read (GET)", () => {
    it("rejects an unauthenticated read", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/backup-retention" });
      expect(res.statusCode).toBe(401);
    });

    it("forbids a reception user (no manage config)", async () => {
      const res = await req("GET", "/admin/backup-retention", reception);
      expect(res.statusCode).toBe(403);
    });

    it("returns the effective (default) policy when none is stored", async () => {
      const res = await req("GET", "/admin/backup-retention", admin);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(DEFAULT_BACKUP_RETENTION_POLICY);
    });

    it("returns the stored policy when one is saved", async () => {
      await dbh.db.insert(settings).values({
        key: BACKUP_RETENTION_SETTING_KEY,
        value: { dailyKeep: 14, monthlyKeep: 6, graceDays: 5 },
      });
      const res = await req("GET", "/admin/backup-retention", admin);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ dailyKeep: 14, monthlyKeep: 6, graceDays: 5 });
    });
  });

  describe("update (PUT)", () => {
    it("forbids a reception user from writing", async () => {
      const res = await req("PUT", "/admin/backup-retention", reception, {
        dailyKeep: 7,
        monthlyKeep: 6,
        graceDays: 3,
      });
      expect(res.statusCode).toBe(403);
    });

    it("updates the policy, persists it, and stamps updated_by", async () => {
      const res = await req("PUT", "/admin/backup-retention", admin, {
        dailyKeep: 14,
        monthlyKeep: 6,
        graceDays: 5,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ dailyKeep: 14, monthlyKeep: 6, graceDays: 5 });
      const [row] = await dbh.db
        .select()
        .from(settings)
        .where(eq(settings.key, BACKUP_RETENTION_SETTING_KEY));
      expect(row!.value).toEqual({ dailyKeep: 14, monthlyKeep: 6, graceDays: 5 });
      expect(row!.updatedBy).toBe(adminId);
    });

    it("writes one audit_outbox row recording the actor and new values", async () => {
      await req("PUT", "/admin/backup-retention", admin, {
        dailyKeep: 30,
        monthlyKeep: 12,
        graceDays: 7,
      });
      const rows = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.action, "backup.retention.updated"));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.actorUserId).toBe(adminId);
      expect(rows[0]!.targetTable).toBe("settings");
      expect(rows[0]!.payload).toMatchObject({
        dailyKeep: 30,
        monthlyKeep: 12,
        graceDays: 7,
      });
    });

    it("rejects invalid input with 400 and does not mutate state", async () => {
      const res = await req("PUT", "/admin/backup-retention", admin, {
        dailyKeep: 0,
        monthlyKeep: -1,
        graceDays: 1.5,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
      expect(await dbh.db.select().from(settings)).toHaveLength(0);
      // No backup-retention audit row is written (staff-login audit rows from
      // beforeEach are unrelated, so filter to this action).
      const auditRows = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.action, "backup.retention.updated"));
      expect(auditRows).toHaveLength(0);
    });
  });
});
