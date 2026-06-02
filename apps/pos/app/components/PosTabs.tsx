import React from "react";

/**
 * POS surface tabs (Story 29.1 / P4-E04-S01 AC1). The in-store "Sale" tab and the
 * new "Online orders" tab side-by-side, so staff sell and watch the website queue
 * from the same screen. A server component (plain links) — large touch targets for
 * in-store taps, mirroring the till header.
 */
const TABS = [
  { href: "/", label: "Sale" },
  { href: "/online-orders", label: "Online orders" },
] as const;

export function PosTabs() {
  return (
    <nav aria-label="POS sections" className="flex gap-1 border-b border-ink/10 bg-surface px-4">
      {TABS.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          className="touch-target inline-flex items-center border-b-2 border-transparent px-4 text-sm font-medium text-ink/70 hover:text-ink"
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
