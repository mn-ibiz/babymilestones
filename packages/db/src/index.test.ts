import { expect, it } from "vitest";
import { SCHEMA_VERSION } from "./index.js";

it("exposes a schema version", () => {
  expect(SCHEMA_VERSION).toBe("0.0.0");
});
