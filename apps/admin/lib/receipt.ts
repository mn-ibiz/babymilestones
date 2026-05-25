/**
 * Reception receipt client logic (P1-E05-S06). Framework-agnostic +
 * dependency-free (no DOM beyond a tiny injectable print port) so it unit-tests
 * cleanly and never pulls server-only code into the Next bundle. The React page
 * wires these to the "Print" + "SMS" button pair shown after a payment and on
 * every transaction-history row (reprint, AC4).
 *
 * Decision 13: printing is the browser's default print dialog. `printReceipt`
 * fetches the receipt payload, renders the `ReceiptPreview` HTML (`@bm/ui`), and
 * hands it to an injectable {@link PrintPort} (the real one opens the rendered
 * document and calls `window.print()`; tests pass a fake).
 */
import type { ReceiptResponse, ReceiptSmsResponse } from "@bm/contracts";
import { renderReceiptHtml } from "@bm/ui";

/** The two receipt actions surfaced after a payment + on each history row (AC1, AC4). */
export const RECEIPT_ACTIONS = ["print", "sms"] as const;
export type ReceiptAction = (typeof RECEIPT_ACTIONS)[number];

/** API path for the printable receipt payload of one transaction (AC1/AC4). */
export function receiptUrl(transactionId: string): string {
  return `/reception/receipt/${transactionId}`;
}

/** API path to send the SMS-stub receipt copy for one transaction (AC3). */
export function receiptSmsUrl(transactionId: string): string {
  return `/reception/receipt/${transactionId}/sms`;
}

/**
 * A minimal print sink. The browser implementation opens the rendered receipt
 * document and triggers the print dialog; tests inject a recorder.
 */
export interface PrintPort {
  print(html: string): void;
}

/**
 * The browser print port (Decision 13): render the receipt HTML to a Blob URL,
 * open it, and invoke `print()`. Using a Blob URL (rather than writing into the
 * document) keeps the receipt sandboxed and avoids any markup-injection sink.
 */
export function browserPrintPort(): PrintPort {
  return {
    print(html: string) {
      if (typeof window === "undefined") return;
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        URL.revokeObjectURL(url);
        return;
      }
      win.addEventListener("load", () => {
        win.focus();
        win.print();
        URL.revokeObjectURL(url);
      });
    },
  };
}

/**
 * Fetch the receipt payload for a transaction, render it to printable HTML, and
 * send it to the print port (AC2). Works identically after payment and from a
 * history row (AC4) because the payload is reproduced server-side from the
 * ledger entry. Returns the HTML that was printed (handy for tests/preview).
 */
export async function printReceipt(
  transactionId: string,
  deps: { fetchJson?: typeof fetch; port?: PrintPort } = {},
): Promise<string> {
  const doFetch = deps.fetchJson ?? fetch;
  const port = deps.port ?? browserPrintPort();
  const res = await doFetch(receiptUrl(transactionId));
  if (!res.ok) throw new Error(`Failed to load receipt (${res.status})`);
  const { receipt } = (await res.json()) as ReceiptResponse;
  const html = renderReceiptHtml(receipt);
  port.print(html);
  return html;
}

/** Human label for the result of an SMS-copy attempt (AC3). */
export function smsResultLabel(result: ReceiptSmsResponse): string {
  if (result.sent) return "Receipt sent by SMS";
  if (result.reason === "no_consent") return "Parent has not opted in to SMS";
  return "SMS not sent";
}
