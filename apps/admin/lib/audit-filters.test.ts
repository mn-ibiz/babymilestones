import { describe, expect, it } from "vitest";
import {
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FILTERS,
  buildAuditExportQuery,
  buildAuditQuery,
  offsetForPage,
  pageCount,
} from "./audit-filters.js";

describe("audit viewer filter helpers (P1-E10-S03)", () => {
  it("an empty filter issues a bare paginated list query", () => {
    const q = buildAuditQuery(EMPTY_AUDIT_FILTERS, { limit: AUDIT_PAGE_SIZE, offset: 0 });
    expect(q).toBe(`?limit=${AUDIT_PAGE_SIZE}&offset=0`);
  });

  it("serializes set filters + pagination, omitting blanks (AC1/AC2)", () => {
    const q = buildAuditQuery(
      {
        actor: " user-1 ",
        action: "wallet.topup",
        targetId: "",
        fromDate: "2026-05-01",
        toDate: " ",
      },
      { limit: 25, offset: 50 },
    );
    const params = new URLSearchParams(q.slice(1));
    expect(params.get("actor")).toBe("user-1"); // trimmed
    expect(params.get("action")).toBe("wallet.topup");
    expect(params.get("fromDate")).toBe("2026-05-01");
    expect(params.has("targetId")).toBe(false); // blank omitted
    expect(params.has("toDate")).toBe(false); // whitespace omitted
    expect(params.get("limit")).toBe("25");
    expect(params.get("offset")).toBe("50");
  });

  it("export query carries the filters but no pagination", () => {
    expect(buildAuditExportQuery(EMPTY_AUDIT_FILTERS)).toBe("");
    const q = buildAuditExportQuery({
      ...EMPTY_AUDIT_FILTERS,
      action: "wallet.refund",
    });
    const params = new URLSearchParams(q.slice(1));
    expect(params.get("action")).toBe("wallet.refund");
    expect(params.has("limit")).toBe(false);
    expect(params.has("offset")).toBe(false);
  });

  it("computes offsets + page counts", () => {
    expect(offsetForPage(0, 50)).toBe(0);
    expect(offsetForPage(2, 50)).toBe(100);
    expect(offsetForPage(-1, 50)).toBe(0);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(120, 50)).toBe(3);
  });
});
