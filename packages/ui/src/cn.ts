/**
 * `cn` — tiny className combiner. Joins truthy class fragments with a single
 * space and collapses falsy values. No dependency on `clsx`/`tailwind-merge`
 * to keep `@bm/ui` lean; primitives compose deliberate, non-conflicting tokens.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
