# «Sacar un lomo» como partida — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la hoja del Sorteo por una partida (tres candidatos presentados por la mascota,
descarte, duelo y revelación) sobre una estantería ilustrada, con controles opcionales, y abrirla
encima de la página de origen, incluido un lomo-botón «¿Cuál toca?» en «Para más tarde».

**Architecture:** Lógica pura y testeable (`sorteo-logic.ts`, `sorteo-lines.ts` y el reducer de
`use-sorteo-game.ts`) separada de la UI. Un componente cliente `SorteoStage` (dialog nativo) carga
pool y mascota con una server action `loadSorteo()` mientras se abre el telón, y lo monta un
`SorteoTrigger` en el Inicio o `SpineDraw` en el Rincón. Los estilos se portan del prototipo a un CSS
module.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, next-intl, Supabase, CSS
modules + Tailwind, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-sacar-lomo-partida-design.md`
**Prototipo (fuente del CSS y del comportamiento):**
`docs/superpowers/specs/assets/2026-11-06-sacar-lomo-prototipo.html`

## Global Constraints

- **Copy en español.** Todas las cadenas nuevas van en `messages/es.json`, en el namespace
  **`sorteo`**. Esto se desvía de la spec, que decía `rincon.sorteo.*`: el Inicio necesita mandar
  ese namespace al cliente y `rincon` es mucho más grande. La spec se corrige en la Task 11.
- **Regla #437:** `loadSorteo` usa el cliente de la petición y **nunca** `use cache`, porque el
  pool depende de `auth.uid()`.
- **Next.js 16:** antes de escribir la server action o el `dynamic()`, lee
  `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` y la guía de lazy
  loading en `node_modules/next/dist/docs/01-app/02-guides/` (desde la raíz del repo padre si el
  worktree no tiene `node_modules`).
- **Escritura de datos:** el CTA solo llama a la action existente
  `updateStatus(itemType, itemId, "in_progress")` de `src/lib/library/manage-actions.ts`.
- **Entorno (Windows):**
  - Los comandos se ejecutan en **PowerShell** y empiezan siempre por
    `fnm env | Out-String | Invoke-Expression; fnm use 22;`. Con Node 20 vitest se rompe, y
    `fnm exec … npx` no funciona.
  - En PowerShell 5.1 los comandos se encadenan con `;`, no con `&&`.
  - `node_modules` del worktree es un *junction* al del repo padre: **no lo borres**. `next dev`
    necesita `--webpack`.
  - `.env.local` ya está copiado.
- **Comandos** (tras el prefijo de arriba):
  - Tests unitarios: `npx vitest run <ruta>`
  - Tipos: `npx tsc --noEmit`
  - Lint: `npm run lint`
- **Movimiento:** respeta `prefers-reduced-motion`, con las mismas fases y retardos ≤ 120 ms.
- **Al cerrar** el `<dialog>` antes de navegar a la ficha, hay que cerrarlo primero (#448).
- **No cambia el esquema.** `passes.created_at` ya existe (`database.types.ts`).

---

## Mapa de ficheros

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/components/rincon/sorteo-logic.ts` | Reescribir | Tipos, ajustes, antojos por tipo, elegibilidad, muestreo, medidas de lomo |
| `src/components/rincon/sorteo-logic.test.ts` | Reescribir | Tests de lo anterior |
| `src/lib/rincon/get-sorteo-pool.ts` | Modificar | Añade `plannedSince` y `totalEpisodes` |
| `src/components/rincon/sorteo-lines.ts` (+ `.test.ts`) | Crear | Hecho más llamativo → clave de frase y valores |
| `src/components/rincon/use-sorteo-game.ts` (+ `.test.ts`) | Crear | Reducer de fases de la partida |
| `src/lib/rincon/load-sorteo.ts` | Crear | Server action: pool, colecciones y mascota |
| `messages/es.json` | Modificar | Namespace `sorteo`; quita las claves `rincon.sorteo*` y `today.drawLink` |
| `src/components/rincon/sorteo-stage.module.css` | Crear | CSS portado del prototipo |
| `src/components/rincon/stage-bookcase.tsx` | Crear | Mueble, lomos, atrezo y foco |
| `src/components/rincon/stage-pet.tsx` | Crear | Mascota sentada en el mueble y bocadillo, o narrador |
| `src/components/rincon/stage-tune.tsx` | Crear | Panel «Afinar» |
| `src/components/rincon/stage-podium.tsx` | Crear | Candidatos, descarte, duelo y ganador |
| `src/components/rincon/sorteo-stage.tsx` (+ `.test.tsx`) | Crear | Orquestación: dialog, telón, fases, temporizadores y CTA |
| `src/components/rincon/sorteo-sheet.tsx` | Borrar | Sustituida por `sorteo-stage.tsx` |
| `src/components/rincon/sorteo-trigger.tsx` | Crear | Botón que abre la partida en el sitio |
| `src/components/rincon/spine-draw.tsx` (+ test) | Modificar | Usa `SorteoStage` |
| `src/components/stats/later-shelf.tsx`, `today-block.tsx`, `proxima-lectura.tsx` | Modificar | Lomo-botón «¿Cuál toca?» y fuera el enlace |
| `src/components/home/home-draw-tile.tsx` | Modificar | Tarjeta móvil → `SorteoTrigger` |
| `src/app/u/[username]/_tabs/rincon-tab.tsx` | Modificar | Deja de pasar `collections` |
| `src/app/globals.css` | Modificar | `.later-draw`, reset del botón `.home-draw-tile` y ocultar la compañera |
| `e2e/sorteo.spec.ts`, `e2e/sorteo-inicio.spec.ts` (nuevo) | Modificar / Crear | Flujos de la partida |
| Docs (`decisiones.md`, `backlog.md`, `UI-GLOSARIO.md`, spec, `graph.json`) | Modificar | Definición de «hecho» |

---

### Task 1: Pool con `plannedSince` y `totalEpisodes`, y lógica pura del sorteo

**Files:**
- Modify: `src/components/rincon/sorteo-logic.ts` (reescritura completa)
- Modify: `src/lib/rincon/get-sorteo-pool.ts`
- Test: `src/components/rincon/sorteo-logic.test.ts` (reescritura completa)

**Interfaces:**
- Produces:
  - **Tipos:** `SorteoItem` (con `plannedSince: string` y `totalEpisodes: number | null`),
    `SorteoCollection`, `TypeFilter`, `TimeBucket`, `AntojoId`, `SorteoSettings` y `Antojo`.
  - **Constantes:** `DEFAULT_SETTINGS`, `ALL_BUCKETS`, `BOOKCASE_MAX = 24`, `TYPE_COVER` y
    `TYPE_ACCENT`.
  - **Funciones:**
    - `itemKey(item)`
    - `durationBucket(minutes)`
    - `isQuick(item)`
    - `antojosFor(type, collections)`
    - `normalizeSettings(s, collections)`
    - `eligibleItems(pool, settings, antojo?)`
    - `longestWaiting(items)`
    - `shuffle(items, rng?)`
    - `sampleCandidates(items, rng?, n?)`
    - `pickIndex(length, rng?)`
    - `spineWidth(item)`
    - `spineHeight(itemId)`
    - `spineShade(item)`
    - `seasonsLabel(item)`
    - `initials(name)`

- [ ] **Step 1: Escribe los tests que fallan**

Sustituye `src/components/rincon/sorteo-logic.test.ts` entero por:

```ts
import { describe, expect, it } from "vitest";
import {
  ALL_BUCKETS,
  antojosFor,
  DEFAULT_SETTINGS,
  durationBucket,
  eligibleItems,
  initials,
  isQuick,
  longestWaiting,
  normalizeSettings,
  sampleCandidates,
  seasonsLabel,
  spineHeight,
  spineWidth,
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
    estimateText: "≈ 3h 56min",
    fresh: true,
    collectionIds: [],
    plannedSince: "2026-01-10T10:00:00Z",
    totalEpisodes: null,
    ...overrides,
  };
}

describe("durationBucket", () => {
  it("‹2h es short, 120 ya es med, 300 med, 301 long, null none", () => {
    expect(durationBucket(119)).toBe("short");
    expect(durationBucket(120)).toBe("med");
    expect(durationBucket(300)).toBe("med");
    expect(durationBucket(301)).toBe("long");
    expect(durationBucket(null)).toBe("none");
  });
});

describe("isQuick", () => {
  it("libro: ≤ 240 min a tu ritmo", () => {
    expect(isQuick(item({ estimatedMinutes: 240 }))).toBe(true);
    expect(isQuick(item({ estimatedMinutes: 241 }))).toBe(false);
    expect(isQuick(item({ estimatedMinutes: null }))).toBe(false);
  });
  it("película: ≤ 150 min", () => {
    expect(isQuick(item({ itemType: "movie", estimatedMinutes: 150 }))).toBe(true);
    expect(isQuick(item({ itemType: "movie", estimatedMinutes: 151 }))).toBe(false);
  });
  it("serie: ≤ 10 episodios o ≤ 480 min", () => {
    expect(isQuick(item({ itemType: "series", totalEpisodes: 10, estimatedMinutes: 900 }))).toBe(true);
    expect(isQuick(item({ itemType: "series", totalEpisodes: 11, estimatedMinutes: 480 }))).toBe(true);
    expect(isQuick(item({ itemType: "series", totalEpisodes: 11, estimatedMinutes: 481 }))).toBe(false);
    expect(isQuick(item({ itemType: "series", totalEpisodes: null, estimatedMinutes: null }))).toBe(false);
  });
});

describe("antojosFor", () => {
  const cols = [{ id: "c1", name: "Clásicos" }];
  it("con Todo: sin antojo de duración y uno por colección", () => {
    expect(antojosFor("all", cols).map((a) => a.id)).toEqual(["any", "wait", "fresh", "col:c1"]);
  });
  it("con un tipo: el de duración en segunda posición y sin colecciones", () => {
    expect(antojosFor("movie", cols).map((a) => a.id)).toEqual(["any", "quick", "wait", "fresh"]);
  });
});

describe("longestWaiting", () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      item({ itemId: `i${i}`, plannedSince: `2020-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` })
    );
  it("devuelve el tercio más antiguo, con mínimo 3", () => {
    expect(longestWaiting(mk(10)).map((i) => i.itemId)).toEqual(["i0", "i1", "i2", "i3"]);
    expect(longestWaiting(mk(3))).toHaveLength(3);
    expect(longestWaiting(mk(1))).toHaveLength(1);
  });
  it("ordena aunque llegue desordenado", () => {
    expect(longestWaiting(mk(6).reverse()).map((i) => i.itemId)).toEqual(["i0", "i1", "i2"]);
  });
});

describe("eligibleItems", () => {
  const pool = [
    item({ itemId: "b1", estimatedMinutes: 90 }),
    item({ itemId: "m1", itemType: "movie", estimatedMinutes: 105, fresh: false }),
    item({ itemId: "s1", itemType: "series", estimatedMinutes: 480, totalEpisodes: 8, collectionIds: ["c1"] }),
    item({ itemId: "b2", estimatedMinutes: null }),
  ];
  const ids = (xs: SorteoItem[]) => xs.map((i) => i.itemId);

  it("por defecto pasa todo", () => {
    expect(eligibleItems(pool, DEFAULT_SETTINGS)).toHaveLength(4);
  });
  it("tipo + antojo de duración", () => {
    expect(ids(eligibleItems(pool, { ...DEFAULT_SETTINGS, type: "book", antojo: "quick" }))).toEqual(["b1"]);
  });
  it("nunca empezado", () => {
    expect(ids(eligibleItems(pool, { ...DEFAULT_SETTINGS, antojo: "fresh" }))).toEqual(["b1", "s1", "b2"]);
  });
  it("colección", () => {
    expect(ids(eligibleItems(pool, { ...DEFAULT_SETTINGS, antojo: "col:c1" }))).toEqual(["s1"]);
  });
  it("los tramos de tiempo filtran y se combinan con el antojo", () => {
    const s = { ...DEFAULT_SETTINGS, buckets: ["none" as const] };
    expect(ids(eligibleItems(pool, s))).toEqual(["b2"]);
    expect(eligibleItems(pool, { ...s, antojo: "fresh" })).toHaveLength(1);
  });
  it("el antojo explícito manda sobre el de los ajustes (para los recuentos)", () => {
    expect(eligibleItems(pool, DEFAULT_SETTINGS, "fresh")).toHaveLength(3);
  });
});

describe("normalizeSettings", () => {
  it("antojo que no existe para el tipo vuelve a any", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, antojo: "quick" }, []).antojo).toBe("any");
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, antojo: "col:gone" }, []).antojo).toBe("any");
  });
  it("tramos vacíos vuelven a todos", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, buckets: [] }, []).buckets).toEqual(ALL_BUCKETS);
  });
  it("basura de localStorage vuelve a los valores por defecto", () => {
    expect(normalizeSettings({ type: "x", antojo: 3, buckets: "y" } as never, [])).toEqual(DEFAULT_SETTINGS);
  });
});

describe("sampleCandidates", () => {
  const many = Array.from({ length: 9 }, (_, i) => item({ itemId: `i${i}` }));
  it("hasta 3 sin repetir", () => {
    const out = sampleCandidates(many, () => 0.42);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((i) => i.itemId)).size).toBe(3);
  });
  it("con menos de 3 devuelve los que hay", () => {
    expect(sampleCandidates(many.slice(0, 2))).toHaveLength(2);
  });
});

describe("medidas del lomo", () => {
  it("el grosor crece con el tiempo y tiene tope", () => {
    expect(spineWidth(item({ estimatedMinutes: null }))).toBe(26);
    expect(spineWidth(item({ estimatedMinutes: 60 }))).toBeLessThan(spineWidth(item({ estimatedMinutes: 600 })));
    expect(spineWidth(item({ estimatedMinutes: 99999 }))).toBe(spineWidth(item({ estimatedMinutes: 720 })));
  });
  it("las series nunca son más finas que 32", () => {
    expect(spineWidth(item({ itemType: "series", estimatedMinutes: 30 }))).toBe(32);
  });
  it("la altura es estable y va de 66 a 95", () => {
    expect(spineHeight("abc")).toBe(spineHeight("abc"));
    for (const id of ["a", "bb", "ccc", "uuid-1234"]) {
      expect(spineHeight(id)).toBeGreaterThanOrEqual(66);
      expect(spineHeight(id)).toBeLessThanOrEqual(95);
    }
  });
  it("etiqueta de temporadas e iniciales", () => {
    expect(seasonsLabel(item({ itemType: "series", totalEpisodes: 26 }))).toBe("T1–3");
    expect(seasonsLabel(item({ itemType: "series", totalEpisodes: 5 }))).toBe("T1");
    expect(initials("Juan Rulfo")).toBe("JR");
    expect(initials("de la Cruz")).toBe("C");
  });
});
```

- [ ] **Step 2: Comprueba que fallan**

Run: `npx vitest run src/components/rincon/sorteo-logic.test.ts`
Expected: FAIL; no existen `antojosFor`, `isQuick`, etc.

- [ ] **Step 3: Reescribe `sorteo-logic.ts`**

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
```

- [ ] **Step 4: Añade los campos al pool**

En `src/lib/rincon/get-sorteo-pool.ts`:
1. En la primera consulta, cambia el `.select("id, item_type, item_id, edition_id")` por
   `.select("id, item_type, item_id, edition_id, created_at")`.
2. Justo después del bucle que llena `editionIdByItem`, añade:
   ```ts
   const plannedSinceByItem = new Map(entries.map((e) => [`${e.item_type}:${e.item_id}`, e.created_at]));
   ```
3. En el objeto que se construye en `estimable.map(...)`, añade dos campos:
   ```ts
   plannedSince: plannedSinceByItem.get(`${item.itemType}:${item.itemId}`) ?? new Date(0).toISOString(),
   totalEpisodes: item.itemType === "series" ? item.totalEpisodes : null,
   ```
   `EstimableItem` ya trae `totalEpisodes` (`src/lib/pace/types.ts:17`).

- [ ] **Step 5: Arregla los demás fixtures de `SorteoItem`**

Run: `npx tsc --noEmit`
Cada error de «falta `plannedSince`/`totalEpisodes`» en un test o fixture se corrige añadiendo
`plannedSince: "2026-01-01T00:00:00Z", totalEpisodes: null`.

`sorteo-sheet.tsx` dará errores porque usa `SPINE_COLORS`, `sampleShelf` y `DEFAULT_FILTERS`, que
ya no existen. **Bórrala ahora:** `git rm src/components/rincon/sorteo-sheet.tsx`. La Task 8
reconecta `SpineDraw` y, mientras tanto, `spine-draw.tsx` importará un fichero que no existe.
Para no dejar el árbol roto entre commits, cambia ya en `spine-draw.tsx` el import
`import { SorteoSheet } from "./sorteo-sheet";` por un stub local temporal:

```tsx
// Temporal hasta la Task 8: la partida sustituye a la hoja.
function SorteoSheet(_: { pool: unknown; collections: unknown; open: boolean; onClose: () => void }) {
  return null;
}
```

Y en `spine-draw.test.tsx`, quita el `vi.mock("./sorteo-sheet", …)` y salta con `it.skip` el
caso «abre la hoja con sorteo=1 y openFromUrl», que vuelve en la Task 8.

- [ ] **Step 6: Comprueba que pasa**

Run: `npx vitest run src/components/rincon; npx tsc --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/rincon src/lib/rincon/get-sorteo-pool.ts
git commit -m "feat(sorteo): lógica de antojos por tipo y pool con plannedSince/totalEpisodes"
```

---

### Task 2: Motor de frases

**Files:**
- Create: `src/components/rincon/sorteo-lines.ts`
- Test: `src/components/rincon/sorteo-lines.test.ts`

**Interfaces:**
- Consumes: `SorteoItem` (Task 1).
- Produces:
  - `type LineKey = "waitLong" | "tonight" | "miniseries" | "long" | "retry" | "fresh"`
  - `type CandidateLine = { key: LineKey; variant: number; values: { since: string; years: number; duration: string; episodes: number } }`
  - `LINE_VARIANTS: Record<LineKey, number>`
  - `monthsBetween(fromISO: string, today: Date): number`
  - `lineFor(item, today, fmt, rng?): CandidateLine`, donde
    `fmt = { duration(min: number): string; since(iso: string): string }`

- [ ] **Step 1: Escribe el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { LINE_VARIANTS, lineFor, monthsBetween } from "./sorteo-lines";
import type { SorteoItem } from "./sorteo-logic";

const TODAY = new Date("2026-11-06T12:00:00Z");
const fmt = { duration: (m: number) => `${m}m`, since: (iso: string) => iso.slice(0, 7) };
const zero = () => 0;
const base: SorteoItem = {
  itemType: "book", itemId: "x", title: "T", subtitle: null, coverUrl: null, metaText: "",
  estimatedMinutes: 400, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-09-01T00:00:00Z", totalEpisodes: null,
};

describe("monthsBetween", () => {
  it("cuenta meses de calendario", () => {
    expect(monthsBetween("2025-11-06T00:00:00Z", TODAY)).toBe(12);
    expect(monthsBetween("2026-10-30T00:00:00Z", TODAY)).toBe(1);
  });
});

describe("lineFor: prioridad de hechos", () => {
  it("espera larga gana a todo", () => {
    const l = lineFor({ ...base, plannedSince: "2024-03-01T00:00:00Z", estimatedMinutes: 90 }, TODAY, fmt, zero);
    expect(l.key).toBe("waitLong");
    expect(l.values.since).toBe("2024-03");
    expect(l.values.years).toBe(2);
  });
  it("libro o película corta: tonight", () => {
    expect(lineFor({ ...base, estimatedMinutes: 150 }, TODAY, fmt, zero).key).toBe("tonight");
    expect(lineFor({ ...base, itemType: "movie", estimatedMinutes: 101 }, TODAY, fmt, zero).values.duration).toBe("101m");
  });
  it("serie de ≤10 episodios: miniseries (nunca tonight)", () => {
    const l = lineFor({ ...base, itemType: "series", estimatedMinutes: 100, totalEpisodes: 6 }, TODAY, fmt, zero);
    expect(l.key).toBe("miniseries");
    expect(l.values.episodes).toBe(6);
  });
  it("más de 600 min: long", () => {
    expect(lineFor({ ...base, estimatedMinutes: 601 }, TODAY, fmt, zero).key).toBe("long");
  });
  it("sin hechos de tiempo: retry si no es fresh, fresh si lo es", () => {
    expect(lineFor({ ...base, fresh: false }, TODAY, fmt, zero).key).toBe("retry");
    expect(lineFor(base, TODAY, fmt, zero).key).toBe("fresh");
  });
  it("la variante sale del rng y no se pasa del número de variantes", () => {
    const l = lineFor({ ...base, plannedSince: "2020-01-01T00:00:00Z" }, TODAY, fmt, () => 0.999);
    expect(l.variant).toBe(LINE_VARIANTS.waitLong - 1);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/rincon/sorteo-lines.test.ts`
Expected: FAIL; el módulo no existe.

- [ ] **Step 3: Implementa**

```ts
import type { SorteoItem } from "./sorteo-logic";

// Una frase por candidato (spec «La voz»): el hecho más llamativo, en este orden.
// El texto vive en messages/es.json → sorteo.lines.<key>.<variant>.
export type LineKey = "waitLong" | "tonight" | "miniseries" | "long" | "retry" | "fresh";
export type CandidateLine = {
  key: LineKey;
  variant: number;
  values: { since: string; years: number; duration: string; episodes: number };
};
export const LINE_VARIANTS: Record<LineKey, number> = {
  waitLong: 3, tonight: 2, miniseries: 2, long: 2, retry: 2, fresh: 2,
};

export function monthsBetween(fromISO: string, today: Date): number {
  const from = new Date(fromISO);
  return (today.getUTCFullYear() - from.getUTCFullYear()) * 12 + (today.getUTCMonth() - from.getUTCMonth());
}

function factFor(item: SorteoItem, months: number): LineKey {
  const min = item.estimatedMinutes;
  if (months >= 12) return "waitLong";
  if (item.itemType !== "series" && min !== null && min <= 150) return "tonight";
  if (item.itemType === "series" && item.totalEpisodes !== null && item.totalEpisodes <= 10) return "miniseries";
  if (min !== null && min > 600) return "long";
  return item.fresh ? "fresh" : "retry";
}

export function lineFor(
  item: SorteoItem,
  today: Date,
  fmt: { duration(min: number): string; since(iso: string): string },
  rng: () => number = Math.random
): CandidateLine {
  const months = monthsBetween(item.plannedSince, today);
  const key = factFor(item, months);
  return {
    key,
    variant: Math.min(LINE_VARIANTS[key] - 1, Math.floor(rng() * LINE_VARIANTS[key])),
    values: {
      since: fmt.since(item.plannedSince),
      years: Math.max(1, Math.floor(months / 12)),
      duration: item.estimatedMinutes !== null ? fmt.duration(item.estimatedMinutes) : "",
      episodes: item.totalEpisodes ?? 0,
    },
  };
}
```

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/rincon/sorteo-lines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/rincon/sorteo-lines.ts src/components/rincon/sorteo-lines.test.ts
git commit -m "feat(sorteo): motor de frases por candidato"
```

---

### Task 3: Reducer de la partida

**Files:**
- Create: `src/components/rincon/use-sorteo-game.ts`
- Test: `src/components/rincon/use-sorteo-game.test.ts`

**Interfaces:**
- Consumes: `SorteoItem` (Task 1).
- Produces:
  - `type Phase = "loading" | "error" | "empty" | "choose" | "roll" | "present" | "discard" | "discarded" | "duel" | "duelLuck" | "duelPicked" | "reveal" | "starting" | "started"`
  - `type GameState = { phase; candidates: SorteoItem[]; presented: number; duelPick: number | null; winner: SorteoItem | null; discarded: SorteoItem | null; solo: boolean; ctaError: boolean }`
  - `type GameAction` (unión de abajo)
  - `INITIAL_GAME: GameState`
  - `gameReducer(state, action): GameState`

- [ ] **Step 1: Escribe el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { gameReducer, INITIAL_GAME, type GameAction, type GameState } from "./use-sorteo-game";
import type { SorteoItem } from "./sorteo-logic";

const it_ = (id: string): SorteoItem => ({
  itemType: "book", itemId: id, title: id, subtitle: null, coverUrl: null, metaText: "",
  estimatedMinutes: null, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-01-01T00:00:00Z", totalEpisodes: null,
});
const run = (actions: GameAction[], from: GameState = INITIAL_GAME) => actions.reduce(gameReducer, from);
const chosen = run([{ type: "loaded", empty: false }]);

describe("gameReducer", () => {
  it("carga: choose, vacío o error, y reintento", () => {
    expect(chosen.phase).toBe("choose");
    expect(run([{ type: "loaded", empty: true }]).phase).toBe("empty");
    expect(run([{ type: "failed" }, { type: "reload" }]).phase).toBe("loading");
  });

  it("tres candidatos: presentación completa → descarte → duelo → suerte → ganador", () => {
    let s = run([{ type: "roll", candidates: [it_("a"), it_("b"), it_("c")] }, { type: "rolled" }], chosen);
    expect(s.phase).toBe("present");
    s = run([{ type: "presentNext" }, { type: "presentNext" }, { type: "presentNext" }], s);
    expect(s.presented).toBe(3);
    expect(s.phase).toBe("present");
    s = gameReducer(s, { type: "presentNext" });
    expect(s.phase).toBe("discard");
    s = gameReducer(s, { type: "discard", index: 1 });
    expect(s.phase).toBe("discarded");
    expect(s.discarded?.itemId).toBe("b");
    expect(s.candidates.map((c) => c.itemId)).toEqual(["a", "c"]);
    s = run([{ type: "toDuel" }, { type: "luck" }, { type: "win", index: 1 }], s);
    expect(s.phase).toBe("reveal");
    expect(s.winner?.itemId).toBe("c");
  });

  it("elegir tú: pick + confirmPick → duelPicked → win", () => {
    const duel = run([{ type: "roll", candidates: [it_("a"), it_("b")] }, { type: "rolled" }, { type: "skipPresent" }], chosen);
    expect(duel.phase).toBe("duel");
    expect(gameReducer(duel, { type: "confirmPick" }).phase).toBe("duel"); // sin pick no hace nada
    const s = run([{ type: "pick", index: 0 }, { type: "confirmPick" }], duel);
    expect(s.phase).toBe("duelPicked");
    expect(gameReducer(s, { type: "win", index: 0 }).winner?.itemId).toBe("a");
  });

  it("un solo candidato: revelación directa en solitario", () => {
    const s = run([{ type: "roll", candidates: [it_("a")] }, { type: "rolled" }, { type: "skipPresent" }], chosen);
    expect(s.phase).toBe("reveal");
    expect(s.solo).toBe(true);
  });

  it("saltar al duelo desde la tirada recorta a dos", () => {
    const s = run([{ type: "roll", candidates: [it_("a"), it_("b"), it_("c")] }, { type: "skipToDuel" }], chosen);
    expect(s.phase).toBe("duel");
    expect(s.candidates).toHaveLength(2);
  });

  it("roll sin candidatos o fuera de choose no hace nada", () => {
    expect(gameReducer(chosen, { type: "roll", candidates: [] })).toBe(chosen);
    expect(gameReducer(INITIAL_GAME, { type: "roll", candidates: [it_("a")] })).toBe(INITIAL_GAME);
  });

  it("CTA: start → startDone; fallo vuelve a reveal con error; again reinicia", () => {
    const reveal = run([{ type: "roll", candidates: [it_("a")] }, { type: "rolled" }, { type: "skipPresent" }], chosen);
    expect(run([{ type: "start" }, { type: "startDone" }], reveal).phase).toBe("started");
    const failed = run([{ type: "start" }, { type: "startFailed" }], reveal);
    expect(failed.phase).toBe("reveal");
    expect(failed.ctaError).toBe(true);
    expect(gameReducer(failed, { type: "again" })).toEqual({ ...INITIAL_GAME, phase: "choose" });
  });

  it("reset vuelve a loading desde cualquier fase", () => {
    expect(gameReducer(chosen, { type: "reset" })).toEqual(INITIAL_GAME);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/rincon/use-sorteo-game.test.ts`
Expected: FAIL; el módulo no existe.

- [ ] **Step 3: Implementa**

```ts
import type { SorteoItem } from "./sorteo-logic";

// Fases de la partida (spec «La partida»). El reducer es puro: los
// temporizadores y animaciones viven en SorteoStage y solo despachan acciones.
export type Phase =
  | "loading" | "error" | "empty" | "choose" | "roll" | "present" | "discard" | "discarded"
  | "duel" | "duelLuck" | "duelPicked" | "reveal" | "starting" | "started";

export type GameState = {
  phase: Phase;
  candidates: SorteoItem[];
  presented: number;
  duelPick: number | null;
  winner: SorteoItem | null;
  discarded: SorteoItem | null;
  solo: boolean;
  ctaError: boolean;
};

export type GameAction =
  | { type: "reset" }
  | { type: "loaded"; empty: boolean }
  | { type: "failed" }
  | { type: "reload" }
  | { type: "roll"; candidates: SorteoItem[] }
  | { type: "rolled" }
  | { type: "presentNext" }
  | { type: "skipPresent" }
  | { type: "skipToDuel" }
  | { type: "discard"; index: number }
  | { type: "toDuel" }
  | { type: "pick"; index: number }
  | { type: "confirmPick" }
  | { type: "luck" }
  | { type: "win"; index: number }
  | { type: "again" }
  | { type: "start" }
  | { type: "startDone" }
  | { type: "startFailed" };

export const INITIAL_GAME: GameState = {
  phase: "loading", candidates: [], presented: 0, duelPick: null,
  winner: null, discarded: null, solo: false, ctaError: false,
};

function afterPresent(s: GameState): GameState {
  const presented = s.candidates.length;
  if (s.candidates.length === 1) return { ...s, presented, phase: "reveal", winner: s.candidates[0], solo: true };
  if (s.candidates.length === 2) return { ...s, presented, phase: "duel" };
  return { ...s, presented, phase: "discard" };
}

export function gameReducer(s: GameState, a: GameAction): GameState {
  switch (a.type) {
    case "reset":
      return INITIAL_GAME;
    case "loaded":
      return s.phase === "loading" ? { ...INITIAL_GAME, phase: a.empty ? "empty" : "choose" } : s;
    case "failed":
      return s.phase === "loading" ? { ...s, phase: "error" } : s;
    case "reload":
      return s.phase === "error" ? INITIAL_GAME : s;
    case "roll":
      if (s.phase !== "choose" || a.candidates.length === 0) return s;
      return { ...INITIAL_GAME, phase: "roll", candidates: a.candidates };
    case "rolled":
      return s.phase === "roll" ? { ...s, phase: "present", presented: 0 } : s;
    case "presentNext":
      if (s.phase !== "present") return s;
      return s.presented < s.candidates.length ? { ...s, presented: s.presented + 1 } : afterPresent(s);
    case "skipPresent":
      return s.phase === "present" ? afterPresent(s) : s;
    case "skipToDuel": {
      if (s.phase !== "roll") return s;
      const candidates = s.candidates.slice(0, 2);
      const presented = candidates.length;
      return candidates.length === 1
        ? { ...s, candidates, presented, phase: "reveal", winner: candidates[0], solo: true }
        : { ...s, candidates, presented, phase: "duel" };
    }
    case "discard":
      if (s.phase !== "discard" || !s.candidates[a.index]) return s;
      return {
        ...s,
        phase: "discarded",
        discarded: s.candidates[a.index],
        candidates: s.candidates.filter((_, i) => i !== a.index),
      };
    case "toDuel":
      return s.phase === "discarded" ? { ...s, phase: "duel", discarded: null } : s;
    case "pick":
      return s.phase === "duel" && s.candidates[a.index] ? { ...s, duelPick: a.index } : s;
    case "confirmPick":
      return s.phase === "duel" && s.duelPick !== null ? { ...s, phase: "duelPicked" } : s;
    case "luck":
      return s.phase === "duel" ? { ...s, phase: "duelLuck", duelPick: null } : s;
    case "win":
      if ((s.phase !== "duelLuck" && s.phase !== "duelPicked") || !s.candidates[a.index]) return s;
      return { ...s, phase: "reveal", winner: s.candidates[a.index] };
    case "again":
      return s.phase === "reveal" ? { ...INITIAL_GAME, phase: "choose" } : s;
    case "start":
      return s.phase === "reveal" ? { ...s, phase: "starting", ctaError: false } : s;
    case "startDone":
      return s.phase === "starting" ? { ...s, phase: "started" } : s;
    case "startFailed":
      return s.phase === "starting" ? { ...s, phase: "reveal", ctaError: true } : s;
  }
}
```

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/rincon/use-sorteo-game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/rincon/use-sorteo-game.ts src/components/rincon/use-sorteo-game.test.ts
git commit -m "feat(sorteo): reducer de fases de la partida"
```

---

### Task 4: Server action `loadSorteo` y cadenas del namespace `sorteo`

**Files:**
- Create: `src/lib/rincon/load-sorteo.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `getSorteoPool` (Task 1) y `getCompanionState` (`src/lib/pet/get-companion-state.ts`).
- Produces:
  - `type SorteoPet = { name: string; petClass: PetClass; stage: PetStage }`
  - `type SorteoLoad = { items: SorteoItem[]; collections: SorteoCollection[]; pet: SorteoPet | null }`
  - `loadSorteo(): Promise<SorteoLoad>`
  - Mensajes `sorteo.*`

- [ ] **Step 1: Lee la guía de server functions de esta versión de Next**

Lee `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, en concreto la
sección «Event Handlers»: invocar una Server Function desde `onClick` o `useEffect`.

- [ ] **Step 2: Implementa la action**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanionState } from "@/lib/pet/get-companion-state";
import type { PetClass, PetStage } from "@/lib/pet/classes";
import { getSorteoPool } from "./get-sorteo-pool";
import type { SorteoCollection, SorteoItem } from "@/components/rincon/sorteo-logic";

export type SorteoPet = { name: string; petClass: PetClass; stage: PetStage };
export type SorteoLoad = { items: SorteoItem[]; collections: SorteoCollection[]; pet: SorteoPet | null };

// Se llama al abrir la partida (spec «Arquitectura»): el telón tapa la espera.
// SIN `use cache` (regla #437): el pool sale de RLS con auth.uid(), es del que mira.
// La mascota es opcional: si su lectura falla o la compañera está oculta, habla el narrador.
export async function loadSorteo(): Promise<SorteoLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("loadSorteo: sin sesión");
  const [pool, companion] = await Promise.all([
    getSorteoPool(supabase, user.id),
    getCompanionState(supabase).catch(() => null),
  ]);
  const pet =
    companion && !companion.hidden
      ? { name: companion.name, petClass: companion.petClass, stage: companion.stage }
      : null;
  return { ...pool, pet };
}
```

- [ ] **Step 3: Añade el namespace `sorteo` a `messages/es.json`**

Inserta este objeto como clave de primer nivel `"sorteo"`, por orden alfabético si el fichero lo
sigue:

```json
"sorteo": {
  "title": "Sacar un lomo",
  "close": "Cerrar",
  "phase": { "roll": "Tirada", "present": "Candidatos", "discard": "Descarte", "duel": "Duelo", "reveal": "¡Tenemos lomo!" },
  "roll": "¡Tirar!",
  "tuneOpen": "Afinar la tirada",
  "tuneHint": "Afinar",
  "inPlay": "{count, plural, one {# lomo en juego} other {# lomos en juego}}",
  "tuneTitle": "Afinar la tirada",
  "tuneDone": "Listo",
  "tuneReset": "Restablecer",
  "tuneSummary": "Sorteando entre {count} de tus {total} pendientes",
  "tuneTypesLabel": "Qué te apetece",
  "tuneTimeLabel": "Cuánto tiempo (a tu ritmo)",
  "types": { "all": "Todo", "book": "Libros", "movie": "Películas", "series": "Series" },
  "buckets": { "short": "Un rato · ‹2 h", "med": "Una tarde · 2–5 h", "long": "Para largo · +5 h", "none": "Sin estimar" },
  "antojo": {
    "any": "Sorpréndeme",
    "wait": "Lo que más espera",
    "fresh": { "all": "Nunca empezado", "book": "Nunca empezado", "movie": "Nunca vista", "series": "Nunca empezada" },
    "quick": { "book": "Lectura corta", "movie": "Para esta noche", "series": "Miniserie" },
    "anyDesc": { "all": "Cualquiera de tus pendientes", "book": "Cualquier libro pendiente", "movie": "Cualquier película pendiente", "series": "Cualquier serie pendiente" },
    "waitDesc": "El tercio que más tiempo lleva esperando",
    "freshDesc": "Sin ningún intento anterior",
    "quickDesc": { "book": "4 h o menos a tu ritmo", "movie": "2 h 30 o menos", "series": "10 episodios u 8 h como mucho" },
    "collectionDesc": "De tu colección",
    "empty": "Nada aquí ahora",
    "count": "{count, plural, one {# lomo} other {# lomos}}",
    "chosen": "✓ elegido"
  },
  "rolling": "Barajando la balda…",
  "skipToDuel": "Saltar al duelo",
  "presenting": "Presentando a los candidatos…",
  "skipPresent": "Saltar presentación",
  "discardHint": "Toca la ✕ del que no te apetece hoy.",
  "discardLabel": "Devolver {title} a la balda",
  "luck": "🎲 Que decida la suerte",
  "mine": "Me quedo con este",
  "mineNamed": "Me quedo con «{title}»",
  "duelHint": "O toca uno de los dos para elegirlo tú.",
  "estimate": "≈ {duration} a tu ritmo",
  "noEstimate": "Sin estimación",
  "cta": { "book": "Empezar a leer", "movie": "Ver esta noche", "series": "Empezar la T1" },
  "ctaPending": "Un momento…",
  "ctaDone": "✓ En curso",
  "ctaError": "No se pudo empezar. Ábrelo desde su ficha.",
  "again": "↻ Otra partida",
  "goToItem": "Ver ficha",
  "retry": "Reintentar",
  "emptyPool": "No quedan pendientes.",
  "emptyCta": "Buscar algo que añadir",
  "trigger": "¿Cuál toca?",
  "triggerLabel": "Sacar un lomo: sortea tu próximo pendiente",
  "say": {
    "count": "{count, plural, =0 {Así no queda nadie. Afloja algo y vuelvo a mirar.} one {Solo queda uno. Poca emoción, pero vale.} =2 {Solo quedan dos. Poca emoción, pero vale.} other {# lomos en juego. Cuando quieras, tira.}}",
    "discard": "Tres son multitud. Uno se vuelve a la balda. ¿Cuál?",
    "discarded": { "0": "otra vez será.", "1": "vuelve a su sitio con dignidad.", "2": "dice que no pasa nada. Pasa." },
    "duel": "Cara a cara. ¿Lo dejamos a la suerte o ya lo tienes claro?",
    "picked": { "0": "Decidido. Me gusta tu estilo.", "1": "Sin titubeos. Así se hace." },
    "solo": "Solo me quedas tú.",
    "started": { "0": "¡A disfrutarlo!", "1": "Hecho. Ya lo tienes en curso." },
    "loadError": "No he podido mirar tu balda. ¿Lo intento otra vez?"
  },
  "lines": {
    "waitLong": { "0": "Te espera desde {since}. Paciencia de santo.", "1": "Lleva en tu balda desde {since}. Ya tiene polvo con nombre.", "2": "{years, plural, one {Más de un año} other {Más de # años}} esperando su turno. ¿Hoy sí?" },
    "tonight": { "0": "≈{duration} a tu ritmo: te cabe esta noche.", "1": "Solo ≈{duration}. Ni te enteras." },
    "miniseries": { "0": "{episodes} episodios y fuera. Compromiso bajo.", "1": "Miniserie de {episodes}: un fin de semana y listo." },
    "long": { "0": "≈{duration}. Esto es una relación seria.", "1": "≈{duration} a tu ritmo. Trae merienda." },
    "retry": { "0": "Ya os conocéis… ¿segunda oportunidad?", "1": "Lo dejaste a medias una vez. Te guarda rencor, poco." },
    "fresh": { "0": "Primera vez. Nada de spoilers.", "1": "Nunca lo has empezado. Todo por descubrir." }
  }
}
```

- [ ] **Step 4: Valida el JSON y los tipos**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"; npx tsc --noEmit`
Expected: sin salida de error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rincon/load-sorteo.ts messages/es.json
git commit -m "feat(sorteo): server action loadSorteo y cadenas del namespace sorteo"
```

---

### Task 5: Estilos de la escena (CSS module)

**Files:**
- Create: `src/components/rincon/sorteo-stage.module.css`

**Interfaces:**
- Produces: las clases que usan las Tasks 6 y 7, con **los mismos nombres que el prototipo**, a los
  que se accede como `styles["nombre"]`. Lista exacta:
  - Escenario: `stage`, `st`, `compact`, `st-head`, `phase`, `icon-btn`, `ghost`, `curtain`, `open`,
    `gone`, `lbl`, `scene`, `choosing`, `glow`, `floor`, `motes`.
  - Mueble: `case`, `dim`, `lit`, `shake`, `rows`, `row`, `lip`, `spot`.
  - Lomos: `bk`, `book`, `movie`, `series`, `tt`, `band`, `au`, `cap`, `lean`, `off`, `tick`,
    `pulled`, `taken`.
  - Atrezo: `dc`, `plant`, `pot`, `lf`, `flat`, `bookend`, `spacer`.
  - Mascota: `pet`, `in`, `hop`, `bubble`, `narrator`.
  - Candidatos: `podium`, `discarding`, `duel`, `reveal`, `cand`, `flip`, `face`, `back`, `hidden`,
    `drop`, `focus`, `pick`, `x`, `out`, `tag`, `ped`, `vs`, `win`, `confetti`.
  - Controles: `ctrl`, `mainbar`, `pill`, `ic`, `chev`, `cta`, `big`, `sec`, `btnrow`, `hint`,
    `result`, `meta`, `est`, `error`.
  - Panel «Afinar»: `tune`, `on`, `tune-head`, `types`, `chip`, `dot`, `antojos`, `antojo`, `n`,
    `tlabel`, `trow`, `tchk`, `sumrow`.

- [ ] **Step 1: Porta el CSS del prototipo**

Copia de `docs/superpowers/specs/assets/2026-11-06-sacar-lomo-prototipo.html` todo el bloque entre
la línea `/* ---------- Escenario ---------- */` (≈ línea 87) y el final del bloque
`@media (prefers-reduced-motion: reduce) { … }` (≈ línea 346). Incluye la sección «Botones con los
materiales del mueble», que redefine `.cta`, `.sec`, `.pill`, `.icon-btn`, `.chip`, `.tchk`,
`.antojo` y `.tune`. Aplica estas conversiones mecánicas:

1. **Contenedor:** `dialog.stage` → `.stage`, y `dialog.stage::backdrop` → `.stage::backdrop`.
2. **Tokens:** pega al principio del módulo esta regla, que trae los tokens del `:root` del
   prototipo al propio escenario (la hoja es espresso fija, igual en claro y oscuro):
   ```css
   .stage {
     --st-bg: #17110d; --st-panel: #241d18; --st-raise: #2f2620; --st-line: rgba(240,232,219,.12);
     --st-fg: #f0e8db; --st-muted: #a99e8c; --st-cta: #d98a5c; --st-cta-ink: #1f1409; --st-gold: #e0a94a;
     --wood: #5b3e27; --wood-dk: #3a2717; --wood-lt: #7d5737; --back: #1c130c;
     --f-display: var(--font-fraunces), Georgia, serif;
     --f-body: var(--font-geist-sans), system-ui, sans-serif;
     --f-mono: var(--font-geist-mono), ui-monospace, monospace;
     font-family: var(--f-body);
   }
   ```
3. **Mascota:** sustituye las reglas `.sprite…` y `@keyframes strip` del prototipo (allí el sprite
   era a mano) por este envoltorio, porque aquí se usa `PetSprite`:
   ```css
   .pet { --petscale: 1.5; }
   .pet > .sprite-box { transform: scale(var(--petscale)); transform-origin: bottom right; image-rendering: pixelated; }
   @media (max-width: 640px) { .pet { --petscale: 1.1; } }
   .narrator { position: absolute; right: 8px; bottom: calc(100% + 8px); z-index: 9; }
   ```
   Añade `sprite-box` a la lista de clases.
4. **Atrezo:** `.plant .lf:nth-of-type(n)` y `.flat i:nth-of-type(n)` se quedan tal cual.
5. **Estado de error** (no está en el prototipo):
   `.error { color: #d97a63; font-size: 12px; text-align: center; margin: 0; }`.
6. **Selectores de reduced motion:** `.sprite { animation: none }` se borra (ya lo gestiona
   `PetSprite`) y `.motes { display: none }` se mantiene.

- [ ] **Step 2: Comprueba que compila**

Run: `npx tsc --noEmit; npm run lint`
Expected: sin errores. El módulo aún no se importa; se valida al montarlo en la Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/components/rincon/sorteo-stage.module.css
git commit -m "feat(sorteo): estilos de la escena portados del prototipo"
```

---

### Task 6: Piezas de la escena (mueble, mascota, panel «Afinar» y candidatos)

**Files:**
- Create: `src/components/rincon/stage-bookcase.tsx`
- Create: `src/components/rincon/stage-pet.tsx`
- Create: `src/components/rincon/stage-tune.tsx`
- Create: `src/components/rincon/stage-podium.tsx`
- Test: `src/components/rincon/stage-parts.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 4 y 5 (lógica, `SorteoPet`, estilos).
- Produces:
  - `StageBookcase({ items, offKeys, tickKey, pulledKeys, takenKeys, lit, dim, shakeSeq, choosing, children })`
  - `StagePet({ pet, speech, entered })`, con
    `type Speech = { title?: string; text: string; mood: "idle" | "sad" | "joy" } | null`
  - `StageTune({ open, pool, collections, settings, onChange, onDone })`
  - `StagePodium({ phase, candidates, presented, focusIndex, duelPick, winner, onDiscard, onPick })`

- [ ] **Step 1: Escribe el test que falla**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { DEFAULT_SETTINGS, type SorteoItem } from "./sorteo-logic";
import { StageBookcase } from "./stage-bookcase";
import { StageTune } from "./stage-tune";
import { StagePodium } from "./stage-podium";

const mk = (id: string, over: Partial<SorteoItem> = {}): SorteoItem => ({
  itemType: "book", itemId: id, title: `Libro ${id}`, subtitle: "Ana Pérez", coverUrl: null, metaText: "",
  estimatedMinutes: 100, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-01-01T00:00:00Z", totalEpisodes: null, ...over,
});
const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>
);
afterEach(cleanup);

describe("StageBookcase", () => {
  it("pinta un lomo por ítem con su título y apaga los no elegibles", () => {
    const items = [mk("a"), mk("b")];
    render(wrap(<StageBookcase items={items} offKeys={new Set(["book:b"])} tickKey={null}
      pulledKeys={new Set()} takenKeys={new Set()} lit={false} dim={false} shakeSeq={0} choosing>{null}</StageBookcase>));
    expect(screen.getByTitle("Libro a").className).not.toMatch(/off/);
    expect(screen.getByTitle("Libro b").className).toMatch(/off/);
  });
});

describe("StageTune", () => {
  it("cambiar a Películas ofrece «Para esta noche» y avisa del cambio", () => {
    const onChange = vi.fn();
    render(wrap(<StageTune open pool={[mk("m", { itemType: "movie" })]} collections={[]}
      settings={DEFAULT_SETTINGS} onChange={onChange} onDone={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /Películas/ }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, type: "movie" });
  });
  it("un antojo sin candidatos sale desactivado con «Nada aquí ahora»", () => {
    render(wrap(<StageTune open pool={[mk("a", { fresh: false })]} collections={[]}
      settings={DEFAULT_SETTINGS} onChange={() => {}} onDone={() => {}} />));
    const fresh = screen.getByRole("button", { name: /Nunca empezado/ });
    expect(fresh).toHaveProperty("disabled", true);
    expect(fresh.textContent).toContain("Nada aquí ahora");
  });
});

describe("StagePodium", () => {
  it("en descarte cada candidato tiene su ✕ con nombre accesible", () => {
    const onDiscard = vi.fn();
    render(wrap(<StagePodium phase="discard" candidates={[mk("a"), mk("b"), mk("c")]} presented={3}
      focusIndex={null} duelPick={null} winner={null} onDiscard={onDiscard} onPick={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: "Devolver Libro b a la balda" }));
    expect(onDiscard).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/rincon/stage-parts.test.tsx`
Expected: FAIL; los módulos no existen.

- [ ] **Step 3: `stage-bookcase.tsx`**

```tsx
"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { initials, itemKey, seasonsLabel, spineHeight, spineShade, spineWidth, type SorteoItem } from "./sorteo-logic";
import styles from "./sorteo-stage.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// El mueble (spec «Estantería»): dos baldas con todos los pendientes (hasta 24),
// atrezo, y el foco que sigue al lomo `tickKey` durante la tirada.
export function StageBookcase({
  items, offKeys, tickKey, pulledKeys, takenKeys, lit, dim, shakeSeq, choosing, children,
}: {
  items: SorteoItem[];
  offKeys: ReadonlySet<string>;
  tickKey: string | null;
  pulledKeys: ReadonlySet<string>;
  takenKeys: ReadonlySet<string>;
  lit: boolean;
  dim: boolean;
  shakeSeq: number;
  choosing: boolean;
  children: ReactNode; // la mascota y su bocadillo, sentados encima
}) {
  const caseRef = useRef<HTMLDivElement>(null);

  // El foco se coloca sobre el lomo en tick, medido en el propio mueble.
  useLayoutEffect(() => {
    const box = caseRef.current;
    if (!box || !tickKey) return;
    const spine = box.querySelector<HTMLElement>(`[data-key="${CSS.escape(tickKey)}"]`);
    if (!spine) return;
    const c = box.getBoundingClientRect();
    const r = spine.getBoundingClientRect();
    box.style.setProperty("--sx", `${r.left - c.left + r.width / 2}px`);
    box.style.setProperty("--sy", `${r.top - c.top + r.height / 2}px`);
  }, [tickKey]);

  // Reinicia la animación de temblor en cada tirada.
  useEffect(() => {
    const box = caseRef.current;
    if (!box || shakeSeq === 0) return;
    box.classList.remove(styles.shake);
    void box.offsetWidth;
    box.classList.add(styles.shake);
  }, [shakeSeq]);

  const half = Math.ceil(items.length / 2);
  const rows = [items.slice(0, half), items.slice(half)];
  const spine = (item: SorteoItem, lean: boolean) => {
    const k = itemKey(item);
    const style = { "--w": `${spineWidth(item)}px`, "--h": `${spineHeight(item.itemId)}%`, "--c": spineShade(item) } as CSSProperties;
    return (
      <div
        key={k}
        data-key={k}
        title={item.title}
        aria-hidden
        style={style}
        className={cx(styles.bk, styles[item.itemType], lean && styles.lean, offKeys.has(k) && styles.off,
          tickKey === k && styles.tick, pulledKeys.has(k) && styles.pulled, takenKeys.has(k) && styles.taken)}
      >
        {item.itemType === "book" && (<><i className={styles.band} /><i className={styles.band} /></>)}
        {item.itemType === "movie" && <span className={styles.cap}>▶</span>}
        <span className={styles.tt}>{item.title}</span>
        {item.itemType === "book" && <i className={styles.band} />}
        <span className={styles.au}>
          {item.itemType === "series" ? seasonsLabel(item) : initials(item.subtitle ?? item.title)}
        </span>
      </div>
    );
  };

  return (
    <div ref={caseRef} className={cx(styles.case, dim && styles.dim, lit && styles.lit)}>
      <div className={styles.spot} aria-hidden />
      {children}
      <div className={cx(styles.rows, choosing && styles.choosing)}>
        <div className={styles.row}>
          {rows[0].map((i) => spine(i, false))}
          <div className={cx(styles.dc, styles.bookend)} aria-hidden />
          <span className={styles.spacer} />
          <div className={cx(styles.dc, styles.plant)} aria-hidden>
            <i className={styles.lf} /><i className={styles.lf} /><i className={styles.lf} /><b className={styles.pot} />
          </div>
        </div>
        <div className={styles.lip} />
        <div className={styles.row}>
          <div className={cx(styles.dc, styles.flat)} aria-hidden><i /><i /><i /></div>
          {rows[1].map((i, k) => spine(i, k === rows[1].length - 1))}
          <span className={styles.spacer} />
        </div>
        <div className={styles.lip} />
      </div>
    </div>
  );
}
```

En el CSS module, el hover de los lomos durante la elección se reescribe como
`.choosing .bk:not(.off):hover { transform: translateY(-6%) }`. En el prototipo colgaba de
`.scene.choosing`; aquí `choosing` va en `.rows`.

- [ ] **Step 4: `stage-pet.tsx`**

```tsx
"use client";

import { PetSprite } from "@/components/pet/pet-sprite";
import type { SorteoPet } from "@/lib/rincon/load-sorteo";
import styles from "./sorteo-stage.module.css";

export type Speech = { title?: string; text: string; mood: "idle" | "sad" | "joy" } | null;

// La mascota sentada en lo alto del mueble con su bocadillo (spec «La voz»).
// Sin mascota (o con la compañera oculta) habla un narrador: el mismo bocadillo sin sprite.
export function StagePet({ pet, speech, entered }: { pet: SorteoPet | null; speech: Speech; entered: boolean }) {
  const bubble = (
    <div className={`${styles.bubble} ${speech ? "" : styles.off}`} role="status" aria-live="polite">
      {speech && (<>{speech.title && <b>{speech.title}. </b>}{speech.text}</>)}
    </div>
  );
  if (!pet || pet.stage === "acorn") return <div className={styles.narrator}>{bubble}</div>;
  return (
    <>
      {bubble}
      <div className={`${styles.pet} ${entered ? styles.in : ""}`}>
        <div className={styles["sprite-box"]}>
          <PetSprite
            stage={pet.stage}
            petClass={pet.petClass}
            mood={speech?.mood === "sad" ? "sad" : "happy"}
            reaction={speech?.mood === "joy" ? "joy" : null}
            scale={1}
            label={pet.name}
          />
        </div>
      </div>
    </>
  );
}
```

Hay que añadir al CSS module
`.bubble.off { transform: scale(.4); opacity: 0 }`, que ya está en el prototipo como
`.bubble.off`, y `off` debe estar en la lista de clases.

- [ ] **Step 5: `stage-tune.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import {
  ALL_BUCKETS, antojosFor, eligibleItems, TYPE_ACCENT,
  type Antojo, type SorteoCollection, type SorteoItem, type SorteoSettings, type TimeBucket, type TypeFilter,
} from "./sorteo-logic";
import styles from "./sorteo-stage.module.css";

const TYPE_ORDER: TypeFilter[] = ["all", "book", "movie", "series"];

// Panel «Afinar la tirada» (spec «Controles»): opcional, se superpone desde abajo.
// Cada cambio llega al padre, que atenúa la balda en vivo.
export function StageTune({
  open, pool, collections, settings, onChange, onDone,
}: {
  open: boolean;
  pool: SorteoItem[];
  collections: SorteoCollection[];
  settings: SorteoSettings;
  onChange: (s: SorteoSettings) => void;
  onDone: () => void;
}) {
  const t = useTranslations("sorteo");
  const list = antojosFor(settings.type, collections);
  const label = (a: Antojo) => {
    if (a.collectionName) return a.collectionName;
    if (a.id === "quick") return t(`antojo.quick.${settings.type}`);
    if (a.id === "fresh") return t(`antojo.fresh.${settings.type}`);
    return t(`antojo.${a.id}`);
  };
  const desc = (a: Antojo) => {
    if (a.collectionName) return t("antojo.collectionDesc");
    if (a.id === "any") return t(`antojo.anyDesc.${settings.type}`);
    if (a.id === "quick") return t(`antojo.quickDesc.${settings.type}`);
    return t(`antojo.${a.id}Desc`);
  };
  const toggleBucket = (b: TimeBucket) => {
    const has = settings.buckets.includes(b);
    if (has && settings.buckets.length === 1) return; // siempre queda al menos uno
    onChange({ ...settings, buckets: has ? settings.buckets.filter((x) => x !== b) : [...settings.buckets, b] });
  };

  return (
    <div className={`${styles.tune} ${open ? styles.on : ""}`} aria-hidden={!open} role="group" aria-label={t("tuneTitle")}>
      <div className={styles["tune-head"]}>
        <h3>{t("tuneTitle")}</h3>
        <button type="button" className={styles.cta} onClick={onDone}>{t("tuneDone")}</button>
      </div>
      <div className={styles.types} role="group" aria-label={t("tuneTypesLabel")}>
        {TYPE_ORDER.map((type) => (
          <button key={type} type="button" className={styles.chip} aria-pressed={settings.type === type}
            onClick={() => onChange({ ...settings, type, antojo: "any" })}>
            {type !== "all" && <span className={styles.dot} style={{ background: TYPE_ACCENT[type] }} />}
            {t(`types.${type}`)}
          </button>
        ))}
      </div>
      <div className={styles.antojos}>
        {list.map((a) => {
          const n = eligibleItems(pool, settings, a.id).length;
          return (
            <button key={a.id} type="button" className={styles.antojo} aria-pressed={settings.antojo === a.id}
              disabled={n === 0} onClick={() => onChange({ ...settings, antojo: a.id })}>
              <span className={styles.ic} aria-hidden>{a.icon}</span>
              <b>{label(a)}</b>
              <small>{n > 0 ? desc(a) : t("antojo.empty")}</small>
              <span className={styles.n}>
                {t("antojo.count", { count: n })}
                {settings.antojo === a.id && ` ${t("antojo.chosen")}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.tlabel}>{t("tuneTimeLabel")}</p>
      <div className={styles.trow}>
        {ALL_BUCKETS.map((b) => (
          <button key={b} type="button" className={styles.tchk} aria-pressed={settings.buckets.includes(b)}
            onClick={() => toggleBucket(b)}>{t(`buckets.${b}`)}</button>
        ))}
      </div>
      <div className={styles.sumrow}>
        <span>{t("tuneSummary", { count: eligibleItems(pool, settings).length, total: pool.length })}</span>
        <button type="button" className={styles.ghost}
          onClick={() => onChange({ type: "all", antojo: "any", buckets: ALL_BUCKETS })}>{t("tuneReset")}</button>
      </div>
    </div>
  );
}
```

En el CSS del prototipo, el «✓ elegido» lo pintaba `.antojo[aria-pressed="true"] .n::after`.
**Borra esa regla**: aquí el texto lo pone el componente.

- [ ] **Step 6: `stage-podium.tsx`**

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { formatDuration } from "@/lib/pace/format-duration";
import { TYPE_COVER, type SorteoItem } from "./sorteo-logic";
import type { Phase } from "./use-sorteo-game";
import styles from "./sorteo-stage.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Cover({ item, sizes }: { item: SorteoItem; sizes: string }) {
  const [c1, c2] = TYPE_COVER[item.itemType];
  return item.coverUrl ? (
    <Image src={item.coverUrl} alt="" fill sizes={sizes} className="object-cover" />
  ) : (
    <div className="absolute inset-0 grid content-between p-[10%]" style={{ background: `linear-gradient(160deg, ${c1}, ${c2})` }}>
      <span className="font-serif text-[13px] leading-tight font-semibold text-white/95">{item.title}</span>
      <span className="font-mono text-[9px] tracking-wider text-white/70 uppercase">{item.subtitle}</span>
    </div>
  );
}

// Candidatos delante del mueble (spec «La partida», fases 4–7).
export function StagePodium({
  phase, candidates, presented, focusIndex, duelPick, winner, onDiscard, onPick,
}: {
  phase: Phase;
  candidates: SorteoItem[];
  presented: number;
  focusIndex: number | null;
  duelPick: number | null;
  winner: SorteoItem | null;
  onDiscard: (index: number) => void;
  onPick: (index: number) => void;
}) {
  const t = useTranslations("sorteo");
  const reveal = phase === "reveal" || phase === "starting" || phase === "started";
  const duel = phase === "duel" || phase === "duelLuck" || phase === "duelPicked";
  const shown = reveal && winner ? [winner] : candidates;
  const estimate = (i: SorteoItem) =>
    i.estimatedMinutes !== null ? t("estimate", { duration: formatDuration(i.estimatedMinutes) }) : t("noEstimate");

  const card = (item: SorteoItem, index: number) => (
    <div
      key={`${item.itemType}:${item.itemId}`}
      className={cx(styles.cand, phase === "present" && styles.drop, !reveal && index >= presented && phase === "present" && styles.hidden,
        focusIndex === index && styles.focus, focusIndex !== null && focusIndex !== index && styles.dim,
        duelPick === index && styles.pick, reveal && styles.win)}
      style={{ "--c1": TYPE_COVER[item.itemType][0], "--c2": TYPE_COVER[item.itemType][1], animationDelay: `${index * 120}ms` } as React.CSSProperties}
      onClick={phase === "duel" ? () => onPick(index) : undefined}
      role={phase === "duel" ? "button" : undefined}
      tabIndex={phase === "duel" ? 0 : undefined}
      aria-pressed={phase === "duel" ? duelPick === index : undefined}
      aria-label={phase === "duel" ? item.title : undefined}
      onKeyDown={phase === "duel" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(index); } } : undefined}
    >
      {phase === "discard" && (
        <button type="button" className={styles.x} aria-label={t("discardLabel", { title: item.title })}
          onClick={(e) => { e.stopPropagation(); onDiscard(index); }}>✕</button>
      )}
      <div className={styles.flip}>
        <div className={styles.face}><Cover item={item} sizes="150px" /></div>
        <div className={styles.back} />
      </div>
      <div className={styles.ped} />
      {!reveal && (index < presented || phase !== "present") && (
        <div className={styles.tag}><b>{item.title}</b>{estimate(item)}</div>
      )}
    </div>
  );

  return (
    <div className={cx(styles.podium, phase === "discard" && styles.discarding, duel && styles.duel, reveal && styles.reveal)}>
      {duel && shown.length === 2
        ? [card(shown[0], 0), <div key="vs" className={styles.vs} aria-hidden>vs</div>, card(shown[1], 1)]
        : shown.map(card)}
    </div>
  );
}
```

- [ ] **Step 7: Comprueba que pasa**

Run: `npx vitest run src/components/rincon/stage-parts.test.tsx; npx tsc --noEmit`
Expected: PASS. Si `PetSprite` falla en jsdom por el CSS module, en este test no se monta
`StagePet`.

- [ ] **Step 8: Commit**

```bash
git add src/components/rincon/stage-*.tsx src/components/rincon/stage-parts.test.tsx src/components/rincon/sorteo-stage.module.css
git commit -m "feat(sorteo): mueble, mascota, panel Afinar y candidatos"
```

---

### Task 7: `SorteoStage`, la orquestación de la partida

**Files:**
- Create: `src/components/rincon/sorteo-stage.tsx`
- Test: `src/components/rincon/sorteo-stage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–6 y `updateStatus` (`src/lib/library/manage-actions.ts`).
- Produces:
  `SorteoStage({ open, onClose }: { open: boolean; onClose: () => void })`. Al pasar `open` de
  `false` a `true`, llama a `loadSorteo()`, hace `showModal()` y marca
  `document.documentElement.dataset.sorteoOpen = ""`. `onClose` se llama cuando el `<dialog>` emite
  `close`.

- [ ] **Step 1: Escribe el test que falla**

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { SorteoItem } from "./sorteo-logic";

const mocks = vi.hoisted(() => ({ load: vi.fn(), update: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/rincon/load-sorteo", () => ({ loadSorteo: mocks.load }));
vi.mock("@/lib/library/manage-actions", () => ({ updateStatus: mocks.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/pet/pet-sprite", () => ({ PetSprite: () => null }));
import { SorteoStage } from "./sorteo-stage";

const mk = (id: string): SorteoItem => ({
  itemType: "movie", itemId: id, title: `Peli ${id}`, subtitle: null, coverUrl: null, metaText: "",
  estimatedMinutes: 100, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-10-01T00:00:00Z", totalEpisodes: null,
});

beforeAll(() => {
  // jsdom no implementa <dialog>.showModal/close ni matchMedia.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never; // reduced motion: retardos cortos
});
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

const ui = (onClose = vi.fn()) => (
  <NextIntlClientProvider locale="es" messages={messages}><SorteoStage open onClose={onClose} /></NextIntlClientProvider>
);
const flush = async () => { await act(async () => { await vi.runAllTimersAsync(); }); };

describe("SorteoStage", () => {
  it("dos candidatos: tirar → duelo → me quedo → CTA → cierra y refresca", async () => {
    mocks.load.mockResolvedValue({ items: [mk("a"), mk("b")], collections: [], pet: null });
    mocks.update.mockResolvedValue({ kind: "done", passId: "p", closed: false, created: false });
    const onClose = vi.fn();
    render(ui(onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "¡Tirar!" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Peli a" }));
    fireEvent.click(screen.getByRole("button", { name: "Me quedo con «Peli a»" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Ver esta noche" }));
    await flush();
    expect(mocks.update).toHaveBeenCalledWith("movie", "a", "in_progress");
    expect(onClose).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(document.documentElement.dataset.sorteoOpen).toBeUndefined();
  });

  it("si falla la carga ofrece reintentar", async () => {
    mocks.load.mockRejectedValueOnce(new Error("x")).mockResolvedValue({ items: [mk("a")], collections: [], pet: null });
    render(ui());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await flush();
    expect(screen.getByRole("button", { name: "¡Tirar!" })).toBeTruthy();
  });

  it("si falla el CTA enseña el error y no cierra", async () => {
    mocks.load.mockResolvedValue({ items: [mk("a")], collections: [], pet: null });
    mocks.update.mockRejectedValue(new Error("x"));
    const onClose = vi.fn();
    render(ui(onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "¡Tirar!" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Ver esta noche" }));
    await flush();
    expect(screen.getByText(messages.sorteo.ctaError)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pool vacío: mensaje y enlace a Buscar", async () => {
    mocks.load.mockResolvedValue({ items: [], collections: [], pet: null });
    render(ui());
    await flush();
    expect(screen.getByRole("link", { name: messages.sorteo.emptyCta })).toHaveProperty("pathname", "/buscar");
  });
});
```

- [ ] **Step 2: Comprueba que falla**

Run: `npx vitest run src/components/rincon/sorteo-stage.test.tsx`
Expected: FAIL; el módulo no existe.

- [ ] **Step 3: Implementa `sorteo-stage.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { loadSorteo, type SorteoLoad } from "@/lib/rincon/load-sorteo";
import { updateStatus } from "@/lib/library/manage-actions";
import { itemHref } from "@/lib/catalog/item-href";
import { formatDuration } from "@/lib/pace/format-duration";
import {
  BOOKCASE_MAX, DEFAULT_SETTINGS, eligibleItems, itemKey, normalizeSettings, pickIndex, sampleCandidates, shuffle,
  type SorteoSettings,
} from "./sorteo-logic";
import { lineFor, type CandidateLine } from "./sorteo-lines";
import { gameReducer, INITIAL_GAME } from "./use-sorteo-game";
import { StageBookcase } from "./stage-bookcase";
import { StagePet, type Speech } from "./stage-pet";
import { StageTune } from "./stage-tune";
import { StagePodium } from "./stage-podium";
import styles from "./sorteo-stage.module.css";

const SETTINGS_KEY = "sorteo:settings";
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const SINCE = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" });
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function readSettings(): SorteoSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as SorteoSettings) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// La partida (spec 2026-11-06). Un <dialog> nativo (foco atrapado y Escape) que
// se abre encima de la página de origen; al empezar algo cierra y refresca, así
// que el usuario se queda donde estaba.
export function SorteoStage({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("sorteo");
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timers = useRef<number[]>([]);
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME);
  const [data, setData] = useState<SorteoLoad | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [settings, setSettings] = useState<SorteoSettings>(DEFAULT_SETTINGS);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const [tickKey, setTickKey] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Set<string>>(new Set());
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [shakeSeq, setShakeSeq] = useState(0);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<string, CandidateLine>>({});
  const [reaction, setReaction] = useState(0); // variante de la frase de reacción

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, reducedMotion() ? Math.min(ms, 120) : ms));
  }, []);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const pool = data?.items ?? [];
  const eligible = useMemo(() => eligibleItems(pool, settings), [pool, settings]);
  const shelf = useMemo(
    () => order.map((k) => pool.find((i) => itemKey(i) === k)).filter((i): i is NonNullable<typeof i> => !!i),
    [order, pool]
  );
  const offKeys = useMemo(() => {
    const ok = new Set(eligible.map(itemKey));
    return new Set(shelf.map(itemKey).filter((k) => !ok.has(k)));
  }, [eligible, shelf]);

  const load = useCallback(async () => {
    try {
      const res = await loadSorteo();
      setData(res);
      setOrder(shuffle(res.items).slice(0, BOOKCASE_MAX).map(itemKey));
      setSettings(normalizeSettings(readSettings(), res.collections));
      dispatch({ type: "loaded", empty: res.items.length === 0 });
    } catch {
      dispatch({ type: "failed" });
    }
  }, []);

  // Abrir: telón + carga en paralelo. Cerrar: limpiar todo.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      clearTimers();
      dispatch({ type: "reset" });
      setCurtainOpen(false); setTuneOpen(false); setPulled(new Set()); setTaken(new Set()); setTickKey(null);
      dialog.showModal();
      document.documentElement.dataset.sorteoOpen = "";
      void load();
      later(() => setCurtainOpen(true), 700);
    }
    if (!open && dialog.open) dialog.close();
  }, [open, load, later]);

  useEffect(() => () => { clearTimers(); delete document.documentElement.dataset.sorteoOpen; }, []);

  const handleDialogClose = () => {
    clearTimers();
    delete document.documentElement.dataset.sorteoOpen;
    onClose();
  };

  function changeSettings(s: SorteoSettings) {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* sin almacenamiento: solo esta sesión */ }
  }

  // ---- tirada: barrido del foco y los tres que salen de la balda ----
  function roll() {
    if (eligible.length === 0) return;
    const candidates = sampleCandidates(eligible);
    const today = new Date();
    const fmt = { duration: formatDuration, since: (iso: string) => SINCE.format(new Date(iso)) };
    setLines(Object.fromEntries(candidates.map((c) => [itemKey(c), lineFor(c, today, fmt)])));
    setTuneOpen(false);
    setPulled(new Set()); setTaken(new Set());
    dispatch({ type: "roll", candidates });
    setShakeSeq((n) => n + 1);
    const live = shelf.filter((i) => !offKeys.has(itemKey(i))).map(itemKey);
    const takeOut = () => {
      candidates.forEach((c, k) => {
        later(() => setPulled((p) => new Set(p).add(itemKey(c))), k * 260);
        later(() => setTaken((p) => new Set(p).add(itemKey(c))), k * 260 + 420);
      });
      later(() => dispatch({ type: "rolled" }), 1150);
    };
    if (reducedMotion() || live.length === 0) { takeOut(); return; }
    let step = 0, delay = 45, elapsed = 0;
    const tick = () => {
      setTickKey(live[step % live.length]);
      step += 1; elapsed += delay; delay = Math.min(delay * 1.12, 200);
      if (elapsed < 1600) later(tick, delay);
      else { setTickKey(null); takeOut(); }
    };
    later(tick, 300);
  }

  function skipToDuel() {
    clearTimers();
    setTickKey(null);
    setTaken(new Set(game.candidates.slice(0, 2).map(itemKey)));
    dispatch({ type: "skipToDuel" });
  }

  // ---- presentación: uno cada 2,3 s ----
  useEffect(() => {
    if (game.phase !== "present") return;
    const id = window.setTimeout(() => dispatch({ type: "presentNext" }), game.presented === 0 ? 750 : reducedMotion() ? 120 : 2300);
    return () => clearTimeout(id);
  }, [game.phase, game.presented]);
  useEffect(() => {
    setFocusIndex(game.phase === "present" && game.presented > 0 ? game.presented - 1 : null);
  }, [game.phase, game.presented]);

  // ---- descarte: el lomo vuelve a su hueco y, tras la reacción, duelo ----
  useEffect(() => {
    if (game.phase !== "discarded" || !game.discarded) return;
    const k = itemKey(game.discarded);
    setReaction(pickIndex(3));
    const back = window.setTimeout(() => {
      setTaken((p) => { const n = new Set(p); n.delete(k); return n; });
      setPulled((p) => { const n = new Set(p); n.delete(k); return n; });
    }, 500);
    const next = window.setTimeout(() => dispatch({ type: "toDuel" }), reducedMotion() ? 120 : 1300);
    return () => { clearTimeout(back); clearTimeout(next); };
  }, [game.phase, game.discarded]);

  // ---- duelo: la suerte oscila y frena; elegir tú espera un instante ----
  useEffect(() => {
    if (game.phase === "duelPicked") {
      setReaction(pickIndex(2));
      const id = window.setTimeout(() => dispatch({ type: "win", index: game.duelPick ?? 0 }), reducedMotion() ? 120 : 700);
      return () => clearTimeout(id);
    }
    if (game.phase !== "duelLuck") return;
    const winner = pickIndex(2);
    if (reducedMotion()) { const id = window.setTimeout(() => dispatch({ type: "win", index: winner }), 120); return () => clearTimeout(id); }
    let s = 0, delay = 70, elapsed = 0, id = 0;
    const flick = () => {
      const j = s % 2;
      setFocusIndex(j);
      s += 1; elapsed += delay; delay = Math.min(delay * 1.18, 520);
      id = window.setTimeout(elapsed > 1700 && j === winner ? () => dispatch({ type: "win", index: winner }) : flick,
        elapsed > 1700 && j === winner ? 650 : delay);
    };
    flick();
    return () => clearTimeout(id);
  }, [game.phase, game.duelPick]);
  useEffect(() => { if (game.phase === "reveal") setFocusIndex(null); }, [game.phase]);

  // ---- CTA ----
  async function start() {
    const w = game.winner;
    if (!w) return;
    dispatch({ type: "start" });
    try {
      const outcome = await updateStatus(w.itemType, w.itemId, "in_progress");
      dispatch({ type: outcome.kind === "done" ? "startDone" : "startFailed" });
    } catch {
      dispatch({ type: "startFailed" });
    }
  }
  useEffect(() => {
    if (game.phase !== "started") return;
    setReaction(pickIndex(2));
    const id = window.setTimeout(() => { dialogRef.current?.close(); router.refresh(); }, reducedMotion() ? 120 : 1300);
    return () => clearTimeout(id);
  }, [game.phase, router]);

  // ---- voz ----
  const lineText = (key: string) => {
    const l = lines[key];
    return l ? t(`lines.${l.key}.${l.variant}`, l.values) : "";
  };
  const speech: Speech = (() => {
    switch (game.phase) {
      case "error": return { text: t("say.loadError"), mood: "sad" };
      case "choose": return { text: t("say.count", { count: eligible.length }), mood: eligible.length ? "idle" : "sad" };
      case "present": {
        const c = game.presented > 0 ? game.candidates[game.presented - 1] : null;
        return c ? { title: c.title, text: lineText(itemKey(c)), mood: "idle" } : null;
      }
      case "discard": return { text: t("say.discard"), mood: "idle" };
      case "discarded": return game.discarded ? { title: game.discarded.title, text: t(`say.discarded.${reaction % 3}`), mood: "sad" } : null;
      case "duel": return { text: t("say.duel"), mood: "idle" };
      case "duelPicked": return { text: t(`say.picked.${reaction % 2}`), mood: "joy" };
      case "reveal": case "starting":
        return game.winner
          ? { title: game.winner.title, text: game.solo ? `${t("say.solo")} ${lineText(itemKey(game.winner))}` : lineText(itemKey(game.winner)), mood: "joy" }
          : null;
      case "started": return { text: t(`say.started.${reaction % 2}`), mood: "joy" };
      default: return null;
    }
  })();

  // ---- controles por fase ----
  const PHASE_LABEL: Partial<Record<typeof game.phase, string>> = {
    roll: "roll", present: "present", discard: "discard", discarded: "discard", duel: "duel",
    duelLuck: "duel", duelPicked: "duel", reveal: "reveal", starting: "reveal", started: "reveal",
  };
  const phaseLabel = PHASE_LABEL[game.phase];
  const w = game.winner;
  const controls = (() => {
    switch (game.phase) {
      case "loading": return null;
      case "error": return <button type="button" className={cx(styles.cta, styles.big)} onClick={() => { dispatch({ type: "reload" }); void load(); }}>{t("retry")}</button>;
      case "empty": return (<><p className={styles.hint}>{t("emptyPool")}</p><Link href="/buscar" className={cx(styles.cta, styles.big)} onClick={() => dialogRef.current?.close()}>{t("emptyCta")}</Link></>);
      case "choose": {
        const current = settings.antojo;
        return (
          <div className={styles.mainbar}>
            <button type="button" className={styles.pill} aria-label={t("tuneOpen")} aria-expanded={tuneOpen} onClick={() => setTuneOpen(true)}>
              <span className={styles.ic} aria-hidden>{current === "any" ? "🎲" : current === "wait" ? "⏳" : current === "fresh" ? "✨" : current === "quick" ? "🌙" : "📚"}</span>
              <span><b>{settings.type === "all" ? t("types.all") : t(`types.${settings.type}`)}</b><small>{t("inPlay", { count: eligible.length })} · {t("tuneHint")}</small></span>
              <span className={styles.chev} aria-hidden>▾</span>
            </button>
            <button type="button" className={cx(styles.cta, styles.big)} disabled={eligible.length === 0} onClick={roll}>{t("roll")}</button>
          </div>
        );
      }
      case "roll": return (<><p className={styles.hint}>{t("rolling")}</p><button type="button" className={styles.ghost} onClick={skipToDuel}>{t("skipToDuel")}</button></>);
      case "present": return (<><p className={styles.hint}>{t("presenting")}</p><button type="button" className={styles.ghost} onClick={() => dispatch({ type: "skipPresent" })}>{t("skipPresent")}</button></>);
      case "discard": case "discarded": return <p className={styles.hint}>{t("discardHint")}</p>;
      case "duel": case "duelLuck": case "duelPicked": {
        const picked = game.duelPick !== null ? game.candidates[game.duelPick] : null;
        const busy = game.phase !== "duel";
        return (<>
          <div className={styles.btnrow}>
            <button type="button" className={styles.cta} disabled={busy} onClick={() => dispatch({ type: "luck" })}>{t("luck")}</button>
            <button type="button" className={styles.sec} disabled={busy || !picked} onClick={() => dispatch({ type: "confirmPick" })}>
              {picked ? t("mineNamed", { title: picked.title }) : t("mine")}
            </button>
          </div>
          <p className={styles.hint}>{t("duelHint")}</p>
        </>);
      }
      case "reveal": case "starting": case "started":
        if (!w) return null;
        return (<>
          <div className={styles.result}>
            <h3>{w.title}</h3>
            <span className={styles.meta}>{w.subtitle ? `${w.subtitle} · ${w.metaText}` : w.metaText}</span>
            {w.estimateText && <span className={styles.est}>{w.estimateText}</span>}
          </div>
          {game.ctaError && <p className={styles.error}>{t("ctaError")}</p>}
          <button type="button" className={cx(styles.cta, styles.big)} disabled={game.phase !== "reveal"} onClick={start}>
            {game.phase === "starting" ? t("ctaPending") : game.phase === "started" ? t("ctaDone") : t(`cta.${w.itemType}`)}
          </button>
          <div className={styles.btnrow}>
            <button type="button" className={styles.sec} disabled={game.phase !== "reveal"} onClick={() => { setPulled(new Set()); setTaken(new Set()); dispatch({ type: "again" }); }}>{t("again")}</button>
            <Link href={itemHref(w.itemType, w.itemId)} className={styles.sec} onClick={() => dialogRef.current?.close()}>{t("goToItem")}</Link>
          </div>
        </>);
    }
  })();

  const podium = !["loading", "error", "empty", "choose", "roll"].includes(game.phase);
  const reveal = game.phase === "reveal" || game.phase === "starting" || game.phase === "started";

  return (
    <dialog
      ref={dialogRef}
      className={styles.stage}
      aria-label={t("title")}
      onClose={handleDialogClose}
      onCancel={(e) => { if (tuneOpen) { e.preventDefault(); setTuneOpen(false); } }}
    >
      <div className={cx(styles.st, reveal && styles.compact)}>
        <div className={cx(styles.curtain, curtainOpen && styles.open, curtainOpen && game.phase !== "loading" && styles.gone)} aria-hidden>
          <i /><i /><div className={styles.lbl}>{t("title")}</div>
        </div>
        <div className={styles["st-head"]}>
          <div><h2>{t("title")}</h2>{phaseLabel && <span className={styles.phase}>{t(`phase.${phaseLabel}`)}</span>}</div>
          <button type="button" className={styles["icon-btn"]} aria-label={t("close")}
            onClick={() => (tuneOpen ? setTuneOpen(false) : dialogRef.current?.close())}>✕</button>
        </div>
        <div className={cx(styles.scene, game.phase === "choose" && styles.choosing)}>
          <div className={styles.glow} aria-hidden />
          <div className={styles.floor} aria-hidden />
          <StageBookcase items={shelf} offKeys={offKeys} tickKey={tickKey} pulledKeys={pulled} takenKeys={taken}
            lit={tickKey !== null} dim={podium} shakeSeq={shakeSeq} choosing={game.phase === "choose"}>
            <StagePet pet={data?.pet ?? null} speech={tuneOpen ? null : speech} entered={curtainOpen && game.phase !== "loading"} />
          </StageBookcase>
          {podium && (
            <StagePodium phase={game.phase} candidates={game.candidates} presented={game.presented}
              focusIndex={focusIndex} duelPick={game.duelPick} winner={game.winner}
              onDiscard={(index) => dispatch({ type: "discard", index })} onPick={(index) => dispatch({ type: "pick", index })} />
          )}
        </div>
        <div className={styles.ctrl}>{controls}</div>
        {data && (
          <StageTune open={tuneOpen} pool={pool} collections={data.collections} settings={settings}
            onChange={changeSettings} onDone={() => setTuneOpen(false)} />
        )}
      </div>
    </dialog>
  );
}
```

Hay que añadir al CSS module `.choosing` dentro de `.scene` (ya existe en el prototipo como
`.scene.choosing`) y asegurarse de que las motas (`.motes`) se pintan. **Atención:** el componente
no renderiza `.motes`, así que añade dentro de `.scene`, tras el `glow`, 14 `<i>` con posiciones
deterministas:

```tsx
<div className={styles.motes} aria-hidden>
  {Array.from({ length: 14 }, (_, i) => (
    <i key={i} style={{ left: `${(i * 37) % 100}%`, top: `${40 + ((i * 53) % 55)}%`, ["--dx" as string]: `${((i * 29) % 40) - 20}px`, animationDuration: `${7 + (i % 7)}s`, animationDelay: `${-i}s` }} />
  ))}
</div>
```

El confeti de la revelación se añade dentro de `.scene` como
`{reveal && <div className={styles.confetti} aria-hidden>{…46 <i> con el mismo patrón determinista…}</div>}`.
Copia la generación de `confetti()` del prototipo cambiando `Math.random()` por expresiones
`(i * primo) % n`, para que el render sea puro (React Compiler).

- [ ] **Step 4: Comprueba que pasa**

Run: `npx vitest run src/components/rincon/sorteo-stage.test.tsx; npx tsc --noEmit; npm run lint`
Expected: PASS y sin errores. Si el lint marca `react-hooks/exhaustive-deps` en los efectos que
leen `game.*`, añade la dependencia que falte. No silencies la regla.

- [ ] **Step 5: Commit**

```bash
git add src/components/rincon/sorteo-stage.tsx src/components/rincon/sorteo-stage.test.tsx src/components/rincon/sorteo-stage.module.css
git commit -m "feat(sorteo): SorteoStage orquesta la partida"
```

---

### Task 8: Disparadores (Inicio y Rincón) y ocultar la compañera

**Files:**
- Create: `src/components/rincon/sorteo-trigger.tsx`
- Modify: `src/components/rincon/spine-draw.tsx`, `src/components/rincon/spine-draw.test.tsx`
- Modify: `src/components/stats/later-shelf.tsx`, `src/components/stats/today-block.tsx`,
  `src/components/stats/proxima-lectura.tsx`
- Modify: `src/components/home/home-draw-tile.tsx`
- Modify: `src/app/u/[username]/_tabs/rincon-tab.tsx`
- Modify: `src/app/globals.css`
- Modify: `messages/es.json` (quita las claves muertas)

**Interfaces:**
- Consumes: `SorteoStage` (Task 7).
- Produces:
  `SorteoTrigger({ className, ariaLabel, children })`, que carga `SorteoStage` con `next/dynamic`
  solo al pulsar por primera vez.

- [ ] **Step 1: Lee la guía de lazy loading de esta versión de Next**

Run: `ls ../../../node_modules/next/dist/docs/01-app/02-guides/ | grep -i lazy`. Lee el fichero
para confirmar la firma de `dynamic(() => import(...), { ssr: false })` en componentes cliente.

- [ ] **Step 2: `sorteo-trigger.tsx`**

```tsx
"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

// La partida pesa (mueble, mascota, panel): no viaja con el Inicio hasta que alguien pulsa.
const SorteoStage = dynamic(() => import("./sorteo-stage").then((m) => m.SorteoStage), { ssr: false });

// Abre la partida EN EL SITIO (spec 2026-11-06): al terminar sigues en la misma página.
export function SorteoTrigger({ className, ariaLabel, children }: { className?: string; ariaLabel?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} aria-label={ariaLabel} onClick={() => { setMounted(true); setOpen(true); }}>
        {children}
      </button>
      {mounted && <SorteoStage open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
```

- [ ] **Step 3: El Rincón usa la partida**

En `spine-draw.tsx`:
- borra el stub `SorteoSheet` de la Task 1;
- añade `import { SorteoStage } from "./sorteo-stage";`;
- quita la prop `collections` (y su tipo);
- sustituye el `<SorteoSheet …/>` final por `<SorteoStage open={open} onClose={close} />`.

En `rincon-tab.tsx:132` quita `collections={pool.collections}`. En `proxima-lectura.tsx`:
- quita la prop `collections` del componente y del `<SpineDraw>`;
- cambia `RouteMessages ns={["rincon"]}` por `ns={["rincon", "sorteo"]}`;
- actualiza el comentario: la hoja es ahora `SorteoStage`.

En `today-block.tsx`, quita `collections={pool.collections}` de `<ProximaLectura>`.

En `spine-draw.test.tsx`:
- sustituye el mock por
  ```tsx
  vi.mock("./sorteo-stage", () => ({
    SorteoStage: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
      open ? <div role="dialog"><button type="button" onClick={onClose}>cerrar</button></div> : null,
  }));
  ```
- quita `.skip` del caso que saltaste en la Task 1;
- añade `plannedSince` y `totalEpisodes` al fixture si no lo hiciste.

- [ ] **Step 4: Lomo-botón en «Para más tarde»**

En `later-shelf.tsx`:
- cambia la firma a `{ items, total, drawSlot }: { items: LibraryItem[]; total: number; drawSlot?: ReactNode }`
  (importa `type ReactNode` de `react`);
- borra el import de `DRAW_HREF`, el prop `showDraw` y el `<Link href={DRAW_HREF}>` de `Header`;
- `Header` recibe solo `total`;
- dentro del carrusel `today-shelf-later`, tras el `items.map(...)`, añade `{drawSlot}`;
- actualiza el comentario de `showDraw`.

En `today-block.tsx`:
- importa `RouteMessages` (`@/components/route-messages`) y `SorteoTrigger`
  (`@/components/rincon/sorteo-trigger`);
- cambia `laterShelf` por:

```tsx
  const sorteoT = await getTranslations("sorteo");
  const laterShelf = (withDraw: boolean) =>
    planned.length > 0 ? (
      <LaterShelf
        items={planned.slice(0, LATER_SHOWN)}
        total={planned.length}
        drawSlot={
          withDraw ? (
            <RouteMessages ns={["sorteo"]}>
              <SorteoTrigger className="later-draw" ariaLabel={sorteoT("triggerLabel")}>
                <span className="later-draw-stack" aria-hidden><span className="later-draw-q">?</span><i /><i /><i /></span>
                <span className="later-draw-label">{sorteoT("trigger")}</span>
              </SorteoTrigger>
            </RouteMessages>
          ) : null
        }
      />
    ) : null;
```

Mantén las llamadas existentes: `laterShelf(false)` para «Tu siguiente historia» y la que pasaba
`showDraw` en el estado «en curso», ahora con `laterShelf(true)`. Comprueba con
`grep -n "laterShelf(" src/components/stats/today-block.tsx` que el estado en curso usa `true`.

- [ ] **Step 5: Tarjeta móvil**

`home-draw-tile.tsx` queda así:

```tsx
import { getTranslations } from "next-intl/server";
import { getPlannedItems } from "@/lib/library/get-planned-items";
import { PullSpineIcon } from "@/components/ui/icons";
import { RouteMessages } from "@/components/route-messages";
import { SorteoTrigger } from "@/components/rincon/sorteo-trigger";

// «Sacar un lomo» como tarjeta propia de la rejilla móvil del Inicio (<1100).
// Abre la partida en el sitio (spec 2026-11-06): al terminar sigues en el Inicio.
// Sin pendientes no hay nada que sortear, así que no aparece.
export async function HomeDrawTile({ userId }: { userId: string }) {
  const planned = await getPlannedItems(userId);
  if (planned.length === 0) return null;
  const t = await getTranslations("homePanels");
  return (
    <RouteMessages ns={["sorteo"]}>
      <SorteoTrigger className="home-draw-tile">
        <span className="home-preview-name">{t("draw")}</span>
        <span className="home-draw-tile-body">
          <PullSpineIcon aria-hidden className="h-6 w-6 shrink-0 text-accent-ink" />
          <span className="home-preview-meta">{t("drawMeta", { count: planned.length })}</span>
        </span>
      </SorteoTrigger>
    </RouteMessages>
  );
}
```

`RouteMessages` envuelve con un provider y no añade DOM, así que los selectores
`.home-personal > .home-draw-tile` siguen valiendo. Compruébalo en el navegador (Task 9). Si no
fuera así, mueve `RouteMessages` más arriba, en `page.tsx`.

- [ ] **Step 6: CSS global**

Añade al final de `src/app/globals.css`:

```css
/* «¿Cuál toca?»: casilla final de «Para más tarde» que abre la partida (spec 2026-11-06). */
.later-draw { display:flex; flex-direction:column; gap:5px; width:66px; flex-shrink:0; padding:0; border:0; background:none; text-align:left; cursor:pointer; font:inherit; color:inherit; }
.later-draw-stack { position:relative; display:block; aspect-ratio:2/3; border-radius:6px; overflow:hidden; border:1.5px dashed color-mix(in srgb, var(--accent) 55%, transparent); background:color-mix(in srgb, var(--accent) 7%, var(--surface)); }
.later-draw-stack i { position:absolute; bottom:14%; width:13px; border-radius:3px 3px 2px 2px; transform-origin:bottom center; transition:transform 450ms cubic-bezier(.34,1.56,.64,1); box-shadow:0 3px 6px -3px rgba(0,0,0,.5); }
.later-draw-stack i:nth-of-type(1) { height:56%; left:calc(50% - 22px); background:var(--type-book, #cf8a54); transform:rotate(-9deg); }
.later-draw-stack i:nth-of-type(2) { height:66%; left:calc(50% - 6.5px); background:var(--type-movie, #6bb0b4); }
.later-draw-stack i:nth-of-type(3) { height:50%; left:calc(50% + 9px); background:var(--type-series, #b592bd); transform:rotate(8deg); }
.later-draw-q { position:absolute; top:10%; left:0; right:0; text-align:center; font-family:var(--font-fraunces), serif; font-weight:700; font-size:18px; color:var(--accent); transition:transform 300ms; }
.later-draw-label { font-family:var(--font-fraunces), serif; font-weight:600; font-size:11.5px; color:var(--accent); }
.later-draw:hover .later-draw-stack i:nth-of-type(1), .later-draw:focus-visible .later-draw-stack i:nth-of-type(1) { transform:rotate(-24deg) translateX(-4px); }
.later-draw:hover .later-draw-stack i:nth-of-type(2), .later-draw:focus-visible .later-draw-stack i:nth-of-type(2) { transform:translateY(-14px); }
.later-draw:hover .later-draw-stack i:nth-of-type(3), .later-draw:focus-visible .later-draw-stack i:nth-of-type(3) { transform:rotate(22deg) translateX(4px); }
.later-draw:hover .later-draw-q, .later-draw:focus-visible .later-draw-q { transform:scale(1.15) rotate(-6deg); }
.later-draw:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
@media (prefers-reduced-motion: reduce) { .later-draw-stack i, .later-draw-q { transition:none; } }
/* La tarjeta móvil pasa de <a> a <button>: mismo aspecto. */
button.home-draw-tile { font:inherit; color:inherit; cursor:pointer; text-align:left; }
/* Con la partida abierta no hay dos mascotas en pantalla. */
html[data-sorteo-open] [data-testid="pet-companion"] { display:none; }
```

Comprueba que existen `--accent`, `--surface` y los tokens de tipo:
`grep -n "^\s*--accent:\|^\s*--surface:\|--type-book" src/app/globals.css`. Si `--type-*` no existe,
el `var(…, fallback)` ya cubre el caso.

- [ ] **Step 7: Quita claves muertas de `messages/es.json`**

Comprueba que nada más las usa:
`grep -rn "sorteo[A-Z]\|drawLink\|drawPicked\|drawAgain" src --include=*.tsx --include=*.ts`.
Borra de `rincon` todas las claves `sorteo*`, `drawAgain` y `drawPicked`, y de `today` la clave
`drawLink`. **Conserva** `rincon.drawTitle`, `drawSub`, `drawButton` y `drawEmpty*`, porque las
usa `SpineDraw`.

- [ ] **Step 8: Tests y tipos**

Run: `npx vitest run src/components; npx tsc --noEmit; npm run lint`
Expected: PASS y sin errores.

- [ ] **Step 9: Commit**

```bash
git add -A src messages
git commit -m "feat(sorteo): la partida se abre en el sitio desde el Inicio y el Rincón"
```

---

### Task 9: Verificación en navegador y e2e

**Files:**
- Modify: `e2e/sorteo.spec.ts`
- Create: `e2e/sorteo-inicio.spec.ts`
- Revisa: `e2e/inicio-estado-vacio.spec.ts:144`, `e2e/ci/home-expandable.spec.ts:324`,
  `e2e/ia-navegacion.spec.ts`

- [ ] **Step 1: Verifica a mano en el navegador**

Arranca `npm run dev` a mano: desde un worktree, `launch.json` lanza el `dev.cmd` del repo padre
(ver memoria). Usa `next dev --webpack` si Turbopack no arranca con la junction de
`node_modules`. Con el usuario de test, comprueba:
1. **Inicio a 1280 px con algo en curso:** «¿Cuál toca?» aparece al final de «Para más tarde» y no
   hay enlace en la cabecera.
2. **La partida completa:** el telón se abre, la mascota está sentada en el mueble, «Afinar»
   atenúa la balda en vivo, y siguen tirada, presentación, descarte, duelo y revelación. El CTA
   cierra la hoja, la URL sigue siendo `/` y el título está en «Continúa».
3. **Inicio a 390 px:** la tarjeta «Sacar un lomo» abre la partida en el sitio.
4. **Rincón:** el botón y `/coleccion/rincon?sorteo=1` abren la partida.
5. **Pet companion:** la compañera flotante desaparece con la partida abierta y vuelve al cerrar.
6. **Reduced motion** (DevTools → Rendering): la partida se completa.
7. **Consola:** sin errores ni `next-request-in-use-cache`.

- [ ] **Step 2: Reescribe `e2e/sorteo.spec.ts`**

```ts
import { test, expect, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// Juega una partida con reduced motion hasta el CTA. Sirve para 1, 2 o 3+ elegibles.
export async function playToReveal(page: Page) {
  const stage = page.getByRole("dialog", { name: "Sacar un lomo" });
  await stage.getByRole("button", { name: "¡Tirar!" }).click();
  const cta = stage.getByRole("button", { name: /empezar a leer|ver esta noche|empezar la t1/i });
  const discard = stage.getByRole("button", { name: /^Devolver .* a la balda$/ });
  const luck = stage.getByRole("button", { name: /que decida la suerte/i });
  await expect(cta.or(discard.first()).or(luck)).toBeVisible({ timeout: 15_000 });
  if (await discard.first().isVisible()) await discard.first().click();
  if (await luck.isVisible().catch(() => false) || (await luck.waitFor({ timeout: 3_000 }).then(() => true).catch(() => false))) {
    await luck.click();
  }
  await expect(cta).toBeVisible({ timeout: 15_000 });
  return { stage, cta };
}

test.use({ reducedMotion: "reduce" });

test("Rincón: la partida llega al CTA y deja el ítem en curso", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
  await page.goto(`/u/${USERNAME}?tab=rincon`);
  const openButton = page.getByRole("button", { name: /sacar un lomo/i });
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  await expect(openButton.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");
  await openButton.click();
  const { stage, cta } = await playToReveal(page);
  await cta.click();
  await expect(stage).toBeHidden({ timeout: 10_000 });
});

test("?sorteo=1 abre la partida, limpia la URL y la entrada de Biblioteca la reabre", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
  await page.goto("/coleccion/rincon?sorteo=1");
  const emptyCard = page.getByText(/estantería de pendientes está vacía/i);
  const stage = page.getByRole("dialog", { name: "Sacar un lomo" });
  await expect(stage.or(emptyCard).first()).toBeVisible();
  test.skip(await emptyCard.isVisible(), "el usuario de test no tiene pendientes");
  await expect(stage.getByRole("button", { name: "¡Tirar!" })).toBeVisible();
  await expect(page).not.toHaveURL(/sorteo/);
  await page.keyboard.press("Escape");
  await expect(stage).toBeHidden();
  await page.getByRole("link", { name: "Volver a Biblioteca" }).click();
  await expect(page).toHaveURL(/\/coleccion$/);
  await page.getByRole("navigation", { name: "Herramientas de tu biblioteca" }).getByRole("link", { name: /sacar un lomo/i }).click();
  await expect(page.getByRole("dialog", { name: "Sacar un lomo" }).getByRole("button", { name: "¡Tirar!" })).toBeVisible();
});
```

Simplifica la condición de `luck` si el linter protesta. La intención es: si tras el descarte
aparece el duelo, pulsar «Que decida la suerte»; si ya estamos en la revelación, seguir.

- [ ] **Step 3: Crea `e2e/sorteo-inicio.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { submitLogin } from "./support/visible-form";
import { playToReveal } from "./sorteo.spec";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });

// Spec 2026-11-06: desde el Inicio en escritorio la partida se abre en el sitio
// y, al empezar algo, sigues en el Inicio con eso en «Continúa».
test("Inicio: «¿Cuál toca?» abre la partida en el sitio y al empezar sigues en /", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
  const trigger = page.getByRole("button", { name: /sortea tu próximo pendiente/i });
  test.skip(!(await trigger.isVisible().catch(() => false)), "sin pase en curso o sin pendientes: no hay lomo-botón");
  await trigger.click();
  const { stage, cta } = await playToReveal(page);
  const title = (await stage.getByRole("heading", { level: 3 }).textContent())!.trim();
  await cta.click();
  await expect(stage).toBeHidden({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(title).first()).toBeVisible();
});
```

Ojo con el contrato de imports entre specs (ver la memoria «Contrato de imports de club-ronda»):
importar desde otro `.spec.ts` puede romper la recolección de Playwright. Si da problemas, mueve
`playToReveal` a `e2e/support/sorteo.ts` e impórtalo desde los dos specs.

- [ ] **Step 4: Revisa los specs que tocan el sorteo**

- `e2e/ci/home-expandable.spec.ts:324` busca un botón /Sacar un lomo/ dentro de «Lo que
  disfrutas». Es el botón de `SpineDraw` y no cambia; no hay que tocarlo.
- Lee `e2e/inicio-estado-vacio.spec.ts` a partir de la línea 140. Si comprueba la hoja antigua
  (encabezado «Deja que decida la estantería» o «Sorpréndeme» como botón), cámbialo por
  `getByRole("dialog", { name: "Sacar un lomo" })` y el botón «¡Tirar!».
- `e2e/ia-navegacion.spec.ts` comprueba el enlace de Biblioteca a `?sorteo=1`, que no cambia.

- [ ] **Step 5: Corre los e2e contra build de producción (regla #437)**

Run: `npm run build` y luego `npm run start` en otra terminal (puerto 3000; mata antes el
`next dev`). Después:
`npx playwright test e2e/sorteo.spec.ts e2e/sorteo-inicio.spec.ts e2e/inicio-estado-vacio.spec.ts`
Expected: PASS, o SKIP justificado si el usuario de test no tiene pendientes. Si falla el
`webServer` por timeout, ver la memoria «Playwright: arrancar next dev a mano».

- [ ] **Step 6: Commit**

```bash
git add e2e
git commit -m "test(sorteo): e2e de la partida en Rincón e Inicio"
```

---

### Task 10: Documentación («hecho»)

**Files:**
- Modify: `docs/requirements/decisiones.md` (añadir al final)
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/UI-GLOSARIO.md`
- Modify: `docs/superpowers/specs/2026-11-06-sacar-lomo-partida-design.md`
- Modify: `docs/architecture/graph.json` (regenerar)

- [ ] **Step 1: Entrada en `decisiones.md`**

Añade al final, con el formato de las entradas previas (mira la última):

```markdown
## 2026-11-06 — «Sacar un lomo» se abre en el sitio y pasa a ser una partida

- **Revierte** la decisión del 2026-11-01 (enlace directo `/coleccion/rincon?sorteo=1` desde el
  Inicio): la partida se abre encima de la página de origen con `SorteoTrigger`, y al empezar
  algo el usuario sigue donde estaba. El coste de no consultar en cada visita al Inicio se
  mantiene: el pool lo trae la server action `loadSorteo()` solo al abrir, tapada por el telón.
- `loadSorteo` no lleva `use cache` (regla #437): el pool depende de `auth.uid()`.
- Las cadenas viven en el namespace `sorteo`, no en `rincon`: el Inicio lo manda al cliente con
  `RouteMessages` y `rincon` es mucho más grande.
- `DRAW_HREF` se queda para Biblioteca y los enlaces externos.
- Spec: `docs/superpowers/specs/2026-11-06-sacar-lomo-partida-design.md`.
```

- [ ] **Step 2: Backlog**

Run: `grep -n "7.28\|[Ss]orteo\|Sacar un lomo" docs/requirements/backlog.md`. Añade bajo el ítem del
sorteo una casilla marcada
`- [x] Partida «Sacar un lomo»: candidatos, mascota, duelo y apertura en el sitio (spec 2026-11-06)`.
Si no hay ítem, añádela en la sección del Rincón o Biblioteca.

- [ ] **Step 3: Glosario**

En `docs/UI-GLOSARIO.md`, junto a «Sacar un lomo», añade:
- **«¿Cuál toca?»**: la casilla de «Para más tarde» que abre la partida.
- **«Afinar la tirada»**: el panel opcional de tipo, antojos y tiempo.
- **Antojo**: intención como «Para esta noche» o «Lo que más espera».

- [ ] **Step 4: Corrige la spec**

En la spec:
- cambia `rincon.sorteo.lines.*` por `sorteo.lines.*`;
- en la tabla de arquitectura, la fila del Rincón pasa a decir que `SpineDraw` abre `SorteoStage`,
  que carga con `loadSorteo` como en el Inicio, y deja de decir que usa el pool que ya tiene;
- en «Acceso», la tarjeta móvil y el lomo-botón usan `SorteoTrigger`.

- [ ] **Step 5: Grafo de arquitectura**

Lee `docs/architecture/README.md` («Regeneración»), ejecuta el comando que indique y comprueba con
`git diff --stat docs/architecture` que aparecen `sorteo-stage`, `load-sorteo` y `sorteo-trigger`.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs(sorteo): decisión, backlog, glosario y grafo de la partida"
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura de la spec:**

  | Sección de la spec | Task |
  |---|---|
  | Partida (fases 1–8) | 3 y 7 |
  | Casos borde (1/2/0 elegibles, saltar, Escape, reduced motion, ganador congelado) | 3, 7 y 9 |
  | Controles (tipo, antojos, tiempo, persistencia, «Nada aquí ahora») | 1 y 6 |
  | Voz (frases, mascota, narrador, compañera oculta) | 2, 6 y 8 |
  | Estantería y botones | 5 y 6 |
  | Acceso | 8 |
  | Arquitectura y errores | 4 y 7 |
  | Pruebas | 1–3, 6, 7 y 9 |
  | Documentación | 10 |

- **Desviaciones explícitas de la spec** (se corrigen en la Task 10):
  - namespace `sorteo`;
  - el Rincón también carga con `loadSorteo` (así la mascota llega igual a todas las entradas);
  - sin «antojo» por colección con icono propio (usa 📚).
- **Tipos coherentes:** `SorteoSettings`, `AntojoId`, `itemKey`, `CandidateLine`, `GameState`,
  `SorteoLoad` y `SorteoPet` se usan con el mismo nombre en todas las tasks.
