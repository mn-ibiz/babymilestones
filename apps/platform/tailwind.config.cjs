/** @type {import('tailwindcss').Config} */
// Extends the shared brand preset (X7-S01) — never redefine tokens here.
module.exports = {
  presets: [require("@bm/config/tailwind.preset.cjs")],
  content: [
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};
