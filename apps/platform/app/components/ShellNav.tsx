"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PARENT_NAV_ITEMS, isNavItemActive } from "@bm/ui";

/**
 * Client navigation for the parent shell (P1-E11-S05). The only client island
 * in the shell: it reads the current pathname to highlight the active tab. The
 * same component renders as the fixed bottom tab bar on mobile and the vertical
 * sidebar list on desktop — layout differences are driven purely by the
 * `variant` prop + Tailwind responsive utilities, so there is no JS branching
 * on viewport. Active-tab logic is the tested pure {@link isNavItemActive}.
 */
export function ShellNav({ variant }: { variant: "bottom" | "sidebar" }) {
  const pathname = usePathname() ?? "/";
  const isBottom = variant === "bottom";

  return (
    <nav
      aria-label="Primary"
      className={
        isBottom
          ? "flex items-stretch justify-around"
          : "flex flex-col gap-1"
      }
    >
      {PARENT_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
            className={
              isBottom
                ? `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs ${
                    active ? "text-brand font-semibold" : "text-ink/60"
                  }`
                : `rounded-md px-3 py-2 text-sm ${
                    active
                      ? "bg-brand/10 text-brand font-semibold"
                      : "text-ink/70 hover:bg-ink/5"
                  }`
            }
          >
            <span aria-hidden="true" data-icon={item.icon} className="block">
              {iconGlyph(item.icon)}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Tiny inline glyph map — avoids pulling an icon library into the bundle (AC3). */
function iconGlyph(icon: string): string {
  switch (icon) {
    case "home":
      return "⌂"; // house
    case "wallet":
      return "◫"; // card-ish
    case "children":
      return "☺"; // smiley
    case "profile":
      return "○"; // person placeholder
    default:
      return "•";
  }
}
