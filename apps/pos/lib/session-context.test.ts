import { describe, expect, it } from "vitest";
import {
  ROLE_HEADER,
  USER_ID_HEADER,
  USER_NAME_HEADER,
  resolvePrincipal,
} from "./session-context.js";

function bag(entries: Record<string, string>) {
  return { get: (name: string) => entries[name] ?? null };
}

describe("POS session context (P2-E04-S01)", () => {
  it("resolves the API-attested principal from headers", () => {
    const principal = resolvePrincipal(
      bag({
        [USER_ID_HEADER]: "u-1",
        [USER_NAME_HEADER]: "Asha",
        [ROLE_HEADER]: "cashier",
      }),
    );
    expect(principal).toEqual({ id: "u-1", name: "Asha", role: "cashier" });
  });

  it("returns null when no role is attested (defensive)", () => {
    expect(resolvePrincipal(bag({}))).toBeNull();
  });

  it("trims whitespace and defaults missing id/name", () => {
    const principal = resolvePrincipal(bag({ [ROLE_HEADER]: " cashier " }));
    expect(principal).toEqual({ id: "unknown", name: "", role: "cashier" });
  });
});
