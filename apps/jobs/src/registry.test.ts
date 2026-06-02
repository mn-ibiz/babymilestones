import { expect, it } from "vitest";
import { register, registered, schedule } from "./registry.js";

it("registers a job by name", () => {
  register({ name: "smoke", run: async () => {} });
  expect(registered()).toContain("smoke");
});

it("surfaces max-attempts in the public descriptor (28-3 AC2)", () => {
  register({ name: "retry-demo", cron: "0 2 1 * *", maxAttempts: 3, run: async () => {} });
  const desc = schedule().find((d) => d.name === "retry-demo");
  expect(desc).toBeDefined();
  expect(desc!.cron).toBe("0 2 1 * *");
  expect(desc!.maxAttempts).toBe(3);
});

it("defaults max-attempts to 1 when not declared", () => {
  register({ name: "single-shot", run: async () => {} });
  const desc = schedule().find((d) => d.name === "single-shot");
  expect(desc!.maxAttempts).toBe(1);
});
