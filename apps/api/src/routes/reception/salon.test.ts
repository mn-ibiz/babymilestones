import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  attendances,
  auditOutbox,
  bookings,
  children,
  commissionLedger,
  parents,
  users,
  wallets,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { post } from "@bm/wallet";
import {
  bookSalonSlot,
  createService,
  createStaff,
  createStaffAvailability,
  dayOfWeekIso,
  generateSalonSlotsForAvailability,
  listAvailableSalonSlots,
  setCommissionRate,
  setServicePrice,
  updateService,
} from "@bm/catalog";
import { buildApp } from "../../app.js";

/**
 * P3-E03-S03 (Story 25.3) — Salon counter check-in & service completion. The
 * counter board (AC1), check-in → wallet debit + commission (AC2), mark-complete
 * with consent-gated photo + feedback hook (AC3), and the walk-in compose path
 * (AC4). Fixed clock: 2026-06-15 10:00Z (a Monday).
 */
const FIXED = Date.parse("2026-06-15T10:00:00.000Z");
const TODAY = "2026-06-15";

describe("reception salon counter (P3-E03-S03 / Story 25.3)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  const feedbackHook = vi.fn();

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };

  const staffHeaders = (creds: { session: string; csrfCookie: string; csrfToken: string }) => ({
    cookie: `${creds.session}; ${creds.csrfCookie}`,
    "x-csrf-token": creds.csrfToken,
  });

  let seq = 0;
  /** A priced salon service with a 60-min duration. */
  async function seedSalonService(name = "Kids Cut", priceCents = 2500) {
    const svc = await createService(dbh.db, { name, unit: "salon" });
    await updateService(dbh.db, svc.id, { salonDurationMinutes: 60 });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: priceCents, effectiveFrom: "2026-01-01" });
    return svc;
  }

  /** A stylist with a Monday 09:00–12:00 window materialising slots on TODAY. */
  async function seedStylist(serviceId: string, displayName: string, ratePercent = 20) {
    const stylist = await createStaff(dbh.db, { displayName, role: "stylist" });
    await setCommissionRate(dbh.db, { staffId: stylist.id, ratePercent, effectiveFrom: new Date("2026-01-01") });
    const avail = await createStaffAvailability(dbh.db, {
      staffId: stylist.id,
      dayOfWeek: dayOfWeekIso(TODAY),
      startTime: "09:00",
      endTime: "12:00",
      effectiveFrom: TODAY,
    });
    await generateSalonSlotsForAvailability(dbh.db, avail, {
      fromDate: TODAY,
      days: 1,
      services: [{ id: serviceId, salonDurationMinutes: 60 }],
    });
    return stylist;
  }

  /** A parent (+ funded wallet) + child, with a salon booking on the stylist's slot. */
  async function seedBookedFamily(opts: { serviceId: string; staffId: string; credit?: number; photoConsent?: boolean }) {
    seq += 1;
    const phone = `+25473${String(6000000 + seq).slice(-7)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: "x" }).returning();
    const [w] = await dbh.db.insert(wallets).values({ userId: u!.id, autoCreditEnabled: false }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    const [c] = await dbh.db
      .insert(children)
      .values({ parentId: p!.id, firstName: "Zola", dateOfBirth: "2022-01-01", photoConsent: opts.photoConsent ?? false })
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
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: opts.serviceId, staffId: opts.staffId, fromDate: TODAY, toDate: TODAY });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: p!.id, childId: c!.id, staffId: opts.staffId });
    return { userId: u!.id, parentId: p!.id, walletId: w!.id, childId: c!.id, bookingId: booked.bookingId, invoiceId: booked.invoiceId };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    feedbackHook.mockReset();
    app = buildApp({ db: dbh.db, sessions, now: () => FIXED, salonFeedbackHook: feedbackHook });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000099", "7499", "packer"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  // --- AC1: board -----------------------------------------------------------

  it("AC1: groups today's salon bookings by stylist, by hour", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const bree = await seedStylist(svc.id, "Bree");
    await seedBookedFamily({ serviceId: svc.id, staffId: asha.id });
    await seedBookedFamily({ serviceId: svc.id, staffId: bree.id });

    const res = await app.inject({ method: "GET", url: "/reception/salon/board", headers: { cookie: staff.session } });
    expect(res.statusCode).toBe(200);
    const board = res.json();
    expect(board.date).toBe(TODAY);
    expect(board.stylists.map((s: { staffName: string }) => s.staffName)).toEqual(["Asha", "Bree"]);
    expect(board.stylists[0].hours[0].hour).toBe("09:00");
    expect(board.stylists[0].hours[0].bookings).toHaveLength(1);
  });

  it("AC1: rejects an unauthenticated board read", async () => {
    const res = await app.inject({ method: "GET", url: "/reception/salon/board" });
    expect(res.statusCode).toBe(401);
  });

  it("AC1: a packer (no read wallet) is forbidden", async () => {
    const packer = await loginStaff("+254712000099", "7499");
    const res = await app.inject({ method: "GET", url: "/reception/salon/board", headers: { cookie: packer.session } });
    expect(res.statusCode).toBe(403);
  });

  // --- AC2: check-in --------------------------------------------------------

  it("AC2: check-in posts the wallet debit + commission line and records attendance", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService("Kids Cut", 2500);
    const asha = await seedStylist(svc.id, "Asha", 20);
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id, credit: 10000 });

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: fam.bookingId },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().outcome).toBe("settled");
    expect(res.json().debitedCents).toBe(2500);

    // Attendance recorded.
    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, fam.bookingId));
    expect(att).toBeTruthy();
    // Commission line posted for the attributed stylist (P3-E01-S02): 20% of 2500.
    const [comm] = await dbh.db.select().from(commissionLedger).where(eq(commissionLedger.bookingId, fam.bookingId));
    expect(comm).toBeTruthy();
    expect(comm!.amountCents).toBe(500);
  });

  it("AC2: a repeat check-in is rejected (idempotent attendance fence)", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id, credit: 10000 });

    const first = await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });
    expect(first.statusCode).toBe(201);
    const again = await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });
    expect(again.statusCode).toBe(409);

    // Only ONE commission accrual despite two attempts.
    const lines = await dbh.db.select().from(commissionLedger).where(eq(commissionLedger.bookingId, fam.bookingId));
    expect(lines).toHaveLength(1);
  });

  it("AC2: 404 for an unknown booking", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/checkin",
      headers: staffHeaders(staff),
      payload: { bookingId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(404);
  });

  // --- AC3: complete --------------------------------------------------------

  it("AC3: mark complete sets completion, stores the photo under consent, fires the feedback hook", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id, credit: 10000, photoConsent: true });
    await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/complete",
      headers: staffHeaders(staff),
      payload: { bookingId: fam.bookingId, photoRef: "photo://snap-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().photoStored).toBe(true);
    expect(res.json().photoSkippedNoConsent).toBe(false);

    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, fam.bookingId));
    expect(att!.completedAt).toBeTruthy();
    expect(att!.photoRef).toBe("photo://snap-1");
    // Forward-compatible feedback hook fired (AC3 → P5-E04).
    expect(feedbackHook).toHaveBeenCalledTimes(1);
    // Audited.
    const [evt] = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "salon.service.completed"));
    expect(evt).toBeTruthy();
  });

  it("AC3: completion drops the photo when the child has no consent", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id, credit: 10000, photoConsent: false });
    await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/complete",
      headers: staffHeaders(staff),
      payload: { bookingId: fam.bookingId, photoRef: "photo://snap-2" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().photoStored).toBe(false);
    expect(res.json().photoSkippedNoConsent).toBe(true);
    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, fam.bookingId));
    expect(att!.photoRef).toBeNull();
  });

  it("AC3: completing before check-in is 409, double completion is 409", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id, credit: 10000 });

    const early = await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });
    expect(early.statusCode).toBe(409);

    await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });
    const ok = await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });
    expect(ok.statusCode).toBe(201);
    const dup = await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });
    expect(dup.statusCode).toBe(409);
  });

  // --- AC4: walk-in compose -------------------------------------------------

  it("AC4: walk-in creates a parent + child, books a slot now, and checks in", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService("Kids Cut", 2500);
    const asha = await seedStylist(svc.id, "Asha", 20);

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/walk-in",
      headers: staffHeaders(staff),
      payload: {
        firstName: "Mara",
        lastName: "Kim",
        phone: "0712345678",
        childFirstName: "Lily",
        childLastName: "Kim",
        childDateOfBirth: "2021-05-05",
        photoConsent: true,
        serviceId: svc.id,
        staffId: asha.id,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.userId).toBeTruthy();
    expect(body.parentId).toBeTruthy();
    expect(body.childId).toBeTruthy();
    expect(body.bookingId).toBeTruthy();
    expect(body.attendanceId).toBeTruthy();
    // No funds → outstanding (the visit still proceeds).
    expect(body.outcome).toBe("outstanding");

    // The new family exists and the child is checked in.
    const [u] = await dbh.db.select().from(users).where(eq(users.phone, "+254712345678"));
    expect(u).toBeTruthy();
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, body.bookingId));
    expect(bk!.salonSlotId).toBe(body.salonSlotId);
    expect(bk!.staffId).toBe(asha.id);
    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, body.bookingId));
    expect(att).toBeTruthy();
    // It now shows on today's board.
    const board = (await app.inject({ method: "GET", url: "/reception/salon/board", headers: { cookie: staff.session } })).json();
    const names = board.stylists.flatMap((s: { hours: { bookings: { childName: string }[] }[] }) =>
      s.hours.flatMap((h) => h.bookings.map((b) => b.childName)),
    );
    expect(names).toContain("Lily Kim");
  });

  it("AC4: a duplicate phone is a 409 and creates no parent", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    // Existing user on this phone.
    await dbh.db.insert(users).values({ phone: "+254712345678", pinHash: "x" });

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/walk-in",
      headers: staffHeaders(staff),
      payload: {
        firstName: "Mara",
        lastName: "Kim",
        phone: "0712345678",
        childFirstName: "Lily",
        childDateOfBirth: "2021-05-05",
        serviceId: svc.id,
        staffId: asha.id,
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("AC4: 404 when the salon service or stylist is unknown", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/walk-in",
      headers: staffHeaders(staff),
      payload: {
        firstName: "Mara",
        lastName: "Kim",
        phone: "0712345678",
        childFirstName: "Lily",
        childDateOfBirth: "2021-05-05",
        serviceId: svc.id,
        staffId: "00000000-0000-0000-0000-000000000000",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  // --- Story 25.4: reassign a salon booking between stylists ---------------

  // AC1 + AC2 + AC3: select-and-reassign moves the booking to a new stylist's
  // open slot, frees the old slot, updates attribution, and audits.
  it("25.4 AC1/AC2/AC3: reassigns a booking to a different stylist and audits", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    const bree = await seedStylist(svc.id, "Bree");
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id });

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/reassign",
      headers: staffHeaders(staff),
      payload: { bookingId: fam.bookingId, toStaffId: bree.id },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.fromStaffId).toBe(asha.id);
    expect(body.toStaffId).toBe(bree.id);

    // Attribution moved on the booking row (AC3).
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, fam.bookingId));
    expect(bk!.staffId).toBe(bree.id);
    expect(bk!.staffNameSnapshot).toBe("Bree");

    // Audit row recorded (AC3).
    const [evt] = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "salon.booking.reassigned"));
    expect(evt).toBeTruthy();

    // Board now shows the booking under Bree (AC1).
    const board = (await app.inject({ method: "GET", url: "/reception/salon/board", headers: { cookie: staff.session } })).json();
    const breeRow = board.stylists.find((s: { staffName: string }) => s.staffName === "Bree");
    expect(breeRow).toBeTruthy();
  });

  // AC2: reassign to an unavailable stylist is rejected.
  it("25.4 AC2: 409 when the new stylist has no available slot", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const asha = await seedStylist(svc.id, "Asha");
    // Bree has no availability/slots for this service today.
    const bree = await createStaff(dbh.db, { displayName: "Bree", role: "stylist" });
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id });

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/reassign",
      headers: staffHeaders(staff),
      payload: { bookingId: fam.bookingId, toStaffId: bree.id },
    });
    expect(res.statusCode).toBe(409);
    // Booking unchanged.
    const [bk] = await dbh.db.select().from(bookings).where(eq(bookings.id, fam.bookingId));
    expect(bk!.staffId).toBe(asha.id);
  });

  it("25.4 AC1: 404 for an unknown booking", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService();
    const bree = await seedStylist(svc.id, "Bree");
    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/reassign",
      headers: staffHeaders(staff),
      payload: { bookingId: "00000000-0000-0000-0000-000000000000", toStaffId: bree.id },
    });
    expect(res.statusCode).toBe(404);
  });

  it("25.4 AC1: rejects an unauthenticated reassign", async () => {
    const svc = await seedSalonService();
    const bree = await seedStylist(svc.id, "Bree");
    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/reassign",
      payload: { bookingId: "00000000-0000-0000-0000-000000000000", toStaffId: bree.id },
    });
    expect(res.statusCode).toBe(401);
  });

  // AC4: when the booking has already settled (a commission accrual exists), the
  // reassign moves commission proportionally — old reversed, new posted.
  it("25.4 AC4: a settled booking moves commission to the new stylist", async () => {
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await seedSalonService("Kids Cut", 2500);
    const asha = await seedStylist(svc.id, "Asha", 20); // 20%
    const bree = await seedStylist(svc.id, "Bree", 10); // 10%
    const fam = await seedBookedFamily({ serviceId: svc.id, staffId: asha.id, credit: 10000 });

    // Check in → settle → Asha accrues 20% of 2500 = 500.
    await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders(staff), payload: { bookingId: fam.bookingId } });
    const [ashaAccrual] = await dbh.db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.bookingId, fam.bookingId));
    expect(ashaAccrual!.amountCents).toBe(500);

    const res = await app.inject({
      method: "POST",
      url: "/reception/salon/reassign",
      headers: staffHeaders(staff),
      payload: { bookingId: fam.bookingId, toStaffId: bree.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().commissionMoved).toBe(true);

    // Net to Asha is 0; Bree nets 10% of 2500 = 250.
    const rows = await dbh.db.select().from(commissionLedger).where(eq(commissionLedger.bookingId, fam.bookingId));
    const netByStaff = new Map<string, number>();
    for (const r of rows) netByStaff.set(r.staffId, (netByStaff.get(r.staffId) ?? 0) + r.amountCents);
    expect(netByStaff.get(asha.id)).toBe(0);
    expect(netByStaff.get(bree.id)).toBe(250);
  });
});
