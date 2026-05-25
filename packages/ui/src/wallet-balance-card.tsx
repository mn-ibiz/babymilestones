/**
 * `WalletBalanceCard` (X7-S03) — the load-bearing parent-dashboard wallet hero.
 *
 * A compound component composed from the X7-S01 brand tokens (no ad-hoc hex):
 * balance, outstanding (flagged with the `danger` token when owed, via the
 * shared {@link isOutstanding} rule from `@bm/contracts`), read-only auto-credit
 * status, and the loyalty-points balance. Props are the typed
 * {@link WalletOverview} from `@bm/contracts` — no locally redefined shapes.
 * Money is integer cents, formatted to KES at the edge with {@link formatKes}.
 */
import * as React from "react";
import { isOutstanding, type WalletOverview } from "@bm/contracts";
import { cn } from "./cn.js";
import { formatKes } from "./money.js";

export interface WalletBalanceCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  wallet: WalletOverview;
}

export const WalletBalanceCard = React.forwardRef<
  HTMLDivElement,
  WalletBalanceCardProps
>(function WalletBalanceCard({ wallet, className, ...rest }, ref) {
  const owes = isOutstanding(wallet.outstandingCents);
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm",
        className,
      )}
      {...rest}
    >
      <div className="text-sm font-medium text-neutral-500">Wallet balance</div>
      <div className="mt-1 text-3xl font-semibold text-neutral-900">
        {formatKes(wallet.balanceCents)}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-neutral-500">Outstanding</dt>
          <dd
            data-testid="wallet-outstanding"
            className={cn(
              "text-lg font-medium",
              owes ? "text-danger" : "text-neutral-900",
            )}
          >
            {formatKes(wallet.outstandingCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Loyalty points</dt>
          <dd className="text-lg font-medium text-neutral-900">
            {wallet.loyaltyPoints}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-neutral-500">
        Auto top-up {wallet.autoCreditEnabled ? "on" : "off"}
      </p>
    </div>
  );
});
