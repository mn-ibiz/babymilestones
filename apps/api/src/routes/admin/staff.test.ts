import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, users } from "@bm/db";
import { InMemorySessionStore, staffUserSeed } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E07-S03 — staff data records admin API. Integration via app.inject with
 * real staff sessions (+ CSRF). Covers `manage service` enforcement, CRUD with
 * NO auth association, role alignment with the attribution-role taxonomy,
 * soft-deactivation (active/terminatedAt), rename-without-history-rewrite (AC4),
 * and audit on every mutation (DoD #4).
 */
describe("Staff data records admin API (P1-E07-S03)", () => {
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
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    creds: Creds,
    payload?: Record<string, unknown>,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method,
      url,
      headers: { cookie: cookieParts.join("; "), ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}) },
      ...(payload ? { payload } : {}),
    });
  };

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

  const validStaff = { displayName: "Asha", role: "stylist" };

  it("admin can create a staff member, active by default, audited (AC1/AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/staff", creds, validStaff);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.displayName).toBe("Asha");
    expect(body.role).toBe("stylist");
    expect(body.active).toBe(true);
    expect(body.terminatedAt).toBeNull();
    // No auth fields leak into the data record.
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("userId");

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.staff.create"));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.targetId).toBe(body.id);
  });

  it("reception (no manage service) is forbidden", async () => {
    const creds = await loginStaff("+254712000003", "7423");
    const res = await req("POST", "/admin/staff", creds, validStaff);
    expect(res.statusCode).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/staff", creds, validStaff, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a role outside the attribution taxonomy (AC1 validation)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/staff", creds, { displayName: "X", role: "cashier" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("role");
  });

  it("rejects an empty display name", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const res = await req("POST", "/admin/staff", creds, { displayName: "  ", role: "coach" });
    expect(res.statusCode).toBe(400);
  });

  it("lists staff and filters by activeOnly + role", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const a = (await req("POST", "/admin/staff", creds, { displayName: "A", role: "stylist" })).json();
    await req("POST", "/admin/staff", creds, { displayName: "B", role: "coach" });
    await req("PATCH", `/admin/staff/${a.id}`, creds, { active: false });

    const all = (await req("GET", "/admin/staff", creds)).json();
    expect(all.staff).toHaveLength(2);

    const activeOnly = (await req("GET", "/admin/staff?activeOnly=1", creds)).json();
    expect(activeOnly.staff.map((s: { id: string }) => s.id)).not.toContain(a.id);

    const stylists = (await req("GET", "/admin/staff?role=stylist", creds)).json();
    expect(stylists.staff.every((s: { role: string }) => s.role === "stylist")).toBe(true);
  });

  it("reads one and 404s an unknown id", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = (await req("POST", "/admin/staff", creds, validStaff)).json();
    const read = await req("GET", `/admin/staff/${created.id}`, creds);
    expect(read.statusCode).toBe(200);
    expect(read.json().displayName).toBe("Asha");

    const miss = await req("GET", "/admin/staff/00000000-0000-0000-0000-000000000000", creds);
    expect(miss.statusCode).toBe(404);
  });

  it("renames in place (AC4) — same id, role/active untouched, audited", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = (await req("POST", "/admin/staff", creds, validStaff)).json();
    const res = await req("PATCH", `/admin/staff/${created.id}`, creds, { displayName: "Asha N." });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(created.id); // no new record
    expect(body.displayName).toBe("Asha N.");
    expect(body.role).toBe("stylist");
    expect(body.active).toBe(true);

    const audits = await dbh.db
      .select()
      .from(auditOutbox)
      .where(eq(auditOutbox.action, "catalog.staff.update"));
    expect(audits).toHaveLength(1);
  });

  it("changes role via PATCH", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = (await req("POST", "/admin/staff", creds, validStaff)).json();
    const res = await req("PATCH", `/admin/staff/${created.id}`, creds, { role: "attendant" });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("attendant");
  });

  it("soft-deactivates via active=false stamping terminatedAt (AC1/AC2)", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = (await req("POST", "/admin/staff", creds, validStaff)).json();
    const off = await req("PATCH", `/admin/staff/${created.id}`, creds, { active: false });
    expect(off.statusCode).toBe(200);
    expect(off.json().active).toBe(false);
    expect(off.json().terminatedAt).not.toBeNull();
    // Reactivate clears terminatedAt.
    const on = await req("PATCH", `/admin/staff/${created.id}`, creds, { active: true });
    expect(on.json().active).toBe(true);
    expect(on.json().terminatedAt).toBeNull();
  });

  it("rejects an empty PATCH body", async () => {
    const creds = await loginStaff("+254712000001", "7421");
    const created = (await req("POST", "/admin/staff", creds, validStaff)).json();
    const res = await req("PATCH", `/admin/staff/${created.id}`, creds, {});
    expect(res.statusCode).toBe(400);
  });
});
