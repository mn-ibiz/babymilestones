import { expect, it } from "vitest";
import { PACKAGE } from "./index.js";

it("identifies itself", () => {
  expect(PACKAGE).toBe("@bm/auth");
});
