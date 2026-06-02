"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  fetchAdminAlerts,
  dismissAdminAlert,
  adminAlertView,
  unreadAlertCount,
  type AdminAlert,
} from "../lib/alerts";

/**
 * Admin alerts bell (P6-E04-S03 / Story 34.3). A minimal IN-APP surface for the
 * negative-feedback alerts the cron raises: a bell with an unread-count badge that
 * opens a small list, each item linking to the feedback detail (AC2). An admin can
 * dismiss an item (drops it off the list). Reads the admin-gated `/admin/alerts`
 * API credentially; a 403 (a role without report access) simply renders nothing.
 */
export function AlertsBell() {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);

  const refresh = useCallback(() => {
    fetchAdminAlerts()
      .then((res) => {
        setAlerts(res.alerts);
        setDenied(false);
      })
      .catch(() => {
        // A non-report role (403) or a transient error: hide the bell rather than
        // surface an error in the shell header.
        setDenied(true);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDismiss = useCallback(
    (id: string) => {
      dismissAdminAlert(id)
        .then(() => setAlerts((prev) => prev.filter((a) => a.id !== id)))
        .catch(() => {
          /* ignore — the next refresh reconciles */
        });
    },
    [],
  );

  if (denied) return null;

  const count = unreadAlertCount(alerts);
  const rows = adminAlertView(alerts);

  return (
    <span data-testid="alerts-bell" style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-label={`Alerts (${count} unread)`}
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem" }}
      >
        <span aria-hidden>🔔</span>
        {count > 0 ? (
          <span
            data-testid="alerts-badge"
            style={{
              marginLeft: "0.2rem",
              padding: "0 0.35rem",
              borderRadius: "9999px",
              backgroundColor: "#dc2626",
              color: "#fff",
              fontSize: "0.7rem",
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
      {open ? (
        <ul
          data-testid="alerts-list"
          style={{
            position: "absolute",
            right: 0,
            listStyle: "none",
            margin: 0,
            padding: "0.5rem",
            minWidth: "16rem",
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            zIndex: 10,
          }}
        >
          {rows.length === 0 ? (
            <li style={{ color: "#6b7280", fontSize: "0.85rem" }}>No new alerts</li>
          ) : (
            rows.map((row) => (
              <li key={row.id} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", padding: "0.25rem 0" }}>
                {/* AC2: each alert links to the feedback detail. */}
                <a href={row.href} style={{ flex: 1 }}>
                  {row.title}
                  <span style={{ marginLeft: "0.5rem", color: "#9ca3af", fontSize: "0.75rem" }}>{row.date}</span>
                </a>
                <button
                  type="button"
                  aria-label={`Dismiss alert ${row.title}`}
                  onClick={() => onDismiss(row.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}
                >
                  ✕
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </span>
  );
}
