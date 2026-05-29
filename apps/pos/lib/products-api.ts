import type { PosProduct } from "@bm/contracts";

/**
 * POS catalogue read wiring (P2-E04-S02). Calls the API with `credentials:
 * "include"` so the SSO session cookie rides along. Both endpoints are GET +
 * read-only — no CSRF. The API is the authority on the role gate.
 */

/**
 * Look a product up by exact SKU or barcode (AC1). Returns null when no match,
 * on any non-OK response, or on a network failure — the scan path treats all of
 * these as "no product" rather than throwing into the component.
 */
export async function lookupProductByCode(code: string): Promise<PosProduct | null> {
  try {
    const res = await fetch(`/pos/products/lookup?code=${encodeURIComponent(code)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { product?: PosProduct | null } | null;
    return body?.product ?? null;
  } catch {
    return null;
  }
}

/** Search products by name (AC2). Returns [] on any non-OK response or network failure. */
export async function searchProducts(query: string): Promise<PosProduct[]> {
  try {
    const res = await fetch(`/pos/products/search?q=${encodeURIComponent(query)}`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => null)) as { products?: PosProduct[] } | null;
    return body?.products ?? [];
  } catch {
    return [];
  }
}
