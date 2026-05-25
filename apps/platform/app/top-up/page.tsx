import { TopUpForm } from "../components/TopUpForm";
import { PaystackTopUpForm } from "../components/PaystackTopUpForm";
import { BankTransferInstructions } from "../components/BankTransferInstructions";

/**
 * Parent dashboard top-up page (P1-E11-S03; reuses P1-E04-S01, P1-E04-S04).
 * Offers three rails the wallet method picker hands off to: M-Pesa STK push
 * (prompt on the phone, AC1), Paystack card checkout (Visa/Mastercard via hosted
 * checkout, AC2 — the card option exists because Stripe isn't available in
 * Kenya), and bank transfer (out-of-band, admin-confirmed instructions, AC3).
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

      <section aria-labelledby="bank-heading">
        <h2 id="bank-heading">Pay by bank transfer</h2>
        <p>Send the money to our bank account; an admin will confirm and credit your wallet.</p>
        <BankTransferInstructions />
      </section>
    </main>
  );
}
