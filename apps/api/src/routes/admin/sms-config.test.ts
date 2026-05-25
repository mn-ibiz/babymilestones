import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, smsConfig, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E09-S02 — SMS provider config admin API. Integration via app.inject with
 * real staff sessions (+ CSRF). Covers `manage config` enforcement (AC2),
 * HTTPS + SSRF URL validation (AC3), the single-active invariant (AC4), the
 * secret never appearing in responses/audit (AC1/AC2), and audit on mutation.
 */
describe("SMS config admin API (P1-E09-S02)", () => {
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
    method: "GET" | "POST" | "PATCH" | "DELETE",
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
  let reception: Creds;

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

  const valid = {
    senderId: "BABYCARE",
    apiUrl: "https://api.africastalking.com/v1/messaging",
    apiKeyRef: "SMS_API_KEY",
  };

  it("admin creates a config; response carries the ref but no secret (AC1/AC2)", async () => {
    const res = await req("POST", "/admin/sms-config", admin, valid);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.senderId).toBe("BABYCARE");
    expect(body.apiKeyRef).toBe("SMS_API_KEY");
    expect(body.isActive).toBe(false);
    // No secret-bearing field is present.
    expect(body).not.toHaveProperty("apiKey");
    expect(JSON.stringify(body)).not.toMatch(/"apiKey"/u);
  });

  it("rejects reception (lacks manage config) (AC2)", async () => {
    const res = await req("POST", "/admin/sms-config", reception, valid);
    expect(res.statusCode).toBe(403);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await req("GET", "/admin/sms-config", admin, undefined, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects non-HTTPS and SSRF URLs (AC3)", async () => {
    for (const apiUrl of [
      "http://api.provider.com/send",
      "https://127.0.0.1/send",
      "https://10.0.0.1/send",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost/send",
    ]) {
      const res = await req("POST", "/admin/sms-config", admin, { ...valid, apiUrl });
      expect(res.statusCode, apiUrl).toBe(400);
      expect(res.json().field).toBe("apiUrl");
    }
  });

  it("rejects a literal-looking key in the ref field (shape gate, AC2)", async () => {
    const res = await req("POST", "/admin/sms-config", admin, {
      ...valid,
      apiKeyRef: "sk_live_abc123!@#",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("apiKeyRef");
  });

  it("enforces a single active config across create + activate (AC4)", async () => {
    const a = (await req("POST", "/admin/sms-config", admin, { ...valid, isActive: true })).json();
    await req("POST", "/admin/sms-config", admin, { ...valid, senderId: "TWO", isActive: true });
    const active = (await dbh.db.select().from(smsConfig).where(eq(smsConfig.isActive, true)));
    expect(active).toHaveLength(1);
    expect(active[0]!.senderId).toBe("TWO");
    // Re-activate the first via PATCH — still exactly one active.
    const patch = await req("PATCH", `/admin/sms-config/${a.id}`, admin, { isActive: true });
    expect(patch.statusCode).toBe(200);
    const active2 = await dbh.db.select().from(smsConfig).where(eq(smsConfig.isActive, true));
    expect(active2).toHaveLength(1);
    expect(active2[0]!.id).toBe(a.id);
  });

  it("lists, reads, updates, and deletes; audits each mutation (AC1/DoD)", async () => {
    const created = (await req("POST", "/admin/sms-config", admin, valid)).json();
    const list = await req("GET", "/admin/sms-config", admin);
    expect(list.json().configs).toHaveLength(1);

    const read = await req("GET", `/admin/sms-config/${created.id}`, admin);
    expect(read.json().id).toBe(created.id);

    const patched = await req("PATCH", `/admin/sms-config/${created.id}`, admin, {
      senderId: "RENAMED",
    });
    expect(patched.json().senderId).toBe("RENAMED");

    const del = await req("DELETE", `/admin/sms-config/${created.id}`, admin);
    expect(del.statusCode).toBe(204);
    expect((await req("GET", `/admin/sms-config/${created.id}`, admin)).statusCode).toBe(404);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.targetTable, "sms_config"));
    const actions = audits.map((a) => a.action).sort();
    expect(actions).toEqual(["sms.config.create", "sms.config.delete", "sms.config.update"]);
    // No audit payload leaks a raw key.
    expect(JSON.stringify(audits)).not.toMatch(/"apiKey"/u);
  });

  it("404 on unknown id for read / patch / delete", async () => {
    const id = "00000000-0000-0000-0000-000000000000";
    expect((await req("GET", `/admin/sms-config/${id}`, admin)).statusCode).toBe(404);
    expect((await req("PATCH", `/admin/sms-config/${id}`, admin, { senderId: "x" })).statusCode).toBe(404);
    expect((await req("DELETE", `/admin/sms-config/${id}`, admin)).statusCode).toBe(404);
  });
});
