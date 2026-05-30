import { headers } from "next/headers";
import { SmsTemplateEditor } from "./SmsTemplateEditor.js";

/**
 * P1-E09-S03 — SMS templates admin (list).
 * P5-E03-S04 (Epic 33-4) — list + edit: each active body is editable and saving
 * writes a new version (old versions retained, validation enforced server-side).
 *
 * Lists the active template per key with its version and an editable body
 * (placeholder tokens). Editing a body and saving PUTs to the admin API.
 */

interface PublicTemplate {
  id: string;
  key: string;
  language: string;
  version: number;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchTemplates(apiBase: string): Promise<PublicTemplate[]> {
  const h = await headers();
  const cookie = h.get("cookie") ?? "";
  const res = await fetch(`${apiBase}/admin/sms-templates`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { templates: PublicTemplate[] };
  return body.templates;
}

export default async function SmsTemplatesPage() {
  const apiBase = process.env.API_BASE_URL ?? "http://localhost:8080";
  const templates = await fetchTemplates(apiBase);
  return (
    <main style={{ padding: 24 }}>
      <h1>SMS Templates</h1>
      <p>Active template per key. Edit a body and save to create a new version.</p>
      <table style={{ borderCollapse: "collapse", marginTop: 16, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Key</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Lang</th>
            <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc", width: "70%" }}>
              Body
            </th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td
                style={{
                  padding: 8,
                  borderBottom: "1px solid #eee",
                  fontFamily: "monospace",
                  verticalAlign: "top",
                }}
              >
                {t.key}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                {t.language}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                <SmsTemplateEditor
                  templateKey={t.key}
                  language={t.language}
                  initialBody={t.body}
                  initialVersion={t.version}
                  apiBase={apiBase}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
