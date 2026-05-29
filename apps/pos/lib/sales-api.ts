import type { OverallDiscount, PosSaleMethod, PosSaleResponse } from "@bm/contracts";
import { readCsrfToken } from "./csrf.js";
import type { Cart } from "./cart.js";

/**
 * POS sale wiring (P2-E04-S04). Mutating calls carry the CSRF double-submit
 * token and `credentials: "include"`. The server recomputes all money from the
 * DB, so the request sends only product ids/qty/discount — never prices.
 */

export interface CreateSaleInput {
  method: PosSaleMethod;
  customerPhone?: string;
  cashTenderedCents?: number;
  /** Per-attempt idempotency key — a replayed create returns the same sale. */
  idempotencyKey?: string;
}

/** Build the server request from the cart + chosen method. */
function saleRequestBody(cart: Cart, input: CreateSaleInput) {
  const overallDiscount: OverallDiscount = cart.overall;
  return {
    method: input.method,
    lines: cart.lines.map((l) => ({
      productId: l.product.id,
      qty: l.qty,
      lineDiscountPct: l.lineDiscountPct,
    })),
    overallDiscount,
    ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
    ...(input.cashTenderedCents != null ? { cashTenderedCents: input.cashTenderedCents } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  };
}

export type SaleApiResult =
  | { ok: true; sale: PosSaleResponse }
  | { ok: false; status: number; error: string };

async function postJson(url: string, body: unknown): Promise<SaleApiResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      return { ok: false, status: res.status, error: (json?.error as string) ?? "Payment failed" };
    }
    return { ok: true, sale: json as unknown as PosSaleResponse };
  } catch {
    return { ok: false, status: 0, error: "Network error — please retry" };
  }
}

/** Create a sale (cash/wallet settle immediately; M-Pesa/Paystack return pending). */
export function createSale(cart: Cart, input: CreateSaleInput): Promise<SaleApiResult> {
  return postJson("/pos/sales", saleRequestBody(cart, input));
}

/** Poll/verify an async sale (M-Pesa STK / Paystack) and settle it on success. */
export function confirmSale(saleId: string): Promise<SaleApiResult> {
  return postJson(`/pos/sales/${saleId}/confirm`, {});
}
