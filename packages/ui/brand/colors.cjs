// Brand colour overrides (X7-S04). This is the single place a designer edits to
// re-skin the suite: any key set here is merged over the X7-S01 base tokens
// (packages/config/tokens.cjs) by `makeBrandTokens`, so a brand change
// propagates to the Tailwind preset and every typed token consumer (@bm/ui, apps).
//
// Plain CommonJS so both the .cjs preset layer and the TS brand module consume
// one definition. Empty by default — the base tokens already carry the launch
// brand; add overrides here (e.g. `brand: "#..."`) to re-skin.
module.exports = {
  color: {
    // Example (currently identical to base, kept explicit so the wiring is visible
    // and a swap is a one-line edit):
    brand: "#FF6B9D",
  },
};
