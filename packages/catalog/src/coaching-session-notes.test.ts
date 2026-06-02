import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import {
  auditOutbox,
  bookings,
  children,
  coachingSessionNotes,
  invoices,
  parents,
  staff,
  users,
} from "@bm/db";
import {
  getCoachingSessionNotesForAdmin,
  listCoachingSessionNoteSummaryForCoach,
  listCoachingSessionNotesForCoach,
  recordCoachingSessionNote,
  CoachingSessionNoteBookingNotFoundError,
  CoachingSessionNoteNotCoachingError,
} from "./coaching-session-notes.js";

/**
 * P5-E01-S04 (Story 31.4) — PRIVATE coach session notes. The note is ENCRYPTED AT
 * REST (column-level) under a master key; decryption is gated to the authenticated
 * admin/reception path. The coach-scoped reads are scoped to ONE coach's records
 * (AC2); the public-summary read never decrypts content (AC2 security decision).
 * DB-backed via PGlite.
 */
const MASTER_KEY = "test-master-key-31-4-coaching-notes";

async function seedCoachingSession(dbh: Awaited<ReturnType<typeof createTestDb>>, opts: { coachName?: string } = {}) {
  const [u] = await dbh.db.insert(users).values({ phone: `+25470${Math.floor(1000000 + Math.random() * 8999999)}`, pinHash: "x" }).returning();
  const [actor] = await dbh.db.insert(users).values({ phone: `+25471${Math.floor(1000000 + Math.random() * 8999999)}`, pinHash: "x", role: "reception" }).returning();
  const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" }).returning();
  const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Zola", lastName: "Kid", dateOfBirth: "2022-01-01" }).returning();
  const [coach] = await dbh.db.insert(staff).values({ displayName: opts.coachName ?? "Coach Lulu", role: "coach", active: true }).returning();
  const [svc] = await dbh.db
    .insert((await import("@bm/db")).services)
    .values({ name: "Sleep coaching", unit: "coaching", attributionRoleRequired: "coach" })
    .returning();
  const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, status: "settled" }).returning();
  const [b] = await dbh.db
    .insert(bookings)
    .values({
      parentId: p!.id,
      childId: c!.id,
      serviceId: svc!.id,
      staffId: coach!.id,
      staffNameSnapshot: opts.coachName ?? "Coach Lulu",
      staffRateSnapshot: 0,
      invoiceId: inv!.id,
      // A coaching booking carries a coachingSlotId; for note-recording the
      // attribution to a coach (role 'coach') is what matters.
      coachingSlotId: null,
    })
    .returning();
  return { bookingId: b!.id, parentId: p!.id, childId: c!.id, staffId: coach!.id, actorId: actor!.id };
}

describe("recordCoachingSessionNote (AC1) — encrypts + inserts + audits", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("encrypts the note at rest — the stored column is ciphertext, never plaintext (Dev Note)", async () => {
    const s = await seedCoachingSession(dbh);
    const note = "Parent reports the 6-month sleep regression is improving.";
    const result = await recordCoachingSessionNote(dbh.db, {
      bookingId: s.bookingId,
      note,
      actor: s.actorId,
      masterKey: MASTER_KEY,
    });
    const [row] = await dbh.db.select().from(coachingSessionNotes).where(eq(coachingSessionNotes.id, result.id));
    // Stored column is an AES-256-GCM envelope, NOT the plaintext.
    expect(row!.noteEnc).toBeTruthy();
    expect(row!.noteEnc).not.toContain(note);
    expect(row!.noteEnc!.startsWith("v1:")).toBe(true);
    // Owner ids + coach are denormalised onto the row (scoping + anonymisation).
    expect(row!.parentId).toBe(s.parentId);
    expect(row!.staffId).toBe(s.staffId);
    expect(row!.bookingId).toBe(s.bookingId);
    expect(row!.createdBy).toBe(s.actorId);
  });

  it("audits coaching.session_note.recorded WITHOUT the note content in the payload", async () => {
    const s = await seedCoachingSession(dbh);
    const note = "Sensitive content about the family that must not be audited.";
    await recordCoachingSessionNote(dbh.db, { bookingId: s.bookingId, note, actor: s.actorId, masterKey: MASTER_KEY });
    const [event] = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "coaching.session_note.recorded"));
    expect(event).toBeDefined();
    expect(event!.actorUserId).toBe(s.actorId);
    const payloadJson = JSON.stringify(event!.payload);
    // The note plaintext must NEVER appear in the audit trail.
    expect(payloadJson).not.toContain(note);
    expect(payloadJson).not.toContain("Sensitive content");
  });

  it("rejects a note for an unknown booking", async () => {
    await expect(
      recordCoachingSessionNote(dbh.db, {
        bookingId: "00000000-0000-0000-0000-000000000000",
        note: "x",
        actor: "00000000-0000-0000-0000-000000000001",
        masterKey: MASTER_KEY,
      }),
    ).rejects.toBeInstanceOf(CoachingSessionNoteBookingNotFoundError);
  });

  it("rejects a note for a non-coaching booking (only coaching sessions get notes)", async () => {
    // A booking attributed to a non-coach staff member is not a coaching session.
    const [u] = await dbh.db.insert(users).values({ phone: "+254799999999", pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Bea", lastName: "Sty" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Tot", lastName: "Sty", dateOfBirth: "2023-01-01" }).returning();
    const [stylist] = await dbh.db.insert(staff).values({ displayName: "Stylist Sam", role: "stylist", active: true }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, status: "settled" }).returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({ parentId: p!.id, childId: c!.id, staffId: stylist!.id, staffNameSnapshot: "Stylist Sam", staffRateSnapshot: 0, invoiceId: inv!.id })
      .returning();
    await expect(
      recordCoachingSessionNote(dbh.db, { bookingId: b!.id, note: "x", actor: u!.id, masterKey: MASTER_KEY }),
    ).rejects.toBeInstanceOf(CoachingSessionNoteNotCoachingError);
  });
});

describe("getCoachingSessionNotesForAdmin (AC2) — decrypts for admin", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("round-trips: record then admin-view returns the plaintext note", async () => {
    const s = await seedCoachingSession(dbh);
    const note = "Recommended a consistent 7pm bedtime routine.";
    await recordCoachingSessionNote(dbh.db, { bookingId: s.bookingId, note, actor: s.actorId, masterKey: MASTER_KEY });
    const rows = await getCoachingSessionNotesForAdmin(dbh.db, { masterKey: MASTER_KEY });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBe(note);
    expect(rows[0]!.staffId).toBe(s.staffId);
    expect(rows[0]!.bookingId).toBe(s.bookingId);
  });

  it("can filter to one booking's notes", async () => {
    const a = await seedCoachingSession(dbh);
    const b = await seedCoachingSession(dbh);
    await recordCoachingSessionNote(dbh.db, { bookingId: a.bookingId, note: "note A", actor: a.actorId, masterKey: MASTER_KEY });
    await recordCoachingSessionNote(dbh.db, { bookingId: b.bookingId, note: "note B", actor: b.actorId, masterKey: MASTER_KEY });
    const rows = await getCoachingSessionNotesForAdmin(dbh.db, { masterKey: MASTER_KEY, bookingId: a.bookingId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBe("note A");
  });

  it("returns null content for an anonymised row instead of throwing on decrypt", async () => {
    const s = await seedCoachingSession(dbh);
    await recordCoachingSessionNote(dbh.db, { bookingId: s.bookingId, note: "old note", actor: s.actorId, masterKey: MASTER_KEY });
    await dbh.db.update(coachingSessionNotes).set({ noteEnc: null, anonymisedAt: new Date() });
    const rows = await getCoachingSessionNotesForAdmin(dbh.db, { masterKey: MASTER_KEY });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.note).toBeNull();
    expect(rows[0]!.anonymisedAt).not.toBeNull();
  });
});

describe("listCoachingSessionNotesForCoach (AC2) — scoped to ONE coach", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("returns only the named coach's own notes, decrypted (own-records scope)", async () => {
    const lulu = await seedCoachingSession(dbh, { coachName: "Coach Lulu" });
    const max = await seedCoachingSession(dbh, { coachName: "Coach Max" });
    await recordCoachingSessionNote(dbh.db, { bookingId: lulu.bookingId, note: "lulu note", actor: lulu.actorId, masterKey: MASTER_KEY });
    await recordCoachingSessionNote(dbh.db, { bookingId: max.bookingId, note: "max note", actor: max.actorId, masterKey: MASTER_KEY });

    const luluNotes = await listCoachingSessionNotesForCoach(dbh.db, { staffId: lulu.staffId, masterKey: MASTER_KEY });
    expect(luluNotes).toHaveLength(1);
    expect(luluNotes[0]!.note).toBe("lulu note");
    // A different coach's note never crosses the scope.
    expect(luluNotes.some((n) => n.note === "max note")).toBe(false);
  });
});

describe("listCoachingSessionNoteSummaryForCoach (AC2 security) — NO content", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("returns counts + dates for the coach WITHOUT any note content (no plaintext, no ciphertext)", async () => {
    const s = await seedCoachingSession(dbh, { coachName: "Coach Lulu" });
    const note = "Strictly private coaching content not for the public surface.";
    await recordCoachingSessionNote(dbh.db, { bookingId: s.bookingId, note, actor: s.actorId, masterKey: MASTER_KEY });

    const summary = await listCoachingSessionNoteSummaryForCoach(dbh.db, { staffId: s.staffId });
    expect(summary.staffId).toBe(s.staffId);
    expect(summary.noteCount).toBe(1);
    expect(summary.sessions).toHaveLength(1);
    // The summary must carry ZERO note content — neither plaintext nor ciphertext.
    const json = JSON.stringify(summary);
    expect(json).not.toContain(note);
    expect(json).not.toContain("Strictly private");
    expect(json).not.toContain("v1:"); // no ciphertext envelope leaked
    expect((summary as unknown as Record<string, unknown>).note).toBeUndefined();
    expect((summary.sessions[0] as unknown as Record<string, unknown>).note).toBeUndefined();
    expect((summary.sessions[0] as unknown as Record<string, unknown>).noteEnc).toBeUndefined();
  });

  it("excludes anonymised notes from the coach's live summary count", async () => {
    const s = await seedCoachingSession(dbh, { coachName: "Coach Lulu" });
    await recordCoachingSessionNote(dbh.db, { bookingId: s.bookingId, note: "live", actor: s.actorId, masterKey: MASTER_KEY });
    await recordCoachingSessionNote(dbh.db, { bookingId: s.bookingId, note: "to be cleared", actor: s.actorId, masterKey: MASTER_KEY });
    // Anonymise one row.
    const [first] = await dbh.db.select().from(coachingSessionNotes).limit(1);
    await dbh.db.update(coachingSessionNotes).set({ noteEnc: null, anonymisedAt: new Date() }).where(eq(coachingSessionNotes.id, first!.id));

    const summary = await listCoachingSessionNoteSummaryForCoach(dbh.db, { staffId: s.staffId });
    expect(summary.noteCount).toBe(1);
  });
});
