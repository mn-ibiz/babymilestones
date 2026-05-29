import Link from "next/link";
import { PARENT_NAV_ITEMS } from "@bm/ui";

/**
 * Parent dashboard Home (P1-E11-S05). The landing tab of the mobile-first
 * shell: a quick-link grid to the other parent surfaces. A server component —
 * no client JS — so the initial route stays well within the perf budget (AC2/3).
 */
export default function HomePage() {
  const shortcuts = PARENT_NAV_ITEMS.filter((i) => i.key !== "home");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Home</h1>
      <p className="mt-1 text-sm text-ink/60">Welcome back.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {shortcuts.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-lg border border-ink/10 bg-surface p-4 text-ink hover:bg-ink/5"
          >
            <span className="text-base font-medium">{item.label}</span>
          </Link>
        ))}
        {/* Booking entry point (P2-E01-S02) — leads to the bookable-services list. */}
        <Link
          href="/book"
          className="rounded-lg border border-ink/10 bg-surface p-4 text-ink hover:bg-ink/5"
        >
          <span className="text-base font-medium">Book a session</span>
        </Link>
      </div>
    </div>
  );
}
