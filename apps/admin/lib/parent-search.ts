/**
 * Reception parent-search client logic (P1-E05-S01). Framework-agnostic +
 * dependency-free so it unit-tests without a DOM. The React page
 * (app/reception/page.tsx) wires these to the auto-focused search input.
 *
 *  - `SEARCH_DEBOUNCE_MS` — the 200ms client throttle (AC2). The server
 *    (`GET /reception/parents/search`) is the source of truth; this only limits
 *    request volume while the operator types.
 *  - `shouldSearch` — gate: only query once the trimmed term meets the minimum
 *    length (a single keystroke is too broad).
 *  - `formatCentsKes` / `formatPhoneLast4` — display helpers for the result row.
 *  - `debounce` — a minimal trailing-edge debounce (same shape as walk-in).
 */
import { PARENT_SEARCH_MIN_QUERY } from "@bm/contracts";

/** Client debounce for the live search (AC2): one request per 200ms of quiet. */
export const SEARCH_DEBOUNCE_MS = 200;

/** True once the trimmed query is long enough to query the server. */
export function shouldSearch(query: string): boolean {
  return query.trim().length >= PARENT_SEARCH_MIN_QUERY;
}

/** Format integer cents as a KES money string (e.g. 30000 → "KES 300.00"). */
export function formatCentsKes(cents: number): string {
  return `KES ${(cents / 100).toFixed(2)}`;
}

/** Mask a phone to its last 4 (the result already carries only last-4). */
export function formatPhoneLast4(last4: string): string {
  return `••• ${last4}`;
}

/** Human last-visit label, or a placeholder when never visited. */
export function formatLastVisit(iso: string | null): string {
  if (!iso) return "No visits yet";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "No visits yet" : d.toISOString().slice(0, 10);
}

/**
 * A minimal trailing-edge debounce. Calls fire only after `waitMs` of quiet;
 * each new call resets the timer. `cancel()` drops a pending call (e.g. on
 * unmount). Generic over the wrapped function's args.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Args): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
  wrapped.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return wrapped;
}
