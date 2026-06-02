import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OnlineOrders } from "../../components/OnlineOrders";
import { resolvePrincipal } from "../../../lib/session-context";
import { guardPosAccess } from "../../../lib/pos-access";

/**
 * The POS "Online orders" tab (Story 29.1 / P4-E04-S01 AC1). A SERVER component
 * that resolves the API-attested principal and role-gates the surface to the
 * till-facing roles (same gate as the sale screen). The client island
 * (`OnlineOrders`) reads orders STRICTLY from the local `wc_orders` mirror via the
 * API (AC5) — the page itself never calls Woo. The API re-authorises the read.
 */
export default async function OnlineOrdersPage() {
  const principal = resolvePrincipal(await headers());
  if (!guardPosAccess(principal?.role ?? "").ok) {
    redirect("/forbidden");
  }
  return <OnlineOrders />;
}
