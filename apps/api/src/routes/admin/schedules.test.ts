import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, bookings, children, invoices, parents, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P2-E01-S01 — service schedule admin API. Integration via app.inject with real
 * staff sessions (+ CSRF). Covers `manage service` enforcement, validation (AC1),
 * slot materialisation (AC2), remaining-capacity read (AC3), the
 * snapshot-preserving update (AC4), and audit on every mutation (AC5).
 */
describe("Service schedule admin API (P2-E01-S01)", () => {
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
    method: "GET" | "POST" | "PATCH",
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

  /** Create a service via the admin API and return its id. */
  const createService = async (creds: Creds) => {
    const res = await req("POST", "/admin/services", creds, { name: "Soft Play", unit: "play" });
    return res.json().id as string;
  };

  const validSchedule = {
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "10:00",
    slotDurationMinutes: 60,
    capacity: 6,
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

  it("admin creates a schedule, materialises slots, audited (AC1/AC2/AC5)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);

    const res = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.serviceId).toBe(serviceId);
    expect(body.capacity).toBe(6);
    expect(body.isActive).toBe(true);

    // Audited (AC5).
    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.schedule.create"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.targetId).toBe(body.id);

    // Slots materialised over the rolling 60-day horizon (AC2): a weekday recurs
    // at least 8 times in 60 days, one window/day here.
    const slotsRes = await req("GET", `/admin/services/${serviceId}/slots`, creds);
    const slots = slotsRes.json().slots as Array<{ capacity: number; remainingCapacity: number }>;
    expect(slots.length).toBeGreaterThanOrEqual(8);
    expect(slots.every((s) => s.capacity === 6)).toBe(true);
    // Remaining == capacity with no bookings (AC3).
    expect(slots.every((s) => s.remainingCapacity === 6)).toBe(true);
  });

  it("reception (no manage service) is forbidden", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const serviceId = await req("POST", "/admin/services", await loginStaff("+254712000001", "7421"), {
      name: "Soft Play",
      unit: "play",
    }).then((r) => r.json().id as string);
    const res = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const res = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule, {
      auth: false,
    });
    expect(res.statusCode).toBe(401);
  });

  it("404s when creating a schedule for an unknown service", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req(
      "POST",
      "/admin/services/00000000-0000-0000-0000-000000000000/schedules",
      creds,
      validSchedule,
    );
    expect(res.statusCode).toBe(404);
  });

  it("rejects endTime before startTime (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const res = await req("POST", `/admin/services/${serviceId}/schedules`, creds, {
      ...validSchedule,
      startTime: "10:00",
      endTime: "09:00",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("endTime");
  });

  it("rejects a slot longer than its window (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const res = await req("POST", `/admin/services/${serviceId}/schedules`, creds, {
      ...validSchedule,
      slotDurationMinutes: 120, // window is only 60 min
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("slotDurationMinutes");
  });

  it("updates a schedule, audited; booked slots keep snapshot, unbooked future slots update (AC4/AC5)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const created = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    const scheduleId = created.json().id as string;

    // Book the first materialised slot (capacity snapshot 6 onto it).
    const beforeRes = await req("GET", `/admin/services/${serviceId}/slots`, creds);
    const before = beforeRes.json().slots as Array<{ id: string }>;
    const bookedSlotId = before[0]!.id;
    const [u] = await dbh.db.insert(users).values({ phone: "+254712009999", pinHash: "x" }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const [inv] = await dbh.db
      .insert(invoices)
      .values({ parentId: p!.id, amountDue: 1000, serviceId, status: "pending" })
      .returning();
    await dbh.db.insert(bookings).values({
      parentId: p!.id,
      childId: c!.id,
      serviceId,
      staffNameSnapshot: "n/a",
      staffRateSnapshot: 1000,
      invoiceId: inv!.id,
      slotId: bookedSlotId,
    });

    const res = await req("PATCH", `/admin/schedules/${scheduleId}`, creds, { capacity: 20 });
    expect(res.statusCode).toBe(200);
    expect(res.json().capacity).toBe(20);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.schedule.update"));
    expect(audits).toHaveLength(1);

    // AC4 — the BOOKED slot keeps its capacity snapshot (6); every other
    // (unbooked, future) slot is re-materialised at the new capacity (20).
    const afterRes = await req("GET", `/admin/services/${serviceId}/slots`, creds);
    const after = afterRes.json().slots as Array<{ id: string; capacity: number }>;
    const bookedSlot = after.find((s) => s.id === bookedSlotId)!;
    expect(bookedSlot.capacity).toBe(6);
    expect(after.filter((s) => s.id !== bookedSlotId).every((s) => s.capacity === 20)).toBe(true);
  });

  it("a time-window edit withdraws stale old-window future slots (AC4)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const created = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    const scheduleId = created.json().id as string;

    // Move the window from 09:00–10:00 to 14:00–15:00.
    const res = await req("PATCH", `/admin/schedules/${scheduleId}`, creds, {
      startTime: "14:00",
      endTime: "15:00",
    });
    expect(res.statusCode).toBe(200);

    const slotsRes = await req("GET", `/admin/services/${serviceId}/slots`, creds);
    const slots = slotsRes.json().slots as Array<{ startTime: string }>;
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.startTime === "14:00")).toBe(true); // no 09:00 ghosts
  });

  it("retiring a schedule (isActive=false) withdraws its future unbooked slots (AC4)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const created = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    const scheduleId = created.json().id as string;

    const res = await req("PATCH", `/admin/schedules/${scheduleId}`, creds, { isActive: false });
    expect(res.statusCode).toBe(200);
    const slotsRes = await req("GET", `/admin/services/${serviceId}/slots`, creds);
    expect(slotsRes.json().slots).toHaveLength(0);
  });

  it("rejects a partial update that makes a slot exceed the merged window (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const created = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    const scheduleId = created.json().id as string;
    // Window is 09:00–10:00 (60 min); a 120-min slot no longer fits.
    const res = await req("PATCH", `/admin/schedules/${scheduleId}`, creds, { slotDurationMinutes: 120 });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("slotDurationMinutes");
  });

  it("rejects a partial update that inverts the merged window (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const created = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    const scheduleId = created.json().id as string;
    // Stored start is 09:00; setting only endTime to 08:00 inverts the window.
    const res = await req("PATCH", `/admin/schedules/${scheduleId}`, creds, { endTime: "08:00" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("endTime");
  });

  it("rejects malformed slot window query params (AC3 read)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    const res = await req("GET", `/admin/services/${serviceId}/slots?from=garbage`, creds);
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("from");
  });

  it("refuses to schedule a retired (inactive) service", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    // Soft-delete the service, then attempt to schedule it.
    await req("PATCH", `/admin/services/${serviceId}`, creds, { isActive: false });
    const res = await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    expect(res.statusCode).toBe(409);
  });

  it("lists schedules and 404s slots for an unknown service", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const serviceId = await createService(creds);
    await req("POST", `/admin/services/${serviceId}/schedules`, creds, validSchedule);
    const list = await req("GET", `/admin/services/${serviceId}/schedules`, creds);
    expect(list.json().schedules).toHaveLength(1);

    const missing = await req(
      "GET",
      "/admin/services/00000000-0000-0000-0000-000000000000/slots",
      creds,
    );
    expect(missing.statusCode).toBe(404);
  });
});
