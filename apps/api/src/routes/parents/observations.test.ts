import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { children, observations, parents, users } from "@bm/db";
import { createTestDb } from "@bm/db/testing";
import { InMemorySessionStore, hashPin } from "@bm/auth";
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

const TODAY = "2026-06-18";

/**
 * P2-E03-S04 — Observations feed in the parent's account. Read-only per-child
 * timeline (mood, activities, note, attendant, date — AC1), filterable by date
 * range + service (AC2). Ownership-scoped; anonymised rows drop out.
 */
describe("parent observations feed (P2-E03-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  async function makeParent(phone: string, rawPhone: string) {
    const [u] = await dbh.db.insert(users).values({ phone, pinHash: await hashPin("1357") }).returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Amina", lastName: "Otieno" })
      .returning();
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: rawPhone, pin: "1357" } });
    const cookies = login.headers["set-cookie"] as string[];
    const sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    return { userId: u!.id, parentId: p!.id, sessionCookie };
  }

  async function seedServiceSlot(name: string, startTime: string) {
    const svc = await createService(dbh.db, { name, unit: "play", ageMaxMonths: null });
    await setServicePrice(dbh.db, { serviceId: svc.id, amountCents: 1500, effectiveFrom: "2026-01-01" });
    const sched = await createSchedule(dbh.db, {
      serviceId: svc.id,
      dayOfWeek: dayOfWeekIso(TODAY),
      startTime,
      endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`,
      slotDurationMinutes: 60,
      capacity: 5,
    });
    await generateSlotsForSchedule(dbh.db, sched, { fromDate: TODAY, days: 2 });
    const slot = (await listSlotsWithRemaining(dbh.db, { serviceId: svc.id })).find((s) => s.slotDate === TODAY)!;
    return { serviceId: svc.id, slotId: slot.id };
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const feed = (sessionCookie: string, childId: string, query = "") =>
    app.inject({
      method: "GET",
      url: `/parents/me/children/${childId}/observations${query}`,
      headers: { cookie: sessionCookie },
    });

  it("returns a read-only per-child timeline newest-first with all AC1 fields", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent.parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const playA = await seedServiceSlot("Soft Play", "09:00");
    const bookingA = await bookSlot(dbh.db, { slotId: playA.slotId, parentId: parent.parentId, childId: child!.id, actor: parent.userId });
    await dbh.db.insert(observations).values({
      bookingId: bookingA.bookingId,
      childId: child!.id,
      parentId: parent.parentId,
      mood: "😄",
      activities: ["Story time", "Snack"],
      note: "Great day",
      attendantNameSnapshot: "Aunty Jane",
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
    });

    const res = await feed(parent.sessionCookie, child!.id);
    expect(res.statusCode).toBe(200);
    const list = res.json().observations;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      childId: child!.id,
      mood: "😄",
      activities: ["Story time", "Snack"],
      note: "Great day",
      attendantName: "Aunty Jane",
      serviceName: "Soft Play",
    });
    expect(list[0].date).toBe("2026-05-20T10:00:00.000Z");
  });

  it("filters by date range and by service (AC2)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent.parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const play = await seedServiceSlot("Soft Play", "09:00");
    const music = await seedServiceSlot("Music", "11:00");
    const bPlay = await bookSlot(dbh.db, { slotId: play.slotId, parentId: parent.parentId, childId: child!.id, actor: parent.userId });
    const bMusic = await bookSlot(dbh.db, { slotId: music.slotId, parentId: parent.parentId, childId: child!.id, actor: parent.userId });
    await dbh.db.insert(observations).values([
      { bookingId: bPlay.bookingId, childId: child!.id, parentId: parent.parentId, mood: "😊", activities: [], attendantNameSnapshot: "A", createdAt: new Date("2026-05-01T10:00:00.000Z") },
      { bookingId: bMusic.bookingId, childId: child!.id, parentId: parent.parentId, mood: "😐", activities: [], attendantNameSnapshot: "A", createdAt: new Date("2026-05-20T10:00:00.000Z") },
    ]);

    // date range: only the 2026-05-20 one
    const ranged = await feed(parent.sessionCookie, child!.id, "?from=2026-05-10&to=2026-05-31");
    expect(ranged.json().observations).toHaveLength(1);
    expect(ranged.json().observations[0].serviceName).toBe("Music");

    // service filter: only Soft Play
    const byService = await feed(parent.sessionCookie, child!.id, `?serviceId=${play.serviceId}`);
    expect(byService.json().observations).toHaveLength(1);
    expect(byService.json().observations[0].serviceName).toBe("Soft Play");
  });

  it("omits anonymised observations (child_id NULLed by S05)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent.parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const play = await seedServiceSlot("Soft Play", "09:00");
    const b = await bookSlot(dbh.db, { slotId: play.slotId, parentId: parent.parentId, childId: child!.id, actor: parent.userId });
    // an anonymised row: child_id/parent_id cleared
    await dbh.db.insert(observations).values({
      bookingId: b.bookingId,
      childId: null,
      parentId: null,
      mood: "😊",
      activities: [],
      attendantNameSnapshot: "A",
      anonymisedAt: new Date(),
    });
    const res = await feed(parent.sessionCookie, child!.id);
    expect(res.json().observations).toHaveLength(0);
  });

  it("ignores a non-uuid serviceId filter instead of 500ing", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent.parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();
    const play = await seedServiceSlot("Soft Play", "09:00");
    const b = await bookSlot(dbh.db, { slotId: play.slotId, parentId: parent.parentId, childId: child!.id, actor: parent.userId });
    await dbh.db.insert(observations).values({
      bookingId: b.bookingId,
      childId: child!.id,
      parentId: parent.parentId,
      mood: "😊",
      activities: [],
      attendantNameSnapshot: "A",
    });
    const res = await feed(parent.sessionCookie, child!.id, "?serviceId=not-a-uuid");
    expect(res.statusCode).toBe(200);
    expect(res.json().observations).toHaveLength(1);
  });

  it("rejects an unauthenticated request and another family's child (ownership)", async () => {
    const parent = await makeParent("+254712345678", "0712345678");
    const [child] = await dbh.db
      .insert(children)
      .values({ parentId: parent.parentId, firstName: "Zola", dateOfBirth: "2024-01-15" })
      .returning();

    const anon = await app.inject({ method: "GET", url: `/parents/me/children/${child!.id}/observations` });
    expect(anon.statusCode).toBe(401);

    const other = await makeParent("+254799999999", "0799999999");
    const cross = await feed(other.sessionCookie, child!.id);
    expect(cross.statusCode).toBe(404);
  });
});
