import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { staff } from "@bm/db";
import { InMemorySessionStore } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * Public (unauthenticated) coach session-note SUMMARY viewer (P5-E01-S04). Content-free:
 * a coach picks their name on the reception PC and sees only how many private notes
 * exist + when. Mirrors the staff-earnings kiosk surface. These tests focus on the
 * input-hardening of the internet-reachable endpoint (no note content ever crosses).
 */
let phoneSeq = 0;
const nextPhone = () => `+2547${String(++phoneSeq).padStart(8, "0")}`;

describe("public coaching-notes summary (P5-E01-S04)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    dbh = await createTestDb();
    app = buildApp({ db: dbh.db, sessions: new InMemorySessionStore() });
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  async function seedCoach(name: string): Promise<string> {
    const [s] = await dbh.db
      .insert(staff)
      .values({ displayName: name, role: "coach", phone: nextPhone(), active: true })
      .returning();
    return s!.id;
  }

  it("returns a content-free summary for a real coach", async () => {
    const id = await seedCoach("Coach Amina");
    const res = await app.inject({ method: "GET", url: `/public/coaching-notes/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.staffId).toBe(id);
    expect(body.noteCount).toBe(0);
    expect(body.sessions).toEqual([]);
    // Never any note content envelope on this public surface.
    expect(JSON.stringify(body)).not.toContain("cipher");
  });

  it("404s a malformed (non-UUID) staffId instead of 500ing on a Postgres 22P02", async () => {
    const res = await app.inject({ method: "GET", url: "/public/coaching-notes/not-a-uuid" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Coach not found");
  });

  it("404s a well-formed but unknown coach id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/public/coaching-notes/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });
});
