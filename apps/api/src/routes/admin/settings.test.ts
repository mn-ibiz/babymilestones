import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, settings, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E10-S04 — Settings sub-app admin API. Integration via app.inject with real
 * staff sessions (+ CSRF). Covers the aggregated section index (AC1), the
 * general key/value sections read/write (AC1), `manage config` enforcement plus
 * the treasury gate on the float sub-section (AC2), and audit on every save
 * (AC3).
 */
describe("Settings admin API (P1-E10-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method,
      url,
      headers: { cookie: cookieParts.join("; "), ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}) },
      ...(payload ? { payload } : {}),
    });
  };

  let admin: Creds;
  let superAdmin: Creds;
  let treasury: Creds;
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
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "treasury"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    admin = await loginStaff("+254712000001", "7421");
    superAdmin = await loginStaff("+254712000002", "7422");
    treasury = await loginStaff("+254712000004", "7424");
    reception = await loginStaff("+254712000003", "7423");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  describe("section index (AC1)", () => {
    it("lists every settings section with its href + access", async () => {
      const res = await req("GET", "/admin/settings", admin);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { sections: { key: string; href: string }[] };
      const keys = body.sections.map((s) => s.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          "sms_config",
          "float_accounts",
          "loyalty",
          "branding",
          "receipt_branding",
        ]),
      );
    });

    it("marks the float-accounts section treasury-gated for a non-treasury admin", async () => {
      const res = await req("GET", "/admin/settings", admin);
      const body = res.json() as { sections: { key: string; accessible: boolean }[] };
      const floatSection = body.sections.find((s) => s.key === "float_accounts")!;
      expect(floatSection.accessible).toBe(false);
    });

    it("marks the float-accounts section accessible for super_admin (holds both grants)", async () => {
      const res = await req("GET", "/admin/settings", superAdmin);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { sections: { key: string; accessible: boolean }[] };
      const floatSection = body.sections.find((s) => s.key === "float_accounts")!;
      expect(floatSection.accessible).toBe(true);
    });

    it("forbids treasury from the settings index (lacks manage config)", async () => {
      const res = await req("GET", "/admin/settings", treasury);
      expect(res.statusCode).toBe(403);
    });
  });

  describe("permission enforcement (AC2)", () => {
    it("rejects an unauthenticated read", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/settings" });
      expect(res.statusCode).toBe(401);
    });

    it("forbids a reception user (no manage config)", async () => {
      const res = await req("GET", "/admin/settings", reception);
      expect(res.statusCode).toBe(403);
    });

    it("forbids reception writing a general section", async () => {
      const res = await req("PUT", "/admin/settings/loyalty", reception, {
        earnRatePer100: 1,
        redeemValuePerPoint: 1,
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("general section read/write (AC1)", () => {
    it("returns the default payload for an unset section", async () => {
      const res = await req("GET", "/admin/settings/loyalty", admin);
      expect(res.statusCode).toBe(200);
      const body = res.json() as { key: string; value: Record<string, unknown> };
      expect(body.key).toBe("loyalty");
      expect(body.value).toEqual({ earnRatePer100: 0, redeemValuePerPoint: 0 });
    });

    it("404s an unknown section key", async () => {
      const res = await req("GET", "/admin/settings/nonsense", admin);
      expect(res.statusCode).toBe(404);
    });

    it("admin writes loyalty rates and reads them back", async () => {
      const put = await req("PUT", "/admin/settings/loyalty", admin, {
        earnRatePer100: 5,
        redeemValuePerPoint: 0.5,
      });
      expect(put.statusCode).toBe(200);
      expect((put.json() as { value: { earnRatePer100: number } }).value.earnRatePer100).toBe(5);

      const get = await req("GET", "/admin/settings/loyalty", admin);
      expect((get.json() as { value: { redeemValuePerPoint: number } }).value.redeemValuePerPoint).toBe(
        0.5,
      );
    });

    it("super_admin writes branding colours", async () => {
      const put = await req("PUT", "/admin/settings/branding", superAdmin, {
        storeName: "Baby Milestones KE",
        primaryColour: "#0a7e8c",
        secondaryColour: "#fff",
      });
      expect(put.statusCode).toBe(200);
    });

    it("rejects an invalid payload with 400 + field", async () => {
      const res = await req("PUT", "/admin/settings/branding", admin, {
        storeName: "",
        primaryColour: "not-a-colour",
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("field");
    });

    it("persists updated_by as the acting admin", async () => {
      await req("PUT", "/admin/settings/loyalty", admin, {
        earnRatePer100: 2,
        redeemValuePerPoint: 1,
      });
      const [row] = await dbh.db.select().from(settings).where(eq(settings.key, "loyalty"));
      expect(row!.updatedBy).toBe(adminId);
    });
  });

  describe("audit on save (AC3)", () => {
    it("writes one audit_outbox row per save", async () => {
      await req("PUT", "/admin/settings/receipt_branding", admin, { showLogo: true, footerLine: "Asante!" });
      const rows = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.action, "settings.update"));
      expect(rows.length).toBe(1);
      expect(rows[0]!.actorUserId).toBe(adminId);
      expect(rows[0]!.targetTable).toBe("settings");
      expect(rows[0]!.targetId).toBe("receipt_branding");
    });
  });

  describe("eTIMS enable flag (P5-E02-S03)", () => {
    it("lists the eTIMS section in the index (AC1)", async () => {
      const res = await req("GET", "/admin/settings", admin);
      const body = res.json() as { sections: { key: string }[] };
      expect(body.sections.map((s) => s.key)).toContain("etims");
    });

    it("defaults to disabled when unset (AC2 — production unaffected)", async () => {
      const res = await req("GET", "/admin/settings/etims", admin);
      expect(res.statusCode).toBe(200);
      expect((res.json() as { value: { enabled: boolean } }).value).toEqual({ enabled: false });
    });

    it("enabling the flag persists it and audits etims.flag.changed (AC3)", async () => {
      const put = await req("PUT", "/admin/settings/etims", admin, { enabled: true });
      expect(put.statusCode).toBe(200);
      expect((put.json() as { value: { enabled: boolean } }).value.enabled).toBe(true);

      const flag = await dbh.db
        .select()
        .from(auditOutbox)
        .where(eq(auditOutbox.action, "etims.flag.changed"));
      expect(flag).toHaveLength(1);
      expect((flag[0]!.payload as { enabled: boolean }).enabled).toBe(true);
    });

    it("rolls back cleanly by flipping the flag off again (AC4)", async () => {
      await req("PUT", "/admin/settings/etims", admin, { enabled: true });
      const off = await req("PUT", "/admin/settings/etims", admin, { enabled: false });
      expect(off.statusCode).toBe(200);
      const get = await req("GET", "/admin/settings/etims", admin);
      expect((get.json() as { value: { enabled: boolean } }).value.enabled).toBe(false);
    });
  });
});
