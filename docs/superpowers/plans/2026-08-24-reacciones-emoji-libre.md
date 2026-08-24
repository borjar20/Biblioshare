# Reacciones con cualquier emoji — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `reactions.kind` guarde el emoji literal y que el `ReactionBar` de toda la app ofrezca cualquier emoji del catálogo Unicode, estilo Teams (fila rápida de 6 + selector completo).

**Architecture:** el eje del cambio es pasar `ReactionsByKind` (registro de 4 claves fijas) a `ReactionsByEmoji` (mapa disperso `Record<string, ReactionTally>`), con un CHECK de forma en Postgres, un trigger de tope y una lista blanca en la acción de servidor contra un catálogo generado desde Unicode + CLDR-es. El catálogo pesado vive en un módulo aparte que **solo** importan el servidor y el selector cargado en diferido; el `ReactionBar` importa un módulo ligero de constantes.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Supabase/Postgres, `next-intl`, Vitest (entorno `node`), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-24-reacciones-emoji-libre-design.md`

## Global Constraints

- **Rama base**: `reacciones-emoji-libre`, ya creada desde `main` (`1dae4410`). No mezclar con `fase-c-estadisticas-nuevas`.
- **No hay runner de componentes en esta rama.** `vitest.config.ts` incluye solo `src/**/*.test.ts`, entorno `node`. **No añadir** `jsdom` ni `@testing-library/react`: esa dependencia la introduce otra rama sin mergear y duplicarla provoca conflicto de `package.json` + lockfile. Todo lo testeable se extrae a funciones puras; el DOM lo cubre Playwright.
- **Node 22** (`engines.node: >=22.11.0`). El shell por defecto de esta máquina trae Node 20 y rompe Vitest: usar `fnm use 22` antes de `npm test`.
- **Idioma de la UI**: solo existe `messages/es.json`. Todo texto visible sale de ahí vía `useTranslations("social")`.
- **Sin dependencias nuevas.** Ni de emojis, ni de fuzzy-search, ni de virtualización.
- **Migraciones**: dev primero (`mcp__supabase-dev__apply_migration`), prod después. El fichero vive en `supabase/migrations/` con numeración correlativa; la última es `20260875_...`, así que esta es `20260876_reactions_emoji_libre.sql`.
- **Tope**: `MAX_REACTIONS_PER_TARGET = 6` emojis distintos por persona y target. El número vive en `src/lib/social/reaction-constants.ts` y se repite en el trigger SQL; si cambia, cambian los dos.
- **Fila rápida** (orden exacto, no reordenar): `❤️ 📖 😱 🔥 😂 👏`.
- **Mapa de migración** (exacto): `like→❤️`, `read→📖`, `shock→😱`, `fire→🔥`.
- No usar `useEffect` para estado derivado ni para cerrar popovers: la regla de lint `set-state-in-effect` del repo lo prohíbe y ya forzó el backdrop actual.

## Mapa de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `scripts/build-emoji-catalog.mjs` | Regenera el catálogo desde Unicode + CLDR. Se ejecuta a mano, no en build. |
| `src/lib/social/emoji-catalog.data.ts` | Catálogo generado (~1.900 entradas) como `.ts` con tipo **anotado**, no como `.json`: importar un JSON de ese tamaño obliga a TypeScript a inferir el tipo literal de las 1.900 entradas, y con la anotación explícita solo lo comprueba. Commiteado, no se edita a mano. |
| `src/lib/social/emoji-catalog.ts` | **Módulo pesado**: importa los datos. Búsqueda, nombres, grupos, `isAllowedEmoji`. Solo lo importan el servidor y el selector diferido. |
| `src/lib/social/emoji-catalog.test.ts` | Integridad del catálogo + búsqueda + lista blanca. |
| `src/lib/social/reaction-constants.ts` | **Módulo ligero**: fila rápida, sus nombres, tope. Lo importa el `ReactionBar`. Cero datos del catálogo. |
| `src/lib/social/reaction-display.ts` | Funciones puras de pintado: orden, resumen top-3, tope alcanzado. |
| `src/lib/social/reaction-display.test.ts` | Tests de lo anterior. |
| `src/components/social/emoji-picker.tsx` | Selector completo (buscador + categorías + rejilla). Cargado con `next/dynamic`. |
| `supabase/migrations/20260876_reactions_emoji_libre.sql` | Dedup + UPDATE + CHECK nuevo + trigger de tope. |
| `e2e/reacciones-emoji.spec.ts` | E2E del flujo completo. |

**Se modifican:**

| Fichero | Cambio |
|---|---|
| `src/lib/social/interactions.ts` | Tipos `ReactionsByEmoji`, `emptyReactions() → {}`, `tallyOf`, acumulación dinámica, `.order("created_at")` en las **dos** consultas de reacciones. |
| `src/lib/social/interaction-optimistic.ts` | `kind` → `emoji`; `toggleEmoji` borra la clave al llegar a 0; `derive` sobre `Object.values`. |
| `src/lib/social/interaction-actions.ts` | `toggleReaction` valida contra el catálogo y traduce el error del trigger. |
| `src/components/social/reaction-bar.tsx` | Reescritura: top-3 colapsado, fila rápida, «+», tope visible, Escape y foco. |
| `src/components/social/reaction-bar.test.ts` | Se **borra** (su contenido vive ahora en `reaction-display.test.ts`). |
| `src/lib/social/interaction-actions.test.ts` | `"like"` → `"❤️"`; test nuevo de rechazo. |
| `src/lib/social/interactions.test.ts` | `emptyReactions()` ahora es `{}`. |
| `src/lib/social/interaction-optimistic.test.ts` | Fixtures con mapa disperso. |
| `src/components/social/post-thread.tsx`, `review-interactions.tsx`, `src/components/clubs/activity-chat-bubbles.tsx` | Rename `kind` → `emoji` en el dispatch. |
| `src/lib/social/feed.ts`, `get-community.ts`, `posts.ts`, `get-episode-reviews.ts`, `group-feed-entries.test.ts` | Solo rename del tipo importado. |
| `messages/es.json` | Claves del selector; se retira `social.reaction.*`. |
| `docs/requirements/data-model.md`, `docs/requirements/decisiones.md` | Doc canónica. |

---

### Task 1: Catálogo de emojis (generador, datos y módulo de acceso)

**Files:**
- Create: `scripts/build-emoji-catalog.mjs`
- Create: `src/lib/social/emoji-catalog.data.ts` (generado por el script)
- Create: `src/lib/social/emoji-catalog.ts`
- Create: `src/lib/social/reaction-constants.ts`
- Test: `src/lib/social/emoji-catalog.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `type EmojiEntry = { e: string; n: string; k: string[]; g: number }`
  - `EMOJI_GROUPS: readonly { id: number; label: string }[]`
  - `EMOJI_CATALOG: EmojiEntry[]`
  - `isAllowedEmoji(value: unknown): value is string`
  - `emojiName(emoji: string): string`
  - `emojisByGroup(groupId: number): EmojiEntry[]`
  - `searchEmojis(query: string, limit?: number): EmojiEntry[]`
  - Y en `reaction-constants.ts`: `QUICK_REACTIONS: readonly string[]`, `QUICK_REACTION_NAMES: Record<string, string>`, `MAX_REACTIONS_PER_TARGET: number`.

- [ ] **Step 1: Escribir el generador**

Crea `scripts/build-emoji-catalog.mjs`:

```js
// Genera src/lib/social/emoji-catalog.data.ts desde fuentes Unicode oficiales.
// NO es un paso de build: se ejecuta a mano cuando Unicode saca versión, y el
// fichero resultante se commitea. Así ni CI ni `next build` dependen de la red.
//
// Sale como .ts con el tipo ANOTADO y no como .json a propósito: importando un
// JSON de 1.900 entradas, TypeScript infiere el tipo literal de todo el fichero
// en cada typecheck. Con `: EmojiEntry[]` delante solo lo comprueba.
//
//   node scripts/build-emoji-catalog.mjs
//
// Fuentes:
//   - emoji-test.txt  -> qué emojis existen, grupo, y cuáles son fully-qualified.
//   - CLDR annotations es -> nombre y sinónimos en español.
import { writeFileSync } from "node:fs";

const EMOJI_TEST =
  "https://unicode.org/Public/emoji/16.0/emoji-test.txt";
const CLDR_ES =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/es/annotations.json";
const CLDR_ES_DERIVED =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/es/annotations.json";

// El grupo "Component" (tonos de piel sueltos, pelo) no son emojis que nadie
// quiera poner como reacción. El resto va en este orden, que es el de la tira
// de categorías del selector.
const GROUPS = [
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Travel & Places",
  "Activities",
  "Objects",
  "Symbols",
  "Flags",
];

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const [testFile, cldr, cldrDerived] = await Promise.all([
  getText(EMOJI_TEST),
  getJson(CLDR_ES),
  getJson(CLDR_ES_DERIVED),
]);

const notes = {
  ...cldr.annotations.annotations,
  ...cldrDerived.annotationsDerived.annotations,
};

// Tonos de piel: 1F3FB..1F3FF. Se lista el emoji base y se descartan variantes.
const SKIN_TONE = /1F3F[B-F]/;

const out = [];
const seen = new Set();
let group = null;

for (const line of testFile.split(/\r?\n/)) {
  const groupLine = line.match(/^# group: (.+)$/);
  if (groupLine) {
    group = groupLine[1].trim();
    continue;
  }
  // 1F600 ; fully-qualified # 😀 E1.0 grinning face
  const m = line.match(/^([0-9A-F ]+);\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/);
  if (!m) continue;
  const [, codepoints, emoji, englishName] = m;
  const g = GROUPS.indexOf(group);
  if (g === -1) continue; // Component u orden desconocido
  if (SKIN_TONE.test(codepoints)) continue;
  if (seen.has(emoji)) continue;
  seen.add(emoji);

  const note = notes[emoji];
  const name = (note?.tts?.[0] ?? englishName).toLowerCase();
  const keywords = (note?.default ?? [])
    .map((k) => k.toLowerCase())
    .filter((k) => k !== name)
    .slice(0, 6);

  out.push({ e: emoji, n: name, k: keywords, g });
}

const file = `// GENERADO por scripts/build-emoji-catalog.mjs — no editar a mano.
// Regenerar: node scripts/build-emoji-catalog.mjs
import type { EmojiEntry } from "./emoji-catalog";

export const EMOJI_CATALOG_DATA: EmojiEntry[] = ${JSON.stringify(out)};
`;

writeFileSync(
  new URL("../src/lib/social/emoji-catalog.data.ts", import.meta.url),
  file,
  "utf8",
);
console.log(`emoji-catalog.data.ts: ${out.length} emojis en ${GROUPS.length} grupos`);
```

- [ ] **Step 2: Ejecutar el generador**

```bash
node scripts/build-emoji-catalog.mjs
```

Esperado: una línea del tipo `emoji-catalog.data.ts: 1893 emojis en 9 grupos`. Si el número baja de 1.500, la fuente cambió de formato — no sigas, arregla el parser.

- [ ] **Step 3: Escribir el módulo ligero de constantes**

Crea `src/lib/social/reaction-constants.ts`:

```ts
// Constantes de reacciones SIN el catálogo. Existe separado de
// emoji-catalog.ts a propósito: ese arrastra ~95 KB de datos, y el
// ReactionBar se pinta en el feed entero. Si el ReactionBar importara el
// catálogo, esos datos viajarían en el bundle principal — justo lo que la carga
// diferida del selector intenta evitar.

/** Fila rápida, en orden. Los cuatro primeros son la paleta histórica migrada. */
export const QUICK_REACTIONS = ["❤️", "📖", "😱", "🔥", "😂", "👏"] as const;

/**
 * Nombres de la fila rápida, copiados del catálogo. Se repiten aquí para no
 * arrastrar el catálogo al bundle; `emoji-catalog.test.ts` verifica que no se
 * desincronizan.
 */
export const QUICK_REACTION_NAMES: Record<string, string> = {
  "❤️": "corazón rojo",
  "📖": "libro abierto",
  "😱": "cara gritando de miedo",
  "🔥": "fuego",
  "😂": "cara llorando de risa",
  "👏": "manos aplaudiendo",
};

/** Emojis distintos que una persona puede poner sobre el mismo target. */
export const MAX_REACTIONS_PER_TARGET = 6;
```

- [ ] **Step 4: Escribir el módulo del catálogo**

Crea `src/lib/social/emoji-catalog.ts`:

```ts
import { EMOJI_CATALOG_DATA } from "./emoji-catalog.data";

// Catálogo de emojis generado por scripts/build-emoji-catalog.mjs. Arrastra
// ~95 KB de datos: solo deben importarlo el servidor y el selector cargado en
// diferido. Para el ReactionBar está reaction-constants.ts.
//
// El fichero de datos importa `EmojiEntry` de aquí y aquí se importan sus
// datos: el ciclo es solo de TIPOS (`import type`), que se borra al compilar,
// así que no hay ciclo en runtime.

export type EmojiEntry = {
  /** El emoji. */
  e: string;
  /** Nombre en español, en minúsculas. */
  n: string;
  /** Sinónimos de búsqueda. */
  k: string[];
  /** Índice de grupo, ver EMOJI_GROUPS. */
  g: number;
};

export const EMOJI_GROUPS: readonly { id: number; label: string }[] = [
  { id: 0, label: "Caras" },
  { id: 1, label: "Personas" },
  { id: 2, label: "Animales" },
  { id: 3, label: "Comida" },
  { id: 4, label: "Viajes" },
  { id: 5, label: "Ocio" },
  { id: 6, label: "Objetos" },
  { id: 7, label: "Símbolos" },
  { id: 8, label: "Banderas" },
];

export const EMOJI_CATALOG = EMOJI_CATALOG_DATA;

const BY_CHAR = new Map(EMOJI_CATALOG.map((entry) => [entry.e, entry]));

/**
 * Lista blanca. Es la puerta de entrada de `toggleReaction`: si algo no está
 * aquí, no se guarda. Más estricto que un regex de emoji, y garantiza que todo
 * lo almacenado se puede pintar Y nombrar.
 */
export function isAllowedEmoji(value: unknown): value is string {
  return typeof value === "string" && BY_CHAR.has(value);
}

export function emojiName(emoji: string): string {
  return BY_CHAR.get(emoji)?.n ?? emoji;
}

export function emojisByGroup(groupId: number): EmojiEntry[] {
  return EMOJI_CATALOG.filter((entry) => entry.g === groupId);
}

/** Minúsculas y sin tildes, para que "corazon" encuentre "corazón". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Búsqueda por prefijo sobre nombre y sinónimos. Sin fuzzy: con nombres cortos
 * y un catálogo de 1.900 entradas, el prefijo acierta y no sorprende.
 * Puntuación: nombre exacto (0) < nombre por prefijo (1) < sinónimo (2).
 */
export function searchEmojis(query: string, limit = 100): EmojiEntry[] {
  const q = fold(query);
  if (!q) return [];
  const scored: Array<{ entry: EmojiEntry; score: number }> = [];
  for (const entry of EMOJI_CATALOG) {
    const name = fold(entry.n);
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (entry.k.some((word) => fold(word).startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    if (score >= 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((item) => item.entry);
}
```

- [ ] **Step 5: Escribir el test**

Crea `src/lib/social/emoji-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMOJI_CATALOG,
  EMOJI_GROUPS,
  emojiName,
  emojisByGroup,
  isAllowedEmoji,
  searchEmojis,
} from "./emoji-catalog";
import { QUICK_REACTIONS, QUICK_REACTION_NAMES } from "./reaction-constants";

describe("catálogo de emojis", () => {
  it("tiene volumen razonable y ninguna entrada rota", () => {
    expect(EMOJI_CATALOG.length).toBeGreaterThan(1500);
    for (const entry of EMOJI_CATALOG) {
      expect(entry.e.length).toBeGreaterThan(0);
      expect(entry.n.length).toBeGreaterThan(0);
      expect(entry.g).toBeGreaterThanOrEqual(0);
      expect(entry.g).toBeLessThan(EMOJI_GROUPS.length);
    }
  });

  it("no repite emojis", () => {
    const chars = new Set(EMOJI_CATALOG.map((entry) => entry.e));
    expect(chars.size).toBe(EMOJI_CATALOG.length);
  });

  it("todos los grupos tienen contenido", () => {
    for (const group of EMOJI_GROUPS) {
      expect(emojisByGroup(group.id).length).toBeGreaterThan(0);
    }
  });

  // Esta es la prueba que detecta una regeneración rota: si Unicode reorganiza
  // grupos o CLDR renombra, lo que se cae primero es la fila rápida.
  it("la fila rápida y los 4 emojis migrados existen en el catálogo", () => {
    for (const emoji of QUICK_REACTIONS) expect(isAllowedEmoji(emoji)).toBe(true);
    for (const emoji of ["❤️", "📖", "😱", "🔥"]) expect(isAllowedEmoji(emoji)).toBe(true);
  });

  it("los nombres duplicados en reaction-constants siguen coincidiendo", () => {
    for (const emoji of QUICK_REACTIONS) {
      expect(QUICK_REACTION_NAMES[emoji]).toBe(emojiName(emoji));
    }
  });
});

describe("isAllowedEmoji", () => {
  it("acepta emojis del catálogo, incluidos secuencias ZWJ y keycaps", () => {
    expect(isAllowedEmoji("❤️")).toBe(true);
    expect(isAllowedEmoji("👨‍👩‍👧")).toBe(true);
    expect(isAllowedEmoji("1️⃣")).toBe(true);
  });

  it("rechaza texto, vacío, dobles y cualquier cosa que no sea string", () => {
    expect(isAllowedEmoji("like")).toBe(false);
    expect(isAllowedEmoji("a")).toBe(false);
    expect(isAllowedEmoji("")).toBe(false);
    expect(isAllowedEmoji("🔥🔥")).toBe(false);
    expect(isAllowedEmoji("<script>")).toBe(false);
    expect(isAllowedEmoji(null)).toBe(false);
    expect(isAllowedEmoji(42)).toBe(false);
  });
});

describe("searchEmojis", () => {
  it("encuentra por nombre exacto y lo pone primero", () => {
    expect(searchEmojis("fuego")[0].e).toBe("🔥");
  });

  it("ignora tildes y mayúsculas", () => {
    const sinTilde = searchEmojis("corazon").map((entry) => entry.e);
    expect(sinTilde).toContain("❤️");
    expect(searchEmojis("FUEGO")[0].e).toBe("🔥");
  });

  it("devuelve vacío con consulta vacía y respeta el límite", () => {
    expect(searchEmojis("")).toEqual([]);
    expect(searchEmojis("   ")).toEqual([]);
    expect(searchEmojis("a", 10).length).toBeLessThanOrEqual(10);
    expect(searchEmojis("a").length).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 6: Ejecutar los tests**

```bash
fnm use 22 && npx vitest run src/lib/social/emoji-catalog.test.ts
```

Esperado: PASS. Si falla `los nombres duplicados en reaction-constants siguen coincidiendo`, copia el valor real de `emojiName(...)` a `QUICK_REACTION_NAMES` — CLDR manda, la constante es la copia.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-emoji-catalog.mjs src/lib/social/emoji-catalog.data.ts src/lib/social/emoji-catalog.ts src/lib/social/reaction-constants.ts src/lib/social/emoji-catalog.test.ts
git commit -m "feat(social): catalogo de emojis generado desde Unicode y CLDR-es"
```

---

### Task 2: Migración — emoji literal en `reactions.kind`

**Files:**
- Create: `supabase/migrations/20260876_reactions_emoji_libre.sql`

**Interfaces:**
- Consumes: nada del código TypeScript.
- Produces: `reactions.kind` con emoji literal; constraint `reactions_kind_emoji`; función `public.enforce_reaction_cap()` y trigger `reactions_cap_before_insert`. El error que la app debe reconocer es el mensaje `reaction_cap_reached`.

- [ ] **Step 1: Escribir la migración**

Crea `supabase/migrations/20260876_reactions_emoji_libre.sql`:

```sql
-- Reacciones con cualquier emoji (spec 2026-08-24-reacciones-emoji-libre).
-- `reactions.kind` deja de ser una paleta cerrada de cuatro slugs y pasa a
-- guardar el emoji literal. El único (interaction_target_id, user_id, kind) NO
-- se toca: se sigue pudiendo poner varias reacciones distintas por persona.

-- 1) Tirar el CHECK viejo LO PRIMERO. `reactions_kind_valid` solo admite los
--    cuatro slugs, así que si sigue vivo, el UPDATE del paso 3 se viola a sí
--    mismo: `ERROR 23514: violates check constraint "reactions_kind_valid"`.
--    El CHECK nuevo se añade DESPUÉS de convertir los datos, por lo mismo al
--    revés: puesto antes, rechazaría las filas que aún son slugs.
alter table public.reactions drop constraint if exists reactions_kind_valid;
alter table public.reactions drop constraint if exists reactions_kind_like;

-- 2) Dedup ANTES del update. Si alguien ya tiene 'fire' y '🔥' sobre el mismo
--    target, el UPDATE reventaría el único. Gana la fila que ya es emoji.
delete from public.reactions r
using public.reactions keep
where r.kind in ('like', 'read', 'shock', 'fire')
  and keep.interaction_target_id = r.interaction_target_id
  and keep.user_id = r.user_id
  and keep.kind = case r.kind
    when 'like' then '❤️'
    when 'read' then '📖'
    when 'shock' then '😱'
    when 'fire' then '🔥'
  end;

-- 3) Slugs -> emoji.
update public.reactions
set kind = case kind
  when 'like' then '❤️'
  when 'read' then '📖'
  when 'shock' then '😱'
  when 'fire' then '🔥'
end
where kind in ('like', 'read', 'shock', 'fire');

-- 4) CHECK de FORMA, no lista blanca: la lista blanca real es el catálogo, en
--    la acción de servidor. Esto es la red de debajo. Va AQUÍ, con los datos ya
--    convertidos: antes del UPDATE rechazaría las filas que aún son slugs.
--
--    Ojo con la formulación ingenua `kind !~ '[[:alnum:][:space:][:punct:]]'`:
--    parece equivalente y tumba los keycap ('1️⃣' es el dígito ASCII 1 + VS16 +
--    U+20E3), que son emojis legítimos. Por eso la condición es "contiene algo
--    NO ASCII", no "no contiene nada alfanumérico".
alter table public.reactions add constraint reactions_kind_emoji check (
  char_length(kind) between 1 and 16   -- 👩‍❤️‍💋‍👨 y 🏴󠁧󠁢󠁥󠁮󠁧󠁿 gastan 7-8; 16 deja aire
  and kind ~ '[^[:ascii:]]'
  and kind !~ '[[:space:]]'
);

-- 5) Tope de 6 emojis distintos por persona y target. Sin esto, emoji libre +
--    varias reacciones por persona deja que una sola cuelgue 40 píldoras de un
--    mensaje. La acción de servidor valida también, pero el trigger es el que
--    no se puede saltar.
create or replace function public.enforce_reaction_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.reactions
    where interaction_target_id = new.interaction_target_id
      and user_id = new.user_id
  ) >= 6 then
    raise exception 'reaction_cap_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists reactions_cap_before_insert on public.reactions;
create trigger reactions_cap_before_insert
  before insert on public.reactions
  for each row execute function public.enforce_reaction_cap();

comment on constraint reactions_kind_emoji on public.reactions is
  'kind guarda el emoji literal. Lista blanca real: el catálogo de src/lib/social/emoji-catalog.data.ts, validado en la acción de servidor.';
```

- [ ] **Step 2: Sembrar el caso de colisión en dev**

El dedup es la parte que puede romper datos, así que se prueba con la colisión puesta a mano. Con `mcp__supabase-dev__execute_sql`:

```sql
-- Un target cualquiera que exista, y un user cualquiera que exista.
with t as (select id from public.interaction_targets limit 1),
     u as (select user_id from public.reactions limit 1)
insert into public.reactions (interaction_target_id, user_id, kind)
select t.id, u.user_id, k
from t, u, unnest(array['fire', '🔥']) as k
on conflict do nothing
returning interaction_target_id, user_id, kind;
```

Esperado: dos filas devueltas (o una, si alguna ya existía). Anota el par `(interaction_target_id, user_id)` — se comprueba después.

- [ ] **Step 3: Aplicar la migración en dev**

Usa `mcp__supabase-dev__apply_migration` con `name: "20260876_reactions_emoji_libre"` y el contenido del fichero.

Esperado: sin error. Si falla en el paso 3 con `check constraint is violated by some row`, hay un `kind` fuera del mapa: lístalo con `select distinct kind from public.reactions` antes de tocar nada.

- [ ] **Step 4: Verificar contra los objetos reales, no el ledger**

Con `mcp__supabase-dev__execute_sql`:

```sql
select
  (select count(*) from public.reactions where kind in ('like','read','shock','fire')) as slugs_restantes,
  (select count(*) from public.reactions where kind = '🔥') as fuegos,
  (select count(*) from pg_constraint where conname = 'reactions_kind_emoji') as check_creado,
  (select count(*) from pg_trigger where tgname = 'reactions_cap_before_insert') as trigger_creado;
```

Esperado: `slugs_restantes = 0`, `check_creado = 1`, `trigger_creado = 1`, y el par sembrado en el paso 2 con **una sola** fila `🔥`:

```sql
select interaction_target_id, user_id, count(*)
from public.reactions
where kind = '🔥'
group by 1, 2
having count(*) > 1;
```

Esperado: **0 filas**. Si sale alguna, el dedup no corrió antes del UPDATE.

- [ ] **Step 5: Verificar el CHECK con los casos que importan**

```sql
-- Debe FALLAR (texto):
insert into public.reactions (interaction_target_id, user_id, kind)
select interaction_target_id, user_id, 'like' from public.reactions limit 1;
```
Esperado: error `reactions_kind_emoji`.

```sql
-- Debe PASAR (keycap: dígito ASCII + VS16 + U+20E3):
insert into public.reactions (interaction_target_id, user_id, kind)
select interaction_target_id, user_id, '1️⃣' from public.reactions limit 1;
```
Esperado: inserta. Si falla, el CHECK está mal escrito — revisa que sea `kind ~ '[^[:ascii:]]'` y no la variante ingenua. Borra la fila de prueba después:

```sql
delete from public.reactions where kind = '1️⃣';
```

- [ ] **Step 6: Verificar el tope**

```sql
-- Sobre un (target,user) SIN reacciones previas, mete 7 emojis distintos: el
-- séptimo debe fallar.
--
-- Ojo con la forma ingenua `select ..., unnest(array[...]) from reactions limit 1`:
-- el LIMIT 1 recorta el resultado FINAL, ya expandido, no la fila origen — así
-- que inserta UNA fila y no llega a tocar el trigger, dando un falso verde.
-- Por eso la expansión va como `cross join`, con el origen limitado aparte.
with origen as (
  select interaction_target_id, user_id
  from public.reactions
  group by 1, 2
  having count(*) = 0
  limit 1
)
insert into public.reactions (interaction_target_id, user_id, kind)
select origen.interaction_target_id, origen.user_id, emoji
from origen
cross join unnest(array['❤️','📖','😱','🔥','😂','👏','🎉']) as emoji;
```
Esperado: error `reaction_cap_reached`. Si el `with` no devuelve nada porque en dev no hay
un par sin reacciones, coge un `interaction_target_id` cualquiera y un `user_id` cualquiera
que no tengan filas juntos, y compruébalo antes con un `select count(*)`.

Limpia lo insertado por la prueba antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260876_reactions_emoji_libre.sql
git commit -m "feat(social): reactions.kind guarda el emoji literal, con tope de 6"
```

---

### Task 3: Tipos de lectura — `ReactionsByEmoji`

**Files:**
- Modify: `src/lib/social/interactions.ts`
- Modify: `src/lib/social/interactions.test.ts`
- Modify: `src/lib/social/feed.ts`, `src/lib/community/get-community.ts`, `src/lib/clubs/posts.ts`, `src/lib/series/get-episode-reviews.ts` (solo el nombre del tipo)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `type ReactionEmoji = string`
  - `type ReactionTally = { count: number; viewerReacted: boolean }` (sin cambios)
  - `type ReactionsByEmoji = Record<ReactionEmoji, ReactionTally>`
  - `emptyReactions(): ReactionsByEmoji` → `{}`
  - `tallyOf(reactions: ReactionsByEmoji, emoji: string): ReactionTally`
  - `totalReactions(reactions: ReactionsByEmoji): number`
  - `anyViewerReacted(reactions: ReactionsByEmoji): boolean`
  - `ReactionKind`, `REACTION_KINDS` y `ReactionsByKind` **dejan de existir**.

- [ ] **Step 1: Escribir el test que falla**

Sustituye por completo `src/lib/social/interactions.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  anyViewerReacted,
  emptyReactions,
  tallyOf,
  totalReactions,
  type ReactionsByEmoji,
} from "./interactions";

test("emptyReactions arranca vacío: el mapa es disperso, no un registro de claves fijas", () => {
  expect(emptyReactions()).toEqual({});
});

test("tallyOf inventa un cero para el emoji ausente en vez de devolver undefined", () => {
  const reactions: ReactionsByEmoji = { "🔥": { count: 2, viewerReacted: true } };
  expect(tallyOf(reactions, "🔥")).toEqual({ count: 2, viewerReacted: true });
  expect(tallyOf(reactions, "❤️")).toEqual({ count: 0, viewerReacted: false });
  expect(tallyOf(emptyReactions(), "❤️")).toEqual({ count: 0, viewerReacted: false });
});

test("totalReactions y anyViewerReacted se derivan del mapa entero", () => {
  const reactions: ReactionsByEmoji = {
    "🔥": { count: 2, viewerReacted: false },
    "❤️": { count: 3, viewerReacted: true },
  };
  expect(totalReactions(reactions)).toBe(5);
  expect(anyViewerReacted(reactions)).toBe(true);
  expect(totalReactions(emptyReactions())).toBe(0);
  expect(anyViewerReacted(emptyReactions())).toBe(false);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/interactions.test.ts
```

Esperado: FAIL — `tallyOf`, `totalReactions` y `anyViewerReacted` no existen.

- [ ] **Step 3: Cambiar los tipos en `interactions.ts`**

En `src/lib/social/interactions.ts`, sustituye el bloque de tipos (líneas 18-28) por:

```ts
/**
 * Un emoji del catálogo (`src/lib/social/emoji-catalog.data.ts`). Es un alias
 * documental, no un tipo cerrado: la lista blanca se valida en la acción de
 * servidor, no en el sistema de tipos.
 */
export type ReactionEmoji = string;
export type ReactionTally = { count: number; viewerReacted: boolean };
/**
 * Mapa DISPERSO: hay clave solo si alguien reaccionó con ese emoji. Indexar a
 * pelo (`reactions["🔥"]`) puede dar `undefined` — usa siempre `tallyOf`.
 * El orden de las claves es el de primera aparición, que es lo que
 * `reaction-display.ts` usa como desempate estable; por eso las consultas de
 * reacciones van ordenadas por `created_at`.
 */
export type ReactionsByEmoji = Record<ReactionEmoji, ReactionTally>;

export function emptyReactions(): ReactionsByEmoji {
  return {};
}

export function tallyOf(reactions: ReactionsByEmoji, emoji: string): ReactionTally {
  return reactions[emoji] ?? { count: 0, viewerReacted: false };
}

export function totalReactions(reactions: ReactionsByEmoji): number {
  let total = 0;
  for (const tally of Object.values(reactions)) total += tally.count;
  return total;
}

export function anyViewerReacted(reactions: ReactionsByEmoji): boolean {
  return Object.values(reactions).some((tally) => tally.viewerReacted);
}
```

- [ ] **Step 4: Actualizar la acumulación y el orden de las consultas**

En el mismo fichero, en `InteractionComment` y `InteractionSummary`, cambia el tipo del campo `reactions` de `ReactionsByKind` a `ReactionsByEmoji`.

Añade el orden a la consulta de reacciones de target (hoy no lo tiene; la de `comments` sí):

```ts
    supabase
      .from("reactions")
      .select("interaction_target_id, user_id, kind")
      .in("interaction_target_id", interactionTargetIds)
      .order("created_at", { ascending: true }),
```

Sustituye el bucle de acumulación de target:

```ts
  for (const r of reactionsResult.data ?? []) {
    const sourceId = sourceIdByTargetId.get(r.interaction_target_id);
    const s = sourceId ? summaries.get(sourceId) : undefined;
    if (!s) continue;
    const emoji = r.kind;
    if (!emoji) continue; // fila sin kind: ignora, no rompas
    const tally = (s.reactions[emoji] ??= { count: 0, viewerReacted: false });
    tally.count += 1;
    if (user && r.user_id === user.id) tally.viewerReacted = true;
  }
  for (const s of summaries.values()) {
    s.reactionCount = totalReactions(s.reactions);
    s.viewerReacted = anyViewerReacted(s.reactions);
  }
```

Y el de comentarios, con su orden:

```ts
    const { data: commentReactions, error: commentReactionsError } = await supabase
      .from("reactions")
      .select("interaction_target_id, user_id, kind")
      .in("interaction_target_id", commentInteractionTargetIds)
      .order("created_at", { ascending: true });
```

```ts
    for (const r of commentReactions ?? []) {
      const c = commentById.get(r.interaction_target_id);
      if (!c) continue;
      const emoji = r.kind;
      if (!emoji) continue;
      const tally = (c.reactions[emoji] ??= { count: 0, viewerReacted: false });
      tally.count += 1;
      if (user && r.user_id === user.id) tally.viewerReacted = true;
    }
    for (const c of commentById.values()) {
      c.reactionCount = totalReactions(c.reactions);
      c.viewerReacted = anyViewerReacted(c.reactions);
    }
```

- [ ] **Step 5: Renombrar el tipo en los consumidores que solo lo mencionan**

En `src/lib/social/feed.ts`, `src/lib/community/get-community.ts`, `src/lib/clubs/posts.ts` y `src/lib/series/get-episode-reviews.ts`: cambia `ReactionsByKind` por `ReactionsByEmoji` en el `import` y en el tipo del campo. No hay más cambios en esos ficheros.

- [ ] **Step 6: Ejecutar el test y el typecheck**

```bash
fnm use 22 && npx vitest run src/lib/social/interactions.test.ts && npx tsc --noEmit
```

Esperado: el test PASA. `tsc` **seguirá fallando** en `interaction-optimistic.ts` y `reaction-bar.tsx` — se arreglan en las tareas 4 y 7. Comprueba que los errores son solo de esos dos ficheros y sus tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/social/interactions.test.ts src/lib/social/feed.ts src/lib/community/get-community.ts src/lib/clubs/posts.ts src/lib/series/get-episode-reviews.ts
git commit -m "refactor(social): las reacciones se leen como mapa disperso por emoji"
```

---

### Task 4: Reducer optimista con emojis

**Files:**
- Modify: `src/lib/social/interaction-optimistic.ts`
- Modify: `src/lib/social/interaction-optimistic.test.ts`
- Modify: `src/components/social/post-thread.tsx:291,364`, `src/components/social/review-interactions.tsx:258,307`, `src/components/clubs/activity-chat-bubbles.tsx:239`

**Interfaces:**
- Consumes: `ReactionsByEmoji`, `tallyOf`, `totalReactions`, `anyViewerReacted` (Task 3).
- Produces: `InteractionAction` con `{ type: "toggleTarget"; emoji: string }` y `{ type: "toggleComment"; id: string; emoji: string }`. El campo pasa a llamarse `emoji`, **no** `kind`.

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/social/interaction-optimistic.test.ts`, sustituye los fixtures y tests de reacciones por:

```ts
test("toggleTarget crea la clave del emoji nuevo y suma", () => {
  const next = interactionReducer(baseSummary(), { type: "toggleTarget", emoji: "🎉" });
  expect(next.reactions).toEqual({ "🎉": { count: 1, viewerReacted: true } });
  expect(next.reactionCount).toBe(1);
  expect(next.viewerReacted).toBe(true);
});

test("quitar la última reacción BORRA la clave, no deja un cero fantasma", () => {
  const state = { ...baseSummary(), reactions: { "🔥": { count: 1, viewerReacted: true } } };
  const next = interactionReducer(state, { type: "toggleTarget", emoji: "🔥" });
  expect(next.reactions).toEqual({});
  expect(Object.keys(next.reactions)).toHaveLength(0);
  expect(next.reactionCount).toBe(0);
  expect(next.viewerReacted).toBe(false);
});

test("quitar la tuya con otros detrás conserva la clave y su recuento", () => {
  const state = { ...baseSummary(), reactions: { "🔥": { count: 3, viewerReacted: true } } };
  const next = interactionReducer(state, { type: "toggleTarget", emoji: "🔥" });
  expect(next.reactions).toEqual({ "🔥": { count: 2, viewerReacted: false } });
  expect(next.viewerReacted).toBe(false);
});

test("toggleTarget no toca los otros emojis", () => {
  const state = {
    ...baseSummary(),
    reactions: {
      "🔥": { count: 2, viewerReacted: false },
      "❤️": { count: 1, viewerReacted: true },
    },
  };
  const next = interactionReducer(state, { type: "toggleTarget", emoji: "🔥" });
  expect(next.reactions["❤️"]).toEqual({ count: 1, viewerReacted: true });
  expect(next.reactionCount).toBe(4);
});
```

Donde `baseSummary()` es el fixture ya existente en el fichero: ajústalo para que su campo `reactions` sea `emptyReactions()` (ahora `{}`) y quita los `{ ...emptyReactions(), like: ... }` de los fixtures viejos, que ya no compilan.

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/interaction-optimistic.test.ts
```

Esperado: FAIL de tipos/compilación — la acción no tiene campo `emoji`.

- [ ] **Step 3: Reescribir el reducer**

En `src/lib/social/interaction-optimistic.ts`, sustituye el `import`, el tipo de acción y los dos helpers:

```ts
import {
  anyViewerReacted,
  tallyOf,
  totalReactions,
  type InteractionComment,
  type InteractionSummary,
  type ReactionsByEmoji,
} from "./interactions";

export type InteractionAction =
  | { type: "toggleTarget"; emoji: string }
  | { type: "toggleComment"; id: string; emoji: string }
  | { type: "addComment"; comment: InteractionComment }
  | { type: "deleteComment"; id: string }
  | { type: "editComment"; id: string; body: string }
  | { type: "pinComment"; id: string; pinned: boolean };

// Al quitar la ÚLTIMA reacción de un emoji hay que borrar la clave, no dejarla
// a cero: el mapa es disperso y el ReactionBar pinta lo que hay en él, así que
// un cero superviviente se vería como una píldora vacía.
function toggleEmoji(reactions: ReactionsByEmoji, emoji: string): ReactionsByEmoji {
  const current = tallyOf(reactions, emoji);
  if (!current.viewerReacted) {
    return { ...reactions, [emoji]: { count: current.count + 1, viewerReacted: true } };
  }
  const next = { ...reactions };
  if (current.count <= 1) delete next[emoji];
  else next[emoji] = { count: current.count - 1, viewerReacted: false };
  return next;
}

function derive<T extends { reactions: ReactionsByEmoji }>(x: T): T {
  return {
    ...x,
    reactionCount: totalReactions(x.reactions),
    viewerReacted: anyViewerReacted(x.reactions),
  } as T;
}
```

Y en el `switch`, cambia las dos ramas:

```ts
    case "toggleTarget":
      return derive({ ...state, reactions: toggleEmoji(state.reactions, action.emoji) });
    case "toggleComment":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.id
            ? derive({ ...c, reactions: toggleEmoji(c.reactions, action.emoji) })
            : c,
        ),
      };
```

- [ ] **Step 4: Actualizar los cinco puntos de despacho**

En `post-thread.tsx`, `review-interactions.tsx` y `activity-chat-bubbles.tsx`, el callback del `ReactionBar` pasa a recibir `emoji`. Patrón exacto para los de comentario:

```tsx
                    onToggle={(emoji) => {
                      run({ type: "toggleComment", id: c.id, emoji }, async () => {
                        await toggleReaction(c.interactionTargetId, emoji);
                      });
                    }}
```

Y para los de target (`post-thread.tsx:364`, `review-interactions.tsx:307`):

```tsx
            onToggle={(emoji) => {
              run({ type: "toggleTarget", emoji }, async () => {
                await toggleReaction(interactionTargetId, emoji);
              });
            }}
```

- [ ] **Step 5: Ejecutar los tests**

```bash
fnm use 22 && npx vitest run src/lib/social/interaction-optimistic.test.ts
```

Esperado: PASS, los cuatro tests nuevos incluidos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/interaction-optimistic.ts src/lib/social/interaction-optimistic.test.ts src/components/social/post-thread.tsx src/components/social/review-interactions.tsx src/components/clubs/activity-chat-bubbles.tsx
git commit -m "refactor(social): el optimismo de reacciones habla de emojis, no de kinds"
```

---

### Task 5: Funciones puras de pintado (`reaction-display.ts`)

**Files:**
- Create: `src/lib/social/reaction-display.ts`
- Create: `src/lib/social/reaction-display.test.ts`
- Delete: `src/components/social/reaction-bar.test.ts`

**Interfaces:**
- Consumes: `ReactionsByEmoji` (Task 3), `MAX_REACTIONS_PER_TARGET` (Task 1).
- Produces:
  - `type ReactionEntry = { emoji: string; count: number; viewerReacted: boolean }`
  - `orderedReactions(reactions: ReactionsByEmoji): ReactionEntry[]`
  - `summarize(reactions: ReactionsByEmoji, max?: number): { top: ReactionEntry[]; total: number; viewerReacted: boolean }`
  - `viewerReactionCount(reactions: ReactionsByEmoji): number`
  - `capReached(reactions: ReactionsByEmoji, max?: number): boolean`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/social/reaction-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  capReached,
  orderedReactions,
  summarize,
  viewerReactionCount,
} from "./reaction-display";
import { emptyReactions, type ReactionsByEmoji } from "./interactions";

const reactions: ReactionsByEmoji = {
  "🔥": { count: 1, viewerReacted: false },
  "❤️": { count: 5, viewerReacted: true },
  "😂": { count: 1, viewerReacted: false },
  "👏": { count: 3, viewerReacted: false },
};

describe("orderedReactions", () => {
  it("ordena por recuento descendente", () => {
    expect(orderedReactions(reactions).map((r) => r.emoji)).toEqual(["❤️", "👏", "🔥", "😂"]);
  });

  // Sin desempate estable, dos emojis empatados bailan entre renders. El
  // desempate es el orden de INSERCIÓN del mapa, que es el de primera
  // aparición porque la consulta va ordenada por created_at.
  it("en empate respeta el orden de primera aparición", () => {
    const empate: ReactionsByEmoji = {
      "😂": { count: 2, viewerReacted: false },
      "🔥": { count: 2, viewerReacted: false },
    };
    expect(orderedReactions(empate).map((r) => r.emoji)).toEqual(["😂", "🔥"]);
    const alReves: ReactionsByEmoji = {
      "🔥": { count: 2, viewerReacted: false },
      "😂": { count: 2, viewerReacted: false },
    };
    expect(orderedReactions(alReves).map((r) => r.emoji)).toEqual(["🔥", "😂"]);
  });

  it("de un mapa vacío saca una lista vacía", () => {
    expect(orderedReactions(emptyReactions())).toEqual([]);
  });
});

describe("summarize", () => {
  it("corta en 3 pero el total cuenta todo", () => {
    const { top, total, viewerReacted } = summarize(reactions);
    expect(top.map((r) => r.emoji)).toEqual(["❤️", "👏", "🔥"]);
    expect(total).toBe(10);
    expect(viewerReacted).toBe(true);
  });

  it("acepta otro tope", () => {
    expect(summarize(reactions, 1).top.map((r) => r.emoji)).toEqual(["❤️"]);
  });

  it("sin reacciones da total 0 y nada arriba", () => {
    expect(summarize(emptyReactions())).toEqual({ top: [], total: 0, viewerReacted: false });
  });
});

describe("tope por persona", () => {
  it("cuenta solo las del viewer", () => {
    expect(viewerReactionCount(reactions)).toBe(1);
  });

  it("capReached avisa al llegar a 6 propias, no a 6 totales", () => {
    expect(capReached(reactions)).toBe(false);
    const seis: ReactionsByEmoji = Object.fromEntries(
      ["❤️", "📖", "😱", "🔥", "😂", "👏"].map((emoji) => [
        emoji,
        { count: 1, viewerReacted: true },
      ]),
    );
    expect(viewerReactionCount(seis)).toBe(6);
    expect(capReached(seis)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/reaction-display.test.ts
```

Esperado: FAIL — `Cannot find module './reaction-display'`.

- [ ] **Step 3: Escribir el módulo**

Crea `src/lib/social/reaction-display.ts`:

```ts
import { MAX_REACTIONS_PER_TARGET } from "./reaction-constants";
import { anyViewerReacted, totalReactions, type ReactionsByEmoji } from "./interactions";

// Decisiones de pintado del ReactionBar, extraídas como funciones puras: en
// esta rama no hay runner de componentes (vitest.config.ts incluye solo
// *.test.ts, entorno node), así que esto es lo que hace testeable el
// comportamiento sin montar un DOM. El clic y el foco los cubre el e2e.

export type ReactionEntry = { emoji: string; count: number; viewerReacted: boolean };

/**
 * Recuento descendente; en empate, orden de primera aparición. `Array.sort` es
 * estable, y las claves de un objeto con claves string se recorren en orden de
 * inserción — que es el de `created_at` porque las consultas van ordenadas.
 */
export function orderedReactions(reactions: ReactionsByEmoji): ReactionEntry[] {
  return Object.entries(reactions)
    .map(([emoji, tally]) => ({ emoji, count: tally.count, viewerReacted: tally.viewerReacted }))
    .sort((a, b) => b.count - a.count);
}

/** Lo que pinta el botón colapsado: unos pocos emojis y el total de todos. */
export function summarize(
  reactions: ReactionsByEmoji,
  max = 3,
): { top: ReactionEntry[]; total: number; viewerReacted: boolean } {
  return {
    top: orderedReactions(reactions).slice(0, max),
    total: totalReactions(reactions),
    viewerReacted: anyViewerReacted(reactions),
  };
}

export function viewerReactionCount(reactions: ReactionsByEmoji): number {
  return Object.values(reactions).filter((tally) => tally.viewerReacted).length;
}

/** Tope por PERSONA y target, no total del target. */
export function capReached(
  reactions: ReactionsByEmoji,
  max = MAX_REACTIONS_PER_TARGET,
): boolean {
  return viewerReactionCount(reactions) >= max;
}
```

- [ ] **Step 4: Borrar el test viejo del ReactionBar**

`src/components/social/reaction-bar.test.ts` probaba `reactionMeta`, un helper que desaparece con la paleta cerrada. Su papel lo ocupa `reaction-display.test.ts`.

```bash
git rm src/components/social/reaction-bar.test.ts
```

- [ ] **Step 5: Ejecutar el test**

```bash
fnm use 22 && npx vitest run src/lib/social/reaction-display.test.ts
```

Esperado: PASS, los 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/reaction-display.ts src/lib/social/reaction-display.test.ts
git commit -m "feat(social): funciones puras de pintado de reacciones"
```

---

### Task 6: Acción de servidor con lista blanca y traducción del tope

**Files:**
- Modify: `src/lib/social/interaction-actions.ts:28-70`
- Modify: `src/lib/social/interaction-actions.test.ts:140-270`

**Interfaces:**
- Consumes: `isAllowedEmoji` (Task 1), `QUICK_REACTIONS` (Task 1).
- Produces: `toggleReaction(interactionTargetId: string, emoji?: string): Promise<void>`. Por defecto `"❤️"`. Lanza `Error("reaction_emoji_not_allowed")` si el emoji no está en el catálogo y `Error("reaction_cap_reached")` si el trigger rechaza.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/social/interaction-actions.test.ts`, dentro de `describe("toggleReaction")`, cambia los `kind: "like"` esperados por `kind: "❤️"`, los `toggleReaction("target-pass", "fire")` por `toggleReaction("target-pass", "🔥")`, y añade:

```ts
  it("rechaza cualquier cosa que no esté en el catálogo, sin tocar la base", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(toggleReaction("target-pass", "like")).rejects.toThrow(
      "reaction_emoji_not_allowed",
    );
    await expect(toggleReaction("target-pass", "<script>")).rejects.toThrow(
      "reaction_emoji_not_allowed",
    );
    await expect(toggleReaction("target-pass", "🔥🔥")).rejects.toThrow(
      "reaction_emoji_not_allowed",
    );
    expect(fake.insertedReactions).toHaveLength(0);
  });

  it("acepta un emoji cualquiera del catálogo, no solo la fila rápida", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await toggleReaction("target-pass", "🐙");

    expect(fake.insertedReactions).toEqual([
      { interaction_target_id: "target-pass", user_id: "actor", kind: "🐙" },
    ]);
  });
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/interaction-actions.test.ts
```

Esperado: FAIL — se inserta `"like"` en vez de rechazarlo, y el defecto sigue siendo `"like"`.

- [ ] **Step 3: Validar en la acción**

En `src/lib/social/interaction-actions.ts`, cambia el import del tipo:

```ts
import { isAllowedEmoji } from "./emoji-catalog";
```

(elimina el `import type { ReactionKind } from "./interactions";`, que ya no existe)

y la cabecera de la función:

```ts
export async function toggleReaction(
  interactionTargetId: string,
  emoji: string = "❤️",
): Promise<void> {
  // Lista blanca contra el catálogo, no regex: garantiza que todo lo guardado
  // en reactions.kind se puede pintar Y nombrar. Con solo un regex de emoji,
  // por aquí entraría cualquier secuencia ZWJ rara, sin nombre y sin
  // aria-label. El CHECK de Postgres es la red de debajo, no la puerta.
  if (!isAllowedEmoji(emoji)) throw new Error("reaction_emoji_not_allowed");

  const supabase = await createClient();
```

Sustituye `kind` por `emoji` en las tres consultas del cuerpo (`.eq("kind", emoji)` dos veces, y `kind: emoji` en el `insert`), y traduce el error del trigger en el `insert`:

```ts
    const { error } = await supabase.from("reactions").insert({
      interaction_target_id: interactionTargetId,
      user_id: user.id,
      kind: emoji,
    });
    if (error) {
      // El trigger reactions_cap_before_insert protege el tope de 6 por
      // persona y target. Se traduce a un error estable para que la UI pueda
      // distinguirlo de un fallo de red.
      if (error.message.includes("reaction_cap_reached")) {
        throw new Error("reaction_cap_reached");
      }
      throw error;
    }
```

- [ ] **Step 4: Ejecutar los tests**

```bash
fnm use 22 && npx vitest run src/lib/social/interaction-actions.test.ts
```

Esperado: PASS, incluidos los dos nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interaction-actions.ts src/lib/social/interaction-actions.test.ts
git commit -m "feat(social): toggleReaction valida el emoji contra el catalogo"
```

---

### Task 7: Selector de emojis

**Files:**
- Create: `src/components/social/emoji-picker.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `EMOJI_GROUPS`, `emojisByGroup`, `searchEmojis`, `emojiName` (Task 1).
- Produces: `<EmojiPicker onPick={(emoji: string) => void} onBack={() => void} disabledNew={boolean} />`, export **nombrado** `EmojiPicker` (el `dynamic` de la Task 8 depende de ese nombre).

- [ ] **Step 1: Añadir las claves de texto**

En `messages/es.json`, dentro de `"social"`, **elimina** el objeto `"reaction"` (los nombres salen ahora del catálogo) y añade:

```json
    "emojiPicker": {
      "title": "Elegir emoji",
      "open": "Más emojis",
      "back": "Volver",
      "search": "Buscar emoji",
      "noResults": "Ningún emoji coincide",
      "capReached": "Máximo 6 reacciones por mensaje"
    },
```

- [ ] **Step 2: Escribir el componente**

Crea `src/components/social/emoji-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  EMOJI_GROUPS,
  emojisByGroup,
  searchEmojis,
  type EmojiEntry,
} from "@/lib/social/emoji-catalog";

// Selector completo. Se carga con next/dynamic desde el ReactionBar para que el
// catálogo (~95 KB de datos) no viaje en el bundle del feed.
//
// Sin virtualización a propósito: se pinta SOLO la categoría activa (la mayor,
// Caras, ronda 180 entradas) y la búsqueda corta en 100. Una ventana virtual
// para 1.900 botones es complejidad que este caso no paga.
export function EmojiPicker({
  onPick,
  onBack,
  disabledNew = false,
}: {
  onPick: (emoji: string) => void;
  onBack: () => void;
  /** El viewer llegó al tope: puede quitar las suyas, no añadir nuevas. */
  disabledNew?: boolean;
}) {
  const t = useTranslations("social");
  const [group, setGroup] = useState(0);
  const [query, setQuery] = useState("");

  const results: EmojiEntry[] = query.trim() ? searchEmojis(query) : emojisByGroup(group);

  return (
    <div className="flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("emojiPicker.back")}
          className="rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ←
        </button>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("emojiPicker.search")}
          aria-label={t("emojiPicker.search")}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground"
        />
      </div>

      {!query.trim() && (
        <div className="flex gap-1 overflow-x-auto">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                group === g.id
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {disabledNew && (
        <p className="text-[11px] text-muted-foreground">{t("emojiPicker.capReached")}</p>
      )}

      {results.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {t("emojiPicker.noResults")}
        </p>
      ) : (
        <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
          {results.map((entry) => (
            <button
              key={entry.e}
              type="button"
              disabled={disabledNew}
              aria-label={entry.n}
              title={entry.n}
              onClick={() => onPick(entry.e)}
              className="rounded p-1 text-lg leading-none transition-colors hover:bg-surface-muted disabled:opacity-40"
            >
              <span aria-hidden="true">{entry.e}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Comprobar que compila**

```bash
fnm use 22 && npx tsc --noEmit
```

Esperado: los únicos errores restantes son de `reaction-bar.tsx` (Task 8).

- [ ] **Step 4: Commit**

```bash
git add src/components/social/emoji-picker.tsx messages/es.json
git commit -m "feat(social): selector de emojis con buscador y categorias"
```

---

### Task 8: `ReactionBar` estilo Teams

**Files:**
- Modify: `src/components/social/reaction-bar.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `summarize`, `orderedReactions`, `capReached` (Task 5), `QUICK_REACTIONS`, `QUICK_REACTION_NAMES` (Task 1), `tallyOf` (Task 3), `EmojiPicker` (Task 7).
- Produces: `<ReactionBar reactions={ReactionsByEmoji} disabled?={boolean} onToggle={(emoji: string) => void} />`. La firma pública **no cambia** salvo el nombre del parámetro del callback.

- [ ] **Step 1: Reescribir el componente**

Sustituye por completo `src/components/social/reaction-bar.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { tallyOf, type ReactionsByEmoji } from "@/lib/social/interactions";
import { capReached, orderedReactions, summarize } from "@/lib/social/reaction-display";
import { QUICK_REACTIONS, QUICK_REACTION_NAMES } from "@/lib/social/reaction-constants";

// El catálogo entero (~95 KB) vive DENTRO de este chunk diferido. Por eso el
// ReactionBar importa reaction-constants y no emoji-catalog: si importara el
// catálogo, esos datos viajarían en el bundle del feed y la carga diferida no
// serviría de nada.
const EmojiPicker = dynamic(() => import("./emoji-picker").then((m) => m.EmojiPicker), {
  ssr: false,
});

// Reacciones con cualquier emoji, estilo Teams. Colapsado: los 3 emojis más
// votados + el total (pintarlos todos desbordaría la burbuja). Abierto: los ya
// reaccionados para sumarte de un clic, la fila rápida fija, y el «+» que
// cambia el contenido del popover por el catálogo — no abre un segundo
// flotante, que en 360 px no cabe.
export function ReactionBar({
  reactions,
  disabled,
  onToggle,
}: {
  reactions: ReactionsByEmoji;
  disabled?: boolean;
  onToggle: (emoji: string) => void;
}) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { top, total, viewerReacted } = summarize(reactions);
  const existing = orderedReactions(reactions);
  const atCap = capReached(reactions);

  function close() {
    setOpen(false);
    setBrowsing(false);
    triggerRef.current?.focus();
  }

  function pick(emoji: string) {
    onToggle(emoji);
    close();
  }

  /** Un emoji nuevo se bloquea al llegar al tope; los tuyos siempre se quitan. */
  function blocked(emoji: string) {
    return Boolean(disabled) || (atCap && !tallyOf(reactions, emoji).viewerReacted);
  }

  return (
    <div
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={t("react")}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50 ${
          viewerReacted
            ? "border-accent text-accent"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {top.length > 0 ? (
          <>
            <span aria-hidden="true">{top.map((r) => r.emoji).join(" ")}</span>
            <span>{total}</span>
          </>
        ) : (
          <span aria-hidden="true">🙂</span>
        )}
      </button>

      {open && (
        <>
          {/* Cierra al pulsar fuera, sin useEffect (lint set-state-in-effect). */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="dialog"
            aria-label={browsing ? t("emojiPicker.title") : t("react")}
            className="absolute top-full left-0 z-20 mt-1 rounded-2xl border border-border bg-surface p-1.5 shadow-card"
          >
            {browsing ? (
              <EmojiPicker
                onPick={pick}
                onBack={() => setBrowsing(false)}
                disabledNew={atCap}
              />
            ) : (
              <div className="flex flex-col gap-1">
                {existing.length > 0 && (
                  <div className="flex max-w-[15rem] items-center gap-1 overflow-x-auto">
                    {existing.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        disabled={blocked(r.emoji)}
                        aria-pressed={r.viewerReacted}
                        onClick={() => pick(r.emoji)}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
                          r.viewerReacted
                            ? "bg-accent/15 text-accent"
                            : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                        }`}
                      >
                        <span aria-hidden="true">{r.emoji}</span>
                        <span>{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      disabled={blocked(emoji)}
                      aria-pressed={tallyOf(reactions, emoji).viewerReacted}
                      aria-label={QUICK_REACTION_NAMES[emoji]}
                      title={atCap ? t("emojiPicker.capReached") : QUICK_REACTION_NAMES[emoji]}
                      onClick={() => pick(emoji)}
                      className={`rounded-full px-2 py-1 text-sm transition-colors disabled:opacity-40 ${
                        tallyOf(reactions, emoji).viewerReacted
                          ? "bg-accent/15"
                          : "hover:bg-surface-muted"
                      }`}
                    >
                      <span aria-hidden="true">{emoji}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label={t("emojiPicker.open")}
                    title={t("emojiPicker.open")}
                    onClick={() => setBrowsing(true)}
                    className="rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y lint limpios**

```bash
fnm use 22 && npx tsc --noEmit && npx eslint src/components/social src/lib/social
```

Esperado: **cero** errores. Si `eslint` se queja de `set-state-in-effect`, has metido un `useEffect` — quítalo, el cierre va por `onKeyDown` y backdrop.

- [ ] **Step 3: Toda la suite unitaria**

```bash
fnm use 22 && npx vitest run
```

Esperado: PASS entero. Si algún test de otro módulo se cae, es un `emptyReactions()` con forma vieja — arréglalo ahí.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/reaction-bar.tsx
git commit -m "feat(social): reaccionar con cualquier emoji, estilo Teams"
```

---

### Task 9: E2E del flujo completo

**Files:**
- Create: `e2e/reacciones-emoji.spec.ts`

**Interfaces:**
- Consumes: la UI de las tareas 7 y 8; los helpers de `e2e/` que ya usan los specs existentes.

- [ ] **Step 1: Escribir el spec**

Antes de escribirlo, abre `e2e/posts.spec.ts` y copia su patrón de login y de creación de datos (`insertOne`, `finally` de limpieza): este spec debe seguir el mismo, no inventar otro.

Crea `e2e/reacciones-emoji.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

// Reaccionar con un emoji fuera de la fila rápida, y sumarse a uno existente.
// Cubre lo que en esta rama no puede cubrir un test unitario: clic, aria-pressed
// y persistencia contra el servidor (no hay runner de componentes aquí).
test("reaccionar con un emoji del catálogo y sumarse a uno existente", async ({ page }) => {
  // Reutiliza el arranque de e2e/posts.spec.ts: login + un post propio visible
  // en /post/[id]. Si ese helper cambia de nombre, cámbialo aquí también.
  await page.goto("/muro");

  // ── Fila rápida: un clic ──
  await page.getByRole("button", { name: "Reaccionar" }).first().click();
  const fuego = page.getByRole("button", { name: "fuego" }).first();
  await expect(fuego).toHaveAttribute("aria-pressed", "false");
  await fuego.click();

  // El popover se cierra al elegir y el colapsado ya muestra el emoji.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reaccionar" }).first()).toContainText("🔥");

  // ── Catálogo: buscar algo que NO está en la fila rápida ──
  await page.getByRole("button", { name: "Reaccionar" }).first().click();
  await page.getByRole("button", { name: "Más emojis" }).click();
  await page.getByRole("searchbox", { name: "Buscar emoji" }).fill("pulpo");
  await page.getByRole("button", { name: "pulpo" }).first().click();
  await expect(page.getByRole("button", { name: "Reaccionar" }).first()).toContainText("🐙");

  // ── Persiste tras recargar: es la verdad del servidor, no el optimismo ──
  await page.reload();
  await page.getByRole("button", { name: "Reaccionar" }).first().click();
  await expect(page.getByRole("button", { name: "fuego" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // ── Sumarse desde la fila de ya-reaccionados: quitar y volver a poner ──
  await page.getByRole("button", { name: "fuego" }).first().click();
  await page.getByRole("button", { name: "Reaccionar" }).first().click();
  await expect(page.getByRole("button", { name: "fuego" }).first()).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
```

- [ ] **Step 2: Levantar el dev server (uno solo, en 3000)**

```bash
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

Si hay proceso, mátalo con `Stop-Process -Id <pid>` antes de arrancar. Luego `npm run dev`.

- [ ] **Step 3: Ejecutar el e2e**

```bash
npx playwright test e2e/reacciones-emoji.spec.ts --reporter=list
```

Esperado: PASS. Si falla en `getByRole("button", { name: "fuego" })`, comprueba el `aria-label` real: Playwright casa el nombre accesible sin distinguir mayúsculas, así que `"fuego"` debe casar con el nombre del catálogo — si CLDR lo llama de otra forma, usa el nombre que devuelve `emojiName("🔥")`.

- [ ] **Step 4: Comprobar que los e2e de reacciones existentes siguen verdes**

`e2e/posts.spec.ts`, `e2e/thoughts.spec.ts` y `e2e/social-interaction-targets.spec.ts` pulsan `{ name: "Fuego" }`. El emoji sigue en la fila rápida y el nombre del catálogo es `fuego`, que casa sin distinguir mayúsculas — deben pasar sin tocarlos.

```bash
npx playwright test e2e/posts.spec.ts e2e/thoughts.spec.ts e2e/social-interaction-targets.spec.ts --reporter=list
```

Esperado: PASS. Si alguno falla por el nombre, ajusta **ese** spec al nombre del catálogo; no cambies el `aria-label` del producto para contentar a un test.

- [ ] **Step 5: Commit**

```bash
git add e2e/reacciones-emoji.spec.ts
git commit -m "test(social): e2e de reacciones con emoji libre"
```

---

### Task 10: Migración a producción, documentación y cierre

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md`

- [ ] **Step 1: Aplicar la migración en producción**

Solo después de que las tareas 1-9 estén verdes. Con `mcp__supabase-prod__apply_migration`, mismo nombre y contenido que en dev.

Verifica contra los objetos reales, **no** contra `list_migrations`:

```sql
select
  (select count(*) from public.reactions where kind in ('like','read','shock','fire')) as slugs_restantes,
  (select count(*) from pg_constraint where conname = 'reactions_kind_emoji') as check_creado,
  (select count(*) from pg_trigger where tgname = 'reactions_cap_before_insert') as trigger_creado;
```

Esperado: `0`, `1`, `1`.

- [ ] **Step 2: Actualizar `data-model.md`**

En la sección de `reactions`, sustituye la descripción de `kind`:

```markdown
- `kind` (`text`, NOT NULL) — **el emoji literal** de la reacción (`❤️`, `🔥`, `🐙`).
  Hasta 2026-08-24 era una paleta cerrada de cuatro slugs (`like`/`read`/`shock`/`fire`),
  migrados a `❤️`/`📖`/`😱`/`🔥` por `20260876_reactions_emoji_libre.sql`.
  - CHECK `reactions_kind_emoji`: de **forma**, no lista blanca — 1..16 caracteres, al
    menos uno no ASCII, sin espacios. La lista blanca real es el catálogo
    (`src/lib/social/emoji-catalog.data.ts`), validado en `toggleReaction`.
  - Trigger `reactions_cap_before_insert` → `public.enforce_reaction_cap()`: **máximo 6
    emojis distintos por persona y target**. Rechaza con el mensaje `reaction_cap_reached`.
  - El único `(interaction_target_id, user_id, kind)` sigue permitiendo varias reacciones
    distintas de la misma persona sobre el mismo target.
```

Actualiza la fecha de verificación de la cabecera del documento a la de hoy.

- [ ] **Step 3: Añadir la entrada de decisiones**

Al **final** de `docs/requirements/decisiones.md` (append-only, no reescribas nada anterior):

```markdown
## 2026-08-24 — Reacciones con cualquier emoji

- **El emoji va en `reactions.kind`, no en una tabla de catálogo.** Una tabla de emojis
  permitidos con FK sería más "correcta" en el papel y añade un JOIN a cada lectura de
  reacciones a cambio de nada: el catálogo no se edita en runtime, se regenera con un
  script. La integridad la dan el CHECK de forma y la lista blanca en la acción.
- **Varias reacciones por persona, con tope de 6.** Teams permite una sola; aquí ya se
  podían varias y quitarlo obligaba a migrar datos eligiendo cuál sobrevive. Se conserva el
  comportamiento y se pone tope en trigger, porque emoji libre sin tope deja que una
  persona cuelgue decenas de píldoras de un mensaje.
- **La validación es lista blanca contra el catálogo, no `\p{RGI_Emoji}`.** El regex acepta
  secuencias ZWJ que no sabemos nombrar; entonces la reacción no tendría `aria-label` y en
  algunos móviles se pinta como varios monigotes. Con lista blanca, todo lo guardado se
  puede pintar y nombrar.
- **No se añadió `jsdom` para testear el `ReactionBar`.** La rama
  `fase-c-estadisticas-nuevas` ya introduce el runner de `.test.tsx`; duplicarlo aquí
  costaba un conflicto de `package.json` y lockfile. La lógica se extrajo a
  `reaction-display.ts` (puro, testeado) y el DOM lo cubre Playwright.
```

- [ ] **Step 4: Abrir las issues de lo que queda**

```bash
gh issue create --label "area:social,tipo:cobertura,P2" --title "Tests de componente del ReactionBar cuando main tenga runner de .test.tsx" --body "Al implementar las reacciones con emoji libre (spec 2026-08-24) no se añadió jsdom: la rama fase-c-estadisticas-nuevas ya introduce el runner de componentes y duplicarlo daba conflicto de package.json + lockfile.

Hoy la lógica pura está cubierta en src/lib/social/reaction-display.test.ts y el resto lo cubre e2e/reacciones-emoji.spec.ts.

Cuando fase-c-estadisticas-nuevas esté en main, añadir src/components/social/reaction-bar.test.tsx con: el colapsado corta en 3 y muestra el total; pulsar un emoji llama a onToggle con ese caracter; con 6 reacciones propias los emojis nuevos salen disabled; Escape cierra y devuelve el foco al boton."

gh issue create --label "area:social,tipo:feature,P3" --title "Fila rapida de reacciones con los emojis mas usados por cada persona" --body "Hoy la fila rapida del ReactionBar es fija: ❤️ 📖 😱 🔥 😂 👏 (decidido en el spec 2026-08-24-reacciones-emoji-libre).

Alternativa considerada y aparcada: que la fila sean los emojis que esa persona mas usa, guardados en el navegador, con los seis actuales como semilla. Se adapta a cada uno, pero la fila 'se mueve' y en un navegador nuevo no te sigue.

Si se hace: vive en src/components/social/reaction-bar.tsx + un modulo nuevo de preferencias en localStorage. No toca el modelo de datos."
```

- [ ] **Step 5: Commit y PR**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md
git commit -m "docs(social): data-model y decisiones de las reacciones con emoji libre"
git push -u origin reacciones-emoji-libre
gh pr create --title "Reacciones con cualquier emoji, estilo Teams" --body "$(cat <<'BODY'
Cierra el spec `docs/superpowers/specs/2026-08-24-reacciones-emoji-libre-design.md`.

`reactions.kind` pasa de una paleta cerrada de cuatro slugs a guardar el emoji literal, en todas las reacciones de la app. Se mantiene poder poner varias reacciones distintas por persona, ahora con tope de 6 por target.

## Caché y RLS (regla #437)

No se añade ningún `use cache` en este cambio. Las lecturas de reacciones siguen usando el cliente de la petición y dependen de `auth.uid()` (`viewerReacted`), así que no son cacheables: se quedan como están.

## Migración

`supabase/migrations/20260876_reactions_emoji_libre.sql`, aplicada en dev y en prod, verificada contra `pg_constraint` / `pg_trigger` y no contra el ledger. El dedup corre **antes** del UPDATE: sin él, quien ya tuviera `fire` y `🔥` sobre el mismo target rompía el único.

## Trampa que costó tiempo

El CHECK ingenuo `kind !~ '[[:alnum:][:space:][:punct:]]'` parece equivalente y tumba los keycap: `1️⃣` es el dígito ASCII `1` + VS16 + U+20E3. La condición correcta es "contiene al menos un carácter no ASCII".

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MgTJVgyjr7PK7MBR1PSdjJ
BODY
)"
```

---

## Autorrevisión del plan

**Cobertura del spec:**

| Sección del spec | Tarea |
|---|---|
| §3 Modelo de datos (dedup, UPDATE, CHECK, único, tope) | Task 2 |
| §4 Tipos front (`ReactionsByEmoji`, `tallyOf`, derivados, borrar clave a 0, orden) | Tasks 3 y 4 |
| §5 UI (top-3, fila rápida, «+», catálogo en el mismo popover, a11y, tope visible, diferido) | Tasks 7 y 8 |
| §6 Catálogo y validación (script, datos, lista blanca, buscador) | Tasks 1 y 6 |
| §7 Pruebas (puras + e2e, sin jsdom) | Tasks 1, 3, 4, 5, 6 y 9 |
| §8 Definición de hecho (data-model, decisiones, backlog, issues) | Task 10 |

`docs/requirements/backlog.md` no tiene ítem de reacciones (comprobado), por eso no aparece como paso.

**Coherencia de nombres** (verificada entre tareas): `ReactionsByEmoji`, `tallyOf`, `totalReactions`, `anyViewerReacted` (Task 3) se usan con esos mismos nombres en las tareas 4, 5 y 8. `isAllowedEmoji`, `emojiName`, `emojisByGroup`, `searchEmojis`, `EMOJI_GROUPS`, `EmojiEntry` (Task 1) se usan igual en 6 y 7. `QUICK_REACTIONS`, `QUICK_REACTION_NAMES`, `MAX_REACTIONS_PER_TARGET` (Task 1) se usan igual en 5 y 8. `orderedReactions`, `summarize`, `capReached` (Task 5) se usan igual en 8. El campo de la acción optimista se llama `emoji` en las tareas 4 y 8, nunca `kind`.

**Riesgo conocido, asumido:** el orden de primera aparición descansa en el orden de inserción de claves de un objeto JS. Es comportamiento garantizado para claves string no enteras, y los emojis nunca son índices enteros — pero es la razón por la que las consultas de reacciones tienen que ir ordenadas por `created_at` (Task 3, Step 4). Si alguien quita ese `.order()`, el desempate se vuelve arbitrario y el test de `reaction-display` **no** lo detecta, porque prueba el mapa ya construido.
