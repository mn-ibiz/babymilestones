import { defineConfig } from "vitest/config";

// The API suite is large and each test boots an in-memory PGlite (WASM) instance.
// Under turbo's parallel task running the CPU is saturated, so the default 5s
// per-test timeout can flake. Give tests and hooks generous headroom.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
