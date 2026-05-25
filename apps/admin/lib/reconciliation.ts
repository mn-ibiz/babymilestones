/**
 * Daily reconciliation screen logic (P1-E06-S02). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The reconciliation page consumes this to render the
 * three-column table (AC1), the red banner (AC2), and the adjusting-entry form
 * with its dual-approval affordances (AC3).
 *
 * The server (`GET /treasury/reconciliation`) computes the system balance, drift,
 * and the banner flag centrally; this only maps that response onto display
 * labels and decides which controls a given viewer role may act on.
 */
import {
  isDrifting,
  type ReconciliationResponse,
  type ReconciliationRow,
} from "@bm/contracts";
import { formatCentsKes } from "./parent-search";

/** Roles that may POST an adjusting entry (admin `manage wallet`, treasury). */
export const ADJUSTMENT_POST_ROLES = ["admin", "super_admin", "treasury"] as const;
/** Roles that may APPROVE an adjustment — treasury only (dual-approval, AC3). */
export const ADJUSTMENT_APPROVE_ROLES = ["treasury", "super_admin"] as const;

/** True when the role may post an adjusting entry (drives the CTA — AC3). */
export function canPostAdjustment(role: string): boolean {
  return (ADJUSTMENT_POST_ROLES as readonly string[]).includes(role);
}

/** True when the role may approve a pending adjustment (AC3). */
export function canApproveAdjustment(role: string): boolean {
  return (ADJUSTMENT_APPROVE_ROLES as readonly string[]).includes(role);
}

/**
 * Whether `viewer` may approve an adjustment posted by `postedBy` (AC3). Enforces
 * dual-approval client-side: an approver must hold the grant AND be a different
 * person from the poster (no self-approval). The server re-checks both.
 */
export function canApprovePosted(
  viewerId: string,
  viewerRole: string,
  postedBy: string,
): boolean {
  return canApproveAdjustment(viewerRole) && viewerId !== postedBy;
}

/** One rendered reconciliation table row (AC1, AC2). */
export interface ReconciliationRowViewModel {
  floatAccountId: string;
  name: string;
  kind: string;
  /** Column 2: system-tracked balance, formatted (e.g. "KES 500.00"). */
  systemLabel: string;
  /** Column 3: real-world balance label, or a placeholder while unentered. */
  realLabel: string;
  /** Drift label (`system − real`), or a placeholder while real is absent. */
  driftLabel: string;
  /** True → render this row's drift red (AC2). */
  driftIsRed: boolean;
}

const UNENTERED = "—";

/** Map one server row onto its display view-model (AC1, AC2). */
export function reconciliationRowViewModel(row: ReconciliationRow): ReconciliationRowViewModel {
  return {
    floatAccountId: row.floatAccountId,
    name: row.name,
    kind: row.kind,
    systemLabel: formatCentsKes(row.systemCents),
    realLabel: row.realCents === null ? UNENTERED : formatCentsKes(row.realCents),
    driftLabel: row.driftCents === null ? UNENTERED : formatCentsKes(row.driftCents),
    driftIsRed: row.driftCents !== null && isDrifting(row.driftCents),
  };
}

/** The rendered reconciliation screen view-model (AC1, AC2). */
export interface ReconciliationViewModel {
  asOf: string;
  rows: ReconciliationRowViewModel[];
  /** True → show the single red drift banner at the top (AC2). */
  showDriftBanner: boolean;
  /** Banner copy when shown, else null. */
  bannerMessage: string | null;
}

/** Map the full server response onto the screen view-model (AC1, AC2). */
export function reconciliationViewModel(res: ReconciliationResponse): ReconciliationViewModel {
  const driftingCount = res.rows.filter((r) => r.isDrifting).length;
  return {
    asOf: res.asOf,
    rows: res.rows.map(reconciliationRowViewModel),
    showDriftBanner: res.hasDrift,
    bannerMessage: res.hasDrift
      ? `${driftingCount} account${driftingCount === 1 ? "" : "s"} drifting beyond KES 100 — investigate before close.`
      : null,
  };
}
