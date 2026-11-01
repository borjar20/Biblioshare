// src/lib/profile/wall.ts
import type { ItemType } from "@/lib/catalog/types";
import type { FeedEntry, FeedEvent } from "@/lib/social/feed";

export type WallCoverState =
  | { kind: "rated"; rating: number }
  | { kind: "dropped" }
  | { kind: "finished" }
  | { kind: "episodes"; season: number | null; count: number }
  | { kind: "in_progress" };
export type WallCover = {
  key: string; itemType: ItemType; itemId: string; title: string; coverUrl: string | null;
  state: WallCoverState; postId: string | null; reactions: number; at: string;
  // La reseña con texto más reciente de la obra en el mes: la baldosa se ensancha
  // y enseña la cita (no se repite la obra como tarjeta aparte).
  review: { excerpt: string; isSpoiler: boolean; postId: string | null; rating: number | null } | null;
};
export type WallCard = { id: string; entry: FeedEntry; at: string };
export type WallItem = { type: "cover"; cover: WallCover } | { type: "card"; card: WallCard };
export type WallMonth = { key: string; coverCount: number; items: WallItem[] };

const COVER_VERBS = new Set(["started", "progressed", "finished", "rated", "reviewed", "dropped", "watchedEpisode"]);
const MADRID = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });

export function madridMonthKey(iso: string): string {
  return MADRID.format(new Date(iso)).slice(0, 7);
}

// Los grupos de persona (altas o avances colapsados para pintar) se deshacen:
// el muro hace su propia agrupación por obra y mes.
function flatten(entries: FeedEntry[]): FeedEntry[] {
  return entries.flatMap((e) =>
    e.source === "person-group"
      ? e.items.map((event): FeedEntry => ({ source: "person", id: event.id, eventDate: event.eventDate, orderDate: event.orderDate, sortDate: event.sortDate, event }))
      : [e],
  );
}

const isEpisodeEvent = (e: FeedEvent) => e.verb === "watchedEpisode" || e.episode !== null;

// Spec §5.2: nota (de la obra, no de un episodio) > la dejó > terminada >
// solo episodios > en curso. `events` va del más reciente al más antiguo.
// Conteo de episodios: un post `watchedEpisode` representa un día de visionado
// y su `episodes` ya incluye el episodio del propio evento (feed.ts: todos los
// de esa serie marcados ese día, el post cuelga del primero). Por eso cada
// evento aporta `episodes.length` y, si falta, 1 (el suyo); no se suma `episode`.
function stateOf(events: FeedEvent[]): WallCoverState {
  const rated = events.find((e) => !isEpisodeEvent(e) && e.rating !== null && ["finished", "rated", "reviewed"].includes(e.verb));
  if (rated) return { kind: "rated", rating: rated.rating! };
  if (events.some((e) => e.verb === "dropped")) return { kind: "dropped" };
  if (events.some((e) => e.verb === "finished")) return { kind: "finished" };
  if (events.every(isEpisodeEvent)) {
    const count = events.reduce((n, e) => n + (e.episodes?.length || 1), 0);
    return { kind: "episodes", season: events[0].episode?.season ?? null, count };
  }
  return { kind: "in_progress" };
}

export function buildProfileWall(entries: FeedEntry[]): WallMonth[] {
  const sorted = flatten(entries).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  const months: WallMonth[] = [];
  const byMonth = new Map<string, { month: WallMonth; covers: Map<string, { cover: WallCover; events: FeedEvent[] }> }>();

  for (const entry of sorted) {
    const key = madridMonthKey(entry.eventDate);
    let bucket = byMonth.get(key);
    if (!bucket) {
      bucket = { month: { key, coverCount: 0, items: [] }, covers: new Map() };
      byMonth.set(key, bucket);
      months.push(bucket.month);
    }
    const { month, covers } = bucket;
    const pushCard = (id: string) => month.items.push({ type: "card", card: { id, entry, at: entry.eventDate } });

    if (entry.source !== "person") {
      if (entry.source === "experience" || entry.source === "wrap_up") pushCard(entry.id);
      continue; // "club" no llega al feed de actor; si llegara, no es del muro.
    }
    const event = entry.event;
    if (!COVER_VERBS.has(event.verb)) {
      pushCard(entry.id); // thought, joint
      continue;
    }
    const coverKey = `${event.itemType}:${event.itemId}`;
    const existing = covers.get(coverKey);
    // Los eventos llegan del más reciente al más antiguo: la primera reseña con
    // texto que se ve es la más reciente.
    const review = event.verb === "reviewed" && event.reviewExcerpt
      ? { excerpt: event.reviewExcerpt, isSpoiler: event.reviewIsSpoiler, postId: event.postId ?? null, rating: event.rating }
      : null;
    if (existing) {
      existing.events.push(event);
      existing.cover.reactions += event.reactionCount;
      if (review && !existing.cover.review) existing.cover.review = review;
    } else {
      const cover: WallCover = {
        key: coverKey, itemType: event.itemType, itemId: event.itemId, title: event.itemTitle,
        coverUrl: event.itemCoverUrl, state: { kind: "in_progress" }, postId: event.postId ?? null,
        reactions: event.reactionCount, at: event.eventDate, review,
      };
      covers.set(coverKey, { cover, events: [event] });
      month.items.push({ type: "cover", cover });
      month.coverCount += 1;
    }
  }

  for (const { covers } of byMonth.values()) {
    for (const { cover, events } of covers.values()) cover.state = stateOf(events);
  }
  return months;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function wallMonthLabel(key: string, currentKey: string): string {
  const [y, m] = key.split("-").map(Number);
  const month = new Intl.DateTimeFormat("es", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
  return key.slice(0, 4) === currentKey.slice(0, 4) ? capitalize(month) : `${capitalize(month)} de ${y}`;
}
