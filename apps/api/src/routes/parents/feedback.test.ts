import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  attendances,
  auditOutbox,
  children,
  feedback,
  parents,
  smsOutbox,
  users,
  wallets,
} from "@bm/db";
import { createTestDb } from "@bm/db/testing";
import { InMemorySessionStore, hashPin, staffUserSeed } from "@bm/auth";
import { post } from "@bm/wallet";
import {
  bookSalonSlot,
  createFeedbackInvitation,
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
import type { FastifyInstance } from "fastify";

/**
 * P6-E04-S01 (Story 34.1) — Feedback Engine FOUNDATION. The parent in-app prompt
 * data + one-tap submit (GET /parents/me/feedback, POST .../submit), and the REAL
 * salon-completion wiring (the default hook creates an idempotent invitation row +
 * queues a `feedback.invite` SMS-stub). Fixed clock: 2026-06-15 10:00Z (Monday).
 */
const FIXED = Date.parse("2026-06-15T10:00:00.000Z");
const TODAY = "2026-06-15";

describe("parent feedback (P6-E04-S01 / Story 34.1)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;

  const loginParent = async (phone: string, raw: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: raw, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const cookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrf = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { cookie, csrfCookie: csrf, csrfToken: res.json().csrfToken as string };
  };
  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { phone, pin } });
    const cookies = res.headers["set-cookie"] as string[];
    const cookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrf = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { cookie, csrfCookie: csrf, csrfToken: res.json().csrfToken as string };
  };

  let seq = 0;
  async function seedParent(pin = "1357") {
    seq += 1;
    const raw = `07120000${String(10 + seq).slice(-2)}`;
    const phone = `+254${raw.slice(1)}`;
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: await hashPin(pin) }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Pat", lastName: "Doe" }).returning();
    return { userId: u!.id, parentId: p!.id, phone, raw, pin };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    // No salonFeedbackHook injected → the app uses the REAL default hook.
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore(), now: () => FIXED });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  // --- AC2: in-app prompt — pending list ------------------------------------

  it("GET pending lists ONLY the authed parent's open invitations", async () => {
    const me = await seedParent("1357");
    const other = await seedParent("2468");
    await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "s1", parentId: me.userId });
    await createFeedbackInvitation(dbh.db, { sourceType: "order", sourceId: "o1", parentId: me.userId });
    await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "s2", parentId: other.userId });

    const creds = await loginParent(me.phone, me.raw, me.pin);
    const res = await app.inject({
      method: "GET",
      url: "/parents/me/feedback",
      headers: { cookie: creds.cookie },
    });
    expect(res.statusCode).toBe(200);
    const { pending } = res.json() as { pending: { sourceType: string; token: string }[] };
    expect(pending).toHaveLength(2);
    expect(pending.every((p) => p.token)).toBe(true);
    expect(pending.map((p) => p.sourceType).sort()).toEqual(["order", "salon"]);
  });

  it("rejects an unauthenticated pending read", async () => {
    const res = await app.inject({ method: "GET", url: "/parents/me/feedback" });
    expect(res.statusCode).toBe(401);
  });

  // --- AC2/AC3: submit ------------------------------------------------------

  it("POST submit records a 0–5 rating + comment and drops it from pending (AC2/AC3)", async () => {
    const me = await seedParent("1357");
    const inv = await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "sub-1", parentId: me.userId });
    const creds = await loginParent(me.phone, me.raw, me.pin);

    const res = await app.inject({
      method: "POST",
      url: "/parents/me/feedback/submit",
      headers: { cookie: `${creds.cookie}; ${creds.csrfCookie}`, "x-csrf-token": creds.csrfToken },
      payload: { token: inv!.token, rating: 5, comment: "Great!" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rating).toBe(5);
    expect(res.json().comment).toBe("Great!");

    // It is now answered → no longer pending, and audited.
    const pending = await app.inject({ method: "GET", url: "/parents/me/feedback", headers: { cookie: creds.cookie } });
    expect((pending.json() as { pending: unknown[] }).pending).toHaveLength(0);
    const [evt] = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "feedback.submitted"));
    expect(evt).toBeTruthy();
  });

  it("AC3: a second submit is a no-op — the first rating is never overwritten", async () => {
    const me = await seedParent("1357");
    const inv = await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "sub-2", parentId: me.userId });
    const creds = await loginParent(me.phone, me.raw, me.pin);
    const headers = { cookie: `${creds.cookie}; ${creds.csrfCookie}`, "x-csrf-token": creds.csrfToken };

    await app.inject({ method: "POST", url: "/parents/me/feedback/submit", headers, payload: { token: inv!.token, rating: 5, comment: "first" } });
    const replay = await app.inject({ method: "POST", url: "/parents/me/feedback/submit", headers, payload: { token: inv!.token, rating: 1, comment: "second" } });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().rating).toBe(5);
    expect(replay.json().comment).toBe("first");
  });

  it("AC2: rejects a rating outside 0..5 and a >200-char comment", async () => {
    const me = await seedParent("1357");
    const inv = await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "sub-3", parentId: me.userId });
    const creds = await loginParent(me.phone, me.raw, me.pin);
    const headers = { cookie: `${creds.cookie}; ${creds.csrfCookie}`, "x-csrf-token": creds.csrfToken };

    const bad = await app.inject({ method: "POST", url: "/parents/me/feedback/submit", headers, payload: { token: inv!.token, rating: 9 } });
    expect(bad.statusCode).toBe(400);
    const longC = await app.inject({ method: "POST", url: "/parents/me/feedback/submit", headers, payload: { token: inv!.token, rating: 4, comment: "x".repeat(201) } });
    expect(longC.statusCode).toBe(400);
  });

  it("ownership: a parent CANNOT submit another parent's invitation (404, untouched)", async () => {
    const owner = await seedParent("1357");
    const intruder = await seedParent("2468");
    const inv = await createFeedbackInvitation(dbh.db, { sourceType: "salon", sourceId: "own-1", parentId: owner.userId });
    const creds = await loginParent(intruder.phone, intruder.raw, intruder.pin);

    const res = await app.inject({
      method: "POST",
      url: "/parents/me/feedback/submit",
      headers: { cookie: `${creds.cookie}; ${creds.csrfCookie}`, "x-csrf-token": creds.csrfToken },
      payload: { token: inv!.token, rating: 5 },
    });
    expect(res.statusCode).toBe(404);
    const [row] = await dbh.db.select().from(feedback).where(eq(feedback.id, inv!.id));
    expect(row!.submittedAt).toBeNull();
  });

  // --- AC1: salon completion fires the REAL invitation creator + SMS-stub ----

  describe("salon completion → real feedback invitation (AC1)", () => {
    async function seedSalonBooking(opts: { credit: number; discreetLabel?: string }) {
      const svc = await createService(dbh.db, { name: "Kids Cut", unit: "salon" });
      await updateService(dbh.db, svc.id, { salonDurationMinutes: 60 });
      if (opts.discreetLabel) {
        await updateService(dbh.db, svc.id, {
          discreetBillingEnabled: true,
          discreetBillingLabel: opts.discreetLabel,
        });
      }
      await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 2500, effectiveFrom: "2026-01-01" });
      const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
      await setCommissionRate(dbh.db, { staffId: stylist.id, ratePercent: 20, effectiveFrom: new Date("2026-01-01") });
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
        services: [{ id: svc.id, salonDurationMinutes: 60 }],
      });
      const me = await seedParent("1357");
      const [w] = await dbh.db.insert(wallets).values({ userId: me.userId, autoCreditEnabled: false }).returning();
      const [c] = await dbh.db
        .insert(children)
        .values({ parentId: me.parentId, firstName: "Zola", dateOfBirth: "2022-01-01", photoConsent: false })
        .returning();
      await post(dbh.db, { walletId: w!.id, amount: opts.credit, kind: "topup", idempotencyKey: `seed:${w!.id}`, source: "seed", postedBy: me.userId });
      const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: stylist.id, fromDate: TODAY, toDate: TODAY });
      const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: me.parentId, childId: c!.id, staffId: stylist.id });
      return { me, svc, stylistId: stylist.id, bookingId: booked.bookingId };
    }

    it("creates exactly one invitation + queues a feedback.invite SMS-stub on completion", async () => {
      await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
      const staff = await loginStaff("+254712000001", "7421");
      const { me, bookingId, stylistId } = await seedSalonBooking({ credit: 10000 });
      const staffHeaders = { cookie: `${staff.cookie}; ${staff.csrfCookie}`, "x-csrf-token": staff.csrfToken };

      await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders, payload: { bookingId } });
      const res = await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders, payload: { bookingId } });
      expect(res.statusCode).toBe(201);

      // One invitation row, keyed by booking, attributed to the parent (users.id)
      // AND to the stylist who did the work (drives the per-staff dashboard / alerts).
      const rows = await dbh.db.select().from(feedback).where(and(eq(feedback.sourceType, "salon"), eq(feedback.sourceId, bookingId)));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.parentId).toBe(me.userId);
      expect(rows[0]!.attributedStaffId).toBe(stylistId);
      expect(rows[0]!.submittedAt).toBeNull();

      // A feedback.invite SMS-stub was queued to the parent carrying the token link.
      const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "feedback.invite"));
      expect(sms).toHaveLength(1);
      expect(sms[0]!.phone).toBe(me.phone);
      expect(sms[0]!.body).toContain(`/feedback/${rows[0]!.token}`);
      expect(sms[0]!.body).toContain("Kids Cut");

      // And it now shows in the parent's pending list (in-app prompt).
      const creds = await loginParent(me.phone, me.raw, me.pin);
      const pending = await app.inject({ method: "GET", url: "/parents/me/feedback", headers: { cookie: creds.cookie } });
      expect((pending.json() as { pending: unknown[] }).pending).toHaveLength(1);
    });

    it("AC3: completion is idempotent — a salon already completed does not double-invite", async () => {
      await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
      const staff = await loginStaff("+254712000001", "7421");
      const { bookingId } = await seedSalonBooking({ credit: 10000 });
      const staffHeaders = { cookie: `${staff.cookie}; ${staff.csrfCookie}`, "x-csrf-token": staff.csrfToken };

      await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders, payload: { bookingId } });
      await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders, payload: { bookingId } });
      // A second completion is rejected (already completed) — but even if the hook
      // re-fired, the invitation stays single (unique source).
      const second = await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders, payload: { bookingId } });
      expect(second.statusCode).toBe(409);

      const rows = await dbh.db.select().from(feedback).where(and(eq(feedback.sourceType, "salon"), eq(feedback.sourceId, bookingId)));
      expect(rows).toHaveLength(1);
      const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "feedback.invite"));
      expect(sms).toHaveLength(1);
    });

    it("honours discreet billing — the invite SMS uses the neutral label, NOT the real service name", async () => {
      await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
      const staff = await loginStaff("+254712000001", "7421");
      const { bookingId } = await seedSalonBooking({ credit: 10000, discreetLabel: "Wellness Visit" });
      const staffHeaders = { cookie: `${staff.cookie}; ${staff.csrfCookie}`, "x-csrf-token": staff.csrfToken };

      await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders, payload: { bookingId } });
      await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders, payload: { bookingId } });

      const sms = await dbh.db.select().from(smsOutbox).where(eq(smsOutbox.template, "feedback.invite"));
      expect(sms).toHaveLength(1);
      // The sensitive real name must NEVER reach the parent's phone (Epic 31 leak).
      expect(sms[0]!.body).not.toContain("Kids Cut");
      expect(sms[0]!.body).toContain("Wellness Visit");
    });
  });

  // sanity: an attendance row exists for the completed booking (touchpoint anchor)
  it("salon completion records the attendance completion (sanity)", async () => {
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
    const staff = await loginStaff("+254712000001", "7421");
    const svc = await createService(dbh.db, { name: "Kids Cut", unit: "salon" });
    await updateService(dbh.db, svc.id, { salonDurationMinutes: 60 });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 2500, effectiveFrom: "2026-01-01" });
    const stylist = await createStaff(dbh.db, { displayName: "Asha", role: "stylist" });
    await setCommissionRate(dbh.db, { staffId: stylist.id, ratePercent: 20, effectiveFrom: new Date("2026-01-01") });
    const avail = await createStaffAvailability(dbh.db, { staffId: stylist.id, dayOfWeek: dayOfWeekIso(TODAY), startTime: "09:00", endTime: "12:00", effectiveFrom: TODAY });
    await generateSalonSlotsForAvailability(dbh.db, avail, { fromDate: TODAY, days: 1, services: [{ id: svc.id, salonDurationMinutes: 60 }] });
    const me = await seedParent("1357");
    const [w] = await dbh.db.insert(wallets).values({ userId: me.userId, autoCreditEnabled: false }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: me.parentId, firstName: "Zola", dateOfBirth: "2022-01-01" }).returning();
    await post(dbh.db, { walletId: w!.id, amount: 10000, kind: "topup", idempotencyKey: `seed:${w!.id}`, source: "seed", postedBy: me.userId });
    const [slot] = await listAvailableSalonSlots(dbh.db, { serviceId: svc.id, staffId: stylist.id, fromDate: TODAY, toDate: TODAY });
    const booked = await bookSalonSlot(dbh.db, { salonSlotId: slot!.id, parentId: me.parentId, childId: c!.id, staffId: stylist.id });
    const staffHeaders = { cookie: `${staff.cookie}; ${staff.csrfCookie}`, "x-csrf-token": staff.csrfToken };
    await app.inject({ method: "POST", url: "/reception/salon/checkin", headers: staffHeaders, payload: { bookingId: booked.bookingId } });
    await app.inject({ method: "POST", url: "/reception/salon/complete", headers: staffHeaders, payload: { bookingId: booked.bookingId } });
    const [att] = await dbh.db.select().from(attendances).where(eq(attendances.bookingId, booked.bookingId));
    expect(att!.completedAt).toBeTruthy();
  });
});
