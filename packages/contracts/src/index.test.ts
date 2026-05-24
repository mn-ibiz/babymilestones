import { describe, expect, it } from "vitest";
import { phoneSchema } from "./index.js";

describe("phoneSchema", () => {
  it("accepts a normalised Kenyan phone", () => {
    expect(phoneSchema.safeParse("+254712345678").success).toBe(true);
  });
  it("rejects an un-normalised phone", () => {
    expect(phoneSchema.safeParse("0712345678").success).toBe(false);
  });
});
