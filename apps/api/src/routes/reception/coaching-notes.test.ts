import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  bookings,
  children,
  coachingSessionNotes,
  invoices,
  parents,
  services,
  staff,
  users,
} from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P5-E01-S04 (Story 31.4) — PRIVATE coach session notes API. Integration via
 * app.inject with real staff sessions (+ CSRF).
 *
 *  - AC1: Reception/admin records a PRIVATE note after check-out.
 *  - AC2: the note is ENCRYPTED AT REST; the DECRYPTED view is ADMIN-ONLY; the
 *    public coach summary is content-free.
 *  - AC3: parents never see the notes — there is NO parent surface.
 *  - RBAC: a role lacking the gate gets 403.
 */
const ENC_KEY = "test-coaching-note-encryption-key-material";

describe("reception coaching session notes API (Story 31.4)", () => {
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
    method: "GET" | "POST",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        cookie: `${creds.session}; ${creds.csrfCookie}`,
        "x-csrf-token": creds.csrfToken,
      },
      ...(payload ? { payload } : {}),
    });

  let admin: Creds;
  let reception: Creds;

  async function seedCoachingBooking(coachName = "Coach Lulu") {
    const [u] = await dbh.db.insert(users).values({ phone: `+25470${Math.floor(1000000 + Math.random() * 8999999)}`, pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Zola", lastName: "Kid", dateOfBirth: "2022-01-01" }).returning();
    const [coach] = await dbh.db.insert(staff).values({ displayName: coachName, role: "coach", active: true }).returning();
    const [svc] = await dbh.db.insert(services).values({ name: "Sleep coaching", unit: "coaching", attributionRoleRequired: "coach" }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, status: "settled" }).returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({ parentId: p!.id, childId: c!.id, serviceId: svc!.id, staffId: coach!.id, staffNameSnapshot: coachName, staffRateSnapshot: 0, invoiceId: inv!.id })
      .returning();
    return { bookingId: b!.id, staffId: coach!.id, parentId: p!.id };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions, coachingNoteEncryptionKey: ENC_KEY });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    admin = await loginStaff("+254712000001", "7421");
    reception = await loginStaff("+254712000003", "7423");
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const NOTE = "Parent reports the sleep regression is improving with the new routine.";

  it("AC1: reception records a private note; it is encrypted at rest (no plaintext stored)", async () => {
    const s = await seedCoachingBooking();
    const res = await req("POST", "/reception/coaching/notes", reception, { bookingId: s.bookingId, note: NOTE });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();

    const [row] = await dbh.db.select().from(coachingSessionNotes).where(eq(coachingSessionNotes.bookingId, s.bookingId));
    expect(row!.noteEnc).toBeTruthy();
    expect(row!.noteEnc).not.toContain(NOTE); // ciphertext, never plaintext
    expect(row!.noteEnc!.startsWith("v1:")).toBe(true);
    expect(row!.staffId).toBe(s.staffId);
  });

  it("AC1: the API response body never echoes the note content", async () => {
    const s = await seedCoachingBooking();
    const res = await req("POST", "/reception/coaching/notes", reception, { bookingId: s.bookingId, note: NOTE });
    expect(JSON.stringify(res.json())).not.toContain(NOTE);
    expect(JSON.stringify(res.json())).not.toContain("sleep regression");
  });

  it("AC2: admin views the DECRYPTED note", async () => {
    const s = await seedCoachingBooking();
    await req("POST", "/reception/coaching/notes", reception, { bookingId: s.bookingId, note: NOTE });
    const res = await req("GET", "/reception/coaching/notes", admin);
    expect(res.statusCode).toBe(200);
    const notes = res.json().notes as Array<{ note: string; bookingId: string }>;
    expect(notes).toHaveLength(1);
    expect(notes[0]!.note).toBe(NOTE);
    expect(notes[0]!.bookingId).toBe(s.bookingId);
  });

  it("AC2/RBAC: reception (lacks read audit) CANNOT view decrypted notes (403)", async () => {
    const s = await seedCoachingBooking();
    await req("POST", "/reception/coaching/notes", reception, { bookingId: s.bookingId, note: NOTE });
    const res = await req("GET", "/reception/coaching/notes", reception);
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).not.toContain(NOTE);
  });

  it("RBAC: cashier (lacks create payment? has it) — a role lacking the record gate is rejected", async () => {
    // The packer role holds no `create payment`; assert the record gate rejects it.
    await dbh.db.insert(users).values(await staffUserSeed("+254712000005", "7425", "packer"));
    const packer = await loginStaff("+254712000005", "7425");
    const s = await seedCoachingBooking();
    const res = await req("POST", "/reception/coaching/notes", packer, { bookingId: s.bookingId, note: NOTE });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a note for an unknown booking (404) and a non-coaching booking (409)", async () => {
    const unknown = await req("POST", "/reception/coaching/notes", reception, {
      bookingId: "00000000-0000-0000-0000-000000000000",
      note: NOTE,
    });
    expect(unknown.statusCode).toBe(404);

    // A salon (non-coaching) booking.
    const [u] = await dbh.db.insert(users).values({ phone: "+254799000111", pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Bea", lastName: "S" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "T", lastName: "S", dateOfBirth: "2023-01-01" }).returning();
    const [stylist] = await dbh.db.insert(staff).values({ displayName: "Sam", role: "stylist", active: true }).returning();
    const [svc] = await dbh.db.insert(services).values({ name: "Cut", unit: "salon" }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, status: "settled" }).returning();
    const [b] = await dbh.db.insert(bookings).values({ parentId: p!.id, childId: c!.id, serviceId: svc!.id, staffId: stylist!.id, staffNameSnapshot: "Sam", staffRateSnapshot: 0, invoiceId: inv!.id }).returning();
    const notCoaching = await req("POST", "/reception/coaching/notes", reception, { bookingId: b!.id, note: NOTE });
    expect(notCoaching.statusCode).toBe(409);
  });

  it("AC3: there is NO parent surface for coach notes", async () => {
    const s = await seedCoachingBooking();
    await req("POST", "/reception/coaching/notes", reception, { bookingId: s.bookingId, note: NOTE });
    // No parent-app route serves these notes — common guesses 404.
    for (const url of [
      "/parents/me/coaching/notes",
      `/parents/me/coaching/bookings/${s.bookingId}/notes`,
      "/parents/me/coaching-notes",
    ]) {
      const res = await app.inject({ method: "GET", url, headers: { cookie: `${reception.session}; ${reception.csrfCookie}` } });
      expect(res.statusCode).toBe(404);
    }
  });

  it("AC2 security: the public coach viewer returns counts + dates but NO note content", async () => {
    const s = await seedCoachingBooking("Coach Lulu");
    await req("POST", "/reception/coaching/notes", reception, { bookingId: s.bookingId, note: NOTE });

    // Unauthenticated — no session cookie at all.
    const list = await app.inject({ method: "GET", url: "/public/coaching-notes" });
    expect(list.statusCode).toBe(200);
    expect((list.json().coaches as unknown[]).length).toBeGreaterThanOrEqual(1);

    const res = await app.inject({ method: "GET", url: `/public/coaching-notes/${s.staffId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.noteCount).toBe(1);
    expect(body.staffName).toBe("Coach Lulu");
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].bookingId).toBe(s.bookingId);
    // CRITICAL: no note content (plaintext) and no ciphertext envelope leaks.
    const json = JSON.stringify(body);
    expect(json).not.toContain(NOTE);
    expect(json).not.toContain("sleep regression");
    expect(json).not.toContain("v1:");
    expect(body).not.toHaveProperty("note");
    expect(body.sessions[0]).not.toHaveProperty("note");
    expect(body.sessions[0]).not.toHaveProperty("noteEnc");
  });
});
