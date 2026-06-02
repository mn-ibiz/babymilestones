/**
 * Public staff-earnings viewer client logic (P3-E02-S01). The `/staff-earnings`
 * page is PUBLIC (no login) and reads the unauthenticated `/public/staff-earnings`
 * API. Framework-free so it unit-tests without React: cents formatting, the
 * payout-date label, and the two read seams (active-staff dropdown + per-staff
 * figures). The server is the source of truth for what is exposed — this only
 * shapes display; it never sends a session/CSRF token (it is a public surface).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** A dropdown option: an active staff member's id + display name (no PII). */
export interface StaffOption {
  id: string;
  displayName: string;
}

/** One service ranked by completed-visit count this period (P3-E02-S02 AC1). */
export interface ServiceCount {
  serviceName: string;
  count: number;
}

/** One service ranked by net commission revenue this period (P3-E02-S02 AC1). */
export interface ServiceRevenue {
  serviceName: string;
  revenueCents: number;
}

/** One staff member's public earnings figures (mirrors PublicStaffEarningsDto). */
export interface StaffEarnings {
  staffId: string;
  displayName: string;
  monthToDateCents: number;
  lastMonthCents: number;
  lastPayoutCents: number | null;
  lastPayoutAt: string | null;
  /** Completed visits in the same month-to-date window the total reflects (S02 AC1). */
  completedVisits: number;
  /** Top 3 services by completed-visit count this period (S02 AC1). */
  topServicesByCount: ServiceCount[];
  /** Top 3 services by net commission revenue this period (S02 AC1). */
  topServicesByRevenue: ServiceRevenue[];
}

/** A breakdown row ready to render: a service name + its formatted metric (S02 AC1). */
export interface BreakdownRow {
  serviceName: string;
  /** "3 visits" / "1 visit" for the count list, or a KES amount for the revenue list. */
  detail: string;
}

/** Format a completed-visit count as a human label (singular/plural). */
export function formatVisitCount(count: number): string {
  return `${count.toLocaleString("en-KE")} ${count === 1 ? "visit" : "visits"}`;
}

/** Shape the top-services-by-count list into render-ready rows (S02 AC1). */
export function topByCountRows(earnings: StaffEarnings): BreakdownRow[] {
  return earnings.topServicesByCount.map((s) => ({
    serviceName: s.serviceName,
    detail: formatVisitCount(s.count),
  }));
}

/** Shape the top-services-by-revenue list into render-ready rows (S02 AC1). */
export function topByRevenueRows(earnings: StaffEarnings): BreakdownRow[] {
  return earnings.topServicesByRevenue.map((s) => ({
    serviceName: s.serviceName,
    detail: formatEarningsCents(s.revenueCents),
  }));
}

/** Format integer cents as a KES amount; a null amount renders as an em dash. */
export function formatEarningsCents(cents: number | null): string {
  if (cents === null) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const major = Math.trunc(abs / 100);
  const minor = String(abs % 100).padStart(2, "0");
  return `${sign}KES ${major.toLocaleString("en-KE")}.${minor}`;
}

/** Render a payout ISO timestamp as its calendar date; null → em dash. */
export function formatPayoutDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

/** GET the public endpoint and parse JSON, throwing the server error on non-2xx. */
async function getPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json as T;
}

/** Fetch the active-staff dropdown options (AC2). Public, no auth. */
export async function fetchStaffOptions(): Promise<StaffOption[]> {
  const body = await getPublic<{ staff: StaffOption[] }>("/public/staff-earnings");
  return body.staff;
}

/** Fetch one staff member's earnings figures by id (AC3). Public, no auth. */
export async function fetchStaffEarnings(staffId: string): Promise<StaffEarnings> {
  return getPublic<StaffEarnings>(`/public/staff-earnings/${encodeURIComponent(staffId)}`);
}
