import { TopUpForm } from "../components/TopUpForm";

/**
 * Parent dashboard top-up page (P1-E04-S01). Renders the M-Pesa STK push form:
 * enter an amount, tap "Pay with M-Pesa", approve on the phone. The form handles
 * the "Check your phone…" indicator and live status polling.
 */
export default function TopUpPage() {
  return (
    <main>
      <h1>Top up your wallet</h1>
      <p>Pay via M-Pesa — you&apos;ll get a prompt on your phone to approve.</p>
      <TopUpForm />
    </main>
  );
}
