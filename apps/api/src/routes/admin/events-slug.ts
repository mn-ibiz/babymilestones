/**
 * Pure slug helpers for events (P4-E05-S01). Framework-free so they unit-test
 * without a DB or HTTP layer.
 */

/** Normalise an arbitrary string into a URL-safe slug base. */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    // strip combining diacritical marks (U+0300–U+036F)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "event";
}

/**
 * Given a desired base and the set of slugs already taken, return a unique
 * slug by appending a numeric suffix (`-2`, `-3`, …) when needed.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base);
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
