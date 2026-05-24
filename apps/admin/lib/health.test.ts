import { expect, it } from "vitest";
import { appName, healthy } from "./health.js";

it("is healthy and named", () => {
  expect(healthy()).toBe(true);
  expect(appName).toBe("Admin");
});
