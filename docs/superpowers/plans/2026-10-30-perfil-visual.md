# Perfil visual: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o
> superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).
> **Un solo implementador por árbol**: dos en paralelo cruzan el index de git (memoria del proyecto).

**Objetivo:** que `/u/[username]` sea visual. Cabecera en capas (mosaico de terminadas y abanico de
destacados), cifras grandes, «Leyendo ahora» con la mascota, «Su año» y la actividad como muro mixto por
mes.

**Arquitectura:** lecturas puras y pequeñas en `src/lib/profile/`: una función pura con test por regla y
un envoltorio fino de Supabase con el cliente de la petición. Componentes servidor en
`src/components/profile/`, cada uno tras su `<Suspense>` con esqueleto de alto fijo. El muro es un
componente cliente que deriva todo de `buildProfileWall(events)` sobre el mismo feed de hoy.

**Stack:** Next.js 16 (Cache Components), React 19, Supabase (RLS), Tailwind, next-intl, Vitest y
Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-29-perfil-visual-design.md`](../specs/2026-10-29-perfil-visual-design.md).
**Issue:** #1580.

## Restricciones globales

- **Sin migraciones ni cambios de esquema.** Si alguno resultara necesario, se para y se consulta.
- **Sin `use cache` nuevo** (regla #437): todo depende de quién mira. Se usa siempre `createClient()` (el
  de la petición), nunca `createPublicClient()`.
- **Estado del lector desde `passes`**, nunca desde `library_entries`.
- **Copy en español** y en `messages/es.json`, con los términos de `docs/UI-GLOSARIO.md` («Destacados»,
  «Seguir», «Editar perfil»).
- **Notas 1–10 en dots, nunca estrellas** (`RatingDots`).
- **Fechas `date` de Postgres** (`finished_on`): se parten a mano, nunca con `new Date(fecha)`. El año y
  el mes de un `timestamptz` se resuelven en `Europe/Madrid`.
- **Objetivos táctiles ≥ 44 px** (`tap-44` o `min-h-11`) en portadas enlazadas.
- **CLS (#284):** cada `<Suspense>` lleva un esqueleto del mismo alto que el bloque.
- **Entorno local (Windows):** Node 22 vía fnm
  (`export PATH="$(cygpath "$APPDATA")/fnm/node-versions/v22.23.1/installation:$PATH"`), un solo
  `next dev --webpack -p 3000` en worktrees, y matarlo al acabar.
- **e2e contra build de producción:** `npm run build` + `npx next start -p 3000`, con `--retries=0`.

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/profile/types.ts` (nuevo) | `ProfileCover` y `toProfileCover` |
| `src/lib/profile/cover-initials.ts` (nuevo) | Iniciales de una obra sin portada (solo letras) |
| `src/lib/profile/hero.ts` (nuevo) | `pickHero` (puro) y `getProfileHero` |
| `src/lib/profile/figures.ts` (nuevo) | `summarizeRatings` y `formatAverage` (puros), `getProfileRating` |
| `src/lib/profile/now.ts` (nuevo) | `getProfileNow` (en curso, con avance) |
| `src/lib/profile/year.ts` (nuevo) | `madridYear` y `summarizeYear` (puros), `getProfileYear` |
| `src/lib/profile/latest-passes.ts` (nuevo) | Consulta compartida: claves de los últimos pases activos por estado o por destacado |
| `src/lib/profile/wall.ts` (nuevo) | `buildProfileWall` y `wallMonthLabel` (puros) |
| `src/components/profile/profile-hero.tsx` (nuevo) | Cabecera: mosaico y abanico |
| `src/components/profile/profile-identity.tsx` (nuevo) | Avatar, nombre, bio, contadores y acciones (sustituye a `profile-header.tsx`) |
| `src/components/profile/profile-figures.tsx` (nuevo) | Cifras grandes |
| `src/components/profile/profile-now.tsx` (nuevo) | Leyendo ahora y mascota |
| `src/components/profile/profile-year.tsx` (nuevo) | Su año |
| `src/components/profile/profile-skeletons.tsx` (nuevo) | Esqueletos de alto fijo |
| `src/components/profile/profile-wall.tsx` (nuevo) | Muro (cliente) |
| `src/components/profile/cover-tile.tsx` (nuevo) | Portada con reserva de iniciales (servidor y cliente) |
| `src/components/pet/profile-pet.tsx` | Prop `variant: "card" \| "compact"` |
| `src/app/u/[username]/page.tsx` | Composición nueva |
| `src/app/u/[username]/_tabs/activity-tab.tsx` | `ProfileWall` en lugar de `ProfileActivityFeed` |
| `src/components/profile-header.tsx` | Se borra |
| `src/components/social/profile-activity-feed.tsx`, `src/lib/social/profile-feed-buckets.ts(+test)` | Se borran si quedan sin usos (Tarea 10) |
| `messages/es.json` | Claves `profile.visual.*` |
| `e2e/perfil-visual.spec.ts` (nuevo) | e2e |

---

## Fase 1 — Cabecera y bloques

### Tarea 1: Portadas del perfil e iniciales

**Ficheros:**
- Crear: `src/lib/profile/types.ts`, `src/lib/profile/cover-initials.ts`
- Test: `src/lib/profile/cover-initials.test.ts`

**Interfaces:**
- Produce:
  - `type ProfileCover = { itemType: ItemType; itemId: string; title: string; coverUrl: string | null; href: string }`;
  - `toProfileCover(item: Pick<LibraryItem, "itemType" | "itemId" | "title" | "coverUrl">): ProfileCover`;
  - `coverKey(c: Pick<ProfileCover, "itemType" | "itemId">): string`;
  - `coverInitials(title: string): string`.

- [ ] **Paso 1: test que falla**

```ts
// src/lib/profile/cover-initials.test.ts
import { describe, expect, it } from "vitest";
import { coverInitials } from "./cover-initials";
import { coverKey, toProfileCover } from "./types";

describe("coverInitials", () => {
  it("toma la inicial de las dos primeras palabras", () => {
    expect(coverInitials("El imperio final")).toBe("EI");
  });
  it("ignora dígitos y signos", () => {
    expect(coverInitials("2001: Odisea")).toBe("O");
  });
  it("con una sola palabra devuelve una letra", () => {
    expect(coverInitials("Rayuela")).toBe("R");
  });
  it("sin letras usa el primer carácter no blanco", () => {
    expect(coverInitials("  1984 ")).toBe("1");
  });
  it("vacío devuelve ?", () => {
    expect(coverInitials("   ")).toBe("?");
  });
});

describe("toProfileCover", () => {
  it("añade el enlace a la ficha", () => {
    const c = toProfileCover({ itemType: "movie", itemId: "m1", title: "Pearl", coverUrl: null });
    expect(c).toEqual({ itemType: "movie", itemId: "m1", title: "Pearl", coverUrl: null, href: "/pelicula/m1" });
    expect(coverKey(c)).toBe("movie:m1");
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecuta: `npx vitest run src/lib/profile/cover-initials.test.ts`
Esperado: FALLA, «Cannot find module './cover-initials'».

- [ ] **Paso 3: implementación**

```ts
// src/lib/profile/types.ts
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import type { LibraryItem } from "@/lib/library/types";

/** Una obra tal como la pinta el perfil: portada y enlace a su ficha. */
export type ProfileCover = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  href: string;
};

export function toProfileCover(
  item: Pick<LibraryItem, "itemType" | "itemId" | "title" | "coverUrl">,
): ProfileCover {
  return {
    itemType: item.itemType,
    itemId: item.itemId,
    title: item.title,
    coverUrl: item.coverUrl,
    href: itemHref(item.itemType, item.itemId),
  };
}

export function coverKey(c: Pick<ProfileCover, "itemType" | "itemId">): string {
  return `${c.itemType}:${c.itemId}`;
}
```

```ts
// src/lib/profile/cover-initials.ts
// Iniciales de una obra sin portada: solo letras («2001: Odisea» → «O»), el
// mismo criterio que el índice de sagas. Sin ninguna letra, el primer carácter
// visible; sin nada, «?».
export function coverInitials(title: string): string {
  const words = title.match(/\p{L}+/gu) ?? [];
  if (words.length > 0) {
    return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
  }
  const first = title.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}
```

Comprueba antes que `itemHref("movie", "m1")` devuelve `/pelicula/m1` (`src/lib/catalog/item-href.ts`).
Si el prefijo difiere, ajusta el valor esperado del test al real, no la función.

- [ ] **Paso 4: comprobar que pasa**

Ejecuta: `npx vitest run src/lib/profile/cover-initials.test.ts`
Esperado: PASA (6 tests).

- [ ] **Paso 5: commit**

```bash
git add src/lib/profile/types.ts src/lib/profile/cover-initials.ts src/lib/profile/cover-initials.test.ts
git commit -m "feat(perfil): tipo de portada del perfil e iniciales sin portada (#1580)"
```

---

### Tarea 2: Cabecera — modelo y lectura

**Ficheros:**
- Crear: `src/lib/profile/latest-passes.ts`, `src/lib/profile/hero.ts`
- Test: `src/lib/profile/hero.test.ts`

**Interfaces:**
- Consume: `ProfileCover`, `toProfileCover`, `coverKey` (Tarea 1); `hydrateItems` (`src/lib/library/get-library-items.ts`).
- Produce:
  - `HERO_FAN_MAX = 6`, `HERO_MOSAIC_SIZE = 21`, `HERO_MOSAIC_MIN = 3`;
  - `type HeroModel = { fan: ProfileCover[]; mosaic: ProfileCover[] }`;
  - `pickHero(pinned: ProfileCover[], recent: ProfileCover[]): HeroModel`;
  - `getProfileHero(supabase, userId): Promise<HeroModel>`;
  - `latestPassKeys(supabase, userId, opts): Promise<PassKey[]>`, con `PassKey = { item_type: ItemType; item_id: string; position: unknown }`.

- [ ] **Paso 1: test que falla**

```ts
// src/lib/profile/hero.test.ts
import { describe, expect, it } from "vitest";
import { HERO_MOSAIC_SIZE, pickHero } from "./hero";
import type { ProfileCover } from "./types";

const c = (id: string): ProfileCover => ({ itemType: "book", itemId: id, title: id, coverUrl: null, href: `/libro/${id}` });

describe("pickHero", () => {
  it("el abanico son los destacados y el mosaico, las terminadas que no están en él", () => {
    const hero = pickHero([c("a"), c("b")], [c("a"), c("x"), c("y"), c("z")]);
    expect(hero.fan.map((x) => x.itemId)).toEqual(["a", "b"]);
    expect(new Set(hero.mosaic.map((x) => x.itemId))).toEqual(new Set(["x", "y", "z"]));
  });

  it("el mosaico se llena en ciclo hasta su tamaño", () => {
    const hero = pickHero([], [c("x"), c("y"), c("z")]);
    expect(hero.mosaic).toHaveLength(HERO_MOSAIC_SIZE);
    expect(hero.mosaic.slice(0, 4).map((x) => x.itemId)).toEqual(["x", "y", "z", "x"]);
  });

  it("sin destacados, el abanico son las últimas terminadas", () => {
    const hero = pickHero([], [c("x"), c("y"), c("z"), c("w"), c("v"), c("u"), c("t")]);
    expect(hero.fan.map((x) => x.itemId)).toEqual(["x", "y", "z", "w", "v", "u"]);
  });

  it("con menos de 3 terminadas no hay mosaico", () => {
    expect(pickHero([c("a")], [c("x"), c("y")]).mosaic).toEqual([]);
  });

  it("si todas las terminadas están en el abanico, el mosaico las repite", () => {
    const hero = pickHero([], [c("x"), c("y"), c("z")]);
    expect(hero.mosaic.length).toBe(HERO_MOSAIC_SIZE);
  });

  it("cuenta nueva: ni abanico ni mosaico", () => {
    expect(pickHero([], [])).toEqual({ fan: [], mosaic: [] });
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecuta: `npx vitest run src/lib/profile/hero.test.ts`
Esperado: FALLA, «Cannot find module './hero'».

- [ ] **Paso 3: implementación**

```ts
// src/lib/profile/latest-passes.ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
export type PassKey = { item_type: ItemType; item_id: string; position: unknown };

// Claves de los ÚLTIMOS pases activos de un estado, o de los destacados, con
// tope en SQL. `getLibraryView` hidrata la biblioteca entera antes de recortar
// (una cuenta con 137 películas hidrataría 137 obras para pintar 21 portadas),
// así que aquí se recorta primero y se hidrata después solo lo que se pinta.
// RLS (`can_view_profile`) decide qué filas ve quien mira: con el cliente de la
// petición, un perfil que no puede ver devuelve cero filas, no un error.
export async function latestPassKeys(
  supabase: SupabaseServerClient,
  userId: string,
  opts: { pinned: true; limit: number } | { status: MediaStatus; limit: number },
): Promise<PassKey[]> {
  let query = supabase
    .from("passes")
    .select("item_type, item_id, position")
    .eq("user_id", userId)
    .eq("is_active", true);
  if ("pinned" in opts) {
    query = query.not("pinned_order", "is", null).order("pinned_order", { ascending: true });
  } else {
    query = query.eq("status", opts.status);
    if (opts.status === "completed") {
      query = query.order("finished_on", { ascending: false, nullsFirst: false });
    }
    query = query.order("updated_at", { ascending: false });
  }
  const { data, error } = await query.limit(opts.limit);
  if (error) throw error;
  return (data ?? []) as PassKey[];
}
```

```ts
// src/lib/profile/hero.ts
import type { createClient } from "@/lib/supabase/server";
import { hydrateItems } from "@/lib/library/get-library-items";
import { latestPassKeys } from "./latest-passes";
import { coverKey, toProfileCover, type ProfileCover } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const HERO_FAN_MAX = 6;
export const HERO_MOSAIC_SIZE = 21;
export const HERO_MOSAIC_MIN = 3;

export type HeroModel = { fan: ProfileCover[]; mosaic: ProfileCover[] };

// Spec §4.1. Abanico: los destacados (los elige la persona); sin ellos, sus
// últimas terminadas. Mosaico: las últimas terminadas que no están en el
// abanico, repetidas en ciclo hasta llenar la rejilla; con menos de 3
// terminadas no hay mosaico (la cabecera cae a un degradado de acento).
export function pickHero(pinned: ProfileCover[], recent: ProfileCover[]): HeroModel {
  const fan = (pinned.length > 0 ? pinned : recent).slice(0, HERO_FAN_MAX);
  if (recent.length < HERO_MOSAIC_MIN) return { fan, mosaic: [] };
  const inFan = new Set(fan.map(coverKey));
  const rest = recent.filter((c) => !inFan.has(coverKey(c)));
  const source = rest.length > 0 ? rest : recent;
  const mosaic = Array.from({ length: HERO_MOSAIC_SIZE }, (_, i) => source[i % source.length]);
  return { fan, mosaic };
}

export async function getProfileHero(supabase: SupabaseServerClient, userId: string): Promise<HeroModel> {
  const [pinnedKeys, recentKeys] = await Promise.all([
    latestPassKeys(supabase, userId, { pinned: true, limit: HERO_FAN_MAX }),
    latestPassKeys(supabase, userId, { status: "completed", limit: HERO_MOSAIC_SIZE }),
  ]);
  const [pinned, recent] = await Promise.all([
    hydrateItems(supabase, userId, pinnedKeys.map(({ item_type, item_id }) => ({ item_type, item_id }))),
    hydrateItems(supabase, userId, recentKeys.map(({ item_type, item_id }) => ({ item_type, item_id }))),
  ]);
  return pickHero(pinned.map(toProfileCover), recent.map(toProfileCover));
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecuta: `npx vitest run src/lib/profile/hero.test.ts`
Esperado: PASA (6 tests).

- [ ] **Paso 5: commit**

```bash
git add src/lib/profile/latest-passes.ts src/lib/profile/hero.ts src/lib/profile/hero.test.ts
git commit -m "feat(perfil): modelo y lectura de la cabecera en capas (#1580)"
```

---

### Tarea 3: Cifras — nota media

**Ficheros:**
- Crear: `src/lib/profile/figures.ts`
- Test: `src/lib/profile/figures.test.ts`

**Interfaces:**
- Consume: `readAllRows` (`src/lib/supabase/read-all-rows.ts`).
- Produce:
  - `RATING_MIN_COUNT = 3`;
  - `summarizeRatings(ratings: number[]): { average: number | null; count: number }`;
  - `formatAverage(average: number): string` (escala de 5, «4,5»);
  - `getProfileRating(supabase, userId)`.

- [ ] **Paso 1: test que falla**

```ts
// src/lib/profile/figures.test.ts
import { describe, expect, it } from "vitest";
import { formatAverage, summarizeRatings } from "./figures";

describe("summarizeRatings", () => {
  it("media sobre 10 con 3 o más notas", () => {
    expect(summarizeRatings([8, 9, 10])).toEqual({ average: 9, count: 3 });
  });
  it("con menos de 3 notas no hay media", () => {
    expect(summarizeRatings([10, 10])).toEqual({ average: null, count: 2 });
  });
  it("sin notas", () => {
    expect(summarizeRatings([])).toEqual({ average: null, count: 0 });
  });
});

describe("formatAverage", () => {
  it("pasa a escala de 5 con una decimal y coma", () => {
    expect(formatAverage(9)).toBe("4,5");
    expect(formatAverage(8)).toBe("4");
    expect(formatAverage(7.3)).toBe("3,7");
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecuta: `npx vitest run src/lib/profile/figures.test.ts`
Esperado: FALLA, «Cannot find module './figures'».

- [ ] **Paso 3: implementación**

```ts
// src/lib/profile/figures.ts
import type { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const RATING_MIN_COUNT = 3;

// Media de las notas de sus pases TERMINADOS (cada relectura cuenta: el pase es
// el dueño de la nota). Con menos de 3 notas una media dice poco, así que se
// pinta «—» (spec §4).
export function summarizeRatings(ratings: number[]): { average: number | null; count: number } {
  const count = ratings.length;
  if (count < RATING_MIN_COUNT) return { average: null, count };
  return { average: ratings.reduce((a, b) => a + b, 0) / count, count };
}

/** La nota va de 1 a 10 y los dots pintan 5: la cifra se enseña en su escala. */
export function formatAverage(average: number): string {
  return (average / 2).toLocaleString("es", { maximumFractionDigits: 1 });
}

export async function getProfileRating(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ average: number | null; count: number }> {
  const rows = await readAllRows((from, to) =>
    supabase
      .from("passes")
      .select("rating")
      .eq("user_id", userId)
      .eq("status", "completed")
      .not("rating", "is", null)
      .order("id")
      .range(from, to),
  );
  return summarizeRatings((rows ?? []).map((r) => r.rating as number));
}
```

Antes del commit comprueba en `data-model.md` que `passes.rating` es legible por terceros con
`can_view_profile`. `hydrateItems` ya la lee así; está comentado en `get-library-items.ts` («la nota
nunca fue lo que is_public escondía»).

- [ ] **Paso 4: comprobar que pasa**

Ejecuta: `npx vitest run src/lib/profile/figures.test.ts`
Esperado: PASA (4 tests).

- [ ] **Paso 5: commit**

```bash
git add src/lib/profile/figures.ts src/lib/profile/figures.test.ts
git commit -m "feat(perfil): nota media del perfil (#1580)"
```

---

### Tarea 4: Leyendo ahora

**Ficheros:**
- Crear: `src/lib/profile/now.ts`
- Test: `src/lib/profile/now.test.ts`

**Interfaces:**
- Consume:
  - `latestPassKeys` (Tarea 2) y `toProfileCover` (Tarea 1);
  - `hydrateItems`;
  - `deriveWorkProgress` (`src/lib/people/work-progress.ts`), con firma
    `(itemType, status, rawPosition, totalPages) → { label, percent }`.
- Produce:
  - `NOW_MAX = 3`;
  - `type NowItem = ProfileCover & { progressLabel: string | null; progressPercent: number | null }`;
  - `toNowItems(keys: PassKey[], items: LibraryItem[]): NowItem[]`;
  - `getProfileNow(supabase, userId): Promise<NowItem[]>`.

- [ ] **Paso 1: test que falla**

```ts
// src/lib/profile/now.test.ts
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library/types";
import { toNowItems } from "./now";

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  entryId: "p", itemId: "b1", itemType: "book", status: "in_progress", rating: null,
  position: {}, notes: null, title: "El imperio final", coverUrl: null, subtitle: null,
  publisher: null, pageCount: 669, totalEpisodes: null, watchedEpisodes: null, upToDate: false,
  rereadCount: 1, pinnedOrder: null, activePassId: "p", ...over,
});

describe("toNowItems", () => {
  it("usa la posición CRUDA del pase para el avance y respeta el orden de las claves", () => {
    const out = toNowItems(
      [
        { item_type: "book", item_id: "b1", position: { page: 668 } },
        { item_type: "series", item_id: "s1", position: { season: 2, episode: 4 } },
      ],
      [item({ itemType: "series", itemId: "s1", title: "Severance", pageCount: null }), item({})],
    );
    expect(out.map((n) => n.itemId)).toEqual(["b1", "s1"]);
    expect(out[0]).toMatchObject({ progressLabel: "Pág. 668", progressPercent: 99 });
    expect(out[1]).toMatchObject({ progressLabel: "T2E4", progressPercent: null });
  });

  it("descarta claves que no se hidrataron", () => {
    expect(toNowItems([{ item_type: "book", item_id: "x", position: {} }], [])).toEqual([]);
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecuta: `npx vitest run src/lib/profile/now.test.ts`
Esperado: FALLA, «Cannot find module './now'».

- [ ] **Paso 3: implementación**

```ts
// src/lib/profile/now.ts
import type { createClient } from "@/lib/supabase/server";
import { hydrateItems } from "@/lib/library/get-library-items";
import type { LibraryItem } from "@/lib/library/types";
import { deriveWorkProgress } from "@/lib/people/work-progress";
import { latestPassKeys, type PassKey } from "./latest-passes";
import { coverKey, toProfileCover, type ProfileCover } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const NOW_MAX = 3;
export type NowItem = ProfileCover & { progressLabel: string | null; progressPercent: number | null };

// El avance sale de la posición CRUDA del pase (la que interpreta
// `deriveWorkProgress`, el mismo criterio que la ficha de persona), no de la ya
// parseada de `LibraryItem`. El total de páginas, de la edición del pase.
export function toNowItems(keys: PassKey[], items: LibraryItem[]): NowItem[] {
  const byKey = new Map(items.map((i) => [coverKey(i), i]));
  return keys.flatMap((k) => {
    const item = byKey.get(`${k.item_type}:${k.item_id}`);
    if (!item) return [];
    const p = deriveWorkProgress(item.itemType, "in_progress", k.position, item.pageCount);
    return [{ ...toProfileCover(item), progressLabel: p.label, progressPercent: p.percent }];
  });
}

export async function getProfileNow(supabase: SupabaseServerClient, userId: string): Promise<NowItem[]> {
  const keys = await latestPassKeys(supabase, userId, { status: "in_progress", limit: NOW_MAX });
  if (keys.length === 0) return [];
  const items = await hydrateItems(supabase, userId, keys.map(({ item_type, item_id }) => ({ item_type, item_id })));
  return toNowItems(keys, items);
}
```

Si el test falla por la etiqueta, mira `formatPosition` (`src/lib/library/position.ts:46`) y ajusta el
esperado al formato real. La función se queda como está.

- [ ] **Paso 4: comprobar que pasa**

Ejecuta: `npx vitest run src/lib/profile/now.test.ts`
Esperado: PASA (2 tests).

- [ ] **Paso 5: commit**

```bash
git add src/lib/profile/now.ts src/lib/profile/now.test.ts
git commit -m "feat(perfil): leyendo ahora con avance (#1580)"
```

---

### Tarea 5: Su año

**Ficheros:**
- Crear: `src/lib/profile/year.ts`
- Test: `src/lib/profile/year.test.ts`

**Interfaces:**
- Consume:
  - `madridToday(now: Date): string` (`src/lib/wrap-ups/windows.ts`);
  - `hydrateItems` y `toProfileCover`.
- Produce:
  - `madridYear(now: Date): number`;
  - `type YearRow = { item_type: ItemType; item_id: string; finished_on: string; rating: number | null }`;
  - `type YearSummary = { year: number; total: number; byMonth: number[]; bestMonth: number | null; topRatedKey: string | null }`;
  - `summarizeYear(rows: YearRow[], year: number): YearSummary | null`;
  - `type ProfileYear = Omit<YearSummary, "topRatedKey"> & { topRated: ProfileCover | null }`;
  - `getProfileYear(supabase, userId, now = new Date()): Promise<ProfileYear | null>`.

- [ ] **Paso 1: test que falla**

```ts
// src/lib/profile/year.test.ts
import { describe, expect, it } from "vitest";
import { madridYear, summarizeYear, type YearRow } from "./year";

const row = (finished_on: string, rating: number | null = null, id = finished_on): YearRow =>
  ({ item_type: "movie", item_id: id, finished_on, rating });

describe("madridYear", () => {
  it("el 31-dic a las 23:30 UTC ya es año nuevo en Madrid", () => {
    expect(madridYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});

describe("summarizeYear", () => {
  it("cuenta por mes partiendo la fecha a mano", () => {
    const s = summarizeYear([row("2026-07-01"), row("2026-07-31"), row("2026-01-15")], 2026)!;
    expect(s.total).toBe(3);
    expect(s.byMonth[0]).toBe(1);
    expect(s.byMonth[6]).toBe(2);
    expect(s.bestMonth).toBe(6);
  });

  it("ignora filas de otros años", () => {
    expect(summarizeYear([row("2025-12-31")], 2026)).toBeNull();
  });

  it("la mejor valorada: nota más alta y, a igualdad, la más reciente", () => {
    const s = summarizeYear([row("2026-02-01", 9, "a"), row("2026-03-01", 9, "b"), row("2026-04-01", 7, "c")], 2026)!;
    expect(s.topRatedKey).toBe("movie:b");
  });

  it("sin notas no hay mejor valorada", () => {
    expect(summarizeYear([row("2026-02-01")], 2026)!.topRatedKey).toBeNull();
  });

  it("empate de meses: gana el primero", () => {
    const s = summarizeYear([row("2026-02-01"), row("2026-05-01")], 2026)!;
    expect(s.bestMonth).toBe(1);
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecuta: `npx vitest run src/lib/profile/year.test.ts`
Esperado: FALLA, «Cannot find module './year'».

- [ ] **Paso 3: implementación**

```ts
// src/lib/profile/year.ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { hydrateItems } from "@/lib/library/get-library-items";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { madridToday } from "@/lib/wrap-ups/windows";
import { toProfileCover, type ProfileCover } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type YearRow = { item_type: ItemType; item_id: string; finished_on: string; rating: number | null };
export type YearSummary = {
  year: number;
  total: number;
  /** 12 posiciones, enero = 0. */
  byMonth: number[];
  bestMonth: number | null;
  topRatedKey: string | null;
};
export type ProfileYear = Omit<YearSummary, "topRatedKey"> & { topRated: ProfileCover | null };

export function madridYear(now: Date): number {
  return Number(madridToday(now).slice(0, 4));
}

// `finished_on` es `date`: «2026-07-01» se parte a mano. Con `new Date()` se
// leería como medianoche UTC y en Madrid podría caer en el día (y el mes) de antes.
export function summarizeYear(rows: YearRow[], year: number): YearSummary | null {
  const prefix = `${year}-`;
  const inYear = rows.filter((r) => r.finished_on?.startsWith(prefix));
  if (inYear.length === 0) return null;
  const byMonth = Array.from({ length: 12 }, () => 0);
  for (const r of inYear) byMonth[Number(r.finished_on.slice(5, 7)) - 1] += 1;
  const max = Math.max(...byMonth);
  const bestMonth = byMonth.indexOf(max);
  const rated = inYear
    .filter((r) => r.rating !== null)
    .sort((a, b) => (b.rating! - a.rating!) || b.finished_on.localeCompare(a.finished_on));
  return {
    year,
    total: inYear.length,
    byMonth,
    bestMonth,
    topRatedKey: rated[0] ? `${rated[0].item_type}:${rated[0].item_id}` : null,
  };
}

export async function getProfileYear(
  supabase: SupabaseServerClient,
  userId: string,
  now: Date = new Date(),
): Promise<ProfileYear | null> {
  const year = madridYear(now);
  const rows = await readAllRows((from, to) =>
    supabase
      .from("passes")
      .select("item_type, item_id, finished_on, rating")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("finished_on", `${year}-01-01`)
      .lte("finished_on", `${year}-12-31`)
      .order("id")
      .range(from, to),
  );
  const summary = summarizeYear((rows ?? []) as YearRow[], year);
  if (!summary) return null;
  const { topRatedKey, ...rest } = summary;
  let topRated: ProfileCover | null = null;
  if (topRatedKey) {
    const [item_type, item_id] = topRatedKey.split(":") as [ItemType, string];
    const [hydrated] = await hydrateItems(supabase, userId, [{ item_type, item_id }]);
    topRated = hydrated ? toProfileCover(hydrated) : null;
  }
  return { ...rest, topRated };
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecuta: `npx vitest run src/lib/profile/year.test.ts`
Esperado: PASA (6 tests).

- [ ] **Paso 5: commit**

```bash
git add src/lib/profile/year.ts src/lib/profile/year.test.ts
git commit -m "feat(perfil): su año, terminadas por mes en hora de Madrid (#1580)"
```

---

### Tarea 6: Componentes de la cabecera y los bloques

**Ficheros:**
- Crear:
  - `src/components/profile/cover-tile.tsx`
  - `src/components/profile/profile-hero.tsx` y `hero-fan-label.tsx` (cliente)
  - `src/components/profile/profile-identity.tsx`
  - `src/components/profile/profile-figures.tsx` (vista cliente) y `profile-figures-server.tsx`
  - `src/components/profile/profile-now.tsx` (vista cliente) y `profile-now-server.tsx`
  - `src/components/profile/profile-year.tsx` (vista cliente) y `profile-year-server.tsx`
  - `src/components/profile/profile-skeletons.tsx`

  Las vistas son componentes cliente puros para poder probarlas con `NextIntlClientProvider`. El
  `*-server.tsx` de cada una hace la lectura y le pasa los datos.
- Modificar: `src/components/pet/profile-pet.tsx`, `messages/es.json`
- Test: `src/components/profile/profile-blocks.test.tsx`

**Interfaces:**
- Consume: todo lo de las Tareas 1–5; `UserAvatar`, `ImageZoom`, `EditProfileForm`, `buttonVariants`,
  `GearIcon`, `RatingDots`, `PetSprite`, `getProfilePet`.
- Produce:
  - `<CoverTile cover sizes className? decorative? />`;
  - `<ProfileHero userId name />` (async) y `<HeroView model name />` (puro, para el test);
  - `<ProfileIdentity profile counts isOwner followButton? safetyActions? />`, con las mismas props que
    `ProfileHeader` salvo `stats`;
  - `<ProfileFigures userId stats />` (async) y `<FiguresView stats rating />` (puro);
  - `<ProfileNow userId />` (async) y `<NowView items pet />` (puro);
  - `<ProfileYear userId isOwner />` (async) y `<YearView data isOwner />` (puro);
  - `HeroSkeleton`, `FiguresSkeleton`, `NowSkeleton`, `YearSkeleton`;
  - `ProfilePet` gana `variant?: "card" | "compact"` (por defecto `"card"`, que es lo de hoy).

- [ ] **Paso 1: claves i18n**

Dentro del objeto `"profile"` de `messages/es.json`, añade:

```json
"visual": {
  "fanLabel": "Destacados de {name}",
  "figures": {
    "books": "{count, plural, one {libro} other {libros}}",
    "movies": "{count, plural, one {película} other {películas}}",
    "series": "{count, plural, one {serie} other {series}}",
    "rating": "nota media",
    "noRating": "—",
    "noRatingHint": "Aún no hay notas suficientes"
  },
  "now": { "title": "Leyendo ahora", "also": "También en curso" },
  "year": {
    "title": "Su {year}",
    "titleOwn": "Tu {year}",
    "works": "{count, plural, one {obra} other {obras}}",
    "bestMonth": "Su mejor mes, {month}: {count, plural, one {# obra} other {# obras}}.",
    "bestMonthOwn": "Tu mejor mes, {month}: {count, plural, one {# obra} other {# obras}}.",
    "topRated": "La mejor valorada: <title>{name}</title>.",
    "chartLabel": "Obras terminadas por mes en {year}"
  }
}
```

Comprueba que el JSON sigue siendo válido: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"`.

- [ ] **Paso 2: test que falla (vistas puras)**

```tsx
// @vitest-environment jsdom
// src/components/profile/profile-blocks.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { HeroView } from "./profile-hero";
import { FiguresView } from "./profile-figures";
import { YearView } from "./profile-year";
import { NowView } from "./profile-now";

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>);
const cover = (id: string, coverUrl: string | null = null) =>
  ({ itemType: "book" as const, itemId: id, title: `Obra ${id}`, coverUrl, href: `/libro/${id}` });

describe("HeroView", () => {
  it("sin mosaico pinta el degradado de acento y el abanico enlaza a las fichas", () => {
    wrap(<HeroView name="Mar" model={{ fan: [cover("a"), cover("b")], mosaic: [] }} />);
    expect(screen.getByTestId("profile-hero").dataset.mosaic).toBe("off");
    expect(screen.getByRole("link", { name: "Obra a" })).toHaveAttribute("href", "/libro/a");
  });
  it("el mosaico es decorativo", () => {
    wrap(<HeroView name="Mar" model={{ fan: [], mosaic: [cover("x"), cover("y"), cover("z")] }} />);
    expect(screen.getByTestId("profile-hero-mosaic")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("FiguresView", () => {
  it("con menos de 3 notas enseña «—»", () => {
    wrap(<FiguresView stats={{ book: 1, movie: 2, series: 0 }} rating={{ average: null, count: 2 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("libro")).toBeInTheDocument();
  });
  it("con media la enseña en escala de 5", () => {
    wrap(<FiguresView stats={{ book: 8, movie: 137, series: 2 }} rating={{ average: 9, count: 10 }} />);
    expect(screen.getByText("4,5")).toBeInTheDocument();
  });
});

describe("YearView", () => {
  it("sin datos no pinta nada", () => {
    const { container } = wrap(<YearView data={null} isOwner={false} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("titula «Tu» para el dueño y «Su» para un visitante", () => {
    const data = { year: 2026, total: 3, byMonth: [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], bestMonth: 6, topRated: null };
    wrap(<YearView data={data} isOwner />);
    expect(screen.getByText("Tu 2026")).toBeInTheDocument();
  });
});

describe("NowView", () => {
  it("sin nada en curso ni mascota no pinta nada", () => {
    const { container } = wrap(<NowView items={[]} pet={null} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("la primera obra lleva el avance y el resto va en pastillas", () => {
    wrap(<NowView pet={null} items={[
      { ...cover("a"), progressLabel: "Pág. 668", progressPercent: 99 },
      { ...cover("b"), progressLabel: "T2E4", progressPercent: null },
    ]} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    expect(screen.getByText("También en curso")).toBeInTheDocument();
  });
});
```

Si `@testing-library/jest-dom` no está en el setup de Vitest, cambia los matchers por comprobaciones
nativas (`.getAttribute(...)`, `.textContent`, `container.childElementCount === 0`). Mira cómo lo hace un
test existente con `// @vitest-environment jsdom`, por ejemplo
`src/components/detail/episode-panel.test.tsx`, y copia su patrón de render con `NextIntlClientProvider`.

- [ ] **Paso 3: comprobar que falla**

Ejecuta: `npx vitest run src/components/profile/profile-blocks.test.tsx`
Esperado: FALLA, «Cannot find module './profile-hero'».

- [ ] **Paso 4: `cover-tile.tsx`**

```tsx
// src/components/profile/cover-tile.tsx
import Image from "next/image";
import { coverInitials } from "@/lib/profile/cover-initials";
import type { ProfileCover } from "@/lib/profile/types";

// Una portada del perfil. Sin imagen, bloque de acento con iniciales (solo
// letras). `decorative` la saca del árbol accesible (mosaico de la cabecera).
export function CoverTile({
  cover,
  sizes,
  className = "",
  decorative = false,
}: {
  cover: Pick<ProfileCover, "title" | "coverUrl">;
  sizes: string;
  className?: string;
  decorative?: boolean;
}) {
  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-cover bg-surface-muted shadow-cover ${className}`}>
      {cover.coverUrl ? (
        <Image src={cover.coverUrl} alt={decorative ? "" : cover.title} fill sizes={sizes} className="object-cover" />
      ) : (
        <div
          className="flex h-full items-center justify-center bg-[color-mix(in_oklab,var(--accent)_45%,var(--surface))] font-serif text-lg font-semibold text-foreground"
          aria-hidden={decorative || undefined}
        >
          {coverInitials(cover.title)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 5: `profile-hero.tsx`**

```tsx
// src/components/profile/profile-hero.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileHero, type HeroModel } from "@/lib/profile/hero";
import { coverKey } from "@/lib/profile/types";
import { CoverTile } from "./cover-tile";
import { HeroFanLabel } from "./hero-fan-label";

// Spec §3 y §4.1: mosaico de sus últimas terminadas al fondo (decorativo) y
// abanico de sus destacados delante (enlaces). Sin mosaico, degradado de acento.
export async function ProfileHero({ userId, name }: { userId: string; name: string }) {
  const model = await getProfileHero(await createClient(), userId);
  return <HeroView model={model} name={name} />;
}

export function HeroView({ model, name }: { model: HeroModel; name: string }) {
  const hasMosaic = model.mosaic.length > 0;
  const n = model.fan.length;
  return (
    <section
      data-testid="profile-hero"
      data-mosaic={hasMosaic ? "on" : "off"}
      className="relative h-[200px] overflow-hidden lg:h-[250px]"
    >
      {hasMosaic ? (
        <div
          data-testid="profile-hero-mosaic"
          aria-hidden="true"
          className="absolute inset-0 grid grid-cols-7 gap-0.5 opacity-55 lg:grid-cols-[repeat(14,minmax(0,1fr))]"
        >
          {[...model.mosaic, ...model.mosaic].slice(0, 42).map((c, i) => (
            <CoverTile
              key={`${coverKey(c)}:${i}`}
              cover={c}
              decorative
              sizes="90px"
              className={`rounded-none shadow-none ${i >= 21 ? "max-lg:hidden" : ""}`}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,var(--accent),transparent_65%)] opacity-60" />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
      {n > 0 && (
        <HeroFanLabel name={name}>
          <ul className="absolute right-[-18px] top-11 flex lg:right-[60px] lg:top-9">
            {model.fan.map((c, i) => {
              const mid = (n - 1) / 2;
              return (
                <li
                  key={coverKey(c)}
                  className={`-ml-4 first:ml-0 ${i >= 4 ? "max-lg:hidden" : ""}`}
                  style={{ transform: `rotate(${(i - mid) * 5}deg) translateY(${Math.abs(i - mid) * 6}px)` }}
                >
                  <Link href={c.href} aria-label={c.title} className="block w-[70px] transition-transform motion-safe:hover:-translate-y-1 lg:w-[92px]">
                    <CoverTile cover={c} sizes="(max-width: 1024px) 70px, 92px" className="shadow-[0_10px_24px_rgba(0,0,0,.55)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </HeroFanLabel>
      )}
    </section>
  );
}
```

```tsx
// src/components/profile/hero-fan-label.tsx
"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// Envoltorio accesible del abanico: una región con nombre («Destacados de X»).
export function HeroFanLabel({ name, children }: { name: string; children: ReactNode }) {
  const t = useTranslations("profile.visual");
  return <nav aria-label={t("fanLabel", { name })}>{children}</nav>;
}
```

Con el abanico como cliente, `HeroView` se renderiza en el test sin el contexto de servidor de
next-intl.

- [ ] **Paso 6: `profile-figures.tsx`**

```tsx
// src/components/profile/profile-figures.tsx
"use client";
import { useTranslations } from "next-intl";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import { formatAverage } from "@/lib/profile/figures";

// Cifras grandes (spec §3.1 punto 3). Los recuentos son los de hoy
// (`getLibraryStats`, pases activos); la media, la de sus pases terminados.
export function FiguresView({
  stats,
  rating,
}: {
  stats: LibraryStats;
  rating: { average: number | null; count: number };
}) {
  const t = useTranslations("profile.visual.figures");
  const cell = (value: string, label: string, title?: string) => (
    <div className="min-w-0" title={title}>
      <div className="font-serif text-[26px] font-semibold leading-none text-foreground lg:text-[30px]">{value}</div>
      <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[.07em] text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <div data-testid="profile-figures" className="grid grid-cols-4 gap-2">
      {cell(String(stats.book), t("books", { count: stats.book }))}
      {cell(String(stats.movie), t("movies", { count: stats.movie }))}
      {cell(String(stats.series), t("series", { count: stats.series }))}
      {rating.average === null
        ? cell(t("noRating"), t("rating"), t("noRatingHint"))
        : cell(formatAverage(rating.average), t("rating"))}
    </div>
  );
}
```

```tsx
// src/components/profile/profile-figures-server.tsx
import { createClient } from "@/lib/supabase/server";
import type { LibraryStats } from "@/lib/library/get-library-stats";
import { getProfileRating } from "@/lib/profile/figures";
import { FiguresView } from "./profile-figures";

export async function ProfileFigures({ userId, stats }: { userId: string; stats: LibraryStats }) {
  const rating = await getProfileRating(await createClient(), userId);
  return <FiguresView stats={stats} rating={rating} />;
}
```

- [ ] **Paso 7: `profile-now.tsx` y la mascota compacta**

En `src/components/pet/profile-pet.tsx`, añade la variante compacta sin tocar la de hoy:

```tsx
export async function ProfilePet({ userId, variant = "card" }: { userId: string; variant?: "card" | "compact" }) {
  let pet;
  try {
    pet = await getProfilePet(await createClient(), userId);
  } catch {
    return null;
  }
  if (!pet) return null;
  const t = await getTranslations("pet");
  if (variant === "compact") {
    return (
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-surface-muted"
        data-testid="profile-pet"
        title={`${pet.name} · ${t(`classes.${pet.petClass}`)} · ${t(`stages.${pet.stage}`)}`}
      >
        <PetSprite stage={pet.stage} petClass={pet.petClass} mood="neutral" scale={1} label={pet.name} />
      </div>
    );
  }
  // …rama "card": el return de hoy, sin cambios.
}
```

```tsx
// src/components/profile/profile-now.tsx
"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { NowItem } from "@/lib/profile/now";
import { CoverTile } from "./cover-tile";

// Leyendo ahora (spec §3.1 punto 4): la más reciente en grande con su avance,
// las otras en pastillas, y la mascota a la derecha. Sin nada que enseñar, nada.
export function NowView({ items, pet }: { items: NowItem[]; pet: ReactNode }) {
  const t = useTranslations("profile.visual.now");
  if (items.length === 0 && !pet) return null;
  const [first, ...rest] = items;
  return (
    <section data-testid="profile-now" className="relative overflow-hidden rounded-card border border-border bg-surface">
      {first?.coverUrl && (
        <div aria-hidden="true" className="absolute -inset-8 opacity-45 blur-2xl" style={{ backgroundImage: `url(${first.coverUrl})`, backgroundSize: "cover" }} />
      )}
      <div className="relative flex items-center gap-3.5 p-3.5">
        {first && (
          <Link href={first.href} className="w-14 shrink-0"><CoverTile cover={first} sizes="56px" /></Link>
        )}
        <div className="min-w-0 flex-1">
          {first && (
            <>
              <p className="font-mono text-[11px] uppercase tracking-[.09em] text-foreground-soft">{t("title")}</p>
              <Link href={first.href} className="mt-1 block truncate font-serif text-[17px] font-semibold">{first.title}</Link>
              {first.progressPercent !== null && (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={first.progressPercent}
                  aria-label={first.title}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10"
                >
                  <div className="h-full rounded-full bg-gold" style={{ width: `${first.progressPercent}%` }} />
                </div>
              )}
              {first.progressLabel && <p className="mt-1 text-xs text-muted-foreground">{first.progressLabel}</p>}
            </>
          )}
        </div>
        {pet}
      </div>
      {rest.length > 0 && (
        <div className="relative flex flex-wrap items-center gap-2 border-t border-border px-3.5 py-2.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[.08em] text-muted-foreground">{t("also")}</span>
          {rest.map((c) => (
            <Link key={c.href} href={c.href} className="flex min-h-11 items-center gap-2 rounded-full bg-foreground/[.06] py-1 pr-3 pl-1 text-[12.5px]">
              <CoverTile cover={c} sizes="22px" className="w-[22px]" />
              <span className="truncate">{c.title}{c.progressLabel ? ` · ${c.progressLabel}` : ""}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
```

```tsx
// src/components/profile/profile-now-server.tsx
import { createClient } from "@/lib/supabase/server";
import { getProfileNow } from "@/lib/profile/now";
import { ProfilePet } from "@/components/pet/profile-pet";
import { NowView } from "./profile-now";

export async function ProfileNow({ userId }: { userId: string }) {
  const items = await getProfileNow(await createClient(), userId);
  // La mascota se resuelve en servidor y llega como nodo ya pintado.
  const pet = await ProfilePet({ userId, variant: "compact" });
  return <NowView items={items} pet={pet} />;
}
```

Comprueba que `bg-gold` existe como utilidad
(`--gold` está en `globals.css`; busca `--color-gold` en el bloque `@theme`). Si no existe, usa
`bg-[var(--gold)]`.

- [ ] **Paso 8: `profile-year.tsx`**

```tsx
// src/components/profile/profile-year.tsx
"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ProfileYear } from "@/lib/profile/year";

const MONTHS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const monthName = (i: number) =>
  new Intl.DateTimeFormat("es", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15)));

// Su año (spec §2 y §3.1 punto 5): un resumen, no un panel. No enlaza a
// Estadísticas (las herramientas del dueño viven en Biblioteca).
export function YearView({ data, isOwner }: { data: ProfileYear | null; isOwner: boolean }) {
  const t = useTranslations("profile.visual.year");
  if (!data) return null;
  const max = Math.max(...data.byMonth, 1);
  return (
    <section data-testid="profile-year" className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-[17px] font-semibold">
          {isOwner ? t("titleOwn", { year: data.year }) : t("title", { year: data.year })}
        </h2>
        <span className="font-serif text-[22px] font-bold text-gold">
          {data.total} <span className="font-mono text-[11px] font-medium uppercase text-muted-foreground">{t("works", { count: data.total })}</span>
        </span>
      </div>
      <figure aria-label={t("chartLabel", { year: data.year })} className="mt-3 flex h-[70px] items-end gap-1">
        {data.byMonth.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-[3px] ${i === data.bestMonth ? "bg-gold" : v ? "bg-accent/55" : "bg-foreground/[.07]"}`}
              style={{ height: `${(v / max) * 56 + 2}px` }}
              title={`${monthName(i)}: ${v}`}
            />
            <span aria-hidden="true" className="font-mono text-[9px] text-muted-foreground">{MONTHS[i]}</span>
          </div>
        ))}
      </figure>
      {data.bestMonth !== null && (
        <p className="mt-2 text-[12.5px] text-foreground-soft">
          {(isOwner ? t("bestMonthOwn", { month: monthName(data.bestMonth), count: data.byMonth[data.bestMonth] })
                    : t("bestMonth", { month: monthName(data.bestMonth), count: data.byMonth[data.bestMonth] }))}
          {data.topRated && (
            <> {t.rich("topRated", {
              name: data.topRated.title,
              title: (chunks) => <Link href={data.topRated!.href} className="font-semibold text-foreground">{chunks}</Link>,
            })}</>
          )}
        </p>
      )}
    </section>
  );
}
```

```tsx
// src/components/profile/profile-year-server.tsx
import { createClient } from "@/lib/supabase/server";
import { getProfileYear } from "@/lib/profile/year";
import { YearView } from "./profile-year";

export async function ProfileYear({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  return <YearView data={await getProfileYear(await createClient(), userId)} isOwner={isOwner} />;
}
```

Un `ProfileYear` sin datos no pinta nada,
así que su esqueleto (Paso 10) solo se ve mientras carga.

- [ ] **Paso 9: `profile-identity.tsx`**

Copia `src/components/profile-header.tsx` a `src/components/profile/profile-identity.tsx` y aplica estos
cambios:

1. Renombra el componente a `ProfileIdentity` y quita la prop `stats` y el import de `LibraryStats`.
2. Quita `<Suspense><ProfilePet …/></Suspense>`, que se muda a Leyendo ahora, y el bloque de píldoras de
   estadísticas. «Desde {año}» pasa junto al @usuario: `@{username} · {t("memberSince", { year })}`, en
   minúscula con `.toLowerCase()` sobre el resultado, o con una clave nueva `"memberSinceInline": "desde {year}"`.
3. Usa un solo avatar de 84 px en móvil y 104 px desde `lg`, con borde del color de fondo para que se
   monte sobre la cabecera:

```tsx
<div className="rounded-full border-4 border-background shadow-[0_8px_24px_rgba(0,0,0,.5)]">
  <div className="lg:hidden">{avatar(84)}</div>
  <div className="hidden lg:block">{avatar(104)}</div>
</div>
```

4. Nombre: `font-serif text-[28px] font-bold leading-[1.05] lg:text-[34px]`. Bio y contadores bajo el nombre
   a todos los tamaños: con la columna de 340 px ya no hace falta el doble árbol móvil/escritorio, así que
   bio y `Counts` se pintan **una sola vez**.
5. Las acciones (`followButton`, `safetyActions` y, para el dueño, `EditProfileForm` y ⚙): en móvil a la
   derecha del avatar (`flex items-end justify-between`); en escritorio, en una fila bajo los contadores.
   Un solo nodo con `order` por breakpoint, nunca dos árboles: el botón de seguir lleva estado.

- [ ] **Paso 10: `profile-skeletons.tsx`**

```tsx
// src/components/profile/profile-skeletons.tsx
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";

// Mismo alto que el bloque real: sin esto el contenido salta al llegar (#284).
export function HeroSkeleton() {
  return <div aria-hidden="true" className="h-[200px] bg-surface-muted lg:h-[250px]" />;
}
export function FiguresSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-4 gap-2">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[48px] rounded-md" />)}
    </div>
  );
}
export function NowSkeleton() {
  return <Skeleton aria-hidden="true" className="h-[112px] rounded-card" />;
}
export function YearSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-card border border-border p-4">
      <SkeletonLine className="w-24" />
      <Skeleton className="mt-3 h-[70px] rounded-md" />
      <SkeletonLine className="mt-2 w-3/4" />
    </div>
  );
}
```

Comprueba que `Skeleton` y `SkeletonLine` aceptan `className` y `aria-hidden`
(`src/components/ui/skeleton.tsx`). Si no reenvían props, envuélvelos en un `<div aria-hidden>`.

- [ ] **Paso 11: comprobar que pasa**

Ejecuta: `npx vitest run src/components/profile/profile-blocks.test.tsx`
Esperado: PASA (8 tests).

- [ ] **Paso 12: commit**

```bash
git add src/components/profile src/components/pet/profile-pet.tsx messages/es.json
git commit -m "feat(perfil): cabecera, identidad, cifras, leyendo ahora y su año (#1580)"
```

---

### Tarea 7: Composición de la página

**Ficheros:**
- Modificar: `src/app/u/[username]/page.tsx`, `src/app/u/[username]/page.test.tsx`
- Borrar: `src/components/profile-header.tsx`

**Interfaces:**
- Consume: los componentes de la Tarea 6.
- Produce: la página con `data-testid="profile-layout"` en la rejilla.

- [ ] **Paso 1: actualizar el test (que falla)**

En `src/app/u/[username]/page.test.tsx`:
- sustituye `vi.mock("@/components/profile-header", …)` por mocks nulos de
  `@/components/profile/profile-hero` (`ProfileHero`), `@/components/profile/profile-identity`
  (`ProfileIdentity`), `@/components/profile/profile-figures-server` (`ProfileFigures`),
  `@/components/profile/profile-now-server` (`ProfileNow`) y `@/components/profile/profile-year-server`
  (`ProfileYear`);
- añade este caso:

```ts
describe("composición del perfil visual", () => {
  it("monta cabecera, identidad, cifras, leyendo ahora y su año", async () => {
    const result = await profileContent();
    for (const name of ["ProfileHero", "ProfileIdentity", "ProfileFigures", "ProfileNow", "ProfileYear"]) {
      expect(findElement(result, name), name).toBeDefined();
    }
  });
});
```

`findElement` busca por `root.type.name`. Los mocks deben ser funciones con nombre:
`ProfileHero: function ProfileHero() { return null; }`. Además, `findElement` no entra en `<Suspense>`
si sus hijos van en `props.children` de un elemento cuyo `type` es un símbolo, pero el recorrido actual ya
baja por `props.children` de cualquier elemento válido, así que vale.

Ejecuta: `npx vitest run "src/app/u/[username]/page.test.tsx"`
Esperado: FALLA en «composición del perfil visual».

- [ ] **Paso 2: implementación**

En `src/app/u/[username]/page.tsx`, sustituye el `return (` final de `ProfileContent` por:

```tsx
  const name = profile.displayName || profile.username;
  return (
    <div className="flex w-full flex-col pb-8">
      <Suspense fallback={<HeroSkeleton />}>
        <ProfileHero userId={profile.userId} name={name} />
      </Suspense>
      <div
        data-testid="profile-layout"
        className={`relative mx-auto -mt-12 grid w-full ${SHELL_APP} gap-6 px-4 sm:px-6 lg:-mt-[70px] lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-11 lg:px-8`}
      >
        <aside className="flex min-w-0 flex-col gap-5">
          <ProfileIdentity
            profile={profile}
            isOwner={isOwner}
            counts={counts}
            followButton={/* el mismo nodo de hoy */}
            safetyActions={/* el mismo nodo de hoy */}
          />
          <Suspense fallback={<FiguresSkeleton />}>
            <ProfileFigures userId={profile.userId} stats={stats} />
          </Suspense>
          <Suspense fallback={<NowSkeleton />}>
            <ProfileNow userId={profile.userId} />
          </Suspense>
          <Suspense fallback={<YearSkeleton />}>
            <ProfileYear userId={profile.userId} isOwner={isOwner} />
          </Suspense>
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:pt-[86px]">
          {isOwner && <FollowRequests requests={pendingRequests} />}
          <SectionTabs active={tab} basePath={basePath} isOwner={isOwner} />
          {/* las tres ramas de pestaña de hoy, sin cambios */}
        </div>
      </div>
    </div>
  );
```

- Las props `followButton` y `safetyActions` llevan exactamente las expresiones JSX que hoy se pasan a
  `ProfileHeader` (líneas 195-224 de la versión actual).
- Quita el import de `ProfileHeader` y añade los de `profile-hero`, `profile-identity`,
  `profile-figures-server`, `profile-now-server`, `profile-year-server` y `profile-skeletons`.
- `stats` se sigue esperando arriba con `getLibraryStats`: es una lectura ligera y la cabecera de hoy ya
  la esperaba.

`git rm src/components/profile-header.tsx` y `grep -rn "profile-header\"" src` deben dejar cero
coincidencias.

- [ ] **Paso 3: comprobar**

Ejecuta: `npx vitest run "src/app/u/[username]/page.test.tsx" && npx tsc --noEmit -p .`
Esperado: PASA y sin errores de tipos.

- [ ] **Paso 4: comprobar en el navegador**

1. `npx next dev --webpack -p 3000` en segundo plano, con un solo servidor.
2. Abre `/u/devtest` en la cuenta de dev, a 1280 y a 390 px, en tema oscuro y claro.
3. Comprueba:
   - el abanico y el mosaico;
   - el avatar montado sobre la cabecera;
   - las cuatro cifras;
   - Leyendo ahora con la mascota;
   - Su año;
   - que no hay scroll horizontal a 390 px: `document.documentElement.scrollWidth <= innerWidth`;
   - que no hay errores en consola.
4. Abre un perfil ajeno (el de otra cuenta de dev pública) y comprueba que Seguir y las acciones de
   seguridad siguen ahí.

- [ ] **Paso 5: commit**

```bash
git add "src/app/u/[username]/page.tsx" "src/app/u/[username]/page.test.tsx"
git rm src/components/profile-header.tsx
git commit -m "feat(perfil): nueva composición con cabecera en capas y columna de identidad (#1580)"
```

---

### Tarea 8: Punto de control visual 1

- [ ] **Paso 1:** con el servidor de la Tarea 7, saca capturas de `/u/devtest` a 1280 y a 390 px, en
  oscuro y en claro, y del perfil de una cuenta nueva sin datos (créala con el patrón de
  `e2e/avisos-por-persona.spec.ts` y bórrala después). Guárdalas en `docs/testing/assets/perfil-visual/`.
- [ ] **Paso 2:** enséñaselas al usuario y **para hasta que dé el visto bueno**. Los retoques que pida se
  aplican y se commitean como `fix(perfil): …` antes de pasar a la Fase 2.
- [ ] **Paso 3:** mata `next dev` (`Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`,
  luego `Stop-Process -Id <pid>`).

---

## Fase 2 — El muro

### Tarea 9: Modelo del muro

**Ficheros:**
- Crear: `src/lib/profile/wall.ts`
- Test: `src/lib/profile/wall.test.ts`

**Interfaces:**
- Consume: `FeedEntry` y `FeedEvent` (`src/lib/social/feed.ts`) y `PersonGroupEntry`
  (`src/lib/social/group-feed-entries.ts`).
- Produce:
  - `type WallCoverState = { kind: "rated"; rating: number } | { kind: "dropped" } | { kind: "finished" } | { kind: "episodes"; season: number | null; count: number } | { kind: "in_progress" }`;
  - `type WallCover = { key: string; itemType: ItemType; itemId: string; title: string; coverUrl: string | null; state: WallCoverState; postId: string | null; reactions: number; at: string }`;
  - `type WallCard = { id: string; entry: FeedEntry; at: string }`;
  - `type WallSegment = { type: "covers"; covers: WallCover[] } | { type: "card"; card: WallCard }`;
  - `type WallMonth = { key: string; coverCount: number; segments: WallSegment[] }`;
  - `madridMonthKey(iso: string): string` (`AAAA-MM`);
  - `buildProfileWall(entries: FeedEntry[]): WallMonth[]`;
  - `wallMonthLabel(key: string, currentKey: string): string`.

- [ ] **Paso 1: test que falla**

```ts
// src/lib/profile/wall.test.ts
import { describe, expect, it } from "vitest";
import type { FeedEntry, FeedEvent } from "@/lib/social/feed";
import { buildProfileWall, madridMonthKey, wallMonthLabel } from "./wall";

let n = 0;
function ev(over: Partial<FeedEvent>): FeedEntry {
  n += 1;
  const event = {
    id: `posts:${n}`, postId: `p${n}`, actorId: "u", actorUsername: "mar", actorDisplayName: null,
    actorAvatarUrl: null, verb: "progressed", entryStatus: null, itemType: "book", itemId: "b1",
    itemTitle: "El imperio final", itemCoverUrl: null, itemSubtitle: null,
    eventDate: "2026-10-10T10:00:00Z", orderDate: "2026-10-10T10:00:00Z", sortDate: "2026-10-10T10:00:00Z",
    rating: null, reviewExcerpt: null, reviewIsSpoiler: false, episode: null, reviewMeta: null,
    progress: null, thought: null, interactionTarget: null, reactionCount: 0, viewerReacted: false,
    commentCount: 0, comments: [], reactions: {},
    ...over,
  } as FeedEvent;
  return { source: "person", id: event.id, eventDate: event.eventDate, orderDate: event.orderDate, sortDate: event.sortDate, event };
}
const at = (d: string) => ({ eventDate: d, orderDate: d, sortDate: d });

describe("madridMonthKey", () => {
  it("las 23:30 UTC del 31 de octubre ya son noviembre en Madrid", () => {
    expect(madridMonthKey("2026-10-31T23:30:00Z")).toBe("2026-11");
  });
});

describe("buildProfileWall", () => {
  it("una obra aparece una vez por mes con el estado de mayor precedencia", () => {
    const wall = buildProfileWall([
      ev({ verb: "rated", rating: 8, ...at("2026-10-20T10:00:00Z") }),
      ev({ verb: "progressed", ...at("2026-10-12T10:00:00Z") }),
      ev({ verb: "started", ...at("2026-10-01T10:00:00Z") }),
    ]);
    expect(wall).toHaveLength(1);
    expect(wall[0].coverCount).toBe(1);
    const seg = wall[0].segments[0];
    expect(seg.type).toBe("covers");
    if (seg.type === "covers") expect(seg.covers[0].state).toEqual({ kind: "rated", rating: 8 });
  });

  it("precedencias: abandonada sobre terminada, terminada sobre en curso", () => {
    const dropped = buildProfileWall([ev({ verb: "dropped" }), ev({ verb: "finished" })]);
    const finished = buildProfileWall([ev({ verb: "finished" }), ev({ verb: "progressed" })]);
    const firstCover = (w: ReturnType<typeof buildProfileWall>) =>
      w[0].segments[0].type === "covers" ? w[0].segments[0].covers[0].state : null;
    expect(firstCover(dropped)).toEqual({ kind: "dropped" });
    expect(firstCover(finished)).toEqual({ kind: "finished" });
  });

  it("solo episodios: cuenta los episodios y toma la temporada del más reciente", () => {
    const wall = buildProfileWall([
      ev({ verb: "watchedEpisode", itemType: "series", itemId: "s1", episode: { season: 2, episode: 6, title: null }, episodes: [{} as never, {} as never], ...at("2026-10-05T10:00:00Z") }),
      ev({ verb: "watchedEpisode", itemType: "series", itemId: "s1", episode: { season: 2, episode: 4, title: null }, ...at("2026-10-02T10:00:00Z") }),
    ]);
    const seg = wall[0].segments[0];
    if (seg.type !== "covers") throw new Error("esperaba portadas");
    expect(seg.covers[0].state).toEqual({ kind: "episodes", season: 2, count: 3 });
  });

  it("la nota de un episodio no es la nota de la serie", () => {
    const wall = buildProfileWall([
      ev({ verb: "rated", rating: 9, itemType: "series", itemId: "s1", episode: { season: 1, episode: 1, title: null } }),
    ]);
    const seg = wall[0].segments[0];
    if (seg.type !== "covers") throw new Error("esperaba portadas");
    expect(seg.covers[0].state.kind).toBe("episodes");
  });

  it("una reseña con texto deja portada y añade tarjeta detrás", () => {
    const wall = buildProfileWall([ev({ verb: "reviewed", rating: 10, reviewExcerpt: "Preciosa" })]);
    expect(wall[0].segments.map((s) => s.type)).toEqual(["covers", "card"]);
  });

  it("pensamientos, experiencias y crónicas son tarjetas en su sitio del tiempo", () => {
    const thought = ev({ verb: "thought", thought: { body: "hola", isSpoiler: false, anchor: {} as never }, ...at("2026-10-15T10:00:00Z") });
    const wall = buildProfileWall([
      ev({ itemId: "a", ...at("2026-10-20T10:00:00Z") }),
      thought,
      ev({ itemId: "b", ...at("2026-10-10T10:00:00Z") }),
      { source: "wrap_up", id: "w1", ...at("2026-10-05T10:00:00Z"), event: {} as never },
    ]);
    expect(wall[0].segments.map((s) => s.type)).toEqual(["covers", "card", "covers", "card"]);
  });

  it("los meses van en orden descendente y en hora de Madrid", () => {
    const wall = buildProfileWall([
      ev({ itemId: "a", ...at("2026-10-31T23:30:00Z") }),
      ev({ itemId: "b", ...at("2026-10-01T10:00:00Z") }),
    ]);
    expect(wall.map((m) => m.key)).toEqual(["2026-11", "2026-10"]);
  });

  it("un grupo de persona se deshace en sus eventos", () => {
    const a = ev({ itemId: "a" });
    const b = ev({ itemId: "b" });
    const group = {
      source: "person-group", id: "g1", ...at("2026-10-10T10:00:00Z"), verb: "progressed",
      actor: { id: "u", username: "mar", displayName: null, avatarUrl: null },
      items: [a, b].map((e) => (e as Extract<FeedEntry, { source: "person" }>).event),
    } as FeedEntry;
    expect(buildProfileWall([group])[0].coverCount).toBe(2);
  });

  it("suma reacciones y guarda el post más reciente", () => {
    const wall = buildProfileWall([
      ev({ postId: "nuevo", reactionCount: 2, ...at("2026-10-20T10:00:00Z") }),
      ev({ postId: "viejo", reactionCount: 1, ...at("2026-10-01T10:00:00Z") }),
    ]);
    const seg = wall[0].segments[0];
    if (seg.type !== "covers") throw new Error("esperaba portadas");
    expect(seg.covers[0]).toMatchObject({ postId: "nuevo", reactions: 3 });
  });

  it("un mes partido entre páginas se une al reconstruir con todos los eventos", () => {
    const page1 = [ev({ itemId: "a", ...at("2026-10-20T10:00:00Z") })];
    const page2 = [ev({ itemId: "a", verb: "finished", ...at("2026-10-02T10:00:00Z") })];
    const wall = buildProfileWall([...page1, ...page2]);
    expect(wall).toHaveLength(1);
    expect(wall[0].coverCount).toBe(1);
  });
});

describe("wallMonthLabel", () => {
  it("sin año en el año en curso, con año en otro", () => {
    expect(wallMonthLabel("2026-10", "2026-10")).toBe("Octubre");
    expect(wallMonthLabel("2025-12", "2026-10")).toBe("Diciembre de 2025");
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecuta: `npx vitest run src/lib/profile/wall.test.ts`
Esperado: FALLA, «Cannot find module './wall'».

- [ ] **Paso 3: implementación**

```ts
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
};
export type WallCard = { id: string; entry: FeedEntry; at: string };
export type WallSegment = { type: "covers"; covers: WallCover[] } | { type: "card"; card: WallCard };
export type WallMonth = { key: string; coverCount: number; segments: WallSegment[] };

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
      bucket = { month: { key, coverCount: 0, segments: [] }, covers: new Map() };
      byMonth.set(key, bucket);
      months.push(bucket.month);
    }
    const { month, covers } = bucket;
    const pushCard = (id: string) => month.segments.push({ type: "card", card: { id, entry, at: entry.eventDate } });

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
    if (existing) {
      existing.events.push(event);
      existing.cover.reactions += event.reactionCount;
    } else {
      const cover: WallCover = {
        key: coverKey, itemType: event.itemType, itemId: event.itemId, title: event.itemTitle,
        coverUrl: event.itemCoverUrl, state: { kind: "in_progress" }, postId: event.postId ?? null,
        reactions: event.reactionCount, at: event.eventDate,
      };
      covers.set(coverKey, { cover, events: [event] });
      const last = month.segments[month.segments.length - 1];
      if (last?.type === "covers") last.covers.push(cover);
      else month.segments.push({ type: "covers", covers: [cover] });
      month.coverCount += 1;
    }
    if (event.verb === "reviewed" && event.reviewExcerpt) pushCard(`${entry.id}:review`);
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
```

El test «solo episodios» espera `count: 3`: el primer evento trae `episodes` con 2 elementos y el segundo
ninguno, que cuenta 1. Si en el código real `episodes` lleva también el episodio del propio evento, ajusta
la regla de conteo y el test a ese contrato, mirando cómo lo pinta hoy `FeedItem` para
`watchedEpisode`, y anótalo en el comentario de `stateOf`.

- [ ] **Paso 4: comprobar que pasa**

Ejecuta: `npx vitest run src/lib/profile/wall.test.ts`
Esperado: PASA (12 tests).

- [ ] **Paso 5: commit**

```bash
git add src/lib/profile/wall.ts src/lib/profile/wall.test.ts
git commit -m "feat(perfil): modelo del muro mixto por mes (#1580)"
```

---

### Tarea 10: Componente del muro

**Ficheros:**
- Crear: `src/components/profile/profile-wall.tsx`
- Modificar: `src/app/u/[username]/_tabs/activity-tab.tsx`, `messages/es.json`
- Borrar (si quedan sin usos): `src/components/social/profile-activity-feed.tsx`,
  `src/lib/social/profile-feed-buckets.ts`, `src/lib/social/profile-feed-buckets.test.ts`
- Test: `src/components/profile/profile-wall.test.tsx`

**Interfaces:**
- Consume:
  - `buildProfileWall`, `wallMonthLabel` y `madridMonthKey` (Tarea 9);
  - `CoverTile` (Tarea 6);
  - `FeedItem` (`src/components/social/feed-item.tsx`);
  - `loadMoreProfileFeed(actorId, cursor)`;
  - `RatingDots`;
  - `itemHref`.
- Produce: `<ProfileWall actorId initialEvents initialCursor initialKnownUsernames viewerLoggedIn />`,
  con las mismas props que `ProfileActivityFeed`.

- [ ] **Paso 1: claves i18n**

Dentro de `"profile"."visual"` añade:

```json
"wall": {
  "month": "{label} · {count, plural, one {# obra} other {# obras}}",
  "inProgress": "En curso",
  "dropped": "La dejó",
  "finished": "Terminada",
  "episodes": "{season, select, none {} other {T{season} · }}{count, plural, one {# ep.} other {# ep.}}",
  "reactions": "{count, plural, one {# reacción} other {# reacciones}}",
  "coverLabel": "{title}, {state}"
}
```

- [ ] **Paso 2: test que falla**

```tsx
// @vitest-environment jsdom
// src/components/profile/profile-wall.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { FeedEntry, FeedEvent } from "@/lib/social/feed";

vi.mock("@/lib/social/feed-actions", () => ({ loadMoreProfileFeed: vi.fn() }));
vi.mock("@/components/social/feed-item", () => ({ FeedItem: ({ entry }: { entry: FeedEntry }) => <article data-testid="card">{entry.id}</article> }));

import { ProfileWall } from "./profile-wall";

const person = (over: Partial<FeedEvent>): FeedEntry => {
  const event = {
    id: over.id ?? "posts:1", postId: "p1", actorId: "u", actorUsername: "mar", actorDisplayName: null, actorAvatarUrl: null,
    verb: "rated", entryStatus: null, itemType: "movie", itemId: "m1", itemTitle: "Pearl", itemCoverUrl: null, itemSubtitle: null,
    eventDate: "2026-10-10T10:00:00Z", orderDate: "2026-10-10T10:00:00Z", sortDate: "2026-10-10T10:00:00Z",
    rating: 10, reviewExcerpt: null, reviewIsSpoiler: false, episode: null, reviewMeta: null, progress: null, thought: null,
    interactionTarget: null, reactionCount: 2, viewerReacted: false, commentCount: 0, comments: [], reactions: {}, ...over,
  } as FeedEvent;
  return { source: "person", id: event.id, eventDate: event.eventDate, orderDate: event.orderDate, sortDate: event.sortDate, event };
};

const wrap = (events: FeedEntry[], cursor: string | null = null) =>
  render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      <ProfileWall actorId="u" initialEvents={events} initialCursor={cursor} initialKnownUsernames={[]} viewerLoggedIn />
    </NextIntlClientProvider>,
  );

describe("ProfileWall", () => {
  it("rotula el mes con su número de obras", () => {
    wrap([person({})]);
    expect(screen.getByText(/· 1 obra$/)).toBeTruthy();
  });

  it("la portada abre su publicación y anuncia título y estado", () => {
    wrap([person({})]);
    const link = screen.getByRole("link", { name: /Pearl/ });
    expect(link.getAttribute("href")).toBe("/post/p1");
  });

  it("sin publicación, la portada abre la ficha", () => {
    wrap([person({ postId: undefined })]);
    expect(screen.getByRole("link", { name: /Pearl/ }).getAttribute("href")).toBe("/pelicula/m1");
  });

  it("una reseña con texto pinta además su tarjeta", () => {
    wrap([person({ verb: "reviewed", reviewExcerpt: "Preciosa" })]);
    expect(screen.getAllByTestId("card")).toHaveLength(1);
  });

  it("con cursor ofrece cargar más", () => {
    wrap([person({})], "c1");
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
```

- [ ] **Paso 3: comprobar que falla**

Ejecuta: `npx vitest run src/components/profile/profile-wall.test.tsx`
Esperado: FALLA, «Cannot find module './profile-wall'».

- [ ] **Paso 4: implementación**

```tsx
// src/components/profile/profile-wall.tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FeedEntry } from "@/lib/social/feed";
import { loadMoreProfileFeed } from "@/lib/social/feed-actions";
import { itemHref } from "@/lib/catalog/item-href";
import { buildProfileWall, madridMonthKey, wallMonthLabel, type WallCover } from "@/lib/profile/wall";
import { FeedItem } from "@/components/social/feed-item";
import { RatingDots } from "@/components/ui/rating-dots";
import { CoverTile } from "./cover-tile";

// El muro de la actividad (spec §5): las mismas publicaciones que la lista de
// antes, agrupadas por mes; cada obra una vez con su último estado y las
// publicaciones sin portada intercaladas como tarjetas (`FeedItem`, con sus
// reacciones y comentarios). «Cargar más» añade eventos y el muro se
// reconstruye entero, así un mes partido entre páginas queda unido.
export function ProfileWall({
  actorId,
  initialEvents,
  initialCursor,
  initialKnownUsernames,
  viewerLoggedIn,
}: {
  actorId: string;
  initialEvents: FeedEntry[];
  initialCursor: string | null;
  initialKnownUsernames: string[];
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("profile.visual.wall");
  const tFeed = useTranslations("feed");
  const [extra, setExtra] = useState<FeedEntry[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [known, setKnown] = useState(initialKnownUsernames);
  const [isPending, startTransition] = useTransition();

  const months = useMemo(() => buildProfileWall([...initialEvents, ...extra]), [initialEvents, extra]);
  const currentKey = madridMonthKey(new Date().toISOString());

  function stateLabel(c: WallCover): string {
    switch (c.state.kind) {
      case "rated": return `${(c.state.rating / 2).toLocaleString("es", { maximumFractionDigits: 1 })}/5`;
      case "dropped": return t("dropped");
      case "finished": return t("finished");
      case "in_progress": return t("inProgress");
      case "episodes": return t("episodes", { season: c.state.season === null ? "none" : String(c.state.season), count: c.state.count });
    }
  }

  function loadMore() {
    startTransition(async () => {
      const page = await loadMoreProfileFeed(actorId, cursor);
      setExtra((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
      setKnown((prev) => [...new Set([...prev, ...page.knownUsernames])]);
    });
  }

  return (
    <div data-testid="profile-wall" className="flex flex-col gap-2">
      {months.map((month) => (
        <section key={month.key} aria-labelledby={`wall-${month.key}`}>
          <h3 id={`wall-${month.key}`} suppressHydrationWarning className="pt-4 pb-2 font-mono text-[11px] font-medium uppercase tracking-[.09em] text-muted-foreground">
            {t("month", { label: wallMonthLabel(month.key, currentKey), count: month.coverCount })}
          </h3>
          <div className="flex flex-col gap-3">
            {month.segments.map((seg, i) =>
              seg.type === "card" ? (
                <FeedItem key={seg.card.id} entry={seg.card.entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={known} hideActor />
              ) : (
                <ul key={`covers-${i}`} className="grid grid-cols-3 gap-2.5 lg:grid-cols-6">
                  {seg.covers.map((c) => (
                    <li key={c.key} className="relative">
                      <Link
                        href={c.postId ? `/post/${c.postId}` : itemHref(c.itemType, c.itemId)}
                        aria-label={t("coverLabel", { title: c.title, state: stateLabel(c) })}
                        className={`block transition-transform motion-safe:hover:-translate-y-1 ${c.state.kind === "dropped" ? "opacity-55" : ""}`}
                      >
                        <CoverTile cover={{ title: c.title, coverUrl: c.coverUrl }} sizes="(max-width: 1024px) 30vw, 140px" />
                        <span aria-hidden="true" className="absolute top-1.5 right-1.5 rounded-full bg-background/90 px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase">
                          {c.state.kind === "rated" ? <RatingDots value={c.state.rating} size="sm" /> : stateLabel(c)}
                        </span>
                        {c.reactions > 0 && (
                          <span aria-hidden="true" className="absolute bottom-1.5 left-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px]">❤ {c.reactions}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </section>
      ))}
      {cursor && (
        <button
          type="button"
          disabled={isPending}
          onClick={loadMore}
          className="mt-4 self-center rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          {tFeed("loadMore")}
        </button>
      )}
    </div>
  );
}
```

En `src/app/u/[username]/_tabs/activity-tab.tsx`, cambia el import y el JSX de `ProfileActivityFeed` por
`ProfileWall`, con las mismas props.

Después:

```bash
grep -rn "profile-activity-feed\|profile-feed-buckets" src
```

Si solo salen los propios ficheros y su test, bórralos con `git rm`. Si sale otro uso, déjalos y anótalo
en la PR.

- [ ] **Paso 5: comprobar**

Ejecuta: `npx vitest run src/components/profile src/lib/profile "src/app/u/[username]" && npx tsc --noEmit -p .`
Esperado: PASA y sin errores de tipos.

- [ ] **Paso 6: comprobar en el navegador**

Con un solo `next dev --webpack -p 3000`, abre `/u/devtest` a 1280 y a 390 px. Comprueba:
- los meses en orden;
- una portada por obra y mes;
- las insignias: dots, EN CURSO, LA DEJÓ y T2 · N EP.;
- las tarjetas intercaladas;
- que tocar una portada lleva a `/post/[id]`;
- que «Cargar más», si hay cursor, une meses;
- que no hay errores en consola.

Mata el servidor al acabar.

- [ ] **Paso 7: commit**

```bash
git add src/components/profile/profile-wall.tsx src/components/profile/profile-wall.test.tsx "src/app/u/[username]/_tabs/activity-tab.tsx" messages/es.json
git commit -m "feat(perfil): la actividad como muro mixto por mes (#1580)"
```

(y otro `git rm` + commit `refactor(perfil): retirar la lista de actividad por día` si se borraron los
ficheros viejos).

---

### Tarea 11: e2e del perfil visual

**Ficheros:**
- Crear: `e2e/perfil-visual.spec.ts`

**Interfaces:**
- Consume: `submitLogin` (`e2e/support/visible-form.ts`) y el patrón de usuarios temporales de
  `e2e/avisos-por-persona.spec.ts`.
- Produce: el spec.

- [ ] **Paso 1: el spec**

```ts
// e2e/perfil-visual.spec.ts
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

const admin = (json = false) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function createUser(request: APIRequestContext, username: string, isPublic: boolean) {
  const auth = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: admin(),
    data: { email: `${username}@example.com`, password: "TestPassword123!", email_confirm: true },
  });
  expect(auth.ok()).toBe(true);
  const user = await auth.json();
  const profile = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: admin(true),
    data: { user_id: user.id, username, is_public: isPublic },
  });
  expect(profile.ok()).toBe(true);
  return { id: user.id as string, username };
}

async function deleteUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: admin() });
}

async function login(page: Page) {
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

test.describe("perfil visual", () => {
  test.skip(!SERVICE_KEY || !USERNAME, "requiere SUPABASE_SERVICE_ROLE_KEY y TEST_USER_USERNAME");

  test("perfil propio: cabecera, cifras y muro, y la portada abre su publicación", async ({ page }) => {
    await login(page);
    await page.goto(`/u/${USERNAME}`);
    await expect(page.getByTestId("profile-hero")).toBeVisible();
    await expect(page.getByTestId("profile-figures")).toBeVisible();
    await expect(page.getByTestId("profile-wall")).toBeVisible();
    const cover = page.getByTestId("profile-wall").locator('a[href^="/post/"]').first();
    await expect(cover).toBeVisible();
    const href = await cover.getAttribute("href");
    await cover.click();
    await page.waitForURL(`**${href}`);
  });

  test("cuenta nueva y pública vista por otra: degradado sin mosaico, «—» y muro vacío", async ({ page, request }) => {
    const fresh = await createUser(request, `pvnueva${Date.now()}`.slice(0, 20), true);
    try {
      await login(page);
      await page.goto(`/u/${fresh.username}`);
      await expect(page.getByTestId("profile-hero")).toHaveAttribute("data-mosaic", "off");
      await expect(page.getByTestId("profile-figures")).toContainText("—");
      await expect(page.getByTestId("profile-now")).toHaveCount(0);
      await expect(page.getByTestId("profile-year")).toHaveCount(0);
    } finally {
      await deleteUser(fresh.id);
    }
  });

  test("perfil privado sin permiso: aviso y ningún bloque nuevo", async ({ page, request }) => {
    const priv = await createUser(request, `pvpriv${Date.now()}`.slice(0, 20), false);
    try {
      await login(page);
      await page.goto(`/u/${priv.username}`);
      await expect(page.getByTestId("profile-hero")).toHaveCount(0);
      await expect(page.getByTestId("profile-figures")).toHaveCount(0);
      await expect(page.getByTestId("profile-wall")).toHaveCount(0);
    } finally {
      await deleteUser(priv.id);
    }
  });

  test("sin sesión, un perfil público se ve y no hay scroll horizontal a 390 px", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`/u/${USERNAME}`);
    await expect(page.getByTestId("profile-hero")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
});
```

El último caso supone que el perfil de dev es público. Si no lo es, ese caso debe esperar el aviso de
perfil privado. Compruébalo con
`GET /rest/v1/profiles?username=eq.<USERNAME>&select=is_public` antes de fijar la aserción.

- [ ] **Paso 2: ejecutar contra el build de producción**

```bash
npm run build
npx next start -p 3000   # en segundo plano
npx playwright test e2e/perfil-visual.spec.ts --retries=0
```

Esperado: 4 PASAN.

Falta la cuarta mirada de la spec (§6): un **seguidor aceptado de un perfil privado**. Los e2e no la
cubren porque sembrar un `follows` aceptado depende de las columnas reales de la tabla
(`docs/requirements/data-model.md`, sección `follows`). Si el contrato está claro, añade un quinto caso
que cree el privado, inserte el `follows` aceptado con la service role y compruebe que devtest ve
cabecera, cifras y muro. Si no lo está, compruébalo a mano en el navegador con dos cuentas de dev y deja
el resultado en la evidencia de la Tarea 12.

Después pasa también las e2e que usan `/u/` con el mismo servidor:

```bash
npx playwright test e2e/go-perfil.spec.ts e2e/avatar-upload.spec.ts e2e/avisos-por-persona.spec.ts e2e/a11y-landmark-main.spec.ts e2e/feed-tarjetas-por-tipo.spec.ts --retries=0
```

Si alguna busca algo que ya no existe (las píldoras «N libros», la tarjeta suelta de la mascota con
`data-testid="profile-pet"` fuera de Leyendo ahora, o la lista por días), actualiza el selector al marcado
nuevo, sin relajar lo que comprueba, y anótalo en la PR. Mata `next start` al acabar.

- [ ] **Paso 3: commit**

```bash
git add e2e/perfil-visual.spec.ts
git commit -m "test(perfil): e2e del perfil visual contra build de producción (#1580)"
```

---

### Tarea 12: Punto de control 2, documentación y PR

- [ ] **Paso 1: punto de control visual 2.** Saca capturas del muro de `/u/devtest` a 1280 y a 390 px,
  en oscuro y en claro, y guárdalas en `docs/testing/assets/perfil-visual/`. Enséñaselas al usuario y
  **para hasta su visto bueno**.
- [ ] **Paso 2: documentación** (definición de «hecho» de `AGENTS.md`):
  - `docs/requirements/decisiones.md`: añade al final «2026-MM-DD — Perfil visual», con la cabecera en
    capas, el muro mixto por mes desde publicaciones, «Su año» acotado a resumen pese a la regla de
    herramientas, las cifras con la semántica de `getLibraryStats` (#772 aparte) y sin `use cache`.
  - `docs/requirements/backlog.md`: la casilla del perfil visual.
  - `docs/superpowers/specs/2026-10-29-perfil-visual-design.md`: sección «Ajustes durante la
    implementación» con lo que cambió respecto a la spec, por ejemplo `latestPassKeys` en vez de
    `getLibraryView`, o el conteo real de episodios.
  - `docs/UI-GLOSARIO.md`: «Su año» / «Tu año», «Leyendo ahora» y «Destacados» en la cabecera.
  - `docs/architecture/graph.json`: nodo del perfil con los ficheros nuevos y la trampa «el muro sale de
    posts; la cabecera y Su año, de passes». Ejecuta `node docs/architecture/sync.mjs`.
  - Evidencia en `docs/testing/2026-MM-DD-perfil-visual.md`: comandos, resultados y capturas.
- [ ] **Paso 3: comprobación final**

```bash
npx vitest run && npx tsc --noEmit -p . && npm run lint
```

Esperado: todo en verde.
- [ ] **Paso 4: commit de documentación y PR contra `main`** (solo si el usuario la pide). Cierra #1580
  y, si el layout lo resuelve, #431. Incluye la declaración de la regla #437: «Sin `use cache` nuevo:
  todas las lecturas dependen de quién mira y usan el cliente de la petición».
- [ ] **Paso 5:** abre como issue lo que quede pendiente o se descubra de paso, según
  `docs/agents/issue-tracker.md`.
