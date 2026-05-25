"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StaffRole } from "@bm/contracts";
import {
  staffRoleLabel,
  staffRoleOptions,
  staffStatusLabel,
  validateStaffForm,
} from "../../lib/staff-form";

/**
 * Admin staff data records (P1-E07-S03). Admin maintains the stylists,
 * instructors, attendants, coaches and event staff that bookings are attributed
 * to. These are PURE DATA records — no logins, no auth association. Renaming
 * never rewrites history (bookings carry a name-at-time snapshot, AC4). The
 * server re-validates + enforces `manage service`.
 */
interface Staff {
  id: string;
  displayName: string;
  role: StaffRole;
  active: boolean;
  terminatedAt: string | null;
}

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

const EMPTY_STAFF = { displayName: "", role: "" as StaffRole | "" };

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [form, setForm] = useState(EMPTY_STAFF);
  const errors = useMemo(
    () => validateStaffForm({ displayName: form.displayName, role: form.role }),
    [form],
  );

  const load = useCallback(async () => {
    const res = await fetch("/admin/staff", { credentials: "include" });
    if (res.ok) setStaff(((await res.json()) as { staff: Staff[] }).staff);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (Object.keys(errors).length > 0 || form.role === "") return;
      const res = await fetch("/admin/staff", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({ displayName: form.displayName.trim(), role: form.role }),
      });
      if (res.ok) {
        setForm(EMPTY_STAFF);
        await load();
      }
    },
    [errors, form, load],
  );

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/admin/staff/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    },
    [load],
  );

  return (
    <main>
      <h1>Staff</h1>
      <p>People bookings are attributed to. These are data records — they do not log in.</p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id} aria-disabled={s.active ? undefined : "true"}>
              <td>{s.displayName}</td>
              <td>{staffRoleLabel(s.role)}</td>
              <td>{staffStatusLabel(s.active)}</td>
              <td>
                <button type="button" onClick={() => void patch(s.id, { active: !s.active })}>
                  {s.active ? "Deactivate" : "Reactivate"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add a staff member</h2>
      <form onSubmit={onCreate}>
        <label>
          Name
          <input
            name="displayName"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            aria-invalid={Boolean(errors.displayName)}
            required
          />
        </label>
        <label>
          Role
          <select
            name="role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
            aria-invalid={Boolean(errors.role)}
            required
          >
            <option value="">Choose…</option>
            {staffRoleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={Object.keys(errors).length > 0}>
          Add staff
        </button>
      </form>
    </main>
  );
}
