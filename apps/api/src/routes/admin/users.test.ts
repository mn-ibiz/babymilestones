import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { users, auditOutbox } from "@bm/db";
import { InMemorySessionStore, staffUserSeed, verifyPin } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E10-S02 — Staff login-user management (CRUD) in the admin console.
 * Integration via app.inject with real staff sessions (+ CSRF). Covers:
 *  - create a staff login user with phone/role/initial-PIN (AC1),
 *  - auto-generated PIN returned once + must be a valid stored hash,
 *  - changing a user's role invalidates their live sessions (1-6 AC4),
 *  - deactivate (soft) blocks staff login + invalidates sessions (AC2),
 *  - permission enforcement (admin/super_admin only; others 403; anon 401),
 *  - the PIN hash is never leaked in any response (AC: no PIN leakage),
 *  - every mutation writes an audit_outbox row (AC4).
 */
describe("Staff login-user management (P1-E10-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;

  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
    const session = cookies.find((c) => c.startsWith("bm_session="))?.split(";")[0] ?? "";
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))?.split(";")[0] ?? "";
    return { session, csrfCookie, csrfToken: (res.json().csrfToken as string) ?? "", status: res.statusCode };
  };

  type Creds = { session: string; csrfCookie: string; csrfToken: string };

  const post = (
    body: Record<string, unknown>,
    creds: Creds,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method: "POST",
      url: "/admin/users",
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  const patch = (
    id: string,
    body: Record<string, unknown>,
    creds: Creds,
    opts: { auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(creds.session);
    if (csrf) cookieParts.push(creds.csrfCookie);
    return app.inject({
      method: "PATCH",
      url: `/admin/users/${id}`,
      headers: {
        cookie: cookieParts.join("; "),
        ...(csrf ? { "x-csrf-token": creds.csrfToken } : {}),
      },
      payload: body,
    });
  };

  const resetPin = (id: string, creds: Creds) =>
    app.inject({
      method: "POST",
      url: `/admin/users/${id}/reset-pin`,
      headers: { cookie: `${creds.session}; ${creds.csrfCookie}`, "x-csrf-token": creds.csrfToken },
      payload: {},
    });

  const list = (creds: Creds) =>
    app.inject({ method: "GET", url: "/admin/users", headers: { cookie: creds.session } });

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    await dbh.db.insert(users).values(await staffUserSeed("+254712000001", "7421", "super_admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000002", "7422", "admin"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000003", "7423", "reception"));
    await dbh.db.insert(users).values(await staffUserSeed("+254712000004", "7424", "cashier"));
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  it("super_admin creates a staff user with an explicit initial PIN (AC1) → 201", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "0733111222", role: "reception", pin: "8642" }, sa);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.phone).toBe("+254733111222"); // normalised
    expect(body.role).toBe("reception");
    expect(body.active).toBe(true);
    // The newly-created user can log in with the issued PIN.
    const login = await loginStaff("0733111222", "8642");
    expect(login.status).toBe(200);
  });

  it("auto-generates the initial PIN when omitted and returns it ONCE (AC1)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "0733111333", role: "cashier" }, sa);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.initialPin).toMatch(/^\d{4}$/u);
    // The returned PIN actually works against the stored hash.
    const [row] = await dbh.db.select().from(users).where(eq(users.phone, "+254733111333"));
    expect(await verifyPin(row!.pinHash!, body.initialPin)).toBe(true);
  });

  it("never leaks the PIN hash in any response (AC: no PIN leakage)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const create = await post({ phone: "0733111444", role: "packer", pin: "8642" }, sa);
    expect(JSON.stringify(create.json())).not.toContain("pinHash");
    expect(JSON.stringify(create.json())).not.toContain("argon2");
    const listed = await list(sa);
    expect(JSON.stringify(listed.json())).not.toContain("argon2");
    expect(JSON.stringify(listed.json())).not.toContain("pin_hash");
  });

  it("rejects creating a parent role (only staff logins) → 400", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "0733111555", role: "parent", pin: "8642" }, sa);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a malformed phone → 400", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "12345", role: "reception" }, sa);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a weak explicit PIN → 400", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "0733111666", role: "reception", pin: "1234" }, sa);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a duplicate phone → 409", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "0712000003", role: "reception", pin: "8642" }, sa);
    expect(res.statusCode).toBe(409);
  });

  it("changing a user's role invalidates their live sessions (1-6 AC4)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    // Create a target staff user and log them in to mint a live session.
    await post({ phone: "0733222111", role: "reception", pin: "8642" }, sa);
    const target = await loginStaff("0733222111", "8642");
    expect(target.status).toBe(200);
    const [u] = await dbh.db.select().from(users).where(eq(users.phone, "+254733222111"));
    // Confirm the session is live before the role change.
    expect(await sessions.get(target.session.split("=")[1]!)).not.toBeNull();
    // Change role → sessions destroyed.
    const res = await patch(u!.id, { role: "cashier" }, sa);
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("cashier");
    expect(await sessions.get(target.session.split("=")[1]!)).toBeNull();
  });

  it("deactivate (soft) blocks staff login + invalidates sessions (AC2)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    await post({ phone: "0733222222", role: "reception", pin: "8642" }, sa);
    const target = await loginStaff("0733222222", "8642");
    const [u] = await dbh.db.select().from(users).where(eq(users.phone, "+254733222222"));

    const res = await patch(u!.id, { active: false }, sa);
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
    // Existing session destroyed.
    expect(await sessions.get(target.session.split("=")[1]!)).toBeNull();
    // And a fresh login attempt is rejected.
    const relogin = await loginStaff("0733222222", "8642");
    expect(relogin.status).toBe(403);
  });

  it("reactivate clears deactivation and allows login again (AC2)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    await post({ phone: "0733222333", role: "reception", pin: "8642" }, sa);
    const [u] = await dbh.db.select().from(users).where(eq(users.phone, "+254733222333"));
    await patch(u!.id, { active: false }, sa);
    const res = await patch(u!.id, { active: true }, sa);
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(true);
    const relogin = await loginStaff("0733222333", "8642");
    expect(relogin.status).toBe(200);
  });

  it("reset PIN returns a new working PIN once + invalidates sessions (AC3)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    await post({ phone: "0733222444", role: "reception", pin: "8642" }, sa);
    const target = await loginStaff("0733222444", "8642");
    const [u] = await dbh.db.select().from(users).where(eq(users.phone, "+254733222444"));

    const res = await resetPin(u!.id, sa);
    expect(res.statusCode).toBe(200);
    const newPin = res.json().initialPin as string;
    expect(newPin).toMatch(/^\d{4}$/u);
    // Old session gone; old PIN no longer works; new PIN works.
    expect(await sessions.get(target.session.split("=")[1]!)).toBeNull();
    expect((await loginStaff("0733222444", "8642")).status).toBe(401);
    expect((await loginStaff("0733222444", newPin)).status).toBe(200);
  });

  it("admin (manage user) may also create + edit (AC1/AC2)", async () => {
    const admin = await loginStaff("0712000002", "7422");
    const create = await post({ phone: "0733333111", role: "packer", pin: "8642" }, admin);
    expect(create.statusCode).toBe(201);
    const [u] = await dbh.db.select().from(users).where(eq(users.phone, "+254733333111"));
    const edit = await patch(u!.id, { role: "cashier" }, admin);
    expect(edit.statusCode).toBe(200);
  });

  it("reception (no manage user) is rejected from create + list → 403", async () => {
    const recep = await loginStaff("0712000003", "7423");
    expect((await post({ phone: "0733333222", role: "packer", pin: "8642" }, recep)).statusCode).toBe(403);
    expect((await list(recep)).statusCode).toBe(403);
  });

  it("cashier is rejected → 403", async () => {
    const cashier = await loginStaff("0712000004", "7424");
    expect((await post({ phone: "0733333333", role: "packer", pin: "8642" }, cashier)).statusCode).toBe(403);
  });

  it("unauthenticated create → 401", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "0733333444", role: "packer", pin: "8642" }, sa, { auth: false });
    expect(res.statusCode).toBe(401);
  });

  it("create without CSRF → 403", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await post({ phone: "0733333555", role: "packer", pin: "8642" }, sa, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("editing an unknown user → 404", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const res = await patch("00000000-0000-0000-0000-000000000000", { role: "cashier" }, sa);
    expect(res.statusCode).toBe(404);
  });

  it("refuses to manage a parent account via this surface → 404", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const [p] = await dbh.db.insert(users).values({ phone: "+254700000999", role: "parent" }).returning();
    const res = await patch(p!.id, { role: "cashier" }, sa);
    expect(res.statusCode).toBe(404);
  });

  it("audits create, role change, deactivate, and reset (AC4)", async () => {
    const sa = await loginStaff("0712000001", "7421");
    const create = await post({ phone: "0733444111", role: "reception", pin: "8642" }, sa);
    const id = create.json().id as string;
    await patch(id, { role: "cashier" }, sa);
    await patch(id, { active: false }, sa);
    await resetPin(id, sa);

    const rows = await dbh.db.select().from(auditOutbox);
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("admin.user.create");
    expect(actions).toContain("admin.user.update");
    expect(actions).toContain("admin.user.reset_pin");
    // No audit payload ever contains the raw PIN or its hash.
    expect(JSON.stringify(rows)).not.toContain("8642");
    expect(JSON.stringify(rows)).not.toContain("argon2");
    // The role-change audit records before/after role (not the PIN).
    const upd = rows.find((r) => r.action === "admin.user.update" && (r.payload as Record<string, unknown>).role_before);
    expect((upd!.payload as Record<string, unknown>).role_before).toBe("reception");
    expect((upd!.payload as Record<string, unknown>).role_after).toBe("cashier");
  });
});
