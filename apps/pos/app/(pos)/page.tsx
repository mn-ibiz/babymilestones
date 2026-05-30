import { headers } from "next/headers";
import { SaleScreen } from "../components/SaleScreen";
import { resolvePrincipal } from "../../lib/session-context";
import { canTakePayment } from "../../lib/pos-access";

/**
 * The sale screen (P2-E04-S01 AC2). This is the cashier's landing surface —
 * `posLanding("cashier")` resolves here ("/"). A SERVER component so it can read
 * the API-attested principal and decide whether this role may take payment:
 * reception/cashier get the full till; a read-only role (packer) gets the same
 * screen with the Pay action disabled rather than a dead-end 403 at checkout.
 */
export default async function SalePage() {
  const principal = resolvePrincipal(await headers());
  return <SaleScreen canTakePayment={canTakePayment(principal?.role ?? "")} />;
}
