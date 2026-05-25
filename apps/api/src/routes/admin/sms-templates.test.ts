import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { smsTemplates, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E09-S03 — registered + versioned SMS templates, read-only admin API (AC3).
 * Covers `manage config` enforcement, the active-per-key list, and version
 * history exposure.
 */
describe("SMS templates admin API (P1-E09-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    return { session };
  };

  let admin: { session: string };
  let reception: { session: string };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    admin = await loginStaff("+254712000001", "7421");
    reception = await loginStaff("+254712000003", "7423");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("admin lists the active template per key (AC3)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/sms-templates",
      headers: { cookie: admin.session },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { templates: Array<{ key: string; body: string; isActive: boolean }> };
    const keys = body.templates.map((t) => t.key);
    expect(keys).toContain("topup.success");
    expect(body.templates.every((t) => t.isActive)).toBe(true);
    // Body carries placeholder tokens, not a rendered string.
    expect(body.templates.find((t) => t.key === "topup.success")!.body).toContain("{amountKes}");
  });

  it("exposes version history for a key (AC1)", async () => {
    await dbh.db
      .update(smsTemplates)
      .set({ isActive: false })
      .where(eq(smsTemplates.key, "topup.success"));
    await dbh.db.insert(smsTemplates).values({
      key: "topup.success",
      language: "en",
      version: 2,
      body: "v2 {amountKes}",
      isActive: true,
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin/sms-templates/topup.success/versions",
      headers: { cookie: admin.session },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { versions: Array<{ version: number }> };
    expect(body.versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("forbids a role without manage config (AC3 gate)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/sms-templates",
      headers: { cookie: reception.session },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/sms-templates" });
    expect(res.statusCode).toBe(401);
  });
});
