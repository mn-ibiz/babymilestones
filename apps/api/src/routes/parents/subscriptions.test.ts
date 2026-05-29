import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, children, invoices, parents, smsOutbox, subscriptions, users, wallets } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { post as ledgerPost } from "@bm/wallet";
import { createPlan, createService, setPlanPrice } from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P2-E02-S02 — parent subscribes to a plan. Integration via app.inject. Covers
 * pre-pay from wallet (AC2), the subscriptions row (AC3), SMS confirm (AC4), and
 * the insufficient-funds / eligibility / duplicate guards.
 */
describe("parent subscribes to a plan (P2-E02-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  async function makeParent(phone: string, raw: string) {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: await hashPin("1357") }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "O" }).returning();
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: raw, pin: "1357" } });
    const cookies = login.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { userId: u!.id, parentId: p!.id, walletId: w!.id, session, csrfCookie, csrfToken: login.json().csrfToken as string };
  }
  type Parent = Awaited<ReturnType<typeof makeParent>>;

  const addChild = async (parentId: string, dob = "2024-01-01") =>
    (await dbh.db.insert(children).values({ parentId, firstName: "Zola", dateOfBirth: dob }).returning())[0]!.id;

  async function topup(walletId: string, amount: number) {
    await ledgerPost(dbh.db, { walletId, amount, kind: "topup", idempotencyKey: `t:${walletId}:${amount}`, source: "cash", postedBy: "system" });
  }

  /** A priced plan on a service; returns the plan id. */
  async function seedPlan(opts: { amountCents?: number; ageMaxMonths?: number | null } = {}) {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play", ageMaxMonths: opts.ageMaxMonths ?? null });
    const plan = await createPlan(dbh.db, { serviceId: svc.id, name: "8 Play / month", entitlementCount: 8, period: "month" });
    await setPlanPrice(dbh.db, { planId: plan.id, amountCents: opts.amountCents ?? 5000, effectiveFrom: "2026-01-01" });
    return plan.id;
  }

  const subscribe = (p: Parent, body: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/parents/me/subscriptions",
      headers: { cookie: `${p.session}; ${p.csrfCookie}`, "x-csrf-token": p.csrfToken },
      payload: body,
    });

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("subscribes: charges wallet, creates the subscription, SMS + audit (AC2/AC3/AC4)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    await topup(parent.walletId, 10_000);
    const childId = await addChild(parent.parentId);
    const planId = await seedPlan({ amountCents: 5000 });

    const res = await subscribe(parent, { planId, childId });
    expect(res.statusCode).toBe(201);
    expect(res.json().entitlementRemaining).toBe(8);

    const subs = await dbh.db.select().from(subscriptions);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.status).toBe("active");
    // The pre-pay invoice settled (charged from wallet) — none left outstanding.
    const open = await dbh.db.select().from(invoices).where(eq(invoices.status, "pending"));
    expect(open).toHaveLength(0);
    const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "subscription.confirmed"));
    expect(sms).toHaveLength(1);
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "subscription.created"));
    expect(audits).toHaveLength(1);
  });

  it("402s when the wallet can't cover the period; no subscription created (AC2)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    // wallet not funded
    const childId = await addChild(parent.parentId);
    const planId = await seedPlan({ amountCents: 5000 });
    const res = await subscribe(parent, { planId, childId });
    expect(res.statusCode).toBe(402);
    // No ACTIVE subscription is left (the provisional row was rolled back to cancelled).
    const active = (await dbh.db.select().from(subscriptions)).filter((s) => s.status === "active");
    expect(active).toHaveLength(0);
  });

  it("422s when the child is not age-eligible (AC1)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    await topup(parent.walletId, 10_000);
    const childId = await addChild(parent.parentId, "2024-01-01"); // ~29 months
    const planId = await seedPlan({ ageMaxMonths: 12 });
    const res = await subscribe(parent, { planId, childId });
    expect(res.statusCode).toBe(422);
  });

  it("409s a duplicate active subscription for the same child+plan", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    await topup(parent.walletId, 20_000);
    const childId = await addChild(parent.parentId);
    const planId = await seedPlan({ amountCents: 5000 });
    expect((await subscribe(parent, { planId, childId })).statusCode).toBe(201);
    expect((await subscribe(parent, { planId, childId })).statusCode).toBe(409);
  });

  it("404s a child the parent does not own", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const other = await makeParent("+254712000099", "0712000099");
    await topup(parent.walletId, 10_000);
    const otherChild = await addChild(other.parentId);
    const planId = await seedPlan();
    expect((await subscribe(parent, { planId, childId: otherChild })).statusCode).toBe(404);
  });

  it("401s when unauthenticated", async () => {
    const res = await app.inject({ method: "POST", url: "/parents/me/subscriptions", payload: { planId: "x", childId: "y" } });
    expect(res.statusCode).toBe(401);
  });

  const action = (p: Parent, subId: string, verb: "pause" | "resume") =>
    app.inject({
      method: "POST",
      url: `/parents/me/subscriptions/${subId}/${verb}`,
      headers: { cookie: `${p.session}; ${p.csrfCookie}`, "x-csrf-token": p.csrfToken },
    });

  it("pauses then resumes the subscription (P2-E02-S04 AC1/AC3)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    await topup(parent.walletId, 10_000);
    const childId = await addChild(parent.parentId);
    const planId = await seedPlan({ amountCents: 5000 });
    const subId = (await subscribe(parent, { planId, childId })).json().subscriptionId as string;

    const paused = await action(parent, subId, "pause");
    expect(paused.statusCode).toBe(200);
    expect(paused.json().status).toBe("paused");
    // Double-pause is a state error (409).
    expect((await action(parent, subId, "pause")).statusCode).toBe(409);

    const resumed = await action(parent, subId, "resume");
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().status).toBe("active");
  });

  it("404s pausing another parent's subscription", async () => {
    const owner = await makeParent("+254712345678", "0712345678");
    const other = await makeParent("+254712000099", "0712000099");
    await topup(owner.walletId, 10_000);
    const childId = await addChild(owner.parentId);
    const planId = await seedPlan();
    const subId = (await subscribe(owner, { planId, childId })).json().subscriptionId as string;
    expect((await action(other, subId, "pause")).statusCode).toBe(404);
  });
});
