import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, bookings, children, invoices, parents, smsOutbox, staff, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import {
  createSchedule,
  createService,
  dayOfWeekIso,
  generateSlotsForSchedule,
  listSlotsWithRemaining,
  setServicePrice,
} from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P2-E01-S04 — Reception books a walk-in. Integration via app.inject. Uses
 * real-time-relative slot dates (the reception route reads the wall clock) so
 * the future/past check is stable across runs. Covers the same atomic engine as
 * the self-book (AC2), staff attribution (AC3), and the staff-only guard.
 */
describe("reception walk-in booking (P2-E01-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  // A date ~8 days out (always future) and its weekday.
  const FUTURE = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
  const TODAY = new Date().toISOString().slice(0, 10);

  async function login(phone: string, raw: string, role: Parameters<typeof staffUserSeed>[2]) {
    await dbh.db.insert(users).values(await staffUserSeed(phone, "7421", role));
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone: raw, pin: "7421" } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { cookie: `${session}; ${csrfCookie}`, csrf: res.json().csrfToken as string };
  }

  async function walkIn() {
    const [u] = await dbh.db.insert(users).values({ phone: "+254712555111", pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Wanjiru", lastName: "Kamau" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Baraka", dateOfBirth: "2024-01-01" })
      .returning();
    return { parentId: p!.id, childId: c!.id };
  }

  async function seedSlot(opts: { ageMaxMonths?: number | null; attributionRoleRequired?: "instructor" | null } = {}) {
    const svc = await createService(dbh.db, {
      name: "Talent Class",
      unit: "talent",
      ageMaxMonths: opts.ageMaxMonths ?? null,
      attributionRoleRequired: opts.attributionRoleRequired ?? null,
    });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 2000, effectiveFrom: "2026-01-01" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(FUTURE),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: TODAY, days: 14 });
    const slots = await listSlotsWithRemaining(dbh.db, { serviceId: svc.id });
    return { serviceId: svc.id, slotId: slots.find((s) => s.slotDate === FUTURE)!.id };
  }

  const post = (creds: { cookie: string; csrf: string }, body: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/reception/bookings",
      headers: { cookie: creds.cookie, "x-csrf-token": creds.csrf },
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

  it("reception books a walk-in: invoice + booking + SMS + audit (AC2)", async () => {
    const creds = await login("+254712000001", "0712000001", "reception");
    const { parentId, childId } = await walkIn();
    const { slotId } = await seedSlot();

    const res = await post(creds, { parentId, childId, slotId });
    expect(res.statusCode).toBe(201);
    expect(res.json().amountCents).toBe(2000);

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, res.json().invoiceId));
    expect(inv!.status).toBe("pending");
    const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "booking.confirmed"));
    expect(sms).toHaveLength(1);
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "booking.created"));
    expect(audits).toHaveLength(1);
  });

  it("captures staff attribution when the service requires it (AC3)", async () => {
    const creds = await login("+254712000001", "0712000001", "reception");
    const { parentId, childId } = await walkIn();
    const { slotId } = await seedSlot({ attributionRoleRequired: "instructor" });
    const [s] = await dbh.db.insert(staff).values({ displayName: "Mr. Otieno", role: "instructor" }).returning();

    const res = await post(creds, { parentId, childId, slotId, staffId: s!.id });
    expect(res.statusCode).toBe(201);
    const [booking] = await dbh.db.select().from(bookings).where(eq(bookings.id, res.json().bookingId));
    expect(booking!.staffId).toBe(s!.id);
    expect(booking!.staffNameSnapshot).toBe("Mr. Otieno");
  });

  it("rejects when attribution is required but no staff is supplied (AC3)", async () => {
    const creds = await login("+254712000001", "0712000001", "reception");
    const { parentId, childId } = await walkIn();
    const { slotId } = await seedSlot({ attributionRoleRequired: "instructor" });
    const res = await post(creds, { parentId, childId, slotId });
    expect(res.statusCode).toBe(422);
  });

  it("rejects a staff member of the wrong role (AC3)", async () => {
    const creds = await login("+254712000001", "0712000001", "reception");
    const { parentId, childId } = await walkIn();
    const { slotId } = await seedSlot({ attributionRoleRequired: "instructor" });
    const [s] = await dbh.db.insert(staff).values({ displayName: "Stylist Sue", role: "stylist" }).returning();
    const res = await post(creds, { parentId, childId, slotId, staffId: s!.id });
    expect(res.statusCode).toBe(422);
  });

  it("422 when the child does not belong to the parent", async () => {
    const creds = await login("+254712000001", "0712000001", "reception");
    const a = await walkIn();
    const [u2] = await dbh.db.insert(users).values({ phone: "+254712555222", pinHash: "x" }).returning();
    const [p2] = await dbh.db.insert(parents).values({ userId: u2!.id, firstName: "X", lastName: "Y" }).returning();
    const { slotId } = await seedSlot();
    const res = await post(creds, { parentId: p2!.id, childId: a.childId, slotId });
    expect(res.statusCode).toBe(422);
  });

  it("forbids a role without 'create payment' (403)", async () => {
    const creds = await login("+254712000009", "0712000009", "accountant");
    const { parentId, childId } = await walkIn();
    const { slotId } = await seedSlot();
    const res = await post(creds, { parentId, childId, slotId });
    expect(res.statusCode).toBe(403);
  });

  it("lists bookable services + the parent's children + availability for the picker (AC1)", async () => {
    const creds = await login("+254712000001", "0712000001", "reception");
    const { parentId, childId } = await walkIn();
    const { serviceId } = await seedSlot();

    const svcRes = await app.inject({
      method: "GET",
      url: "/reception/bookable-services",
      headers: { cookie: creds.cookie },
    });
    expect(svcRes.statusCode).toBe(200);
    expect((svcRes.json().services as Array<{ id: string }>).some((s) => s.id === serviceId)).toBe(true);

    const kidsRes = await app.inject({
      method: "GET",
      url: `/reception/parents/${parentId}/children`,
      headers: { cookie: creds.cookie },
    });
    expect((kidsRes.json().children as Array<{ id: string }>).map((c) => c.id)).toEqual([childId]);

    const availRes = await app.inject({
      method: "GET",
      url: `/reception/parents/${parentId}/services/${serviceId}/availability?childId=${childId}`,
      headers: { cookie: creds.cookie },
    });
    expect(availRes.statusCode).toBe(200);
    expect(availRes.json().eligible).toBe(true);
    expect((availRes.json().slots as unknown[]).length).toBeGreaterThan(0);
  });

  it("401s the read endpoints when unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/reception/bookable-services" });
    expect(res.statusCode).toBe(401);
  });

  it("403s the read endpoints for a role without 'create payment' (no PII leak)", async () => {
    const creds = await login("+254712000009", "0712000009", "accountant");
    const res = await app.inject({
      method: "GET",
      url: "/reception/bookable-services",
      headers: { cookie: creds.cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects attributing a booking to a retired (inactive) staff member", async () => {
    const creds = await login("+254712000001", "0712000001", "reception");
    const { parentId, childId } = await walkIn();
    const { slotId } = await seedSlot({ attributionRoleRequired: "instructor" });
    const [s] = await dbh.db
      .insert(staff)
      .values({ displayName: "Retired Rita", role: "instructor", active: false })
      .returning();
    const res = await post(creds, { parentId, childId, slotId, staffId: s!.id });
    expect(res.statusCode).toBe(422);
  });
});
