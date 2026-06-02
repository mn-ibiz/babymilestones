"use client";

import { useEffect, useState } from "react";
import type { WooConfigPublic, WooTestConnectionResult } from "@bm/contracts";
import {
  validateWooConfigForm,
  buildWooConfigPayload,
  wooConfigStatusLabel,
  testConnectionStatusLabel,
  type WooConfigFormErrors,
} from "../../lib/woocommerce-config-form";

/**
 * Admin WooCommerce settings panel (Story 29.6 / P4-E04-S06). Manages the single
 * `woo_config` row: store the site URL + consumer key + consumer secret, and run
 * a "Test connection" probe against `GET /system_status` (AC4).
 *
 * Secret hygiene (AC3): the consumer key/secret are WRITE-ONLY. The GET only
 * tells us whether each is configured; the fields are blank on load and a blank
 * field is omitted on save so the stored encrypted value is kept. All
 * persistence + the HTTPS check (AC2) is enforced by the API.
 */
const EMPTY = { siteUrl: "", consumerKey: "", consumerSecret: "" };

export default function WooCommerceConfigPage() {
  const [config, setConfig] = useState<WooConfigPublic | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<WooConfigFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<WooTestConnectionResult | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/woocommerce-config", { credentials: "include" });
    if (res.ok) {
      const body = (await res.json()) as WooConfigPublic;
      setConfig(body);
      // Pre-fill the site URL only; the secrets are write-only and never returned.
      setForm({ siteUrl: body.siteUrl ?? "", consumerKey: "", consumerSecret: "" });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSaved(false);
    const exists = (config?.hasConsumerKey ?? false) && (config?.hasConsumerSecret ?? false);
    const v = validateWooConfigForm(form, { exists });
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    const res = await fetch("/api/admin/woocommerce-config", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildWooConfigPayload(form)),
    });
    if (res.ok) {
      setSaved(true);
      await refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setServerError(body.error ?? "Could not save WooCommerce config");
    }
  }

  async function onTestConnection() {
    setTestResult(null);
    setServerError(null);
    const res = await fetch("/api/admin/woocommerce-config/test-connection", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
    });
    if (res.ok) {
      setTestResult((await res.json()) as WooTestConnectionResult);
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setServerError(body.error ?? "Could not test the connection");
    }
  }

  return (
    <main>
      <h1>WooCommerce configuration</h1>
      {config ? <p>Status: {wooConfigStatusLabel(config)}</p> : null}

      <form onSubmit={onSave} aria-label="WooCommerce config">
        <label>
          Site URL (HTTPS)
          <input
            value={form.siteUrl}
            onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
            placeholder="https://shop.example.com"
          />
          {errors.siteUrl ? <span role="alert">{errors.siteUrl}</span> : null}
        </label>
        <label>
          Consumer key {config?.hasConsumerKey ? "(stored — leave blank to keep)" : null}
          <input
            type="password"
            autoComplete="off"
            value={form.consumerKey}
            onChange={(e) => setForm({ ...form, consumerKey: e.target.value })}
          />
          {errors.consumerKey ? <span role="alert">{errors.consumerKey}</span> : null}
        </label>
        <label>
          Consumer secret {config?.hasConsumerSecret ? "(stored — leave blank to keep)" : null}
          <input
            type="password"
            autoComplete="off"
            value={form.consumerSecret}
            onChange={(e) => setForm({ ...form, consumerSecret: e.target.value })}
          />
          {errors.consumerSecret ? <span role="alert">{errors.consumerSecret}</span> : null}
        </label>
        <button type="submit">Save</button>
        {saved ? <span role="status">Saved</span> : null}
        {serverError ? <p role="alert">{serverError}</p> : null}
      </form>

      <button type="button" onClick={onTestConnection}>
        Test connection
      </button>
      {testResult ? (
        <p role="status" data-test-ok={testResult.ok}>
          {testConnectionStatusLabel(testResult)}
        </p>
      ) : null}
    </main>
  );
}
