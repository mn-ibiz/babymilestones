import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TillHeader } from "../components/TillHeader";
import { ViewportGuard } from "../components/ViewportGuard";
import { resolvePrincipal } from "../../lib/session-context";
import { guardPosAccess, surfaceLabel } from "../../lib/pos-access";

/**
 * POS till shell (P2-E04-S01 AC2/AC3). A SERVER component: it resolves the
 * API-attested principal, role-gates the whole surface to the till-facing
 * roles (`guardPosAccess`), and on denial short-circuits to the 403 page. The
 * edge `middleware.ts` already bounced anonymous visitors to /login; this is
 * the role gate. The API re-authorises every action regardless.
 *
 * The shell is tablet-first (`pos-shell`, landscape >= 768px — AC3); the
 * cashier lands straight on the sale screen rendered as `children`.
 */
export default async function PosShellLayout({ children }: { children: ReactNode }) {
  const principal = resolvePrincipal(await headers());
  const role = principal?.role ?? "";
  if (!guardPosAccess(role).ok) {
    redirect("/forbidden");
  }

  return (
    <div className="pos-shell">
      <TillHeader operatorName={principal?.name ?? ""} surface={surfaceLabel(role)} />
      <main className="flex-1">
        <ViewportGuard>{children}</ViewportGuard>
      </main>
    </div>
  );
}
