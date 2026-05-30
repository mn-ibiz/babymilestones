"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { toEventRow, type EventRow } from "../../lib/events.js";
import type { EventDto } from "@bm/contracts";

interface DraftTier {
  name: string;
  priceCents: number;
  allotment: number;
}

const EMPTY_TIER: DraftTier = { name: "", priceCents: 0, allotment: 0 };

export default function EventsPage() {
  const [events, setEvents] = useState<EventDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("general");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [capacity, setCapacity] = useState(0);
  const [tiers, setTiers] = useState<DraftTier[]>([{ ...EMPTY_TIER }]);

  async function load() {
    try {
      const res = await apiFetch<{ events: EventDto[] }>("/admin/events");
      setEvents(res.events);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    try {
      await apiFetch("/admin/events", {
        method: "POST",
        body: {
          name,
          unit,
          startsAt: startsAt ? new Date(startsAt).toISOString() : "",
          endsAt: endsAt ? new Date(endsAt).toISOString() : "",
          venue: venue || undefined,
          capacity,
          tiers: tiers.filter((t) => t.name.trim().length > 0),
        },
      });
      setName("");
      setVenue("");
      setTiers([{ ...EMPTY_TIER }]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create event");
    }
  }

  async function togglePublish(ev: EventDto) {
    try {
      await apiFetch(`/admin/events/${ev.id}`, {
        method: "PATCH",
        body: { published: !ev.published },
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update event");
    }
  }

  const rows: EventRow[] = events.map(toEventRow);

  return (
    <main>
      <h1>Events</h1>
      {error ? <p role="alert">{error}</p> : null}

      <section aria-label="create-event">
        <h2>Create event</h2>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="name" />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="unit">
          <option value="general">General</option>
          <option value="reading_corner">Reading Corner</option>
          <option value="talent_recital">Talent Recital</option>
        </select>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label="startsAt" />
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} aria-label="endsAt" />
        <input placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="venue" />
        <input
          type="number"
          placeholder="Capacity"
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          aria-label="capacity"
        />
        <fieldset>
          <legend>Tiers</legend>
          {tiers.map((t, i) => (
            <div key={i}>
              <input
                placeholder="Tier name"
                value={t.name}
                onChange={(e) =>
                  setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                aria-label={`tier-name-${i}`}
              />
              <input
                type="number"
                placeholder="Price (cents)"
                value={t.priceCents}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, priceCents: Number(e.target.value) } : x)),
                  )
                }
                aria-label={`tier-price-${i}`}
              />
              <input
                type="number"
                placeholder="Allotment"
                value={t.allotment}
                onChange={(e) =>
                  setTiers((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, allotment: Number(e.target.value) } : x)),
                  )
                }
                aria-label={`tier-allotment-${i}`}
              />
            </div>
          ))}
          <button type="button" onClick={() => setTiers((prev) => [...prev, { ...EMPTY_TIER }])}>
            Add tier
          </button>
        </fieldset>
        <button type="button" onClick={create}>
          Create
        </button>
      </section>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Unit</th>
            <th>Capacity</th>
            <th>Tiers</th>
            <th>From</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.unit}</td>
              <td>{row.capacity}</td>
              <td>{row.tierCount}</td>
              <td>{row.fromPrice}</td>
              <td>{row.status}</td>
              <td>
                <button type="button" onClick={() => { const ev = events[i]; if (ev) void togglePublish(ev); }}>
                  {events[i]?.published ? "Unpublish" : "Publish"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
