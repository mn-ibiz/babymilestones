/**
 * Reception parent-header view logic (P1-E05-S02). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The `<ParentHeader parent={parent}/>` component
 * consumes this to render all the financial facts in one row: name, full phone,
 * wallet balance, outstanding (red when > 0 — AC1), and the admin-only
 * auto-credit toggle.
 *
 * The server (`GET /reception/parents/:userId/profile`) is the source of truth;
 * this only maps that summary onto display labels. "No stale state" (AC2) is a
 * data-fetching concern handled by the page (refetch/invalidate after every
 * action) — this pure mapper just renders whatever summary it is handed.
 */
import { isOutstanding, type ParentProfileSummary } from "@bm/contracts";
import { formatCentsKes } from "./parent-search";
import { autoCreditToggleViewState, type AutoCreditToggleViewState } from "./auto-credit-toggle";

/** The rendered header view-model derived from a profile summary + viewer role. */
export interface ParentHeaderViewModel {
  fullName: string;
  /** Full normalised phone — the focused header shows it whole (unlike the list). */
  phone: string;
  /** Formatted wallet balance, e.g. "KES 300.00". */
  balanceLabel: string;
  /** Formatted outstanding amount, e.g. "KES 75.00". */
  outstandingLabel: string;
  /** True when the parent owes money (> 0) → render the amount red (AC1). */
  outstandingIsRed: boolean;
  /** Auto-credit control state: checked + whether this viewer may flip it (AC1). */
  autoCredit: AutoCreditToggleViewState;
}

/** Map a profile summary + viewer role onto the header's display view-model. */
export function parentHeaderViewModel(
  summary: ParentProfileSummary,
  viewerRole: string,
): ParentHeaderViewModel {
  return {
    fullName: `${summary.firstName} ${summary.lastName}`.trim(),
    phone: summary.phone,
    balanceLabel: formatCentsKes(summary.walletBalanceCents),
    outstandingLabel: formatCentsKes(summary.outstandingCents),
    outstandingIsRed: isOutstanding(summary.outstandingCents),
    autoCredit: autoCreditToggleViewState(viewerRole, summary.autoCreditEnabled),
  };
}
