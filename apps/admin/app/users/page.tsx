"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SystemStaffRole } from "@bm/contracts";
import {
  systemRoleLabel,
  systemRoleOptions,
  userStatusLabel,
  validateUserForm,
} from "../../lib/users-form";

/**
 * Admin staff LOGIN users (P1-E10-S02). A super-admin/admin creates the
 * phone+role+PIN accounts that authenticate into the consoles, changes a user's
 * role (which invalidates their live sessions, 1-6 AC4), deactivates/reactivates
 * an account, and resets a PIN. These are DISTINCT from the `/staff` attribution
 * data records (P1-E07-S03). The PIN is NEVER displayed except the one-time
 * initial/reset value the API returns once. The server re-validates + enforces
 * `manage user`.
 */
interface StaffUser {
  id: string;
  phone: string;
  role: SystemStaffRole;
  active: boolean;
  deactivatedAt: string | null;
}

/** Read the CSRF double-submit cookie the client echoes on mutating calls. */
function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

const EMPTY_FORM = { phone: "", role: "" as SystemStaffRole | "", pin: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  // The one-time PIN returned by create/reset — shown once for the super-admin
  // to relay, then cleared. Never re-fetchable.
  const [issuedPin, setIssuedPin] = useState<{ phone: string; pin: string } | null>(null);
  const errors = useMemo(
    () => validateUserForm({ phone: form.phone, role: form.role, pin: form.pin }),
    [form],
  );

  const load = useCallback(async () => {
    const res = await fetch("/admin/users", { credentials: "include" });
    if (res.ok) setUsers(((await res.json()) as { users: StaffUser[] }).users);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (Object.keys(errors).length > 0 || form.role === "") return;
      const res = await fetch("/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify({
          phone: form.phone.trim(),
          role: form.role,
          ...(form.pin.trim().length > 0 ? { pin: form.pin.trim() } : {}),
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { phone: string; initialPin: string };
        setIssuedPin({ phone: body.phone, pin: body.initialPin });
        setForm(EMPTY_FORM);
        await load();
      }
    },
    [errors, form, load],
  );

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/admin/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    },
    [load],
  );

  const resetPin = useCallback(async (u: StaffUser) => {
    const res = await fetch(`/admin/users/${u.id}/reset-pin`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
      body: "{}",
    });
    if (res.ok) {
      const body = (await res.json()) as { initialPin: string };
      setIssuedPin({ phone: u.phone, pin: body.initialPin });
    }
  }, []);

  return (
    <main>
      <h1>Staff logins</h1>
      <p>
        Accounts that sign in to the consoles. Changing a role or deactivating an account signs the
        user out immediately.
      </p>

      {issuedPin ? (
        <p role="status" data-issued-pin>
          One-time PIN for <strong>{issuedPin.phone}</strong>: <code>{issuedPin.pin}</code>. Share it
          now — it cannot be shown again.{" "}
          <button type="button" onClick={() => setIssuedPin(null)}>
            Dismiss
          </button>
        </p>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Phone</th>
            <th>Role</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} aria-disabled={u.active ? undefined : "true"}>
              <td>{u.phone}</td>
              <td>{systemRoleLabel(u.role)}</td>
              <td>{userStatusLabel(u.active)}</td>
              <td>
                <button type="button" onClick={() => void patch(u.id, { active: !u.active })}>
                  {u.active ? "Deactivate" : "Reactivate"}
                </button>
                <button type="button" onClick={() => void resetPin(u)}>
                  Reset PIN
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add a staff login</h2>
      <form onSubmit={onCreate}>
        <label>
          Phone
          <input
            name="phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            aria-invalid={Boolean(errors.phone)}
            required
          />
        </label>
        <label>
          Role
          <select
            name="role"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as SystemStaffRole }))}
            aria-invalid={Boolean(errors.role)}
            required
          >
            <option value="">Choose…</option>
            {systemRoleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Initial PIN (optional — auto-generated if blank)
          <input
            name="pin"
            inputMode="numeric"
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
            aria-invalid={Boolean(errors.pin)}
            placeholder="auto"
          />
        </label>
        <button type="submit" disabled={Object.keys(errors).length > 0 || form.role === ""}>
          Add staff login
        </button>
      </form>
    </main>
  );
}
