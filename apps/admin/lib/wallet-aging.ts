import {
  walletAgingViewModel,
  walletAgingExportUrl,
  walletAgingParentProfileHref,
  walletAgingQuerySchema,
  type WalletAgingReportDto,
  type WalletAgingViewModel,
} from "@bm/contracts";

/**
 * Admin wallet-aging client logic (P3-E05-S04 / Story 27.4). The
 * `/operations/wallet-aging` admin page reads the financial-reporting-gated
 * `/admin/wallet-aging` API (credentialed — session cookie + CSRF) for the
 * optional `asOf` date and renders the outstanding balances bucketed by age
 * (AC1) with a per-parent row under each bucket that clicks through to that
 * parent's profile/statement (AC2), plus a CSV export link using the same filter
 * (AC3). Framework-free so it unit-tests without React; the bucket / row shaping
 * is reused from `@bm/contracts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** The wallet-aging DTO returned by the admin endpoint. */
export type WalletAgingReport = WalletAgingReportDto;

/** The optional `asOf` filter (`YYYY-MM-DD`). */
export interface WalletAgingFilter {
  asOf?: string;
}

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * Fetch the wallet-aging report from the admin-gated endpoint. Sends the session
 * cookie + CSRF token; throws the server error message on a non-2xx (e.g.
 * 400/401/403).
 */
export async function fetchWalletAging(filter: WalletAgingFilter): Promise<WalletAgingReport> {
  const qs = filter.asOf ? `?${new URLSearchParams({ asOf: filter.asOf }).toString()}` : "";
  const res = await fetch(`${API_BASE}/admin/wallet-aging${qs}`, {
    credentials: "include",
    headers: { "x-csrf-token": readCsrfToken() },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & WalletAgingReport;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Shape the report into render-ready buckets + per-parent rows (AC1/AC2). Delegates to contracts. */
export function walletAgingTiles(dto: WalletAgingReport): WalletAgingViewModel {
  return walletAgingViewModel(dto);
}

/** The CSV export link for the (optional) filter (AC3), against the API base. */
export function walletAgingExportHref(filter: WalletAgingFilter): string {
  return `${API_BASE}${walletAgingExportUrl(filter)}`;
}

/** The parent-profile click-through target for an aging row (AC2). */
export function walletAgingProfileHref(userId: string): string {
  return walletAgingParentProfileHref(userId);
}

/** True when the (optional) filter is a valid selection (drives apply/export). */
export function isValidWalletAgingFilter(filter: WalletAgingFilter): boolean {
  return walletAgingQuerySchema.safeParse(filter).success;
}
