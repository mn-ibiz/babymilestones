import { PaystackReturn } from "../../../components/PaystackReturn";

/**
 * Paystack redirect-back page (P1-E04-S04 AC2). Paystack appends the
 * `reference` (and `trxref`) query params when it redirects the payer back after
 * hosted checkout. We pass the reference to the client component, which verifies
 * the transaction and shows "verifying…". The webhook (S05) credits the wallet.
 */
export default async function PaystackReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.reference ?? params.trxref;
  const reference = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);

  return (
    <main>
      <h1>Card top-up</h1>
      <PaystackReturn reference={reference} />
    </main>
  );
}
