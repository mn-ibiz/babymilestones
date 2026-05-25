import type { NavItem } from "../lib/nav";

/**
 * Server-rendered side nav (P1-E10-S01 AC1). Receives the already-filtered nav
 * items (`visibleNavFor(role)` in the layout) — this is a pure presentational
 * component with NO client-side filtering, so the role gate cannot be bypassed
 * by inspecting/altering client state.
 */
export function SideNav({ items }: { items: readonly NavItem[] }) {
  return (
    <nav aria-label="Admin sections">
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
