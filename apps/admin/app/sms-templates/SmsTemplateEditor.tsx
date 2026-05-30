"use client";

import { useState } from "react";

/**
 * P5-E03-S04 (Epic 33-4) — SMS template body editor, client control.
 *
 * Renders the active body for one template key in an editable textarea and
 * SAVES A NEW VERSION (AC1: list + edit; AC3: new version on save). The save
 * PUTs to `/admin/sms-templates/:key` with the double-submit CSRF token read
 * from the `bm_csrf` cookie. Placeholder validation is enforced server-side
 * (AC2): a body that drops a required `{token}` comes back 400 and the message
 * is surfaced inline.
 */

function readCsrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

interface Props {
  templateKey: string;
  language: string;
  initialBody: string;
  initialVersion: number;
  apiBase: string;
}

export function SmsTemplateEditor({
  templateKey,
  language,
  initialBody,
  initialVersion,
  apiBase,
}: Props) {
  const [body, setBody] = useState(initialBody);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = body !== initialBody;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(
        `${apiBase}/admin/sms-templates/${encodeURIComponent(templateKey)}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": readCsrfToken(),
          },
          credentials: "include",
          body: JSON.stringify({ body, language }),
        },
      );
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        version?: number;
        issues?: string[];
      };
      if (!res.ok) {
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      if (typeof j.version === "number") setVersion(j.version);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
        rows={3}
        style={{ width: "100%", fontFamily: "monospace", padding: 6 }}
        aria-label={`Body for ${templateKey}`}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#666", fontSize: 12 }}>v{version}</span>
        <button onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save new version"}
        </button>
        {saved && !dirty && <span style={{ color: "green", fontSize: 12 }}>Saved</span>}
        {error && <span style={{ color: "crimson", fontSize: 12 }}>{error}</span>}
      </div>
    </div>
  );
}
