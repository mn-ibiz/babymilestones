import { describe, expect, it } from "vitest";
import {
  resolvePrincipal,
  ROLE_HEADER,
  USER_ID_HEADER,
  USER_NAME_HEADER,
} from "./session-context.js";

function bag(map: Record<string, string>): { get(n: string): string | null } {
  return { get: (n: string) => map[n] ?? null };
}

describe("resolvePrincipal (P1-E10-S01)", () => {
  it("reads the API-attested principal headers", () => {
    const p = resolvePrincipal(
      bag({
        [USER_ID_HEADER]: "u1",
        [USER_NAME_HEADER]: "Jane Mwangi",
        [ROLE_HEADER]: "admin",
      }),
    );
    expect(p).toEqual({ id: "u1", name: "Jane Mwangi", role: "admin" });
  });

  it("returns null when no role header is present", () => {
    expect(resolvePrincipal(bag({}))).toBeNull();
    expect(resolvePrincipal(bag({ [ROLE_HEADER]: "  " }))).toBeNull();
  });

  it("defaults a missing id/name without failing", () => {
    const p = resolvePrincipal(bag({ [ROLE_HEADER]: "treasury" }));
    expect(p).toEqual({ id: "unknown", name: "", role: "treasury" });
  });
});
