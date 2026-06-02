import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { servicePrices } from "@bm/db";
import {
  ATTRIBUTION_ROLES,
  checkBookingAttribution,
  COACHING_FORMATS,
  computeLineTax,
  createService,
  DEFAULT_TAX_TREATMENT,
  getService,
  getServiceAttributionRole,
  getServiceTaxTreatment,
  isAttributionRole,
  isCoachingFormat,
  isTaxTreatment,
  listServicesByUnit,
  serviceTaxTreatment,
  TAX_TREATMENTS,
  listServicePrices,
  listServices,
  resolveServicePriceAt,
  serviceAttributionRole,
  ServicePriceOrderError,
  setServicePrice,
  updateService,
} from "./services.js";
import { createStaff } from "./staff.js";

/**
 * P1-E07-S01 — service catalogue + effective-dated price history domain logic.
 * DB-backed via the PGlite harness. Covers create/update, soft-delete (no hard
 * delete), price-change preserving the old row + inserting a new one, and the
 * effective-dated lookup by booking date.
 */
describe("catalogue services + effective-dated prices (P1-E07-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("creates a service active by default (AC1)", async () => {
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    expect(svc.name).toBe("Soft Play");
    expect(svc.unit).toBe("play");
    expect(svc.isActive).toBe(true);
    expect(svc.attributionRoleRequired).toBeNull();
  });

  it("supports an attribution role + description", async () => {
    const svc = await createService(dbh.db, {
      name: "Coaching Session",
      description: "1:1 parenting coach",
      unit: "coaching",
      attributionRoleRequired: "coach",
    });
    expect(svc.description).toBe("1:1 parenting coach");
    expect(svc.attributionRoleRequired).toBe("coach");
  });

  it("updates a service (partial patch)", async () => {
    const svc = await createService(dbh.db, { name: "Salon", unit: "salon" });
    const updated = await updateService(dbh.db, svc.id, { name: "Baby Salon" });
    expect(updated?.name).toBe("Baby Salon");
    expect(updated?.unit).toBe("salon"); // unchanged
  });

  it("soft-deletes via isActive=false — never a hard delete", async () => {
    const svc = await createService(dbh.db, { name: "Event Hire", unit: "event" });
    await updateService(dbh.db, svc.id, { isActive: false });
    // Row is preserved (still readable), just inactive.
    const read = await getService(dbh.db, svc.id);
    expect(read).not.toBeNull();
    expect(read?.isActive).toBe(false);
    // It is excluded from the active-only list but present in the full list.
    expect(await listServices(dbh.db, { activeOnly: true })).toHaveLength(0);
    expect(await listServices(dbh.db)).toHaveLength(1);
  });

  it("updateService returns null for an unknown id", async () => {
    const r = await updateService(dbh.db, "00000000-0000-0000-0000-000000000000", { name: "x" });
    expect(r).toBeNull();
  });

  it("setServicePrice inserts the first open price row (AC2)", async () => {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    const price = await setServicePrice(dbh.db, {
      serviceId: svc.id,
      amountCents: 50_000,
      effectiveFrom: "2026-01-01",
    });
    expect(price.amountCents).toBe(50_000);
    expect(price.effectiveFrom).toBe("2026-01-01");
    expect(price.effectiveTo).toBeNull();
  });

  it("a price change preserves the old row (sets effective_to) + inserts a new one (AC3)", async () => {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 50_000, effectiveFrom: "2026-01-01" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 60_000, effectiveFrom: "2026-06-01" });

    const history = await listServicePrices(dbh.db, svc.id);
    expect(history).toHaveLength(2); // old row NOT overwritten
    const old = history[0]!;
    const current = history[1]!;
    expect(old.amountCents).toBe(50_000);
    expect(old.effectiveTo).toBe("2026-06-01"); // closed at the new start
    expect(current.amountCents).toBe(60_000);
    expect(current.effectiveTo).toBeNull(); // new open row
  });

  it("resolves the price applicable at a booking date (AC4)", async () => {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 50_000, effectiveFrom: "2026-01-01" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 60_000, effectiveFrom: "2026-06-01" });

    // Within the first range.
    expect((await resolveServicePriceAt(dbh.db, svc.id, "2026-03-15"))?.amountCents).toBe(50_000);
    // On the boundary — the new range is inclusive of its start (half-open).
    expect((await resolveServicePriceAt(dbh.db, svc.id, "2026-06-01"))?.amountCents).toBe(60_000);
    // The day before the boundary still resolves the old price.
    expect((await resolveServicePriceAt(dbh.db, svc.id, "2026-05-31"))?.amountCents).toBe(50_000);
    // Within the current open range (no upper bound).
    expect((await resolveServicePriceAt(dbh.db, svc.id, "2027-01-01"))?.amountCents).toBe(60_000);
  });

  it("resolves null before the first effective date", async () => {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 50_000, effectiveFrom: "2026-01-01" });
    expect(await resolveServicePriceAt(dbh.db, svc.id, "2025-12-31")).toBeNull();
  });

  it("rejects a new price not strictly after the current one (no backdating/overwrite)", async () => {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 50_000, effectiveFrom: "2026-06-01" });
    // Same date — would close the old row to an invalid range.
    await expect(
      setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 60_000, effectiveFrom: "2026-06-01" }),
    ).rejects.toBeInstanceOf(ServicePriceOrderError);
    // Earlier date — backdating is rejected too.
    await expect(
      setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 60_000, effectiveFrom: "2026-01-01" }),
    ).rejects.toBeInstanceOf(ServicePriceOrderError);
    // The original open row is untouched (transaction rolled back).
    const history = await listServicePrices(dbh.db, svc.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.effectiveTo).toBeNull();
  });

  it("price-change is atomic: at most one open row per service", async () => {
    const svc = await createService(dbh.db, { name: "Play", unit: "play" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 50_000, effectiveFrom: "2026-01-01" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 60_000, effectiveFrom: "2026-06-01" });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 70_000, effectiveFrom: "2026-09-01" });

    const open = (await listServicePrices(dbh.db, svc.id)).filter((p) => p.effectiveTo === null);
    expect(open).toHaveLength(1);
    expect(open[0]!.amountCents).toBe(70_000);
    // Sanity: confirm via direct query too.
    const direct = await dbh.db.select().from(servicePrices).where(eq(servicePrices.serviceId, svc.id));
    expect(direct).toHaveLength(3);
  });
});

/**
 * P1-E07-S02 — attribution role per service. The nullable ENUM persists, is
 * constrained to the staff-role taxonomy at the DB level, and the booking-flow
 * gate forces a matching active-staff pick when set (AC2) / leaves it optional
 * when null (AC3).
 */
describe("attribution role per service (P1-E07-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("exposes the staff-role taxonomy (AC1)", () => {
    expect(ATTRIBUTION_ROLES).toEqual([
      "stylist",
      "instructor",
      "attendant",
      "coach",
      "event_staff",
    ]);
    for (const r of ATTRIBUTION_ROLES) expect(isAttributionRole(r)).toBe(true);
    expect(isAttributionRole("reception")).toBe(false); // RBAC role, not an attribution role
    expect(isAttributionRole(null)).toBe(false);
    expect(isAttributionRole("")).toBe(false);
  });

  it("persists a nullable attribution role and reads it back (AC1)", async () => {
    const salon = await createService(dbh.db, {
      name: "Baby Haircut",
      unit: "salon",
      attributionRoleRequired: "stylist",
    });
    expect(salon.attributionRoleRequired).toBe("stylist");
    expect(await getServiceAttributionRole(dbh.db, salon.id)).toBe("stylist");

    // Null is allowed (attribution optional, AC3).
    const event = await createService(dbh.db, { name: "Party Hall", unit: "event" });
    expect(event.attributionRoleRequired).toBeNull();
    expect(await getServiceAttributionRole(dbh.db, event.id)).toBeNull();
  });

  it("getServiceAttributionRole returns undefined for an unknown service", async () => {
    expect(
      await getServiceAttributionRole(dbh.db, "00000000-0000-0000-0000-000000000000"),
    ).toBeUndefined();
  });

  it("can set and clear the attribution role via update (AC1)", async () => {
    const svc = await createService(dbh.db, { name: "Talent Class", unit: "talent" });
    const set = await updateService(dbh.db, svc.id, { attributionRoleRequired: "instructor" });
    expect(set?.attributionRoleRequired).toBe("instructor");
    const changed = await updateService(dbh.db, svc.id, { attributionRoleRequired: "coach" });
    expect(changed?.attributionRoleRequired).toBe("coach");
  });

  it("DB CHECK rejects a role outside the taxonomy (AC1)", async () => {
    // Bypass the typed input to prove the constraint is enforced at the DB level,
    // not just in TS — a free-text or RBAC role must be rejected.
    await expect(
      createService(dbh.db, {
        name: "Bad",
        unit: "play",
        // @ts-expect-error — intentionally invalid value to exercise the CHECK
        attributionRoleRequired: "reception",
      }),
    ).rejects.toThrow();
  });

  it("serviceAttributionRole reads the role off a row", () => {
    expect(serviceAttributionRole({ attributionRoleRequired: "coach" })).toBe("coach");
    expect(serviceAttributionRole({ attributionRoleRequired: null })).toBeNull();
  });

  describe("checkBookingAttribution gate (AC2/AC3)", () => {
    it("allows any pick when the service requires no attribution (AC3)", () => {
      expect(checkBookingAttribution(null, null).ok).toBe(true);
      expect(
        checkBookingAttribution(null, { role: "stylist", isActive: true }).ok,
      ).toBe(true);
    });

    it("forces a staff pick when a role is required (AC2)", () => {
      const r = checkBookingAttribution("stylist", null);
      expect(r).toEqual({ ok: false, reason: "staff_required" });
    });

    it("requires the staff member to be active (AC2)", () => {
      const r = checkBookingAttribution("stylist", { role: "stylist", isActive: false });
      expect(r).toEqual({ ok: false, reason: "staff_inactive" });
    });

    it("requires the staff member to hold the required role (AC2)", () => {
      const r = checkBookingAttribution("stylist", { role: "instructor", isActive: true });
      expect(r).toEqual({ ok: false, reason: "staff_role_mismatch" });
    });

    it("passes for an active staff member of the required role (AC2)", () => {
      expect(
        checkBookingAttribution("stylist", { role: "stylist", isActive: true }).ok,
      ).toBe(true);
    });
  });

  describe("VAT / tax treatment per service (P1-E07-S04)", () => {
    it("defaults a new service to vat_exempt (AC3)", async () => {
      const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
      expect(svc.taxTreatment).toBe("vat_exempt");
      expect(DEFAULT_TAX_TREATMENT).toBe("vat_exempt");
    });

    it("persists an explicit treatment on create (AC1)", async () => {
      const svc = await createService(dbh.db, {
        name: "Hall hire",
        unit: "event",
        taxTreatment: "vat_exclusive",
      });
      expect(svc.taxTreatment).toBe("vat_exclusive");
      expect(serviceTaxTreatment(svc)).toBe("vat_exclusive");
    });

    it("updates the treatment (AC1) and reads it back for the receipt engine", async () => {
      const svc = await createService(dbh.db, { name: "Salon", unit: "salon" });
      const updated = await updateService(dbh.db, svc.id, { taxTreatment: "zero_rated" });
      expect(updated?.taxTreatment).toBe("zero_rated");
      expect(await getServiceTaxTreatment(dbh.db, svc.id)).toBe("zero_rated");
      expect(await getServiceTaxTreatment(dbh.db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
    });

    it("rejects a treatment outside the enum at the DB CHECK (AC1)", async () => {
      const svc = await createService(dbh.db, { name: "Coaching", unit: "coaching" });
      await expect(
        updateService(dbh.db, svc.id, { taxTreatment: "gst" as never }),
      ).rejects.toThrow();
    });

    it("exposes the constrained treatment set + guard", () => {
      expect(TAX_TREATMENTS).toEqual(["vat_inclusive", "vat_exclusive", "vat_exempt", "zero_rated"]);
      expect(isTaxTreatment("vat_inclusive")).toBe(true);
      expect(isTaxTreatment("vat")).toBe(false);
    });

    it("computeLineTax: exempt + zero_rated carry no tax (AC2)", () => {
      expect(computeLineTax("vat_exempt", 60_000)).toEqual({
        treatment: "vat_exempt",
        netCents: 60_000,
        taxCents: 0,
        grossCents: 60_000,
        rateBps: 0,
      });
      expect(computeLineTax("zero_rated", 60_000)).toMatchObject({ taxCents: 0, rateBps: 0 });
    });

    it("computeLineTax: exclusive adds 16% VAT on top (AC2)", () => {
      expect(computeLineTax("vat_exclusive", 100_000)).toEqual({
        treatment: "vat_exclusive",
        netCents: 100_000,
        taxCents: 16_000,
        grossCents: 116_000,
        rateBps: 1600,
      });
    });

    it("computeLineTax: inclusive backs the VAT out of the gross (AC2)", () => {
      const r = computeLineTax("vat_inclusive", 116_000);
      expect(r.netCents).toBe(100_000);
      expect(r.taxCents).toBe(16_000);
      expect(r.grossCents).toBe(116_000);
      // net + tax always reconstitutes the gross (no float drift).
      expect(r.netCents + r.taxCents).toBe(r.grossCents);
    });

    it("computeLineTax: honours a custom rate", () => {
      expect(computeLineTax("vat_exclusive", 100_000, 800)).toMatchObject({ taxCents: 8_000 });
    });
  });
});

/**
 * P5-E01-S01 (Story 31.1) — Coaching catalogue (1:1 + group). A coaching offering
 * is a `service` with `unit = 'coaching'` carrying a format (one_to_one | group),
 * a duration, optional free-set age-stage tags, and a coach assigned via the
 * existing attribution mechanism (`attributionRoleRequired = 'coach'`, no login).
 */
describe("coaching catalogue (P5-E01-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("exposes the constrained coaching-format set + guard (AC2)", () => {
    expect(COACHING_FORMATS).toEqual(["one_to_one", "group"]);
    for (const f of COACHING_FORMATS) expect(isCoachingFormat(f)).toBe(true);
    expect(isCoachingFormat("webinar")).toBe(false);
    expect(isCoachingFormat(null)).toBe(false);
    expect(isCoachingFormat("")).toBe(false);
  });

  it("creates a 1:1 coaching offering with format, duration, age-stage tags + a coach (AC1/AC2/AC3)", async () => {
    const svc = await createService(dbh.db, {
      name: "Sleep coaching",
      description: "1:1 newborn sleep guidance",
      unit: "coaching",
      format: "one_to_one",
      coachingDurationMinutes: 45,
      ageStageTags: ["expecting", "0-3mo"],
      attributionRoleRequired: "coach",
    });
    expect(svc.unit).toBe("coaching");
    expect(svc.format).toBe("one_to_one");
    expect(svc.coachingDurationMinutes).toBe(45);
    expect(svc.ageStageTags).toEqual(["expecting", "0-3mo"]);
    expect(svc.attributionRoleRequired).toBe("coach");
    expect(svc.isActive).toBe(true);
  });

  it("creates a group coaching offering (AC2)", async () => {
    const svc = await createService(dbh.db, {
      name: "New-parent group",
      unit: "coaching",
      format: "group",
      coachingDurationMinutes: 90,
    });
    expect(svc.format).toBe("group");
    expect(svc.coachingDurationMinutes).toBe(90);
    // Tags are optional — null when omitted (AC2).
    expect(svc.ageStageTags).toBeNull();
  });

  it("round-trips age-stage tags incl. empty + clears them via update (AC2)", async () => {
    const empty = await createService(dbh.db, {
      name: "Empty tags",
      unit: "coaching",
      format: "group",
      ageStageTags: [],
    });
    // An explicit empty set persists as an empty array (distinct from null).
    expect(empty.ageStageTags).toEqual([]);

    const withTags = await updateService(dbh.db, empty.id, {
      ageStageTags: ["3-6mo", "6-12mo"],
    });
    expect(withTags?.ageStageTags).toEqual(["3-6mo", "6-12mo"]);

    const cleared = await updateService(dbh.db, empty.id, { ageStageTags: null });
    expect(cleared?.ageStageTags).toBeNull();
  });

  it("updates the format + duration of a coaching offering (AC2)", async () => {
    const svc = await createService(dbh.db, {
      name: "Coaching",
      unit: "coaching",
      format: "one_to_one",
      coachingDurationMinutes: 30,
    });
    const updated = await updateService(dbh.db, svc.id, {
      format: "group",
      coachingDurationMinutes: 60,
    });
    expect(updated?.format).toBe("group");
    expect(updated?.coachingDurationMinutes).toBe(60);
  });

  it("DB CHECK rejects a format outside the enum (AC2)", async () => {
    await expect(
      createService(dbh.db, {
        name: "Bad format",
        unit: "coaching",
        // @ts-expect-error — intentionally invalid value to exercise the CHECK
        format: "webinar",
      }),
    ).rejects.toThrow();
  });

  it("DB CHECK rejects a non-positive coaching duration (AC2)", async () => {
    await expect(
      createService(dbh.db, {
        name: "Zero duration",
        unit: "coaching",
        format: "group",
        coachingDurationMinutes: 0,
      }),
    ).rejects.toThrow();
  });

  it("a coach is a staff record (no login) reused via attribution role (AC3)", async () => {
    // The coach exists only as a `staff` DATA record — no users/auth association.
    const coach = await createStaff(dbh.db, { displayName: "Asha", role: "coach" });
    expect(coach.role).toBe("coach");
    expect("userId" in coach).toBe(false);

    const svc = await createService(dbh.db, {
      name: "Lactation coaching",
      unit: "coaching",
      format: "one_to_one",
      attributionRoleRequired: "coach",
    });
    // The gate forces a matching active coach pick at booking time (P1-E07-S02).
    expect(
      checkBookingAttribution(svc.attributionRoleRequired, {
        role: coach.role,
        isActive: coach.active,
      }).ok,
    ).toBe(true);
  });

  it("lists coaching offerings under the coaching unit (AC1/AC4)", async () => {
    await createService(dbh.db, { name: "Soft Play", unit: "play" });
    await createService(dbh.db, { name: "Sleep coaching", unit: "coaching", format: "one_to_one" });
    await createService(dbh.db, { name: "Group coaching", unit: "coaching", format: "group" });

    const coaching = await listServicesByUnit(dbh.db, "coaching");
    expect(coaching.map((s) => s.name).sort()).toEqual(["Group coaching", "Sleep coaching"]);
    for (const s of coaching) expect(s.unit).toBe("coaching");

    const play = await listServicesByUnit(dbh.db, "play");
    expect(play).toHaveLength(1);
    expect(play[0]!.name).toBe("Soft Play");
  });
});
