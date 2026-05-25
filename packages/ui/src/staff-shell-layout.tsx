/**
 * `StaffShellLayout` (X7-S03) — the staff/POS surface shell: a titled top bar, a
 * side/top nav of the supplied staff sections, and a content region. Staff nav
 * items are passed in (Reception / Receipts / etc. differ per app), typed via
 * {@link StaffNavItem}; the active item is resolved with the same path rule used
 * by the parent shell. Framework-free anchors keep `@bm/ui` dependency-light.
 */
import * as React from "react";
import { cn } from "./cn.js";

export interface StaffNavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

export interface StaffShellLayoutProps {
  /** Page/section title shown in the top bar. */
  title: string;
  /** Current pathname, used to resolve the active nav item. */
  pathname: string;
  navItems: readonly StaffNavItem[];
  children: React.ReactNode;
  className?: string;
}

/** Active when the path equals the item href or sits beneath it (never a sibling prefix). */
export function isStaffNavActive(item: StaffNavItem, pathname: string): boolean {
  const path = (pathname.split(/[?#]/)[0] ?? "/").replace(/(.)\/$/u, "$1");
  return path === item.href || path.startsWith(item.href + "/");
}

export function StaffShellLayout({
  title,
  pathname,
  navItems,
  children,
  className,
}: StaffShellLayoutProps) {
  return (
    <div className={cn("flex min-h-dvh bg-neutral-50", className)}>
      <nav
        aria-label="Staff navigation"
        className="flex w-48 flex-col gap-1 border-r border-neutral-200 bg-white p-3"
      >
        {navItems.map((item) => {
          const active = isStaffNavActive(item, pathname);
          return (
            <a
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                active
                  ? "bg-primary-50 font-medium text-primary-700"
                  : "text-neutral-600 hover:bg-neutral-100",
              )}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-neutral-200 bg-white px-4 py-3">
          <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
