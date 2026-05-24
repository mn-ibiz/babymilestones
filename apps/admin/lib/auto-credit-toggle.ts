/**
 * Per-parent auto-credit toggle UI logic (P1-E03-S07). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM and never pulls server-only
 * code into the Next bundle. The parent-header toggle component consumes this to
 * decide whether the control is actionable.
 *
 * AC2: Reception sees the toggle on the parent header but CANNOT flip it — only
 * `admin` and `super_admin` may (they hold `manage wallet`; reception/cashier
 * hold only `read wallet`). The server (`PATCH /admin/parents/:id/auto-credit`)
 * is the source of truth and re-checks the permission; this only drives the
 * client-side enabled/disabled rendering so the affordance matches the grant.
 */

/** Roles permitted to flip the auto-credit toggle (mirrors `manage wallet`). */
export const AUTO_CREDIT_TOGGLE_ROLES = ["admin", "super_admin"] as const;

/** True when the role may FLIP the toggle (not merely view it). */
export function canToggleAutoCredit(role: string): boolean {
  return (AUTO_CREDIT_TOGGLE_ROLES as readonly string[]).includes(role);
}

/** The rendered view-state of the parent-header auto-credit control. */
export interface AutoCreditToggleViewState {
  /** Current value of `wallets.auto_credit_enabled` for this parent. */
  checked: boolean;
  /** False for non-admin roles → the control renders disabled (AC2). */
  actionable: boolean;
  /** Short helper text explaining why a viewer cannot flip it. */
  hint: string;
}

/**
 * Compute how the parent-header toggle should render for a given viewer role and
 * the parent's current flag. Non-admins get a disabled, read-only control (AC2).
 */
export function autoCreditToggleViewState(
  role: string,
  currentValue: boolean,
): AutoCreditToggleViewState {
  const actionable = canToggleAutoCredit(role);
  return {
    checked: currentValue,
    actionable,
    hint: actionable
      ? "Allow this parent to check in on credit without prepayment."
      : "Only an admin can change auto-credit.",
  };
}
