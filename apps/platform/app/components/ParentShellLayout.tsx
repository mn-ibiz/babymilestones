import type { ReactNode } from "react";
import { ShellNav } from "./ShellNav";
import { OutstandingBalanceBannerIsland } from "./OutstandingBalanceBannerIsland";
import { FeedbackPromptIsland } from "./FeedbackPromptIsland";

/**
 * `ParentShellLayout` (P1-E11-S05) — the mobile-first chrome for the authed
 * parent dashboard. A server component: it ships no JS itself; the only client
 * code is the small {@link ShellNav} island that highlights the active tab.
 *
 * Responsive layout (AC1), one DOM, no viewport JS branching:
 * - Mobile: content scrolls above a fixed 4-tab bottom nav.
 * - Desktop (`md+`): a fixed left sidebar; the bottom nav is hidden.
 *
 * Keeping the shell on the server + a single tiny client island holds initial
 * JS well under the 200 KB budget (AC3).
 */
export function ParentShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-ink/10 p-4 md:block">
        <div className="mb-6 px-3 text-base font-semibold text-brand">
          Baby Milestones
        </div>
        <ShellNav variant="sidebar" />
      </aside>

      {/* Main content. Left-padded for the sidebar on desktop, bottom-padded for
          the tab bar on mobile so content is never hidden behind the nav. */}
      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-4 md:max-w-3xl md:pb-8 md:pl-60">
        {/* P2-E07-S01: the outstanding-balance nudge sits above page content on
            every parent page; it renders nothing while the balance is settled. */}
        <OutstandingBalanceBannerIsland />
        {/* P6-E04-S01 (Story 34.1): a 0–5 rating prompt for the parent's next
            pending paid touchpoint; renders nothing when nothing is pending. */}
        <FeedbackPromptIsland />
        {children}
      </main>

      {/* Mobile bottom nav */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink/10 bg-surface md:hidden">
        <ShellNav variant="bottom" />
      </div>
    </div>
  );
}
