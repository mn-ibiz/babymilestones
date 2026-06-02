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

  it("persists an age-eligibility range and reads it back (P2-E01-S02 AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      ...validService,
      ageMinMonths: 0,
      ageMaxMonths: 12,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ageMinMonths).toBe(0);
    expect(res.json().ageMaxMonths).toBe(12);
  });

  it("rejects a one-sided age update that inverts the merged range (P2-E01-S02 AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = await req("POST", "/admin/services", creds, {
      ...validService,
      ageMinMonths: 0,
      ageMaxMonths: 12,
    });
    // Patch only the min above the stored max — must 400, not hit the DB CHECK (500).
    const res = await req("PATCH", `/admin/services/${created.json().id}`, creds, { ageMinMonths: 50 });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("ageMaxMonths");
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

  it("defaults a created service to vat_exempt + audits the treatment (P1-E07-S04 AC1/AC3/AC5)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, validService);
    expect(res.statusCode).toBe(201);
    expect(res.json().taxTreatment).toBe("vat_exempt");

    const [a] = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.create"));
    expect((a!.payload as { tax_treatment?: string }).tax_treatment).toBe("vat_exempt");
  });

  it("creates with an explicit tax treatment + reads it back (P1-E07-S04 AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = await req("POST", "/admin/services", creds, {
      ...validService,
      taxTreatment: "vat_exclusive",
    });
    expect(created.json().taxTreatment).toBe("vat_exclusive");
    const read = await req("GET", `/admin/services/${created.json().id}`, creds);
    expect(read.json().taxTreatment).toBe("vat_exclusive");
  });

  it("can change the tax treatment via PATCH (P1-E07-S04 AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, validService)).json();
    const patched = await req("PATCH", `/admin/services/${svc.id}`, creds, {
      taxTreatment: "zero_rated",
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().taxTreatment).toBe("zero_rated");
  });

  it("PATCH rejects an invalid tax treatment (P1-E07-S04 AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (await req("POST", "/admin/services", creds, validService)).json();
    const res = await req("PATCH", `/admin/services/${svc.id}`, creds, { taxTreatment: "gst" });
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

  /* --- Coaching catalogue (P5-E01-S01 / Story 31.1) ------------------------ */

  it("creates a coaching offering with format, duration, age-stage tags + coach, audited (AC1-AC4)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "Sleep coaching",
      unit: "coaching",
      format: "one_to_one",
      coachingDurationMinutes: 45,
      ageStageTags: ["expecting", "0-3mo"],
      attributionRoleRequired: "coach",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.unit).toBe("coaching");
    expect(body.format).toBe("one_to_one");
    expect(body.coachingDurationMinutes).toBe(45);
    expect(body.ageStageTags).toEqual(["expecting", "0-3mo"]);
    expect(body.attributionRoleRequired).toBe("coach");

    // Round-trips on read.
    const read = await req("GET", `/admin/services/${body.id}`, creds);
    expect(read.json().format).toBe("one_to_one");
    expect(read.json().ageStageTags).toEqual(["expecting", "0-3mo"]);

    // Reuses the catalog.service.create audit action (AC4).
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.create"));
    expect(audits.some((a) => a.targetId === body.id)).toBe(true);
  });

  it("creates a group coaching offering with empty age-stage tags (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "New-parent group",
      unit: "coaching",
      format: "group",
      coachingDurationMinutes: 90,
      ageStageTags: [],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().format).toBe("group");
    expect(res.json().ageStageTags).toEqual([]);
  });

  it("rejects a coaching format outside the enum (AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "Bad",
      unit: "coaching",
      format: "webinar",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("format");
  });

  it("updates the format/duration/tags of a coaching offering via PATCH, audited (AC2/AC4)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (
      await req("POST", "/admin/services", creds, {
        name: "Coaching",
        unit: "coaching",
        format: "one_to_one",
        coachingDurationMinutes: 30,
      })
    ).json();
    const patched = await req("PATCH", `/admin/services/${svc.id}`, creds, {
      format: "group",
      coachingDurationMinutes: 60,
      ageStageTags: ["3-6mo", "6-12mo"],
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().format).toBe("group");
    expect(patched.json().coachingDurationMinutes).toBe(60);
    expect(patched.json().ageStageTags).toEqual(["3-6mo", "6-12mo"]);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.update"));
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("reception (no manage service) cannot create a coaching offering (AC4 RBAC)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await req("POST", "/admin/services", creds, {
      name: "Coaching",
      unit: "coaching",
      format: "group",
    });
    expect(res.statusCode).toBe(403);
  });

  /* --- Group coaching capacity (P5-E01-S03 / Story 31.3) ------------------- */

  it("creates a group coaching offering with a seat capacity, round-trips on read (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "New-parent group",
      unit: "coaching",
      format: "group",
      coachingDurationMinutes: 90,
      coachingCapacity: 8,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().coachingCapacity).toBe(8);

    const read = await req("GET", `/admin/services/${res.json().id}`, creds);
    expect(read.json().coachingCapacity).toBe(8);
  });

  it("rejects a coaching capacity below 1 (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "Bad group",
      unit: "coaching",
      format: "group",
      coachingCapacity: 0,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("coachingCapacity");
  });

  it("updates a coaching offering's capacity via PATCH (AC1)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (
      await req("POST", "/admin/services", creds, {
        name: "Group",
        unit: "coaching",
        format: "group",
        coachingDurationMinutes: 60,
        coachingCapacity: 4,
      })
    ).json();
    const patched = await req("PATCH", `/admin/services/${svc.id}`, creds, { coachingCapacity: 10 });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().coachingCapacity).toBe(10);
  });

  /* --- Discreet billing labels (P5-E01-S05 / Story 31.5) ------------------ */

  it("creates a coaching offering with discreet billing on, round-trips on read (AC1/AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "Postnatal depression coaching",
      unit: "coaching",
      format: "one_to_one",
      discreetBillingEnabled: true,
      discreetBillingLabel: "BM Coaching Session",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().discreetBillingEnabled).toBe(true);
    expect(res.json().discreetBillingLabel).toBe("BM Coaching Session");

    const read = await req("GET", `/admin/services/${res.json().id}`, creds);
    expect(read.json().discreetBillingEnabled).toBe(true);
    expect(read.json().discreetBillingLabel).toBe("BM Coaching Session");
  });

  it("defaults discreet billing off with a null label (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, { name: "Coaching", unit: "coaching" });
    expect(res.statusCode).toBe(201);
    expect(res.json().discreetBillingEnabled).toBe(false);
    expect(res.json().discreetBillingLabel).toBeNull();
  });

  it("rejects enabling discreet billing without a label (AC1 validation 400)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/services", creds, {
      name: "Coaching",
      unit: "coaching",
      discreetBillingEnabled: true,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("discreetBillingLabel");
  });

  it("toggles discreet billing on then off via PATCH, audited (AC3)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (
      await req("POST", "/admin/services", creds, { name: "Coaching", unit: "coaching" })
    ).json();

    const on = await req("PATCH", `/admin/services/${svc.id}`, creds, {
      discreetBillingEnabled: true,
      discreetBillingLabel: "BM Coaching Session",
    });
    expect(on.statusCode).toBe(200);
    expect(on.json().discreetBillingEnabled).toBe(true);
    expect(on.json().discreetBillingLabel).toBe("BM Coaching Session");

    const off = await req("PATCH", `/admin/services/${svc.id}`, creds, {
      discreetBillingEnabled: false,
      discreetBillingLabel: null,
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().discreetBillingEnabled).toBe(false);
    expect(off.json().discreetBillingLabel).toBeNull();

    // The toggle reuses the existing catalog.service.update audit action.
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.service.update"));
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects enabling discreet billing via PATCH without a label (AC1 validation 400)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const svc = (
      await req("POST", "/admin/services", creds, { name: "Coaching", unit: "coaching" })
    ).json();
    const res = await req("PATCH", `/admin/services/${svc.id}`, creds, {
      discreetBillingEnabled: true,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("discreetBillingLabel");
  });
});
