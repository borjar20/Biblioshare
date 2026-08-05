import type { FeedEntry, FeedEvent, FeedVerb } from "./feed";
import { compareEntries, dayOf } from "./feed-order";

// Variante de presentación: N eventos del mismo actor colapsados en una tarjeta.
// NO es una entidad con fila propia — solo agrupa para pintar. La reacción de
// cada ítem vive en su propia fila real (ver spec D1/D2).
export type PersonGroupEntry = {
  source: "person-group";
  id: string;
  eventDate: string; // la del ítem más reciente
  orderDate: string; // la del ítem más reciente, para el orden final
  sortDate: string;  // la del ítem más reciente, para el orden final
  verb: Extract<FeedVerb, "added" | "progressed" | "rated" | "reviewed" | "watchedEpisode">;
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  items: FeedEvent[];
};

// Qué se agrupa: altas y sesiones por verbo, y las valoraciones de episodios
// (mismas filas de episode_watches, verbo rated/reviewed/watchedEpisode) por
// serie — se reconocen porque llevan datos de episodio. El resto (finished y las
// reseñas de obra completa, sin episode) y las entradas de club pasan intactos.
function isGroupable(e: FeedEvent): boolean {
  return e.verb === "added" || e.verb === "progressed" || e.episode != null;
}

// Ventana de agrupación, en días naturales. Se aplica distinto según el verbo:
//   added      → SPAN: el grupo abarca como máximo esta cantidad de días.
//   progressed → HUECO: parte cuando entre dos sesiones consecutivas pasan más
//                de esta cantidad de días.
// La asimetría es deliberada: en altas se acota lo que abarca la tarjeta; en
// sesiones se detecta el parón de una lectura, de modo que un libro leído a
// diario durante semanas sigue siendo UNA tarjeta.
export const GROUP_WINDOW_DAYS = 2;

// Días naturales entre dos fechas ISO (fecha-only o timestamp), sin usar Date
// (Date.now/new Date argless están prohibidos y aquí no hacen falta): se comparan
// los días como enteros epoch/86400.
function dayNumber(iso: string): number {
  const [y, m, d] = dayOf(iso).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

// El corte por días ya no vive en la clave: las altas se trocean después, por
// span, igual que las sesiones se trocean por hueco.
function groupKey(e: FeedEvent): string {
  if (e.verb === "added") return `added:${e.actorId}`;
  if (e.verb === "progressed") return `progressed:${e.actorId}:${e.itemType}:${e.itemId}`;
  // Episodios: por serie (itemId = series_id), sin importar el verbo concreto
  // de cada uno (rated/reviewed/watchedEpisode conviven en el mismo atracón).
  return `episodes:${e.actorId}:${e.itemId}`;
}

export function groupPersonEntries(entries: FeedEntry[]): FeedEntry[] {
  const buckets = new Map<string, FeedEvent[]>();
  const passthrough: FeedEntry[] = [];

  for (const entry of entries) {
    if (entry.source !== "person" || !isGroupable(entry.event)) {
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
    // Cada bucket es de una sola familia (el prefijo de la clave lo garantiza):
    // added, progressed, o los episodios de UNA serie. Todos se parten en
    // sub-grupos por GROUP_WINDOW_DAYS, con distinta referencia: progressed y
    // episodes por HUECO (detectan el parón entre sesiones/episodios
    // consecutivos); added por SPAN (acota lo que abarca la tarjeta).
    const useGap = key.startsWith("progressed:") || key.startsWith("episodes:");
    // Mismo comparador que el feed (día desc → sortDate desc → id desc): sin el
    // paso por sortDate, N sesiones del mismo día caían al id (uuid aleatorio)
    // y salían desordenadas en la tarjeta.
    const sorted = [...items].sort(compareEntries);
    const chunks: FeedEvent[][] = [];
    for (const ev of sorted) {
      const last = chunks[chunks.length - 1];
      if (!last) {
        chunks.push([ev]);
        continue;
      }
      // added: se compara contra el MÁS NUEVO del grupo, para acotar el span.
      // progressed: contra el ANTERIOR inmediato, para detectar el parón.
      const reference = useGap ? last[last.length - 1] : last[0];
      const distance = dayNumber(reference.eventDate) - dayNumber(ev.eventDate);
      const limit = useGap ? GROUP_WINDOW_DAYS : GROUP_WINDOW_DAYS - 1;
      if (distance > limit) chunks.push([ev]);
      else last.push(ev);
    }
    for (const chunk of chunks) {
      if (chunk.length === 1) {
        const e = chunk[0];
        result.push({ source: "person", id: e.id, eventDate: e.eventDate, orderDate: e.orderDate, sortDate: e.sortDate, event: e });
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
        orderDate: newest.orderDate,
        sortDate: newest.sortDate,
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

  // Reordenar todo por la MISMA clave que usa el feed (el bucketing rompió el
  // orden original). Reutilizar el comparador evita que las dos definiciones
  // de "orden" se separen con el tiempo.
  result.sort(compareEntries);
  return result;
}
