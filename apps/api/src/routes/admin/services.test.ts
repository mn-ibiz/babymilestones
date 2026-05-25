import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, servicePrices, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E07-S01 — service catalogue + effective-dated price admin API. Integration
 * via app.inject with real staff sessions (+ CSRF). Covers `manage service`
 * enforcement, validation (AC1), price-change preserving history (AC2/AC3),
 * effective-dated history read, and audit on every mutation (AC5).
 */
describe("Service catalogue admin API (P1-E07-S01)", () => {
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

  const validService = { name: "Soft Play", unit: "play", description: "Indoor play" };

  it("admin can create a service, audited (AC1/AC5)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, validService);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Soft Play");
    expect(body.unit).toBe("play");
    expect(body.isActive).toBe(true);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.create"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.targetId).toBe(body.id);
  });

  it("reception (no manage service) is forbidden", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await req("POST", "/admin/services", creds, validService);
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, validService, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid unit (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, { ...validService, unit: "spa" });
    expect(res.statusCode).toBe(400);
  });

  it("creates a service with a valid attribution role and reads it back (P1-E07-S02 AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "Baby Haircut",
      unit: "salon",
      attributionRoleRequired: "stylist",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().attributionRoleRequired).toBe("stylist");

    const read = await req("GET", `/admin/services/${res.json().id}`, creds);
    expect(read.json().attributionRoleRequired).toBe("stylist");
  });

  it("rejects an attribution role outside the staff-role taxonomy (P1-E07-S02 AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      ...validService,
      attributionRoleRequired: "reception", // RBAC role, not an attribution role
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("attributionRoleRequired");
  });

  it("creates with attribution optional when omitted (P1-E07-S02 AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, validService);
    expect(res.statusCode).toBe(201);
    expect(res.json().attributionRoleRequired).toBeNull();
  });

  it("can set the attribution role via PATCH, audited (P1-E07-S02 AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, { name: "Talent", unit: "talent" })).json();
    const patched = await req("PATCH", `/admin/services/${svc.id}`, creds, {
      attributionRoleRequired: "instructor",
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().attributionRoleRequired).toBe("instructor");

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.update"));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("PATCH rejects an invalid attribution role (P1-E07-S02 AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, validService)).json();
    const res = await req("PATCH", `/admin/services/${svc.id}`, creds, {
      attributionRoleRequired: "wizard",
    });
    expect(res.statusCode).toBe(400);
  });

  it("creating a price change preserves the old row + inserts a new one (AC2/AC3), audited (AC5)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, validService)).json();

    const p1 = await req("POST", `/admin/services/${svc.id}/prices`, creds, {
      amountCents: 50_000,
      effectiveFrom: "2026-01-01",
    });
    expect(p1.statusCode).toBe(201);
    expect(p1.json().effectiveTo).toBeNull();

    const p2 = await req("POST", `/admin/services/${svc.id}/prices`, creds, {
      amountCents: 60_000,
      effectiveFrom: "2026-06-01",
    });
    expect(p2.statusCode).toBe(201);

    const history = (await req("GET", `/admin/services/${svc.id}/prices`, creds)).json();
    expect(history.prices).toHaveLength(2);
    const old = history.prices[0];
    expect(old.amountCents).toBe(50_000);
    expect(old.effectiveTo).toBe("2026-06-01"); // closed, not overwritten
    expect(history.prices[1].amountCents).toBe(60_000);
    expect(history.prices[1].effectiveTo).toBeNull();

    // Exactly one open row remains in the DB.
    const open = (
      await dbh.db.select().from(servicePrices).where(eq(servicePrices.serviceId, svc.id))
    ).filter((r) => r.effectiveTo === null);
    expect(open).toHaveLength(1);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.price_change"));
    expect(audits).toHaveLength(2);
  });

  it("409s a backdated/same-date price (never overwrites history)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, validService)).json();
    await req("POST", `/admin/services/${svc.id}/prices`, creds, {
      amountCents: 50_000,
      effectiveFrom: "2026-06-01",
    });
    const clash = await req("POST", `/admin/services/${svc.id}/prices`, creds, {
      amountCents: 60_000,
      effectiveFrom: "2026-06-01",
    });
    expect(clash.statusCode).toBe(409);
    // History still has exactly one (open) row.
    const history = (await req("GET", `/admin/services/${svc.id}/prices`, creds)).json();
    expect(history.prices).toHaveLength(1);
  });

  it("soft-deletes a service via PATCH isActive=false (no hard delete), audited", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, validService)).json();

    const patched = await req("PATCH", `/admin/services/${svc.id}`, creds, { isActive: false });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().isActive).toBe(false);

    // Still readable (row preserved); excluded from activeOnly list.
    const read = await req("GET", `/admin/services/${svc.id}`, creds);
    expect(read.statusCode).toBe(200);
    const active = (await req("GET", "/admin/services?activeOnly=1", creds)).json();
    expect(active.services).toHaveLength(0);
    const all = (await req("GET", "/admin/services", creds)).json();
    expect(all.services).toHaveLength(1);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.update"));
    expect(audits).toHaveLength(1);
  });

  it("404s an unknown service on read/patch/price", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const missing = "00000000-0000-0000-0000-000000000000";
    expect((await req("GET", `/admin/services/${missing}`, creds)).statusCode).toBe(404);
    expect((await req("PATCH", `/admin/services/${missing}`, creds, { name: "x" })).statusCode).toBe(404);
    expect(
      (await req("POST", `/admin/services/${missing}/prices`, creds, {
        amountCents: 100,
        effectiveFrom: "2026-01-01",
      })).statusCode,
    ).toBe(404);
  });

  it("rejects an empty update patch (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, validService)).json();
    const empty = await req("PATCH", `/admin/services/${svc.id}`, creds, {});
    expect(empty.statusCode).toBe(400);
  });
});
