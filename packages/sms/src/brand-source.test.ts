import { describe, expect, it } from "vitest";
import { BRAND } from "@bm/ui/brand";
import { renderTemplate } from "./templates.js";

/**
 * X7-S04 AC2: SMS-stub bodies consume the SAME brand source as receipts — no
 * duplicated literal. If the shared brand name changes, the rendered body
 * changes with it (this asserts the seam, not a frozen literal).
 */
describe("sms templates consume the brand source (X7-S04 AC2)", () => {
  it("reset code body embeds the shared brand name", () => {
    const body = renderTemplate("auth.reset.code", { code: "123456" });
    expect(body).toContain(`Your ${BRAND.name} reset code`);
  });

  it("data-export body embeds the shared brand name", () => {
    const body = renderTemplate("parent.data.export.ready", { link: "https://x/y" });
    expect(body).toContain(`Your ${BRAND.name} data export`);
  });
});
