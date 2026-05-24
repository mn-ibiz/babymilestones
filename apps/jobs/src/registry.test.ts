import { expect, it } from "vitest";
import { register, registered } from "./registry.js";

it("registers a job by name", () => {
  register({ name: "smoke", run: async () => {} });
  expect(registered()).toContain("smoke");
});
