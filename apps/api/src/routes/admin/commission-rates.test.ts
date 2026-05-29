import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { buildApp } from "../../app.js";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { InMemorySessionStore } from "@bm/auth";
import { auditOutbox, staff, users } from "@bm/db";

/**
 * P3-E01-S01 — admin commission-rate CRUD route. Real app + PGlite; a staff
 * session is minted and the cookie replayed so the permission guard runs.
 */
let dbh: TestDb;
let sessions: InMemorySessionStore;

async function mintStaff(role: string) {
  const [u] = await dbh.db.insert(users).values({ phone: "+254712345610", pinHash: "x", role }).returning();
  return sessions.create({ userId: u!.id, role: u!.role });
}

async function seedStaffRecord() {
  const [s] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
  return s!.id;
}

const cookie = (t: string) => ({ cookie: `bm_session=${t}` });

describe("admin commission-rate routes (P3-E01-S01)", () => {
  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("sets a rate, returns it open, and audits the change (AC2/AC4)", async () => {
    const token = await mintStaff("admin");
    const id = await seedStaffRecord();
    const app = buildApp({ db: dbh.db, sessions });
    const res = await app.inject({
      method: "POST",
      url: `/admin/staff/${id}/commission-rates`,
      headers: cookie(token),
      payload: { ratePercent: "12.50", effectiveFrom: "2026-01-01T00:00:00Z", reason: "initial" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { rate: { ratePercent: string; effectiveTo: string | null } };
    expect(body.rate.ratePercent).toBe("12.50");
    expect(body.rate.effectiveTo).toBeNull();
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.rate.set"));
    expect(audits).toHaveLength(1);
  });

  it("a second rate auto-closes the first; history reflects both (AC2)", async () => {
    const token = await mintStaff("admin");
    const id = await seedStaffRecord();
    const app = buildApp({ db: dbh.db, sessions });
    await app.inject({
      method: "POST",
      url: `/admin/staff/${id}/commission-rates`,
      headers: cookie(token),
      payload: { ratePercent: "10.00", effectiveFrom: "2026-01-01T00:00:00Z" },
    });
    await app.inject({
      method: "POST",
      url: `/admin/staff/${id}/commission-rates`,
      headers: cookie(token),
      payload: { ratePercent: "12.50", effectiveFrom: "2026-03-01T00:00:00Z" },
    });
    const listRes = await app.inject({ method: "GET", url: `/admin/staff/${id}/commission-rates`, headers: cookie(token) });
    expect(listRes.statusCode).toBe(200);
    const { rates } = listRes.json() as { rates: Array<{ ratePercent: string; effectiveTo: string | null }> };
    expect(rates).toHaveLength(2);
    expect(rates[0]!.ratePercent).toBe("12.50");
    expect(rates[0]!.effectiveTo).toBeNull();
    expect(rates[1]!.effectiveTo).not.toBeNull();
  });

  it("rejects an out-of-range rate (400)", async () => {
    const token = await mintStaff("admin");
    const id = await seedStaffRecord();
    const app = buildApp({ db: dbh.db, sessions });
    const res = await app.inject({
      method: "POST",
      url: `/admin/staff/${id}/commission-rates`,
      headers: cookie(token),
      payload: { ratePercent: "150", effectiveFrom: "2026-01-01T00:00:00Z" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("403s a role lacking manage-service (reception)", async () => {
    const token = await mintStaff("reception");
    const id = await seedStaffRecord();
    const app = buildApp({ db: dbh.db, sessions });
    const res = await app.inject({
      method: "POST",
      url: `/admin/staff/${id}/commission-rates`,
      headers: cookie(token),
      payload: { ratePercent: "10.00", effectiveFrom: "2026-01-01T00:00:00Z" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("404s an unknown staff id", async () => {
    const token = await mintStaff("admin");
    const app = buildApp({ db: dbh.db, sessions });
    const res = await app.inject({
      method: "POST",
      url: `/admin/staff/00000000-0000-0000-0000-0000000000ff/commission-rates`,
      headers: cookie(token),
      payload: { ratePercent: "10.00", effectiveFrom: "2026-01-01T00:00:00Z" },
    });
    expect(res.statusCode).toBe(404);
  });
});
