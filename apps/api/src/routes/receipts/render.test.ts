import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@bm/db/testing";
import { parents, services, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { writeReceipt } from "@bm/payments";
import { buildApp } from "../../app.js";

/**
 * P1-E08-S03 — Receipt render route. Integration via app.inject with a real
 * staff session. Covers both server-side templates (A4 HTML + 80mm thermal),
 * the masked customer phone (AC3 — full number never emitted), branding (AC2),
 * content types per format, the format validation, unknown receipt → 404, and
 * the staff-only read guard.
 */
describe("Receipt render (P1-E08-S03)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = res.headers["set-cookie"] as string[];
    return cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  };

  async function seedReceipt(): Promise<string> {
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: "x" })
      .returning();
    const [p] = await dbh.db
      .insert(parents)
      .values({ userId: u!.id, firstName: "Asha", lastName: "Mwangi" })
      .returning();
    const [svc] = await dbh.db
      .insert(services)
      .values({ name: "Soft-play session", unit: "play" })
      .returning();
    const receipt = await writeReceipt(dbh.db, {
      series: "BM-2026",
      paymentMethod: "mpesa",
      postedBy: "system",
      parentAccountId: p!.id,
      lines: [
        { serviceId: svc!.id, quantity: 2, unitPrice: 50_000, lineTax: 13_793, lineTotal: 100_000 },
      ],
    });
    return receipt.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("renders the A4 branded HTML template (AC1, AC2)", async () => {
    const id = await seedReceipt();
    const session = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: `/receipts/${id}?format=a4`,
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("@page { size: A4");
    expect(res.body).toContain("BM-2026-000001");
    expect(res.body).toContain("Soft-play session");
    expect(res.body).toContain("KES 1000.00"); // line total / grand total
    expect(res.body).toContain("Baby Milestones");
  });

  it("defaults to A4 when no format is given", async () => {
    const id = await seedReceipt();
    const session = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: `/receipts/${id}`,
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("renders the 80mm thermal plain-text template (AC1)", async () => {
    const id = await seedReceipt();
    const session = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: `/receipts/${id}?format=thermal`,
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).not.toContain("<");
    expect(res.body).toContain("BM-2026-000001");
    expect(res.body).toContain("Soft-play session");
    expect(res.body).toContain("KES 1000.00");
    for (const line of res.body.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it("masks the customer phone to last 4 in both formats (AC3)", async () => {
    const id = await seedReceipt();
    const session = await loginStaff("0712000001", "7421");
    for (const format of ["a4", "thermal"] as const) {
      const res = await app.inject({
        method: "GET",
        url: `/receipts/${id}?format=${format}`,
        headers: { cookie: session },
      });
      expect(res.body).toContain("••••5678");
      expect(res.body).not.toContain("+254712345678");
      expect(res.body).not.toContain("254712345678");
    }
  });

  it("rejects an unknown format with 400", async () => {
    const id = await seedReceipt();
    const session = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: `/receipts/${id}?format=pdf`,
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown receipt id", async () => {
    const session = await loginStaff("0712000001", "7421");
    const res = await app.inject({
      method: "GET",
      url: `/receipts/00000000-0000-4000-8000-000000000000?format=a4`,
      headers: { cookie: session },
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires a staff session (401 when unauthenticated)", async () => {
    const id = await seedReceipt();
    const res = await app.inject({ method: "GET", url: `/receipts/${id}?format=a4` });
    expect(res.statusCode).toBe(401);
  });
});
