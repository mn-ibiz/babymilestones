import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  attendances,
  auditOutbox,
  bookings,
  children,
  commissionLedger,
  invoices,
  parents,
  staff as staffTbl,
  users,
  wallets,
  walletLedger,
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
  setCommissionRate,
  setServicePrice,
} from "@bm/catalog";
import { buildApp } from "../../app.js";

const FIXED = Date.parse("2026-06-18T07:00:00.000Z");
const TODAY = "2026-06-18";

/**
 * P2-E03-S02 — Attendant check-in screen. Today's session slots (AC1), the
 * per-slot child cards (AC2), single check-in with the wallet debit + recorded
 * checked_in_at (AC3), and bulk check-in (AC4). Operated via Reception's screen
 * (same auth) — reads gated to `read wallet`, check-ins to `create payment`.
 */
describe("attendant check-in (P2-E03-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
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
  /** Seed a parent (funded wallet) + child + a wallet-paid booking in the slot. */
  async function seedBooking(opts: { credit?: number; autoCredit?: boolean } = {}) {
    seq += 1;
    const phone = `+25473${String(6000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db
      .insert(wallets)
      .values({ userId: u!.id, autoCreditEnabled: opts.autoCredit ?? false })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "P", lastName: "Q" })
      .returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Kid", dateOfBirth: "2022-01-01", photoConsent: true })
      .returning();
    if (opts.credit && opts.credit > 0) {
      await post(dbh.db, {
        walletId: w!.id,
        amount: opts.credit,
        kind: "topup",
        idempotencyKey: `seed:${w!.id}`,
        source: "seed",
        postedBy: u!.id,
      });
    }
    const booked = await bookSlot(dbh.db, {
      slotId,
      parentId: p!.id,
      childId: c!.id,
      actor: u!.id,
    });
    return { userId: u!.id, parentId: p!.id, walletId: w!.id, childId: c!.id, bookingId: booked.bookingId, invoiceId: booked.invoiceId };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions, now: () => FIXED });
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
    const slots = await listSlotsWithRemaining(dbh.db, { serviceId });
    slotId = slots.find((s) => s.slotDate === TODAY)!.id;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const staffHeaders = (creds: { session: string; csrfCookie: string; csrfToken: string }) => ({
    cookie: `${creds.session}; ${creds.csrfCookie}`,
    "x-csrf-token": creds.csrfToken,
  });

  it("requires authentication and the right role", async () => {
    const anon = await app.inject({ method: "GET", url: "/reception/attendance/slots" });
    expect(anon.statusCode).toBe(401);

    const packer = await loginStaff("+254712000099", "7499");
    const forbidden = await app.inject({
      method: "GET",
      url: "/reception/attendance/slots",
      headers: { cookie: packer.session },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("lists today's slots with booked + checked-in counts (AC1)", async () => {
    await seedBooking({ credit: 5000 });
    const staff = await loginStaff("+254712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: "/reception/attendance/slots",
      headers: { cookie: staff.session },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.date).toBe(TODAY);
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0]).toMatchObject({ slotId, serviceName: "Soft Play", bookedCount: 1, checkedInCount: 0 });
  });

  it("lists the per-slot child cards with photo consent + drop-off (AC2)", async () => {
    const b = await seedBooking({ credit: 5000 });
    const staff = await loginStaff("+254712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: `/reception/attendance/slots/${slotId}/bookings`,
      headers: { cookie: staff.session },
    });
    expect(res.statusCode).toBe(200);
    const cards = res.json().bookings;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      bookingId: b.bookingId,
      childName: "Kid",
      photoConsent: true,
      paidVia: "wallet",
      checkedInAt: null,
      droppedOffAt: null,
    });
  });

  it("checks a child in: debits the wallet, settles the invoice, records attendance + audit (AC3)", async () => {
    const b = await seedBooking({ credit: 5000 });
    const staff = await loginStaff("+254712000001", "7421");
    const res = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId, droppedOffAt: "2026-06-18T09:05:00.000Z" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ bookingId: b.bookingId, outcome: "settled", debitedCents: 1500, warning: false });

    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, b.bookingId));
    expect(att).toBeDefined();
    expect(att!.checkedInAt).not.toBeNull();
    expect(att!.droppedOffAt).not.toBeNull();

    const [inv] = await dbh.db.select().from(invoices).where(eq(invoices.id, b.invoiceId));
    expect(inv!.status).toBe("settled");

    const events = await dbh.db.select().from(auditOutbox);
    const checkin = events.find((e) => e.action === "attendance.checked_in");
    expect(checkin).toBeDefined();
    expect(checkin!.targetTable).toBe("attendances");
  });

  it("records the staff commission accrual when an attributed booking is checked in (P3-E01-S02)", async () => {
    const b = await seedBooking({ credit: 5000 });
    // Attribute the booking to a staff member with a commission rate in force at
    // booking time, so the check-in settle should accrue their commission line.
    const [s] = await dbh.db
      .insert(staffTbl)
      .values({ displayName: "Asha", role: "stylist" })
      .returning();
    await setCommissionRate(dbh.db, {
      staffId: s!.id,
      ratePercent: "10.00",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    });
    await dbh.db
      .update(bookings)
      .set({ staffId: s!.id, staffNameSnapshot: "Asha", staffRateSnapshot: 1500 })
      .where(eq(bookings.id, b.bookingId));

    const staff = await loginStaff("+254712000001", "7421");
    const res = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId },
    });
    expect(res.statusCode).toBe(201);

    const accruals = await dbh.db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.bookingId, b.bookingId));
    expect(accruals).toHaveLength(1);
    expect(accruals[0]!.amountCents).toBe(150); // 10% of 1500 cents
    expect(accruals[0]!.staffId).toBe(s!.id);
    expect(accruals[0]!.source).toBe("booking");
  });

  it("does not accrue commission for an unattributed booking on check-in (self-skip)", async () => {
    const b = await seedBooking({ credit: 5000 }); // no staffId attributed
    const staff = await loginStaff("+254712000001", "7421");
    await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId },
    });
    const accruals = await dbh.db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.bookingId, b.bookingId));
    expect(accruals).toHaveLength(0);
  });

  it("rejects a second check-in for the same booking (409)", async () => {
    const b = await seedBooking({ credit: 5000 });
    const staff = await loginStaff("+254712000001", "7421");
    const first = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId },
    });
    expect(second.statusCode).toBe(409);
    // only one attendance + one debit ledger posting
    const rows = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, b.bookingId));
    expect(rows).toHaveLength(1);
  });

  it("checks in on credit (underfunded + auto-credit on) and flags outstanding when off (AC3)", async () => {
    const onCredit = await seedBooking({ credit: 0, autoCredit: true });
    const off = await seedBooking({ credit: 0, autoCredit: false });
    const staff = await loginStaff("+254712000001", "7421");

    const r1 = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: onCredit.bookingId },
    });
    expect(r1.json().outcome).toBe("settled_on_credit");

    const r2 = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: off.bookingId },
    });
    expect(r2.json()).toMatchObject({ outcome: "outstanding", warning: true, debitedCents: 0 });
  });

  it("bulk-checks-in many bookings, reporting per-booking outcomes (AC4)", async () => {
    const a = await seedBooking({ credit: 5000 });
    const b = await seedBooking({ credit: 5000 });
    const staff = await loginStaff("+254712000001", "7421");
    // pre-check-in `a` so the bulk call hits an already-checked-in case
    await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: a.bookingId },
    });

    const res = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin/bulk",
      headers: staffHeaders(staff),
      payload: { bookingIds: [a.bookingId, b.bookingId] },
    });
    expect(res.statusCode).toBe(200);
    const results = res.json().results as Array<{ bookingId: string; ok: boolean; outcome: string | null }>;
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.bookingId === a.bookingId)!.ok).toBe(false); // already checked in
    expect(results.find((r) => r.bookingId === b.bookingId)).toMatchObject({ ok: true, outcome: "settled" });
    // both bookings now have exactly one attendance
    expect(await dbh.db.select().from(attendances)).toHaveLength(2);
  });

  it("checks in without re-charging when the invoice was already settled out-of-band (no 500)", async () => {
    // Simulate a top-up FIFO-settling the booking's invoice before check-in.
    const b = await seedBooking({ credit: 5000 });
    await dbh.db.update(invoices).set({ status: "settled" }).where(eq(invoices.id, b.invoiceId));
    const before = await dbh.db.select().from(walletLedger).where(eq(walletLedger.walletId, b.walletId));
    const staff = await loginStaff("+254712000001", "7421");

    const res = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ outcome: "settled", debitedCents: 0 });
    // attendance recorded, and NO new ledger debit posted (no double charge).
    expect(await dbh.db.select().from(attendances).where(eq(attendances.bookingId, b.bookingId))).toHaveLength(1);
    const after = await dbh.db.select().from(walletLedger).where(eq(walletLedger.walletId, b.walletId));
    expect(after).toHaveLength(before.length);
  });

  it("404s an unknown booking and 409s a cancelled booking", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const unknown = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(unknown.statusCode).toBe(404);

    const b = await seedBooking({ credit: 5000 });
    await dbh.db.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, b.bookingId));
    const cancelled = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId },
    });
    expect(cancelled.statusCode).toBe(409);
  });

  it("covers a subscription-paid booking without a wallet debit (AC3)", async () => {
    const b = await seedBooking({ credit: 0 });
    await dbh.db.update(bookings).set({ paidVia: "subscription" }).where(eq(bookings.id, b.bookingId));
    const before = await dbh.db.select().from(walletLedger).where(eq(walletLedger.walletId, b.walletId));
    const staff = await loginStaff("+254712000001", "7421");

    const res = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ outcome: "covered", debitedCents: 0, warning: false });
    // attendance recorded, and NO wallet debit posted for an entitlement-covered visit.
    expect(await dbh.db.select().from(attendances).where(eq(attendances.bookingId, b.bookingId))).toHaveLength(1);
    const after = await dbh.db.select().from(walletLedger).where(eq(walletLedger.walletId, b.walletId));
    expect(after).toHaveLength(before.length);
  });

  it("enforces CSRF and input validation on the mutating routes", async () => {
    const b = await seedBooking({ credit: 5000 });
    const staff = await loginStaff("+254712000001", "7421");

    // session cookie but no x-csrf-token → 403 (these routes move money)
    const noCsrf = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: { cookie: staff.session },
      payload: { bookingId: b.bookingId },
    });
    expect(noCsrf.statusCode).toBe(403);

    // malformed droppedOffAt → 400
    const badInput = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: b.bookingId, droppedOffAt: "not-a-date" },
    });
    expect(badInput.statusCode).toBe(400);

    // empty bulk array → 400
    const emptyBulk = await app.inject({
      method: "POST",
      url: "/reception/attendance/checkin/bulk",
      headers: staffHeaders(staff),
      payload: { bookingIds: [] },
    });
    expect(emptyBulk.statusCode).toBe(400);
  });

  it("returns 400 (not 500) for a malformed slotId on the bookings list", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: "/reception/attendance/slots/not-a-uuid/bookings",
      headers: { cookie: staff.session },
    });
    expect(res.statusCode).toBe(400);
  });
});
