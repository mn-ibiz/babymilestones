import { describe, expect, it } from "vitest";
import { buildPayoutCsv, PAYOUT_CSV_COLUMNS } from "./commission-run.js";

/**
 * P3-E01-S05 — payout CSV builder. Pure unit tests: header, integer-cents amount
 * formatting, blank phone, and RFC-4180 escaping.
 */
describe("buildPayoutCsv (P3-E01-S05 AC1)", () => {
  it("emits the stable header", () => {
    expect(buildPayoutCsv([]).split("\r\n")[0]).toBe("staff_name,phone,amount,reference");
    expect(PAYOUT_CSV_COLUMNS).toEqual(["staff_name", "phone", "amount", "reference"]);
  });

  it("renders rows with integer-cents amounts and a reference", () => {
    const csv = buildPayoutCsv([
      { staffName: "Asha", phone: "+254712345678", amountCents: 150000, reference: "COMM-1-a" },
      { staffName: "Bina", phone: "+254712000002", amountCents: 625, reference: "COMM-1-b" },
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[1]).toBe("Asha,+254712345678,1500.00,COMM-1-a");
    expect(lines[2]).toBe("Bina,+254712000002,6.25,COMM-1-b");
  });

  it("emits a blank phone field rather than dropping the line", () => {
    const csv = buildPayoutCsv([{ staffName: "Asha", phone: "", amountCents: 1000, reference: "r" }]);
    expect(csv.trimEnd().split("\r\n")[1]).toBe("Asha,,10.00,r");
  });

  it("escapes a name containing a comma per RFC 4180", () => {
    const csv = buildPayoutCsv([{ staffName: "Doe, Jane", phone: "x", amountCents: 100, reference: "r" }]);
    expect(csv.trimEnd().split("\r\n")[1]).toBe('"Doe, Jane",x,1.00,r');
  });

  it("ends with a trailing CRLF", () => {
    expect(buildPayoutCsv([{ staffName: "A", phone: "p", amountCents: 0, reference: "r" }]).endsWith("\r\n")).toBe(true);
  });

  it("neutralises formula injection in the user-controlled staff name (security control)", () => {
    // A staff name beginning with = + - @ must be prefixed with a quote so it is
    // not executed as a formula when the payout CSV is opened in Excel/Sheets.
    const csv = buildPayoutCsv([
      { staffName: "=HYPERLINK(0)", phone: "p", amountCents: 100, reference: "r" },
    ]);
    expect(csv.trimEnd().split("\r\n")[1]).toContain("'=HYPERLINK(0)");
    // The signed phone/amount are NOT corrupted by the guard.
    expect(buildPayoutCsv([{ staffName: "A", phone: "+254700", amountCents: -500, reference: "r" }]))
      .toContain("+254700,-5.00,");
  });
});
