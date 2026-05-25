import { defineConfig } from "vitest/config";

// React primitives (X7-S02) render into the DOM, so the UI suite runs under
// jsdom with Testing Library's custom matchers loaded via the setup file.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
