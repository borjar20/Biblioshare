# Notas y citas · Plan A (captura y relectura) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que puedas capturar una cita o una nota mientras registras una sesión —anclada a la página que acabas de marcar— y releerla después en la ficha de la obra, ordenada por posición.

**Architecture:** Un componente `NoteComposer` que pinta **campos sueltos, no un `<form>`** (dentro de la hoja de sesión un form anidado es HTML ilegal), montado en dos sitios: la hoja de sesión —donde sus campos viajan en el `FormData` de la sesión y los escribe `addSession`— y la ficha, donde va envuelto en su propio `<form action={addNote}>`. La lectura entra por un componente nuevo, `NotesSection`, hermano de `log-panel` y nunca dentro de él. Una migración añade cuatro columnas; **no se toca RLS**.

**Tech Stack:** Next.js 16.2.10 (App Router, server actions), React 19, next-intl, Tailwind, Supabase (Postgres + RLS), Vitest, Playwright.

## Global Constraints

Copiadas de `docs/superpowers/specs/2026-07-21-notas-captura-design.md`. Vinculan a **todas** las tareas.

- Los valores de `notes.kind` son exactamente **`'note'` y `'quote'`**, en inglés. Hay un `CHECK (kind IN ('note','quote'))` en prod: escribir `'cita'` o `'nota'` falla la inserción.
- `notes` cuelga del **ítem** (`item_type`/`item_id` son `NOT NULL`); `pass_id` y `session_id` son opcionales.
- `notes.body` tiene `CHECK (char_length(body) BETWEEN 1 AND 5000)`.
- **`is_public` se escribe pero NO se abre la lectura.** No añadas ninguna política RLS en este ciclo. Las cuatro políticas existentes (`auth.uid() = user_id` en select/insert/update/delete) se quedan exactamente como están.
- El copy de «compartible» **no puede prometer visibilidad**: dice que se guarda marcada para cuando exista el muro.
- `meta` es jsonb opaco. Forma de este ciclo: `{"tags": ["personaje"]}`. Sin `#` guardado, minúsculas, máximo 8.
- Migraciones: **dev primero (`supabase-dev`), prod después**. Fichero en `supabase/migrations/` con nombre `AAAAMMDD_<slug>.sql`.
- Todo el texto visible va por `messages/es.json` (next-intl). Nada de literales en JSX.
- Vitest necesita Node 22: `fnm use 22` antes de correrlo (el shell arranca en 20.9).
- `npm run lint` **siempre** sale con código ≠ 0 en este repo (15 errores y ~1500 avisos preexistentes). Verifica solo TUS ficheros: `npx eslint <rutas que tocaste>`.
- No toques `min-h-0` del `<form>` ni los `shrink-0` de cabecera/hero/footer en `session-sheet.tsx`: son las piezas invisibles de dos bugs ya arreglados (ver los comentarios del propio fichero).

---

## Estructura de ficheros

**Nuevos**

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260721_notes_social_columns.sql` | Las cuatro columnas y dos índices |
| `src/lib/notes/tags.ts` + `.test.ts` | `normalizeTags` — pura, compartida por los dos escritores |
| `src/lib/notes/sort.ts` + `.test.ts` | `compareNotes` — orden por posición, sobre `comparePositions` |
| `src/components/notes/note-composer.tsx` | Los campos del compositor. Sin `<form>` |
| `src/components/notes/notes-section.tsx` | «Mis notas y citas» en la ficha |
| `src/components/notes/note-card.tsx` | Una nota: pull-quote o tarjeta, con sus acciones |
| `e2e/notas-captura.spec.ts` | E2E del ciclo |

**Modificados**

| Fichero | Cambio |
|---|---|
| `src/lib/notes/types.ts` | `page: number \| null` → `position: Position`; + `tags`, `isSpoiler`, `isPublic` |
| `src/lib/notes/get-notes.ts` | Proyectar las columnas nuevas; `getNotesForItem` |
| `src/lib/notes/actions.ts` | `addNote` con etiquetas, spoiler y público |
| `src/lib/sessions/actions.ts:176-193` | Revivir el bloque `if (note)` muerto |
| `src/components/session/book-progress-field.tsx` | `onPageChange` |
| `src/components/session/series-episode-grid.tsx` | `onNewlyMarkedChange` reporta el último episodio |
| `src/components/session/session-sheet.tsx` | Montar el compositor; subir el anclaje |
| `src/components/detail/log-panel.tsx:404-409` | Sustituir `AddNoteForm` por el compositor |
| `src/components/notes/memorize-card.tsx:43` | `note.page` → `formatPosition` |
| `src/app/api/og/nota/[id]/route.tsx:58` | Ídem |
| `messages/es.json` | Claves de `notes` |

**Borrados**: `src/components/notes/add-note-form.tsx`.

## Corrección a la spec: no inventes `positionSortKey`

La spec §3.5 propone una función `positionSortKey`. **No la escribas.** Ya existe
`comparePositions(itemType, a, b)` en `src/lib/library/position.ts:75`, hace
exactamente esa comparación para libro y serie, y está deliberadamente duplicada en
SQL (RPC `confirm_checkpoint`). Una tercera copia sería la tercera verdad sobre lo
mismo. La Tarea 3 construye el orden **encima** de ella.

---

### Task 1: La migración

**Files:**
- Create: `supabase/migrations/20260721_notes_social_columns.sql`
- Modify: `docs/requirements/data-model.md`

**Interfaces:**
- Produces: las columnas `meta jsonb`, `is_spoiler boolean`, `is_public boolean`, `parent_note_id uuid` en `public.notes`, más los índices `idx_notes_item` e `idx_notes_parent`. Todas las tareas siguientes las asumen presentes.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260721_notes_social_columns.sql`:

```sql
-- Notas y citas · Plan A. Cuatro columnas para cerrar el modelo de una vez.
-- `is_public` y `parent_note_id` se crean SIN UI en este ciclo (ver la spec
-- 2026-07-21-notas-captura-design.md, D2/D3).
--
-- RLS NO SE TOCA. Las cuatro políticas de dueño siguen siendo las únicas: abrir
-- la lectura pública antes de que exista el filtro spoiler-safe sería justo la
-- fuga que `is_public` viene a evitar. La columna registra intención; F2 la
-- honra cuando haya muro.

alter table public.notes
  add column if not exists meta jsonb not null default '{}'::jsonb,
  add column if not exists is_spoiler boolean not null default false,
  add column if not exists is_public boolean not null default false,
  add column if not exists parent_note_id uuid null
    references public.notes(id) on delete set null;

-- ON DELETE SET NULL, coherente con pass_id/session_id: borrar la cita padre no
-- debe llevarse por delante la nota hija.
create index if not exists idx_notes_parent
  on public.notes (parent_note_id) where parent_note_id is not null;

-- El único índice que había (idx_notes_user, sobre (user_id, created_at desc))
-- sirve al cuaderno por recientes, pero no a la lista de la ficha, que filtra
-- por obra.
create index if not exists idx_notes_item
  on public.notes (user_id, item_type, item_id);
```

- [ ] **Step 2: Aplicar en DEV**

Usa la herramienta MCP `mcp__supabase-dev__apply_migration` con `name: "notes_social_columns"` y el SQL de arriba.

- [ ] **Step 3: Verificar en DEV contra los objetos reales**

Con `mcp__supabase-dev__execute_sql`:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='notes'
  and column_name in ('meta','is_spoiler','is_public','parent_note_id')
order by column_name;
```

Esperado: 4 filas. `meta` → `jsonb`, `NO`, `'{}'::jsonb`. `is_public` e `is_spoiler` → `boolean`, `NO`, `false`. `parent_note_id` → `uuid`, `YES`, `null`.

Y que RLS no ha cambiado:

```sql
select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
where c.relname='notes';
```

Esperado: `4`. **Si sale otro número, para y avisa**: alguien tocó las políticas.

- [ ] **Step 4: Aplicar en PROD y verificar igual**

Misma llamada con `mcp__supabase-prod__apply_migration`, y repite las dos consultas de verificación con `mcp__supabase-prod__execute_sql`. Mismos resultados esperados.

- [ ] **Step 5: Actualizar la doc canónica**

En `docs/requirements/data-model.md`, en la ficha de la tabla `notes`, añade las cuatro columnas con su tipo y defecto, los dos índices, y una línea explícita: «RLS: solo dueño (4 políticas). `is_public` se escribe pero **no** hay política de lectura pública — ver `decisiones.md`». Actualiza la fecha de verificación de la cabecera del documento a `2026-07-21`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260721_notes_social_columns.sql docs/requirements/data-model.md
git commit -m "feat(notas): columnas meta, is_spoiler, is_public y parent_note_id"
```

---

### Task 2: `normalizeTags`

**Files:**
- Create: `src/lib/notes/tags.ts`
- Test: `src/lib/notes/tags.test.ts`

**Interfaces:**
- Produces: `export function normalizeTags(raw: string): string[]`. La usan `addNote` (Tarea 6) y `addSession` (Tarea 7) — **una sola implementación para los dos escritores**, que es lo que evita dos verdades sobre el mismo jsonb.

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/notes/tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeTags } from "./tags";

describe("normalizeTags", () => {
  it("parte por comas y limpia los extremos", () => {
    expect(normalizeTags(" personaje , estilo ")).toEqual(["personaje", "estilo"]);
  });

  it("quita la almohadilla: el # es presentación, no dato", () => {
    expect(normalizeTags("#final,##doble")).toEqual(["final", "doble"]);
  });

  it("normaliza a minúsculas", () => {
    expect(normalizeTags("Final,ESTILO")).toEqual(["final", "estilo"]);
  });

  it("descarta vacías y duplicadas conservando el primer orden", () => {
    expect(normalizeTags("final,,final,  ,estilo")).toEqual(["final", "estilo"]);
  });

  it("corta a 8 etiquetas", () => {
    expect(normalizeTags("a,b,c,d,e,f,g,h,i,j")).toEqual([
      "a", "b", "c", "d", "e", "f", "g", "h",
    ]);
  });

  it("una entrada vacía no produce etiquetas", () => {
    expect(normalizeTags("")).toEqual([]);
    expect(normalizeTags("   ")).toEqual([]);
    expect(normalizeTags(",,,")).toEqual([]);
  });

  it("colapsa los espacios interiores en guiones", () => {
    expect(normalizeTags("final feliz")).toEqual(["final-feliz"]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

```bash
fnm use 22 && npx vitest run src/lib/notes/tags.test.ts
```

Esperado: FAIL, «Failed to resolve import "./tags"».

- [ ] **Step 3: Implementar**

`src/lib/notes/tags.ts`:

```ts
// Normalización de etiquetas, compartida por los DOS escritores de notas
// (addNote desde la ficha, addSession desde la hoja). `meta` es jsonb opaco a
// la BD: si cada escritor normalizara por su cuenta, "Final" y "final" serían
// dos etiquetas distintas y el filtro del cuaderno (Plan B) no las juntaría
// nunca. Esta función es la única verdad sobre la forma de meta.tags.
const MAX_TAGS = 8;

export function normalizeTags(raw: string): string[] {
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const tag = piece
      .trim()
      .replace(/^#+/, "")       // el # es presentación, no dato
      .toLowerCase()
      .replace(/\s+/g, "-")     // "final feliz" → "final-feliz"
      .trim();
    if (!tag) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}
```

- [ ] **Step 4: Verificar que pasan**

```bash
fnm use 22 && npx vitest run src/lib/notes/tags.test.ts
```

Esperado: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes/tags.ts src/lib/notes/tags.test.ts
git commit -m "feat(notas): normalizeTags compartida por los dos escritores"
```

---

### Task 3: `compareNotes` — el orden por posición

**Files:**
- Create: `src/lib/notes/sort.ts`
- Test: `src/lib/notes/sort.test.ts`

**Interfaces:**
- Consumes: `comparePositions(itemType, a, b)` de `src/lib/library/position.ts` y el tipo `Position` de ahí mismo.
- Produces: `export function compareNotes(itemType: ItemType, a: SortableNote, b: SortableNote): number` y `export type SortableNote = { position: Position; createdAt: string }`. La usa `NotesSection` (Tarea 8).

**Regla:** primero lo anclado, ascendente (recorres la obra de principio a fin, que es de lo que trata releer); después lo suelto, por fecha descendente.

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/notes/sort.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareNotes, type SortableNote } from "./sort";

const n = (position: SortableNote["position"], createdAt = "2026-01-01"): SortableNote => ({
  position,
  createdAt,
});

describe("compareNotes", () => {
  it("libro: ordena por página ascendente", () => {
    expect(compareNotes("book", n({ page: 12 }), n({ page: 240 }))).toBeLessThan(0);
  });

  it("serie: T1E12 va antes que T2E5 (no compara solo el episodio)", () => {
    const a = n({ season: 1, episode: 12 });
    const b = n({ season: 2, episode: 5 });
    expect(compareNotes("series", a, b)).toBeLessThan(0);
  });

  it("lo anclado va SIEMPRE antes que lo suelto, aunque lo suelto sea más nuevo", () => {
    const anchored = n({ page: 5 }, "2020-01-01");
    const loose = n({}, "2026-12-31");
    expect(compareNotes("book", anchored, loose)).toBeLessThan(0);
    expect(compareNotes("book", loose, anchored)).toBeGreaterThan(0);
  });

  it("entre sueltas, la más nueva primero", () => {
    const older = n({}, "2026-01-01");
    const newer = n({}, "2026-06-01");
    expect(compareNotes("book", newer, older)).toBeLessThan(0);
  });

  it("película: no hay anclaje, todo cae al grupo suelto por fecha", () => {
    const older = n({}, "2026-01-01");
    const newer = n({}, "2026-06-01");
    expect(compareNotes("movie", newer, older)).toBeLessThan(0);
  });

  it("empate de posición: desempata por fecha, la más nueva primero", () => {
    const a = n({ page: 10 }, "2026-06-01");
    const b = n({ page: 10 }, "2026-01-01");
    expect(compareNotes("book", a, b)).toBeLessThan(0);
  });

  it("es un comparador consistente: ordenar una lista mezclada", () => {
    const list = [
      n({}, "2026-03-01"),
      n({ page: 240 }),
      n({ page: 12 }),
      n({}, "2026-09-01"),
    ];
    const sorted = [...list].sort((x, y) => compareNotes("book", x, y));
    expect(sorted.map((s) => ("page" in s.position ? s.position.page : s.createdAt))).toEqual([
      12,
      240,
      "2026-09-01",
      "2026-03-01",
    ]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

```bash
fnm use 22 && npx vitest run src/lib/notes/sort.test.ts
```

Esperado: FAIL, «Failed to resolve import "./sort"».

- [ ] **Step 3: Implementar**

`src/lib/notes/sort.ts`:

```ts
import type { ItemType } from "@/lib/catalog/types";
import { comparePositions, type Position } from "@/lib/library/position";

export type SortableNote = { position: Position; createdAt: string };

// ¿Esta nota está anclada a algún sitio? Una posición vacía ({}) es lo que
// devuelve parsePosition cuando el jsonb no dice nada útil, y lo que tiene
// SIEMPRE una película.
function isAnchored(position: Position): boolean {
  if ("page" in position && position.page !== undefined) return true;
  if ("season" in position) return true;
  return false;
}

// Orden de "Mis notas y citas": primero lo anclado en orden de lectura —
// recorres la obra de principio a fin, que es de lo que trata releer— y después
// lo suelto por fecha descendente.
//
// La comparación de posiciones NO se reimplementa aquí: se delega en
// comparePositions (src/lib/library/position.ts), que ya sabe que T2E5 va
// después de T1E12 y está duplicada a propósito en SQL para los checkpoints de
// clubes. Una tercera copia sería la tercera verdad sobre lo mismo.
export function compareNotes(
  itemType: ItemType,
  a: SortableNote,
  b: SortableNote,
): number {
  const aAnchored = isAnchored(a.position);
  const bAnchored = isAnchored(b.position);

  if (aAnchored !== bAnchored) return aAnchored ? -1 : 1;

  if (aAnchored && bAnchored) {
    const byPosition = comparePositions(itemType, a.position, b.position);
    if (byPosition !== 0) return byPosition;
  }

  // Desempate (y orden único del grupo suelto): la más nueva primero.
  return b.createdAt.localeCompare(a.createdAt);
}
```

- [ ] **Step 4: Verificar que pasan**

```bash
fnm use 22 && npx vitest run src/lib/notes/sort.test.ts
```

Esperado: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes/sort.ts src/lib/notes/sort.test.ts
git commit -m "feat(notas): orden por posicion sobre comparePositions"
```

---

### Task 4: Ensanchar el tipo `Note` y la lectura

Arregla el defecto preexistente §0.1 de la spec: hoy `getNotes` devuelve `page: number | null`, así que **una nota anclada a T2·E5 se guarda bien y se lee como «sin posición»**.

**Files:**
- Modify: `src/lib/notes/types.ts`
- Modify: `src/lib/notes/get-notes.ts`
- Modify: `src/components/notes/memorize-card.tsx:43`
- Modify: `src/app/api/og/nota/[id]/route.tsx:58`

**Interfaces:**
- Consumes: `parsePosition`, `formatPosition`, `Position` de `src/lib/library/position.ts`.
- Produces: el tipo `Note` con `position: Position; tags: string[]; isSpoiler: boolean; isPublic: boolean` (ya **no** existe `Note.page`), y `export async function getNotesForItem(supabase, userId, itemType, itemId): Promise<Note[]>`. Los usan las Tareas 8 y 9.

- [ ] **Step 1: Ensanchar el tipo**

En `src/lib/notes/types.ts`, sustituye el campo `page` y añade los tres nuevos:

```ts
import type { ItemType } from "@/lib/catalog/types";
import type { Position } from "@/lib/library/position";

export type NoteKind = "note" | "quote";

export type Note = {
  id: string;
  itemType: ItemType;
  itemId: string;
  kind: NoteKind;
  body: string;
  // El anclaje, con la MISMA forma que passes.position: {page} en libro,
  // {season,episode} en serie, {} en película o sin anclar. Antes esto era
  // `page: number | null`, que tiraba en silencio las posiciones de serie.
  position: Position;
  isFavorite: boolean;
  // meta.tags, ya normalizado (ver src/lib/notes/tags.ts).
  tags: string[];
  isSpoiler: boolean;
  // Se escribe, pero NADIE ajeno lo lee todavía: no hay política RLS de lectura
  // pública. Ver la spec, D3.
  isPublic: boolean;
  createdAt: string;
  itemTitle: string | null;
};

export type NoteCounts = {
  quotes: number;
  notes: number;
  favorites: number;
  total: number;
};
```

- [ ] **Step 2: Proyectar las columnas nuevas en la lectura**

En `src/lib/notes/get-notes.ts`:

1. Borra la función `pageOf` entera (líneas 19-22): la sustituye `parsePosition` directo.
2. Cambia el tipo `Row` para incluir `meta: unknown; is_spoiler: boolean; is_public: boolean`.
3. En **las dos** consultas (`getNotes` y `getNoteById`), cambia el `select` a:

```ts
"id, item_type, item_id, kind, body, position, is_favorite, meta, is_spoiler, is_public, created_at"
```

4. Añade este ayudante junto a los imports, y úsalo en los dos `return` que construyen un `Note`:

```ts
// meta es jsonb opaco: lo que la BD garantiza es que es un objeto, no que
// tenga tags ni que sean strings. Se valida aquí, en el borde de lectura.
function tagsOf(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const raw = (meta as Record<string, unknown>).tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string");
}
```

5. Sustituye `page: pageOf(r.position, r.item_type),` por, en los dos sitios:

```ts
    position: parsePosition(r.item_type, r.position),
    tags: tagsOf(r.meta),
    isSpoiler: r.is_spoiler,
    isPublic: r.is_public,
```

- [ ] **Step 3: Añadir `getNotesForItem`**

Al final de `src/lib/notes/get-notes.ts`. No resuelve títulos del catálogo: quien la llama ya está EN la ficha de la obra y sabe el título.

```ts
// Las notas del usuario para UNA obra, para la lista de la ficha. Sin orden en
// SQL: lo pone compareNotes en el cliente del servidor (src/lib/notes/sort.ts),
// porque ordenar por un jsonb con dos formas distintas desde SQL exigiría un
// índice de expresión por tipo de ítem para nada.
//
// Nota: cuelgan del ÍTEM, no del pase, así que esto trae también las notas de
// relecturas anteriores — que es lo que queremos (cada tarjeta lleva su fecha).
export async function getNotesForItem(
  supabase: SupabaseServerClient,
  userId: string,
  itemType: ItemType,
  itemId: string,
): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(
      "id, item_type, item_id, kind, body, position, is_favorite, meta, is_spoiler, is_public, created_at",
    )
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);

  if (error) throw error;

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    itemType: r.item_type,
    itemId: r.item_id,
    kind: r.kind,
    body: r.body,
    position: parsePosition(r.item_type, r.position),
    isFavorite: r.is_favorite,
    tags: tagsOf(r.meta),
    isSpoiler: r.is_spoiler,
    isPublic: r.is_public,
    createdAt: r.created_at,
    itemTitle: null,
  }));
}
```

- [ ] **Step 4: Arreglar los dos consumidores de `note.page`**

Los dos pintan «p. 42» y **se comen el anclaje de las series**. `formatPosition` ya existe y devuelve `Pág. 42` o `T2E5`.

En `src/components/notes/memorize-card.tsx`, importa `formatPosition` de `@/lib/library/position` y sustituye la línea 43:

```ts
    formatPosition(note.itemType, note.position),
```

En `src/app/api/og/nota/[id]/route.tsx`, importa igual y sustituye en la línea 58:

```ts
  const meta = [note.itemTitle?.toUpperCase(), formatPosition(note.itemType, note.position)]
```

- [ ] **Step 5: Verificar que no queda ningún uso de `Note.page`**

```bash
npx tsc --noEmit
```

Esperado: sin errores. Si aparece «Property 'page' does not exist on type 'Note'», es un consumidor que se te ha pasado — arréglalo con `formatPosition` igual que los dos de arriba.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notes/types.ts src/lib/notes/get-notes.ts src/components/notes/memorize-card.tsx "src/app/api/og/nota/[id]/route.tsx"
git commit -m "fix(notas): el tipo Note conserva la posicion de serie, no solo la pagina"
```

---

### Task 5: `NoteComposer`

**Files:**
- Create: `src/components/notes/note-composer.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Produces:

```ts
export type NoteAnchor =
  | { kind: "page"; page: number | null }
  | { kind: "episode"; season: number; episode: number }
  | { kind: "none" };

export function NoteComposer(props: {
  /** Anclaje sugerido. En la hoja de sesión lo manda el campo VIVO. */
  anchor: NoteAnchor;
  /** Texto bajo el anclaje: de dónde ha salido. Ya traducido. */
  anchorHint?: string;
  /** Plegado por defecto en la hoja (la hoja ya mide 848px de scroll). */
  defaultOpen?: boolean;
  /** Avisa al padre de si hay texto, para que el footer cambie de rótulo. */
  onHasBodyChange?: (hasBody: boolean) => void;
}): JSX.Element
```

- Consumes: nada de tareas anteriores. **No renderiza `<form>`**: sus campos viajan en el form de quien lo monte.

**Nombres del `FormData`** (contrato con las Tareas 6 y 7 — respétalos exactamente):

| Campo | `name` |
|---|---|
| Cuerpo | `note` |
| Tipo | `noteKind` (`quote` \| `note`) |
| Favorita | `noteFavorite` |
| Etiquetas | `noteTags` |
| Spoiler | `noteSpoiler` |
| Compartible | `notePublic` |
| Anclaje libro | `notePage` |
| Anclaje serie | `noteSeason` + `noteEpisode` |

> **Por qué el cuerpo se llama `note` y no `noteBody`:** `addSession` ya lee
> `formData.get("note")` (`src/lib/sessions/actions.ts:76`) y con ese valor escribe
> **también** `progress_sessions.note`, que es lo que pinta la lista de sesiones.
> Renombrarlo rompería esa columna en silencio. Los demás campos sí van prefijados
> porque conviven con los de la sesión (`page`, `status`, `season`, `episodes`).

- [ ] **Step 1: Añadir las claves de i18n**

En `messages/es.json`, dentro de `notes`, añade (conserva las que ya hay):

```json
  "composerTitle": "Anota este momento",
  "composerToggle": "Añadir una nota o cita",
  "anchorLabel": "Anclada a",
  "anchorEdit": "Editar",
  "anchorNone": "Sin anclar",
  "anchorFromSession": "Tomada de tu marca de sesión",
  "anchorFromPass": "Tu posición actual",
  "anchorPage": "Pág. {page}",
  "anchorEpisode": "T{season} · E{episode}",
  "tagsLabel": "Etiquetas",
  "tagsPlaceholder": "personaje, estilo (separadas por comas)",
  "spoilerLabel": "Marcar como spoiler",
  "spoilerHint": "Se velará a quien no haya llegado aquí, aunque esté en esta página.",
  "publicLabel": "Compartible",
  "publicHint": "Se guarda marcada para cuando exista el muro público. Por ahora nadie más la ve.",
  "quotePlaceholder": "La frase, tal cual…",
  "notePlaceholder": "Lo que has pensado…"
```

> El texto de `publicHint` **no puede prometer visibilidad** (constraint global). Si lo reescribes, mantén esa promesa intacta.

- [ ] **Step 2: Crear el compositor**

`src/components/notes/note-composer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export type NoteAnchor =
  | { kind: "page"; page: number | null }
  | { kind: "episode"; season: number; episode: number }
  | { kind: "none" };

// El compositor de notas y citas. NO renderiza <form>: dentro de la hoja de
// sesión iría anidado dentro del <form> de la sesión, y un form dentro de otro
// es HTML ilegal — el navegador lo desmonta y pierdes campos sin avisar. Pinta
// campos sueltos y cada montaje decide quién envía, igual que ya hacen
// BookProgressField y SeriesEpisodeGrid dentro de la misma hoja.
export function NoteComposer({
  anchor,
  anchorHint,
  defaultOpen = false,
  onHasBodyChange,
}: {
  anchor: NoteAnchor;
  anchorHint?: string;
  defaultOpen?: boolean;
  onHasBodyChange?: (hasBody: boolean) => void;
}) {
  const t = useTranslations("notes");
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<"note" | "quote">("quote");
  const [body, setBody] = useState("");
  // El anclaje llega sugerido pero es editable: la frase puede ser de tres
  // páginas atrás. Se guarda como texto para no pelearse con el campo a medio
  // escribir (mismo criterio que el stepper de BookProgressField).
  const [page, setPage] = useState(
    anchor.kind === "page" && anchor.page !== null ? String(anchor.page) : "",
  );
  const [editingAnchor, setEditingAnchor] = useState(false);

  function changeBody(next: string) {
    setBody(next);
    onHasBodyChange?.(next.trim().length > 0);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-start rounded-full border border-border px-4 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted"
      >
        ✎ {t("composerToggle")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
        {t("composerTitle")}
      </span>

      {/* Segmento cita/nota. El input radio va oculto pero presente: es él
          quien viaja en el FormData como `noteKind`. */}
      <div className="flex gap-1 self-start rounded-[9px] bg-surface-muted p-1">
        {(["quote", "note"] as const).map((k) => (
          <label
            key={k}
            className="cursor-pointer rounded-[6px] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground has-[:checked]:bg-surface has-[:checked]:text-foreground has-[:checked]:shadow-card"
          >
            <input
              type="radio"
              name="noteKind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="sr-only"
            />
            {k === "quote" ? t("kindQuote") : t("kindNote")}
          </label>
        ))}
      </div>

      {/* La cita se escribe en serif itálica y la nota en la tipografía normal:
          la forma dice de qué tipo es antes de leer el segmento. */}
      <textarea
        name="note"
        rows={3}
        value={body}
        onChange={(e) => changeBody(e.target.value)}
        placeholder={kind === "quote" ? t("quotePlaceholder") : t("notePlaceholder")}
        aria-label={t("bodyLabel")}
        className={`rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${
          kind === "quote" ? "font-serif text-[15px] italic" : ""
        }`}
      />

      {/* Anclaje. En serie no es editable a mano: sale de los episodios que
          acabas de marcar y se manda en hidden — pedir "temporada y episodio"
          por teclado aquí sería una tercera forma de decir lo mismo. */}
      {anchor.kind === "episode" ? (
        <>
          <p className="text-[11.5px] text-muted-foreground">
            {t("anchorLabel")}:{" "}
            <b className="text-foreground">
              {t("anchorEpisode", { season: anchor.season, episode: anchor.episode })}
            </b>
            {anchorHint && <span className="block text-[10.5px]">{anchorHint}</span>}
          </p>
          <input type="hidden" name="noteSeason" value={anchor.season} />
          <input type="hidden" name="noteEpisode" value={anchor.episode} />
        </>
      ) : anchor.kind === "page" ? (
        editingAnchor ? (
          <Field label={t("anchorLabel")} htmlFor="note-page">
            <Input
              id="note-page"
              name="notePage"
              type="number"
              min={0}
              inputMode="numeric"
              value={page}
              onChange={(e) => setPage(e.target.value)}
            />
          </Field>
        ) : (
          <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span>
              {t("anchorLabel")}:{" "}
              <b className="text-foreground">
                {page ? t("anchorPage", { page: Number(page) }) : t("anchorNone")}
              </b>
              {anchorHint && <span className="block text-[10.5px]">{anchorHint}</span>}
            </span>
            <button
              type="button"
              onClick={() => setEditingAnchor(true)}
              className="text-accent underline"
            >
              {t("anchorEdit")}
            </button>
            <input type="hidden" name="notePage" value={page} />
          </p>
        )
      ) : null}

      <Field label={t("tagsLabel")} htmlFor="note-tags">
        <Input
          id="note-tags"
          name="noteTags"
          type="text"
          placeholder={t("tagsPlaceholder")}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
        <input type="checkbox" name="noteFavorite" className="h-4 w-4 rounded border-border accent-accent" />
        {t("favorite")}
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted-foreground">
        <input type="checkbox" name="noteSpoiler" className="mt-0.5 h-4 w-4 rounded border-border accent-accent" />
        <span>
          {t("spoilerLabel")}
          <span className="block text-[10.5px]">{t("spoilerHint")}</span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted-foreground">
        <input type="checkbox" name="notePublic" className="mt-0.5 h-4 w-4 rounded border-border accent-accent" />
        <span>
          {t("publicLabel")}
          <span className="block text-[10.5px]">{t("publicHint")}</span>
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint src/components/notes/note-composer.tsx
```

Esperado: sin errores en ninguno de los dos.

- [ ] **Step 4: Commit**

```bash
git add src/components/notes/note-composer.tsx messages/es.json
git commit -m "feat(notas): NoteComposer, campos sin form propio"
```

---

### Task 6: Montaje 2 — la ficha

**Files:**
- Modify: `src/lib/notes/actions.ts`
- Modify: `src/components/detail/log-panel.tsx:404-409`
- Delete: `src/components/notes/add-note-form.tsx`
- Create: `src/components/notes/note-form.tsx`

**Interfaces:**
- Consumes: `NoteComposer` y `NoteAnchor` (Tarea 5), `normalizeTags` (Tarea 2).
- Produces: `export function NoteForm({ itemType, itemId, anchor }: { itemType: ItemType; itemId: string; anchor: NoteAnchor }): JSX.Element` — el envoltorio con `<form>` que usa la ficha.

- [ ] **Step 1: Extender `addNote`**

En `src/lib/notes/actions.ts` hay **dos** cambios.

Primero, el nombre del campo del cuerpo. Hoy lee `formData.get("body")`, pero el compositor lo manda como `note` (ver la tabla de nombres de la Tarea 5). Cambia la línea 34:

```ts
  const body = String(formData.get("note") ?? "").trim();
```

Segundo, importa `normalizeTags` desde `./tags` y sustituye el bloque que va desde `const kind = ...` hasta el `insert` por:

```ts
  const kind = formData.get("noteKind") === "quote" ? "quote" : "note";
  const isFavorite = formData.get("noteFavorite") === "on";
  const isSpoiler = formData.get("noteSpoiler") === "on";
  // Se guarda la intención; NADIE ajeno lo lee todavía (no hay política RLS de
  // lectura pública). Ver la spec 2026-07-21, D3.
  const isPublic = formData.get("notePublic") === "on";
  const tags = normalizeTags(String(formData.get("noteTags") ?? ""));

  // Anclaje. Un valor ilegible NO tumba el guardado: una nota sin página sigue
  // siendo una nota, y perder el texto por un número mal escrito es la peor de
  // las dos pérdidas.
  let position: Record<string, number> | null = null;
  const pageRaw = String(formData.get("notePage") ?? "").trim();
  const seasonRaw = String(formData.get("noteSeason") ?? "").trim();
  const episodeRaw = String(formData.get("noteEpisode") ?? "").trim();
  if (pageRaw) {
    const page = Number(pageRaw);
    if (Number.isInteger(page) && page >= 0) position = { page };
  } else if (seasonRaw && episodeRaw) {
    const season = Number(seasonRaw);
    const episode = Number(episodeRaw);
    if (Number.isInteger(season) && season >= 0 && Number.isInteger(episode) && episode >= 0) {
      position = { season, episode };
    }
  }

  const { error } = await supabase.from("notes").insert({
    user_id: user.id,
    item_type: itemType,
    item_id: itemId,
    kind,
    body,
    position,
    is_favorite: isFavorite,
    is_spoiler: isSpoiler,
    is_public: isPublic,
    meta: { tags },
  });
```

- [ ] **Step 2: Crear el envoltorio con `<form>`**

`src/components/notes/note-form.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { addNote, type AddNoteState } from "@/lib/notes/actions";
import { NoteComposer, type NoteAnchor } from "./note-composer";

const initialState: AddNoteState = {};

// El compositor en la ficha: aquí SÍ es dueño de un <form> propio, porque no
// hay ningún otro por encima (a diferencia de la hoja de sesión). Sustituye a
// AddNoteForm, que duplicaba estos campos con menos.
export function NoteForm({
  itemType,
  itemId,
  anchor,
}: {
  itemType: ItemType;
  itemId: string;
  anchor: NoteAnchor;
}) {
  const t = useTranslations("notes");
  const boundAdd = addNote.bind(null, itemType, itemId);
  const [state, formAction, pending] = useActionState(boundAdd, initialState);
  const [hasBody, setHasBody] = useState(false);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
    >
      <NoteComposer
        anchor={anchor}
        anchorHint={anchor.kind === "page" ? t("anchorFromPass") : undefined}
        onHasBodyChange={setHasBody}
      />

      {state.error && (
        <p className="text-sm text-status-dropped">
          {state.error === "empty" ? t("errorEmpty") : t("errorGeneric")}
        </p>
      )}

      {hasBody && (
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? t("saving") : t("save")}
        </Button>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Cambiar el montaje de la ficha**

En `src/components/detail/log-panel.tsx`, sustituye el import de la línea 13:

```ts
import { NoteForm } from "@/components/notes/note-form";
```

Y el bloque de las líneas 404-409 por:

```tsx
          {/* Añadir a Memorizar sin sesión (P7): también para películas. El
              anclaje arranca en la posición actual del pase si es un libro. */}
          <div className="order-7">
            <NoteForm
              itemType={itemType}
              itemId={itemId}
              anchor={
                itemType === "book" ? { kind: "page", page: page ?? null } : { kind: "none" }
              }
            />
          </div>
```

> **No calcules la página tú.** Ese componente ya tiene una `let page: number | undefined` en el mismo ámbito (líneas 283-290), derivada de `entry.position` con exactamente esta comprobación. Reutilízala. La prop se llama `entry`, no `position`: `position` a secas no existe ahí y el código no compilaría.

- [ ] **Step 4: Borrar el formulario viejo**

```bash
git rm src/components/notes/add-note-form.tsx
```

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npx eslint src/lib/notes/actions.ts src/components/notes/note-form.tsx src/components/detail/log-panel.tsx
```

Esperado: sin errores. Si `tsc` se queja de un import de `AddNoteForm` en algún sitio más, sustitúyelo por `NoteForm` con el mismo criterio de anclaje.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/notes src/components/notes src/components/detail/log-panel.tsx
git commit -m "feat(notas): el compositor sustituye a AddNoteForm en la ficha"
```

---

### Task 7: Montaje 1 — la hoja de sesión y el anclaje vivo

El corazón del ciclo, y donde está el bug más probable de todo el plan: **si el anclaje lee la posición guardada del pase en vez del campo vivo, anotas en la 240 y se guarda 180.**

**Files:**
- Modify: `src/components/session/book-progress-field.tsx`
- Modify: `src/components/session/series-episode-grid.tsx`
- Modify: `src/components/session/session-sheet.tsx`
- Modify: `src/lib/sessions/actions.ts:176-193`

**Interfaces:**
- Consumes: `NoteComposer`, `NoteAnchor` (Tarea 5), `normalizeTags` (Tarea 2).
- Produces: `BookProgressField` con `onPageChange?: (page: number | null) => void`; `SeriesEpisodeGrid` con `onNewlyMarkedChange: (count: number, last: { season: number; episode: number } | null) => void`.

- [ ] **Step 1: `BookProgressField` reporta la página viva**

En `src/components/session/book-progress-field.tsx`:

1. Añade la prop al tipo, con su comentario:

```ts
  /** La página que el usuario está marcando AHORA, para que el anclaje del
   *  compositor la siga. No se usa para enviar nada: el input `name="page"`
   *  sigue siendo la única fuente de la posición de la sesión. */
  onPageChange?: (page: number | null) => void;
```

2. Envuelve las **dos** escrituras del estado en una función que avisa. Sustituye `setToPage` en `setPage` y en el `onChange` del input por:

```ts
  function updatePage(next: string) {
    setToPage(next);
    const parsed = next.trim() === "" ? null : Number(next);
    onPageChange?.(parsed !== null && Number.isFinite(parsed) ? parsed : null);
  }

  function setPage(next: number) {
    updatePage(String(clampPage(next, total)));
  }
```

y en el `<Input name="page">`, `onChange={(e) => updatePage(e.target.value)}`.

> Avisa desde el manejador, **nunca desde un `useEffect`**: setState del padre dentro de un efecto del hijo dispara `react-hooks/set-state-in-effect`, que este repo tiene como error. Es el mismo patrón que ya documenta `SeriesEpisodeGrid` en su prop `onNewlyMarkedChange`.

- [ ] **Step 2: `SeriesEpisodeGrid` reporta el último episodio**

En `src/components/session/series-episode-grid.tsx`, cambia la firma de la prop y las **tres** llamadas:

```ts
  /** El footer de SessionSheet pinta «Guardar · N episodios» con el número, y
      el compositor ancla la nota en `last`. Se llama desde los manejadores de
      evento, NUNCA desde un efecto. */
  onNewlyMarkedChange: (
    count: number,
    last: { season: number; episode: number } | null,
  ) => void;
```

En `handleSeasonChange`: `onNewlyMarkedChange(0, null);`

En `toggle`, sustituye la llamada por:

```ts
    const newly = [...next].filter((e) => !initialWatched.has(e));
    onNewlyMarkedChange(
      newly.length,
      newly.length > 0 ? { season, episode: Math.max(...newly) } : null,
    );
```

> El anclaje es el episodio más alto **de los marcados en esta sesión**, no de `selected` entero: `selected` arranca con todo lo ya visto, así que usarlo anclaría la nota al final de la temporada aunque solo hayas marcado el episodio 3.

- [ ] **Step 3: Montar el compositor en la hoja**

En `src/components/session/session-sheet.tsx`:

1. Importa `NoteComposer` y `NoteAnchor` de `@/components/notes/note-composer`.
2. Junto a `const [newlyMarkedCount, setNewlyMarkedCount] = useState(0);`, añade:

```ts
  // El anclaje del compositor sigue al campo VIVO, no a `position` (la posición
  // GUARDADA del pase). Si leyera `position`, anotarías en la 240 y se
  // guardaría la 180: es el defecto más probable de esta pantalla y tiene e2e
  // propio (e2e/notas-captura.spec.ts).
  const [livePage, setLivePage] = useState<number | null>(currentPage);
  const [lastEpisode, setLastEpisode] = useState<{ season: number; episode: number } | null>(null);
  const [noteHasBody, setNoteHasBody] = useState(false);

  const noteAnchor: NoteAnchor =
    itemType === "book"
      ? { kind: "page", page: livePage }
      : lastEpisode
        ? { kind: "episode", season: lastEpisode.season, episode: lastEpisode.episode }
        : { kind: "none" };
```

3. Pasa los callbacks:

```tsx
            <BookProgressField
              passId={passId}
              fromPage={currentPage}
              total={total}
              initialMinutes={initialMinutes}
              onPageChange={setLivePage}
            />
```

```tsx
            <SeriesEpisodeGrid
              seasons={seriesEpisodes ?? []}
              initialSeason={defaultSeason}
              onNewlyMarkedChange={(count, last) => {
                setNewlyMarkedCount(count);
                setLastEpisode(last);
              }}
            />
```

4. Monta el compositor **justo antes** del `<details>` del estado, dentro del mismo div de campos:

```tsx
          <NoteComposer
            anchor={noteAnchor}
            anchorHint={t("noteAnchorHint")}
            onHasBodyChange={setNoteHasBody}
          />
```

5. En el footer, el rótulo del botón cambia cuando hay texto. Sustituye la expresión del `<Button>` por:

```tsx
            {pending
              ? t("submitting")
              : noteHasBody
                ? t("submitWithNote")
                : itemType === "series" && newlyMarkedCount > 0
                  ? t("submitEpisodes", { count: newlyMarkedCount })
                  : t("submit")}
```

6. En `messages/es.json`, dentro de `session`:

```json
  "submitWithNote": "Guardar sesión y cita",
  "noteAnchorHint": "Tomada de tu marca de sesión"
```

- [ ] **Step 4: Revivir el bloque muerto del servidor**

En `src/lib/sessions/actions.ts`, importa `normalizeTags` desde `@/lib/notes/tags` y sustituye el bloque `if (note) { ... }` (líneas 176-193) por:

```ts
  // Memorizar: si la sesión trae nota, entra también en `notes`. Doble
  // escritura deliberada — la columna vieja progress_sessions.note sigue en su
  // sitio y es lo que pinta la lista de sesiones.
  //
  // El anclaje por defecto ES `sessionPosition` (la posición de esta sesión),
  // pero el compositor puede haberlo sobrescrito: la frase puede ser de tres
  // páginas atrás. Por eso `notePage`/`noteSeason`+`noteEpisode` mandan si
  // vienen y son válidos.
  if (note) {
    const noteKind = formData.get("noteKind") === "quote" ? "quote" : "note";
    const noteFavorite = formData.get("noteFavorite") === "on";
    const noteSpoiler = formData.get("noteSpoiler") === "on";
    // Se guarda la intención; nadie ajeno lo lee todavía (sin política RLS de
    // lectura pública). Ver la spec 2026-07-21, D3.
    const notePublic = formData.get("notePublic") === "on";
    const noteTags = normalizeTags(String(formData.get("noteTags") ?? ""));

    let notePosition: Position = sessionPosition;
    const notePageRaw = String(formData.get("notePage") ?? "").trim();
    const noteSeasonRaw = String(formData.get("noteSeason") ?? "").trim();
    const noteEpisodeRaw = String(formData.get("noteEpisode") ?? "").trim();
    if (itemType === "book" && notePageRaw) {
      const p = Number(notePageRaw);
      if (Number.isInteger(p) && p >= 0) notePosition = { page: p };
    } else if (itemType === "series" && noteSeasonRaw && noteEpisodeRaw) {
      const s = Number(noteSeasonRaw);
      const e = Number(noteEpisodeRaw);
      if (Number.isInteger(s) && s >= 0 && Number.isInteger(e) && e >= 0) {
        notePosition = { season: s, episode: e };
      }
    }

    // La sesión MANDA: si la nota falla, NO se revierte nada. Has leído 60
    // páginas y eso es un hecho; perder el progreso por un fallo al escribir
    // texto es la peor de las dos pérdidas (spec D6). El fallo se devuelve
    // aparte para que la hoja no se cierre y puedas copiar el texto.
    const { error: noteError } = await supabase.from("notes").insert({
      user_id: user.id,
      item_type: itemType,
      item_id: itemId,
      pass_id: passId,
      session_id: inserted.id,
      kind: noteKind,
      body: note,
      position: notePosition,
      is_favorite: noteFavorite,
      is_spoiler: noteSpoiler,
      is_public: notePublic,
      meta: { tags: noteTags },
    });
    if (noteError) noteFailed = true;
  }
```

Declara `let noteFailed = false;` justo antes del bloque, añade `noteFailed?: boolean` al tipo `AddSessionState` (con un comentario que diga que la sesión SÍ se guardó), y devuélvelo en los **dos** `return` finales:

```ts
    return { ok: true, passClosed: true, noteFailed };
```
```ts
  return { ok: true, noteFailed };
```

- [ ] **Step 5: No cerrar la hoja si la nota falló**

En `session-sheet.tsx`, el efecto que cierra al guardar tiene que respetarlo:

```ts
  useEffect(() => {
    if (!state.ok || state.passClosed || state.noteFailed) return;
    closeSheet();
  }, [state, closeSheet]);
```

Y pinta el aviso junto al error existente:

```tsx
          {state.noteFailed && (
            <p className="text-sm text-status-dropped">{t("noteFailed")}</p>
          )}
```

con la clave, en `session`:

```json
  "noteFailed": "La sesión se guardó, pero la nota no. Copia el texto antes de cerrar."
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npx eslint src/components/session src/lib/sessions/actions.ts
```

Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/session src/lib/sessions/actions.ts messages/es.json
git commit -m "feat(notas): compositor en la hoja de sesion con anclaje vivo"
```

---

### Task 8: «Mis notas y citas» en la ficha

**Files:**
- Create: `src/components/notes/note-card.tsx`
- Create: `src/components/notes/notes-section.tsx`
- Modify: `messages/es.json`
- Modify: `src/app/libro/[id]/page.tsx`, `src/app/serie/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`

**Interfaces:**
- Consumes: `getNotesForItem` (Tarea 4), `compareNotes` (Tarea 3), `Note` (Tarea 4), `deleteNote`/`toggleNoteFavorite` (ya existen en `src/lib/notes/actions.ts`).
- Produces: `export async function NotesSection({ userId, itemType, itemId }: { userId: string; itemType: ItemType; itemId: string }): Promise<JSX.Element | null>`.

**Se monta como HERMANO de `log-panel`, nunca dentro:** ese fichero ya orquesta estado, progreso, sesiones y diario a la vez y está señalado para rehacerse.

- [ ] **Step 1: Claves de i18n**

En `messages/es.json`, dentro de `notes`:

```json
  "sectionTitle": "Mis notas y citas",
  "sectionEmpty": "Aún no has anotado nada de esta obra. Puedes hacerlo mientras registras una sesión.",
  "spoilerBadge": "Spoiler",
  "publicBadge": "Compartible",
  "delete": "Borrar",
  "favoriteOn": "Quitar de favoritas",
  "favoriteOff": "Marcar como favorita"
```

- [ ] **Step 2: La tarjeta**

`src/components/notes/note-card.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Note } from "@/lib/notes/types";
import { formatPosition } from "@/lib/library/position";
import { deleteNote, toggleNoteFavorite } from "@/lib/notes/actions";

// Dos tratamientos por `kind` (mockup): la cita es protagonista en serif, la
// nota es una tarjeta normal. Tus propias notas NUNCA se te velan: el spoiler
// es información sobre terceros y su velo llega en F2, con el progreso del
// visitante. Aquí solo se distingue.
export function NoteCard({ note }: { note: Note }) {
  const t = useTranslations("notes");
  const [pending, startTransition] = useTransition();
  const anchor = formatPosition(note.itemType, note.position);

  return (
    <article
      className={`flex flex-col gap-2 rounded-card border border-border p-4 ${
        note.kind === "quote" ? "bg-surface-muted" : "bg-surface"
      }`}
    >
      <p
        className={
          note.kind === "quote"
            ? "font-serif text-[16px] leading-snug italic text-foreground"
            : "text-sm text-foreground"
        }
      >
        {note.body}
      </p>

      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
        {anchor && <span className="text-accent">{anchor}</span>}
        <span>{note.createdAt.slice(0, 10)}</span>
        {note.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-surface-3 px-2 py-0.5">
            #{tag}
          </span>
        ))}
        {note.isSpoiler && (
          <span className="rounded-full border border-border px-2 py-0.5">{t("spoilerBadge")}</span>
        )}
        {note.isPublic && (
          <span className="rounded-full border border-border px-2 py-0.5">{t("publicBadge")}</span>
        )}
      </div>

      <div className="flex gap-3 text-[11.5px]">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => toggleNoteFavorite(note.id, !note.isFavorite))}
          className="text-muted-foreground underline disabled:opacity-50"
        >
          {note.isFavorite ? t("favoriteOn") : t("favoriteOff")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => deleteNote(note.id))}
          className="text-status-dropped underline disabled:opacity-50"
        >
          {t("delete")}
        </button>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: La sección**

`src/components/notes/notes-section.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getNotesForItem } from "@/lib/notes/get-notes";
import { compareNotes } from "@/lib/notes/sort";
import { NoteCard } from "./note-card";

// «Mis notas y citas» de UNA obra, ordenadas por posición: recorres la obra de
// principio a fin, que es de lo que trata releer. Componente propio y hermano
// de log-panel — NUNCA dentro: ese fichero ya orquesta estado, progreso,
// sesiones y diario a la vez.
//
// Las notas cuelgan del ítem, así que una relectura mezcla las suyas con las de
// la primera. No se agrupa por pase: cada tarjeta lleva su fecha y eso basta.
export async function NotesSection({
  userId,
  itemType,
  itemId,
}: {
  userId: string;
  itemType: ItemType;
  itemId: string;
}) {
  const t = await getTranslations("notes");
  const supabase = await createClient();
  const notes = await getNotesForItem(supabase, userId, itemType, itemId);
  const sorted = [...notes].sort((a, b) => compareNotes(itemType, a, b));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-lg font-semibold tracking-tight">{t("sectionTitle")}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sectionEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Montarla en las tres fichas**

En `src/app/libro/[id]/page.tsx`, `serie/[id]/page.tsx` y `pelicula/[id]/page.tsx`, dentro del bloque de la pestaña Registro y **después** del `<LogPanel …/>`, con la guarda de sesión que ya usa cada página:

```tsx
        {userId && <NotesSection userId={userId} itemType="book" itemId={id} />}
```

(`itemType` literal según la página: `"book"`, `"series"`, `"movie"`.) Usa el nombre de variable del id que ya exista en cada fichero; no inventes uno nuevo.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npx eslint src/components/notes "src/app/libro/[id]/page.tsx" "src/app/serie/[id]/page.tsx" "src/app/pelicula/[id]/page.tsx"
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/notes src/app messages/es.json
git commit -m "feat(notas): Mis notas y citas en la ficha, ordenadas por posicion"
```

---

### Task 9: E2E y verificación en navegador

**Files:**
- Create: `e2e/notas-captura.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.

Sigue el patrón de `e2e/registrar-sesion-v2.spec.ts`: resuelve las fixturas por título vía REST, no encadenes tests entre sí (el fichero `pase-hub.spec.ts` sí lo hace y por eso no se puede correr con `--grep`), y restaura en `try/finally` lo que mutes.

- [ ] **Step 1: Escribir la cabecera y los helpers**

`e2e/notas-captura.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E de notas y citas · Plan A: capturar desde la hoja de sesión con el
// anclaje VIVO, capturar desde la ficha, y releer ordenado por posición.
//
// Independiente de los demás specs a propósito: sin test.describe.serial y sin
// depender de ids que otro test haya creado. Fixtures reales y persistentes de
// `devtest`, resueltas por título (nunca por UUID fijo) para sobrevivir a un
// reset de dev. headers()/devtestId()/login() están copiados de
// registrar-sesion-v2.spec.ts: los specs de e2e no se importan entre sí.

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(60_000);
});

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

let cachedUserId: string | null = null;
async function devtestId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
    { headers: headers() },
  );
  const rows = (await res.json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  cachedUserId = rows[0].user_id;
  return cachedUserId;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function resolveBookFixture(userId: string) {
  const bookRes = await fetch(
    `${SUPABASE_URL}/rest/v1/books?title=eq.${encodeURIComponent("The Final Empire")}&select=id`,
    { headers: headers() },
  );
  const [book] = (await bookRes.json()) as { id: string }[];
  if (!book) throw new Error('no se encontró el libro fixture "The Final Empire"');

  const passRes = await fetch(
    `${SUPABASE_URL}/rest/v1/passes?user_id=eq.${userId}&item_type=eq.book&item_id=eq.${book.id}&is_active=eq.true&select=id,status,position`,
    { headers: headers() },
  );
  const [pass] = (await passRes.json()) as {
    id: string;
    status: string;
    position: unknown;
  }[];
  if (!pass) throw new Error('devtest no tiene pase activo sobre "The Final Empire"');
  return { itemId: book.id, passId: pass.id, snapshot: pass };
}

async function resolveSeriesFixture(userId: string) {
  const seriesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/series?title=eq.${encodeURIComponent("Juego de tronos")}&select=id`,
    { headers: headers() },
  );
  const [series] = (await seriesRes.json()) as { id: string }[];
  if (!series) throw new Error('no se encontró la serie fixture "Juego de tronos"');
  return { itemId: series.id };
}

async function setPassPage(passId: string, page: number) {
  await fetch(`${SUPABASE_URL}/rest/v1/passes?id=eq.${passId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ position: { page }, status: "in_progress" }),
  });
}

async function restorePass(
  passId: string,
  snapshot: { status: string; position: unknown },
) {
  await fetch(`${SUPABASE_URL}/rest/v1/passes?id=eq.${passId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status: snapshot.status, position: snapshot.position }),
  });
}

// `devtest` es una cuenta persistente y compartida: toda nota creada por un
// test se borra en su finally, o envenena las corridas siguientes.
async function deleteNotesByBody(userId: string, body: string) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=eq.${encodeURIComponent(body)}`,
    { method: "DELETE", headers: headers() },
  );
}

async function countNotesByBody(userId: string, body: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=eq.${encodeURIComponent(body)}&select=id`,
    { headers: headers() },
  );
  return ((await res.json()) as unknown[]).length;
}

async function insertNote(
  userId: string,
  itemId: string,
  body: string,
  position: Record<string, number>,
) {
  await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      user_id: userId,
      item_type: "series",
      item_id: itemId,
      kind: "quote",
      body,
      position,
    }),
  });
}

function sessionLink(page: Page, passId: string) {
  const heading = page.getByRole("heading", { name: "Sesiones", level: 3 });
  return heading
    .locator("xpath=..")
    .getByRole("link", { name: /registrar sesión/i })
    .and(page.locator(`[href="/sesion/${passId}"]`));
}

test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
```

- [ ] **Step 2: El test que justifica el ciclo — el anclaje vivo**

Si solo sobrevive un test de este fichero, que sea este.

```ts
test("el anclaje de la nota sigue a la pagina que acabo de marcar, NO a la guardada del pase", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, snapshot } = await resolveBookFixture(userId);
  const BODY = "e2e · anclaje vivo";

  try {
    // El pase se queda en la 180; la sesión va a marcar la 240. Si el
    // compositor leyera la posición GUARDADA en vez del campo vivo, la nota
    // saldría anclada a 180 y este test lo cazaría.
    await setPassPage(passId, 180);

    await page.goto(`/libro/${itemId}?tab=log`);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.locator('input[name="page"]').fill("240");
    await dialog.getByRole("button", { name: /añadir una nota o cita/i }).click();

    // El anclaje sigue al campo, no a la base.
    await expect(dialog.getByText(/Pág\. 240/)).toBeVisible();
    await expect(dialog.getByText(/Pág\. 180/)).toHaveCount(0);

    await dialog.locator('textarea[name="note"]').fill(BODY);
    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Y lo que se guardó es 240.
    await page.goto(`/libro/${itemId}?tab=log`);
    const card = page.getByText(BODY).locator("xpath=ancestor::article");
    await expect(card).toBeVisible();
    await expect(card.getByText(/Pág\. 240/)).toBeVisible();
  } finally {
    await deleteNotesByBody(userId, BODY);
    await restorePass(passId, snapshot);
  }
});
```

- [ ] **Step 3: Capturar desde la ficha y borrar**

```ts
test("capturar desde la ficha sin sesion, y borrar desde la lista", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId } = await resolveBookFixture(userId);
  const BODY = "e2e · captura desde la ficha";

  try {
    await page.goto(`/libro/${itemId}?tab=log`);

    await page.getByRole("button", { name: /añadir una nota o cita/i }).first().click();
    await page.locator('textarea[name="note"]').fill(BODY);
    await page.locator('input[name="noteTags"]').fill("#E2E, e2e");
    await page.getByRole("button", { name: /^guardar$/i }).click();

    const card = page.getByText(BODY).locator("xpath=ancestor::article");
    await expect(card).toBeVisible({ timeout: 15_000 });
    // normalizeTags: minúsculas, sin #, sin duplicadas → una sola etiqueta.
    await expect(card.getByText("#e2e")).toHaveCount(1);

    await card.getByRole("button", { name: /borrar/i }).click();
    await expect(page.getByText(BODY)).toHaveCount(0, { timeout: 15_000 });
    expect(await countNotesByBody(userId, BODY)).toBe(0);
  } finally {
    await deleteNotesByBody(userId, BODY);
  }
});
```

- [ ] **Step 4: El orden con una serie de por medio**

Las notas se siembran por REST: preparar datos por la UI es frágil (`docs/TRAMPAS.md` §15) y aquí lo que se prueba es el ORDEN, no la captura.

```ts
test("el orden es por posicion: T1E12 va antes que T2E5", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId } = await resolveSeriesFixture(userId);
  const EARLY = "e2e · temporada uno episodio doce";
  const LATE = "e2e · temporada dos episodio cinco";

  try {
    // Se insertan al revés a propósito: si el orden fuera el de inserción o el
    // de created_at, saldrían al revés y el test fallaría.
    await insertNote(userId, itemId, LATE, { season: 2, episode: 5 });
    await insertNote(userId, itemId, EARLY, { season: 1, episode: 12 });

    await page.goto(`/serie/${itemId}?tab=log`);

    const bodies = await page
      .locator("article")
      .filter({ hasText: /^e2e · temporada/ })
      .allInnerTexts();
    const earlyAt = bodies.findIndex((b) => b.includes(EARLY));
    const lateAt = bodies.findIndex((b) => b.includes(LATE));
    expect(earlyAt).toBeGreaterThanOrEqual(0);
    expect(earlyAt).toBeLessThan(lateAt);

    // Y el anclaje de serie se PINTA (el defecto preexistente que arregla la
    // Tarea 4: antes se leía como "sin posición").
    await expect(page.getByText("T1E12")).toBeVisible();
  } finally {
    await deleteNotesByBody(userId, EARLY);
    await deleteNotesByBody(userId, LATE);
  }
});
```

- [ ] **Step 5: Guardar una sesión sin nota no crea ninguna fila**

```ts
test("guardar la sesion con el compositor vacio no crea ninguna nota", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, snapshot } = await resolveBookFixture(userId);

  const before = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&item_id=eq.${itemId}&select=id`,
    { headers: headers() },
  );
  const countBefore = ((await before.json()) as unknown[]).length;

  try {
    await setPassPage(passId, 100);
    await page.goto(`/libro/${itemId}?tab=log`);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//);

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="page"]').fill("120");
    // Se despliega el compositor y se deja VACÍO a propósito.
    await dialog.getByRole("button", { name: /añadir una nota o cita/i }).click();
    await dialog.getByRole("button", { name: /^guardar sesión$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    const after = await fetch(
      `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&item_id=eq.${itemId}&select=id`,
      { headers: headers() },
    );
    expect(((await after.json()) as unknown[]).length).toBe(countBefore);
  } finally {
    await restorePass(passId, snapshot);
  }
});
```

- [ ] **Step 6: Correr la suite nueva**

```bash
npm run test:e2e -- e2e/notas-captura.spec.ts
```

Esperado: 5 passed. `npm run test:e2e` reutiliza el dev server que ya haya — no levantes otro.

- [ ] **Step 7: Correr las suites vecinas, que este plan toca**

```bash
npm run test:e2e -- e2e/registrar-sesion-v2.spec.ts e2e/pase-hub.spec.ts
```

Esperado: los 7 de `registrar-sesion-v2` en verde. En `pase-hub` hay **2 fallos preexistentes** que no son tuyos (ver la memoria del proyecto); cualquier fallo NUEVO sí lo es — en particular si tocaste el `name="page"` o el rótulo del botón de guardar.

- [ ] **Step 8: Verificación en navegador, obligatoria**

Tres bugs del ciclo anterior pasaron lint, typecheck, build y revisión de código y **solo cayeron midiendo en navegador**. Con el dev server en el puerto 3000 y el viewport a **390×700**:

1. Abre la hoja de sesión de un libro y despliega el compositor.
2. Comprueba con `getComputedStyle` que el `<form>` sigue teniendo `overflow-y: auto` y que `scrollTop` se puede mover (no fijado en 0).
3. Comprueba que la cabecera pegajosa sigue pintándose por encima: con el hero solapando su franja, `document.elementFromPoint` en mitad de la barra debe devolver un elemento de la cabecera, no del hero.
4. Comprueba que el textarea no desborda la caja ni empuja el footer fuera de la vista.

Si algo de esto falla, **no lo arregles tocando `min-h-0` ni los `shrink-0`**: son las piezas invisibles de dos bugs ya arreglados y quitarlas los reabre.

- [ ] **Step 9: Commit**

```bash
git add e2e/notas-captura.spec.ts
git commit -m "test(notas): e2e de captura, anclaje vivo y orden"
```

---

### Task 10: Cierre documental

**Files:**
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`
- Modify: `docs/requirements/schema-baseline.sql`

Un cambio no está hecho hasta que el doc canónico correspondiente vuelve a ser cierto.

- [ ] **Step 1: Backlog**

En `docs/requirements/backlog.md`, marca §7.24 (notas ancladas al progreso) y la parte de texto de §7.27 (citas y frases destacadas). **El OCR de §7.27 sigue pendiente** — no lo marques. Solo la casilla: la narrativa de cómo se hizo va en la spec, nunca en el backlog (eso fue lo que lo pudrió antes).

- [ ] **Step 2: Decisiones**

Al **final** de `docs/requirements/decisiones.md` (append-only; no reescribas las anteriores), una entrada con las dos decisiones que un futuro tú no querrá re-descubrir:

- `is_public` se escribe **sin política de lectura pública**: abrirla antes del filtro spoiler-safe sería la fuga que la columna venía a evitar. Las 4 políticas de dueño siguen siendo las únicas.
- El orden por posición se apoya en `comparePositions` (`src/lib/library/position.ts`), que ya está duplicada a propósito en SQL para los checkpoints; **no** se creó una tercera implementación, aunque la spec la proponía.

- [ ] **Step 3: Baseline del esquema**

Anexa el contenido de `supabase/migrations/20260721_notes_social_columns.sql` al final de `docs/requirements/schema-baseline.sql`, en el orden en que entró a prod.

- [ ] **Step 4: Commit**

```bash
git add docs/requirements
git commit -m "docs(notas): backlog, decisiones y baseline al dia"
```

---

## Fuera de alcance (no lo construyas)

La hoja suelta sobre el cronómetro (frame B del mockup); el «+» global (frame C); `parent_note_id` en UI; el muro público del perfil; el filtro spoiler-safe; la tarjeta compartible portada-céntrica; el OCR; editar el texto de una nota ya guardada; y **el cuaderno `/notas`, que es el Plan B** y tiene su propio plan.
