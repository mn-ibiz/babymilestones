// Shared Tailwind preset (X7-S01). Every app extends this; tokens are defined once
// in tokens.cjs so a single swap re-skins the entire suite (AC3).
const tokens = require("./tokens.cjs");

/** Build a Tailwind preset from a token set. Exposed so token swaps are testable. */
function makePreset(t = tokens) {
  return {
    theme: {
      extend: {
        colors: {
          primary: t.color.primary,
          neutral: t.color.neutral,
          success: t.color.success,
          warn: t.color.warn,
          danger: t.color.danger,
          brand: t.color.brand,
          ink: t.color.ink,
          surface: t.color.surface,
        },
        spacing: t.spacing,
        borderRadius: t.radius,
        fontSize: t.fontSize,
      },
    },
  };
}

module.exports = makePreset();
module.exports.makePreset = makePreset;
module.exports.tokens = tokens;
