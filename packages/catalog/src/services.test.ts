import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { servicePrices } from "@bm/db";
import {
  createService,
  getService,
  listServicePrices,
  listServices,
  resolveServicePriceAt,
  ServicePriceOrderError,
  setServicePrice,
  updateService,
} from "./services.js";

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
      attributionRoleRequired: "reception",
    });
    expect(svc.description).toBe("1:1 parenting coach");
    expect(svc.attributionRoleRequired).toBe("reception");
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
