import { expect, it } from "vitest";
import { tokens } from "./index.js";

it("re-exports brand tokens", () => {
  expect(tokens.color.ink).toBeDefined();
});
