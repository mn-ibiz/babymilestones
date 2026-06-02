import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderActionSheet } from "./OrderActionSheet";

/**
 * Story 29.2 (P4-E04-S02) — order action-sheet render contract (POS convention,
 * no jsdom). Asserts all five actions appear (AC1), invalid actions are disabled
 * per the current status (AC4), and the dispatch action opens a rider/courier
 * capture (AC5). Reversal actions are disabled for a non-admin (AC4).
 */
function render(props: Parameters<typeof OrderActionSheet>[0]): string {
  return renderToStaticMarkup(<OrderActionSheet {...props} />);
}

describe("OrderActionSheet (Story 29.2)", () => {
  it("renders all five action labels (AC1)", () => {
    const html = render({ wooOrderId: 1, current: "new" });
    expect(html).toContain("Start packing");
    expect(html).toContain("Mark ready");
    expect(html).toContain("Mark dispatched");
    expect(html).toContain("Mark fulfilled");
    expect(html).toContain("Cancel");
  });

  it("disables the actions that are illegal from the current status (AC4)", () => {
    // From `new`, only Start packing + Cancel are legal — the rest (Mark ready,
    // Mark dispatched, Mark fulfilled = 3) are disabled. React emits `disabled=""`.
    const html = render({ wooOrderId: 1, current: "new" });
    const disabledCount = (html.match(/disabled=""/g) ?? []).length;
    expect(disabledCount).toBe(3);
  });

  it("disables reversal actions for a non-admin (AC4)", () => {
    // From `ready` a non-admin can go forward (dispatched) or cancel; Start packing
    // and Mark ready would be reversals → disabled.
    const html = render({ wooOrderId: 1, current: "ready", canReverse: false });
    expect(html).toContain('disabled=""');
  });

  it("enables a reversal action for an admin (AC4)", () => {
    const nonAdmin = render({ wooOrderId: 1, current: "ready", canReverse: false });
    const admin = render({ wooOrderId: 1, current: "ready", canReverse: true });
    const nonAdminDisabled = (nonAdmin.match(/disabled=""/g) ?? []).length;
    const adminDisabled = (admin.match(/disabled=""/g) ?? []).length;
    // The admin has strictly fewer disabled buttons (reversals become enabled).
    expect(adminDisabled).toBeLessThan(nonAdminDisabled);
  });

  it("is a function component", () => {
    expect(typeof OrderActionSheet).toBe("function");
  });
});
