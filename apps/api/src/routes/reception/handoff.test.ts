import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  attendances,
  auditOutbox,
  children,
  observations,
  parents,
  receipts,
  services,
  settings,
  smsOutbox,
  users,
  wallets,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { post } from "@bm/wallet";
import {
  bookSlot,
  createSchedule,
  createService,
  dayOfWeekIso,
  generateSlotsForSchedule,
  listSlotsWithRemaining,
  setServicePrice,
} from "@bm/catalog";
import { buildApp } from "../../app.js";

const FIXED = Date.parse("2026-06-18T07:00:00.000Z");
const TODAY = "2026-06-18";

/**
 * P2-E03-S03 — pickup hand-off + free-text observations. Options (AC1), the
 * check-out + observation + SMS-stub summary (AC2), and the auto-generated visit
 * receipt (AC4). Voice-to-text (AC3) is a client affordance over the same note
 * field. Operated via Reception's screen — reads `read wallet`, hand-off `create payment`.
 */
describe("pickup hand-off (P2-E03-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let serviceId: string;
  let slotId: string;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };

  let seq = 0;
  async function seedBooking(credit = 5000) {
    seq += 1;
    const phone = `+25473${String(7000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "P", lastName: "Q" }).returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Zola", dateOfBirth: "2022-01-01" })
      .returning();
    if (credit > 0) {
      await post(dbh.db, { walletId: w!.id, amount: credit, kind: "topup", idempotencyKey: `seed:${w!.id}`, source: "seed", postedBy: u!.id });
    }
    const booked = await bookSlot(dbh.db, { slotId, parentId: p!.id, childId: c!.id, actor: u!.id });
    return { userId: u!.id, parentId: p!.id, childId: c!.id, bookingId: booked.bookingId };
  }

  const staffHeaders = (creds: { session: string; csrfCookie: string; csrfToken: string }) => ({
    cookie: `${creds.session}; ${creds.csrfCookie}`,
    "x-csrf-token": creds.csrfToken,
  });

  /** Check a booking in (precondition for hand-off). */
  async function checkIn(creds: { session: string; csrfCookie: string; csrfToken: string }, bookingId: string) {
    return app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(creds),
      payload: { bookingId },
    });
  }

  const handoff = (
    creds: { session: string; csrfCookie: string; csrfToken: string },
    body: Record<string, unknown>,
  ) =>
    app.inject({ method: "POST", url: "/reception/attendance/handoff", headers: staffHeaders(creds), payload: body });

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore(), now: () => FIXED });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000099", "7499", "packer"));

    const svc = await createService(dbh.db, { name: "Soft Play", unit: "play", ageMaxMonths: null });
    serviceId = svc.id;
    await setServicePrice(dbh.db, { serviceId, amountCents: 1500, effectiveFrom: "2026-01-01" });
    const sched = await createSchedule(dbh.db, {
      serviceId,
      dayOfWeek: dayOfWeekIso(TODAY),
      startTime: "09:00",
      endTime: "10:00",
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: TODAY, days: 2 });
    slotId = (await listSlotsWithRemaining(dbh.db, { serviceId })).find((s) => s.slotDate === TODAY)!.id;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("returns the mood + activity options (AC1), incl. a settings override", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const def = await app.inject({
      method: "GET",
      url: "/reception/attendance/observation-options",
      headers: { cookie: staff.session },
    });
    expect(def.statusCode).toBe(200);
    expect(def.json().moods).toContain("😊");
    expect(def.json().defaultMood).toBe("😊");
    expect(def.json().activities.length).toBeGreaterThan(0);

    await dbh.db.insert(settings).values({ key: "observation_activities", value: { activities: ["Splash pad"] } });
    const overridden = await app.inject({
      method: "GET",
      url: "/reception/attendance/observation-options",
      headers: { cookie: staff.session },
    });
    expect(overridden.json().activities).toEqual(["Splash pad"]);
  });

  it("requires the child to be checked in first (409)", async () => {
    const b = await seedBooking();
    const staff = await loginStaff("+254712000001", "7421");
    const res = await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: [] });
    expect(res.statusCode).toBe(409);
  });

  it("records check-out + observation, generates a receipt, SMSes the parent, audits (AC2, AC4)", async () => {
    const b = await seedBooking();
    const staff = await loginStaff("+254712000001", "7421");
    await checkIn(staff, b.bookingId);

    const res = await handoff(staff, {
      bookingId: b.bookingId,
      mood: "😄",
      activities: ["Story time", "Snack"],
      note: "Loved the new sandpit",
      attendantName: "Aunty Jane",
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.observationId).toBeDefined();
    expect(body.receiptId).toBeDefined();
    expect(body.checkedOutAt).toBe("2026-06-18T07:00:00.000Z");

    // attendance checked out
    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, b.bookingId));
    expect(att!.checkedOutAt).not.toBeNull();

    // observation row with all AC1 fields + attendant snapshot
    const [obs] = await dbh.db.select().from(observations).where(eq(observations.bookingId, b.bookingId));
    expect(obs).toMatchObject({
      mood: "😄",
      activities: ["Story time", "Snack"],
      note: "Loved the new sandpit",
      attendantNameSnapshot: "Aunty Jane",
      childId: b.childId,
      parentId: b.parentId,
    });
    expect(obs!.anonymisedAt).toBeNull();

    // AC4: a receipt for the visit
    const receiptRows = await dbh.db.select().from(receipts);
    expect(receiptRows).toHaveLength(1);
    expect(receiptRows[0]!.total).toBe(1500);

    // AC2: SMS-stub summary
    const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "pickup.handoff"));
    expect(sms).toHaveLength(1);
    expect(sms[0]!.body).toContain("Zola");

    // audit
    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "attendance.checked_out")).toBe(true);
  });

  it("falls back to a generic attendant label (not the staff phone) when no name is given", async () => {
    const b = await seedBooking();
    const staff = await loginStaff("+254712000001", "7421");
    await checkIn(staff, b.bookingId);
    await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: [] });
    const [obs] = await dbh.db.select().from(observations).where(eq(observations.bookingId, b.bookingId));
    expect(obs!.attendantNameSnapshot).toBe("Attendant");
  });

  it("rejects a second hand-off for the same booking (409)", async () => {
    const b = await seedBooking();
    const staff = await loginStaff("+254712000001", "7421");
    await checkIn(staff, b.bookingId);
    expect((await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: [] })).statusCode).toBe(201);
    expect((await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: [] })).statusCode).toBe(409);
    // still exactly one observation + one receipt
    expect(await dbh.db.select().from(observations).where(eq(observations.bookingId, b.bookingId))).toHaveLength(1);
    expect(await dbh.db.select().from(receipts)).toHaveLength(1);
  });

  it("validates the mood, note length and activities cap (AC1)", async () => {
    const b = await seedBooking();
    const staff = await loginStaff("+254712000001", "7421");
    await checkIn(staff, b.bookingId);
    expect((await handoff(staff, { bookingId: b.bookingId, mood: "🚀", activities: [] })).statusCode).toBe(400);
    expect(
      (await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: [], note: "a".repeat(281) })).statusCode,
    ).toBe(400);
    const tooMany = Array.from({ length: 21 }, (_, i) => `Activity ${i}`);
    expect(
      (await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: tooMany })).statusCode,
    ).toBe(400);
  });

  it("returns 409 (not 500) if an observation already exists for the booking (race fence)", async () => {
    const b = await seedBooking();
    const staff = await loginStaff("+254712000001", "7421");
    await checkIn(staff, b.bookingId);
    // Simulate a concurrent winner: an observation already committed for the
    // booking, while this request's pre-check (on attendance.checkedOutAt) passes.
    await dbh.db.insert(observations).values({
      bookingId: b.bookingId,
      childId: b.childId,
      parentId: b.parentId,
      mood: "😊",
      activities: [],
      attendantNameSnapshot: "Attendant",
    });
    const res = await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: [] });
    expect(res.statusCode).toBe(409);
  });

  it("computes line tax from the service's VAT treatment on the receipt (AC4)", async () => {
    await dbh.db.update(services).set({ taxTreatment: "vat_inclusive" }).where(eq(services.id, serviceId));
    const b = await seedBooking();
    const staff = await loginStaff("+254712000001", "7421");
    await checkIn(staff, b.bookingId);
    await handoff(staff, { bookingId: b.bookingId, mood: "😊", activities: [] });
    const [receipt] = await dbh.db.select().from(receipts);
    // 1500 inclusive of 16% VAT → embedded tax = round(1500 * 1600 / 11600) = 207.
    expect(receipt!.total).toBe(1500);
    expect(receipt!.taxTotal).toBe(207);
  });

  it("enforces auth + role + CSRF", async () => {
    const b = await seedBooking();
    const anon = await app.inject({
      method: "POST",
      url: "/reception/attendance/handoff",
      payload: { bookingId: b.bookingId, mood: "😊", activities: [] },
    });
    expect(anon.statusCode).toBe(401);

    const packer = await loginStaff("+254712000099", "7499");
    const forbidden = await handoff(packer, { bookingId: b.bookingId, mood: "😊", activities: [] });
    expect(forbidden.statusCode).toBe(403);

    const staff = await loginStaff("+254712000001", "7421");
    const noCsrf = await app.inject({
      method: "POST",
      url: "/reception/attendance/handoff",
      headers: { cookie: staff.session },
      payload: { bookingId: b.bookingId, mood: "😊", activities: [] },
    });
    expect(noCsrf.statusCode).toBe(403);
  });
});
