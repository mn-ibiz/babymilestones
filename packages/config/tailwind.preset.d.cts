type Shades = Record<string, string>;

export interface Tokens {
  color: {
    primary: Shades;
    neutral: Shades;
    success: string;
    warn: string;
    danger: string;
    brand: string;
    ink: string;
    surface: string;
  };
  spacing: Record<string, string>;
  radius: Record<string, string>;
  fontSize: Record<string, string>;
}

export interface Preset {
  theme: {
    extend: {
      colors: {
        primary: Shades;
        neutral: Shades;
        success: string;
        warn: string;
        danger: string;
        brand: string;
        ink: string;
        surface: string;
      };
      spacing: Record<string, string>;
      borderRadius: Record<string, string>;
      fontSize: Record<string, string>;
    };
  };
}

export const tokens: Tokens;
export function makePreset(t?: Tokens): Preset;

declare const preset: Preset;
export default preset;
