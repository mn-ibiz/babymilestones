import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, wooConfig, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import type { WooTransport } from "@bm/woocommerce";
import { buildApp } from "../../app.js";

/**
 * Story 29.6 (P4-E04-S06) — admin WooCommerce credentials config API.
 * Integration via app.inject with real staff sessions (+ CSRF). Covers
 * `manage config` enforcement (AC3), HTTPS validation (AC2), the secret being
 * encrypted at rest + never returned (write-only, AC3), the test-connection
 * happy/auth-failure paths (AC4), and audit on save/test (AUDIT RULE).
 */
describe("WooCommerce config admin API (Story 29.6)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let transportResponse: () => Response;

  const ENC_KEY = "test-woo-encryption-key-material";

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };
  type Creds = Awaited<ReturnType<typeof loginStaff>>;

  const req = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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
    // Default: a healthy system_status response for test-connection.
    transportResponse = () =>
      new Response(JSON.stringify({ environment: { version: "8.5.1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const transport: WooTransport = async () => transportResponse();
    app = buildApp({
      db: dbh.db,
      sessions,
      woocommerce: { encryptionKey: ENC_KEY, transport },
    });
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
    siteUrl: "https://shop.example.com",
    consumerKey: "ck_live_1234567890",
    consumerSecret: "cs_live_0987654321",
  };

  it("admin saves config; the secret is encrypted at rest + never returned (AC3)", async () => {
    const res = await req("PUT", "/admin/woocommerce-config", admin, valid);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.siteUrl).toBe("https://shop.example.com");
    expect(body.hasConsumerKey).toBe(true);
    expect(body.hasConsumerSecret).toBe(true);
    // No secret value anywhere in the response.
    expect(JSON.stringify(body)).not.toContain("cs_live_0987654321");
    expect(JSON.stringify(body)).not.toContain("ck_live_1234567890");
    expect(body).not.toHaveProperty("consumerSecret");

    // Stored ciphertext is not the plaintext.
    const [row] = await dbh.db.select().from(wooConfig);
    expect(row!.consumerSecretEnc).not.toContain("cs_live_0987654321");
  });

  it("GET never returns the secret (write-only read, AC3)", async () => {
    await req("PUT", "/admin/woocommerce-config", admin, valid);
    const res = await req("GET", "/admin/woocommerce-config", admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.siteUrl).toBe("https://shop.example.com");
    expect(body.hasConsumerKey).toBe(true);
    expect(body.hasConsumerSecret).toBe(true);
    expect(JSON.stringify(body)).not.toContain("cs_live_0987654321");
  });

  it("rejects a non-HTTPS site URL (AC2)", async () => {
    const res = await req("PUT", "/admin/woocommerce-config", admin, { ...valid, siteUrl: "http://shop.example.com" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects reception (lacks manage config) (AC3)", async () => {
    const res = await req("PUT", "/admin/woocommerce-config", reception, valid);
    expect(res.statusCode).toBe(403);
  });

  it("rejects unauthenticated reads", async () => {
    const res = await req("GET", "/admin/woocommerce-config", admin, undefined, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("audits the save with `woocommerce.config.update` and NO secret in the payload", async () => {
    await req("PUT", "/admin/woocommerce-config", admin, valid);
    const rows = await dbh.db.select().from(auditOutbox);
    const row = rows.find((r) => r.action === "woocommerce.config.update");
    expect(row).toBeDefined();
    expect(JSON.stringify(row!.payload)).not.toContain("cs_live_0987654321");
    expect(JSON.stringify(row!.payload)).not.toContain("ck_live_1234567890");
  });

  it("test-connection reports OK on system_status 200 (AC4)", async () => {
    await req("PUT", "/admin/woocommerce-config", admin, valid);
    const res = await req("POST", "/admin/woocommerce-config/test-connection", admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe(200);
  });

  it("test-connection reports failure with status + first error on 401 (AC4)", async () => {
    await req("PUT", "/admin/woocommerce-config", admin, valid);
    transportResponse = () =>
      new Response(
        JSON.stringify({ code: "woocommerce_rest_authentication_error", message: "Invalid signature", data: { status: 401 } }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    const res = await req("POST", "/admin/woocommerce-config/test-connection", admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe(401);
    expect(body.message).toContain("Invalid signature");
  });

  it("test-connection 409 when credentials are not yet configured", async () => {
    await req("PUT", "/admin/woocommerce-config", admin, { siteUrl: "https://shop.example.com" });
    const res = await req("POST", "/admin/woocommerce-config/test-connection", admin);
    expect(res.statusCode).toBe(409);
  });

  it("audits the test-connection with `woocommerce.test_connection`", async () => {
    await req("PUT", "/admin/woocommerce-config", admin, valid);
    await req("POST", "/admin/woocommerce-config/test-connection", admin);
    const rows = await dbh.db.select().from(auditOutbox);
    expect(rows.some((r) => r.action === "woocommerce.test_connection")).toBe(true);
  });
});
