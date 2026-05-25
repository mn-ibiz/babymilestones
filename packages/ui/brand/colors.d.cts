/** Brand colour overrides (X7-S04) — partial token colour map merged over base. */
export interface BrandColorConfig {
  color?: Record<string, unknown>;
}

declare const config: BrandColorConfig;
export default config;
