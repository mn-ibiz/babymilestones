import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, floatAccounts, reconciliationAdjustments, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { createProduct } from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P2-E04-S05 — end-of-day cash-up. Expected sums come from paid POS sales (S04),
 * so each test rings up real sales first, then closes the till.
 */
describe("POS end-of-day cash-up (P2-E04-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  async function login(phone: string, pin: string) {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrf = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { cookie: `${session}; ${csrf}`, csrfToken: res.json().csrfToken as string };
  }

  /** Ring up a paid cash sale of `qty` of a fresh product priced `priceCents`. */
  async function cashSale(creds: { cookie: string; csrfToken: string }, sku: string, priceCents: number, qty: number) {
    const p = await createProduct(dbh.db, { sku, name: sku, priceCents, stockQty: 1000 });
    const res = await app.inject({
      method: "POST",
      url: "/pos/sales",
      headers: { cookie: creds.cookie, "x-csrf-token": creds.csrfToken },
      payload: { method: "cash", lines: [{ productId: p.id, qty }], cashTenderedCents: priceCents * qty },
    });
    expect(res.json().status).toBe("paid");
  }

  const cashup = (creds: { cookie: string; csrfToken: string }, body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/pos/cashup", headers: { cookie: creds.cookie, "x-csrf-token": creds.csrfToken }, payload: body });

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "cashier"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "packer"));
    await dbh.db.insert(floatAccounts).values({ name: "Till 1", kind: "cash_drawer", openingDate: "2026-05-01" });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("forbids a packer (no create-payment)", async () => {
    const creds = await login("+254712000003", "7423");
    const res = await app.inject({ method: "GET", url: "/pos/cashup/expected", headers: { cookie: creds.cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("shows expected cash from paid cash sales (AC1)", async () => {
    const creds = await login("+254712000002", "7422");
    await cashSale(creds, "A", 1000, 2); // 2000
    await cashSale(creds, "B", 500, 1); // 500
    const res = await app.inject({ method: "GET", url: "/pos/cashup/expected", headers: { cookie: creds.cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().expectedCashCents).toBe(2500);
  });

  it("computes variance and posts a reconciliation adjustment (AC2/AC4)", async () => {
    const creds = await login("+254712000002", "7422");
    await cashSale(creds, "C", 1000, 3); // expected cash 3000
    const res = await cashup(creds, { countedCashCents: 3200 }); // +200 variance
    expect(res.statusCode).toBe(201);
    expect(res.json().varianceCents).toBe(200);

    const adjId = res.json().reconciliationAdjustmentId;
    expect(adjId).toBeTruthy();
    const [adj] = await dbh.db.select().from(reconciliationAdjustments).where(eq(reconciliationAdjustments.id, adjId));
    expect(adj!.amount).toBe(200);
    expect(adj!.status).toBe("pending");
    // audited
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "pos.cashup.closed")).toBe(true);
  });

  it("requires a reason for a variance over KES 500 (AC3)", async () => {
    const creds = await login("+254712000002", "7422");
    await cashSale(creds, "D", 100_000, 1); // expected 100000 cents (KES 1000)
    // counted 170000 cents → +70000 variance (KES 700) > KES 500 threshold, no reason
    const blocked = await cashup(creds, { countedCashCents: 170_000 });
    expect(blocked.statusCode).toBe(400);

    const ok = await cashup(creds, { countedCashCents: 170_000, reason: "Float not counted in" });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().reason).toBe("Float not counted in");
  });

    it("fails closed when a variance has no cash-drawer float to reconcile against (AC4)", async () => {
      await dbh.db.delete(floatAccounts); // no active cash-drawer float configured
      const creds = await login("+254712000002", "7422");
      await cashSale(creds, "NF", 1000, 1); // expected 1000
      const res = await cashup(creds, { countedCashCents: 1200 }); // +200 variance, nowhere to post it
      expect(res.statusCode).toBe(409);
      // The close rolled back: the sale stays uncashed and can be retried once a float exists.
      const expected = await app.inject({ method: "GET", url: "/pos/cashup/expected", headers: { cookie: creds.cookie } });
      expect(expected.json().expectedCashCents).toBe(1000);
    });

  it("allows a zero variance with no reason and posts no adjustment", async () => {
    const creds = await login("+254712000002", "7422");
    await cashSale(creds, "E", 1000, 1); // expected 1000
    const res = await cashup(creds, { countedCashCents: 1000 });
    expect(res.statusCode).toBe(201);
    expect(res.json().varianceCents).toBe(0);
    expect(res.json().reconciliationAdjustmentId).toBeNull();
  });

  it("scopes expected sums to sales since the previous cash-up", async () => {
    const creds = await login("+254712000002", "7422");
    await cashSale(creds, "F", 1000, 1); // 1000
    await cashup(creds, { countedCashCents: 1000 }); // close — variance 0
    await cashSale(creds, "G", 2000, 1); // 2000 after the close
    const res = await app.inject({ method: "GET", url: "/pos/cashup/expected", headers: { cookie: creds.cookie } });
    expect(res.json().expectedCashCents).toBe(2000); // only the new sale
  });
});
