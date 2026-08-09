import type { FeedEntry } from "./feed";
import { dayOf } from "./feed-order";

// La Actividad del perfil pinta el feed bajo cabeceras de día. Con posts cada
// entrada es una tarjeta propia y ya llega ordenada por fecha de publicación
// (`getFeed`), así que basta agrupar consecutivos por su día natural
// (`dayOf(eventDate)`, UTC). Antes esto además repartía por día las tarjetas
// "añadió N" multi-día (#348); esa agrupación desapareció al pasar a posts (no
// hay grupos que abarquen varios días), así que el bucketizado es directo.
export function bucketProfileFeed(entries: FeedEntry[]): { key: string; entries: FeedEntry[] }[] {
  const groups: { key: string; entries: FeedEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayOf(entry.eventDate);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  return groups;
}
