import { TopUpForm } from "../components/TopUpForm";
import { PaystackTopUpForm } from "../components/PaystackTopUpForm";

/**
 * Parent dashboard top-up page (P1-E04-S01, P1-E04-S04). Offers two rails:
 * M-Pesa STK push (prompt on the phone) and Paystack card checkout (Visa/
 * Mastercard via hosted checkout). The card option exists because Stripe isn't
 * available in Kenya.
 */
export default function TopUpPage() {
  return (
    <main>
      <h1>Top up your wallet</h1>

      <section aria-labelledby="mpesa-heading">
        <h2 id="mpesa-heading">Pay with M-Pesa</h2>
        <p>You&apos;ll get a prompt on your phone to approve.</p>
        <TopUpForm />
      </section>

      <section aria-labelledby="card-heading">
        <h2 id="card-heading">Pay with card</h2>
        <p>Top up by Visa or Mastercard via Paystack.</p>
        <PaystackTopUpForm />
      </section>
    </main>
  );
}
