import type { ReactNode } from "react";
import { headers } from "next/headers";
import { SideNav } from "../../components/side-nav";
import { HeaderBar } from "../../components/header-bar";
import { visibleNavFor, headerViewModel } from "../../lib/nav";
import { resolvePrincipal } from "../../lib/session-context";
import { fetchFloatStatus } from "../../lib/float-status";

/**
 * Admin console shell (P1-E10-S01 AC1/AC3). A SERVER component: it resolves the
 * signed-in principal from the API-attested request headers, filters the nav
 * against that role's permission set server-side (no client filter — AC1), and
 * renders the header with the user, role badge, float dot, and logout (AC3).
 *
 * Per-route 403 gating (AC2) is enforced by each segment via `lib/guard.ts`
 * (`guardRoute`) which short-circuits to `/forbidden`; the edge middleware
 * already bounced anonymous visitors to /login.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const principal = resolvePrincipal(await headers());

  // Defensive: middleware guarantees a session, but if no role is attested we
  // render an empty shell rather than leaking nav for an unknown principal.
  const navItems = principal ? visibleNavFor(principal.role) : [];
  const floatStatus = await fetchFloatStatus();
  const vm = principal
    ? headerViewModel(principal, floatStatus)
    : headerViewModel({ id: "", name: "", role: "" }, floatStatus);

  return (
    <div data-console-shell>
      <HeaderBar vm={vm} />
      <div style={{ display: "flex" }}>
        <SideNav items={navItems} />
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}
