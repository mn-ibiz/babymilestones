import type { WalletOverview } from "@bm/contracts";
import { walletHeroViewModel } from "../../lib/wallet";

/**
 * `WalletBalanceCard` — the wallet hero (P1-E11-S01 AC1). Large balance, a
 * smaller outstanding indicator shown only when the parent owes money (> 0), and
 * a read-only auto-credit status (admin flips it elsewhere — never editable
 * here). Renders identically to the admin Reception header by reading the same
 * balance/outstanding/auto-credit facts through {@link walletHeroViewModel}.
 * Mobile-first: a single stacked card.
 */
export function WalletBalanceCard({ wallet }: { wallet: WalletOverview }) {
  const vm = walletHeroViewModel(wallet);
  return (
    <section aria-label="Wallet balance">
      <p>Wallet balance</p>
      <p>
        <strong>{vm.balanceLabel}</strong>
      </p>
      {vm.showOutstanding && (
        <p role="status">
          Outstanding: <strong>{vm.outstandingLabel}</strong>
        </p>
      )}
      <p>
        Auto-credit: <span>{vm.autoCreditLabel}</span> <small>(set by staff)</small>
      </p>
      <p>
        Loyalty points: <span>{vm.loyaltyLabel}</span>
      </p>
    </section>
  );
}
