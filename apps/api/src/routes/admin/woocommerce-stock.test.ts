import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, products, users, wcStockReconciliations } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { createProduct } from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * Story 29.5 (P4-E04-S05) — admin SKU-mapping + reconciliation surface. Integration
 * via app.inject with real staff sessions (+ CSRF). Covers `manage config`
 * enforcement, the mapping list / manual edit / bulk CSV import (AC5), and the
 * nightly reconciliation report read (AC6).
 */
describe("WooCommerce stock admin API (Story 29.5)", () => {
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
    method: "GET" | "POST" | "PATCH",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      headers: { cookie: `${creds.session}; ${creds.csrfCookie}`, "x-csrf-token": creds.csrfToken },
      payload: payload ?? undefined,
    });

  let admin: Creds;
  let reception: Creds;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.delete(products);
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    admin = await loginStaff("+254712000001", "7421");
    reception = await loginStaff("+254712000003", "7423");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("forbids a non-config role from the mapping list (manage config gate)", async () => {
    const res = await req("GET", "/admin/woocommerce-stock/sku-mappings", reception);
    expect(res.statusCode).toBe(403);
  });

  it("lists products with their woo_product_id (AC5)", async () => {
    await createProduct(dbh.db, { sku: "BM-A", name: "Alpha", priceCents: 100, stockQty: 5 });
    const res = await req("GET", "/admin/woocommerce-stock/sku-mappings", admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mappings).toHaveLength(1);
    expect(body.mappings[0]).toMatchObject({ sku: "BM-A", wooProductId: null });
  });

  it("manually maps a product + audits (AC5)", async () => {
    const p = await createProduct(dbh.db, { sku: "BM-A", name: "Alpha", priceCents: 100, stockQty: 5 });
    const res = await req("PATCH", `/admin/woocommerce-stock/sku-mappings/${p.id}`, admin, { wooProductId: 4242 });
    expect(res.statusCode).toBe(200);
    expect(res.json().wooProductId).toBe(4242);
    const [fresh] = await dbh.db.select().from(products).where(eq(products.id, p.id));
    expect(fresh!.wooProductId).toBe(4242);
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "woocommerce.sku_mapping.updated")).toBe(true);
  });

  it("404s a manual edit for an unknown product (AC5)", async () => {
    const res = await req(
      "PATCH",
      "/admin/woocommerce-stock/sku-mappings/00000000-0000-0000-0000-000000000000",
      admin,
      { wooProductId: 1 },
    );
    expect(res.statusCode).toBe(404);
  });

  it("bulk CSV import applies + reports errors + audits (AC5)", async () => {
    await createProduct(dbh.db, { sku: "BM-A", name: "Alpha", priceCents: 100, stockQty: 5 });
    const csv = "sku,woo_product_id\nBM-A,5005\nBM-GHOST,6006\n";
    const res = await req("POST", "/admin/woocommerce-stock/sku-mappings/import", admin, { csv });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied).toBe(1);
    expect(body.errors).toHaveLength(1); // BM-GHOST unknown
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "woocommerce.sku_mapping.updated")).toBe(true);
  });

  it("reads the newest reconciliation report (AC6)", async () => {
    await dbh.db.insert(wcStockReconciliations).values({
      generatedAt: new Date("2026-06-02T02:00:00Z"),
      comparedCount: 2,
      drift: [
        { productId: "p1", sku: "BM-A", name: "Alpha", wooProductId: 1, localStock: 3, wooStock: 8, delta: -5 },
      ],
    });
    const res = await req("GET", "/admin/woocommerce-stock/reconciliation", admin);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.report.comparedCount).toBe(2);
    expect(body.report.drift[0].sku).toBe("BM-A");
  });

  it("returns a null report when none has run yet (AC6)", async () => {
    const res = await req("GET", "/admin/woocommerce-stock/reconciliation", admin);
    expect(res.statusCode).toBe(200);
    expect(res.json().report).toBeNull();
  });
});
