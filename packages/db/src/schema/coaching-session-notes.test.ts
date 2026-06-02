import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../testing.js";
import { bookings } from "./bookings.js";
import { children } from "./children.js";
import { coachingSessionNotes } from "./coaching-session-notes.js";
import { invoices } from "./invoices.js";
import { parents } from "./parents.js";
import { staff } from "./staff.js";
import { users } from "./users.js";

/**
 * P5-E01-S04 (Story 31.4) — `coaching_session_notes` schema. The note column is
 * ENCRYPTED AT REST (column-level): `note_enc` holds an opaque ciphertext envelope,
 * never plaintext. Owner ids + the encrypted note are NULLable so the 24-month
 * anonymisation job can clear them in place (AC4), mirroring `observations`.
 */
describe("coaching_session_notes schema (P5-E01-S04)", () => {
  let dbh: TestDb;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedSession() {
    const [u] = await dbh.db.insert(users).values({ phone: "+254700000001", pinHash: "x" }).returning();
    const [actor] = await dbh.db.insert(users).values({ phone: "+254700000002", pinHash: "x", role: "reception" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Zola", lastName: "Kid", dateOfBirth: "2022-01-01" }).returning();
    const [coach] = await dbh.db.insert(staff).values({ displayName: "Coach Lulu", role: "coach", active: true }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, status: "settled" }).returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({ parentId: p!.id, childId: c!.id, staffId: coach!.id, staffNameSnapshot: "Coach Lulu", staffRateSnapshot: 0, invoiceId: inv!.id })
      .returning();
    return { bookingId: b!.id, parentId: p!.id, staffId: coach!.id, actorId: actor!.id };
  }

  it("inserts a note row keyed to a booking, parent and coach (AC1/AC2)", async () => {
    const s = await seedSession();
    const [row] = await dbh.db
      .insert(coachingSessionNotes)
      .values({
        bookingId: s.bookingId,
        parentId: s.parentId,
        staffId: s.staffId,
        staffNameSnapshot: "Coach Lulu",
        noteEnc: "v1:aaaa:bbbb:cccc:dddd",
        createdBy: s.actorId,
      })
      .returning();
    expect(row!.bookingId).toBe(s.bookingId);
    expect(row!.parentId).toBe(s.parentId);
    expect(row!.staffId).toBe(s.staffId);
    expect(row!.noteEnc).toBe("v1:aaaa:bbbb:cccc:dddd");
    expect(row!.createdBy).toBe(s.actorId);
    expect(row!.anonymisedAt).toBeNull();
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  it("the note column stores ciphertext only — no plaintext text column exists (Dev Note)", async () => {
    const res = await dbh.pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'coaching_session_notes'`,
    );
    const cols = res.rows.map((r) => r.column_name);
    // Encrypted-at-rest column present; no cleartext "note" / "note_text" column.
    expect(cols).toContain("note_enc");
    expect(cols).not.toContain("note");
    expect(cols).not.toContain("note_text");
    expect(cols).not.toContain("note_plain");
  });

  it("allows the owner ids + encrypted note to be NULLed in place (AC4 anonymisation)", async () => {
    const s = await seedSession();
    const [row] = await dbh.db
      .insert(coachingSessionNotes)
      .values({ bookingId: s.bookingId, parentId: s.parentId, staffId: s.staffId, noteEnc: "v1:x:y:z:w" })
      .returning();
    await dbh.db
      .update(coachingSessionNotes)
      .set({ parentId: null, staffId: null, noteEnc: null, anonymisedAt: new Date() })
      .where(eq(coachingSessionNotes.id, row!.id));
    const [cleared] = await dbh.db
      .select()
      .from(coachingSessionNotes)
      .where(eq(coachingSessionNotes.id, row!.id));
    expect(cleared!.parentId).toBeNull();
    expect(cleared!.staffId).toBeNull();
    expect(cleared!.noteEnc).toBeNull();
    expect(cleared!.anonymisedAt).not.toBeNull();
  });

  it("rejects a note for a non-existent booking (FK)", async () => {
    await expect(
      dbh.db.insert(coachingSessionNotes).values({
        bookingId: "00000000-0000-0000-0000-000000000000",
        noteEnc: "v1:x:y:z:w",
      }),
    ).rejects.toThrow();
  });
});
