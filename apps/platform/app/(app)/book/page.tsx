"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BookableService } from "@bm/contracts";
import { fetchBookableServices } from "../../../lib/book-slots-api";

/**
 * Bookable-services listing (P2-E01-S02 entry point). Lists the active services
 * a parent can book; each links to its slot-browse page at
 * `/book/service/[serviceId]`. Reached from the parent Home page.
 */
export default function BookIndexPage() {
  const [services, setServices] = useState<BookableService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBookableServices()
      .then(setServices)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load services"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-lg font-semibold">Book a session</h1>
      {services.length === 0 ? (
        <p className="mt-3 text-sm text-gray-600">No services are available to book right now.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                // Salon services use the stylist-keyed salon flow (P3-E03-S02);
                // coaching uses the coach-keyed 1:1 flow (P5-E01-S02); Play/Talent
                // use the session-slot grid.
                href={
                  s.unit === "salon"
                    ? `/book/salon/${s.id}`
                    : s.unit === "coaching"
                      ? `/book/coaching/${s.id}`
                      : `/book/service/${s.id}`
                }
                className="block rounded border border-gray-200 p-3 hover:border-gray-300"
              >
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-xs uppercase text-gray-400">{s.unit}</span>
                {s.description ? (
                  <span className="mt-1 block text-sm text-gray-600">{s.description}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
