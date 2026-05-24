import { expect, it } from "vitest";
import { tokens } from "./index.js";

it("exposes brand tokens", () => {
  expect(tokens.color.brand).toMatch(/^#/u);
});
