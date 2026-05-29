import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { createProduct } from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P2-E04-S02 — POS product catalogue read endpoints. Exercises the auth/role
 * gate (`read product`, held by the till roles), the SKU/barcode lookup (AC1),
 * the name search (AC2), and out-of-stock visibility (AC3).
 */
describe("GET /pos/products/* (P2-E04-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  /** Log in and return the session cookie string for `cookie` injection. */
  async function login(phone: string, pin: string): Promise<string> {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    return cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    // A cashier (POS role) and a parent (no POS access).
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "cashier"));
    await dbh.db.insert(users).values(await staffUserSeed("+254700000009", "1212", "treasury"));
    // Known products (alongside the migration's stub seed).
    await createProduct(dbh.db, {
      sku: "TST-RATTLE",
      barcode: "0123456789012",
      name: "Rainbow Rattle",
      priceCents: 45000,
      stockQty: 10,
    });
    await createProduct(dbh.db, {
      sku: "TST-EMPTY",
      barcode: "0123456789999",
      name: "Rainbow Mobile",
      priceCents: 90000,
      stockQty: 0,
    });
  });

  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("rejects an unauthenticated request (AC: auth)", async () => {
    const res = await app.inject({ method: "GET", url: "/pos/products/lookup?code=TST-RATTLE" });
    expect(res.statusCode).toBe(401);
  });

  it("forbids a role without POS product access (treasury)", async () => {
    const cookie = await login("+254700000009", "1212");
    const res = await app.inject({
      method: "GET",
      url: "/pos/products/search?q=Rainbow",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  describe("as a cashier", () => {
    let cookie: string;
    beforeEach(async () => {
      cookie = await login("+254712000001", "7421");
    });

    it("looks a product up by SKU (AC1)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/pos/products/lookup?code=TST-RATTLE",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().product).toMatchObject({
        sku: "TST-RATTLE",
        name: "Rainbow Rattle",
        priceCents: 45000,
        inStock: true,
      });
    });

    it("looks a product up by barcode (AC1)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/pos/products/lookup?code=0123456789012",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().product.sku).toBe("TST-RATTLE");
    });

    it("returns product:null for an unknown code", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/pos/products/lookup?code=NO-SUCH",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().product).toBeNull();
    });

    it("searches by name and shows price + stock (AC2)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/pos/products/search?q=Rainbow",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const products = res.json().products as Array<{ name: string; priceCents: number; inStock: boolean }>;
      const names = products.map((p) => p.name).sort();
      expect(names).toEqual(["Rainbow Mobile", "Rainbow Rattle"]);
    });

    it("flags an out-of-stock product as not in stock (AC3)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/pos/products/search?q=Rainbow Mobile",
        headers: { cookie },
      });
      const products = res.json().products as Array<{ stockQty: number; inStock: boolean }>;
      expect(products).toHaveLength(1);
      expect(products[0]!.stockQty).toBe(0);
      expect(products[0]!.inStock).toBe(false);
    });

    it("400s a blank search query", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/pos/products/search?q=",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
