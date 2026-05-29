import { SaleScreen } from "../components/SaleScreen";

/**
 * The sale screen (P2-E04-S01 AC2). This is the cashier's landing surface —
 * `posLanding("cashier")` resolves here ("/"). The scaffold renders the empty
 * "New sale" canvas; product search (S02), the cart (S03), and payment (S04)
 * fill it in subsequent stories.
 */
export default function SalePage() {
  return <SaleScreen />;
}
