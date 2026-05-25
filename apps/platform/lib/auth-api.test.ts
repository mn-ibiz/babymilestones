import { afterEach, describe, expect, it, vi } from "vitest";
import { submitSignIn, submitSignUp } from "./auth-api.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("submitSignUp (P1-E12-S04, signup 1-1 wiring)", () => {
  it("POSTs to /auth/signup with credentials and the phone+PIN payload", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ userId: "u1" }) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const res = await submitSignUp({ phone: "+254712345678", pin: "5731", pinConfirm: "5731" });
    expect(res.ok).toBe(true);

    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toBe("/auth/signup");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({
      phone: "+254712345678",
      pin: "5731",
      pinConfirm: "5731",
    });
  });

  it("maps a duplicate-phone 409 to a steer-to-sign-in error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: "You already have an account — please log in", action: "login" }),
      })) as unknown as typeof fetch,
    );
    const res = await submitSignUp({ phone: "+254712345678", pin: "5731", pinConfirm: "5731" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.redirectToSignIn).toBe(true);
      expect(res.error.message).toBe("You already have an account — please log in");
    }
  });

  it("maps a weak-PIN 400 to the field error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "Choose a less predictable PIN", field: "pin" }),
      })) as unknown as typeof fetch,
    );
    const res = await submitSignUp({ phone: "+254712345678", pin: "1234", pinConfirm: "1234" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.field).toBe("pin");
      expect(res.error.message).toBe("Choose a less predictable PIN");
    }
  });
});

describe("submitSignIn (P1-E12-S04, login 1-2 wiring)", () => {
  it("POSTs to /auth/login with credentials and the phone+PIN payload", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ redirect: "/dashboard" }) }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const res = await submitSignIn({ phone: "+254712345678", pin: "5731" });
    expect(res.ok).toBe(true);

    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toBe("/auth/login");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ phone: "+254712345678", pin: "5731" });
  });

  it("maps invalid-credentials 401 to the generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "Invalid credentials" }) })) as unknown as typeof fetch,
    );
    const res = await submitSignIn({ phone: "+254712345678", pin: "0000" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("Invalid credentials");
  });

  it("falls back to a generic message when the body is unparseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      })) as unknown as typeof fetch,
    );
    const res = await submitSignIn({ phone: "+254712345678", pin: "5731" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("Something went wrong (500)");
  });
});
