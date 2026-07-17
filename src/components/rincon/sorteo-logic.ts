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
};

export type SorteoFilters = {
  type: "all" | ItemType;
  dur: "any" | "short" | "med" | "long";
  state: "any" | "fresh";
};

export const DEFAULT_FILTERS: SorteoFilters = { type: "all", dur: "any", state: "any" };

// Tramos del mockup: ‹2 h / 2–5 h / +5 h. Sin estimación → sin bucket (solo
// entra con el filtro "Cualquiera").
export function durationBucket(minutes: number | null): "short" | "med" | "long" | null {
  if (minutes === null) return null;
  if (minutes < 120) return "short";
  if (minutes <= 300) return "med";
  return "long";
}

export function eligibleItems(pool: SorteoItem[], filters: SorteoFilters): SorteoItem[] {
  return pool.filter((item) => {
    if (filters.type !== "all" && item.itemType !== filters.type) return false;
    if (filters.dur !== "any" && durationBucket(item.estimatedMinutes) !== filters.dur) return false;
    if (filters.state === "fresh" && !item.fresh) return false;
    return true;
  });
}

export const SHELF_MAX = 12;

// Muestra aleatoria sin reemplazo (Fisher–Yates sobre copia). El rng es
// inyectable para poder testear sin azar.
export function sampleShelf(items: SorteoItem[], rng: () => number = Math.random): SorteoItem[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, SHELF_MAX);
}

// Elección uniforme del ganador. Vive aquí (y no inline en el componente)
// para poder inyectar el rng en tests y para que la impureza quede fuera del
// árbol que analiza el compilador de React.
export function pickIndex(length: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * length);
}

// Altura del lomo (55–100%) derivada del id: estable entre renders y entre
// aperturas, sin guardar estado.
export function spineHeight(itemId: string): number {
  let hash = 0;
  for (let i = 0; i < itemId.length; i++) hash = (hash * 31 + itemId.charCodeAt(i)) >>> 0;
  return 55 + (hash % 46);
}

// Colores del mockup (gradiente del lomo y acento por tipo).
export const SPINE_COLORS: Record<ItemType, { from: string; to: string }> = {
  book: { from: "#5f3418", to: "#8a4d2b" },
  movie: { from: "#234043", to: "#2f5457" },
  series: { from: "#463447", to: "#5f4459" },
};

export const TYPE_ACCENT: Record<ItemType, string> = {
  book: "#cf8a54",
  movie: "#6bb0b4",
  series: "#b592bd",
};
