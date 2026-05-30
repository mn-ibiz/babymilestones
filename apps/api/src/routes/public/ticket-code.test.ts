import { describe, it, expect } from "vitest";
import { generateTicketCode } from "./ticket-code.js";

describe("generateTicketCode (Epic 30)", () => {
  it("emits a TK-prefixed code of fixed length", () => {
    const code = generateTicketCode();
    expect(code).toMatch(/^TK-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  });

  it("avoids ambiguous characters (0,1,I,L,O,U)", () => {
    for (let i = 0; i < 200; i += 1) {
      const body = generateTicketCode().slice(3);
      expect(body).not.toMatch(/[01ILOU]/);
    }
  });

  it("is overwhelmingly unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) seen.add(generateTicketCode());
    expect(seen.size).toBe(2000);
  });
});
