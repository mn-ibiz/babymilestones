import { describe, expect, it } from "vitest";
import { logger } from "./logger.js";

describe("jobs logger", () => {
  it("is a structured logger tagged with the jobs service", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.child).toBe("function");
    // The bindings carry the service name used on every emitted JSON line.
    expect(logger.bindings().service).toBe("jobs");
  });
});
