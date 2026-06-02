/**
 * Parent-dashboard outstanding-banner gating (P2-E07-S01). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM. The banner island reads the
 * authed parent's wallet overview and maps it through here to the single number
 * the `OutstandingBalanceBanner` compound needs: a positive value renders the
 * nudge (AC1), zero hides it (AC3). A failed wallet read fails quiet — we never
 * block a page behind a banner — by reporting nothing owed.
 */
import type { WalletOverview } from "@bm/contracts";

/** Outstanding cents the dashboard banner should reflect, or 0 when unknown/settled. */
export function bannerOutstandingCents(
  wallet: WalletOverview | null | undefined,
): number {
  return wallet?.outstandingCents ?? 0;
}
