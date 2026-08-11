import { describe, expect, it } from "vitest";
import { bucketProfileFeed } from "./profile-feed-buckets";
import type { FeedEntry } from "./feed";

// La Actividad del perfil agrupa las tarjetas (ya ordenadas por publicación)
// bajo cabeceras de día natural UTC. Con posts cada entrada es una tarjeta
// propia, así que el bucketizado es directo: agrupar consecutivos por
// `dayOf(eventDate)`.

function entry(id: string, eventDate: string): FeedEntry {
  return { source: "person", id, eventDate, orderDate: eventDate, sortDate: eventDate, event: {} } as unknown as FeedEntry;
}

describe("bucketProfileFeed", () => {
  it("agrupa entradas consecutivas del mismo día", () => {
    const groups = bucketProfileFeed([
      entry("p1", "2026-08-09T15:00:00+00:00"),
      entry("p2", "2026-08-09T09:00:00+00:00"),
      entry("p3", "2026-08-08T20:00:00+00:00"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-08-09", "2026-08-08"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["p1", "p2"]);
    expect(groups[1].entries.map((e) => e.id)).toEqual(["p3"]);
  });

  it("agrupa por día UTC (un timestamp con offset cae en su día UTC)", () => {
    // 01:00 +02:00 = 23:00Z del día anterior.
    const groups = bucketProfileFeed([entry("p1", "2026-08-10T01:00:00+02:00")]);
    expect(groups[0].key).toBe("2026-08-09");
  });

  it("lista vacía => sin grupos", () => {
    expect(bucketProfileFeed([])).toEqual([]);
  });
});
