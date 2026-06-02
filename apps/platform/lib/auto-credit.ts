/**
 * Parent wallet auto-credit visibility (P2-E07-S03). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM. Maps the authed parent's
 * read-only `wallets.auto_credit_enabled` flag (admin-owned, flipped in
 * P1-E03-S07) onto the exact display copy the wallet page shows:
 *
 * - enabled → "Auto-credit: Enabled by admin" (AC1), no helper text.
 * - disabled → "Auto-credit: Not enabled" (AC1) + helper copy explaining what to
 *   do instead: "Top up before booking to avoid an outstanding balance" (AC2).
 *
 * This is display-only — there is no edit affordance (AC3). A missing wallet
 * reads as not-enabled, the safe default (never imply the parent may overdraw).
 */
import type { WalletOverview } from "@bm/contracts";
import { AUTO_CREDIT_DISABLED_HELP } from "@bm/ui";

/** Read-only auto-credit display model for the wallet page (AC1/AC2). */
export interface AutoCreditStatusViewModel {
  /** Current admin-owned flag (read-only here). */
  enabled: boolean;
  /** Exact status line shown to the parent (AC1). */
  statusLabel: string;
  /** Helper copy shown only when disabled (AC2); `null` when enabled. */
  helperText: string | null;
}

/** Map the wallet overview onto the read-only auto-credit display copy. */
export function autoCreditStatusViewModel(
  wallet: WalletOverview | null | undefined,
): AutoCreditStatusViewModel {
  const enabled = wallet?.autoCreditEnabled ?? false;
  return {
    enabled,
    statusLabel: enabled
      ? "Auto-credit: Enabled by admin"
      : "Auto-credit: Not enabled",
    helperText: enabled ? null : AUTO_CREDIT_DISABLED_HELP,
  };
}
