"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ObservationMood, ObservationOptions } from "@bm/contracts";
import {
  emptyHandoffDraft,
  handoffBody,
  isVoiceInputSupported,
  summaryPreview,
  toggleActivity,
  type HandoffDraft,
} from "../../../lib/handoff";

function readCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)bm_csrf=([^;]+)/u);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * PickupHandoffScreen (P2-E03-S03). Reached from a child card (`?bookingId=`).
 * Mood picker (5 emojis, default 😊), configurable activity chips, and a single
 * free-text line with a voice-to-text button on tablets (AC1/AC3). Confirm posts
 * the hand-off — records check-out + observation, generates the receipt, and
 * SMSes the parent (AC2/AC4). Designed for a ≤9-second typical hand-off.
 */
export default function HandoffPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-gray-500">Loading…</p>}>
      <HandoffScreen />
    </Suspense>
  );
}

function HandoffScreen() {
  const params = useSearchParams();
  const bookingId = params.get("bookingId") ?? "";

  const [options, setOptions] = useState<ObservationOptions | null>(null);
  const [draft, setDraft] = useState<HandoffDraft>(emptyHandoffDraft());
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    fetch("/reception/attendance/observation-options", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((o: ObservationOptions | null) => o && setOptions(o))
      .catch(() => {});
  }, []);

  function startVoice() {
    const w = window as unknown as { SpeechRecognition?: new () => never; webkitSpeechRecognition?: new () => never };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor() as unknown as {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    recognition.lang = "en-KE";
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]!.transcript)
        .join(" ");
      setDraft((d) => ({ ...d, note: d.note ? `${d.note} ${text}` : text }));
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function confirm() {
    if (!bookingId) return;
    setBusy(true);
    try {
      const res = await fetch("/reception/attendance/handoff", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": readCsrfToken() },
        body: JSON.stringify(handoffBody(draft, bookingId)),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setFlash(
        res.ok
          ? { kind: "ok", text: "Handed over — parent notified, receipt issued." }
          : { kind: "err", text: body.error ?? "Hand-off failed" },
      );
      if (res.ok) setDraft(emptyHandoffDraft());
    } finally {
      setBusy(false);
    }
  }

  const voiceSupported = isVoiceInputSupported();

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold">Hand over</h1>
      {flash && <p role={flash.kind === "err" ? "alert" : "status"}>{flash.text}</p>}

      <section aria-label="Mood">
        <h2>How was their day?</h2>
        <div role="radiogroup" aria-label="Mood">
          {(options?.moods ?? ["😄", "😊", "😐", "😟", "😢"]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={draft.mood === m}
              aria-label={`mood ${m}`}
              onClick={() => setDraft((d) => ({ ...d, mood: m as ObservationMood }))}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Activities">
        <h2>Activities</h2>
        {(options?.activities ?? []).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={draft.activities.includes(a)}
            onClick={() => setDraft((d) => ({ ...d, activities: toggleActivity(d.activities, a) }))}
          >
            {a}
          </button>
        ))}
      </section>

      <section aria-label="Note">
        <label>
          A quick note (optional)
          <input
            value={draft.note}
            maxLength={280}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          />
        </label>
        {voiceSupported && (
          <button type="button" onClick={startVoice} disabled={listening} aria-label="Dictate note">
            {listening ? "Listening…" : "🎤 Speak"}
          </button>
        )}
      </section>

      <p aria-label="Summary preview">{summaryPreview(draft)}</p>
      <button type="button" onClick={confirm} disabled={busy || !bookingId}>
        Confirm hand-off
      </button>
    </main>
  );
}
