import { describe, expect, it } from "vitest";
import { parseCsrfCookie } from "./csrf.js";

describe("parseCsrfCookie (P2-E04-S01 — double-submit token)", () => {
  it("extracts the bm_csrf value", () => {
    expect(parseCsrfCookie("bm_csrf=abc123")).toBe("abc123");
  });

  it("finds it among other cookies", () => {
    expect(parseCsrfCookie("bm_session=zzz; bm_csrf=tok-9; theme=dark")).toBe("tok-9");
  });

  it("url-decodes the value", () => {
    expect(parseCsrfCookie("bm_csrf=a%2Fb%3D")).toBe("a/b=");
  });

  it("returns empty string when absent", () => {
    expect(parseCsrfCookie("bm_session=zzz")).toBe("");
    expect(parseCsrfCookie("")).toBe("");
  });

  it("does not match a cookie that merely contains the name", () => {
    expect(parseCsrfCookie("not_bm_csrf=nope")).toBe("");
  });
});
