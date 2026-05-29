import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, bookings, children, invoices, observations, parents, users } from "@bm/db";
import {
  anonymiseNote,
  createAnonymiseObservationsJob,
  subtractMonths,
} from "./anonymise-observations.js";

/**
 * P2-E03-S05 — 24-month retention + anonymisation. DB-backed via PGlite with an
 * injected clock. Covers the age scan (AC1), PII strip + name scrub (AC2),
 * aggregate-text retention (AC3), and the run/count log (AC4).
 */
const NOW = new Date("2026-06-15T00:00:00.000Z");

describe("anonymiseNote (AC2)", () => {
  it("replaces first AND last names case-insensitively on word boundaries", () => {
    expect(anonymiseNote("Zola painted with Amina today", ["Zola"], ["Amina"])).toBe(
      "[child] painted with [parent] today",
    );
    expect(anonymiseNote("ZOLA was happy", ["Zola"], [])).toBe("[child] was happy");
    expect(anonymiseNote("Zola Kidd was collected by Amina Mumm", ["Zola", "Kidd"], ["Amina", "Mumm"])).toBe(
      "[child] [child] was collected by [parent] [parent]",
    );
  });
  it("does not touch substrings of other words", () => {
    expect(anonymiseNote("Zolanda is not Zola", ["Zola"], [])).toBe("Zolanda is not [child]");
  });
  it("leaves a null/empty note or a missing name untouched", () => {
    expect(anonymiseNote(null, ["Zola"], ["Amina"])).toBeNull();
    expect(anonymiseNote("no names here", [""], [null])).toBe("no names here");
  });
  it("escapes regex-special characters in a name (the dot is literal, not a wildcard)", () => {
    // Without escaping, "An.a" would also match "Anxa"; escaped, only the literal matches.
    expect(anonymiseNote("Anxa and An.a played", ["An.a"], [])).toBe("Anxa and [child] played");
  });
});

describe("subtractMonths", () => {
  it("subtracts whole months in UTC", () => {
    expect(subtractMonths(NOW, 24).toISOString()).toBe("2024-06-15T00:00:00.000Z");
  });
  it("clamps a month-end date instead of overflowing into the next month", () => {
    // 2026-03-31 − 1 month must land on Feb 28, not roll forward to March 03.
    expect(subtractMonths(new Date("2026-03-31T00:00:00.000Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });
});

describe("anonymise-observations cron (P2-E03-S05)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => {
    dbh = await createTestDb();
  });
  afterEach(async () => {
    await dbh.close();
  });

  async function seedObservation(opts: { createdAt: Date; note: string | null; anonymisedAt?: Date | null }) {
    const [u] = await dbh.db.insert(users).values({ phone: `+25473${String(Math.floor(1000000 + Math.abs(opts.createdAt.getTime() % 8999999)))}`, pinHash: "x" }).returning();
    const [p] = await dbh.db.insert(parents).values({ userId: u!.id, firstName: "Amina", lastName: "Mum" }).returning();
    const [c] = await dbh.db.insert(children).values({ parentId: p!.id, firstName: "Zola", lastName: "Kid", dateOfBirth: "2022-01-01" }).returning();
    const [inv] = await dbh.db.insert(invoices).values({ parentId: p!.id, amountDue: 0, status: "settled" }).returning();
    const [b] = await dbh.db
      .insert(bookings)
      .values({ parentId: p!.id, childId: c!.id, staffNameSnapshot: "", staffRateSnapshot: 0, invoiceId: inv!.id })
      .returning();
    const [obs] = await dbh.db
      .insert(observations)
      .values({
        bookingId: b!.id,
        childId: c!.id,
        parentId: p!.id,
        mood: "😊",
        activities: ["Story time"],
        note: opts.note,
        attendantNameSnapshot: "Attendant",
        anonymisedAt: opts.anonymisedAt ?? null,
        createdAt: opts.createdAt,
      })
      .returning();
    return { observationId: obs!.id, childId: c!.id, parentId: p!.id };
  }

  it("anonymises only rows older than 24 months, strips PII + scrubs names, retains aggregate text (AC1-3)", async () => {
    // Seeded names: child "Zola Kid", parent "Amina Mum".
    const old = await seedObservation({ createdAt: subtractMonths(NOW, 25), note: "Zola Kid laughed with Amina Mum" });
    const recent = await seedObservation({ createdAt: subtractMonths(NOW, 1), note: "Zola napped" });

    const logs: Array<Record<string, unknown>> = [];
    const job = createAnonymiseObservationsJob({
      db: dbh.db,
      now: () => NOW,
      logger: { info: (obj) => logs.push(obj), warn: () => {} },
    });
    await job.run();

    const [oldRow] = await dbh.db.select().from(observations).where(eq(observations.id, old.observationId));
    expect(oldRow!.childId).toBeNull(); // AC2 PII stripped
    expect(oldRow!.parentId).toBeNull();
    expect(oldRow!.anonymisedAt).not.toBeNull();
    expect(oldRow!.note).toBe("[child] [child] laughed with [parent] [parent]"); // AC2 first + last names scrubbed
    expect(oldRow!.mood).toBe("😊"); // AC3 aggregate text retained
    expect(oldRow!.activities).toEqual(["Story time"]);

    const [recentRow] = await dbh.db.select().from(observations).where(eq(observations.id, recent.observationId));
    expect(recentRow!.childId).toBe(recent.childId); // untouched
    expect(recentRow!.anonymisedAt).toBeNull();
    expect(recentRow!.note).toBe("Zola napped");

    // AC4: run + count logged
    const summary = logs.find((l) => l.event === "anonymise.observations" && (l.count as number) > 0);
    expect(summary).toBeDefined();
    expect(summary!.count).toBe(1);

    // per-row audit
    const events = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "observation.anonymised"));
    expect(events).toHaveLength(1);
    expect(events[0]!.targetId).toBe(old.observationId);
  });

  it("is idempotent — a re-run anonymises nothing new (AC1)", async () => {
    await seedObservation({ createdAt: subtractMonths(NOW, 30), note: "Zola played" });
    const job = createAnonymiseObservationsJob({ db: dbh.db, now: () => NOW });
    await job.run();
    await job.run();
    // exactly one anonymisation audit despite two runs
    const events = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "observation.anonymised"));
    expect(events).toHaveLength(1);
  });

  it("skips a row whose transaction fails and still anonymises newer due rows (no starvation)", async () => {
    // The OLDEST due row fails its per-row transaction. With batchSize 1 it fills
    // the oldest page on its own; a newer (still-expired) row must NOT be starved
    // behind it — it must still be anonymised this run.
    const poison = await seedObservation({ createdAt: subtractMonths(NOW, 30), note: "Zola old" });
    const healthy = await seedObservation({ createdAt: subtractMonths(NOW, 26), note: "Zola newer" });

    const realTransaction = dbh.db.transaction.bind(dbh.db);
    let txCalls = 0;
    const flakyDb = new Proxy(dbh.db, {
      get(target, prop, receiver) {
        if (prop === "transaction") {
          return (...args: Parameters<typeof realTransaction>) => {
            txCalls += 1;
            // Fail the first per-row transaction (the oldest, poison row).
            if (txCalls === 1) return Promise.reject(new Error("simulated row failure"));
            return realTransaction(...args);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const logs: Array<Record<string, unknown>> = [];
    const job = createAnonymiseObservationsJob({
      db: flakyDb,
      now: () => NOW,
      batchSize: 1,
      logger: { info: (obj) => logs.push(obj), warn: () => {} },
    });
    await job.run();

    const [poisonRow] = await dbh.db.select().from(observations).where(eq(observations.id, poison.observationId));
    const [healthyRow] = await dbh.db.select().from(observations).where(eq(observations.id, healthy.observationId));
    // poison row failed → left for the next run (not falsely sealed)
    expect(poisonRow!.anonymisedAt).toBeNull();
    // newer row is NOT starved — it was anonymised despite the older failure
    expect(healthyRow!.anonymisedAt).not.toBeNull();
    expect(healthyRow!.childId).toBeNull();

    const summary = logs.find((l) => l.event === "anonymise.observations");
    expect(summary).toMatchObject({ count: 1, failed: 1 });
  });
});
