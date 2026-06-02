import { serializeJsonLd } from "../../lib/seo";

/**
 * P5-E06-S02 (Story 36.2) — render a JSON-LD structured-data block.
 *
 * Emits a `<script type="application/ld+json">` whose body is the serialised
 * `data` object. The payload is built ENTIRELY from our own pure helpers
 * (localBusinessJsonLd / articleJsonLd) — never from raw user input — and the
 * serialisation ({@link serializeJsonLd}) escapes `<` so no string field can
 * break out of the script element. The escaping is unit-tested at the helper.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
