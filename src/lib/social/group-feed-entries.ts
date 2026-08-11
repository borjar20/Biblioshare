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

// Descriptor de agrupación de un evento: la CLAVE (qué filas caen en el mismo
// bucket) y si la ventana se mide por HUECO o por SPAN. `null` = no se agrupa.
//
//   added      → SPAN: el grupo abarca como máximo GROUP_WINDOW_DAYS días.
//   progressed → HUECO: parte cuando entre dos sesiones consecutivas pasan más
//                de GROUP_WINDOW_DAYS días.
//   episodios  → HUECO, por serie (rated/reviewed/watchedEpisode del mismo
//                atracón conviven); se reconocen porque llevan datos de episodio.
// La asimetría es deliberada: en altas se acota lo que abarca la tarjeta; en
// sesiones se detecta el parón de una lectura, de modo que un libro leído a
// diario durante semanas sigue siendo UNA tarjeta.
export type GroupDescriptor = { key: string; useGap: boolean };

// Campos mínimos que deciden la agrupación: los comparten el evento final
// (FeedEvent) y el borrador que maneja getFeed antes de finalizar, así que el
// planificador de página puede llamar a esto sobre borradores.
type GroupableEventFields = Pick<FeedEvent, "verb" | "actorId" | "itemType" | "itemId" | "episode">;

export function descriptorForEvent(e: GroupableEventFields): GroupDescriptor | null {
  if (e.verb === "added") return { key: `added:${e.actorId}`, useGap: false };
  if (e.verb === "progressed")
    return { key: `progressed:${e.actorId}:${e.itemType}:${e.itemId}`, useGap: true };
  // Episodios: por serie (itemId = series_id), sin importar el verbo concreto
  // de cada uno (rated/reviewed/watchedEpisode conviven en el mismo atracón).
  if (e.episode != null) return { key: `episodes:${e.actorId}:${e.itemId}`, useGap: true };
  return null;
}

// Descriptor de una FeedEntry ya finalizada: solo los eventos de PERSONA se
// agrupan; club y person-group pasan intactos. (getFeed agrupa BORRADORES antes
// de finalizar con su propio lambda sobre `descriptorForEvent`, porque el
// evento borrador no es exactamente FeedEvent.)
export function descriptorForEntry(entry: FeedEntry): GroupDescriptor | null {
  if (entry.source !== "person") return null;
  return descriptorForEvent(entry.event);
}

// Ventana de agrupación, en días naturales (ver GroupDescriptor).
export const GROUP_WINDOW_DAYS = 2;

// Días naturales entre dos fechas ISO (fecha-only o timestamp), sin usar Date
// (Date.now/new Date argless están prohibidos y aquí no hacen falta): se comparan
// los días como enteros epoch/86400.
function dayNumber(iso: string): number {
  const [y, m, d] = dayOf(iso).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

// Forma mínima que el chunker necesita: la clave de orden. El descriptor de
// agrupación se pasa aparte, así el chunker sirve tanto a la presentación
// (FeedEntry final) como a la paginación (borradores en getFeed).
type Orderable = { orderDate: string; sortDate: string; id: string; eventDate: string };

// Parte un conjunto de entradas en TARJETAS (listas de miembros), aplicando la
// ventana por clave. Cada tarjeta viene ordenada desc; las tarjetas entre sí,
// por su miembro más nuevo (misma clave de orden que el feed). Las entradas sin
// descriptor (club, finished, reviewed) salen como tarjetas de un solo miembro.
//
// Es la pieza PURA que comparten `groupPersonEntries` (presentación) y el
// planificador de página (`feed-paging`): tener una sola definición de "qué es
// una tarjeta" evita que el orden del feed y el corte de página se separen.
export function chunkIntoCards<E extends Orderable>(
  entries: E[],
  descriptor: (e: E) => GroupDescriptor | null,
): E[][] {
  const buckets = new Map<string, { useGap: boolean; items: E[] }>();
  const singles: E[][] = [];

  for (const entry of entries) {
    const d = descriptor(entry);
    if (!d) {
      singles.push([entry]);
      continue;
    }
    const bucket = buckets.get(d.key);
    if (bucket) bucket.items.push(entry);
    else buckets.set(d.key, { useGap: d.useGap, items: [entry] });
  }

  const cards: E[][] = [...singles];
  for (const { useGap, items } of buckets.values()) {
    // Mismo comparador que el feed (día desc → sortDate desc → id desc): sin el
    // paso por sortDate, N sesiones del mismo día caían al id (uuid aleatorio)
    // y salían desordenadas en la tarjeta.
    const sorted = [...items].sort(compareEntries);
    let chunk: E[] = [];
    for (const ev of sorted) {
      if (chunk.length === 0) {
        chunk = [ev];
        continue;
      }
      // added: se compara contra el MÁS NUEVO del grupo, para acotar el span.
      // progressed/episodes: contra el ANTERIOR inmediato, para detectar el parón.
      const reference = useGap ? chunk[chunk.length - 1] : chunk[0];
      const distance = dayNumber(reference.eventDate) - dayNumber(ev.eventDate);
      const limit = useGap ? GROUP_WINDOW_DAYS : GROUP_WINDOW_DAYS - 1;
      if (distance > limit) {
        cards.push(chunk);
        chunk = [ev];
      } else {
        chunk.push(ev);
      }
    }
    if (chunk.length) cards.push(chunk);
  }

  // Orden final de tarjetas por su miembro más nuevo, misma clave que el feed.
  cards.sort((a, b) => compareEntries(a[0], b[0]));
  return cards;
}

export function groupPersonEntries(entries: FeedEntry[]): FeedEntry[] {
  const cards = chunkIntoCards(entries, descriptorForEntry);
  const result: FeedEntry[] = [];

  for (const card of cards) {
    // Tarjeta de un solo miembro: sale tal cual (person / club / no agrupable).
    if (card.length === 1) {
      result.push(card[0]);
      continue;
    }
    // Varios miembros ⇒ un grupo agrupable de personas (el descriptor lo
    // garantiza: club y no agrupables nunca comparten bucket).
    const newestEntry = card[0]; // ya ordenado desc
    if (newestEntry.source !== "person") {
      // Defensivo: un bucket multi-miembro solo puede ser de personas.
      result.push(...card);
      continue;
    }
    const newest = newestEntry.event;
    const key = descriptorForEvent(newest)!.key;
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
      items: card.map((c) => {
        if (c.source !== "person") throw new Error("grupo con miembro no-persona");
        return c.event;
      }),
    });
  }

  return result;
}
