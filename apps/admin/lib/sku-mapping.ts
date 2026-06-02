/**
 * Admin SKU-mapping + reconciliation view logic (Story 29.5 / P4-E04-S05).
 * Framework-agnostic + dependency-light so it unit-tests without a DOM and never
 * pulls server-only code into the Next bundle. The catalogue SKU-mapping screen
 * consumes this to:
 *  - gate the management UI to roles holding `manage config` (server re-checks),
 *  - validate a manual `woo_product_id` entry before PATCHing (AC5),
 *  - build the bulk-import body (AC5),
 *  - summarise an import result + a reconciliation report for display (AC5/AC6).
 *
 * The API (`/admin/woocommerce-stock*`) is the source of truth and re-validates
 * + re-runs the permission check; this only shapes input and display.
 */
import type { StockReconciliationReport } from "@bm/contracts";

/** Roles allowed to manage SKU mappings (mirrors `manage config`). Server re-checks. */
const MANAGE_CONFIG_ROLES = new Set<string>(["admin", "super_admin"]);

/** Only admin / super_admin may manage SKU mappings + view reconciliation (AC5/AC6). */
export function canManageSkuMappings(role: string): boolean {
  return MANAGE_CONFIG_ROLES.has(role);
}

/**
 * Parse a manual `woo_product_id` text entry into the PATCH value (AC5): a blank
 * entry clears the mapping (null — back to in-store only); a positive integer
 * maps; anything else is an error.
 */
export function parseWooProductIdEntry(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: "Woo product id must be a positive whole number" };
  }
  return { ok: true, value: n };
}

/** Human summary of a bulk CSV import outcome (AC5). */
export function importSummaryLabel(result: { applied: number; errors: { line: number }[] }): string {
  const errs = result.errors.length;
  return errs === 0
    ? `Imported ${result.applied} mapping(s) — no errors.`
    : `Imported ${result.applied} mapping(s), ${errs} row(s) skipped with errors.`;
}

/** Human summary of a reconciliation report for the admin banner (AC6). */
export function reconciliationSummaryLabel(report: StockReconciliationReport | null): string {
  if (!report) return "No reconciliation has run yet.";
  if (report.drift.length === 0) {
    return `All ${report.comparedCount} mapped SKUs are in sync (as of ${new Date(report.generatedAt).toLocaleString()}).`;
  }
  return `${report.drift.length} of ${report.comparedCount} mapped SKUs have drifted (as of ${new Date(report.generatedAt).toLocaleString()}).`;
}
