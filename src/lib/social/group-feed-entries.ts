import type { FeedEntry, FeedEvent, FeedVerb } from "./feed";

// Variante de presentación: N eventos del mismo actor colapsados en una tarjeta.
// NO es una entidad con fila propia — solo agrupa para pintar. La reacción de
// cada ítem vive en su propia fila real (ver spec D1/D2).
export type PersonGroupEntry = {
  source: "person-group";
  id: string;
  eventDate: string; // la del ítem más reciente
  verb: Extract<FeedVerb, "added" | "progressed">;
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  items: FeedEvent[];
};

// Solo estos dos verbos se agrupan; el resto (finished/rated/reviewed/
// watchedEpisode) y las entradas de club pasan intactos.
const GROUPABLE: ReadonlySet<FeedVerb> = new Set(["added", "progressed"]);

function day(iso: string): string {
  return iso.slice(0, 10);
}

// added → por actor+día; progressed → por actor+obra+día (una sesión distinta
// del mismo libro el mismo día cae junta, pero días distintos no).
function groupKey(e: FeedEvent): string {
  if (e.verb === "added") return `added:${e.actorId}:${day(e.eventDate)}`;
  return `progressed:${e.actorId}:${e.itemType}:${e.itemId}:${day(e.eventDate)}`;
}

export function groupPersonEntries(entries: FeedEntry[]): FeedEntry[] {
  const buckets = new Map<string, FeedEvent[]>();
  const passthrough: FeedEntry[] = [];

  for (const entry of entries) {
    if (entry.source !== "person" || !GROUPABLE.has(entry.event.verb)) {
      passthrough.push(entry);
      continue;
    }
    const key = groupKey(entry.event);
    const list = buckets.get(key);
    if (list) list.push(entry.event);
    else buckets.set(key, [entry.event]);
  }

  const result: FeedEntry[] = [...passthrough];
  for (const [key, items] of buckets) {
    if (items.length === 1) {
      const e = items[0];
      result.push({ source: "person", id: e.id, eventDate: e.eventDate, event: e });
      continue;
    }
    // Orden interno: más reciente primero (mismo criterio que el feed).
    items.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.id < b.id ? 1 : -1));
    const newest = items[0];
    result.push({
      source: "person-group",
      // id único por página: `key` (actor+verbo+día, y para progressed también
      // obra) se repite entre páginas de "Cargar más"; el id real de `newest`
      // (único por fila) evita que FeedList colisione claves de React entre
      // grupos de páginas distintas con el mismo actor+día.
      id: `group:${key}:${newest.id}`,
      eventDate: newest.eventDate,
      verb: newest.verb as PersonGroupEntry["verb"],
      actor: {
        id: newest.actorId,
        username: newest.actorUsername,
        displayName: newest.actorDisplayName,
        avatarUrl: newest.actorAvatarUrl,
      },
      items,
    });
  }

  // Reordenar todo por fecha desc (el bucketing rompió el orden original).
  result.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.id < b.id ? 1 : -1));
  return result;
}
