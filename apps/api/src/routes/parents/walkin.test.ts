import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, parents, users, wallets } from "@bm/db";
import { InMemorySessionStore, staffUserSeed, hashPin } from "@bm/auth";
import { buildApp } from "../../app.js";

/**
 * P1-E02-S02 — Reception registers a walk-in parent.
 * Integration via app.inject with a real reception staff session (+ CSRF).
 */
describe("Reception walk-in registration (P1-E02-S02)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let staffSession: string;
  let staffCsrfCookie: string;
  let staffCsrfToken: string;
  let staffId: string;

  // Log a seeded staff user in and capture its session + CSRF the way the client does.
  const loginStaff = async (phone: string, pin: string) => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { phone, pin },
    });
    const cookies = res.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    return { session, csrfCookie, csrfToken: res.json().csrfToken as string };
  };

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });

    const [staff] = await dbh.db
      .insert(users)
      .values(await staffUserSeed("+254712000001", "7421", "reception"))
      .returning();
    staffId = staff!.id;
    const s = await loginStaff("0712000001", "7421");
    staffSession = s.session;
    staffCsrfCookie = s.csrfCookie;
    staffCsrfToken = s.csrfToken;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const post = (
    body: Record<string, unknown>,
    opts: { session?: string; csrfCookie?: string; csrfToken?: string; auth?: boolean; csrf?: boolean } = {},
  ) => {
    const { auth = true, csrf = true } = opts;
    const session = opts.session ?? staffSession;
    const csrfCookie = opts.csrfCookie ?? staffCsrfCookie;
    const csrfToken = opts.csrfToken ?? staffCsrfToken;
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(session);
    if (csrf) cookieParts.push(csrfCookie);
    const headers: Record<string, string> = {};
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = csrfToken;
    return app.inject({ method: "POST", url: "/parents/walk-in", headers, payload: body });
  };

  const check = (phone: string, session = staffSession) =>
    app.inject({
      method: "GET",
      url: `/parents/phone-check?phone=${encodeURIComponent(phone)}`,
      headers: { cookie: session },
    });

  const VALID = { phone: "0723456789", firstName: "Amina", lastName: "Otieno" };

  it("rejects an unauthenticated create (AC: auth)", async () => {
    const res = await post(VALID, { auth: false, csrf: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a create without a CSRF token (mutating verb)", async () => {
    const res = await post(VALID, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("forbids a non-reception staff role without create:user (e.g. packer)", async () => {
    await dbh.db.insert(users).values(await staffUserSeed("+254712000099", "8888", "packer"));
    const p = await loginStaff("0712000099", "8888");
    const res = await post(VALID, { session: p.session, csrfCookie: p.csrfCookie, csrfToken: p.csrfToken });
    expect(res.statusCode).toBe(403);
  });

  it("forbids a parent session (no create:user permission)", async () => {
    await dbh.db
      .insert(users)
      .values({ phone: "+254700000000", pinHash: await hashPin("1357"), role: "parent" });
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { phone: "0700000000", pin: "1357" } });
    const cookies = login.headers["set-cookie"] as string[];
    const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    const csrfToken = login.json().csrfToken as string;
    const res = await post(VALID, { session, csrfCookie, csrfToken });
    expect(res.statusCode).toBe(403);
  });

  it("creates a walk-in parent with NO PIN, auto-provisions a wallet, audits the staff actor (AC1, AC3, AC4)", async () => {
    const res = await post({ ...VALID, email: "amina@example.co.ke", residentialArea: "Kileleshwa" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ pinSet: false });
    const newUserId = res.json().userId as string;

    // AC3: no PIN set → must verify-via-OTP on first self-login.
    const [u] = await dbh.db.select().from(users).where(eq(users.id, newUserId));
    expect(u!.phone).toBe("+254723456789");
    expect(u!.pinHash).toBeNull();
    expect(u!.pinSetAt).toBeNull();
    expect(u!.role).toBe("parent");

    // AC1: the one-screen profile persisted.
    const [profile] = await dbh.db.select().from(parents).where(eq(parents.userId, newUserId));
    expect(profile!.firstName).toBe("Amina");
    expect(profile!.lastName).toBe("Otieno");
    expect(profile!.email).toBe("amina@example.co.ke");
    expect(profile!.residentialArea).toBe("Kileleshwa");

    // Wallet auto-provisioned (parity with self-signup).
    const [wallet] = await dbh.db.select().from(wallets).where(eq(wallets.userId, newUserId));
    expect(wallet).toBeDefined();

    // AC4: audited with the acting staff user id, exact action name, no credential.
    const events = await dbh.db.select().from(auditOutbox);
    const event = events.find((e) => e.action === "parent.created_by_reception");
    expect(event).toBeDefined();
    expect(event!.actorUserId).toBe(staffId);
    expect(event!.targetId).toBe(newUserId);
    expect((event!.payload as Record<string, unknown>).staff_user_id).toBe(staffId);
  });

  it("creates with optional fields omitted → null (AC1)", async () => {
    const res = await post(VALID);
    expect(res.statusCode).toBe(201);
    const [profile] = await dbh.db
      .select()
      .from(parents)
      .where(eq(parents.userId, res.json().userId as string));
    expect(profile!.email).toBeNull();
    expect(profile!.residentialArea).toBeNull();
  });

  it("requires a phone (AC1)", async () => {
    const res = await post({ firstName: "A", lastName: "B" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("phone");
  });

  it("rejects an invalid phone with a 400 (AC1)", async () => {
    const res = await post({ phone: "12345", firstName: "A", lastName: "B" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("phone");
  });

  it("requires first and last name (AC1)", async () => {
    const res = await post({ phone: "0723456789", firstName: "", lastName: "B" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("firstName");
  });

  it("rejects a duplicate phone with 409 + existing reference for Open existing/Merge intent (AC2)", async () => {
    const first = await post(VALID);
    expect(first.statusCode).toBe(201);
    const existingId = first.json().userId as string;

    // Same phone in a different local format normalises to the same number.
    const dup = await post({ phone: "+254723456789", firstName: "X", lastName: "Y" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().existing).toMatchObject({ userId: existingId, firstName: "Amina", lastName: "Otieno" });

    // Only one user + one profile exist.
    const all = await dbh.db.select().from(users).where(eq(users.phone, "+254723456789"));
    expect(all).toHaveLength(1);
  });

  it("phone-check reports availability for a free phone (AC2)", async () => {
    const res = await check("0723456789");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: true, existing: null });
  });

  it("phone-check returns the existing reference on collision (AC2)", async () => {
    const created = await post(VALID);
    const existingId = created.json().userId as string;
    const res = await check("0723456789");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      available: false,
      existing: { userId: existingId, firstName: "Amina", lastName: "Otieno" },
    });
  });

  it("phone-check rejects an invalid phone (400) and requires auth (401)", async () => {
    const bad = await check("nope");
    expect(bad.statusCode).toBe(400);
    const unauth = await app.inject({ method: "GET", url: "/parents/phone-check?phone=0723456789" });
    expect(unauth.statusCode).toBe(401);
  });
});
