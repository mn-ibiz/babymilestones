import type { FastifyInstance } from "fastify";
import type { Database } from "@bm/db";
import { users } from "@bm/db";
import { staffUserSeed } from "@bm/auth";

/**
 * Test helpers for staff-authenticated route tests. Seeds a staff user with a
 * known phone/PIN and logs in through the real `/auth/staff/login` flow so the
 * returned cookie + CSRF token exercise the production auth path.
 */

const DEFAULT_PHONE = "+254712000001";
const DEFAULT_PIN = "7421";

export interface SeedStaffOptions {
  role?: string;
  phone?: string;
  pin?: string;
}

/**
 * Insert a staff user row (phone + hashed PIN + role) ready for the staff login
 * flow. Defaults to an `admin` at a fixed phone/PIN so {@link loginStaff} can log
 * in without arguments.
 */
export async function seedStaffUser(db: Database, opts: SeedStaffOptions = {}): Promise<void> {
  const role = (opts.role ?? "admin") as Parameters<typeof staffUserSeed>[2];
  const phone = opts.phone ?? DEFAULT_PHONE;
  const pin = opts.pin ?? DEFAULT_PIN;
  await db.insert(users).values(await staffUserSeed(phone, pin, role));
}

export interface StaffCreds {
  /** `bm_session=...` cookie pair, ready for a request `cookie` header. */
  cookie: string;
  /** The double-submit CSRF token to send as the `x-csrf-token` header. */
  csrf: string;
  /** The `bm_csrf=...` cookie pair (combine with `cookie` for mutating verbs). */
  csrfCookie: string;
}

/**
 * Log a seeded staff user in via the real `/auth/staff/login` route and return
 * the session cookie + CSRF token. Defaults to the same fixed phone/PIN as
 * {@link seedStaffUser}.
 */
export async function loginStaff(
  app: FastifyInstance,
  phone = DEFAULT_PHONE,
  pin = DEFAULT_PIN,
): Promise<StaffCreds> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/staff/login",
    payload: { phone, pin },
  });
  const cookies = res.headers["set-cookie"] as string[];
  const session = cookies.find((c) => c.startsWith("bm_session="))!.split(";")[0]!;
  const csrfCookie = cookies.find((c) => c.startsWith("bm_csrf="))!.split(";")[0]!;
  const csrf = (res.json() as { csrfToken: string }).csrfToken;
  // The mutating-verb guard needs both the session AND the csrf cookie present.
  return { cookie: `${session}; ${csrfCookie}`, csrf, csrfCookie };
}
