import { cookies } from "next/headers";
import { fetchLoyaltyAccount } from "../../../lib/loyalty-api";
import { formatKes, formatPoints, toLoyaltyHistoryView } from "../../../lib/loyalty";

export const dynamic = "force-dynamic";

/**
 * Loyalty page (P2-E05-S04). Server component: reads the session cookie, fetches
 * the loyalty account, and renders the points balance + lifetime earned/redeemed
 * (AC1) and an earn/redeem history list with source labels (AC2).
 */
export default async function LoyaltyPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  let account: Awaited<ReturnType<typeof fetchLoyaltyAccount>>;
  try {
    account = await fetchLoyaltyAccount(cookieHeader);
  } catch {
    return (
      <main className="p-4">
        <p className="text-red-600">Could not load your loyalty points right now.</p>
      </main>
    );
  }

  const history = account.history.map(toLoyaltyHistoryView);

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Loyalty points</h1>

      {/* AC1 — balance + lifetime earned/redeemed */}
      <section className="mt-4 rounded-lg border p-4">
        <p className="text-sm text-slate-500">Points balance</p>
        <p className="text-2xl font-bold">{formatPoints(account.balance)}</p>
        <p className="mt-1 text-sm text-slate-500">
          Worth {formatKes(account.quote.maxDiscountCents)} at checkout
        </p>
        <dl className="mt-3 flex gap-6 text-sm">
          <div>
            <dt className="text-slate-500">Lifetime earned</dt>
            <dd className="font-medium">{formatPoints(account.lifetimeEarned)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Lifetime redeemed</dt>
            <dd className="font-medium">{formatPoints(account.lifetimeRedeemed)}</dd>
          </div>
        </dl>
      </section>

      {/* AC2 — earn/redeem history with source labels */}
      <section className="mt-4">
        <h2 className="text-sm font-medium text-slate-600">History</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No points activity yet.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2">
                <span>
                  <span className="block">{h.label}</span>
                  <span className="block text-xs text-slate-500">{h.date}</span>
                </span>
                <span className={h.direction === "earn" ? "text-green-600" : "text-amber-700"}>
                  {h.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
