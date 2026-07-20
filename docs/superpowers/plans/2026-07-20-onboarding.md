# Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el onboarding de 3 pasos + bienvenida que hoy no existe (`/onboarding` redirige de largo), para que quien se registre no aterrice en una home vacía.

**Architecture:** Una sola ruta `/onboarding` con el paso en `?paso=`, un único gate sobre `profiles.onboarded_at`, y los pasos como Server Components. La lógica decidible (normalizar el paso, omitir el paso 3, ordenar la rejilla) vive en módulos puros con tests de unidad; las escrituras reutilizan acciones que ya existen.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), next-intl, Tailwind v4, Vitest, Playwright.

## Global Constraints

- Node **22.23.1** — `fnm use` antes de `npm test` o `npx playwright test`.
- Diseño de referencia: `docs/superpowers/specs/2026-07-20-onboarding-design.md`. Decisiones **D1–D7** de su §2.
- Idioma de la UI: español, vía `next-intl`. **Ninguna cadena literal en JSX** — todas por `t()`.
- **Las clases de Tailwind se escriben enteras, nunca interpoladas** (el JIT escanea texto). Usar `MEDIA_ACCENT[type].bg`, que ya las lista completas.
- Migraciones: primero en **dev**, verificar, después prod, y anexar a `supabase/schema-baseline.sql` **en el orden de aplicación real de prod**.
- **NO crear `loading.tsx`** en `/onboarding` (spec §6; `docs/TRAMPAS.md` §4).
- La suite e2e **no se corre entera de una tacada**: grupos de 2–3 specs (`docs/TRAMPAS.md` §5).
- Commits en español, imperativo, con prefijo (`feat:`, `test:`, `fix:`).

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260720_onboarding.sql` | Columnas, grants por columna, backfill |
| `src/lib/onboarding/steps.ts` | **Puro.** Normalizar `?paso=`, decidir si el paso 3 se omite, total de pasos |
| `src/lib/onboarding/steps.test.ts` | Tests de lo anterior |
| `src/lib/onboarding/rank-suggestions.ts` | **Puro.** Filtrar y ordenar la rejilla del paso 2 |
| `src/lib/onboarding/rank-suggestions.test.ts` | Tests de lo anterior |
| `src/lib/onboarding/get-suggestions.ts` | Consulta de catálogo + recuento de pases; delega el orden en `rank-suggestions` |
| `src/lib/onboarding/get-social-suggestions.ts` | Perfiles y clubes públicos para el paso 3 |
| `src/lib/onboarding/actions.ts` | `saveInterests`, `toggleTitle`, `finishOnboarding` |
| `src/app/onboarding/page.tsx` | Gate + despacho de paso (**reescribe** el actual) |
| `src/app/onboarding/stepper.tsx` | «Paso N de M» + enlace «Saltar» |
| `src/app/onboarding/step-interests.tsx` | Paso 1 |
| `src/app/onboarding/step-titles.tsx` | Paso 2 |
| `src/app/onboarding/step-people.tsx` | Paso 3 |
| `src/app/onboarding/welcome.tsx` | Bienvenida |
| `src/app/buscar/page.tsx` | **Modificar:** tipo por defecto desde intereses |
| `src/app/coleccion/page.tsx` | **Modificar:** filtro `?type=` de «Todo» desde intereses (NO la pestaña: no hay pestaña por tipo) |
| `messages/es.json` | **Modificar:** bloque `onboarding.wizard.*` |
| `e2e/onboarding.spec.ts` | E2E del recorrido |

`src/app/onboarding/onboarding-form.tsx` y `actions.ts` **se conservan**: son la red de seguridad para cuentas sin `@usuario` (spec §6).

---

## Task 1: Migración — columnas, grants y backfill

**Files:**
- Create: `supabase/migrations/20260720_onboarding.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Produces: `profiles.interests` (`item_type[]`, nullable), `profiles.onboarded_at` (`timestamptz`, nullable).

⚠️ **Los grants de `profiles` son POR COLUMNA** (verificado en prod: `anon` y `authenticated` los tienen listados uno a uno). Una columna nueva **no entra sola** — sin `grant` explícito, el update falla con `permission denied for column`. Es el mismo tropiezo que documenta `20260717_progress_sessions_started_at.sql`.

Solo se concede a `authenticated`: el onboarding exige sesión, y ningún sitio hace `select("*")` sobre `profiles` (verificado en los 18 puntos de consulta), así que las lecturas anónimas no tocan las columnas nuevas.

- [ ] **Step 1: Escribir la migración**

```sql
-- Onboarding (plan 07 §2.4, spec 2026-07-20).
--
-- interests   : respuesta del paso 1. Null = sin responder; el flujo lo trata
--               entonces como "los tres tipos", nunca como "ninguno".
-- onboarded_at: marca de completado. ES el gate de /onboarding.
alter table public.profiles
  add column interests public.item_type[],
  add column onboarded_at timestamptz;

-- Los grants de profiles son POR COLUMNA (ver 20260714_passes_grants.sql y
-- 20260717_progress_sessions_started_at.sql): una columna nueva NO entra sola.
-- Sin esto, el update del onboarding falla con "permission denied for column".
-- Solo authenticated: el flujo exige sesión y ninguna consulta anónima pide
-- estas columnas (nadie hace select("*") sobre profiles).
grant select (interests, onboarded_at) on public.profiles to authenticated;
grant update (interests, onboarded_at) on public.profiles to authenticated;

-- Backfill (D6): los perfiles que ya existen NO deben ver el flujo
-- retroactivamente. Para probarlo en dev, poner onboarded_at a null a mano.
update public.profiles
   set onboarded_at = now()
 where onboarded_at is null;

comment on column public.profiles.interests is
  'Tipos que le interesan al usuario (paso 1 del onboarding). Null = sin responder, y entonces el flujo asume los tres.';
comment on column public.profiles.onboarded_at is
  'Cuándo terminó el onboarding. Null = no lo ha hecho; ES el gate de /onboarding. Se escribe al llegar a la bienvenida, tanto si completó como si saltó (D5).';
```

- [ ] **Step 2: Aplicar en dev y verificar**

Aplicar vía el agente `supabase-schema` (o el SQL editor de dev). Verificar:

```sql
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='profiles'
   and column_name in ('interests','onboarded_at');
-- Espera: 2 filas (ARRAY, timestamp with time zone)

select count(*) filter (where onboarded_at is null) as sin_onboarding from public.profiles;
-- Espera: 0
```

- [ ] **Step 3: Regenerar tipos**

Regenerar `src/lib/supabase/database.types.ts` con el agente `supabase-schema` y comprobar que `profiles.Row` incluye `interests: Database["public"]["Enums"]["item_type"][] | null` y `onboarded_at: string | null`.

- [ ] **Step 4: Dejar un perfil de pruebas sin onboarding (solo dev)**

```sql
update public.profiles set onboarded_at = null
 where username = (select username from public.profiles order by created_at limit 1);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260720_onboarding.sql src/lib/supabase/database.types.ts
git commit -m "feat(onboarding): columnas interests y onboarded_at con grants por columna"
```

---

## Task 2: Lógica de pasos (pura)

**Files:**
- Create: `src/lib/onboarding/steps.ts`
- Test: `src/lib/onboarding/steps.test.ts`

**Interfaces:**
- Produces:
  - `type OnboardingStep = 1 | 2 | 3 | "fin"`
  - `PEOPLE_MIN_PROFILES = 3`, `PEOPLE_MIN_CLUBS = 1`
  - `showsPeopleStep(counts: { profiles: number; clubs: number }): boolean`
  - `totalSteps(showsPeople: boolean): number`
  - `normalizeStep(raw: string | undefined, showsPeople: boolean): OnboardingStep`
  - `nextStep(current: OnboardingStep, showsPeople: boolean): OnboardingStep`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeStep,
  nextStep,
  showsPeopleStep,
  totalSteps,
} from "./steps";

describe("showsPeopleStep", () => {
  it("basta con 3 perfiles ajenos", () => {
    expect(showsPeopleStep({ profiles: 3, clubs: 0 })).toBe(true);
  });

  it("basta con 1 club público", () => {
    expect(showsPeopleStep({ profiles: 0, clubs: 1 })).toBe(true);
  });

  it("por debajo del umbral se omite", () => {
    expect(showsPeopleStep({ profiles: 2, clubs: 0 })).toBe(false);
    expect(showsPeopleStep({ profiles: 0, clubs: 0 })).toBe(false);
  });
});

describe("totalSteps", () => {
  it("3 con paso de gente, 2 sin él", () => {
    expect(totalSteps(true)).toBe(3);
    expect(totalSteps(false)).toBe(2);
  });
});

describe("normalizeStep", () => {
  it("ausente o basura cae al paso 1, nunca 404", () => {
    expect(normalizeStep(undefined, true)).toBe(1);
    expect(normalizeStep("", true)).toBe(1);
    expect(normalizeStep("abc", true)).toBe(1);
    expect(normalizeStep("0", true)).toBe(1);
    expect(normalizeStep("9", true)).toBe(1);
    expect(normalizeStep("-1", true)).toBe(1);
  });

  it("respeta los pasos válidos", () => {
    expect(normalizeStep("1", true)).toBe(1);
    expect(normalizeStep("2", true)).toBe(2);
    expect(normalizeStep("3", true)).toBe(3);
    expect(normalizeStep("fin", true)).toBe("fin");
  });

  it("pedir el paso 3 cuando está omitido lleva a la bienvenida", () => {
    expect(normalizeStep("3", false)).toBe("fin");
  });
});

describe("nextStep", () => {
  it("encadena 1 → 2 → 3 → fin con paso de gente", () => {
    expect(nextStep(1, true)).toBe(2);
    expect(nextStep(2, true)).toBe(3);
    expect(nextStep(3, true)).toBe("fin");
  });

  it("sin paso de gente, del 2 salta a la bienvenida", () => {
    expect(nextStep(2, false)).toBe("fin");
  });

  it("desde la bienvenida no se avanza", () => {
    expect(nextStep("fin", true)).toBe("fin");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `fnm use 22.23.1 && npx vitest run src/lib/onboarding/steps.test.ts`
Expected: FAIL — `Failed to resolve import "./steps"`.

- [ ] **Step 3: Implementar**

```ts
// Lógica decidible del asistente de onboarding (spec §3 y §6). Pura: sin BD y
// sin React, para que se pueda probar entera con vitest.

export type OnboardingStep = 1 | 2 | 3 | "fin";

// Umbrales de D2: por debajo de esto el paso 3 saldría casi vacío, y una
// pantalla vacía en el onboarding es peor que no tener el paso. Exportados
// para poder subirlos cuando haya masa social, sin tocar la lógica.
export const PEOPLE_MIN_PROFILES = 3;
export const PEOPLE_MIN_CLUBS = 1;

export function showsPeopleStep(counts: {
  profiles: number;
  clubs: number;
}): boolean {
  return (
    counts.profiles >= PEOPLE_MIN_PROFILES || counts.clubs >= PEOPLE_MIN_CLUBS
  );
}

export function totalSteps(showsPeople: boolean): number {
  return showsPeople ? 3 : 2;
}

/** `?paso=` a un paso válido. Nunca lanza ni provoca 404 (spec §6). */
export function normalizeStep(
  raw: string | undefined,
  showsPeople: boolean,
): OnboardingStep {
  if (raw === "fin") return "fin";
  // Pedir el paso 3 cuando está omitido no es un error del usuario: se le
  // manda al final, que es donde habría acabado.
  if (raw === "3") return showsPeople ? 3 : "fin";
  if (raw === "2") return 2;
  return 1;
}

export function nextStep(
  current: OnboardingStep,
  showsPeople: boolean,
): OnboardingStep {
  if (current === "fin") return "fin";
  if (current === 1) return 2;
  if (current === 2) return showsPeople ? 3 : "fin";
  return "fin";
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/onboarding/steps.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/steps.ts src/lib/onboarding/steps.test.ts
git commit -m "feat(onboarding): logica de pasos con el paso de gente condicional"
```

---

## Task 3: Orden de la rejilla (puro)

**Files:**
- Create: `src/lib/onboarding/rank-suggestions.ts`
- Test: `src/lib/onboarding/rank-suggestions.test.ts`

**Interfaces:**
- Consumes: `ItemType` de `@/lib/catalog/types`.
- Produces:
  - `type SuggestionCandidate = { itemType: ItemType; itemId: string; title: string; coverUrl: string | null; year: number | null; readers: number }`
  - `rankSuggestions(candidates: SuggestionCandidate[], interests: ItemType[], limit?: number): SuggestionCandidate[]`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { rankSuggestions, type SuggestionCandidate } from "./rank-suggestions";

const c = (over: Partial<SuggestionCandidate>): SuggestionCandidate => ({
  itemType: "book",
  itemId: over.itemId ?? "x",
  title: over.title ?? "Título",
  coverUrl: "https://ejemplo/portada.jpg",
  year: 2020,
  readers: 0,
  ...over,
});

describe("rankSuggestions", () => {
  it("descarta lo que no tiene portada", () => {
    const out = rankSuggestions([c({ itemId: "sin", coverUrl: null }), c({ itemId: "con" })], ["book"]);
    expect(out.map((x) => x.itemId)).toEqual(["con"]);
  });

  it("descarta lo que no tiene año", () => {
    const out = rankSuggestions([c({ itemId: "sin", year: null }), c({ itemId: "con" })], ["book"]);
    expect(out.map((x) => x.itemId)).toEqual(["con"]);
  });

  it("filtra por intereses", () => {
    const out = rankSuggestions(
      [c({ itemId: "libro", itemType: "book" }), c({ itemId: "peli", itemType: "movie" })],
      ["movie"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["peli"]);
  });

  it("intereses vacíos = los tres tipos, nunca ninguno", () => {
    const out = rankSuggestions(
      [c({ itemId: "libro", itemType: "book" }), c({ itemId: "peli", itemType: "movie" })],
      [],
    );
    expect(out).toHaveLength(2);
  });

  it("ordena por lectores descendente", () => {
    const out = rankSuggestions(
      [c({ itemId: "pocos", readers: 1 }), c({ itemId: "muchos", readers: 9 })],
      ["book"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["muchos", "pocos"]);
  });

  it("empate a lectores: desempata por título, para que el orden sea estable", () => {
    const out = rankSuggestions(
      [c({ itemId: "b", title: "Beta", readers: 2 }), c({ itemId: "a", title: "Alfa", readers: 2 })],
      ["book"],
    );
    expect(out.map((x) => x.itemId)).toEqual(["a", "b"]);
  });

  it("respeta el límite", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      c({ itemId: `i${i}`, readers: 30 - i }),
    );
    expect(rankSuggestions(many, ["book"], 12)).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/onboarding/rank-suggestions.test.ts`
Expected: FAIL — `Failed to resolve import "./rank-suggestions"`.

- [ ] **Step 3: Implementar**

```ts
import type { ItemType } from "@/lib/catalog/types";

// Orden de la rejilla del paso 2 (spec §4.2). Puro y aparte de la consulta
// para poder probarlo sin BD.
//
// El filtro de portada+año no es cosmético: con ~165 obras en catálogo, casi
// todas sembradas por nosotros, es lo único que separa una rejilla digna de un
// muro de placeholders.

export type SuggestionCandidate = {
  itemType: ItemType;
  itemId: string;
  title: string;
  coverUrl: string | null;
  year: number | null;
  /** Nº de usuarios distintos con un pase de esta obra (visibles por RLS). */
  readers: number;
};

const DEFAULT_LIMIT = 12;

export function rankSuggestions(
  candidates: SuggestionCandidate[],
  interests: ItemType[],
  limit: number = DEFAULT_LIMIT,
): SuggestionCandidate[] {
  // Sin intereses declarados se ofrecen los tres tipos: "no respondió" nunca
  // debe leerse como "no le interesa nada".
  const wanted = interests.length > 0 ? new Set(interests) : null;

  return candidates
    .filter((x) => x.coverUrl !== null && x.year !== null)
    .filter((x) => wanted === null || wanted.has(x.itemType))
    .sort((a, b) => {
      if (a.readers !== b.readers) return b.readers - a.readers;
      // Desempate por título: con pocos datos casi todo empata a 0 lectores, y
      // sin esto el orden lo decidiría Postgres y bailaría entre recargas.
      return a.title.localeCompare(b.title, "es");
    })
    .slice(0, limit);
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/onboarding/rank-suggestions.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/rank-suggestions.ts src/lib/onboarding/rank-suggestions.test.ts
git commit -m "feat(onboarding): orden y filtrado de la rejilla de sugerencias"
```

---

## Task 4: Consultas de sugerencias

**Files:**
- Create: `src/lib/onboarding/get-suggestions.ts`
- Create: `src/lib/onboarding/get-social-suggestions.ts`

**Interfaces:**
- Consumes: `rankSuggestions`, `SuggestionCandidate` (Task 3); `createClient` de `@/lib/supabase/server`.
- Produces:
  - `getSuggestions(supabase, interests: ItemType[]): Promise<SuggestionCandidate[]>`
  - `getSocialCounts(supabase, selfId: string): Promise<{ profiles: number; clubs: number }>`
  - `getSocialSuggestions(supabase, selfId: string): Promise<{ profiles: PersonSuggestion[]; clubs: ClubSuggestion[] }>`
  - `type PersonSuggestion = { userId: string; username: string; displayName: string | null; avatarUrl: string | null }`
  - `type ClubSuggestion = { id: string; slug: string; name: string; memberCount: number }`

**Nota deliberada:** el recuento de lectores sale de `passes` **filtrado por RLS** (solo pases propios y de perfiles públicos). Con la escala actual es exacto de sobra; si algún día hace falta el recuento global, se sustituye por una RPC `SECURITY DEFINER`, que es lo que ya hacen los tableros de actividad.

- [ ] **Step 1: Implementar `get-suggestions.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { rankSuggestions, type SuggestionCandidate } from "./rank-suggestions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};
const YEAR_COLUMN: Record<ItemType, "published_year" | "release_year"> = {
  book: "published_year",
  movie: "release_year",
  series: "release_year",
};

const TYPES: ItemType[] = ["book", "movie", "series"];
// Se piden más de los que se pintan porque rankSuggestions descarta lo que no
// tenga portada y año.
const FETCH_PER_TYPE = 40;

/**
 * Candidatos para la rejilla del paso 2. El recuento de lectores va filtrado
 * por RLS (pases propios y de perfiles públicos) — suficiente a esta escala.
 */
export async function getSuggestions(
  supabase: SupabaseServerClient,
  interests: ItemType[],
): Promise<SuggestionCandidate[]> {
  const types = interests.length > 0 ? interests : TYPES;

  const perType = await Promise.all(
    types.map(async (type) => {
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select(`id, title, cover_url, ${YEAR_COLUMN[type]}`)
        .not("cover_url", "is", null)
        .limit(FETCH_PER_TYPE);

      return (data ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>;
        return {
          itemType: type,
          itemId: r.id as string,
          title: r.title as string,
          coverUrl: (r.cover_url as string | null) ?? null,
          year: (r[YEAR_COLUMN[type]] as number | null) ?? null,
          readers: 0,
        } satisfies SuggestionCandidate;
      });
    }),
  );
  const candidates = perType.flat();
  if (candidates.length === 0) return [];

  // Un solo viaje para los recuentos: se traen los pases de todos los ítems
  // candidatos y se cuentan usuarios distintos en memoria.
  const { data: passRows } = await supabase
    .from("passes")
    .select("user_id, item_type, item_id")
    .in(
      "item_id",
      candidates.map((c) => c.itemId),
    );

  const readersByItem = new Map<string, Set<string>>();
  for (const row of passRows ?? []) {
    const key = `${row.item_type}:${row.item_id}`;
    const set = readersByItem.get(key) ?? new Set<string>();
    set.add(row.user_id as string);
    readersByItem.set(key, set);
  }

  for (const c of candidates) {
    c.readers = readersByItem.get(`${c.itemType}:${c.itemId}`)?.size ?? 0;
  }

  return rankSuggestions(candidates, interests);
}
```

- [ ] **Step 2: Implementar `get-social-suggestions.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PersonSuggestion = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};
export type ClubSuggestion = {
  id: string;
  slug: string;
  name: string;
  memberCount: number;
};

const LIMIT = 6;

/** Recuentos para decidir si el paso 3 se pinta (D2). Baratos: solo `count`. */
export async function getSocialCounts(
  supabase: SupabaseServerClient,
  selfId: string,
): Promise<{ profiles: number; clubs: number }> {
  const [profiles, clubs] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_public", true)
      .neq("user_id", selfId),
    supabase
      .from("clubs")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "public"),
  ]);

  return { profiles: profiles.count ?? 0, clubs: clubs.count ?? 0 };
}

export async function getSocialSuggestions(
  supabase: SupabaseServerClient,
  selfId: string,
): Promise<{ profiles: PersonSuggestion[]; clubs: ClubSuggestion[] }> {
  const [profilesRes, clubsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar_url")
      .eq("is_public", true)
      .neq("user_id", selfId)
      .limit(LIMIT),
    supabase
      .from("clubs")
      .select("id, slug, name, club_members(count)")
      .eq("visibility", "public")
      .limit(LIMIT),
  ]);

  return {
    profiles: (profilesRes.data ?? []).map((p) => ({
      userId: p.user_id as string,
      username: p.username as string,
      displayName: (p.display_name as string | null) ?? null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    })),
    clubs: (clubsRes.data ?? []).map((c) => {
      const members = c.club_members as unknown as { count: number }[] | null;
      return {
        id: c.id as string,
        slug: c.slug as string,
        name: c.name as string,
        memberCount: members?.[0]?.count ?? 0,
      };
    }),
  };
}
```

- [ ] **Step 3: Comprobar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/lib/onboarding/get-suggestions.ts src/lib/onboarding/get-social-suggestions.ts
git commit -m "feat(onboarding): consultas de sugerencias de catalogo y sociales"
```

---

## Task 5: Acciones

**Files:**
- Create: `src/lib/onboarding/actions.ts`

**Interfaces:**
- Consumes: `addExistingItemToLibrary(itemType, itemId, queueId?)` de `@/lib/library/add-existing-item` (D7: ya crea el pase en `planned` vía `applyTransition` y **es idempotente**).
- Produces:
  - `saveInterests(interests: ItemType[]): Promise<void>`
  - `toggleTitle(itemType: ItemType, itemId: string, selected: boolean): Promise<void>`
  - `finishOnboarding(): Promise<never>` — escribe `onboarded_at` y redirige a `/`.

- [ ] **Step 1: Implementar**

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { addExistingItemToLibrary } from "@/lib/library/add-existing-item";

const VALID: ItemType[] = ["book", "movie", "series"];

export async function saveInterests(interests: ItemType[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Se filtra contra la lista buena: los valores llegan del cliente y van a
  // una columna de enum, donde un valor inválido reventaría el update entero.
  const clean = interests.filter((i) => VALID.includes(i));

  await supabase
    .from("profiles")
    .update({ interests: clean.length > 0 ? clean : null })
    .eq("user_id", user.id);

  revalidatePath("/onboarding");
}

/**
 * Añade o quita un título de la biblioteca desde la rejilla del paso 2.
 * El alta reutiliza addExistingItemToLibrary (idempotente); la baja borra el
 * pase planificado que acaba de crear, sin tocar pases con historia.
 */
export async function toggleTitle(
  itemType: ItemType,
  itemId: string,
  selected: boolean,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (selected) {
    await addExistingItemToLibrary(itemType, itemId);
  } else {
    // Solo se retira lo que este mismo paso pudo crear: un pase en planned.
    // Si el usuario ya tenía historia con la obra, no se toca.
    await supabase
      .from("passes")
      .delete()
      .eq("user_id", user.id)
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .eq("status", "planned");
  }

  revalidatePath("/onboarding");
}

export async function finishOnboarding(): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", user.id);

  // La home cambia de golpe (deja de estar vacía): hay que revalidarla.
  revalidatePath("/", "layout");
  redirect("/");
}
```

- [ ] **Step 2: Comprobar que compila**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding/actions.ts
git commit -m "feat(onboarding): acciones de intereses, titulos y cierre"
```

---

## Task 6: Shell de la ruta — gate, `?paso=`, stepper y bienvenida

**Files:**
- Modify: `src/app/onboarding/page.tsx` (reescritura completa)
- Create: `src/app/onboarding/stepper.tsx`
- Create: `src/app/onboarding/welcome.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `normalizeStep`, `showsPeopleStep`, `totalSteps` (Task 2); `getSocialCounts` (Task 4); `finishOnboarding` (Task 5).
- Produces: la ruta `/onboarding?paso=N` con gate. Los pasos 1–3 se enchufan en las tareas 7–9.

- [ ] **Step 1: Añadir las cadenas a `messages/es.json`**

Dentro del objeto `"onboarding"` que ya existe (**junto a** `title`/`username`/…, sin tocarlas: son la red de seguridad del formulario antiguo), añadir:

```json
"wizard": {
  "step": "Paso {current} de {total}",
  "skip": "Saltar",
  "continue": "Continuar",
  "continueWithCount": "Continuar · {count} añadidos",
  "finish": "Terminar",
  "interestsTitle": "¿Qué te gusta seguir?",
  "interestsHint": "Elige al menos uno. Podrás cambiarlo cuando quieras.",
  "titlesTitle": "Añade algo para empezar",
  "titlesHint": "Toca lo que ya hayas leído o visto, o lo que tengas pendiente.",
  "titlesEmpty": "Todavía no hay suficiente catálogo para sugerirte nada. Puedes buscar títulos en cuanto entres.",
  "peopleTitle": "Encuentra a tu gente",
  "peopleHint": "Sigue a alguien o únete a un club para que tu inicio no esté vacío.",
  "peopleFollow": "Seguir",
  "peopleJoin": "Unirme",
  "welcomeTitle": "Todo listo, {name}",
  "welcomeWithTitles": "Has añadido {count, plural, one {# título} other {# títulos}} para empezar.",
  "welcomeNeutral": "Ya puedes empezar a registrar lo que leas y veas.",
  "enter": "Entrar a Biblioshare"
}
```

- [ ] **Step 2: Crear `stepper.tsx`**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Cabecera común de los pasos: "Paso N de M" en mono + enlace Saltar. El total
// es 2 o 3 según se pinte el paso de gente (D2), así que llega por prop.
export async function Stepper({
  current,
  total,
  skipHref,
}: {
  current: number;
  total: number;
  skipHref: string;
}) {
  const t = await getTranslations("onboarding.wizard");

  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
        {t("step", { current, total })}
      </span>
      <Link
        href={skipHref}
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("skip")}
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Crear `welcome.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { finishOnboarding } from "@/lib/onboarding/actions";

export async function Welcome({
  name,
  addedCount,
}: {
  name: string;
  addedCount: number;
}) {
  const t = await getTranslations("onboarding.wizard");

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="font-serif text-[26px] font-semibold">
        {t("welcomeTitle", { name })}
      </h1>
      {/* Si saltó el paso 2 NO se le regaña: texto neutro (spec §4.4). */}
      <p className="text-sm text-muted-foreground">
        {addedCount > 0
          ? t("welcomeWithTitles", { count: addedCount })
          : t("welcomeNeutral")}
      </p>
      <form action={finishOnboarding}>
        <Button type="submit" className="mt-2 px-7 py-3.5">
          {t("enter")}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Reescribir `page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createProfileFromMetadata } from "../(auth)/actions";
import { Wordmark } from "@/components/ui/wordmark";
import { OnboardingForm } from "./onboarding-form";
import { Welcome } from "./welcome";
import {
  normalizeStep,
  showsPeopleStep,
  totalSteps,
} from "@/lib/onboarding/steps";
import { getSocialCounts } from "@/lib/onboarding/get-social-suggestions";

export const metadata: Metadata = {
  title: "Te damos la bienvenida — Biblioshare",
};

// Asistente de onboarding (spec 2026-07-20). Una sola ruta con ?paso= y UN gate
// (D4). Sin `loading.tsx` a propósito: esta ruta redirige, y un loading.tsx es
// una frontera de Suspense que compromete el 200 (docs/TRAMPAS.md §4).
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ paso?: string }>;
}) {
  const supabase = await createClient();

  // Se conserva el comportamiento antiguo: si el perfil aún no existe pero el
  // @usuario viene en user_metadata, se crea aquí antes de nada.
  const result = await createProfileFromMetadata(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, onboarded_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // Sin perfil todavía: cae al formulario antiguo, que es la red de seguridad
  // para cuentas sin @usuario.
  if (!profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
        <Wordmark size="lg" />
        <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 shadow-card">
          <OnboardingForm nameWasTaken={result === "usernameTaken"} />
        </div>
      </div>
    );
  }

  // EL GATE (D5): quien ya lo terminó no vuelve a verlo.
  if (profile.onboarded_at !== null) redirect("/");

  const counts = await getSocialCounts(supabase, user.id);
  const showsPeople = showsPeopleStep(counts);
  const total = totalSteps(showsPeople);

  const params = await searchParams;
  const step = normalizeStep(params.paso, showsPeople);

  const addedCount = await countPlanned(supabase, user.id);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-12">
      <Wordmark size="lg" />
      <div className="rounded-card border border-border bg-surface p-6 shadow-card">
        {step === "fin" ? (
          <Welcome
            name={profile.display_name || profile.username}
            addedCount={addedCount}
          />
        ) : (
          // Los pasos 1–3 se enchufan en las tareas 7–9.
          <p className="text-sm text-muted-foreground">
            {`paso ${step} de ${total}`}
          </p>
        )}
      </div>
    </div>
  );
}

async function countPlanned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("passes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "planned");
  return count ?? 0;
}
```

- [ ] **Step 5: Comprobar en navegador**

Con `onboarded_at` a null para el usuario de pruebas (Task 1 Step 4), levantar `npm run dev` y visitar `/onboarding`. Debe verse el marcador de paso. Con `?paso=fin` debe verse la bienvenida; pulsar «Entrar a Biblioshare» debe llevar a `/` y, al volver a `/onboarding`, **redirigir a `/`** (el gate).

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/page.tsx src/app/onboarding/stepper.tsx src/app/onboarding/welcome.tsx messages/es.json
git commit -m "feat(onboarding): shell del asistente con gate, ?paso= y bienvenida"
```

---

## Task 7: Paso 1 — intereses

**Files:**
- Create: `src/app/onboarding/step-interests.tsx`
- Modify: `src/app/onboarding/page.tsx` (enchufar el paso 1)

**Interfaces:**
- Consumes: `saveInterests` (Task 5), `Stepper` (Task 6), `MEDIA_ACCENT` de `@/lib/catalog/media-accent`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { saveInterests } from "@/lib/onboarding/actions";

const TYPES: ItemType[] = ["book", "movie", "series"];

export function StepInterests({ nextHref }: { nextHref: string }) {
  const t = useTranslations("onboarding.wizard");
  const tTypes = useTranslations("search.types");
  const router = useRouter();
  const [chosen, setChosen] = useState<ItemType[]>([]);
  const [pending, start] = useTransition();

  function toggle(type: ItemType) {
    setChosen((prev) =>
      prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type],
    );
  }

  function submit() {
    start(async () => {
      await saveInterests(chosen);
      router.push(nextHref);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[22px] font-semibold">{t("interestsTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("interestsHint")}</p>
      </div>

      <div className="flex flex-col gap-2">
        {TYPES.map((type) => {
          const on = chosen.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggle(type)}
              aria-pressed={on}
              className={`flex items-center gap-3 rounded-card border p-4 text-left transition-colors ${
                on
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <span
                aria-hidden
                className={`h-[9px] w-[9px] shrink-0 rounded-full ${MEDIA_ACCENT[type].bg}`}
              />
              <span className="text-[15px] font-semibold">{tTypes(type)}</span>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={submit}
        disabled={chosen.length === 0 || pending}
        className="w-full justify-center"
      >
        {t("continue")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Enchufarlo en `page.tsx`**

Sustituir el marcador `<p className="text-sm text-muted-foreground">{`paso ${step} de ${total}`}</p>` por:

```tsx
        ) : (
          <div className="flex flex-col gap-5">
            <Stepper current={step} total={total} skipHref={hrefNext} />
            {step === 1 && <StepInterests nextHref={hrefNext} />}
          </div>
        )}
```

Y **antes del `return`**, calcular el destino UNA vez con `nextStep`, en vez de repetir la cadena de pasos en cada `href`:

```tsx
  // El "siguiente" sale de nextStep, que ya sabe que del 2 se salta al final
  // cuando el paso 3 está omitido. Escribir el href a mano en cada paso
  // duplicaría esa regla en tres sitios y se desincronizaría al tocarla.
  const hrefNext = `/onboarding?paso=${nextStep(step, showsPeople)}`;
```

Añadir `nextStep` al import de `@/lib/onboarding/steps`, y los imports de `Stepper` y `StepInterests`.

Nota: «Saltar» y «Continuar» van al **mismo sitio**; se diferencian solo en que Continuar guarda antes.

- [ ] **Step 3: Comprobar en navegador**

`/onboarding` muestra las 3 tarjetas; «Continuar» está deshabilitado hasta elegir una; al continuar, la URL pasa a `?paso=2`. Verificar en BD:

```sql
select interests from public.profiles where user_id = '<uuid>';
-- Espera: p. ej. {book,series}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/step-interests.tsx src/app/onboarding/page.tsx
git commit -m "feat(onboarding): paso 1 de intereses con dots por tipo"
```

---

## Task 8: Paso 2 — títulos

Implementa **D3**: rejilla del catálogo, no buscador. Cero fricción a cambio de sugerencias poco representativas mientras el catálogo sea pequeño — mitigado por el filtro de portada+año de la tarea 3.

**Files:**
- Create: `src/app/onboarding/step-titles.tsx`
- Modify: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `getSuggestions` (Task 4), `toggleTitle` (Task 5), `SuggestionCandidate` (Task 3).

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { SuggestionCandidate } from "@/lib/onboarding/rank-suggestions";
import { toggleTitle } from "@/lib/onboarding/actions";

export function StepTitles({
  suggestions,
  nextHref,
}: {
  suggestions: SuggestionCandidate[];
  nextHref: string;
}) {
  const t = useTranslations("onboarding.wizard");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function toggle(s: SuggestionCandidate) {
    const key = `${s.itemType}:${s.itemId}`;
    const willSelect = !selected.includes(key);
    setSelected((prev) =>
      willSelect ? [...prev, key] : prev.filter((k) => k !== key),
    );
    start(async () => {
      await toggleTitle(s.itemType, s.itemId, willSelect);
    });
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-serif text-[22px] font-semibold">{t("titlesTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("titlesEmpty")}</p>
        <Button type="button" onClick={() => router.push(nextHref)} className="w-full justify-center">
          {t("continue")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[22px] font-semibold">{t("titlesTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("titlesHint")}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {suggestions.map((s) => {
          const key = `${s.itemType}:${s.itemId}`;
          const on = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={on}
              className="flex flex-col gap-1.5 text-left"
            >
              <div
                className={`relative aspect-2/3 w-full overflow-hidden rounded-card border-[1.5px] bg-surface-muted transition-opacity ${
                  on ? "border-accent" : MEDIA_ACCENT[s.itemType].borderSoft
                } ${on ? "" : "opacity-70"}`}
              >
                {s.coverUrl && (
                  <Image
                    src={s.coverUrl}
                    alt={s.title}
                    fill
                    sizes="(max-width: 640px) 30vw, 150px"
                    className="object-cover"
                  />
                )}
                {on && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                    ✓
                  </span>
                )}
              </div>
              <span className="line-clamp-2 font-serif text-xs font-semibold">{s.title}</span>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        onClick={() => router.push(nextHref)}
        disabled={pending}
        className="w-full justify-center"
      >
        {selected.length > 0
          ? t("continueWithCount", { count: selected.length })
          : t("continue")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Enchufarlo en `page.tsx`**

Antes del `return`, cargar las sugerencias solo cuando toca (evita la consulta en los demás pasos):

```tsx
  const suggestions =
    step === 2
      ? await getSuggestions(
          supabase,
          (profile.interests ?? []) as ItemType[],
        )
      : [];
```

Y dentro del bloque de pasos:

```tsx
            {step === 2 && (
              <StepTitles suggestions={suggestions} nextHref={hrefNext} />
            )}
```

Añadir `interests` al `select` del perfil y los imports de `getSuggestions`, `StepTitles` e `ItemType`.

- [ ] **Step 3: Comprobar en navegador**

La rejilla muestra portadas del tipo elegido; tocar una la marca y el botón pasa a «Continuar · 1 añadidos». Verificar:

```sql
select count(*) from public.passes where user_id='<uuid>' and status='planned';
```

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/step-titles.tsx src/app/onboarding/page.tsx
git commit -m "feat(onboarding): paso 2 con rejilla de sugerencias del catalogo"
```

---

## Task 9: Paso 3 — gente y clubes

**Files:**
- Create: `src/app/onboarding/step-people.tsx`
- Modify: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `getSocialSuggestions` (Task 4), `followUser` de `@/lib/social/actions`, `requestJoinClub` de `@/lib/clubs/join-requests`.

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/social/user-avatar";
import { followUser } from "@/lib/social/actions";
import { requestJoinClub } from "@/lib/clubs/join-requests";
import type {
  ClubSuggestion,
  PersonSuggestion,
} from "@/lib/onboarding/get-social-suggestions";

export function StepPeople({
  profiles,
  clubs,
  nextHref,
}: {
  profiles: PersonSuggestion[];
  clubs: ClubSuggestion[];
  nextHref: string;
}) {
  const t = useTranslations("onboarding.wizard");
  const router = useRouter();
  const [done, setDone] = useState<string[]>([]);
  const [, start] = useTransition();

  function act(key: string, fn: () => Promise<void>) {
    setDone((prev) => [...prev, key]);
    start(async () => {
      await fn();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[22px] font-semibold">{t("peopleTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("peopleHint")}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {profiles.map((p) => {
          const key = `u:${p.userId}`;
          const name = p.displayName || p.username;
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <UserAvatar name={name} avatarUrl={p.avatarUrl} size={36} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-sm font-semibold">{name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  @{p.username}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={done.includes(key)}
                onClick={() => act(key, () => followUser(p.userId))}
                className="ml-auto shrink-0"
              >
                {t("peopleFollow")}
              </Button>
            </li>
          );
        })}

        {clubs.map((c) => {
          const key = `c:${c.id}`;
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-sm font-semibold">{c.name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {c.memberCount}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={done.includes(key)}
                onClick={() => act(key, () => requestJoinClub(c.id))}
                className="ml-auto shrink-0"
              >
                {t("peopleJoin")}
              </Button>
            </li>
          );
        })}
      </ul>

      <Button type="button" onClick={() => router.push(nextHref)} className="w-full justify-center">
        {t("finish")}
      </Button>
    </div>
  );
}
```

Si `Button` no acepta `variant="secondary"`, usar la variante que exista en `src/components/ui/button.tsx` — comprobarlo antes de escribir.

- [ ] **Step 2: Enchufarlo en `page.tsx`**

```tsx
  const social =
    step === 3
      ? await getSocialSuggestions(supabase, user.id)
      : { profiles: [], clubs: [] };
```

```tsx
            {step === 3 && (
              <StepPeople
                profiles={social.profiles}
                clubs={social.clubs}
                nextHref={hrefNext}
              />
            )}
```

- [ ] **Step 3: Comprobar los dos caminos**

Con menos de 3 perfiles públicos y 0 clubes, `/onboarding?paso=3` debe **redirigir a la bienvenida** y el stepper decir «Paso 2 de 2». Creando 3 perfiles públicos en dev, el paso debe aparecer y el stepper decir «de 3».

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/step-people.tsx src/app/onboarding/page.tsx
git commit -m "feat(onboarding): paso 3 de gente y clubes, condicional"
```

---

## Task 10: Consumir los intereses

**Files:**
- Modify: `src/app/buscar/page.tsx`
- Modify: `src/app/coleccion/page.tsx`

**Interfaces:**
- Consumes: `profiles.interests` (Task 1).

Esto es lo que evita que el paso 1 sea decorativo (D1). **Ambas lecturas son opcionales**: con `interests` null, el comportamiento es exactamente el de hoy.

- [ ] **Step 1: Buscar — tipo por defecto**

En `src/app/buscar/page.tsx`, donde hoy se resuelve `itemType`:

```tsx
  const itemType: ItemType = VALID_TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : "book";
```

Sustituir por:

```tsx
  // Sin ?type= explícito, se abre en el primer tipo que declaró el usuario en
  // el onboarding. Sin intereses (todos los perfiles previos), sigue siendo
  // "book", que es el comportamiento de siempre.
  //
  // `getUser()` NO se vuelve a llamar: la página ya lo hace para resolver el
  // rol, así que se reutiliza ese resultado. Cada getUser() es un viaje a
  // Supabase, que aquí es remoto incluso en dev.
  const { data: prefs } = user
    ? await supabase
        .from("profiles")
        .select("interests")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const preferred = (prefs?.interests as ItemType[] | null)?.[0] ?? "book";

  const itemType: ItemType = VALID_TYPES.includes(params.type as ItemType)
    ? (params.type as ItemType)
    : preferred;
```

**Antes de escribirlo, comprobar cómo obtiene la página el usuario.** Hoy `src/app/buscar/page.tsx` llama a `getCurrentUserRole(supabase)` dentro de un `Promise.all`, pero **no** expone un `user`. Si no lo hay, sacarlo en ese mismo `Promise.all` con `supabase.auth.getUser()` y usarlo aquí — nunca añadir una llamada suelta más abajo. `/buscar` es una ruta pública: con visitante anónimo, `user` es null y el tipo por defecto sigue siendo `"book"`.

- [ ] **Step 2: Colección — filtro de tipo dentro de «Todo»**

⚠️ **No hay pestaña por tipo.** Colección v2 dejó las subpestañas en `colecciones | todo | sagas | colas` (`KNOWN_TABS` en `src/app/coleccion/collection-tabs.tsx`). Lo que se personaliza es el filtro `?type=` **dentro de «Todo»**, y la pestaña de entrada (`"colecciones"`) **no se toca**.

En `src/app/coleccion/page.tsx`, línea ~83, hoy:

```tsx
  const itemType: ItemType | undefined = VALID_TYPES.includes(
    params.type as ItemType,
  )
    ? (params.type as ItemType)
    : undefined;
```

Sustituir por:

```tsx
  // Con ?type= explícito manda la URL. Sin él, y SOLO si el usuario declaró
  // exactamente un interés en el onboarding, el filtro de «Todo» arranca ahí:
  // con dos o tres no hay un tipo "obvio" y forzar uno escondería la mitad de
  // su biblioteca sin que lo haya pedido.
  const { data: prefs } = await supabase
    .from("profiles")
    .select("interests")
    .eq("user_id", user.id)
    .maybeSingle();
  const interests = (prefs?.interests as ItemType[] | null) ?? [];
  const preferredType = interests.length === 1 ? interests[0] : undefined;

  const itemType: ItemType | undefined = VALID_TYPES.includes(
    params.type as ItemType,
  )
    ? (params.type as ItemType)
    : preferredType;
```

El `user` ya está resuelto más arriba en esa misma función (`redirect("/login")` si falta), así que no hace falta pedirlo otra vez.

- [ ] **Step 3: Verificar que no cambia nada para los perfiles existentes**

Run: `npx tsc --noEmit` y abrir `/buscar` y `/coleccion` con un usuario con `interests` null: deben comportarse igual que antes.

- [ ] **Step 4: Commit**

```bash
git add src/app/buscar/page.tsx src/app/coleccion/page.tsx
git commit -m "feat(onboarding): los intereses fijan el tipo por defecto en buscar y coleccion"
```

---

## Task 11: E2E

**Files:**
- Create: `e2e/onboarding.spec.ts`

- [ ] **Step 1: Escribir el spec**

```ts
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// El onboarding solo se ve con onboarded_at a null, así que cada test lo
// resetea por service-role y lo deja como estaba al terminar.
async function setOnboardedAt(value: string | null) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${await userId()}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ onboarded_at: value }),
    },
  );
}

let cached: string | null = null;
async function userId(): Promise<string> {
  if (cached) return cached;
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const body = (await res.json()) as { users: { id: string; email: string }[] };
  cached = body.users.find((u) => u.email === EMAIL)!.id;
  return cached;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

test.describe("onboarding", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(90_000);

  test.afterEach(async () => {
    await setOnboardedAt(new Date().toISOString());
  });

  test("recorrido completo: intereses, un título y bienvenida", async ({ page }) => {
    await setOnboardedAt(null);
    await login(page);
    await page.goto("/onboarding");

    await expect(page.getByText("¿Qué te gusta seguir?")).toBeVisible();
    await page.getByRole("button", { name: "Libros" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page).toHaveURL(/paso=2/);
    await expect(page.getByText("Añade algo para empezar")).toBeVisible();

    // Continuar hasta el final, con o sin selección.
    await page.getByRole("button", { name: /Continuar|Terminar/ }).click();
    await expect(page.getByText(/Todo listo/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Entrar a Biblioshare" }).click();
    await page.waitForURL("/");
  });

  test("el gate: una vez terminado ya no vuelve a salir", async ({ page }) => {
    await setOnboardedAt(new Date().toISOString());
    await login(page);
    await page.goto("/onboarding");
    await page.waitForURL("/");
  });

  test("un paso inválido cae al primero, sin 404", async ({ page }) => {
    await setOnboardedAt(null);
    await login(page);
    await page.goto("/onboarding?paso=99");
    await expect(page.getByText("¿Qué te gusta seguir?")).toBeVisible();
  });
});
```

- [ ] **Step 2: Ejecutar**

Run: `fnm use 22.23.1 && npx playwright test e2e/onboarding.spec.ts --reporter=list`
Expected: 3 passed.

- [ ] **Step 3: Comprobar que no hay regresión donde se tocó**

Run: `npx playwright test e2e/happy-path.spec.ts e2e/signup.spec.ts --reporter=list`
Expected: todo verde. **No correr la suite entera de una tacada** (`docs/TRAMPAS.md` §5).

- [ ] **Step 4: Commit**

```bash
git add e2e/onboarding.spec.ts
git commit -m "test(onboarding): e2e del recorrido, el gate y el paso invalido"
```

---

## Cierre

- [ ] `npx tsc --noEmit` limpio y `npm test` verde (los 17 tests nuevos de las tareas 2 y 3 incluidos).
- [ ] Comprobación en navegador a **400px y 940px**, **claro y oscuro**.
- [ ] Migración aplicada en **prod** y anexada a `supabase/schema-baseline.sql` **en el orden real de prod**.
- [ ] Actualizar el plan 07 (`docs/redesign/plan-07-transversal.md`) marcando §2.4 como hecho.
- [ ] Usar `superpowers:finishing-a-development-branch` para cerrar la rama.
