import type { ItemType } from "@/lib/catalog/types";

// Un pendiente listo para el sorteo: metadatos ya resueltos en servidor
// (get-sorteo-pool) para que el cliente no consulte nada.
export type SorteoItem = {
  itemType: ItemType;
  itemId: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  metaText: string;
  estimatedMinutes: number | null;
  estimateText: string | null;
  fresh: boolean;
  // Colecciones **sorteables** a las que pertenece la obra (§7.28).
  collectionIds: string[];
  // `passes.created_at` del pase planned: desde cuándo espera (antojo «Lo que más espera» y frases).
  plannedSince: string;
  // Solo series; alimenta «Miniserie» y la etiqueta de temporadas del lomo.
  totalEpisodes: number | null;
};

export type SorteoCollection = { id: string; name: string };
export type TypeFilter = "all" | ItemType;
export type TimeBucket = "short" | "med" | "long" | "none";
export type AntojoId = "any" | "quick" | "wait" | "fresh" | `col:${string}`;
export type SorteoSettings = { type: TypeFilter; antojo: AntojoId; buckets: TimeBucket[] };
export type Antojo = { id: AntojoId; icon: string; collectionName?: string };

export const ALL_BUCKETS: TimeBucket[] = ["short", "med", "long", "none"];
export const DEFAULT_SETTINGS: SorteoSettings = { type: "all", antojo: "any", buckets: ALL_BUCKETS };
export const BOOKCASE_MAX = 24;

export const itemKey = (i: Pick<SorteoItem, "itemType" | "itemId">) => `${i.itemType}:${i.itemId}`;

export function durationBucket(minutes: number | null): TimeBucket {
  if (minutes === null) return "none";
  if (minutes < 120) return "short";
  if (minutes <= 300) return "med";
  return "long";
}

// «Lectura corta» / «Para esta noche» / «Miniserie»: el umbral depende del tipo (spec, Controles).
export function isQuick(item: SorteoItem): boolean {
  if (item.itemType === "series") {
    return (
      (item.totalEpisodes !== null && item.totalEpisodes <= 10) ||
      (item.estimatedMinutes !== null && item.estimatedMinutes <= 480)
    );
  }
  const limit = item.itemType === "book" ? 240 : 150;
  return item.estimatedMinutes !== null && item.estimatedMinutes <= limit;
}

// Con «Todo» no hay antojo de duración: su significado cambia según el tipo.
export function antojosFor(type: TypeFilter, collections: SorteoCollection[]): Antojo[] {
  if (type !== "all") {
    const quickIcon = type === "book" ? "☕" : type === "movie" ? "🌙" : "🍿";
    return [
      { id: "any", icon: "🎲" },
      { id: "quick", icon: quickIcon },
      { id: "wait", icon: "⏳" },
      { id: "fresh", icon: "✨" },
    ];
  }
  return [
    { id: "any", icon: "🎲" },
    { id: "wait", icon: "⏳" },
    { id: "fresh", icon: "✨" },
    ...collections.map((c) => ({ id: `col:${c.id}` as AntojoId, icon: "📚", collectionName: c.name })),
  ];
}

const TYPES: TypeFilter[] = ["all", "book", "movie", "series"];

// Lo que llega de localStorage puede ser viejo o basura: se repara contra el tipo y las colecciones actuales.
export function normalizeSettings(s: SorteoSettings, collections: SorteoCollection[]): SorteoSettings {
  const type = TYPES.includes(s?.type) ? s.type : "all";
  const valid = antojosFor(type, collections).map((a) => a.id);
  const antojo = valid.includes(s?.antojo) ? s.antojo : "any";
  const buckets = Array.isArray(s?.buckets) ? s.buckets.filter((b) => ALL_BUCKETS.includes(b)) : [];
  return { type, antojo, buckets: buckets.length > 0 ? buckets : ALL_BUCKETS };
}

// El tercio del conjunto que más tiempo lleva esperando, con un mínimo de 3 lomos.
export function longestWaiting(items: SorteoItem[]): SorteoItem[] {
  const sorted = [...items].sort((a, b) => a.plannedSince.localeCompare(b.plannedSince));
  return sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 3)));
}

export function eligibleItems(
  pool: SorteoItem[],
  settings: SorteoSettings,
  antojo: AntojoId = settings.antojo
): SorteoItem[] {
  let items = pool;
  if (settings.type !== "all") items = items.filter((i) => i.itemType === settings.type);
  if (settings.buckets.length < ALL_BUCKETS.length) {
    items = items.filter((i) => settings.buckets.includes(durationBucket(i.estimatedMinutes)));
  }
  if (antojo === "any") return items;
  if (antojo === "fresh") return items.filter((i) => i.fresh);
  if (antojo === "quick") return items.filter(isQuick);
  if (antojo === "wait") return longestWaiting(items);
  const collectionId = antojo.slice("col:".length);
  return items.filter((i) => i.collectionIds.includes(collectionId));
}

// Fisher–Yates sobre copia; rng inyectable para tests.
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sampleCandidates(items: SorteoItem[], rng: () => number = Math.random, n = 3): SorteoItem[] {
  return shuffle(items, rng).slice(0, n);
}

export function pickIndex(length: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * length);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Grosor del lomo en px (antes de la escala del mueble): el tiempo a tu ritmo se ve en la balda.
export function spineWidth(item: SorteoItem): number {
  const w = item.estimatedMinutes === null ? 26 : Math.round(20 + Math.min(item.estimatedMinutes / 60, 12) * 1.7);
  return item.itemType === "series" ? Math.max(w, 32) : w;
}

// Altura en % de la balda (66–95), estable entre renders y aperturas.
export function spineHeight(itemId: string): number {
  return 66 + (hash(itemId) % 30);
}

// Varios tonos por familia: el tipo se lee por el color sin que la balda sea monótona.
const SHADES: Record<ItemType, string[]> = {
  book: ["#b5652f", "#8e3b2b", "#c48a3a", "#6f4a2a", "#a3553a", "#9c7a3c"],
  movie: ["#2f6f73", "#3e5f78", "#4f8a86", "#2c4f5c"],
  series: ["#6b4d77", "#7e5470", "#56497a", "#8a5f8f"],
};
export function spineShade(item: SorteoItem): string {
  const shades = SHADES[item.itemType];
  return shades[hash(item.itemId) % shades.length];
}

export function seasonsLabel(item: SorteoItem): string {
  const seasons = item.totalEpisodes ? Math.max(1, Math.round(item.totalEpisodes / 9)) : 1;
  return seasons > 1 ? `T1–${seasons}` : "T1";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}

// Portada de reserva (sin coverUrl) y acento por tipo.
export const TYPE_COVER: Record<ItemType, [string, string]> = {
  book: ["#a8643a", "#e0a94a"],
  movie: ["#2f6f73", "#6bb0b4"],
  series: ["#6b4d77", "#b592bd"],
};
export const TYPE_ACCENT: Record<ItemType, string> = { book: "#cf8a54", movie: "#6bb0b4", series: "#b592bd" };
