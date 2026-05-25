"use client";

import { useEffect, useState } from "react";
import type { SmsTemplatePublic } from "@bm/contracts";
import {
  placeholdersOf,
  sortTemplatesForDisplay,
  templateVersionLabel,
} from "../../lib/sms-templates-view";

/**
 * Admin SMS templates screen (P1-E09-S03, AC3) — READ-ONLY in P1. Lists the
 * active, versioned template per key so an operator can see exactly the copy
 * `send(...)` will render. Editing is deferred to P2; there are deliberately no
 * mutation controls here. All data comes from `/api/admin/sms-templates`.
 */
export default function SmsTemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplatePublic[]>([]);

  useEffect(() => {
    async function refresh() {
      const res = await fetch("/api/admin/sms-templates", { credentials: "include" });
      if (res.ok) {
        const body = (await res.json()) as { templates: SmsTemplatePublic[] };
        setTemplates(sortTemplatesForDisplay(body.templates));
      }
    }
    void refresh();
  }, []);

  return (
    <main>
      <h1>SMS templates</h1>
      <p>Read-only in this release. Templates are versioned; editing arrives in a later phase.</p>

      <ul aria-label="SMS templates">
        {templates.map((tpl) => (
          <li key={tpl.id}>
            <strong>{tpl.key}</strong> ({tpl.language}) — {templateVersionLabel(tpl)}
            <br />
            <code>{tpl.body}</code>
            {placeholdersOf(tpl.body).length > 0 ? (
              <span> — placeholders: {placeholdersOf(tpl.body).join(", ")}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
