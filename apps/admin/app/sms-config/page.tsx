"use client";

import { useEffect, useState } from "react";
import type { SmsConfigPublic } from "@bm/contracts";
import {
  validateSmsConfigForm,
  smsConfigStatusLabel,
  apiKeyRefDisplay,
  sortConfigsForDisplay,
  type SmsConfigFormErrors,
} from "../../lib/sms-config-form";

/**
 * Admin SMS provider config screen (P1-E09-S02). Manages the `sms_config`
 * row(s): register a sender ID + provider URL + API-key REFERENCE (env var
 * name — never the secret, AC1/AC2), and toggle which single config is active
 * (AC4). All persistence + the SSRF/HTTPS host check (AC3) is enforced by the
 * API; this screen only collects input and shows the secret-free list.
 */
const EMPTY = { senderId: "", apiUrl: "", apiKeyRef: "" };

export default function SmsConfigPage() {
  const [configs, setConfigs] = useState<SmsConfigPublic[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<SmsConfigFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/sms-config", { credentials: "include" });
    if (res.ok) {
      const body = (await res.json()) as { configs: SmsConfigPublic[] };
      setConfigs(sortConfigsForDisplay(body.configs));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const v = validateSmsConfigForm(form);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    const res = await fetch("/api/admin/sms-config", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm(EMPTY);
      await refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setServerError(body.error ?? "Could not save config");
    }
  }

  async function activate(id: string) {
    const res = await fetch(`/api/admin/sms-config/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    if (res.ok) await refresh();
  }

  return (
    <main>
      <h1>SMS provider configuration</h1>

      <form onSubmit={onCreate} aria-label="Add SMS config">
        <label>
          Sender ID
          <input
            value={form.senderId}
            onChange={(e) => setForm({ ...form, senderId: e.target.value })}
          />
          {errors.senderId ? <span role="alert">{errors.senderId}</span> : null}
        </label>
        <label>
          Provider API URL (HTTPS)
          <input value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} />
          {errors.apiUrl ? <span role="alert">{errors.apiUrl}</span> : null}
        </label>
        <label>
          API key reference (env var name — not the key)
          <input
            value={form.apiKeyRef}
            onChange={(e) => setForm({ ...form, apiKeyRef: e.target.value })}
            placeholder="SMS_API_KEY"
          />
          {errors.apiKeyRef ? <span role="alert">{errors.apiKeyRef}</span> : null}
        </label>
        <button type="submit">Save</button>
        {serverError ? <p role="alert">{serverError}</p> : null}
      </form>

      <ul aria-label="SMS configs">
        {configs.map((c) => (
          <li key={c.id}>
            <strong>{c.senderId}</strong> — {c.apiUrl} — {apiKeyRefDisplay(c.apiKeyRef)} —{" "}
            {smsConfigStatusLabel(c.isActive)}
            {c.isActive ? null : (
              <button type="button" onClick={() => activate(c.id)}>
                Make active
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
