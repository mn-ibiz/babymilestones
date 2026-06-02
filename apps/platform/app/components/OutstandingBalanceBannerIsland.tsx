"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OutstandingBalanceBanner } from "@bm/ui";
import { fetchWalletOverview } from "../../lib/wallet-api";
import { bannerOutstandingCents } from "../../lib/outstanding-banner";

/**
 * Outstanding-balance banner island (P2-E07-S01). The single client island the
 * banner needs: it reads the authed parent's wallet overview and renders the
 * `@bm/ui` {@link OutstandingBalanceBanner} once in the parent shell so it shows
 * on every dashboard page (AC1). It refetches on navigation and when the tab
 * regains focus, so once a top-up settles the balance the banner clears itself
 * (AC3). A failed read fails quiet — the banner stays hidden, never blocking a page.
 */
export function OutstandingBalanceBannerIsland() {
  const [outstandingCents, setOutstandingCents] = useState(0);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    fetchWalletOverview()
      .then((wallet) => setOutstandingCents(bannerOutstandingCents(wallet)))
      .catch(() => setOutstandingCents(bannerOutstandingCents(null)));
  }, []);

  // Refetch on mount and on every in-app navigation so the amount stays current
  // and the banner disappears the moment the balance is settled (AC3).
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  // Also refresh when the tab regains focus (e.g. after approving an M-Pesa STK
  // prompt on the phone), so a settlement made elsewhere clears the banner.
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return (
    <OutstandingBalanceBanner outstandingCents={outstandingCents} className="mb-4" />
  );
}
