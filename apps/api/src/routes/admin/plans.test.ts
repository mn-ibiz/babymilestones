import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P2-E02-S01 — subscription plan admin API. Integration via app.inject with real
 * staff sessions (+ CSRF). Covers `manage service` enforcement, CRUD + audit
 * (AC1/AC2), and effective-dated price changes (AC3).
 */
describe("Subscription plan admin API (P2-E02-S01)", () => {
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

  const req = (method: "GET" | "POST" | "PATCH", url: string, creds: Creds, payload?: Record<string, unknown>, auth = true) =>
    app.inject({
      method,
      url,
      headers: {
        cookie: auth ? `${creds.session}; ${creds.csrfCookie}` : creds.csrfCookie,
        "x-csrf-token": creds.csrfToken,
      },
      ...(payload ? { payload } : {}),
    });

  const createService = async (creds: Creds) =>
    (await req("POST", "/admin/services", creds, { name: "Soft Play", unit: "play" })).json().id as string;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const validPlan = { name: "8 Play / month", entitlementCount: 8, period: "month" };

  it("admin creates a plan, audited (AC1/AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const res = await req("POST", `/admin/services/${serviceId}/plans`, creds, validPlan);
    expect(res.statusCode).toBe(201);
    expect(res.json().entitlementCount).toBe(8);
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "catalog.plan.create"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.targetId).toBe(res.json().id);
  });

  it("reception (no manage service) is forbidden", async () => {
    const adminCreds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(adminCreds);
    const creds = await loginStaff("+254712000003", "7423");
    const res = await req("POST", `/admin/services/${serviceId}/plans`, creds, validPlan);
    expect(res.statusCode).toBe(403);
  });

  it("rejects an invalid period (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const res = await req("POST", `/admin/services/${serviceId}/plans`, creds, { ...validPlan, period: "year" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("period");
  });

  it("updates a plan, audited (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const planId = (await req("POST", `/admin/services/${serviceId}/plans`, creds, validPlan)).json().id as string;
    const res = await req("PATCH", `/admin/plans/${planId}`, creds, { entitlementCount: 12 });
    expect(res.statusCode).toBe(200);
    expect(res.json().entitlementCount).toBe(12);
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "catalog.plan.update"));
    expect(audits).toHaveLength(1);
  });

  it("sets effective-dated prices; rejects a backdated one (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const planId = (await req("POST", `/admin/services/${serviceId}/plans`, creds, validPlan)).json().id as string;

    expect((await req("POST", `/admin/plans/${planId}/prices`, creds, { amountCents: 5000, effectiveFrom: "2026-06-01" })).statusCode).toBe(201);
    const backdated = await req("POST", `/admin/plans/${planId}/prices`, creds, { amountCents: 4000, effectiveFrom: "2026-05-01" });
    expect(backdated.statusCode).toBe(409);
    expect(backdated.json().field).toBe("effectiveFrom");

    const history = await req("GET", `/admin/plans/${planId}/prices`, creds);
    expect(history.json().prices).toHaveLength(1);
  });

  it("rejects an unauthenticated request (401)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const res = await req("POST", `/admin/services/${serviceId}/plans`, creds, validPlan, false);
    expect(res.statusCode).toBe(401);
  });
});
