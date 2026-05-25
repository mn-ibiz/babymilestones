import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LightMyRequestResponse } from "fastify";
import { eq } from "drizzle-orm";
import { createTestDb } from "@bm/db/testing";
import { auditOutbox, parents, users } from "@bm/db";
import { InMemorySessionStore, hashPin } from "@bm/auth";
import { buildApp } from "../../app.js";

describe("PUT/GET /parents/me (P1-E02-S01)", () => {
  let dbh: Awaited<ReturnType<typeof createTestDb>>;
  let app: ReturnType<typeof buildApp>;
  let sessions: InMemorySessionStore;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let userId: string;

  beforeEach(async () => {
    dbh = await createTestDb();
    sessions = new InMemorySessionStore();
    app = buildApp({ db: dbh.db, sessions });
    const [u] = await dbh.db
      .insert(users)
      .values({ phone: "+254712345678", pinHash: await hashPin("1357") })
      .returning();
    userId = u!.id;
    // Authenticate the same way the client does → real session + CSRF cookies.
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { phone: "0712345678", pin: "1357" },
    });
    const cookies = login.headers["set-cookie"] as string[];
    sessionCookie = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
    csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
    csrfToken = login.json().csrfToken as string;
  });
  afterEach(async () => {
    await app.close();
    await dbh.close();
  });

  const put = (body: Record<string, unknown>, opts: { auth?: boolean; csrf?: boolean } = {}) => {
    const { auth = true, csrf = true } = opts;
    const headers: Record<string, string> = {};
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(sessionCookie);
    if (csrf) cookieParts.push(csrfCookie);
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = csrfToken;
    return app.inject({ method: "PUT", url: "/parents/me", headers, payload: body });
  };

  const get = (auth = true): Promise<LightMyRequestResponse> =>
    app.inject({
      method: "GET",
      url: "/parents/me",
      headers: auth ? { cookie: sessionCookie } : {},
    });

  it("rejects an unauthenticated PUT (AC: auth)", async () => {
    const res = await put({ firstName: "A", lastName: "B" }, { auth: false, csrf: false });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a PUT without a CSRF token (mutating verb)", async () => {
    const res = await put({ firstName: "A", lastName: "B" }, { csrf: false });
    expect(res.statusCode).toBe(403);
  });

  it("creates the profile, writes an audit row (AC1, DoD#4)", async () => {
    const res = await put({
      firstName: "Amina",
      lastName: "Otieno",
      email: "amina@example.co.ke",
      residentialArea: "Kileleshwa",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      profile: {
        userId,
        firstName: "Amina",
        lastName: "Otieno",
        email: "amina@example.co.ke",
        residentialArea: "Kileleshwa",
      },
      complete: true,
    });

    const [row] = await dbh.db.select().from(parents).where(eq(parents.userId, userId));
    expect(row!.firstName).toBe("Amina");

    const events = await dbh.db.select().from(auditOutbox);
    const create = events.find((e) => e.action === "parent.profile.create");
    expect(create).toBeDefined();
    expect(create!.actorUserId).toBe(userId);
    expect(create!.targetTable).toBe("parents");
  });

  it("validates required names (AC2)", async () => {
    const res = await put({ firstName: "", lastName: "Otieno" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("firstName");
  });

  it("rejects a clearly invalid email but accepts a permissive one (AC2)", async () => {
    const bad = await put({ firstName: "A", lastName: "B", email: "not-an-email" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().field).toBe("email");

    const ok = await put({ firstName: "A", lastName: "B", email: "a+tag@sub.host.io" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().profile.email).toBe("a+tag@sub.host.io");
  });

  it("allows optional fields to be skipped → null, profile still complete (AC1, AC3)", async () => {
    const res = await put({ firstName: "Amina", lastName: "Otieno" });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.email).toBeNull();
    expect(res.json().profile.residentialArea).toBeNull();
    expect(res.json().complete).toBe(true);
  });

  it("GET reports incomplete before any profile (AC3 — banner shows)", async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: null, complete: false });
  });

  it("edits the profile in place from the dashboard, audited as update (AC4)", async () => {
    await put({ firstName: "Amina", lastName: "Otieno" });
    const res = await put({ firstName: "Aminah", lastName: "Otieno", residentialArea: "Lavington" });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.firstName).toBe("Aminah");
    expect(res.json().profile.residentialArea).toBe("Lavington");

    // One row only (upsert, not a second insert).
    const rows = await dbh.db.select().from(parents).where(eq(parents.userId, userId));
    expect(rows).toHaveLength(1);

    const events = await dbh.db.select().from(auditOutbox);
    expect(events.some((e) => e.action === "parent.profile.update")).toBe(true);

    const after = await get();
    expect(after.json().complete).toBe(true);
    expect(after.json().profile.firstName).toBe("Aminah");
  });

  // --- Acquisition attribution from WhatsApp deep-link (P1-E12-S03 AC2) ---

  it("persists the captured UTM to parents.acquisition_source on signup (AC2)", async () => {
    const res = await put({
      firstName: "Amina",
      lastName: "Otieno",
      acquisitionSource: { source: "whatsapp", campaign: "play-launch" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.acquisitionSource).toEqual({
      source: "whatsapp",
      campaign: "play-launch",
    });

    const [row] = await dbh.db.select().from(parents).where(eq(parents.userId, userId));
    expect(row!.acquisitionSource).toEqual({ source: "whatsapp", campaign: "play-launch" });
  });

  it("leaves acquisition_source null for an organic signup (no UTM)", async () => {
    const res = await put({ firstName: "Amina", lastName: "Otieno" });
    expect(res.json().profile.acquisitionSource).toBeNull();
    const [row] = await dbh.db.select().from(parents).where(eq(parents.userId, userId));
    expect(row!.acquisitionSource).toBeNull();
  });

  it("does not overwrite acquisition_source on a later profile edit (set-once)", async () => {
    await put({
      firstName: "Amina",
      lastName: "Otieno",
      acquisitionSource: { source: "whatsapp" },
    });
    // A later edit forwarding a different/no source must not rewrite attribution.
    await put({ firstName: "Aminah", lastName: "Otieno", acquisitionSource: { source: "google" } });
    const [row] = await dbh.db.select().from(parents).where(eq(parents.userId, userId));
    expect(row!.acquisitionSource).toEqual({ source: "whatsapp" });
  });

  it("ignores a malformed acquisition payload (attribution never blocks save)", async () => {
    const res = await put({
      firstName: "Amina",
      lastName: "Otieno",
      acquisitionSource: { evil: "x".repeat(999) },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await dbh.db.select().from(parents).where(eq(parents.userId, userId));
    expect(row!.acquisitionSource).toBeNull();
  });

  // --- SMS marketing consent (P1-E02-S04) ---

  const putConsent = (body: Record<string, unknown>, opts: { auth?: boolean; csrf?: boolean } = {}) => {
    const { auth = true, csrf = true } = opts;
    const headers: Record<string, string> = {};
    const cookieParts: string[] = [];
    if (auth) cookieParts.push(sessionCookie);
    if (csrf) cookieParts.push(csrfCookie);
    if (cookieParts.length) headers["cookie"] = cookieParts.join("; ");
    if (csrf) headers["x-csrf-token"] = csrfToken;
    return app.inject({ method: "PUT", url: "/parents/me/consent/sms", headers, payload: body });
  };

  it("SMS consent defaults false on a new profile (AC1)", async () => {
    await put({ firstName: "Amina", lastName: "Otieno" });
    const res = await get();
    expect(res.json().profile.smsMarketingOptIn).toBe(false);
  });

  it("rejects an unauthenticated / CSRF-less consent toggle", async () => {
    expect((await putConsent({ smsMarketingOptIn: true }, { auth: false, csrf: false })).statusCode).toBe(
      401,
    );
    await put({ firstName: "Amina", lastName: "Otieno" });
    expect((await putConsent({ smsMarketingOptIn: true }, { csrf: false })).statusCode).toBe(403);
  });

  it("404s when toggling consent before a profile exists", async () => {
    const res = await putConsent({ smsMarketingOptIn: true });
    expect(res.statusCode).toBe(404);
  });

  it("rejects a non-boolean consent value (AC1)", async () => {
    await put({ firstName: "Amina", lastName: "Otieno" });
    const res = await putConsent({ smsMarketingOptIn: "yes" });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe("smsMarketingOptIn");
  });

  it("toggles SMS marketing consent, audited with a timestamp (AC1, AC2)", async () => {
    await put({ firstName: "Amina", lastName: "Otieno" });

    const on = await putConsent({ smsMarketingOptIn: true });
    expect(on.statusCode).toBe(200);
    expect(on.json().profile.smsMarketingOptIn).toBe(true);
    // GET reflects the change.
    expect((await get()).json().profile.smsMarketingOptIn).toBe(true);

    const off = await putConsent({ smsMarketingOptIn: false });
    expect(off.json().profile.smsMarketingOptIn).toBe(false);

    const events = await dbh.db.select().from(auditOutbox);
    const consentEvents = events.filter((e) => e.action === "parent.consent.sms");
    expect(consentEvents).toHaveLength(2);
    expect(consentEvents[0]!.actorUserId).toBe(userId);
    expect(consentEvents[0]!.targetTable).toBe("parents");
    // AC2: the change is logged with a timestamp — both the row's own created_at
    // and the payload's explicit `at`.
    expect(consentEvents[0]!.createdAt).toBeInstanceOf(Date);
    const payload = consentEvents[0]!.payload as { at?: string; sms_marketing_opt_in?: boolean };
    expect(typeof payload.at).toBe("string");
    expect(payload.sms_marketing_opt_in).toBe(true);
  });

  it("does not disturb other profile fields when toggling consent", async () => {
    await put({ firstName: "Amina", lastName: "Otieno", residentialArea: "Lavington" });
    await putConsent({ smsMarketingOptIn: true });
    const res = await get();
    expect(res.json().profile).toMatchObject({
      firstName: "Amina",
      lastName: "Otieno",
      residentialArea: "Lavington",
      smsMarketingOptIn: true,
    });
  });
});
