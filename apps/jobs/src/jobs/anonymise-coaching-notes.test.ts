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
  services,
  staff,
  users,
} from "@bm/db";
import { recordCoachingSessionNote } from "@bm/catalog";
import { subtractMonths } from "./anonymise-observations.js";
import {
  createAnonymiseCoachingNotesJob,
  RETENTION_MONTHS,
} from "./anonymise-coaching-notes.js";

/**
 * P5-E01-S04 (Story 31.4 AC4) — 24-month retention + anonymisation for PRIVATE
 * coach session notes, consistent with the Decision-29 observations worker. After
 * 24 months the encrypted note is PURGED (`note_enc` NULLed) and the owner ids are
 * stripped; the row is stamped `anonymised_at`. DB-backed via PGlite + injected clock.
 */
const NOW = new Date("2026-06-15T00:00:00.000Z");
const MASTER_KEY = "test-master-key-31-4-coaching-notes";

async function seedNote(
  dbh: Awaited<ReturnType<typeof createTestDb>>,
  opts: { createdAt: Date; note?: string },
) {
  const [u] = await dbh.db.insert(users).values({ phone: `+25470${Math.floor(1000000 + Math.random() * 8999999)}`, pinHash: "x" }).returning();
  const [actor] = await dbh.db.insert(users).values({ phone: `+25471${Math.floor(1000000 + Math.random() * 8999999)}`, pinHash: "x", role: "reception" }).returning();
  const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" }).returning();
  const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Zola", lastName: "Kid", dateOfBirth: "2022-01-01" }).returning();
  const [coach] = await dbh.db.insert(staff).values({ displayName: "Coach Lulu", role: "coach", active: true }).returning();
  const [svc] = await dbh.db.insert(services).values({ name: "Sleep coaching", unit: "coaching", attributionRoleRequired: "coach" }).returning();
  const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, status: "settled" }).returning();
  const [b] = await dbh.db
    .insert(bookings)
    .values({ parentId: p!.id, childId: c!.id, serviceId: svc!.id, staffId: coach!.id, staffNameSnapshot: "Coach Lulu", staffRateSnapshot: 0, invoiceId: inv!.id })
    .returning();
  const rec = await recordCoachingSessionNote(dbh.db, {
    bookingId: b!.id,
    note: opts.note ?? "Private coaching content",
    actor: actor!.id,
    masterKey: MASTER_KEY,
  });
  // Backdate the row to the desired age.
  await dbh.db.update(coachingSessionNotes).set({ createdAt: opts.createdAt }).where(eq(coachingSessionNotes.id, rec.id));
  return { noteId: rec.id, parentId: p!.id, staffId: coach!.id };
}

describe("anonymise-coaching-notes registration (AC4)", () => {
  it("is scheduled 02:00 daily with the correct name + cron", () => {
    const job = createAnonymiseCoachingNotesJob({ db: {} as never });
    expect(job.name).toBe("anonymise-coaching-notes");
    expect(job.cron).toBe("0 2 * * *");
    expect(job.intervalMs).toBe(24 * 60 * 60 * 1000);
    expect(job.onFailure).toBe("retry-next-tick");
    expect(RETENTION_MONTHS).toBe(24);
  });
});

describe("anonymise-coaching-notes cron (AC4)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  it("purges the encrypted note + strips owner ids for rows older than 24 months only", async () => {
    const old = await seedNote(dbh, { createdAt: subtractMonths(NOW, 25), note: "old private note" });
    const recent = await seedNote(dbh, { createdAt: subtractMonths(NOW, 1), note: "recent private note" });

    const logs: Array<Record<string, unknown>> = [];
    const job = createAnonymiseCoachingNotesJob({
      db: dbh.db,
      now: () => NOW,
      logger: { info: (obj) => logs.push(obj), warn: () => {} },
    });
    await job.run();

    const [oldRow] = await dbh.db.select().from(coachingSessionNotes).where(eq(coachingSessionNotes.id, old.noteId));
    expect(oldRow!.noteEnc).toBeNull(); // ciphertext purged
    expect(oldRow!.parentId).toBeNull(); // PII stripped
    expect(oldRow!.staffId).toBeNull();
    expect(oldRow!.anonymisedAt).not.toBeNull();

    const [recentRow] = await dbh.db.select().from(coachingSessionNotes).where(eq(coachingSessionNotes.id, recent.noteId));
    expect(recentRow!.noteEnc).not.toBeNull(); // untouched
    expect(recentRow!.staffId).toBe(recent.staffId);
    expect(recentRow!.anonymisedAt).toBeNull();

    // Run + count logged.
    const summary = logs.find((l) => l.event === "anonymise.coaching_notes" && (l.count as number) > 0);
    expect(summary).toBeDefined();
    expect(summary!.count).toBe(1);

    // Per-row audit (no content).
    const events = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "coaching.session_note.anonymised"));
    expect(events).toHaveLength(1);
    expect(events[0]!.targetId).toBe(old.noteId);
    expect(JSON.stringify(events[0]!.payload)).not.toContain("old private note");
  });

  it("is idempotent — a re-run anonymises nothing new", async () => {
    await seedNote(dbh, { createdAt: subtractMonths(NOW, 30) });
    const job = createAnonymiseCoachingNotesJob({ db: dbh.db, now: () => NOW });
    await job.run();
    await job.run();
    const events = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "coaching.session_note.anonymised"));
    expect(events).toHaveLength(1);
  });
});
