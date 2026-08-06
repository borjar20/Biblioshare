import type { FeedEntry, FeedEvent } from "./feed";
import type { PersonGroupEntry } from "./group-feed-entries";
import { compareEntries, dayOf } from "./feed-order";

// La Actividad del perfil pinta el feed bajo cabeceras de día. Una tarjeta
// "añadió N" (person-group, verbo `added`) puede abarcar hasta 2 días naturales
// (GROUP_WINDOW_DAYS), así que archivarla entera bajo el día de su ítem más
// reciente esconde las altas del día anterior de la cabecera de "Ayer" (#348).
//
// Aquí, SOLO para el perfil, esos grupos de altas multi-día se reparten en un
// sub-grupo por día natural antes de bucketizar. El feed del Inicio no tiene
// cabeceras de día y conserva la tarjeta única. Los timelines de avances/episodios
// (grupos por HUECO) pueden abarcar semanas a propósito: no se parten.

function personEntry(e: FeedEvent): FeedEntry {
  return { source: "person", id: e.id, eventDate: e.eventDate, orderDate: e.orderDate, sortDate: e.sortDate, event: e };
}

function addedGroupForDay(actor: PersonGroupEntry["actor"], items: FeedEvent[]): PersonGroupEntry {
  const newest = items[0]; // el grupo llega ya ordenado desc
  return {
    source: "person-group",
    // Id único: el uuid del ítem más nuevo del día (único por fila) evita que
    // dos sub-grupos del mismo actor colisionen claves de React.
    id: `group:added:${actor.id}:${newest.id}`,
    eventDate: newest.eventDate,
    orderDate: newest.orderDate,
    sortDate: newest.sortDate,
    verb: "added",
    actor,
    items,
  };
}

function splitAddedByDay(entry: PersonGroupEntry): FeedEntry[] {
  const byDay = new Map<string, FeedEvent[]>();
  for (const item of entry.items) {
    const key = dayOf(item.eventDate);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }
  const out: FeedEntry[] = [];
  for (const items of byDay.values()) {
    out.push(items.length === 1 ? personEntry(items[0]) : addedGroupForDay(entry.actor, items));
  }
  return out;
}

export function bucketProfileFeed(entries: FeedEntry[]): { key: string; entries: FeedEntry[] }[] {
  const expanded: FeedEntry[] = [];
  for (const entry of entries) {
    if (
      entry.source === "person-group" &&
      entry.verb === "added" &&
      new Set(entry.items.map((i) => dayOf(i.eventDate))).size > 1
    ) {
      expanded.push(...splitAddedByDay(entry));
      continue;
    }
    expanded.push(entry);
  }

  // Reordenar por la MISMA clave del feed: los sub-grupos recién partidos deben
  // caer en su sitio cronológico (el sub-grupo del día anterior no puede quedar
  // pegado al del día más reciente, o la cabecera de "Ayer" saldría entre
  // eventos de "Hoy"). compareEntries es idempotente sobre lo no tocado, que ya
  // venía en este orden desde getFeed.
  expanded.sort(compareEntries);

  const groups: { key: string; entries: FeedEntry[] }[] = [];
  for (const entry of expanded) {
    const key = dayOf(entry.eventDate);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  return groups;
}
