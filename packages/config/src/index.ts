/** Brand design tokens — the source of truth for the Tailwind preset (X7-S01). */
export const tokens = {
  color: {
    brand: "#FF6B9D",
    ink: "#1A1A2E",
    surface: "#FFFFFF",
  },
  radius: { md: "0.5rem" },
} as const;

export const tailwindPreset = {
  theme: {
    extend: {
      colors: { brand: tokens.color.brand, ink: tokens.color.ink },
      borderRadius: { md: tokens.radius.md },
    },
  },
} as const;
