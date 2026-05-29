import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { children, parents, users } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import {
  createSchedule,
  createService,
  dayOfWeekIso,
  generateSlotsForSchedule,
  updateService,
} from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P2-E01-S02 — parent slot-availability browse. Integration via app.inject with
 * a fixed clock (2026-06-15 05:00Z) so the 7-day window and the past/earlier-
 * today check are deterministic. Covers the 7-day grid + remaining capacity
 * (AC1), age filtering (AC2), and past/disabled flags (AC3).
 */
const FIXED = Date.parse("2026-06-15T05:00:00.000Z"); // today=2026-06-15, now=05:00 (300 min)
const TODAY = "2026-06-15";
const FUTURE = "2026-06-18"; // 3 days out, inside the 7-day window

describe("parent availability browse (P2-E01-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  async function makeParent(phone: string, rawPhone: string) {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: await hashPin("1357") }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
      .returning();
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: rawPhone, pin: "1357" } });
    const cookies = login.headers["set-cookie"] as string[];
    const sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    return { userId: u!.id, parentId: p!.id, sessionCookie };
  }

  async function addChild(parentId: string, dateOfBirth: string) {
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId, firstName: "Zola", dateOfBirth })
      .returning();
    return c!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore(), now: () => FIXED });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const get = (url: string, sessionCookie: string) =>
    app.inject({ method: "GET", url, headers: { cookie: sessionCookie } });

  it("returns a future slot with remaining capacity, eligible child (AC1/AC2/AC3)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId, "2024-01-01"); // ~29 months old at FIXED
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play", ageMinMonths: 0, ageMaxMonths: 120 });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FUTURE),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: TODAY, days: 7 });

    const res = await get(`/parents/me/services/${svc.id}/availability?childId=${childId}`, parent.sessionCookie);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.windowStart).toBe(TODAY); // anchors the client grid (no UTC drift)
    expect(body.eligible).toBe(true);
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0].slotDate).toBe(FUTURE);
    expect(body.slots[0].remainingCapacity).toBe(5);
    expect(body.slots[0].isPast).toBe(false);
    expect(body.slots[0].available).toBe(true);
  });

  it("flags a slot that already ended earlier today as past + unavailable (AC3)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId, "2024-01-01");
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(TODAY),
      startTime: "03:00",
      endTime: "04:00", // ended before now (05:00)
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: TODAY, days: 7 });

    const res = await get(`/parents/me/services/${svc.id}/availability?childId=${childId}`, parent.sessionCookie);
    const slot = res.json().slots.find((s: { slotDate: string }) => s.slotDate === TODAY);
    expect(slot.isPast).toBe(true);
    expect(slot.available).toBe(false);
  });

  it("returns eligible:false and no slots when the child's age is out of range (AC2)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId, "2024-01-01"); // ~29 months
    const svc = await createService(dbh.db, { name: "Baby Class", unit: "play", ageMinMonths: 0, ageMaxMonths: 12 });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FUTURE),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: TODAY, days: 7 });

    const res = await get(`/parents/me/services/${svc.id}/availability?childId=${childId}`, parent.sessionCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().eligible).toBe(false);
    expect(res.json().slots).toHaveLength(0);
  });

  it("400 when childId is missing", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const res = await get(`/parents/me/services/${svc.id}/availability`, parent.sessionCookie);
    expect(res.statusCode).toBe(400);
  });

  it("404 when the child belongs to another parent", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const other = await makeParent("+254712000099", "0712000099");
    const otherChild = await addChild(other.parentId, "2024-01-01");
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const res = await get(
      `/parents/me/services/${svc.id}/availability?childId=${otherChild}`,
      parent.sessionCookie,
    );
    expect(res.statusCode).toBe(404);
  });

  it("404 for an unknown service", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId, "2024-01-01");
    const res = await get(
      `/parents/me/services/00000000-0000-0000-0000-000000000000/availability?childId=${childId}`,
      parent.sessionCookie,
    );
    expect(res.statusCode).toBe(404);
  });

  it("401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/parents/me/services/00000000-0000-0000-0000-000000000000/availability?childId=x",
    });
    expect(res.statusCode).toBe(401);
  });

  it("404 for an archived (soft-deleted) child", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const childId = await addChild(parent.parentId, "2024-01-01");
    await dbh.db.update(children).set({ archivedAt: new Date() }).where(eq(children.id, childId));
    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const res = await get(
      `/parents/me/services/${svc.id}/availability?childId=${childId}`,
      parent.sessionCookie,
    );
    expect(res.statusCode).toBe(404);
  });

  it("lists active bookable services, excluding retired ones", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const active = await createService(dbh.db, { name: "Soft Play", unit: "play" });
    const retired = await createService(dbh.db, { name: "Old Class", unit: "play" });
    await updateService(dbh.db, retired.id, { isActive: false });

    const res = await get(`/parents/me/bookable-services`, parent.sessionCookie);
    expect(res.statusCode).toBe(200);
    const services = res.json().services as Array<{ id: string }>;
    expect(services.map((s) => s.id)).toEqual([active.id]);
  });
});
