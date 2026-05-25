/**
 * Reconciliation CSV export form logic (P1-E06-S04). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The export page consumes this to validate the
 * date-range picker (AC1) and build the download URL + filename. The server
 * (`GET /treasury/reconciliation/export`) re-validates the range, re-checks the
 * treasury/accountant grant, and audits the export.
 */
import {
  reconciliationExportQuerySchema,
  RECONCILIATION_EXPORT_MAX_DAYS,
  reconciliationExportDayCount,
} from "@bm/contracts";

export interface ExportRangeValues {
  fromDate: string;
  toDate: string;
}

/** Validate the picked range (AC1). Returns an error message, or null when valid. */
export function validateExportRange(values: ExportRangeValues): string | null {
  if (!values.fromDate || !values.toDate) return "Pick a start and end date.";
  const parsed = reconciliationExportQuerySchema.safeParse(values);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Invalid date range.";
}

/** True when the range is a valid, in-bounds selection (drives the button). */
export function canExport(values: ExportRangeValues): boolean {
  return validateExportRange(values) === null;
}

/** The export endpoint URL with the range as query params (AC1). */
export function exportUrl(values: ExportRangeValues): string {
  const params = new URLSearchParams({ fromDate: values.fromDate, toDate: values.toDate });
  return `/treasury/reconciliation/export?${params.toString()}`;
}

/** Suggested download filename for the CSV. */
export function exportFilename(values: ExportRangeValues): string {
  return `reconciliation_${values.fromDate}_to_${values.toDate}.csv`;
}

/** Human label for the picked range size, used as a hint under the picker. */
export function rangeSummary(values: ExportRangeValues): string {
  if (validateExportRange(values) !== null) return "";
  const days = reconciliationExportDayCount(values.fromDate, values.toDate);
  return `${days} day${days === 1 ? "" : "s"} selected (max ${RECONCILIATION_EXPORT_MAX_DAYS}).`;
}
