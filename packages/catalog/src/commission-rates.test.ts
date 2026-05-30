import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { staffCommissionRates } from "@bm/db";
import { createStaff } from "./staff.js";
import {
  resolveRateAt,
  setCommissionRate,
  listCommissionRates,
  getOpenCommissionRate,
} from "./commission-rates.js";

/**
 * P3-E01-S01 — per-staff commission rate with effective dating. DB-backed via
 * PGlite. Covers the half-open interval resolution (AC3), auto-closing the prior
 * open rate (AC2), and the one-open-per-staff invariant.
 */
const T = (iso: string) => new Date(iso);

describe("commission rates — effective dating (P3-E01-S01)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function staffId() {
    const s = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    return s.id;
  }

  it("the first rate is created open (effective_to null) (AC1/AC2)", async () => {
    const id = await staffId();
    const row = await setCommissionRate(dbh.db, { staffId: id, ratePercent: "10.00", effectiveFrom: T("2026-01-01T00:00:00Z") });
    expect(row.effectiveTo).toBeNull();
    expect(row.ratePercent).toBe("10.00");
  });

  it("setting a new rate auto-closes the previous open one at the new from (AC2)", async () => {
    const id = await staffId();
    const first = await setCommissionRate(dbh.db, { staffId: id, ratePercent: "10.00", effectiveFrom: T("2026-01-01T00:00:00Z") });
    const second = await setCommissionRate(dbh.db, { staffId: id, ratePercent: "12.50", effectiveFrom: T("2026-03-01T00:00:00Z"), reason: "raise" });

    const reloadedFirst = (await dbh.db.select().from(staffCommissionRates).where(eq(staffCommissionRates.id, first.id)))[0]!;
    expect(reloadedFirst.effectiveTo?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(second.effectiveTo).toBeNull();

    const open = await dbh.db
      .select()
      .from(staffCommissionRates)
      .where(and(eq(staffCommissionRates.staffId, id), isNull(staffCommissionRates.effectiveTo)));
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe(second.id);
  });

  it("resolves the rate at a time using a HALF-OPEN interval [from, to) (AC3)", async () => {
    const id = await staffId();
    await setCommissionRate(dbh.db, { staffId: id, ratePercent: "10.00", effectiveFrom: T("2026-01-01T00:00:00Z") });
    await setCommissionRate(dbh.db, { staffId: id, ratePercent: "12.50", effectiveFrom: T("2026-03-01T00:00:00Z") });

    expect(await resolveRateAt(dbh.db, id, T("2025-12-31T23:59:59Z"))).toBeNull();
    expect((await resolveRateAt(dbh.db, id, T("2026-01-01T00:00:00Z")))?.ratePercent).toBe("10.00");
    expect((await resolveRateAt(dbh.db, id, T("2026-02-15T12:00:00Z")))?.ratePercent).toBe("10.00");
    // Exactly at the boundary (= second from) → second rate (half-open: prior excludes it).
    expect((await resolveRateAt(dbh.db, id, T("2026-03-01T00:00:00Z")))?.ratePercent).toBe("12.50");
    // 1ms before the boundary → still first rate.
    expect((await resolveRateAt(dbh.db, id, T("2026-02-28T23:59:59.999Z")))?.ratePercent).toBe("10.00");
    expect((await resolveRateAt(dbh.db, id, T("2030-01-01T00:00:00Z")))?.ratePercent).toBe("12.50");
  });

  it("getOpenCommissionRate returns the currently-open rate, or null", async () => {
    const id = await staffId();
    expect(await getOpenCommissionRate(dbh.db, id)).toBeNull();
    await setCommissionRate(dbh.db, { staffId: id, ratePercent: "8.00", effectiveFrom: T("2026-01-01T00:00:00Z") });
    expect((await getOpenCommissionRate(dbh.db, id))?.ratePercent).toBe("8.00");
  });

  it("lists a staff member's rate history newest-first", async () => {
    const id = await staffId();
    await setCommissionRate(dbh.db, { staffId: id, ratePercent: "10.00", effectiveFrom: T("2026-01-01T00:00:00Z") });
    await setCommissionRate(dbh.db, { staffId: id, ratePercent: "12.50", effectiveFrom: T("2026-03-01T00:00:00Z") });
    const rows = await listCommissionRates(dbh.db, id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.ratePercent).toBe("12.50");
  });

  it("re-setting a rate at the SAME instant replaces the open one in place (no zero-width interval)", async () => {
    const id = await staffId();
    const first = await setCommissionRate(dbh.db, { staffId: id, ratePercent: "10.00", effectiveFrom: T("2026-01-01T00:00:00Z") });
    const corrected = await setCommissionRate(dbh.db, { staffId: id, ratePercent: "11.00", effectiveFrom: T("2026-01-01T00:00:00Z") });
    const rows = await listCommissionRates(dbh.db, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first.id);
    expect(rows[0]!.ratePercent).toBe("11.00");
    expect(corrected.effectiveTo).toBeNull();
  });

  it("rejects a backdated rate before the current open rate's start", async () => {
    const id = await staffId();
    await setCommissionRate(dbh.db, { staffId: id, ratePercent: "10.00", effectiveFrom: T("2026-03-01T00:00:00Z") });
    await expect(
      setCommissionRate(dbh.db, { staffId: id, ratePercent: "9.00", effectiveFrom: T("2026-01-01T00:00:00Z") }),
    ).rejects.toThrow();
  });
});
