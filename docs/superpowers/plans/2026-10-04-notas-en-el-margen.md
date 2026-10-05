# Notas en el margen — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quien escribe deja una nota anclada a un punto de una obra (página en libros, episodio en series, «al terminar» en cualquiera). Se le abre a quien le sigue cuando llega a ese punto, con conversación privada entre autor y lector.

**Architecture:**
- **Datos.** Dos tablas nuevas: `margin_notes` (lo que se escribe) y `margin_note_encounters` (una fila por nota y lector, cuando se le abre).
- **Apertura.** Los encuentros solo los crea `private.open_margin_notes`. La disparan triggers sobre `passes` (posición y estado, lo que cubre sesiones, cierres e importaciones), `episode_watches`, `margin_notes` (retroactivas) y `follows` (nuevo seguidor).
- **Conversación.** Cada encuentro materializa un `interaction_target` de tipo `margin_encounter`. Así hereda comentarios, reacciones, notas de voz y bloqueos.
- **Avisos.** Los de notas dedicadas se reclaman con la RPC `margin_claim_notices()` y los envía `notify()` desde TypeScript, el mismo patrón que `experience_reviewed`.
- **Revelación en la hoja.** Es un bloque servidor de la ficha que pinta los encuentros no vistos no retroactivos. La revalidación que ya hace cada guardado lo vuelve a renderizar.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase Postgres + RLS, next-intl, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-notas-en-el-margen-design.md` (con las correcciones de la Tarea 0). Issue: #1380.

## Global Constraints

- **Node 22.** El shell trae v20, que rompe vitest: hay que hacer `fnm use 22` antes de `npm test`. En un worktree, copiar `.env.local`.
- **Un solo `next dev`/`next start`, en el puerto 3000.** Matar el viejo antes (`Get-NetTCPConnection -LocalPort 3000`). Para Playwright, arrancar `npm run dev` a mano y esperar con curl, no el webServer automático (#1073).
- **Nada lleva `use cache`.** Todo depende de la sesión (regla #437) y va detrás de `<Suspense>`.
- **Funciones SQL nuevas:**
  - `set search_path=''`, nombres cualificados e identidad desde `auth.uid()`.
  - `revoke all ... from public, anon, authenticated` y `grant execute` mínimo.
  - Las `private.*` sin grant a nadie.
- **Tablas nuevas:**
  - `enable row level security`, `revoke all from public, anon, authenticated` y `grant all to service_role`.
  - Grants de cliente **por columna**, exactamente los del plan. Una columna sin grant rompe la escritura entera (#375).
- **Límites:**
  - `body`: recortado, de 1 a 2000 caracteres.
  - `chapter_label`: recortado, de 1 a 80, obligatorio en libros y `null` en series y películas.
  - Umbral: `ratio_lector ≥ ratio_nota + max(0.03, 5 / páginas_lector)`.
- **Errores SQL:** `42501` prohibido, `22023` entrada inválida, `PT404` no encontrado.
- **Copy nuevo:** primero `docs/UI-GLOSARIO.md`, después `messages/es.json` (namespace `margin`).
- **Interfaz:** objetivos táctiles ≥ 44 px (`min-h-11`), errores con `role="alert"`, tokens Paper y sin librerías nuevas.
- **Migraciones:** primero bootstrap local (`npm run db:local:prepare` + `npm run test:db:local`), luego `biblioshare-dev` y por último producción, que **requiere el OK explícito del propietario**. Verificar contra `pg_proc`/`pg_class`/`pg_policies`, no contra el ledger.
- **Commits:** terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20261004120000_margin_notes_enums.sql` | Valores de enum (solos, en su propia transacción) |
| `supabase/migrations/20261004120100_margin_notes_core.sql` | Tipos, tablas, validación, RLS, grants, referencia de catálogo, fusión de libros |
| `supabase/migrations/20261004120200_margin_notes_opening.sql` | `margin_reached`, `open_margin_notes` y sus cuatro triggers |
| `supabase/migrations/20261004120300_margin_notes_social.sql` | Target `margin_encounter`, ramas de visibilidad y `margin_claim_notices()` |
| `supabase/tests/margin_notes.sql` | Matriz SQL con rollback |
| `supabase/tests/catalog_reference_guards.sql` | Añade la rama `margin_notes` |
| `scripts/db/verify.mjs` | Ejecuta la matriz nueva |
| `src/lib/margin/threshold.ts` (+ `.test.ts`) | Regla pura del umbral (espejo de la SQL) |
| `src/lib/margin/anchor.ts` (+ `.test.ts`) | Validación de entrada y construcción del ancla |
| `src/lib/margin/types.ts` | Tipos compartidos |
| `src/lib/margin/queries.ts` | Lecturas server-only |
| `src/lib/margin/deliver.ts` (+ `.test.ts`) | Reclamar y enviar avisos de dedicadas |
| `src/lib/margin/actions.ts` | Server actions (crear, editar, borrar, marcar vistas) |
| `src/lib/social/thread-recipient.ts` (+ `.test.ts`) | A quién avisa un comentario o reacción (contraparte en hilos de pareja) |
| `src/components/margin/margin-note-card.tsx` | Tarjeta de papel |
| `src/components/margin/margin-note-composer.tsx` (+ `.test.tsx`) | Formulario de escritura |
| `src/components/margin/margin-section.tsx` | Bloque de la ficha |
| `src/components/margin/margin-reveal.tsx` (+ `.test.tsx`) | Hoja «Has encontrado N notas» |
| `src/app/margen/[id]/page.tsx` | Hilo privado |
| `src/app/notas/*` | Filtros «Encontradas» y «En el margen» |
| `e2e/notas-en-el-margen.spec.ts`, `e2e/support/margin-fixtures.ts` | E2E |

---

### Task 0: Ajustes a la spec antes de construir

La exploración del código cambió tres detalles de implementación sin tocar el producto. La spec tiene que decirlo antes de que nadie construya sobre ella.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-notas-en-el-margen-design.md`

- [ ] **Step 1: Añadir una sección «## 8. Correcciones de implementación (2026-10-04)» al final**

```markdown
## 8. Correcciones de implementación (2026-10-04)

Detectadas al planificar contra el código. No cambian el producto.

1. **Sin audiencia nueva `encounter_pair`.** `private.can_view_interaction_target`
   ya resuelve por `kind` antes que por audiencia (así lo hace `experience`). El target
   `margin_encounter` lleva `audience_kind='profile'` y `audience_id=<lector>`, y su
   visibilidad la decide la rama `kind='margin_encounter'` → `private.can_read_margin_encounter`.
   `audience_id` sirve además para saber a quién avisar cuando escribe el autor.
2. **Disparadores sobre `passes`, no sobre `progress_sessions`.** Toda sesión, cierre e
   importación mueve `passes.position` o `passes.status`. Un trigger ahí cubre todos los
   caminos (incluido Letterboxd) con un solo punto. La proporción del lector se calcula
   por pase con la edición de ese pase.
3. **Avisos de dedicadas con columna `notified_at`.** Los encuentros nacen en triggers, pero
   el push solo se envía desde TypeScript (`notify()`). La RPC `margin_claim_notices()`
   marca y devuelve los pendientes en los que quien llama es autor o lector. La llaman
   las acciones de sesión, episodios, transición de estado, escritura de nota, follow y
   «marcar vista».
   **Límite asumido:** un encuentro creado por un camino que no llama a la RPC (p. ej. una
   importación) avisa en la siguiente llamada de cualquiera de las dos personas.
4. **Revelación:** la ficha pinta los encuentros con `seen_at is null` y
   `found_via <> 'retro'`. La revalidación que ya hacen esas acciones vuelve a renderizarla
   tras guardar.
5. **Inmutabilidad del ancla, la obra y la audiencia por grants de columna**, no por
   trigger. Así `merge_book_into` (SECURITY DEFINER) puede reasignar `item_id` al fusionar
   libros.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-10-04-notas-en-el-margen-design.md
git commit -m "docs(margen): correcciones de implementación a la spec

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Regla pura del umbral y del ancla

**Files:**
- Create: `src/lib/margin/threshold.ts`, `src/lib/margin/threshold.test.ts`
- Create: `src/lib/margin/anchor.ts`, `src/lib/margin/anchor.test.ts`
- Create: `src/lib/margin/types.ts`

**Interfaces:**
- Produces:
  - `type MarginAnchor = { kind: "ratio"; ratio: number; page: number; pages: number } | { kind: "episode"; season: number; episode: number } | { kind: "finish" }`
  - `marginUnlockRatio(noteRatio: number, readerPages: number): number`
  - `isRatioReached(readerPage: number, readerPages: number | null, noteRatio: number): boolean`
  - `unlockPageHint(noteRatio: number, readerPages: number | null): number | null` (página aproximada de apertura en una edición de `readerPages`; `null` si solo se abre al terminar)
  - `buildMarginAnchor(input: MarginAnchorInput): { ok: true; anchor: MarginAnchor } | { ok: false; error: "invalidPosition" }`
  - `type MarginAnchorInput = { itemType: "book"; page: number | null; pages: number | null } | { itemType: "series"; season: number | null; episode: number | null } | { itemType: "movie" }`
  - `MARGIN_BODY_MAX = 2000`, `MARGIN_CHAPTER_MAX = 80`

- [ ] **Step 1: Escribir los tipos**

`src/lib/margin/types.ts`:

```ts
import type { ItemType } from "@/lib/catalog/types";

export type MarginAnchor =
  | { kind: "ratio"; ratio: number; page: number; pages: number }
  | { kind: "episode"; season: number; episode: number }
  | { kind: "finish" };

export type MarginAudience = "followers" | "person";
export type MarginFoundVia = "progress" | "finish" | "retro";

export const MARGIN_BODY_MAX = 2000;
export const MARGIN_CHAPTER_MAX = 80;

export type MarginPerson = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

// Una nota tal como la ve quien la recibe (encuentro) o quien la escribió (propia).
export type MarginNoteView = {
  noteId: string;
  itemType: ItemType;
  itemId: string;
  anchor: MarginAnchor;
  chapterLabel: string | null;
  body: string;
  isSpoiler: boolean;
  audience: MarginAudience;
  createdAt: string;
  author: MarginPerson;
  // Solo en encuentros (vista de lector).
  encounter: { id: string; foundAt: string; foundVia: MarginFoundVia; seenAt: string | null } | null;
  // Solo en notas propias: quién la ha encontrado (con el id de cada hilo).
  foundBy: { encounterId: string; reader: MarginPerson }[] | null;
  recipient: MarginPerson | null;
};
```

- [ ] **Step 2: Escribir los tests del umbral (fallan)**

`src/lib/margin/threshold.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isRatioReached, marginUnlockRatio, unlockPageHint } from "./threshold";

describe("marginUnlockRatio", () => {
  it("añade el 3 % en libros largos", () => {
    expect(marginUnlockRatio(0.535, 400)).toBeCloseTo(0.565, 6);
  });
  it("usa el mínimo de 5 páginas en libros cortos", () => {
    // 5/100 = 0.05 > 0.03
    expect(marginUnlockRatio(0.5, 100)).toBeCloseTo(0.55, 6);
  });
});

describe("isRatioReached", () => {
  it("no abre en la página exacta de la nota", () => {
    expect(isRatioReached(214, 400, 214 / 400)).toBe(false);
  });
  it("abre pasado el margen en la misma edición", () => {
    expect(isRatioReached(226, 400, 214 / 400)).toBe(true);
    expect(isRatioReached(225, 400, 214 / 400)).toBe(false);
  });
  it("compara por proporción entre ediciones distintas", () => {
    // Nota al 53,5 % de 400. Edición de 600: umbral 0.565 → p. 339.
    expect(isRatioReached(338, 600, 0.535)).toBe(false);
    expect(isRatioReached(339, 600, 0.535)).toBe(true);
  });
  it("sin páginas conocidas nunca abre por progreso", () => {
    expect(isRatioReached(500, null, 0.1)).toBe(false);
    expect(isRatioReached(500, 0, 0.1)).toBe(false);
  });
  it("una nota pegada al final solo se abre al terminar", () => {
    expect(isRatioReached(400, 400, 0.99)).toBe(false);
  });
});

describe("unlockPageHint", () => {
  it("redondea hacia arriba la página de apertura", () => {
    expect(unlockPageHint(0.535, 600)).toBe(339);
  });
  it("null si solo se abre al terminar", () => {
    expect(unlockPageHint(0.99, 400)).toBeNull();
    expect(unlockPageHint(0.5, null)).toBeNull();
  });
});
```

- [ ] **Step 3: Ejecutar y ver el fallo**

Run: `npx vitest run src/lib/margin/threshold.test.ts`
Expected: FAIL («Cannot find module './threshold'»)

- [ ] **Step 4: Implementar**

`src/lib/margin/threshold.ts`:

```ts
// Espejo exacto de private.margin_reached (20261004120200): si cambias uno,
// cambia el otro y los dos juegos de pruebas. El margen va SIEMPRE hacia atrás
// («llega tarde»): preferimos abrir unas páginas después a destripar nada.
export const MARGIN_MIN_RATIO = 0.03;
export const MARGIN_MIN_PAGES = 5;

export function marginUnlockRatio(noteRatio: number, readerPages: number): number {
  return noteRatio + Math.max(MARGIN_MIN_RATIO, MARGIN_MIN_PAGES / readerPages);
}

export function isRatioReached(
  readerPage: number,
  readerPages: number | null,
  noteRatio: number,
): boolean {
  if (!readerPages || readerPages <= 0) return false;
  return readerPage / readerPages >= marginUnlockRatio(noteRatio, readerPages);
}

export function unlockPageHint(noteRatio: number, readerPages: number | null): number | null {
  if (!readerPages || readerPages <= 0) return null;
  const page = Math.ceil(marginUnlockRatio(noteRatio, readerPages) * readerPages - 1e-9);
  return page > readerPages ? null : page;
}
```

Para comprobar que `isRatioReached(400, 400, 0.99)` es `false`: el umbral es 0.99 + 0.03 = 1.02 y 400/400 = 1. Para comprobar `unlockPageHint(0.99, 400)`: 1.02 × 400 = 408 > 400, devuelve `null`.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/margin/threshold.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Tests del ancla (fallan)**

`src/lib/margin/anchor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildMarginAnchor } from "./anchor";

describe("buildMarginAnchor", () => {
  it("libro con páginas → ratio", () => {
    expect(buildMarginAnchor({ itemType: "book", page: 214, pages: 400 })).toEqual({
      ok: true,
      anchor: { kind: "ratio", ratio: 0.535, page: 214, pages: 400 },
    });
  });
  it("libro sin página → al terminar", () => {
    expect(buildMarginAnchor({ itemType: "book", page: null, pages: 400 })).toEqual({
      ok: true,
      anchor: { kind: "finish" },
    });
  });
  it("libro sin páginas conocidas → al terminar", () => {
    expect(buildMarginAnchor({ itemType: "book", page: 10, pages: null })).toEqual({
      ok: true,
      anchor: { kind: "finish" },
    });
  });
  it("página fuera de rango → error", () => {
    expect(buildMarginAnchor({ itemType: "book", page: 401, pages: 400 })).toEqual({ ok: false, error: "invalidPosition" });
    expect(buildMarginAnchor({ itemType: "book", page: 0, pages: 400 })).toEqual({ ok: false, error: "invalidPosition" });
    expect(buildMarginAnchor({ itemType: "book", page: 2.5, pages: 400 })).toEqual({ ok: false, error: "invalidPosition" });
  });
  it("serie con episodio → episode; sin episodio → al terminar", () => {
    expect(buildMarginAnchor({ itemType: "series", season: 1, episode: 3 })).toEqual({
      ok: true,
      anchor: { kind: "episode", season: 1, episode: 3 },
    });
    expect(buildMarginAnchor({ itemType: "series", season: null, episode: null })).toEqual({
      ok: true,
      anchor: { kind: "finish" },
    });
    expect(buildMarginAnchor({ itemType: "series", season: 1, episode: 0 })).toEqual({ ok: false, error: "invalidPosition" });
  });
  it("película → siempre al terminar", () => {
    expect(buildMarginAnchor({ itemType: "movie" })).toEqual({ ok: true, anchor: { kind: "finish" } });
  });
});
```

- [ ] **Step 7: Implementar `anchor.ts`**

```ts
import type { MarginAnchor } from "./types";

export type MarginAnchorInput =
  | { itemType: "book"; page: number | null; pages: number | null }
  | { itemType: "series"; season: number | null; episode: number | null }
  | { itemType: "movie" };

type Result = { ok: true; anchor: MarginAnchor } | { ok: false; error: "invalidPosition" };

const FINISH: Result = { ok: true, anchor: { kind: "finish" } };

// Las páginas son las de la edición del pase de quien ESCRIBE (pagesForPass):
// la proporción se fija una vez y cada lector la compara con la suya.
export function buildMarginAnchor(input: MarginAnchorInput): Result {
  if (input.itemType === "movie") return FINISH;
  if (input.itemType === "book") {
    if (input.page === null) return FINISH;
    if (!Number.isInteger(input.page) || input.page < 1) return { ok: false, error: "invalidPosition" };
    if (!input.pages || input.pages <= 0) return FINISH;
    if (input.page > input.pages) return { ok: false, error: "invalidPosition" };
    const ratio = Math.round((input.page / input.pages) * 1e6) / 1e6;
    return { ok: true, anchor: { kind: "ratio", ratio, page: input.page, pages: input.pages } };
  }
  if (input.season === null && input.episode === null) return FINISH;
  if (!Number.isInteger(input.season) || (input.season ?? -1) < 0) return { ok: false, error: "invalidPosition" };
  if (!Number.isInteger(input.episode) || (input.episode ?? 0) < 1) return { ok: false, error: "invalidPosition" };
  return { ok: true, anchor: { kind: "episode", season: input.season!, episode: input.episode! } };
}
```

- [ ] **Step 8: Ejecutar ambos ficheros de test**

Run: `npx vitest run src/lib/margin`
Expected: PASS (todos)

- [ ] **Step 9: Commit**

```bash
git add src/lib/margin
git commit -m "feat(margen): regla del umbral y construcción del ancla

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Esquema base — enums, tablas, RLS, grants y catálogo

**Files:**
- Create: `supabase/migrations/20261004120000_margin_notes_enums.sql`
- Create: `supabase/migrations/20261004120100_margin_notes_core.sql`
- Create: `supabase/tests/margin_notes.sql`
- Modify: `supabase/tests/catalog_reference_guards.sql` (añadir `margin_notes` a la lista `ref` y su rama `when`)
- Modify: `scripts/db/verify.mjs` (ejecutar `margin_notes.sql`)

**Interfaces:**
- Produces:
  - Tablas `public.margin_notes` y `public.margin_note_encounters` (columnas en el SQL de abajo).
  - `private.can_read_margin_note(uuid) → boolean` y `private.can_read_margin_encounter(uuid) → boolean`.
  - Enums `public.margin_audience` y `public.margin_found_via`.
  - Valores `target_kind 'margin_encounter'` y `notification_type 'margin_note_dedicated' | 'margin_commented' | 'margin_liked'`.

- [ ] **Step 1: Migración de enums**

`20261004120000_margin_notes_enums.sql`:

```sql
-- Enum values must commit before their consumers in margin_notes_*.
alter type public.target_kind add value if not exists 'margin_encounter';
alter type public.notification_type add value if not exists 'margin_note_dedicated';
alter type public.notification_type add value if not exists 'margin_commented';
alter type public.notification_type add value if not exists 'margin_liked';
```

- [ ] **Step 2: Migración núcleo**

`20261004120100_margin_notes_core.sql`:

```sql
-- Notas en el margen (#1380). Spec: docs/superpowers/specs/2026-10-04-notas-en-el-margen-design.md
-- Invariante: una nota la ve su autor, o un lector con encuentro que siga al autor
-- (follow accepted) sin bloqueo entre ambos. Los encuentros solo los escribe
-- private.open_margin_notes (migración siguiente).
create type public.margin_audience as enum ('followers','person');
create type public.margin_found_via as enum ('progress','finish','retro');

create function private.margin_anchor_valid(p_item_type public.item_type, p_anchor jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_anchor) <> 'object' then return false; end if;
  case p_anchor->>'kind'
    when 'finish' then return p_anchor = '{"kind":"finish"}'::jsonb;
    when 'ratio' then
      if p_item_type <> 'book' or (select count(*) from jsonb_object_keys(p_anchor)) <> 4
        or jsonb_typeof(p_anchor->'ratio') <> 'number' or jsonb_typeof(p_anchor->'page') <> 'number'
        or jsonb_typeof(p_anchor->'pages') <> 'number' then return false; end if;
      return (p_anchor->>'ratio')::numeric > 0 and (p_anchor->>'ratio')::numeric <= 1
        and (p_anchor->>'page') ~ '^[0-9]+$' and (p_anchor->>'pages') ~ '^[0-9]+$'
        and (p_anchor->>'page')::int between 1 and (p_anchor->>'pages')::int;
    when 'episode' then
      if p_item_type <> 'series' or (select count(*) from jsonb_object_keys(p_anchor)) <> 3
        or jsonb_typeof(p_anchor->'season') <> 'number' or jsonb_typeof(p_anchor->'episode') <> 'number' then return false; end if;
      return (p_anchor->>'season') ~ '^[0-9]+$' and (p_anchor->>'episode') ~ '^[0-9]+$'
        and (p_anchor->>'episode')::int >= 1;
    else return false;
  end case;
end $$;
revoke all on function private.margin_anchor_valid(public.item_type, jsonb) from public, anon, authenticated;

create table public.margin_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  anchor jsonb not null,
  chapter_label text,
  body text not null,
  is_spoiler boolean not null default false,
  audience public.margin_audience not null,
  recipient_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint margin_notes_anchor check (private.margin_anchor_valid(item_type, anchor)),
  constraint margin_notes_body check (body = btrim(body) and char_length(body) between 1 and 2000),
  constraint margin_notes_chapter check (case when item_type = 'book'
    then chapter_label is not null and chapter_label = btrim(chapter_label) and char_length(chapter_label) between 1 and 80
    else chapter_label is null end),
  constraint margin_notes_recipient check ((audience = 'person') = (recipient_id is not null)
    and recipient_id is distinct from author_id)
);
create index margin_notes_item_idx on public.margin_notes(item_type, item_id);
create index margin_notes_author_idx on public.margin_notes(author_id, created_at desc);
create index margin_notes_recipient_idx on public.margin_notes(recipient_id) where recipient_id is not null;

create table public.margin_note_encounters (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.margin_notes(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  found_at timestamptz not null default now(),
  found_via public.margin_found_via not null,
  seen_at timestamptz,
  notified_at timestamptz,
  unique (note_id, reader_id)
);
create index margin_note_encounters_reader_idx on public.margin_note_encounters(reader_id, found_at desc);

-- Escritura de la nota: dedicada solo a quien te sigue y sin bloqueo; episodio
-- emitido; edited_at lo pone el servidor. «Autor = quien llama» lo impone la
-- política de insert (dentro de esta función SECURITY DEFINER current_user es el
-- dueño, no 'authenticated', así que aquí no se puede comprobar el rol).
create function private.guard_margin_note() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'INSERT' then
    if new.audience = 'person' and (
      not exists(select 1 from public.follows f where f.follower_id=new.recipient_id and f.followee_id=new.author_id and f.status='accepted')
      or exists(select 1 from public.user_blocks b where (b.blocker_id=new.author_id and b.blocked_id=new.recipient_id)
        or (b.blocker_id=new.recipient_id and b.blocked_id=new.author_id))) then
      raise exception 'recipient must follow author' using errcode='42501';
    end if;
    if new.anchor->>'kind' = 'episode' and not exists(select 1 from public.series_episodes e
      where e.series_id=new.item_id and e.season_number=(new.anchor->>'season')::int and e.episode_number=(new.anchor->>'episode')::int
        and e.air_date is not null and e.air_date <= current_date) then
      raise exception 'episode not aired' using errcode='22023';
    end if;
    new.created_at := now();
    new.edited_at := null;
  elsif (new.body, new.chapter_label, new.is_spoiler) is distinct from (old.body, old.chapter_label, old.is_spoiler) then
    -- Una fusión de libros (merge_book_into) solo cambia item_id: no es una edición.
    new.edited_at := now();
  end if;
  return new;
end $$;
revoke all on function private.guard_margin_note() from public, anon, authenticated;
create trigger margin_notes_guard before insert or update on public.margin_notes
  for each row execute function private.guard_margin_note();

create function private.can_read_margin_note(p_note_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.margin_notes n where n.id=p_note_id and (
    n.author_id = auth.uid()
    or (exists(select 1 from public.margin_note_encounters e where e.note_id=n.id and e.reader_id=auth.uid())
      and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followee_id=n.author_id and f.status='accepted')
      and not public.users_are_blocked(n.author_id))));
$$;
revoke all on function private.can_read_margin_note(uuid) from public, anon, authenticated;

-- El autor ve el encuentro (y su hilo) mientras el lector le siga y no haya bloqueo:
-- el hilo desaparece para los dos a la vez.
create function private.can_read_margin_encounter(p_encounter_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id
    where e.id=p_encounter_id
      and exists(select 1 from public.follows f where f.follower_id=e.reader_id and f.followee_id=n.author_id and f.status='accepted')
      and ((n.author_id=auth.uid() and not public.users_are_blocked(e.reader_id))
        or (e.reader_id=auth.uid() and not public.users_are_blocked(n.author_id))));
$$;
revoke all on function private.can_read_margin_encounter(uuid) from public, anon, authenticated;

alter table public.margin_notes enable row level security;
alter table public.margin_note_encounters enable row level security;
revoke all on public.margin_notes, public.margin_note_encounters from public, anon, authenticated;
grant all on public.margin_notes, public.margin_note_encounters to service_role;

grant select, delete on public.margin_notes to authenticated;
grant insert (author_id, item_type, item_id, anchor, chapter_label, body, is_spoiler, audience, recipient_id)
  on public.margin_notes to authenticated;
-- Ancla, obra y audiencia son inmutables: sin grant de update.
grant update (body, chapter_label, is_spoiler) on public.margin_notes to authenticated;

create policy margin_notes_select on public.margin_notes for select to authenticated
  using (private.can_read_margin_note(id));
create policy margin_notes_insert on public.margin_notes for insert to authenticated
  with check (author_id = auth.uid());
create policy margin_notes_update on public.margin_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy margin_notes_delete on public.margin_notes for delete to authenticated
  using (author_id = auth.uid());

grant select on public.margin_note_encounters to authenticated;
grant update (seen_at) on public.margin_note_encounters to authenticated;
create policy margin_encounters_select on public.margin_note_encounters for select to authenticated
  using (private.can_read_margin_encounter(id));
create policy margin_encounters_seen on public.margin_note_encounters for update to authenticated
  using (reader_id = auth.uid()) with check (reader_id = auth.uid());

-- Referencia polimórfica al catálogo (#708): bloquea borrar la obra y bloquea
-- referencias a obras inexistentes.
create or replace function private.catalog_reference_rules()
returns table(table_name text, type_column text, id_column text, delete_policy text)
language sql immutable set search_path = '' as $$
  values
    ('passes','item_type','item_id','restrict'),
    ('credits','item_type','item_id','cascade'),
    ('club_activity_items','item_type','item_id','restrict'),
    ('club_activity_opinions','item_type','item_id','restrict'),
    ('club_activity_placements','item_type','item_id','restrict'),
    ('club_rounds','item_type','item_id','restrict'),
    ('collection_items','item_type','item_id','restrict'),
    ('library_entries','item_type','item_id','restrict'),
    ('notes','item_type','item_id','restrict'),
    ('margin_notes','item_type','item_id','restrict'),
    ('saga_items','item_type','item_id','restrict'),
    ('saga_optional_skips','item_type','item_id','restrict'),
    ('saga_placement_windows','item_type','item_id','restrict'),
    ('saga_placement_windows','after_item_type','after_item_id','restrict'),
    ('saga_placement_windows','before_item_type','before_item_id','restrict'),
    ('saga_route_entries','item_type','item_id','restrict');
$$;
revoke all on function private.catalog_reference_rules() from public, anon, authenticated;
create trigger trg_catalog_reference_item_type before insert or update of item_type, item_id on public.margin_notes
  for each row execute function private.lock_catalog_reference('item_type','item_id');
```

Antes de dar el paso por cerrado:

1. Comprueba que `private.catalog_reference_rules()` no se ha redefinido después de `20260907093534` (`grep -l "function private.catalog_reference_rules" supabase/migrations/*.sql`). Si lo está, parte de esa última versión.
2. Añade al final de este fichero `public.merge_book_into`: copia **literal** de su última definición (`supabase/migrations/20261001102000_merge_book_club_event_refs.sql`, `CREATE OR REPLACE FUNCTION public.merge_book_into`), con una sola línea añadida justo después de la de `public.notes`:

```sql
  update public.margin_notes             set item_id = p_winner where item_type = 'book' and item_id = p_loser;
```

Sin esa línea, fusionar un libro con notas de margen fallaría con `catalog_item_has_references`.

- [ ] **Step 3: Matriz SQL (primera parte: escritura y visibilidad sin encuentros)**

`supabase/tests/margin_notes.sql` (mismo estilo que `supabase/tests/experiences_access.sql`):

```sql
-- Synthetic fixtures with real roles. Local/dev only; every write rolls back.
begin;
create temporary table margin_fixture(k text primary key, id uuid not null default gen_random_uuid());
insert into margin_fixture(k) values ('author'),('follower'),('stranger'),('blocked'),('book'),('series');
grant select on margin_fixture to anon, authenticated;
insert into auth.users(id) select id from margin_fixture where k in ('author','follower','stranger','blocked');
insert into public.profiles(user_id,username,is_public)
  select id,'mrg_'||left(replace(id::text,'-',''),15),true from margin_fixture where k in ('author','follower','stranger','blocked');
insert into public.books(id,title,total_pages) select id,'[TEST] margin book',400 from margin_fixture where k='book';
insert into public.series(id,title) select id,'[TEST] margin series' from margin_fixture where k='series';
insert into public.series_episodes(series_id,season_number,episode_number,air_date)
  select id,1,e,'2020-01-01' from margin_fixture, generate_series(1,4) e where k='series';
insert into public.follows(follower_id,followee_id,status)
  select f.id,a.id,'accepted' from margin_fixture f, margin_fixture a where f.k in ('follower','blocked') and a.k='author';
insert into public.user_blocks(blocker_id,blocked_id)
  select (select id from margin_fixture where k='author'),id from margin_fixture where k='blocked';

-- A1: el autor escribe; un tercero no puede escribir en su nombre.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience)
  values ('book',(select id from margin_fixture where k='book'),'{"kind":"ratio","ratio":0.535,"page":214,"pages":400}','Cap. 12','[TEST] aquí lloré','followers');
do $$ begin
  begin
    insert into public.margin_notes(author_id,item_type,item_id,anchor,chapter_label,body,audience)
      values ((select id from margin_fixture where k='stranger'),'book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','Cap. 1','[TEST] x','followers');
    raise exception 'FAIL A1: wrote as another author';
  exception when insufficient_privilege then null; end;
  -- A2: dedicada a quien no te sigue → 42501.
  begin
    insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience,recipient_id)
      values ('book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','Cap. 1','[TEST] x','person',(select id from margin_fixture where k='stranger'));
    raise exception 'FAIL A2: dedicated to non-follower';
  exception when insufficient_privilege then null; end;
  -- A3: libro sin capítulo → CHECK.
  begin
    insert into public.margin_notes(item_type,item_id,anchor,body,audience)
      values ('book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','[TEST] x','followers');
    raise exception 'FAIL A3: book without chapter';
  exception when check_violation then null; end;
  -- A4: episodio inexistente → 22023.
  begin
    insert into public.margin_notes(item_type,item_id,anchor,body,audience)
      values ('series',(select id from margin_fixture where k='series'),'{"kind":"episode","season":1,"episode":9}','[TEST] x','followers');
    raise exception 'FAIL A4: unknown episode';
  exception when invalid_parameter_value then null; end;
  -- A5: el ancla no se puede editar (sin grant de columna).
  begin
    update public.margin_notes set anchor='{"kind":"finish"}' where body='[TEST] aquí lloré';
    raise exception 'FAIL A5: anchor updated';
  exception when insufficient_privilege then null; end;
  -- A6: el cliente no escribe encuentros.
  begin
    insert into public.margin_note_encounters(note_id,reader_id,found_via)
      select id,(select id from margin_fixture where k='follower'),'progress' from public.margin_notes where body='[TEST] aquí lloré';
    raise exception 'FAIL A6: client wrote encounter';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- B1: sin encuentro nadie más que el autor ve la nota.
do $$ declare who record; begin
  for who in select k,id from margin_fixture where k in ('follower','stranger','blocked') loop
    perform set_config('request.jwt.claim.sub',who.id::text,true);
    set local role authenticated;
    if exists(select 1 from public.margin_notes where body='[TEST] aquí lloré') then raise exception 'FAIL B1: % sees unopened note',who.k; end if;
    reset role;
  end loop;
end $$;
set local role anon;
do $$ begin
  if exists(select 1 from public.margin_notes) then raise exception 'FAIL B1: anon reads margin notes'; end if;
end $$;
reset role;
-- Las tareas 3 y 4 añaden aquí sus bloques, ANTES del rollback.
rollback;
```

Antes de ejecutarla, comprueba que las columnas mínimas de los inserts de fixtures (`books`, `series`, `series_episodes`) bastan con el esquema actual. Si algún `not null` sin default lo impide, añade la columna con un valor `[TEST]`.

- [ ] **Step 4: Registrar la matriz y la rama del guard de catálogo**

En `scripts/db/verify.mjs`, después de la línea de `letterboxd_recovery.sql`:

```js
sql(readFileSync(join(repoRoot, 'supabase/tests/margin_notes.sql'), 'utf8'));
```

En `supabase/tests/catalog_reference_guards.sql`, añade `'margin_notes'` al array `ref` (justo detrás de `'notes'`) y esta rama al `case`:

```sql
          when 'margin_notes' then insert into public.margin_notes(author_id,item_type,item_id,anchor,chapter_label,body,audience)
            values(actor,kind,item,'{"kind":"finish"}',case when kind='book' then '[TEST] cap' end,'[TEST] margin','followers');
```

- [ ] **Step 5: Ejecutar en local**

Run: `npm run db:local:prepare` y después `npm run test:db:local`
Expected: termina sin `FAIL`. A1 lo corta la política `margin_notes_insert` (`42501`) y A2 el guard.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261004120000_margin_notes_enums.sql supabase/migrations/20261004120100_margin_notes_core.sql supabase/tests/margin_notes.sql supabase/tests/catalog_reference_guards.sql scripts/db/verify.mjs
git commit -m "feat(margen): tablas, RLS, grants y referencia de catálogo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Apertura — `open_margin_notes` y triggers

**Files:**
- Create: `supabase/migrations/20261004120200_margin_notes_opening.sql`
- Modify: `supabase/tests/margin_notes.sql` (bloque C, antes del `rollback`)

**Interfaces:**
- Consumes: tablas de la Task 2.
- Produces:
  - `private.margin_reached(p_reader uuid, p_note public.margin_notes) → boolean`.
  - `private.open_margin_notes(p_reader uuid, p_item_type public.item_type, p_item_id uuid, p_via public.margin_found_via, p_note uuid default null, p_author uuid default null) → integer` (encuentros creados).
  - Triggers en `passes`, `episode_watches`, `margin_notes` y `follows`.

- [ ] **Step 1: Escribir el bloque C de la matriz (falla)**

Insertar en `supabase/tests/margin_notes.sql` antes de `rollback;`:

```sql
-- C: apertura. El seguidor lee una edición de 600 páginas: umbral 0.565 → p. 339.
insert into public.book_editions(id,book_id,total_pages)
  select gen_random_uuid(),id,600 from margin_fixture where k='book';
insert into public.passes(user_id,item_type,item_id,status,position,edition_id)
  select (select id from margin_fixture where k='follower'),'book',id,'in_progress','{"page":300}',
    (select be.id from public.book_editions be where be.book_id=margin_fixture.id limit 1)
  from margin_fixture where k='book';
do $$ declare n int; begin
  select count(*) into n from public.margin_note_encounters;
  if n <> 0 then raise exception 'FAIL C1: opened at p.300/600 (%)',n; end if;
end $$;
update public.passes set position='{"page":338}' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
do $$ begin
  if exists(select 1 from public.margin_note_encounters) then raise exception 'FAIL C2: opened at p.338/600'; end if;
end $$;
update public.passes set position='{"page":339}' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e where e.found_via='progress'
      and e.reader_id=(select id from margin_fixture where k='follower')) then raise exception 'FAIL C3: not opened at p.339/600'; end if;
end $$;
-- C4: retroceder no quita el encuentro (339 → 300; 300/600 sigue bastando para la nota retro de C7).
update public.passes set position='{"page":300}' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
do $$ begin
  if not exists(select 1 from public.margin_note_encounters) then raise exception 'FAIL C4: encounter removed on rewind'; end if;
end $$;
-- C5: el seguidor ahora la VE; el bloqueado, aunque siga y tenga pase completado, no tiene encuentro.
insert into public.passes(user_id,item_type,item_id,status)
  select (select id from margin_fixture where k='blocked'),'book',id,'completed' from margin_fixture where k='book';
do $$ begin
  if exists(select 1 from public.margin_note_encounters where reader_id=(select id from margin_fixture where k='blocked')) then
    raise exception 'FAIL C5: blocked reader got an encounter'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='follower'),true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.margin_notes where body='[TEST] aquí lloré') then raise exception 'FAIL C6: follower cannot read opened note'; end if;
end $$;
reset role;
-- C7: retroactiva — nota nueva sobre algo que el seguidor ya superó → encuentro 'retro'.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience)
  values ('book',(select id from margin_fixture where k='book'),'{"kind":"ratio","ratio":0.01,"page":4,"pages":400}','Cap. 1','[TEST] retro','followers');
reset role;
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id
      where n.body='[TEST] retro' and e.found_via='retro') then raise exception 'FAIL C7: retro not delivered'; end if;
end $$;
-- C8: serie — la nota del T1E3 no se abre al ver el T1E4, sí al ver el T1E3.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,body,audience)
  values ('series',(select id from margin_fixture where k='series'),'{"kind":"episode","season":1,"episode":3}','[TEST] ep3','followers');
reset role;
insert into public.passes(id,user_id,item_type,item_id,status)
  select gen_random_uuid(),(select id from margin_fixture where k='follower'),'series',id,'in_progress' from margin_fixture where k='series';
insert into public.episode_watches(user_id,series_id,pass_id,season_number,episode_number)
  select (select id from margin_fixture where k='follower'),s.id,p.id,1,4 from margin_fixture s join public.passes p on p.item_id=s.id where s.k='series';
do $$ begin
  if exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] ep3') then
    raise exception 'FAIL C8: opened by a later episode'; end if;
end $$;
insert into public.episode_watches(user_id,series_id,pass_id,season_number,episode_number)
  select (select id from margin_fixture where k='follower'),s.id,p.id,1,3 from margin_fixture s join public.passes p on p.item_id=s.id where s.k='series';
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] ep3') then
    raise exception 'FAIL C9: not opened by its episode'; end if;
end $$;
-- C10: un follow nuevo recibe lo ya superado ('retro').
insert into public.passes(user_id,item_type,item_id,status)
  select (select id from margin_fixture where k='stranger'),'book',id,'completed' from margin_fixture where k='book';
insert into public.follows(follower_id,followee_id,status)
  values ((select id from margin_fixture where k='stranger'),(select id from margin_fixture where k='author'),'accepted');
do $$ begin
  if (select count(*) from public.margin_note_encounters where reader_id=(select id from margin_fixture where k='stranger') and found_via='retro') <> 2 then
    raise exception 'FAIL C10: new follower did not receive both book notes'; end if;
end $$;
-- C11: dejar de seguir oculta lo encontrado; volver a seguir lo recupera.
delete from public.follows where follower_id=(select id from margin_fixture where k='stranger');
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='stranger'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.margin_notes) then raise exception 'FAIL C11: unfollowed reader still reads'; end if;
end $$;
reset role;
```

Comprueba que `book_editions` y `passes` aceptan los inserts mínimos de arriba. Si alguna columna obligatoria falta, añádela con un valor `[TEST]`.

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `npm run test:db:local`
Expected: FAIL en `C3` (aún no hay apertura).

- [ ] **Step 3: Migración de apertura**

`20261004120200_margin_notes_opening.sql`:

```sql
-- Apertura de notas en el margen. Espejo SQL de src/lib/margin/threshold.ts:
-- si cambias uno, cambia el otro y sus pruebas.
create function private.margin_reached(p_reader uuid, p_note public.margin_notes) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.passes p where p.user_id=p_reader and p.item_type=p_note.item_type
      and p.item_id=p_note.item_id and p.status='completed')
    or case p_note.anchor->>'kind'
      when 'episode' then exists(select 1 from public.episode_watches w where w.user_id=p_reader
        and w.series_id=p_note.item_id and w.season_number=(p_note.anchor->>'season')::int
        and w.episode_number=(p_note.anchor->>'episode')::int)
      when 'ratio' then exists(select 1 from public.passes p
        join public.books b on b.id=p.item_id
        left join public.book_editions be on be.id=p.edition_id
        cross join lateral (select coalesce(be.total_pages, b.total_pages)::numeric as pages) t
        where p.user_id=p_reader and p.item_type='book' and p.item_id=p_note.item_id
          and t.pages > 0 and (p.position->>'page') ~ '^[0-9]+$'
          and (p.position->>'page')::numeric / t.pages
            >= (p_note.anchor->>'ratio')::numeric + greatest(0.03, 5 / t.pages))
      else false
    end;
$$;
revoke all on function private.margin_reached(uuid, public.margin_notes) from public, anon, authenticated;

create function private.open_margin_notes(p_reader uuid, p_item_type public.item_type, p_item_id uuid,
  p_via public.margin_found_via, p_note uuid default null, p_author uuid default null) returns integer
language plpgsql security definer set search_path='' as $$
declare created integer;
begin
  insert into public.margin_note_encounters(note_id, reader_id, found_via)
  select n.id, p_reader, p_via from public.margin_notes n
  where n.item_type=p_item_type and n.item_id=p_item_id and n.author_id<>p_reader
    and (p_note is null or n.id=p_note) and (p_author is null or n.author_id=p_author)
    and (n.audience='followers' or n.recipient_id=p_reader)
    and exists(select 1 from public.follows f where f.follower_id=p_reader and f.followee_id=n.author_id and f.status='accepted')
    and not exists(select 1 from public.user_blocks b where (b.blocker_id=p_reader and b.blocked_id=n.author_id)
      or (b.blocker_id=n.author_id and b.blocked_id=p_reader))
    and private.margin_reached(p_reader, n)
  on conflict (note_id, reader_id) do nothing;
  get diagnostics created = row_count;
  return created;
end $$;
revoke all on function private.open_margin_notes(uuid, public.item_type, uuid, public.margin_found_via, uuid, uuid) from public, anon, authenticated;

-- Pases: cubre sesiones (mueven position), cierres (status) e importaciones.
create function private.margin_on_pass() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.position is not distinct from old.position and new.status is not distinct from old.status then
    return null;
  end if;
  perform private.open_margin_notes(new.user_id, new.item_type, new.item_id,
    case when new.status='completed' then 'finish'::public.margin_found_via else 'progress'::public.margin_found_via end);
  return null;
end $$;
revoke all on function private.margin_on_pass() from public, anon, authenticated;
create trigger margin_open_on_pass after insert or update of position, status on public.passes
  for each row execute function private.margin_on_pass();

create function private.margin_on_episode() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.open_margin_notes(new.user_id, 'series', new.series_id, 'progress');
  return null;
end $$;
revoke all on function private.margin_on_episode() from public, anon, authenticated;
create trigger margin_open_on_episode after insert on public.episode_watches
  for each row execute function private.margin_on_episode();

-- Nota nueva: llega en silencio a quien ya pasó por ese punto.
create function private.margin_on_note() returns trigger
language plpgsql security definer set search_path='' as $$
declare reader uuid;
begin
  for reader in select f.follower_id from public.follows f
    where f.followee_id=new.author_id and f.status='accepted'
      and (new.audience='followers' or f.follower_id=new.recipient_id)
      and exists(select 1 from public.passes p where p.user_id=f.follower_id and p.item_type=new.item_type and p.item_id=new.item_id)
  loop
    perform private.open_margin_notes(reader, new.item_type, new.item_id, 'retro', new.id);
  end loop;
  return null;
end $$;
revoke all on function private.margin_on_note() from public, anon, authenticated;
create trigger margin_open_on_note after insert on public.margin_notes
  for each row execute function private.margin_on_note();

-- Follow aceptado: el nuevo seguidor recibe lo que ya superó.
create function private.margin_on_follow() returns trigger
language plpgsql security definer set search_path='' as $$
declare work record;
begin
  if new.status<>'accepted' or (tg_op='UPDATE' and old.status='accepted') then return null; end if;
  for work in select distinct n.item_type, n.item_id from public.margin_notes n
    where n.author_id=new.followee_id
      and exists(select 1 from public.passes p where p.user_id=new.follower_id and p.item_type=n.item_type and p.item_id=n.item_id)
  loop
    perform private.open_margin_notes(new.follower_id, work.item_type, work.item_id, 'retro', null, new.followee_id);
  end loop;
  return null;
end $$;
revoke all on function private.margin_on_follow() from public, anon, authenticated;
create trigger margin_open_on_follow after insert or update of status on public.follows
  for each row execute function private.margin_on_follow();
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm run db:local:prepare` y después `npm run test:db:local`
Expected: sin `FAIL`. Si C10 cuenta 1 en vez de 2, revisa que `margin_on_follow` no filtra por `found_via` y que la nota retro (ratio 0.01) se alcanza con un pase `completed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004120200_margin_notes_opening.sql supabase/tests/margin_notes.sql
git commit -m "feat(margen): apertura automática por proporción, episodio, cierre, nota y follow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Conversación privada y reclamación de avisos

**Files:**
- Create: `supabase/migrations/20261004120300_margin_notes_social.sql`
- Modify: `supabase/tests/margin_notes.sql` (bloque D, antes del `rollback`)

**Interfaces:**
- Consumes: `private.can_read_margin_encounter` (Task 2) y los encuentros (Task 3).
- Produces:
  - Un `interaction_targets` por encuentro: `kind='margin_encounter'`, `source_id=<encounter id>`, `owner_id=<autor>`, `audience_kind='profile'`, `audience_id=<lector>`, `href='/margen/<encounter id>'`, comentable y reaccionable con `margin_commented` y `margin_liked`.
  - `public.margin_claim_notices() → table(encounter_id uuid, reader_id uuid, author_id uuid, target_id uuid, item_type public.item_type, item_id uuid, chapter_label text)`.

- [ ] **Step 1: Bloque D de la matriz (falla)**

```sql
-- D: hilo privado. El target existe y solo lo ven autor y lector.
do $$ begin
  if not exists(select 1 from public.interaction_targets t join public.margin_note_encounters e on e.id=t.source_id
      where t.kind='margin_encounter' and t.audience_id=e.reader_id and t.href='/margen/'||e.id and t.commentable) then
    raise exception 'FAIL D1: encounter target missing'; end if;
end $$;
do $$ declare who record; seen int; begin
  for who in select k,id from margin_fixture where k in ('author','follower','stranger','blocked') loop
    perform set_config('request.jwt.claim.sub',who.id::text,true);
    set local role authenticated;
    select count(*) into seen from public.interaction_targets t join public.margin_note_encounters e on e.id=t.source_id
      where t.kind='margin_encounter' and e.reader_id=(select id from margin_fixture where k='follower');
    if (seen>0) <> (who.k in ('author','follower')) then raise exception 'FAIL D2: % thread visibility %',who.k,seen; end if;
    reset role;
  end loop;
end $$;
-- D3: reclamar avisos de dedicadas — una vez y solo autor/lector.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience,recipient_id)
  values ('book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','Cap. 30','[TEST] para ti','person',(select id from margin_fixture where k='follower'));
reset role;
update public.passes set status='completed' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='stranger'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.margin_claim_notices()) then raise exception 'FAIL D3: stranger claimed notices'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='follower'),true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.margin_claim_notices();
  if n <> 1 then raise exception 'FAIL D4: expected one dedicated notice, got %',n; end if;
  select count(*) into n from public.margin_claim_notices();
  if n <> 0 then raise exception 'FAIL D5: notice claimed twice'; end if;
end $$;
reset role;
-- D6: borrar la nota borra encuentros y targets.
delete from public.margin_notes where body='[TEST] para ti';
do $$ begin
  if exists(select 1 from public.interaction_targets t where t.kind='margin_encounter'
      and not exists(select 1 from public.margin_note_encounters e where e.id=t.source_id)) then
    raise exception 'FAIL D6: orphan margin_encounter target'; end if;
end $$;
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `npm run test:db:local`
Expected: FAIL en `D1`.

- [ ] **Step 3: Migración social**

`20261004120300_margin_notes_social.sql` contiene, en este orden:

**(a) Sincronización del target:**

```sql
create function private.sync_margin_encounter_target() returns trigger
language plpgsql security definer set search_path='' as $$
declare author uuid;
begin
  if tg_op='DELETE' then
    delete from public.interaction_targets where kind='margin_encounter' and source_id=old.id;
    return null;
  end if;
  select n.author_id into author from public.margin_notes n where n.id=new.note_id;
  perform private.upsert_interaction_target('margin_encounter', new.id, author, 'profile', new.reader_id,
    '/margen/'||new.id, true, true, 'margin_commented', 'margin_liked');
  return null;
end $$;
revoke all on function private.sync_margin_encounter_target() from public, anon, authenticated;
create trigger margin_encounters_sync_target after insert or delete on public.margin_note_encounters
  for each row execute function private.sync_margin_encounter_target();
```

Comprueba que `comments.interaction_target_id` y `reactions.interaction_target_id` tienen `on delete cascade` (`\d public.comments` en local). Si no lo tienen, borra antes sus filas en la rama `DELETE`, igual que hace `private.cleanup_experience_social`.

**(b) `private.can_view_interaction_target`:** copia **literal** de la definición de `supabase/migrations/20261002120712_experiences_social_visibility.sql` (o de una posterior si `grep -l "function private.can_view_interaction_target" supabase/migrations/*.sql | tail -1` devuelve otra), añadiendo esta rama justo después de la de `experience`:

```sql
        when t.kind='margin_encounter' then private.can_read_margin_encounter(t.source_id)
```

**(c) `public.can_view_target`:** copia literal de la última definición (hoy en `20261004100400_experience_reviews_moderation.sql`), añadiendo al `case` la rama:

```sql
    when 'margin_encounter' then private.can_read_margin_encounter(p_target_id)
```

**(d) `private.social_target_owner_id`:** copia literal de la última definición, añadiendo:

```sql
    when 'margin_encounter' then (select n.author_id from public.margin_note_encounters e
      join public.margin_notes n on n.id=e.note_id where e.id=p_target_id)
```

**(e) La RPC de avisos:**

```sql
create function public.margin_claim_notices()
returns table(encounter_id uuid, reader_id uuid, author_id uuid, target_id uuid,
  item_type public.item_type, item_id uuid, chapter_label text)
language plpgsql volatile security definer set search_path='' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'auth required' using errcode='42501'; end if;
  return query
  with claimed as (
    update public.margin_note_encounters e set notified_at = now()
    from public.margin_notes n
    where n.id=e.note_id and n.audience='person' and e.notified_at is null
      and (e.reader_id=auth.uid() or n.author_id=auth.uid())
      and exists(select 1 from public.follows f where f.follower_id=e.reader_id and f.followee_id=n.author_id and f.status='accepted')
      and not exists(select 1 from public.user_blocks b where (b.blocker_id=e.reader_id and b.blocked_id=n.author_id)
        or (b.blocker_id=n.author_id and b.blocked_id=e.reader_id))
    returning e.id as eid, e.reader_id as rid, n.author_id as aid, n.item_type as it, n.item_id as iid, n.chapter_label as ch
  )
  select c.eid, c.rid, c.aid, t.id, c.it, c.iid, c.ch
  from claimed c left join public.interaction_targets t on t.kind='margin_encounter' and t.source_id=c.eid;
end $$;
revoke all on function public.margin_claim_notices() from public, anon;
grant execute on function public.margin_claim_notices() to authenticated;
```

**(f) Relleno:** los encuentros creados antes de este trigger no tienen target. Añade al final:

```sql
insert into public.interaction_targets(kind,source_id,owner_id,audience_kind,audience_id,href,commentable,reactable,comment_notification_type,reaction_notification_type)
select 'margin_encounter', e.id, n.author_id, 'profile', e.reader_id, '/margen/'||e.id, true, true, 'margin_commented', 'margin_liked'
from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id
on conflict (kind, source_id) do nothing;
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm run db:local:prepare` y después `npm run test:db:local`
Expected: sin `FAIL`, incluidos los guards de catálogo y el resto de matrices sociales (siguen pasando con las tres funciones redefinidas).

- [ ] **Step 5: Regenerar tipos**

Con el MCP `supabase-dev` caído, usa la vía de `memory/supabase-mcp-fallback.md`. Si no, `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`, apuntando al bootstrap local. Comprueba que aparecen `margin_notes`, `margin_note_encounters`, `margin_claim_notices` y los cuatro valores de enum.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261004120300_margin_notes_social.sql supabase/tests/margin_notes.sql src/lib/supabase/database.types.ts
git commit -m "feat(margen): hilo privado por encuentro y reclamación de avisos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Avisos — tipos, copy, push y contraparte del hilo

**Files:**
- Create: `src/lib/social/thread-recipient.ts`, `src/lib/social/thread-recipient.test.ts`
- Modify: `src/lib/social/interaction-target-gate.ts` (seleccionar también `kind, audience_id`)
- Modify: `src/lib/social/interaction-actions.ts` (reacción y comentario)
- Modify: `src/lib/social/voice-note-actions.ts` (mismo cambio que el comentario)
- Modify: `src/lib/social/notification-types.ts`, `src/lib/push/types.ts`, `src/lib/social/interactions.ts` (`TargetType`)
- Modify: `docs/UI-GLOSARIO.md`, `messages/es.json`

**Interfaces:**
- Produces: `threadRecipients(target: { kind: string; owner_id: string; audience_id: string }, actorId: string): string[]`. Devuelve el dueño si no es quien actúa y, en `margin_encounter`, también el lector (`audience_id`) si actúa el dueño.

- [ ] **Step 1: Test (falla)**

```ts
import { describe, expect, it } from "vitest";
import { threadRecipients } from "./thread-recipient";

const margin = { kind: "margin_encounter", owner_id: "author", audience_id: "reader" };

describe("threadRecipients", () => {
  it("en un hilo de margen, el lector avisa al autor", () => {
    expect(threadRecipients(margin, "reader")).toEqual(["author"]);
  });
  it("en un hilo de margen, el autor avisa al lector", () => {
    expect(threadRecipients(margin, "author")).toEqual(["reader"]);
  });
  it("fuera de los hilos de margen solo avisa al dueño", () => {
    expect(threadRecipients({ kind: "post", owner_id: "a", audience_id: "a" }, "b")).toEqual(["a"]);
    expect(threadRecipients({ kind: "post", owner_id: "a", audience_id: "a" }, "a")).toEqual([]);
  });
});
```

- [ ] **Step 2: Implementar**

```ts
// A quién avisa un comentario o reacción sobre un target. Normalmente solo al
// dueño. En un hilo de nota en el margen hay dos personas y ninguna es «público»:
// cuando escribe el autor (dueño), el aviso va al lector (audience_id).
export function threadRecipients(
  target: { kind: string; owner_id: string; audience_id: string },
  actorId: string,
): string[] {
  if (target.owner_id !== actorId) return [target.owner_id];
  if (target.kind === "margin_encounter" && target.audience_id !== actorId) return [target.audience_id];
  return [];
}
```

- [ ] **Step 3: Usarlo**

- En `getInteractionTarget` añade `kind, audience_id` al `select`.
- En `interaction-actions.ts`, sustituye el bloque `if (target.owner_id !== user.id) { … notify(…owner_id…) }` de la reacción por un bucle `for (const userId of threadRecipients(target, user.id))` con el mismo cuerpo, usando `userId` en lugar de `target.owner_id`. La `dedupeKey` no cambia.
- En `addComment` haz lo mismo con el bloque del dueño: `for (const userId of threadRecipients(target, user.id)) if (!mentioned.includes(userId)) …`.
- En el aviso al autor del comentario padre, sustituye `parent.author_id !== target.owner_id` por `!threadRecipients(target, user.id).includes(parent.author_id)`.
- Repite el cambio en `voice-note-actions.ts` (busca `target.owner_id !== user.id`).
- Ejecuta `npx vitest run src/lib/social` y corrige los dobles de prueba de `interaction-actions.test.ts` y `voice-note-actions.test.ts` que construyen el target: añade `kind: "post", audience_id: <owner>`.

- [ ] **Step 4: Tipos y copy de avisos**

- En `notification-types.ts` añade `| "margin_note_dedicated" | "margin_commented" | "margin_liked"` al union y su clave de copy en el mapa (líneas ~160–170): `margin_note_dedicated: "marginNoteDedicated"`, `margin_commented: "marginCommented"`, `margin_liked: "marginLiked"`.
- En `src/lib/push/types.ts` añade los tres al mapa de categoría. Antes, lee cómo se declaran las categorías en ese fichero: si admite una categoría nueva sin migración, crea `margin` con la etiqueta «Notas en el margen» en preferencias. Si exige migración o columna, usa `"social"` y abre una issue `area:social,tipo:deuda,P3` para la categoría propia. No improvises una tabla.
- En `src/lib/social/interactions.ts` añade `"margin_encounter"` al tipo `TargetType`.
- En `docs/UI-GLOSARIO.md` añade los términos «nota en el margen», «encontrada», «dedicada».
- En `messages/es.json`, dentro del namespace de la campana (el mismo donde vive `experienceReviewed`), añade:

```json
"marginNoteDedicated": "{actor} te dejó una nota en {work}",
"marginCommented": "{actor} respondió en vuestra nota del margen",
"marginLiked": "{actor} reaccionó a vuestra nota del margen"
```

Antes de escribir los placeholders, mira cómo interpola `experienceReviewed` y usa los mismos nombres (`{actor}`, la obra) que ya provee `NotificationContext`. Si el contexto no trae la obra, pásala en `context` desde `deliver.ts` (Task 6) con el mismo campo que usa #797.

- [ ] **Step 5: Ejecutar**

Run: `npx vitest run src/lib/social src/lib/push`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/social src/lib/push docs/UI-GLOSARIO.md messages/es.json
git commit -m "feat(margen): avisos de nota dedicada y contraparte en hilos de pareja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Capa de servidor — lecturas, acciones y entrega de avisos

**Files:**
- Create: `src/lib/margin/queries.ts`
- Create: `src/lib/margin/deliver.ts`, `src/lib/margin/deliver.test.ts`
- Create: `src/lib/margin/actions.ts`
- Modify: `src/lib/sessions/actions.ts`, `src/lib/passes/apply-transition.ts`, `src/lib/series/episode-actions.ts`, `src/lib/social/actions.ts` (llamar a `deliverMarginNotices`)

**Interfaces:**
- Consumes: tipos de la Task 1, la RPC de la Task 4 y `notify` de `src/lib/social/notifications.ts`.
- Produces:
  - `deliverMarginNotices(supabase: SupabaseServerClient): Promise<void>` (best-effort, nunca lanza).
  - `getItemMarginNotes(supabase, viewerId: string, itemType: ItemType, itemId: string): Promise<{ found: MarginNoteView[]; mine: MarginNoteView[] }>`
  - `getMarginReveal(supabase, viewerId: string, itemType: ItemType, itemId: string): Promise<MarginNoteView[]>` (encuentros con `seen_at null` y `found_via ≠ retro`)
  - `getMarginThread(supabase, viewerId: string, encounterId: string): Promise<MarginNoteView | null>`
  - `listMarginForNotebook(supabase, viewerId: string, mode: "found" | "mine", page: number): Promise<{ notes: MarginNoteView[]; hasMore: boolean }>`
  - Acciones:
    - `createMarginNote(input: CreateMarginNoteInput): Promise<{ ok: true; id: string } | { ok: false; error: MarginError }>`
    - `updateMarginNote(id: string, patch: { body: string; chapterLabel: string | null; isSpoiler: boolean })` → mismo resultado
    - `deleteMarginNote(id: string): Promise<{ ok: boolean }>`
    - `markMarginSeen(encounterIds: string[]): Promise<void>`
  - `type MarginError = "unauthenticated" | "invalidPosition" | "invalidBody" | "invalidChapter" | "recipientNotFollower" | "generic"`
  - `type CreateMarginNoteInput = { itemType: ItemType; itemId: string; page?: number | null; season?: number | null; episode?: number | null; chapterLabel: string | null; body: string; isSpoiler: boolean; recipientId: string | null }`

- [ ] **Step 1: Test de `deliverMarginNotices` (falla)**

`deliver.test.ts` simula el cliente con un objeto mínimo y espía `notify`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.fn();
vi.mock("@/lib/social/notifications", () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock("server-only", () => ({}));

import { deliverMarginNotices } from "./deliver";

function client(rows: unknown[] | null, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data: rows, error }) } as never;
}

describe("deliverMarginNotices", () => {
  beforeEach(() => notify.mockReset());

  it("avisa al lector con el autor como actor y el hilo como destino", async () => {
    await deliverMarginNotices(client([
      { encounter_id: "e1", reader_id: "r", author_id: "a", target_id: "t1", item_type: "book", item_id: "b", chapter_label: "Cap. 12" },
    ]));
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "r", actorId: "a", type: "margin_note_dedicated", interactionTargetId: "t1",
      dedupeKey: "margin_note_dedicated:e1",
    }));
  });

  it("nunca lanza aunque falle la RPC", async () => {
    await expect(deliverMarginNotices(client(null, new Error("boom")))).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implementar `deliver.ts`**

```ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/social/notifications";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Reclama (marca notified_at) y envía los avisos de notas DEDICADAS abiertas en
// las que quien llama es autor o lector. Best-effort: un fallo aquí nunca debe
// tumbar la acción que lo llama (guardar sesión, marcar episodio…).
export async function deliverMarginNotices(supabase: SupabaseServerClient): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("margin_claim_notices");
    if (error || !data) {
      if (error) console.error("margin_claim_notices failed", error);
      return;
    }
    await Promise.all(
      data.map((row) =>
        notify(supabase, {
          userId: row.reader_id,
          actorId: row.author_id,
          type: "margin_note_dedicated",
          interactionTargetId: row.target_id ?? undefined,
          dedupeKey: `margin_note_dedicated:${row.encounter_id}`,
          context: undefined,
        }).catch((e: unknown) => console.error(e)),
      ),
    );
  } catch (e) {
    console.error(e);
  }
}
```

Comprueba la firma real de `notify` (`src/lib/social/notifications.ts:32`) y ajusta los nombres de campo (`interactionTargetId`, `context`) si difieren. Si la copia necesita la obra (Task 5, Step 4), rellena `context` con lo que exija `NotificationContext`.

- [ ] **Step 3: Ejecutar**

Run: `npx vitest run src/lib/margin/deliver.test.ts`
Expected: PASS

- [ ] **Step 4: Implementar `queries.ts`**

```ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MarginAnchor, MarginNoteView, MarginPerson } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const NOTE_COLS =
  "id, author_id, item_type, item_id, anchor, chapter_label, body, is_spoiler, audience, recipient_id, created_at";

type NoteRow = {
  id: string; author_id: string; item_type: ItemType; item_id: string; anchor: MarginAnchor;
  chapter_label: string | null; body: string; is_spoiler: boolean; audience: "followers" | "person";
  recipient_id: string | null; created_at: string;
};
type EncounterRow = {
  id: string; note_id: string; reader_id: string; found_at: string;
  found_via: "progress" | "finish" | "retro"; seen_at: string | null;
};

async function people(supabase: SupabaseServerClient, ids: string[]): Promise<Map<string, MarginPerson>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.user_id, {
    id: p.user_id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url,
  }]));
}

const UNKNOWN: MarginPerson = { id: "", username: "", displayName: null, avatarUrl: null };

function view(note: NoteRow, who: Map<string, MarginPerson>, encounter: EncounterRow | null,
  foundBy: MarginNoteView["foundBy"]): MarginNoteView {
  return {
    noteId: note.id, itemType: note.item_type, itemId: note.item_id, anchor: note.anchor,
    chapterLabel: note.chapter_label, body: note.body, isSpoiler: note.is_spoiler,
    audience: note.audience, createdAt: note.created_at,
    author: who.get(note.author_id) ?? UNKNOWN,
    encounter: encounter && { id: encounter.id, foundAt: encounter.found_at, foundVia: encounter.found_via, seenAt: encounter.seen_at },
    foundBy,
    recipient: note.recipient_id ? who.get(note.recipient_id) ?? null : null,
  };
}

// Orden dentro de una obra: por punto de la obra («al terminar» al final).
export function anchorSortKey(a: MarginAnchor): number {
  if (a.kind === "ratio") return a.ratio;
  if (a.kind === "episode") return a.season * 10_000 + a.episode;
  return Number.MAX_SAFE_INTEGER;
}

export async function getItemMarginNotes(supabase: SupabaseServerClient, viewerId: string,
  itemType: ItemType, itemId: string): Promise<{ found: MarginNoteView[]; mine: MarginNoteView[] }> {
  // RLS deja ver las propias y las abiertas: no hace falta filtrar más.
  const { data: notes, error } = await supabase.from("margin_notes").select(NOTE_COLS)
    .eq("item_type", itemType).eq("item_id", itemId);
  if (error) throw error;
  const rows = (notes ?? []) as NoteRow[];
  if (rows.length === 0) return { found: [], mine: [] };
  const { data: encs, error: encError } = await supabase.from("margin_note_encounters")
    .select("id, note_id, reader_id, found_at, found_via, seen_at").in("note_id", rows.map((n) => n.id));
  if (encError) throw encError;
  const encounters = (encs ?? []) as EncounterRow[];
  const who = await people(supabase, [
    ...rows.map((n) => n.author_id), ...rows.flatMap((n) => (n.recipient_id ? [n.recipient_id] : [])),
    ...encounters.map((e) => e.reader_id),
  ]);
  const found: MarginNoteView[] = [];
  const mine: MarginNoteView[] = [];
  for (const n of rows) {
    if (n.author_id === viewerId) {
      const readers = encounters.filter((e) => e.note_id === n.id)
        .map((e) => ({ encounterId: e.id, reader: who.get(e.reader_id) ?? UNKNOWN }));
      mine.push(view(n, who, null, readers));
    } else {
      const own = encounters.find((e) => e.note_id === n.id && e.reader_id === viewerId) ?? null;
      if (own) found.push(view(n, who, own, null));
    }
  }
  const byAnchor = (a: MarginNoteView, b: MarginNoteView) => anchorSortKey(a.anchor) - anchorSortKey(b.anchor);
  return { found: found.sort(byAnchor), mine: mine.sort(byAnchor) };
}

export async function getMarginReveal(supabase: SupabaseServerClient, viewerId: string,
  itemType: ItemType, itemId: string): Promise<MarginNoteView[]> {
  const { found } = await getItemMarginNotes(supabase, viewerId, itemType, itemId);
  return found.filter((n) => n.encounter && n.encounter.seenAt === null && n.encounter.foundVia !== "retro");
}

export async function getMarginThread(supabase: SupabaseServerClient, viewerId: string,
  encounterId: string): Promise<MarginNoteView | null> {
  const { data: enc, error } = await supabase.from("margin_note_encounters")
    .select("id, note_id, reader_id, found_at, found_via, seen_at").eq("id", encounterId).maybeSingle();
  if (error) throw error;
  if (!enc) return null;
  const { data: note, error: noteError } = await supabase.from("margin_notes").select(NOTE_COLS)
    .eq("id", enc.note_id).maybeSingle();
  if (noteError) throw noteError;
  if (!note) return null;
  const n = note as NoteRow;
  const e = enc as EncounterRow;
  const who = await people(supabase, [n.author_id, e.reader_id]);
  return view(n, who, e, n.author_id === viewerId ? [{ encounterId: e.id, reader: who.get(e.reader_id) ?? UNKNOWN }] : null);
}

const PAGE = 20;

export async function listMarginForNotebook(supabase: SupabaseServerClient, viewerId: string,
  mode: "found" | "mine", page: number): Promise<{ notes: MarginNoteView[]; hasMore: boolean }> {
  const from = (page - 1) * PAGE;
  if (mode === "mine") {
    const { data, error } = await supabase.from("margin_notes").select(NOTE_COLS)
      .eq("author_id", viewerId).order("created_at", { ascending: false }).range(from, from + PAGE);
    if (error) throw error;
    const rows = (data ?? []) as NoteRow[];
    const who = await people(supabase, [viewerId, ...rows.flatMap((n) => (n.recipient_id ? [n.recipient_id] : []))]);
    return { notes: rows.slice(0, PAGE).map((n) => view(n, who, null, null)), hasMore: rows.length > PAGE };
  }
  const { data, error } = await supabase.from("margin_note_encounters")
    .select("id, note_id, reader_id, found_at, found_via, seen_at")
    .eq("reader_id", viewerId).order("found_at", { ascending: false }).range(from, from + PAGE);
  if (error) throw error;
  const encs = (data ?? []) as EncounterRow[];
  if (encs.length === 0) return { notes: [], hasMore: false };
  const { data: notes, error: noteError } = await supabase.from("margin_notes").select(NOTE_COLS)
    .in("id", encs.map((e) => e.note_id));
  if (noteError) throw noteError;
  const byId = new Map(((notes ?? []) as NoteRow[]).map((n) => [n.id, n]));
  const who = await people(supabase, [...byId.values()].map((n) => n.author_id));
  const out = encs.slice(0, PAGE).flatMap((e) => {
    const n = byId.get(e.note_id);
    return n ? [view(n, who, e, null)] : [];
  });
  return { notes: out, hasMore: encs.length > PAGE };
}
```

- [ ] **Step 5: Implementar `actions.ts`**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getActivePass } from "@/lib/passes/get-passes";
import { getEditions } from "@/lib/editions/get-editions";
import { pagesForPass } from "@/lib/editions/edition-label";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";
import { buildMarginAnchor } from "./anchor";
import { deliverMarginNotices } from "./deliver";
import { MARGIN_BODY_MAX, MARGIN_CHAPTER_MAX } from "./types";

export type MarginError =
  | "unauthenticated" | "invalidPosition" | "invalidBody" | "invalidChapter" | "recipientNotFollower" | "generic";
type Result = { ok: true; id: string } | { ok: false; error: MarginError };

export type CreateMarginNoteInput = {
  itemType: ItemType; itemId: string;
  page?: number | null; season?: number | null; episode?: number | null;
  chapterLabel: string | null; body: string; isSpoiler: boolean; recipientId: string | null;
};

function cleanChapter(itemType: ItemType, raw: string | null): string | null | false {
  if (itemType !== "book") return null;
  const v = (raw ?? "").trim();
  return v.length >= 1 && v.length <= MARGIN_CHAPTER_MAX ? v : false;
}

function cleanBody(raw: string): string | false {
  const v = raw.trim();
  return v.length >= 1 && v.length <= MARGIN_BODY_MAX ? v : false;
}

export async function createMarginNote(input: CreateMarginNoteInput): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const body = cleanBody(input.body);
  if (body === false) return { ok: false, error: "invalidBody" };
  const chapter = cleanChapter(input.itemType, input.chapterLabel);
  if (chapter === false) return { ok: false, error: "invalidChapter" };

  // Páginas de la edición del pase de quien escribe (misma regla que addSession).
  let pages: number | null = null;
  if (input.itemType === "book" && input.page != null) {
    const pass = await getActivePass(supabase, "book", input.itemId, user.id);
    const editions = pass?.editionId ? await getEditions("book", input.itemId) : [];
    const passEdition = editions.find((e) => e.id === pass?.editionId) ?? null;
    let workTotal: number | null = null;
    if (passEdition?.totalUnits == null) {
      const { data: book } = await supabase.from("books").select("total_pages").eq("id", input.itemId).maybeSingle();
      workTotal = book?.total_pages ?? null;
    }
    pages = pagesForPass(passEdition, workTotal);
  }

  const built = input.itemType === "book"
    ? buildMarginAnchor({ itemType: "book", page: input.page ?? null, pages })
    : input.itemType === "series"
      ? buildMarginAnchor({ itemType: "series", season: input.season ?? null, episode: input.episode ?? null })
      : buildMarginAnchor({ itemType: "movie" });
  if (!built.ok) return { ok: false, error: "invalidPosition" };

  const { data, error } = await supabase.from("margin_notes").insert({
    author_id: user.id, item_type: input.itemType, item_id: input.itemId, anchor: built.anchor,
    chapter_label: chapter, body, is_spoiler: input.isSpoiler,
    audience: input.recipientId ? "person" : "followers", recipient_id: input.recipientId,
  }).select("id").single();
  if (error) {
    if (error.code === "42501") return { ok: false, error: "recipientNotFollower" };
    if (error.code === "22023") return { ok: false, error: "invalidPosition" };
    console.error(error);
    return { ok: false, error: "generic" };
  }
  await deliverMarginNotices(supabase); // dedicada retroactiva
  revalidateReadingLog(input.itemType, input.itemId);
  return { ok: true, id: data.id };
}

export async function updateMarginNote(id: string,
  patch: { body: string; chapterLabel: string | null; isSpoiler: boolean }): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { data: current } = await supabase.from("margin_notes").select("item_type, item_id")
    .eq("id", id).eq("author_id", user.id).maybeSingle();
  if (!current) return { ok: false, error: "generic" };
  const body = cleanBody(patch.body);
  if (body === false) return { ok: false, error: "invalidBody" };
  const chapter = cleanChapter(current.item_type, patch.chapterLabel);
  if (chapter === false) return { ok: false, error: "invalidChapter" };
  const { error } = await supabase.from("margin_notes")
    .update({ body, chapter_label: chapter, is_spoiler: patch.isSpoiler }).eq("id", id);
  if (error) { console.error(error); return { ok: false, error: "generic" }; }
  revalidateReadingLog(current.item_type, current.item_id);
  return { ok: true, id };
}

export async function deleteMarginNote(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: current } = await supabase.from("margin_notes").select("item_type, item_id")
    .eq("id", id).eq("author_id", user.id).maybeSingle();
  if (!current) return { ok: false };
  const { error } = await supabase.from("margin_notes").delete().eq("id", id);
  if (error) { console.error(error); return { ok: false }; }
  revalidateReadingLog(current.item_type, current.item_id);
  return { ok: true };
}

export async function markMarginSeen(encounterIds: string[]): Promise<void> {
  if (!Array.isArray(encounterIds) || encounterIds.length === 0 || encounterIds.length > 50) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("margin_note_encounters").update({ seen_at: new Date().toISOString() })
    .in("id", encounterIds).eq("reader_id", user.id).is("seen_at", null);
  await deliverMarginNotices(supabase);
}
```

Verifica que `revalidateReadingLog(itemType, itemId)` revalida la ficha. Si no, usa el helper que use `addSession` para la ficha.

- [ ] **Step 6: Enganchar la entrega en las acciones existentes**

Añade `import { deliverMarginNotices } from "@/lib/margin/deliver";` y una llamada `await deliverMarginNotices(supabase);` en estos puntos:

- `src/lib/sessions/actions.ts` (`addSession`): justo antes de cada `revalidateReadingLog(itemType, itemId)` que precede a un `return { ok: true … }`.
- `src/lib/passes/apply-transition.ts`: al final de `applyTransition`, antes del `return` del caso aplicado (no en `askResume`).
- `src/lib/series/episode-actions.ts`: al final de `markEpisodesWatched` y de cada acción exportada que inserte `episode_watches` (`grep -n "insertEpisodeWatches\|markEpisodeWatched(" src/lib/series/episode-actions.ts`).
- `src/lib/social/actions.ts`: tras el update de `acceptFollowRequest` (si `data.length > 0`) y tras el insert de `followUser` cuando el follow nace `accepted`.

Run: `npx vitest run src/lib/sessions src/lib/passes src/lib/series src/lib/social`
Expected: PASS. Si un test con cliente simulado falla porque no sabe responder a `rpc("margin_claim_notices")`, añade `vi.mock("@/lib/margin/deliver", () => ({ deliverMarginNotices: vi.fn() }))` en ese fichero de test.

- [ ] **Step 7: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores

```bash
git add src/lib/margin src/lib/sessions/actions.ts src/lib/passes/apply-transition.ts src/lib/series/episode-actions.ts src/lib/social/actions.ts
git commit -m "feat(margen): lecturas, acciones y entrega de avisos de dedicadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Escribir — `MarginNoteComposer` y sus tres puntos de entrada

**Files:**
- Create: `src/components/margin/margin-note-composer.tsx`, `src/components/margin/margin-note-composer.test.tsx`
- Create: `src/lib/margin/follower-search.ts` (server action de búsqueda entre tus seguidores)
- Modify: `src/components/session/session-sheet.tsx` (acción «Dejar en el margen»)
- Modify: `src/components/detail/episode-panel.tsx` (acción por episodio visto)
- Modify: `messages/es.json` (namespace `margin`)

**Interfaces:**
- Consumes: `createMarginNote` (Task 6) y `unlockPageHint` (Task 1).
- Produces: `<MarginNoteComposer itemType itemId defaultPage? pages? defaultEpisode? onDone? />`, un formulario en una hoja (usa el mismo primitivo de hoja que `close-pass-sheet.tsx`).
- Produces: `searchMyFollowers(q: string): Promise<MarginPerson[]>`, máximo 8 resultados, solo follows `accepted` hacia ti, por `username` o `display_name` con `ilike`.

- [ ] **Step 1: Copy**

En `messages/es.json` añade el namespace `margin`:

```json
"margin": {
  "leave": "Dejar en el margen",
  "leaveEpisode": "Dejar nota en este episodio",
  "leaveFromDetail": "Dejar una nota en el margen",
  "chapter": "Capítulo",
  "chapterHint": "A qué capítulo se refiere, para que nadie se líe con las páginas",
  "page": "Página",
  "atFinish": "Al terminar",
  "body": "Tu nota",
  "audience": "Para quién",
  "audienceFollowers": "Mis seguidores",
  "audiencePerson": "Una persona",
  "searchFollower": "Busca entre quienes te siguen",
  "spoiler": "Destripa más allá de este punto",
  "opensAround": "Se abrirá hacia la p. {page} de una edición como la tuya",
  "opensAtFinish": "Se abrirá cuando terminen la obra",
  "save": "Dejar la nota",
  "saved": "Nota dejada en el margen",
  "errors": {
    "invalidPosition": "Revisa la página o el episodio",
    "invalidBody": "Escribe la nota (máximo 2000 caracteres)",
    "invalidChapter": "Indica el capítulo (máximo 80 caracteres)",
    "recipientNotFollower": "Esa persona ya no te sigue",
    "generic": "No se pudo guardar. Inténtalo de nuevo"
  }
}
```

El resto de claves de las tareas 8–10 también van en este namespace.

- [ ] **Step 2: Test del formulario (falla)**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const createMarginNote = vi.fn().mockResolvedValue({ ok: true, id: "n1" });
vi.mock("@/lib/margin/actions", () => ({ createMarginNote: (...a: unknown[]) => createMarginNote(...a) }));
vi.mock("@/lib/margin/follower-search", () => ({ searchMyFollowers: vi.fn().mockResolvedValue([]) }));

import { MarginNoteComposer } from "./margin-note-composer";

function setup(props: Partial<React.ComponentProps<typeof MarginNoteComposer>> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <MarginNoteComposer itemType="book" itemId="b1" defaultPage={214} pages={400} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("MarginNoteComposer", () => {
  it("exige capítulo en libros", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Tu nota"), "aquí lloré");
    await userEvent.click(screen.getByRole("button", { name: "Dejar la nota" }));
    expect(createMarginNote).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Indica el capítulo");
  });

  it("muestra la pista de apertura y envía la nota general", async () => {
    setup();
    expect(screen.getByText(/hacia la p\. 226/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Capítulo"), "Cap. 12");
    await userEvent.type(screen.getByLabelText("Tu nota"), "aquí lloré");
    await userEvent.click(screen.getByRole("button", { name: "Dejar la nota" }));
    expect(createMarginNote).toHaveBeenCalledWith(expect.objectContaining({
      itemType: "book", itemId: "b1", page: 214, chapterLabel: "Cap. 12", body: "aquí lloré", recipientId: null,
    }));
  });

  it("película: sin página ni capítulo, «al terminar»", () => {
    setup({ itemType: "movie", defaultPage: undefined, pages: undefined });
    expect(screen.queryByLabelText("Capítulo")).toBeNull();
    expect(screen.getByText("Se abrirá cuando terminen la obra")).toBeInTheDocument();
  });
});
```

Antes de dar el test por bueno, comprueba cómo montan `NextIntlClientProvider` otros tests de componentes (p. ej. `src/components/detail/edition-picker.test.tsx`) y copia ese patrón si difiere.

- [ ] **Step 3: Implementar el componente**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { createMarginNote, type MarginError } from "@/lib/margin/actions";
import { searchMyFollowers } from "@/lib/margin/follower-search";
import { unlockPageHint } from "@/lib/margin/threshold";
import type { MarginPerson } from "@/lib/margin/types";

type Props = {
  itemType: ItemType;
  itemId: string;
  defaultPage?: number;
  pages?: number | null;
  defaultEpisode?: { season: number; episode: number };
  onDone?: () => void;
};

export function MarginNoteComposer({ itemType, itemId, defaultPage, pages, defaultEpisode, onDone }: Props) {
  const t = useTranslations("margin");
  const [page, setPage] = useState<string>(defaultPage ? String(defaultPage) : "");
  const [chapter, setChapter] = useState("");
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [recipient, setRecipient] = useState<MarginPerson | null>(null);
  const [personMode, setPersonMode] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarginPerson[]>([]);
  const [error, setError] = useState<MarginError | null>(null);
  const [pending, start] = useTransition();

  const pageNumber = page === "" ? null : Number(page);
  const hint =
    itemType === "book" && pageNumber && pages
      ? unlockPageHint(pageNumber / pages, pages)
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (itemType === "book" && chapter.trim() === "") return setError("invalidChapter");
    if (body.trim() === "") return setError("invalidBody");
    setError(null);
    start(async () => {
      const result = await createMarginNote({
        itemType, itemId,
        page: itemType === "book" ? pageNumber : null,
        season: defaultEpisode?.season ?? null,
        episode: defaultEpisode?.episode ?? null,
        chapterLabel: itemType === "book" ? chapter : null,
        body, isSpoiler: spoiler,
        recipientId: personMode ? recipient?.id ?? null : null,
      });
      if (!result.ok) return setError(result.error);
      onDone?.();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {itemType === "book" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {t("page")}
            <input inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))}
              className="min-h-11 rounded-md border px-3" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("chapter")}
            <input value={chapter} maxLength={80} onChange={(e) => setChapter(e.target.value)}
              className="min-h-11 rounded-md border px-3" aria-describedby="margin-chapter-hint" />
            <span id="margin-chapter-hint" className="text-xs text-muted-foreground">{t("chapterHint")}</span>
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        {t("body")}
        <textarea value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)}
          className="min-h-24 rounded-md border px-3 py-2" />
      </label>
      <p className="text-xs text-muted-foreground">
        {hint ? t("opensAround", { page: hint }) : itemType === "series" && defaultEpisode ? null : t("opensAtFinish")}
      </p>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">{t("audience")}</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={!personMode} onChange={() => setPersonMode(false)} /> {t("audienceFollowers")}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={personMode} onChange={() => setPersonMode(true)} /> {t("audiencePerson")}
        </label>
        {personMode && (
          <div className="flex flex-col gap-1">
            <input aria-label={t("searchFollower")} placeholder={t("searchFollower")} value={recipient ? recipient.username : query}
              onChange={async (e) => {
                setRecipient(null);
                setQuery(e.target.value);
                setResults(e.target.value.trim().length >= 2 ? await searchMyFollowers(e.target.value) : []);
              }}
              className="min-h-11 rounded-md border px-3" />
            {!recipient && results.length > 0 && (
              <ul role="listbox" className="rounded-md border">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="min-h-11 w-full px-3 text-left" onClick={() => setRecipient(p)}>
                      {p.displayName ?? p.username} <span className="text-muted-foreground">@{p.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </fieldset>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> {t("spoiler")}
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{t(`errors.${error}`)}</p>}
      <button type="submit" disabled={pending || (personMode && !recipient)} className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground">
        {t("save")}
      </button>
    </form>
  );
}
```

Ajusta las clases a los primitivos de formulario del repo (mira `src/components/notes/note-form.tsx` y reutiliza sus componentes de input y botón si existen) en lugar de inventar estilos.

`src/lib/margin/follower-search.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { MarginPerson } from "./types";

export async function searchMyFollowers(q: string): Promise<MarginPerson[]> {
  const term = q.trim().replace(/[%_,()]/g, "");
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: follows } = await supabase.from("follows").select("follower_id")
    .eq("followee_id", user.id).eq("status", "accepted").limit(1000);
  const ids = (follows ?? []).map((f) => f.follower_id);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("profiles").select("user_id, username, display_name, avatar_url")
    .in("user_id", ids).or(`username.ilike.%${term}%,display_name.ilike.%${term}%`).limit(8);
  return (data ?? []).map((p) => ({ id: p.user_id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url }));
}
```

- [ ] **Step 4: Ejecutar el test**

Run: `npx vitest run src/components/margin`
Expected: PASS (3 tests). La pista de «p. 226» sale de `unlockPageHint(214/400, 400)` = ceil((0.535 + 0.03) × 400) = 226.

- [ ] **Step 5: Puntos de entrada**

- **Hoja de sesión** (`session-sheet.tsx`): junto a `SessionNotebook`, añade un botón secundario «Dejar en el margen» que abre `MarginNoteComposer` en una hoja.
  - `defaultPage` es el valor actual del campo de página. Léelo del estado de `BookProgressField` o, si no está elevado, del `FormData` del formulario al abrir.
  - `pages` es el total que ya calcula la hoja.
  - En series no se pinta aquí: va por episodio.
- **Panel de episodios** (`episode-panel.tsx`): en cada episodio marcado como visto, acción «Dejar nota en este episodio» → composer con `defaultEpisode`.
- **Ficha**: el botón «Dejar una nota en el margen» lo pinta `MarginSection` (Task 8). En libros pasa `pages` (`pagesForPass` del pase activo) y sin `defaultPage`. En películas, sin nada.

Run: `npx vitest run src/components/session src/components/detail`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/margin src/lib/margin/follower-search.ts src/components/session/session-sheet.tsx src/components/detail/episode-panel.tsx messages/es.json
git commit -m "feat(margen): formulario para dejar notas desde la sesión, el episodio y la ficha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Encontrar y revisar — bloque de ficha y hoja de revelación

**Files:**
- Create: `src/components/margin/margin-note-card.tsx`
- Create: `src/components/margin/margin-section.tsx`
- Create: `src/components/margin/margin-reveal.tsx`, `src/components/margin/margin-reveal.test.tsx`
- Modify: `src/app/libro/[id]/page.tsx`, `src/app/serie/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`

**Interfaces:**
- Consumes: `getItemMarginNotes` y `markMarginSeen` (Task 6), `MarginNoteComposer` (Task 7).
- Produces:
  - `<MarginSection itemType itemId pages marginPromise />` (servidor; `marginPromise` = `getItemMarginNotes(...)` iniciada en la página, mismo patrón que `notesPromise`).
  - `<MarginReveal notes={MarginNoteView[]} />` (cliente).

- [ ] **Step 1: Copy de esta tarea** (namespace `margin`)

```json
"sectionTitle": "Notas en el margen",
"sectionEmpty": "Aún no has encontrado notas en esta obra",
"mine": "Las que dejaste",
"foundBy": "La encontraron: {names}",
"foundByNobody": "Nadie la ha encontrado todavía",
"onPage": "p. {page} en su edición",
"chapterLabel": "{chapter}",
"episodeLabel": "T{season} · E{episode}",
"finishLabel": "Al terminar",
"forYou": "Para ti",
"forPerson": "Para {name}",
"new": "Nueva",
"revealTitle": "{count, plural, one {Has encontrado una nota en el margen} other {Has encontrado # notas en el margen}}",
"reply": "Responder",
"close": "Seguir",
"delete": "Borrar",
"deleteConfirm": "{count, plural, =0 {¿Borrar esta nota?} one {¿Borrar esta nota? Se perderá la conversación con una persona.} other {¿Borrar esta nota? Se perderán # conversaciones.}}"
```

- [ ] **Step 2: Tarjeta**

`margin-note-card.tsx` (servidor o cliente indistinto, sin estado):

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/social/user-avatar";
import type { MarginNoteView } from "@/lib/margin/types";

export function MarginNoteCard({ note, showNew = false }: { note: MarginNoteView; showNew?: boolean }) {
  const t = useTranslations("margin");
  const where =
    note.anchor.kind === "ratio"
      ? `${note.chapterLabel} · ${t("onPage", { page: note.anchor.page })}`
      : note.anchor.kind === "episode"
        ? t("episodeLabel", { season: note.anchor.season, episode: note.anchor.episode })
        : t("finishLabel");
  return (
    <article className="flex flex-col gap-2 rounded-md border bg-card p-3 shadow-sm">
      <header className="flex items-center gap-2 text-sm">
        <UserAvatar user={note.author} size="sm" />
        <span className="font-medium">{note.author.displayName ?? note.author.username}</span>
        <span className="text-muted-foreground">{where}</span>
        {note.audience === "person" && (
          <span className="text-xs">{note.encounter ? t("forYou") : t("forPerson", { name: note.recipient?.username ?? "" })}</span>
        )}
        {showNew && <span className="ml-auto text-xs font-semibold">{t("new")}</span>}
      </header>
      <p className="whitespace-pre-line text-sm">{note.body}</p>
      {note.encounter && (
        <Link href={`/margen/${note.encounter.id}`} className="min-h-11 self-start py-2 text-sm underline">
          {t("reply")}
        </Link>
      )}
      {note.foundBy && (
        <p className="text-xs text-muted-foreground">
          {note.foundBy.length === 0
            ? t("foundByNobody")
            : t("foundBy", { names: note.foundBy.map((f) => f.reader.displayName ?? f.reader.username).join(", ") })}
        </p>
      )}
    </article>
  );
}
```

Hay tres cosas que comprobar contra el código:

- Las props reales de `UserAvatar` (`src/components/social/user-avatar.tsx`); adáptalas.
- Envuelve el cuerpo en `SpoilerGate` cuando `note.isSpoiler` (busca su import en `note-card.tsx`).
- Para el autor, cada nombre de `foundBy` es un enlace a `/margen/<encounterId>`.

- [ ] **Step 3: Test de la revelación (falla)**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const markMarginSeen = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/margin/actions", () => ({ markMarginSeen: (...a: unknown[]) => markMarginSeen(...a) }));

import { MarginReveal } from "./margin-reveal";
import type { MarginNoteView } from "@/lib/margin/types";

const note = (id: string): MarginNoteView => ({
  noteId: `n${id}`, itemType: "book", itemId: "b", anchor: { kind: "ratio", ratio: 0.5, page: 200, pages: 400 },
  chapterLabel: "Cap. 12", body: `nota ${id}`, isSpoiler: false, audience: "followers", createdAt: "2026-10-04T00:00:00Z",
  author: { id: "a", username: "lucia", displayName: "Lucía", avatarUrl: null },
  encounter: { id: `e${id}`, foundAt: "2026-10-04T00:00:00Z", foundVia: "progress", seenAt: null },
  foundBy: null, recipient: null,
});

function setup(notes: MarginNoteView[]) {
  return render(<NextIntlClientProvider locale="es" messages={messages}><MarginReveal notes={notes} /></NextIntlClientProvider>);
}

describe("MarginReveal", () => {
  it("no pinta nada sin notas nuevas", () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });
  it("anuncia y marca como vistas al cerrar", async () => {
    setup([note("1"), note("2")]);
    expect(screen.getByRole("dialog", { name: "Has encontrado 2 notas en el margen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Seguir" }));
    expect(markMarginSeen).toHaveBeenCalledWith(["e1", "e2"]);
  });
});
```

- [ ] **Step 4: Implementar la revelación**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { markMarginSeen } from "@/lib/margin/actions";
import type { MarginNoteView } from "@/lib/margin/types";
import { MarginNoteCard } from "./margin-note-card";

// Aparece cuando la ficha se vuelve a renderizar tras guardar progreso y hay
// encuentros por progreso/cierre sin ver. Los retroactivos NO pasan por aquí.
export function MarginReveal({ notes }: { notes: MarginNoteView[] }) {
  const t = useTranslations("margin");
  const [open, setOpen] = useState(notes.length > 0);
  if (!open || notes.length === 0) return null;
  const title = t("revealTitle", { count: notes.length });
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-xl bg-background p-4 sm:rounded-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        {notes.map((n) => <MarginNoteCard key={n.noteId} note={n} />)}
        <button type="button" className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground"
          onClick={() => { setOpen(false); void markMarginSeen(notes.flatMap((n) => (n.encounter ? [n.encounter.id] : []))); }}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}
```

Si el repo tiene un primitivo de hoja (`close-pass-sheet.tsx` usa uno), úsalo en vez del `div` fijo, conservando `role="dialog"` y el nombre accesible. Así el test sigue valiendo.

- [ ] **Step 5: Bloque de la ficha**

`margin-section.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { getItemMarginNotes } from "@/lib/margin/queries";
import { MarginNoteCard } from "./margin-note-card";
import { MarginReveal } from "./margin-reveal";
import { MarginComposerButton } from "./margin-composer-button";

export async function MarginSection({ itemType, itemId, pages, marginPromise }: {
  itemType: ItemType; itemId: string; pages: number | null;
  marginPromise: ReturnType<typeof getItemMarginNotes>;
}) {
  const t = await getTranslations("margin");
  const { found, mine } = await marginPromise;
  const reveal = found.filter((n) => n.encounter && !n.encounter.seenAt && n.encounter.foundVia !== "retro");
  return (
    <section className="flex flex-col gap-3" aria-labelledby="margin-title">
      <div className="flex items-center justify-between">
        <h3 id="margin-title" className="label-section">{t("sectionTitle")}</h3>
        <MarginComposerButton itemType={itemType} itemId={itemId} pages={pages} />
      </div>
      {found.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sectionEmpty")}</p>
      ) : (
        found.map((n) => (
          <MarginNoteCard key={n.noteId} note={n} showNew={!!n.encounter && !n.encounter.seenAt && n.encounter.foundVia === "retro"} />
        ))
      )}
      {mine.length > 0 && (
        <>
          <h4 className="text-sm font-medium">{t("mine")}</h4>
          {mine.map((n) => <MarginNoteCard key={n.noteId} note={n} />)}
        </>
      )}
      <MarginReveal key={reveal.map((n) => n.encounter!.id).join(",")} notes={reveal} />
    </section>
  );
}
```

`margin-composer-button.tsx` (cliente): un botón `min-h-11` con texto `t("leaveFromDetail")` que abre `MarginNoteComposer` en una hoja y la cierra en `onDone`.

En las propias se pinta además un botón «Borrar» con confirmación `deleteConfirm` (count = `foundBy.length`) que llama a `deleteMarginNote`. Va en un cliente `MarginOwnActions` dentro de la tarjeta cuando `note.foundBy !== null`.

El `key` de `MarginReveal` hace que vuelva a montarse (y a abrirse) cuando cambian los encuentros nuevos tras una revalidación.

- [ ] **Step 6: Montarlo en las tres fichas**

En `src/app/libro/[id]/page.tsx`, junto a `notesPromise`:

```ts
  const marginPromise = user ? getItemMarginNotes(supabase, user.id, "book", book.id) : null;
  void marginPromise?.catch(() => undefined);
```

Y bajo `<NotesSection … />`:

```tsx
          {userId && marginPromise && (
            <Suspense fallback={null}>
              <MarginSection itemType="book" itemId={book.id} pages={/* pagesForPass del pase activo, el mismo valor que recibe LogPanel como total */ null} marginPromise={marginPromise} />
            </Suspense>
          )}
```

Para `pages` pasa el total que ya calcula la página para el registro (el `workTotalUnits` + edición del pase). Si el valor solo existe dentro de `LogPanel`, pasa `book.total_pages`. La pista es orientativa y la proporción real la fija `createMarginNote` en el servidor.

Repite en `serie/[id]/page.tsx` y `pelicula/[id]/page.tsx` con `pages={null}`.

- [ ] **Step 7: Ejecutar**

Run: `npx vitest run src/components/margin src/app/libro`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/margin src/app/libro src/app/serie src/app/pelicula messages/es.json
git commit -m "feat(margen): bloque en la ficha y revelación al registrar progreso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Hilo privado `/margen/[id]` y filtros del Cuaderno

**Files:**
- Create: `src/app/margen/[id]/page.tsx`, `src/app/margen/[id]/loading.tsx`
- Modify: `src/lib/notes/query.ts` (+ su test): parámetro `margen=encontradas|mias`
- Modify: `src/app/notas/page.tsx`, `src/app/notas/notes-filters.tsx`

**Interfaces:**
- Consumes: `getMarginThread`, `listMarginForNotebook` y `markMarginSeen` (Task 6), `getInteractionSummary` (`src/lib/social/get-interaction-summary.ts`), `ReviewInteractions`.
- Produces: `NotesQuery.margin: "found" | "mine" | null`.

- [ ] **Step 1: Test del parseo (falla)**

En `src/lib/notes/query.test.ts` añade:

```ts
it("lee el filtro de margen", () => {
  expect(parseNotesQuery({ margen: "encontradas" }).margin).toBe("found");
  expect(parseNotesQuery({ margen: "mias" }).margin).toBe("mine");
  expect(parseNotesQuery({ margen: "otra" }).margin).toBeNull();
  expect(defaultNotesQuery().margin).toBeNull();
});
```

Y, si el módulo tiene un serializador a URL (búscalo en `query.ts`), un caso de ida y vuelta.

- [ ] **Step 2: Implementar**

- Añade `margin: "found" | "mine" | null` a `NotesQuery`, con `null` en `defaultNotesQuery()`.
- Parsea `margen` (`encontradas` → `found`, `mias` → `mine`) en `parseNotesQuery`.
- Serialízalo en la función que construye la URL.
- Inclúyelo en `hasActiveFilters`.

Run: `npx vitest run src/lib/notes`
Expected: PASS

- [ ] **Step 3: Cuaderno**

- En `notes-filters.tsx` añade dos chips/enlaces, «Encontradas» y «En el margen», que ponen `margen=…` y quitan el resto de filtros de notas.
- En `notas/page.tsx` (`NotebookContent`), si `query.margin` no es `null`, renderiza `listMarginForNotebook(supabase, user.id, query.margin, query.page)` con `MarginNoteCard` (con `showNew` para las no vistas) y la paginación existente (`notes-pager.tsx`, `hasMore`), en lugar de la lista de notas.

Copy:

```json
"notebookFound": "Encontradas",
"notebookMine": "En el margen",
"notebookFoundEmpty": "Cuando alguien a quien sigues te deje una nota y llegues a ese punto, aparecerá aquí",
"notebookMineEmpty": "Aún no has dejado notas en el margen"
```

- [ ] **Step 4: Página del hilo**

`src/app/margen/[id]/page.tsx`. Sigue el patrón de `src/app/juntos/[id]/page.tsx`: UUID, login, `notFound`, `RouteMessages` y nada cacheado.

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMarginThread } from "@/lib/margin/queries";
import { getInteractionSummary } from "@/lib/social/get-interaction-summary";
import { itemHref } from "@/lib/catalog/item-href";
import { MarginNoteCard } from "@/components/margin/margin-note-card";
import { MarginThreadInteractions } from "@/components/margin/margin-thread-interactions";
import { MarkSeenOnMount } from "@/components/margin/mark-seen-on-mount";
import { RouteMessages } from "@/components/route-messages";
import { SHELL_READ } from "@/lib/ui/layout";
import { loginHref } from "@/lib/auth/safe-next";

// Hilo privado de una nota en el margen: solo autor y lector (RLS
// can_read_margin_encounter). Depende de quién mira → sin caché (#437).
export const metadata: Metadata = { title: "Nota en el margen — Biblioshare" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MarginThreadRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(`/margen/${id}`));
  const supabase = await createClient();
  const note = await getMarginThread(supabase, user.id, id);
  if (!note) notFound();
  const summaries = await getInteractionSummary(supabase, "margin_encounter", [id]);
  const summary = summaries.get(id);
  const t = await getTranslations("margin");
  return (
    <RouteMessages ns={["margin", "social"]}>
      <main className={SHELL_READ}>
        <Link href={itemHref(note.itemType, note.itemId)} className="min-h-11 py-2 text-sm underline">{t("backToWork")}</Link>
        <MarginNoteCard note={{ ...note, encounter: null }} />
        {summary && <MarginThreadInteractions summary={summary} viewerLoggedIn />}
        {note.encounter && note.encounter.seenAt === null && user.id !== note.author.id && (
          <MarkSeenOnMount encounterId={note.encounter.id} />
        )}
      </main>
    </RouteMessages>
  );
}
```

Ficheros de apoyo:

- `MarginThreadInteractions`: wrapper cliente de `ReviewInteractions`, calcado de `src/components/clubs/checkpoints/checkpoint-chat.tsx` sin `clubId`, con `voiceEnabled` si las notas de voz están disponibles en ese contexto (mira cómo lo decide `post-thread.tsx`).
- `MarkSeenOnMount`: cliente que llama a `markMarginSeen([encounterId])` en un `useEffect`.
- Copy `"backToWork": "Volver a la obra"`.
- **Denuncia:** los comentarios del hilo ya traen la denuncia de `ReviewInteractions`. Para la nota, añade a la página el botón de denuncia que use `post-thread.tsx` (búscalo con `grep -rn "content_reports\|ReportButton" src/components`), con target `margin_encounter` y el id del encuentro. Si el formulario de denuncia restringe los `target_kind` admitidos, amplíalo. Lo que haga falta en el panel de admin va a #1384.
- Comprueba las firmas reales de `itemHref`, `RouteMessages` y `SHELL_READ` en `juntos/[id]/page.tsx`. `getInteractionSummary` debe aceptar `"margin_encounter"` tras la Task 5.

- [ ] **Step 5: Verificación de compilación**

Run: `npx tsc --noEmit` y después `npx vitest run src/lib/notes src/components/margin`
Expected: sin errores, PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/margen src/app/notas src/lib/notes src/components/margin messages/es.json
git commit -m "feat(margen): hilo privado y filtros Encontradas / En el margen en el Cuaderno

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E contra build de producción

**Files:**
- Create: `e2e/support/margin-fixtures.ts`
- Create: `e2e/notas-en-el-margen.spec.ts`

**Interfaces:**
- Consumes: el patrón de `e2e/support/experience-fixtures.ts`:
  - `experienceActor(name, isPublic)` para crear cuentas QA y `deleteExperienceActor` para borrarlas.
  - `loginExperienceUser(page, actor)`.
  - REST con service role, restringido a local o `biblioshare-dev`.

  Reutilízalos importándolos. No los copies.

- [ ] **Step 1: Fixtures**

`margin-fixtures.ts` expone:

- `marginBook()`: crea por REST (service role) un libro `[QA Margin] …` con `total_pages: 400`.
- `follow(followerId, followeeId)`: inserta `follows` `accepted`.
- `clearMarginFixtures(bookIds)`: borra `margin_notes` y `passes` de esos libros y después los libros.

Todo con prefijo `[QA Margin] ` y la misma guarda de host que `experienceRest`.

- [ ] **Step 2: Spec**

```ts
import { expect, test } from "@playwright/test";
import { experienceActor, deleteExperienceActor, loginExperienceUser } from "./support/experience-fixtures";
import { marginBook, follow, clearMarginFixtures } from "./support/margin-fixtures";

test.describe("notas en el margen", () => {
  test("se abre al pasar el margen, se responde y la autora ve el hilo", async ({ browser }) => {
    const author = await experienceActor("margin-author", true);
    const reader = await experienceActor("margin-reader", true);
    const book = await marginBook();
    try {
      await follow(reader.id, author.id);

      const a = await (await browser.newContext()).newPage();
      await loginExperienceUser(a, author);
      await a.goto(`/libro/${book.id}`);
      // La autora añade el libro (si hace falta) y deja la nota desde la ficha.
      await a.getByRole("button", { name: "Dejar una nota en el margen" }).click();
      await a.getByLabel("Página").fill("214");
      await a.getByLabel("Capítulo").fill("Cap. 12");
      await a.getByLabel("Tu nota").fill("[QA Margin] aquí lloré");
      await a.getByRole("button", { name: "Dejar la nota" }).click();
      await expect(a.getByText("[QA Margin] aquí lloré")).toBeVisible();

      const r = await (await browser.newContext()).newPage();
      await loginExperienceUser(r, reader);
      // Sesión hasta la 200: nada.
      await r.goto(`/libro/${book.id}`);
      await registerPages(r, 200);
      await expect(r.getByRole("dialog", { name: /nota en el margen/ })).toHaveCount(0);
      await expect(r.getByText("[QA Margin] aquí lloré")).toHaveCount(0);
      // Sesión hasta la 230: revelación.
      await registerPages(r, 230);
      const reveal = r.getByRole("dialog", { name: "Has encontrado una nota en el margen" });
      await expect(reveal).toBeVisible();
      await expect(reveal.getByText("[QA Margin] aquí lloré")).toBeVisible();
      await reveal.getByRole("link", { name: "Responder" }).click();
      await r.getByRole("textbox").first().fill("[QA Margin] yo también");
      await r.getByRole("button", { name: /Enviar|Comentar/ }).click();
      await expect(r.getByText("[QA Margin] yo también")).toBeVisible();

      // La autora ve quién la encontró y el hilo.
      await a.goto(`/libro/${book.id}`);
      await expect(a.getByText(/La encontraron: /)).toBeVisible();
      await a.getByRole("link", { name: /margin-reader|Responder/ }).first().click();
      await expect(a.getByText("[QA Margin] yo también")).toBeVisible();
    } finally {
      await clearMarginFixtures([book.id]);
      await deleteExperienceActor(author);
      await deleteExperienceActor(reader);
    }
  });

  test("retroactiva: aparece como nueva en la ficha y en el Cuaderno, sin hoja", async ({ browser }) => {
    // reader termina el libro por REST; author escribe; reader abre la ficha:
    // sin diálogo, tarjeta con «Nueva» en la ficha y en /notas?margen=encontradas.
  });
});

async function registerPages(page: import("@playwright/test").Page, to: number) {
  // Usa la hoja de sesión real de la ficha. Lee e2e/sesion-*.spec.ts para el
  // selector exacto del botón de registrar y del campo de página.
}
```

Antes de dar el spec por terminado:

- **`registerPages`:** complétalo leyendo un spec existente que registre sesiones (`grep -ln "sesion\|Registrar" e2e/*.spec.ts`). Copia los selectores de allí, no los inventes.
- **Test retroactivo:** completa su cuerpo siguiendo los comentarios. Termina el libro del lector por REST con `passes.status='completed'`, antes de que la autora escriba.
- **Tercer caso, serie:** añádelo. La nota en el T1E3 no aparece al marcar el T1E4 y sí al marcar el T1E3. Necesita una serie con `series_episodes`. Si crear episodios por REST es inviable por los grants de solo lectura (`series_episodes` solo admite escritura con service role, que es lo que usan las fixtures), créalos con service role.

- [ ] **Step 3: Ejecutar contra build de producción**

Mata lo que ocupe el 3000 y después:

```bash
npm run build
```

```bash
npm run start
```

Espera a que responda (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`) y ejecuta:

```bash
npx playwright test e2e/notas-en-el-margen.spec.ts
```

Expected: 3 passed. Si falla `next start` con `next-request-in-use-cache`, alguna función nueva acabó dentro de un `use cache`: quítala.

- [ ] **Step 4: Commit**

```bash
git add e2e/notas-en-el-margen.spec.ts e2e/support/margin-fixtures.ts
git commit -m "test(margen): e2e de apertura, hilo, retroactiva y serie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Despliegue de esquema y documentación canónica

**Files:**
- Modify: `docs/requirements/data-model.md`, `docs/PROYECTO.md`, `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`
- Modify: `docs/architecture/graph.json` solo si su README indica que se regenera a mano; si hay script, ejecútalo.

- [ ] **Step 1: Dev**

Aplica las cuatro migraciones a `biblioshare-dev`, en orden, con `supabase-dev` o con el conector de `memory/supabase-mcp-fallback.md`. Verifica contra objetos reales:

```sql
select proname from pg_proc where proname in ('margin_reached','open_margin_notes','margin_claim_notices','can_read_margin_note','can_read_margin_encounter');
select relname from pg_class where relname in ('margin_notes','margin_note_encounters');
select polname from pg_policies where tablename in ('margin_notes','margin_note_encounters');
select tgname from pg_trigger where tgname like 'margin_%' or tgname='trg_catalog_reference_item_type';
```

Expected: 5 funciones, 2 tablas, 6 políticas y los triggers `margin_open_on_pass`, `margin_open_on_episode`, `margin_open_on_note`, `margin_open_on_follow`, `margin_notes_guard`, `margin_encounters_sync_target` y el de catálogo.

Ejecuta `supabase/tests/margin_notes.sql` contra dev (hace rollback). Expected: sin `FAIL`.

- [ ] **Step 2: Superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna)**

Ejecuta la consulta de esa superficie para `margin_notes` y `margin_note_encounters`:

- `insert` de `authenticated` en exactamente las 9 columnas de la Task 2.
- `update` en `body`, `chapter_label` e `is_spoiler`.
- `update` de encuentros solo en `seen_at`.

- [ ] **Step 3: Documentación** (Definición de «hecho» de `AGENTS.md`)

- **`data-model.md`:** sección «Notas en el margen» con las dos tablas, el invariante de privacidad, los triggers de apertura, el target `margin_encounter`, la RPC y la fila nueva en el inventario de referencias polimórficas. Fecha de verificación y entorno (dev; prod pendiente).
- **`PROYECTO.md`:** entrada bajo «Social».
- **`backlog.md`:** casilla de #1380 con su estado.
- **`decisiones.md`** (al final, append-only), tres decisiones:
  1. Tabla propia en lugar de ampliar `notes`, por su política pública.
  2. Apertura por proporción con margen hacia atrás, por el precedente #471.
  3. Avisos de dedicadas reclamados desde TypeScript, con el límite asumido de las importaciones.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(margen): esquema, estado y decisiones de notas en el margen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Producción (requiere OK explícito del propietario)**

Pide permiso en el chat. Con el OK:

1. Aplica las cuatro migraciones a producción **antes** de desplegar el código. El código nuevo no se ejecuta sin las tablas, y el esquema solo no cambia el comportamiento actual.
2. Repite las consultas del Step 1 contra producción. **No ejecutes la matriz SQL en producción.**
3. Actualiza la fecha y el entorno en `data-model.md` y commitea.

- [ ] **Step 6: PR**

Abre la PR contra `main` con resumen, enlace a #1380 y a la spec, evidencia (salida de `test:db:local`, vitest y Playwright) y la lista de issues de fuera de alcance (#1381–#1384).
