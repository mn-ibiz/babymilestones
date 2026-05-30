import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@bm/db/testing";
import { auditOutbox, staff, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P3-E01-S01 — admin commission-rate CRUD route. Integration via app.inject with
 * real staff sessions (+ CSRF). Covers `manage service` enforcement, auto-close
 * on a second rate (AC2), validation, and the audit (AC4).
 */
describe("admin commission-rate routes (P3-E01-S01)", () => {
  let dbh: TestDb;
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
    opts: { csrf?: boolean } = {},
  ) => {
    const { csrf = true } = opts;
    const cookie = [creds.session, ...(csrf ? [creds.csrfCookie] : [])].join("; ");
    return app.inject({
      method,
      url,
      headers: { cookie, ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}) },
      ...(payload ? { payload } : {}),
    });
  };

  async function seedStaff() {
    const [s] = await dbh.db.insert(staff).values({ displayName: "Asha", role: "stylist" }).returning();
    return s!.id;
  }

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("sets a rate, returns it open, and audits the change (AC2/AC4)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const id = await seedStaff();
    const res = await req("POST", `/admin/staff/${id}/commission-rates`, creds, {
      ratePercent: "12.50",
      effectiveFrom: "2026-01-01T00:00:00Z",
      reason: "initial",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().rate.ratePercent).toBe("12.50");
    expect(res.json().rate.effectiveTo).toBeNull();
    const audits = await dbh.db.select().from(auditOutbox).where(eq(auditOutbox.action, "commission.rate.set"));
    expect(audits).toHaveLength(1);
  });

  it("a second rate auto-closes the first (AC2) — history reflects both", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const id = await seedStaff();
    await req("POST", `/admin/staff/${id}/commission-rates`, creds, { ratePercent: "10.00", effectiveFrom: "2026-01-01T00:00:00Z" });
    await req("POST", `/admin/staff/${id}/commission-rates`, creds, { ratePercent: "12.50", effectiveFrom: "2026-03-01T00:00:00Z" });
    const list = await req("GET", `/admin/staff/${id}/commission-rates`, creds);
    expect(list.statusCode).toBe(200);
    const rates = list.json().rates as Array<{ ratePercent: string; effectiveTo: string | null }>;
    expect(rates).toHaveLength(2);
    expect(rates[0]!.ratePercent).toBe("12.50"); // newest first
    expect(rates[0]!.effectiveTo).toBeNull();
    expect(rates[1]!.effectiveTo).not.toBeNull(); // first auto-closed
  });

  it("rejects an out-of-range rate (400)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const id = await seedStaff();
    const res = await req("POST", `/admin/staff/${id}/commission-rates`, creds, { ratePercent: "150", effectiveFrom: "2026-01-01T00:00:00Z" });
    expect(res.statusCode).toBe(400);
  });

  it("403s a role lacking manage-service (reception)", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const id = await seedStaff();
    const res = await req("POST", `/admin/staff/${id}/commission-rates`, creds, { ratePercent: "10.00", effectiveFrom: "2026-01-01T00:00:00Z" });
    expect(res.statusCode).toBe(403);
  });

  it("404s an unknown staff id", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", `/admin/staff/00000000-0000-0000-0000-0000000000ff/commission-rates`, creds, {
      ratePercent: "10.00",
      effectiveFrom: "2026-01-01T00:00:00Z",
    });
    expect(res.statusCode).toBe(404);
  });
});
