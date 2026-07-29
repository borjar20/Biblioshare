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

export const PROGRESS_WINDOW_DAYS = 7;

// Días naturales entre dos fechas ISO (fecha-only o timestamp), sin usar Date
// (Date.now/new Date argless están prohibidos y aquí no hacen falta): se comparan
// los días como enteros epoch/86400.
function dayNumber(iso: string): number {
  const [y, m, d] = day(iso).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

// added → actor+día (sin cambios). progressed → actor+obra (la ventana se aplica
// después, partiendo el bucket por huecos > PROGRESS_WINDOW_DAYS).
function groupKey(e: FeedEvent): string {
  if (e.verb === "added") return `added:${e.actorId}:${day(e.eventDate)}`;
  return `progressed:${e.actorId}:${e.itemType}:${e.itemId}`;
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
    // Cada bucket ya es de un solo verbo (el prefijo de la clave lo garantiza).
    // Los de progressed se parten en sub-grupos cuya distancia entre sesiones
    // consecutivas no supere PROGRESS_WINDOW_DAYS; added es un único sub-grupo.
    const isProgressed = key.startsWith("progressed:");
    const sorted = [...items].sort((a, b) =>
      a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.id < b.id ? 1 : -1,
    );
    const chunks: FeedEvent[][] = [];
    for (const ev of sorted) {
      const last = chunks[chunks.length - 1];
      if (
        isProgressed &&
        last &&
        dayNumber(last[last.length - 1].eventDate) - dayNumber(ev.eventDate) > PROGRESS_WINDOW_DAYS
      ) {
        chunks.push([ev]); // hueco mayor que la ventana → nuevo sub-grupo
      } else if (last && (isProgressed || key.startsWith("added:"))) {
        last.push(ev);
      } else {
        chunks.push([ev]);
      }
    }
    for (const chunk of chunks) {
      if (chunk.length === 1) {
        const e = chunk[0];
        result.push({ source: "person", id: e.id, eventDate: e.eventDate, event: e });
        continue;
      }
      const newest = chunk[0]; // ya ordenado desc
      result.push({
        source: "person-group",
        // id único por página: `key` (actor+verbo, y para progressed también
        // obra) se repite entre páginas de "Cargar más"; el id real de `newest`
        // (único por fila) evita que FeedList colisione claves de React entre
        // grupos de páginas distintas con el mismo actor+obra.
        id: `group:${key}:${newest.id}`,
        eventDate: newest.eventDate,
        verb: newest.verb as PersonGroupEntry["verb"],
        actor: {
          id: newest.actorId,
          username: newest.actorUsername,
          displayName: newest.actorDisplayName,
          avatarUrl: newest.actorAvatarUrl,
        },
        items: chunk,
      });
    }
  }

  // Reordenar todo por fecha desc (el bucketing rompió el orden original).
  result.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.id < b.id ? 1 : -1));
  return result;
}
