import { describe, expect, it } from "vitest";
import {
  DEFAULT_POST_AUTH_DEST,
  emptySignIn,
  emptySignUp,
  mapAuthError,
  normalizePhoneInput,
  resolvePostAuthDest,
  signInHref,
  signUpHref,
  validateSignIn,
  validateSignUp,
  type SignInDraft,
  type SignUpDraft,
} from "./auth-form.js";

const signIn = (over: Partial<SignInDraft> = {}): SignInDraft => ({ ...emptySignIn, ...over });
const signUp = (over: Partial<SignUpDraft> = {}): SignUpDraft => ({ ...emptySignUp, ...over });

describe("normalizePhoneInput (P1-E12-S04 AC3, mirrors @bm/auth)", () => {
  it("accepts canonical +2547 numbers", () => {
    expect(normalizePhoneInput("+254712345678")).toBe("+254712345678");
  });
  it("normalises local 07 numbers", () => {
    expect(normalizePhoneInput("0712345678")).toBe("+254712345678");
  });
  it("strips whitespace", () => {
    expect(normalizePhoneInput(" 0712 345 678 ")).toBe("+254712345678");
  });
  it("rejects malformed numbers", () => {
    expect(normalizePhoneInput("12345")).toBeNull();
    expect(normalizePhoneInput("+1234567890")).toBeNull();
    expect(normalizePhoneInput("")).toBeNull();
  });
});

describe("validateSignIn (mirrors login 1-2 input gate)", () => {
  it("requires a valid phone", () => {
    expect(validateSignIn(signIn({ phone: "nope", pin: "5731" })).phone).toBe(
      "Enter a valid Kenyan phone number",
    );
  });
  it("requires a 4-digit PIN", () => {
    expect(validateSignIn(signIn({ phone: "0712345678", pin: "12" })).pin).toBe("PIN must be 4 digits");
  });
  it("passes a well-formed credential pair", () => {
    expect(validateSignIn(signIn({ phone: "0712345678", pin: "5731" }))).toEqual({});
  });
});

describe("validateSignUp (mirrors signup 1-1 input gate + ordering)", () => {
  it("requires a valid phone", () => {
    expect(validateSignUp(signUp({ phone: "x", pin: "5731", pinConfirm: "5731" })).phone).toBe(
      "Enter a valid Kenyan phone number",
    );
  });
  it("requires a 4-digit PIN", () => {
    expect(validateSignUp(signUp({ phone: "0712345678", pin: "12", pinConfirm: "12" })).pin).toBe(
      "PIN must be 4 digits",
    );
  });
  it("rejects a weak PIN with the API's message", () => {
    expect(validateSignUp(signUp({ phone: "0712345678", pin: "1234", pinConfirm: "1234" })).pin).toBe(
      "Choose a less predictable PIN",
    );
  });
  it("rejects a non-matching confirmation", () => {
    expect(
      validateSignUp(signUp({ phone: "0712345678", pin: "5731", pinConfirm: "5732" })).pinConfirm,
    ).toBe("PINs do not match");
  });
  it("passes a well-formed, strong, matching signup", () => {
    expect(validateSignUp(signUp({ phone: "0712345678", pin: "5731", pinConfirm: "5731" }))).toEqual({});
  });
});

describe("resolvePostAuthDest (AC2 intended-destination + open-redirect guard)", () => {
  it("honours a same-origin path", () => {
    expect(resolvePostAuthDest("/book/talent")).toBe("/book/talent");
  });
  it("falls back to the dashboard when absent", () => {
    expect(resolvePostAuthDest(null)).toBe(DEFAULT_POST_AUTH_DEST);
    expect(resolvePostAuthDest(undefined)).toBe(DEFAULT_POST_AUTH_DEST);
    expect(resolvePostAuthDest("")).toBe(DEFAULT_POST_AUTH_DEST);
  });
  it("rejects protocol-relative and absolute URLs (open-redirect)", () => {
    expect(resolvePostAuthDest("//evil.com")).toBe(DEFAULT_POST_AUTH_DEST);
    expect(resolvePostAuthDest("https://evil.com")).toBe(DEFAULT_POST_AUTH_DEST);
    expect(resolvePostAuthDest("javascript:alert(1)")).toBe(DEFAULT_POST_AUTH_DEST);
  });
});

describe("signUpHref / signInHref (AC2 carries next through)", () => {
  it("appends an encoded next", () => {
    expect(signUpHref("/book/talent")).toBe("/signup?next=%2Fbook%2Ftalent");
    expect(signInHref("/book/talent")).toBe("/login?next=%2Fbook%2Ftalent");
  });
  it("omits next when absent", () => {
    expect(signUpHref()).toBe("/signup");
    expect(signInHref(null)).toBe("/login");
  });
});

describe("mapAuthError (error display mapping)", () => {
  it("surfaces the API message and field", () => {
    expect(mapAuthError(400, { error: "PIN must be 4 digits", field: "pin" })).toEqual({
      message: "PIN must be 4 digits",
      field: "pin",
    });
  });
  it("steers a duplicate-phone signup to sign-in (1-1 AC2)", () => {
    const mapped = mapAuthError(409, {
      error: "You already have an account — please log in",
      action: "login",
    });
    expect(mapped.redirectToSignIn).toBe(true);
    expect(mapped.message).toBe("You already have an account — please log in");
  });
  it("falls back when the body has no message", () => {
    expect(mapAuthError(500, null).message).toBe("Something went wrong (500)");
  });
});
