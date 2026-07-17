# Sorteo "Sacar un lomo" (animado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolucionar la tarjeta "¿No sabes qué leer?" del Rincón hacia el ritual animado del mockup: hoja modal con estantería de lomos reales, filtros (tipo/duración/estado), ruleta animada y CTA que crea el pase.

**Architecture:** Lógica pura testeable en `sorteo-logic.ts` (filtros, buckets, muestra, alturas); pool resuelto en servidor (`get-sorteo-pool.ts`) reutilizando los helpers de estimación de «Para más tarde» (`src/lib/queue/*`); UI cliente en `sorteo-sheet.tsx` con `<dialog>` nativo (patrón `new-pass-sheet.tsx`); el CTA reutiliza la server action `updateStatus`.

**Tech Stack:** Next.js App Router, React client components, next-intl, Supabase (solo lectura nueva; la mutación ya existe), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-17-sorteo-lomo-animado-design.md`

## Global Constraints

- Solo existe un locale: `messages/es.json`. Copy nueva bajo el namespace `rincon` existente.
- La hoja va SIEMPRE en oscuro espresso con colores fijos del mockup (`#1f1a16` fondo, `#2a231d` surface, borde `rgba(240,232,219,.12)`, texto `#f0e8db`, muted `#a99e8c`, accent `#d98a5c`, gold `#e0a94a`), independiente del tema. Igual que la tarjeta `spine-draw.tsx` actual.
- Colores de lomo por tipo (mockup): libro `#5f3418→#8a4d2b`, película `#234043→#2f5457`, serie `#463447→#5f4459`. Acentos: libro `#cf8a54`, película `#6bb0b4`, serie `#b592bd`.
- Vitest necesita Node 22 — el shell arranca en 20.9: ejecuta `fnm use` en la raíz del repo antes de `npm test` (el `.nvmrc` ya está corregido).
- Respetar `prefers-reduced-motion`: sin ruleta ni flip-in, resultado directo.
- Commits frecuentes, mensajes en español siguiendo el estilo del repo (`feat(rincon): …`).

---

### Task 1: Lógica pura del sorteo (`sorteo-logic.ts`)

**Files:**
- Create: `src/components/rincon/sorteo-logic.ts`
- Test: `src/components/rincon/sorteo-logic.test.ts`

**Interfaces:**
- Consumes: `ItemType` de `@/lib/catalog/types` (`"book" | "movie" | "series"`).
- Produces (los usan las Tasks 2–4):
  - `type SorteoItem = { itemType: ItemType; itemId: string; title: string; subtitle: string | null; coverUrl: string | null; metaText: string; estimatedMinutes: number | null; estimateText: string | null; fresh: boolean }`
  - `type SorteoFilters = { type: "all" | ItemType; dur: "any" | "short" | "med" | "long"; state: "any" | "fresh" }`
  - `DEFAULT_FILTERS: SorteoFilters`
  - `durationBucket(minutes: number | null): "short" | "med" | "long" | null`
  - `eligibleItems(pool: SorteoItem[], filters: SorteoFilters): SorteoItem[]`
  - `SHELF_MAX = 12` y `sampleShelf(items: SorteoItem[], rng?: () => number): SorteoItem[]`
  - `spineHeight(itemId: string): number` (55–100, determinista)
  - `SPINE_COLORS: Record<ItemType, { from: string; to: string }>` y `TYPE_ACCENT: Record<ItemType, string>`

- [ ] **Step 1: Write the failing test**

Crea `src/components/rincon/sorteo-logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  durationBucket,
  eligibleItems,
  sampleShelf,
  SHELF_MAX,
  spineHeight,
  type SorteoItem,
} from "./sorteo-logic";

function item(overrides: Partial<SorteoItem>): SorteoItem {
  return {
    itemType: "book",
    itemId: "id-1",
    title: "Piranesi",
    subtitle: "Susanna Clarke",
    coverUrl: null,
    metaText: "272 pág.",
    estimatedMinutes: 236,
    estimateText: "272 páginas ÷ 1.15 páginas/min ≈ 3h 56min",
    fresh: true,
    ...overrides,
  };
}

describe("durationBucket", () => {
  it("‹2h es short, el límite 120 ya es med", () => {
    expect(durationBucket(119)).toBe("short");
    expect(durationBucket(120)).toBe("med");
  });

  it("2–5h es med, más de 300 es long", () => {
    expect(durationBucket(300)).toBe("med");
    expect(durationBucket(301)).toBe("long");
  });

  it("sin estimación no hay bucket", () => {
    expect(durationBucket(null)).toBeNull();
  });
});

describe("eligibleItems", () => {
  const pool: SorteoItem[] = [
    item({ itemId: "b1", itemType: "book", estimatedMinutes: 90 }),
    item({ itemId: "m1", itemType: "movie", estimatedMinutes: 105, fresh: false }),
    item({ itemId: "s1", itemType: "series", estimatedMinutes: 480 }),
    item({ itemId: "b2", itemType: "book", estimatedMinutes: null }),
  ];

  it("sin filtros pasa todo el pool", () => {
    expect(eligibleItems(pool, DEFAULT_FILTERS)).toHaveLength(4);
  });

  it("filtra por tipo", () => {
    const out = eligibleItems(pool, { ...DEFAULT_FILTERS, type: "book" });
    expect(out.map((i) => i.itemId)).toEqual(["b1", "b2"]);
  });

  it("filtra por duración y excluye los ítems sin estimación", () => {
    const out = eligibleItems(pool, { ...DEFAULT_FILTERS, dur: "short" });
    expect(out.map((i) => i.itemId)).toEqual(["b1", "m1"]);
  });

  it("'sin empezar' deja solo los fresh", () => {
    const out = eligibleItems(pool, { ...DEFAULT_FILTERS, state: "fresh" });
    expect(out.map((i) => i.itemId)).toEqual(["b1", "s1", "b2"]);
  });

  it("los filtros se combinan (AND)", () => {
    const out = eligibleItems(pool, { type: "movie", dur: "short", state: "fresh" });
    expect(out).toHaveLength(0);
  });
});

describe("sampleShelf", () => {
  const many = Array.from({ length: 30 }, (_, i) => item({ itemId: `id-${i}` }));

  it("recorta a SHELF_MAX sin repetir", () => {
    const out = sampleShelf(many, () => 0.5);
    expect(out).toHaveLength(SHELF_MAX);
    expect(new Set(out.map((i) => i.itemId)).size).toBe(SHELF_MAX);
  });

  it("con pocos ítems los devuelve todos", () => {
    expect(sampleShelf(many.slice(0, 3), () => 0.5)).toHaveLength(3);
  });

  it("no muta el array de entrada", () => {
    const input = many.slice(0, 5);
    const before = input.map((i) => i.itemId);
    sampleShelf(input, () => 0.1);
    expect(input.map((i) => i.itemId)).toEqual(before);
  });
});

describe("spineHeight", () => {
  it("es determinista y queda en 55–100", () => {
    const a = spineHeight("abc-123");
    expect(a).toBe(spineHeight("abc-123"));
    for (const id of ["a", "zz-9", "0f8e", "otro-id-largo-uuid"]) {
      const h = spineHeight(id);
      expect(h).toBeGreaterThanOrEqual(55);
      expect(h).toBeLessThanOrEqual(100);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `fnm use && npm test -- sorteo-logic`
Expected: FAIL — `Cannot find module './sorteo-logic'` (o equivalente).

- [ ] **Step 3: Write minimal implementation**

Crea `src/components/rincon/sorteo-logic.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `fnm use && npm test -- sorteo-logic`
Expected: PASS (todos los describes).

- [ ] **Step 5: Commit**

```bash
git add src/components/rincon/sorteo-logic.ts src/components/rincon/sorteo-logic.test.ts
git commit -m "feat(rincon): logica pura del sorteo — filtros, buckets y estanteria"
```

---

### Task 2: Pool del sorteo en servidor (`get-sorteo-pool.ts`)

**Files:**
- Create: `src/lib/queue/fetch-catalog-meta.ts` (extracción DRY desde `get-queue-items.ts`)
- Modify: `src/lib/queue/get-queue-items.ts` (usa la extracción; misma conducta)
- Create: `src/lib/rincon/get-sorteo-pool.ts`

**Interfaces:**
- Consumes: `computeQueueEstimates(items: QueueItem[], bookPace, moviePace)` de `@/lib/queue/compute-estimates`; `getBookPace(supabase, userId)` de `@/lib/queue/get-reading-pace`; `getMoviePace(supabase, userId)` de `@/lib/queue/get-movie-cadence`; `formatDuration(minutes)` de `@/lib/queue/format-duration`; `SorteoItem` de Task 1.
- Produces: `getSorteoPool(supabase: SupabaseServerClient, userId: string): Promise<SorteoItem[]>` — lo consume Task 4 (rincon-tab).

- [ ] **Step 1: Extraer `fetchCatalogMeta` de `get-queue-items.ts`**

Crea `src/lib/queue/fetch-catalog-meta.ts` moviendo el bloque de las tres consultas de catálogo (líneas ~41–95 de `get-queue-items.ts`) tal cual:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { QueueItem } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CatalogMeta = Omit<
  QueueItem,
  "entryId" | "itemId" | "itemType" | "queueId" | "queueOrder"
>;

// Resuelve la ficha de catálogo (título, portada, metadatos de duración) para
// un conjunto de ids por tipo. Compartido por la cola (§7.22) y el sorteo.
export async function fetchCatalogMeta(
  supabase: SupabaseServerClient,
  idsByType: Record<ItemType, string[]>
): Promise<Map<string, CatalogMeta>> {
  const [books, movies, series] = await Promise.all([
    idsByType.book.length
      ? supabase.from("books").select("id, title, author, cover_url, total_pages").in("id", idsByType.book)
      : Promise.resolve({ data: [] }),
    idsByType.movie.length
      ? supabase
          .from("movies")
          .select("id, title, cover_url, duration_minutes, tmdb_id")
          .in("id", idsByType.movie)
      : Promise.resolve({ data: [] }),
    idsByType.series.length
      ? supabase
          .from("series")
          .select("id, title, cover_url, total_episodes, episode_runtime_minutes, tmdb_id")
          .in("id", idsByType.series)
      : Promise.resolve({ data: [] }),
  ]);

  const metaByKey = new Map<string, CatalogMeta>();
  for (const row of books.data ?? []) {
    metaByKey.set(`book:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: row.author,
      totalPages: row.total_pages,
      durationMinutes: null,
      totalEpisodes: null,
      episodeRuntimeMinutes: null,
      tmdbId: null,
    });
  }
  for (const row of movies.data ?? []) {
    metaByKey.set(`movie:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
      totalPages: null,
      durationMinutes: row.duration_minutes,
      totalEpisodes: null,
      episodeRuntimeMinutes: null,
      tmdbId: row.tmdb_id,
    });
  }
  for (const row of series.data ?? []) {
    metaByKey.set(`series:${row.id}`, {
      title: row.title,
      coverUrl: row.cover_url,
      subtitle: null,
      totalPages: null,
      durationMinutes: null,
      totalEpisodes: row.total_episodes,
      episodeRuntimeMinutes: row.episode_runtime_minutes,
      tmdbId: row.tmdb_id,
    });
  }
  return metaByKey;
}
```

En `get-queue-items.ts`: borra el bloque movido y el tipo local `CatalogMeta`, importa `fetchCatalogMeta` y sustituye por `const metaByKey = await fetchCatalogMeta(supabase, idsByType);`. El `return` final no cambia.

- [ ] **Step 2: Verificar que nada se rompió**

Run: `fnm use && npm test -- queue && npx tsc --noEmit`
Expected: los tests de `compute-estimates` PASS; tsc sin errores.

- [ ] **Step 3: Escribir `get-sorteo-pool.ts`**

Crea `src/lib/rincon/get-sorteo-pool.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { QueueItem } from "@/lib/queue/types";
import type { SorteoItem } from "@/components/rincon/sorteo-logic";
import { fetchCatalogMeta } from "@/lib/queue/fetch-catalog-meta";
import { computeQueueEstimates } from "@/lib/queue/compute-estimates";
import { getBookPace } from "@/lib/queue/get-reading-pace";
import { getMoviePace } from "@/lib/queue/get-movie-cadence";
import { formatDuration } from "@/lib/queue/format-duration";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Español fijo, como formatDuration (ver su nota sobre next-intl).
function metaText(item: QueueItem): string {
  if (item.itemType === "book") return item.totalPages ? `${item.totalPages} pág.` : "Libro";
  if (item.itemType === "movie")
    return item.durationMinutes ? `Película · ${formatDuration(item.durationMinutes)}` : "Película";
  return item.totalEpisodes ? `Serie · ${item.totalEpisodes} episodios` : "Serie";
}

// El pool del sorteo (spec 2026-07-17): TODOS los pendientes del usuario (pase
// activo planned, con o sin cola), cada uno con su estimación transparente
// (§7.22, mismos helpers que «Para más tarde») y el flag `fresh` = sin ningún
// pase anterior con la obra (primera vez).
export async function getSorteoPool(
  supabase: SupabaseServerClient,
  userId: string
): Promise<SorteoItem[]> {
  const { data: entries, error } = await supabase
    .from("passes")
    .select("id, item_type, item_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("status", "planned");
  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const entry of entries) idsByType[entry.item_type].push(entry.item_id);

  const [metaByKey, bookPace, moviePace, previous] = await Promise.all([
    fetchCatalogMeta(supabase, idsByType),
    getBookPace(supabase, userId),
    getMoviePace(supabase, userId),
    // Pases archivados = la obra ya se leyó/vio alguna vez → no es "sin empezar".
    supabase
      .from("passes")
      .select("item_type, item_id")
      .eq("user_id", userId)
      .eq("is_active", false),
  ]);
  if (previous.error) throw previous.error;
  const seen = new Set((previous.data ?? []).map((p) => `${p.item_type}:${p.item_id}`));

  // Ítems sin obra en catálogo se descartan (mismo criterio que getQueueItems).
  const queueItems: QueueItem[] = entries.flatMap((entry) => {
    const meta = metaByKey.get(`${entry.item_type}:${entry.item_id}`);
    if (!meta) return [];
    return [
      {
        entryId: entry.id,
        itemId: entry.item_id,
        itemType: entry.item_type,
        queueId: null,
        queueOrder: 0,
        ...meta,
      } satisfies QueueItem,
    ];
  });

  const estimates = computeQueueEstimates(queueItems, bookPace, moviePace);

  return queueItems.map((item) => {
    const estimate = estimates.perItem[item.entryId];
    const minutes = estimate?.minutes ?? null;
    return {
      itemType: item.itemType,
      itemId: item.itemId,
      title: item.title,
      subtitle: item.subtitle,
      coverUrl: item.coverUrl,
      metaText: metaText(item),
      estimatedMinutes: minutes,
      estimateText: minutes !== null ? estimate.formulaText : null,
      fresh: !seen.has(`${item.itemType}:${item.itemId}`),
    };
  });
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/fetch-catalog-meta.ts src/lib/queue/get-queue-items.ts src/lib/rincon/get-sorteo-pool.ts
git commit -m "feat(rincon): pool del sorteo con estimaciones y flag sin-empezar"
```

---

### Task 3: Copy + hoja del sorteo (`sorteo-sheet.tsx`)

**Files:**
- Modify: `messages/es.json` (namespace `rincon`)
- Modify: `src/app/globals.css` (keyframes; si el CSS global vive en otra ruta, localizarlo con `ls src/app/*.css` y usar ese)
- Create: `src/components/rincon/sorteo-sheet.tsx`

**Interfaces:**
- Consumes: todo lo de Task 1; `updateStatus(itemType, itemId, "in_progress")` de `@/lib/library/manage-actions` (devuelve `Promise<TransitionOutcome>` con `kind: "done" | "askResume"`); `itemHref` de `@/lib/catalog/item-href`.
- Produces: `SorteoSheet({ pool, open, onClose }: { pool: SorteoItem[]; open: boolean; onClose: () => void })` — lo consume Task 4 (spine-draw).

- [ ] **Step 1: Añadir la copy a `messages/es.json`**

Dentro del objeto `"rincon"` existente, añade (sin tocar las claves actuales):

```json
"sorteoTitle": "Deja que decida la estantería",
"sorteoCount": "{count, plural, one {# título en el sorteo} other {# títulos en el sorteo}}. Deja que decida el azar.",
"sorteoNoMatch": "Ningún título con estos filtros. Prueba a ampliarlos.",
"sorteoDrawn": "El azar ha hablado.",
"sorteoDraw": "Sorpréndeme",
"sorteoAgain": "↻ Otra vez",
"sorteoResultLabel": "El azar ha elegido",
"sorteoClose": "Cerrar",
"sorteoFilterAll": "Todos",
"sorteoFilterBooks": "Libros",
"sorteoFilterMovies": "Películas",
"sorteoFilterSeries": "Series",
"sorteoFilterCustom": "Filtros",
"sorteoFilterDurationLabel": "Duración estimada",
"sorteoFilterDurAny": "Cualquiera",
"sorteoFilterDurShort": "‹ 2 h",
"sorteoFilterDurMed": "2 – 5 h",
"sorteoFilterDurLong": "+5 h",
"sorteoFilterStateLabel": "Estado del pase",
"sorteoFilterStateAny": "Todos los pendientes",
"sorteoFilterStateFresh": "Sin empezar",
"sorteoCtaBook": "Empezar a leer",
"sorteoCtaMovie": "Ver esta noche",
"sorteoCtaSeries": "Empezar la T1",
"sorteoCtaDone": "✓ En curso",
"sorteoCtaError": "No se pudo empezar. Ábrelo desde su ficha.",
"sorteoGoToItem": "Ver ficha"
```

- [ ] **Step 2: Añadir los keyframes al CSS global**

Al final de `src/app/globals.css`:

```css
/* Sorteo «sacar un lomo» (Rincón): flip-in de la portada al revelar. */
@keyframes sorteo-flip-in {
  from {
    transform: perspective(700px) rotateY(85deg) scale(0.85);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.sorteo-flip-in {
  animation: sorteo-flip-in 0.65s cubic-bezier(0.34, 1.4, 0.64, 1);
  transform-origin: center bottom;
}
@media (prefers-reduced-motion: reduce) {
  .sorteo-flip-in {
    animation: none;
  }
}
```

- [ ] **Step 3: Escribir `sorteo-sheet.tsx`**

Crea `src/components/rincon/sorteo-sheet.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { updateStatus } from "@/lib/library/manage-actions";
import {
  DEFAULT_FILTERS,
  eligibleItems,
  sampleShelf,
  spineHeight,
  SPINE_COLORS,
  TYPE_ACCENT,
  type SorteoFilters,
  type SorteoItem,
} from "./sorteo-logic";

// La ceremonia es el producto (mockup «Sorteo · Sacar un lomo»): el ganador se
// decide ANTES de animar; la ruleta solo desacelera hasta él. Fases:
// shelf (estantería quieta) → spinning (tick recorriendo lomos) → revealed.
type Phase = "shelf" | "spinning" | "revealed";

const TYPE_FILTERS: { value: SorteoFilters["type"]; labelKey: string }[] = [
  { value: "all", labelKey: "sorteoFilterAll" },
  { value: "book", labelKey: "sorteoFilterBooks" },
  { value: "movie", labelKey: "sorteoFilterMovies" },
  { value: "series", labelKey: "sorteoFilterSeries" },
];

const DUR_FILTERS: { value: SorteoFilters["dur"]; labelKey: string }[] = [
  { value: "any", labelKey: "sorteoFilterDurAny" },
  { value: "short", labelKey: "sorteoFilterDurShort" },
  { value: "med", labelKey: "sorteoFilterDurMed" },
  { value: "long", labelKey: "sorteoFilterDurLong" },
];

const STATE_FILTERS: { value: SorteoFilters["state"]; labelKey: string }[] = [
  { value: "any", labelKey: "sorteoFilterStateAny" },
  { value: "fresh", labelKey: "sorteoFilterStateFresh" },
];

const CTA_KEY: Record<ItemType, string> = {
  book: "sorteoCtaBook",
  movie: "sorteoCtaMovie",
  series: "sorteoCtaSeries",
};

export function SorteoSheet({
  pool,
  open,
  onClose,
}: {
  pool: SorteoItem[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("rincon");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timers = useRef<number[]>([]);

  const [filters, setFilters] = useState<SorteoFilters>(DEFAULT_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [shelfSeed, setShelfSeed] = useState(0);
  const [phase, setPhase] = useState<Phase>("shelf");
  const [tickIndex, setTickIndex] = useState<number | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [ctaState, setCtaState] = useState<"idle" | "done" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const eligible = useMemo(() => eligibleItems(pool, filters), [pool, filters]);
  // shelfSeed fuerza el rebarajado en cada apertura de la hoja.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shelf = useMemo(() => sampleShelf(eligible), [eligible, shelfSeed]);

  // Mismo <dialog> nativo que new-pass-sheet.tsx: foco atrapado y Escape
  // gratis; "close" es la única vía de aviso al padre.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setShelfSeed((s) => s + 1);
      resetToShelf();
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => timers.current.forEach((id) => clearTimeout(id));
  }, []);

  function clearTimers() {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
  }

  function resetToShelf() {
    clearTimers();
    setPhase("shelf");
    setTickIndex(null);
    setWinner(null);
    setCtaState("idle");
  }

  function setFilter(patch: Partial<SorteoFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
    resetToShelf();
  }

  // forcedPos: tocar un lomo concreto lo saca directamente (mockup).
  function draw(forcedPos?: number) {
    if (shelf.length === 0 || phase === "spinning" || pending) return;
    const target = forcedPos ?? Math.floor(Math.random() * shelf.length);
    resetToShelf();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || shelf.length === 1) {
      setWinner(target);
      setPhase("revealed");
      return;
    }

    setPhase("spinning");
    const steps = shelf.length + target + 1;
    let step = 0;
    let delay = 40;
    const run = () => {
      setTickIndex(step % shelf.length);
      step += 1;
      if (step < steps) {
        delay = Math.min(delay * 1.16, 240);
        timers.current.push(window.setTimeout(run, delay));
      } else {
        // Pausa con el ganador elevado y el resto atenuado, luego revelado.
        setTickIndex(null);
        setWinner(target);
        timers.current.push(window.setTimeout(() => setPhase("revealed"), 520));
      }
    };
    run();
  }

  const picked = winner !== null ? shelf[winner] : null;

  function start() {
    if (!picked || pending || ctaState === "done") return;
    startTransition(async () => {
      try {
        const outcome = await updateStatus(picked.itemType, picked.itemId, "in_progress");
        setCtaState(outcome.kind === "done" ? "done" : "error");
      } catch {
        setCtaState("error");
      }
    });
  }

  // ✕: desde el resultado vuelve a la estantería (conserva filtros); desde la
  // estantería cierra la hoja.
  function handleClose() {
    if (phase === "revealed" || phase === "spinning") resetToShelf();
    else onClose();
  }

  const customActive = filters.dur !== "any" || filters.state !== "any";
  const revealed = phase === "revealed" && picked;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none rounded-none p-0 backdrop:bg-black/60 sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:w-[540px] sm:rounded-[20px]"
      style={{ background: "#1f1a16", color: "#f0e8db", border: "1px solid rgba(240,232,219,.12)" }}
      aria-label={t("sorteoTitle")}
    >
      <div className="flex h-full flex-col overflow-y-auto p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">{t("sorteoTitle")}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("sorteoClose")}
            className="grid h-9 w-9 place-items-center rounded-lg border text-sm"
            style={{ background: "#2a231d", borderColor: "rgba(240,232,219,.12)" }}
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-xs" style={{ color: "#a99e8c" }}>
          {revealed
            ? t("sorteoDrawn")
            : shelf.length === 0
              ? t("sorteoNoMatch")
              : t("sorteoCount", { count: eligible.length })}
        </p>

        {!revealed && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter({ type: f.value })}
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={
                    filters.type === f.value
                      ? { background: "#d98a5c", borderColor: "#d98a5c", color: "#1f1409" }
                      : { background: "#2a231d", borderColor: "rgba(240,232,219,.12)", color: "#a99e8c" }
                  }
                >
                  {f.value !== "all" && (
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: TYPE_ACCENT[f.value] }}
                    />
                  )}
                  {t(f.labelKey)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={
                  customActive
                    ? { background: "#d98a5c", borderColor: "#d98a5c", color: "#1f1409" }
                    : { background: "#2a231d", borderColor: "rgba(240,232,219,.12)", color: "#a99e8c" }
                }
              >
                ⚙ {t("sorteoFilterCustom")}
              </button>
            </div>

            {panelOpen && (
              <div
                className="mt-3 rounded-[14px] border p-4"
                style={{ background: "#2a231d", borderColor: "rgba(240,232,219,.12)" }}
              >
                <p className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#a99e8c" }}>
                  {t("sorteoFilterDurationLabel")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DUR_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter({ dur: f.value })}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                      style={
                        filters.dur === f.value
                          ? { background: "#332b23", borderColor: "#d98a5c", color: "#d98a5c" }
                          : { background: "#332b23", borderColor: "transparent", color: "#f0e8db" }
                      }
                    >
                      {t(f.labelKey)}
                    </button>
                  ))}
                </div>
                <p className="mt-4 font-mono text-[10px] tracking-widest uppercase" style={{ color: "#a99e8c" }}>
                  {t("sorteoFilterStateLabel")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STATE_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter({ state: f.value })}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                      style={
                        filters.state === f.value
                          ? { background: "#332b23", borderColor: "#d98a5c", color: "#d98a5c" }
                          : { background: "#332b23", borderColor: "transparent", color: "#f0e8db" }
                      }
                    >
                      {t(f.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Estantería: visible en shelf/spinning; en revealed queda el resultado. */}
        {!revealed && (
          <>
            <div className="mt-6 flex h-[210px] items-end justify-center gap-1.5">
              {shelf.map((item, i) => {
                const isTick = tickIndex === i;
                const isChosen = winner === i;
                const isDim = winner !== null && winner !== i;
                const colors = SPINE_COLORS[item.itemType];
                return (
                  <button
                    key={`${item.itemType}:${item.itemId}`}
                    type="button"
                    onClick={() => draw(i)}
                    title={item.title}
                    className="relative w-[34px] rounded-t-md rounded-b-sm transition-all duration-300"
                    style={{
                      height: `${spineHeight(item.itemId)}%`,
                      background: `linear-gradient(90deg, ${colors.from}, ${colors.to} 45%, ${colors.from})`,
                      transform: isChosen
                        ? "translateY(-34px)"
                        : isTick
                          ? "translateY(-12px)"
                          : "none",
                      opacity: isDim ? 0.35 : 1,
                      boxShadow: isChosen
                        ? "0 0 0 2px #e0a94a, 0 18px 30px -10px rgba(224,169,74,.35)"
                        : "0 6px 14px -6px rgba(0,0,0,.6)",
                    }}
                  >
                    <span
                      className="absolute inset-0 grid place-items-center overflow-hidden py-2 font-serif text-[11px]"
                      style={{ writingMode: "vertical-rl", color: "rgba(255,248,238,.85)" }}
                    >
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="mt-0.5 h-2.5 rounded-[3px]"
              style={{
                background: "linear-gradient(180deg, #4a3c2d, #2e251b)",
                boxShadow: "0 10px 24px -10px rgba(0,0,0,.7)",
              }}
            />
            <button
              type="button"
              onClick={() => draw()}
              disabled={shelf.length === 0 || phase === "spinning"}
              className="mt-6 w-full rounded-[13px] py-3.5 text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: "#d98a5c", color: "#1f1409" }}
            >
              {t("sorteoDraw")}
            </button>
          </>
        )}

        {revealed && picked && (
          <div className="mt-6 flex flex-1 flex-col items-center text-center">
            <p className="font-mono text-[10px] tracking-widest uppercase" style={{ color: "#e0a94a" }}>
              {t("sorteoResultLabel")}
            </p>
            <div
              className="sorteo-flip-in relative mt-3 aspect-[2/3] w-[118px] overflow-hidden rounded-lg"
              style={{ boxShadow: `0 22px 40px -14px rgba(0,0,0,.7), 0 0 0 1.5px ${TYPE_ACCENT[picked.itemType]}` }}
            >
              {picked.coverUrl ? (
                <Image src={picked.coverUrl} alt={picked.title} fill sizes="118px" className="object-cover" />
              ) : (
                <div className="h-full w-full" style={{ background: SPINE_COLORS[picked.itemType].to }} />
              )}
            </div>
            <h3 className="mt-4 font-serif text-xl leading-tight font-semibold">{picked.title}</h3>
            <p className="mt-1.5 text-sm" style={{ color: "#a99e8c" }}>
              {picked.subtitle ? `${picked.subtitle} · ${picked.metaText}` : picked.metaText}
            </p>
            {picked.estimateText && (
              // formulaText ya trae el "≈" dentro — no anteponer otro.
              <p className="mt-2 text-xs font-medium" style={{ color: "#e0a94a" }}>
                {picked.estimateText}
              </p>
            )}

            <div className="mt-6 w-full">
              {ctaState === "error" && (
                <p className="mb-2 text-xs" style={{ color: "#d97a63" }}>
                  {t("sorteoCtaError")}
                </p>
              )}
              <button
                type="button"
                onClick={start}
                disabled={pending || ctaState === "done"}
                className="w-full rounded-[13px] py-3.5 text-sm font-semibold disabled:opacity-70"
                style={{ background: "#d98a5c", color: "#1f1409" }}
              >
                {ctaState === "done" ? t("sorteoCtaDone") : t(CTA_KEY[picked.itemType])}
              </button>
              {ctaState === "done" ? (
                <Link
                  href={itemHref(picked.itemType, picked.itemId)}
                  className="mt-2.5 block w-full rounded-[13px] border py-3.5 text-sm font-semibold"
                  style={{ borderColor: "rgba(240,232,219,.12)", color: "#f0e8db" }}
                >
                  {t("sorteoGoToItem")}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    resetToShelf();
                    // Deja que la estantería vuelva a montarse antes de girar.
                    timers.current.push(window.setTimeout(() => draw(), 150));
                  }}
                  disabled={pending}
                  className="mt-2.5 w-full rounded-[13px] border py-3.5 text-sm font-semibold"
                  style={{ borderColor: "rgba(240,232,219,.12)", color: "#f0e8db" }}
                >
                  {t("sorteoAgain")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
```

Nota para el implementador: si `npm run lint` protesta por los `eslint-disable` de dependencias de hooks, la alternativa correcta es mover `resetToShelf` a un `useCallback` — no eliminar `shelfSeed` del array del `useMemo` (rebarajar en cada apertura es requisito del spec).

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm run lint 2>/dev/null || npx next lint`
Expected: sin errores de tipos; lint limpio (o solo warnings preexistentes).

- [ ] **Step 5: Commit**

```bash
git add messages/es.json src/app/globals.css src/components/rincon/sorteo-sheet.tsx
git commit -m "feat(rincon): hoja del sorteo — estanteria animada, filtros y CTA"
```

---

### Task 4: Cablear la tarjeta y la tab

**Files:**
- Modify: `src/components/rincon/spine-draw.tsx`
- Modify: `src/app/u/[username]/_tabs/rincon-tab.tsx`

**Interfaces:**
- Consumes: `SorteoSheet` (Task 3), `SorteoItem` (Task 1), `getSorteoPool` (Task 2).
- Produces: `SpineDraw({ pool }: { pool: SorteoItem[] })` — nueva firma; el mapeo `spineItems` de la tab desaparece.

- [ ] **Step 1: Reescribir `spine-draw.tsx` como tarjeta-entrada**

La tarjeta pierde el sorteo inline (ya no hay `picked` ni `draw()` local): conserva título, subtítulo, la fila decorativa de lomos y el estado vacío; el botón abre la hoja. Sustituye el contenido del fichero por:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SorteoSheet } from "./sorteo-sheet";
import type { SorteoItem } from "./sorteo-logic";

// La estantería decorativa del frame C/H: alturas y colores variados, fijos,
// para que la tarjeta tenga cuerpo. El sorteo real vive en la hoja.
const SPINES = [
  { h: 78, c: "#cf8a54" },
  { h: 100, c: "#6bb0b4" },
  { h: 60, c: "#b592bd" },
  { h: 88, c: "#e0a94a" },
  { h: 70, c: "#8ba57b" },
  { h: 94, c: "#cf8a54" },
  { h: 55, c: "#6bb0b4" },
  { h: 82, c: "#b592bd" },
  { h: 66, c: "#d97a63" },
  { h: 90, c: "#e0a94a" },
];

// "Sacar un lomo": tarjeta-entrada del ritual (spec 2026-07-17). El botón abre
// la hoja del sorteo (estantería animada + filtros). Tarjeta oscura a
// propósito (misma en claro y oscuro). Vacío: invita a añadir pendientes.
export function SpineDraw({ pool }: { pool: SorteoItem[] }) {
  const t = useTranslations("rincon");
  const [open, setOpen] = useState(false);

  const dark = "rounded-[14px] border p-4";
  const darkStyle = {
    background: "#2a231d",
    borderColor: "rgba(240,232,219,.12)",
    color: "#f0e8db",
  };

  if (pool.length === 0) {
    return (
      <div className={dark} style={darkStyle}>
        <h3 className="font-serif text-sm font-semibold">{t("drawEmptyTitle")}</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "#a99e8c" }}>
          {t("drawEmptySub")}
        </p>
        <Link
          href="/buscar"
          className="mt-3 inline-block rounded-full px-4 py-2 text-center text-sm font-semibold"
          style={{ background: "#d98a5c", color: "#1f1409" }}
        >
          {t("drawEmptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className={dark} style={darkStyle}>
      <h3 className="font-serif text-sm font-semibold">{t("drawTitle")}</h3>
      <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "#a99e8c" }}>
        {t("drawSub")}
      </p>

      <div className="my-3.5 flex h-16 items-end gap-[5px]">
        {SPINES.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="w-3.5 rounded-t-[5px] rounded-b-[2px]"
            style={{ height: `${s.h}%`, background: s.c }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-full px-4 py-2 text-center text-sm font-semibold transition-opacity hover:opacity-90"
        style={{ background: "#d98a5c", color: "#1f1409" }}
      >
        {t("drawButton")}
      </button>

      <SorteoSheet pool={pool} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Cablear `rincon-tab.tsx` al pool nuevo**

En `src/app/u/[username]/_tabs/rincon-tab.tsx`:

1. Sustituye el import `import { getLibraryItems } from "@/lib/library/get-library-items";` por `import { getSorteoPool } from "@/lib/rincon/get-sorteo-pool";` (si `getLibraryItems` no tiene más usos en el fichero).
2. En el `Promise.all`, sustituye `getLibraryItems(supabase, userId, { status: "planned" })` por `getSorteoPool(supabase, userId)` y renombra la variable `planned` a `pool`.
3. Borra el mapeo `const spineItems = planned.map(...)`.
4. Cambia `<SpineDraw planned={spineItems} />` por `<SpineDraw pool={pool} />`.

- [ ] **Step 3: Verificar compilación y suite**

Run: `npx tsc --noEmit && fnm use && npm test`
Expected: sin errores de tipos; suite Vitest completa PASS.

- [ ] **Step 4: Smoke manual en dev**

Run: `npm run dev` y abrir `http://localhost:3000/u/<tu-usuario>?tab=rincon` con sesión iniciada.
Expected: la tarjeta muestra los lomos decorativos; "Sacar un lomo" abre la hoja oscura; los chips filtran y actualizan el contador; "Sorpréndeme" corre la ruleta y revela un resultado con portada, meta y estimación; "↻ Otra vez" repite; ✕ vuelve a la estantería; ✕ de nuevo cierra. Parar el server al acabar.

- [ ] **Step 5: Commit**

```bash
git add src/components/rincon/spine-draw.tsx "src/app/u/[username]/_tabs/rincon-tab.tsx"
git commit -m "feat(rincon): la tarjeta abre la hoja del sorteo con el pool real"
```

---

### Task 5: E2E del flujo completo

**Files:**
- Create: `e2e/sorteo.spec.ts`

**Interfaces:**
- Consumes: la UI de Tasks 3–4; el patrón de login de `e2e/estadisticas.spec.ts` (env `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`/`TEST_USER_USERNAME`).

- [ ] **Step 1: Escribir el spec**

Crea `e2e/sorteo.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// Sorteo "sacar un lomo" (spec 2026-07-17): la tarjeta del Rincón abre la
// hoja, la ruleta revela un resultado y el CTA deja el ítem en curso.
// OJO: el CTA muta datos del usuario de test (un pendiente pasa a en curso);
// mientras le queden pendientes, las siguientes ejecuciones siguen valiendo.
test("sacar un lomo: hoja, sorteo y empezar el pase", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}?tab=rincon`);

  const openButton = page.getByRole("button", { name: /sacar un lomo/i });
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  await expect(openButton.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");

  await openButton.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: /deja que decida/i })).toBeVisible();

  await sheet.getByRole("button", { name: /sorpréndeme/i }).click();
  // La ruleta desacelera unos segundos antes del revelado.
  const cta = sheet.getByRole("button", {
    name: /empezar a leer|ver esta noche|empezar la t1/i,
  });
  await expect(cta).toBeVisible({ timeout: 15_000 });

  await cta.click();
  await expect(sheet.getByRole("button", { name: /en curso/i })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /ver ficha/i })).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npx playwright test e2e/sorteo.spec.ts`
Expected: PASS (o skip limpio si `TEST_USER_*` no está en el entorno; en ese caso anotarlo en el resumen final, no inventarse un pass). Recordatorio del repo: la suite está calibrada para `next dev`; si fallara media suite, mirar la carga de la máquina antes que el código.

- [ ] **Step 3: Commit**

```bash
git add e2e/sorteo.spec.ts
git commit -m "test(rincon): e2e del sorteo — hoja, ruleta y CTA en curso"
```

---

### Task 6: Cierre — REQUIREMENTS, push y PR

- [ ] **Step 1: Actualizar `docs/REQUIREMENTS.md` §7.28**

Marcar el checkbox de 7.28 como hecho y anotar la decisión de diseño real (una línea): la ceremonia es una hoja modal desde el Rincón; filtros tipo/duración/estado sobre estimaciones §7.22; CTA reutiliza `updateStatus`. (Si el flujo del proyecto prefiere el agente backlog-scribe, esto puede delegarse en él.)

- [ ] **Step 2: Verificación final**

Run: `fnm use && npm test && npx tsc --noEmit && npm run build`
Expected: todo PASS / build OK.

- [ ] **Step 3: Commit, push y draft PR**

```bash
git add docs/REQUIREMENTS.md
git commit -m "docs(backlog): 7.28 random picker hecho — sorteo sacar un lomo"
git push -u origin worktree-sorteo-lomo-animado
gh pr create --draft --title "feat(rincon): sorteo «sacar un lomo» animado (7.28)" --body "..."
```

El body del PR debe resumir: qué añade (hoja animada, filtros, CTA), el spec y plan en `docs/superpowers/`, y terminar con la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
