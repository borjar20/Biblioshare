# Registro, pases y ediciones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar nota y reseña en el "pase" (una lectura o un visionado), colgar las sesiones del pase, e introducir ediciones de libro y versiones de película para que un pase pueda ser contra la teatral y otro contra la extendida.

**Architecture:** `books`/`movies` siguen siendo la obra; dos tablas nuevas (`book_editions`, `movie_versions`) cuelgan de ellas y cada ficha existente engendra su edición primaria. `diary_entries` evoluciona en sitio a "pase" (gana `finished_on` nullable, `is_public`, `edition_id`), y `progress_sessions` gana `pass_id`. Los cambios de estado abren y cierran pases; la comunidad agrega desde pases, no desde `library_entries`.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + RLS), next-intl, Tailwind v4, Vitest 4.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-07-14-registro-pases-ediciones-design.md`. Léela antes de empezar.
- **Node 22 LTS obligatorio.** Vitest 4 no arranca en Node 20.9 (`styleText` de `node:util`). Verifica con `node -v` antes de la Tarea 1; si sale 20.x, para y avisa.
- **La app es en español.** Toda copy visible pasa por next-intl (`messages/es.json`), nunca literales en el JSX. Los comentarios de código en este repo están en español o inglés según el fichero; sigue el del fichero que tocas.
- **Nota: 1–10 en base de datos, 0,5–5 estrellas en pantalla.** Nunca se guarda un número de estrellas.
- **Migraciones:** una por tarea, en `supabase/migrations/YYYYMMDD_<nombre>.sql`, aplicadas con el MCP de Supabase (`apply_migration`). Toda tabla nueva lleva RLS activada y políticas explícitas.
- **Verificación de UI:** checklist manual en markdown (ver `docs/TESTING.md`), nunca E2E automático con navegador.
- **Cuenta de pruebas:** `devtest` (credenciales en `.env.local`). No borrarla nunca.
- **No romper la media de comunidad.** Es el invariante que más duele si se rompe: la Tarea 6 incluye consultas de control antes/después.

---

## Estructura de ficheros

**Nuevos:**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/rating/stars.ts` | Conversión 1–10 ↔ 0,5–5 estrellas. Único sitio que sabe de la escala. |
| `src/lib/editions/types.ts` | `Edition`, `EditionInput`. |
| `src/lib/editions/get-editions.ts` | Leer ediciones de una obra (servidor). |
| `src/lib/editions/actions.ts` | Crear/editar edición (colaborador+), elegir la tuya. |
| `src/lib/editions/edition-label.ts` | Formatear una edición para pantalla ("DeBolsillo · 880 p"). Puro, testeable. |
| `src/lib/passes/types.ts` | `Pass`, `PassInput`. |
| `src/lib/passes/transitions.ts` | Función pura: qué le pasa a los pases ante un cambio de estado. |
| `src/lib/passes/get-passes.ts` | Leer los pases de una entrada (servidor). |
| `src/lib/passes/actions.ts` | Abrir/cerrar/editar/borrar pase (server actions). |
| `src/lib/sessions/timer.ts` | Cronómetro persistente: lógica pura sobre `localStorage`. |
| `src/components/detail/edition-strip.tsx` | Tira de ediciones en Info. |
| `src/components/detail/log-panel.tsx` | Pestaña Registro completa (sustituye a `item-manage-panel.tsx`). |
| `src/components/detail/status-segments.tsx` | Segmented control de estado. |
| `src/components/detail/pass-diary.tsx` | Lista de pases con delta y chip de edición. |
| `src/components/detail/close-pass-sheet.tsx` | Hoja de cierre (fecha, estrellas, reseña, público/privado). |
| `src/components/ui/star-rating.tsx` | Selector y lectura de estrellas con medias. |
| `src/app/sesion/[entryId]/session-timer.tsx` | Cronómetro (cliente). |

**Modificados:** `src/components/item-manage-panel.tsx` (se elimina), `src/components/progress-panel.tsx` (se elimina), `src/components/diary-panel.tsx` (se elimina), `src/components/session-list.tsx`, `src/app/sesion/[entryId]/session-form.tsx`, `src/lib/library/manage-actions.ts`, `src/lib/sessions/actions.ts`, `src/lib/community/get-community.ts`, `src/lib/library/add-existing-item.ts`, las tres páginas de detalle (`src/app/{libro,pelicula,serie}/[id]/page.tsx`), `messages/es.json`, `docs/REQUIREMENTS.md`.

**Fases:** 1 ediciones (T1–T4) · 2 escala y pases (T5–T8) · 3 comunidad (T9) · 4 pestaña Registro (T10–T12) · 5 sesiones (T13–T15) · cierre (T16). Cada fase deja la app funcionando.

---

## Fase 1 — Ediciones

### Task 1: Tablas de ediciones

**Files:**
- Create: `supabase/migrations/20260714_editions.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerar)

**Interfaces:**
- Produces: tablas `public.book_editions` y `public.movie_versions`, con una fila primaria por cada libro/película existente.

- [ ] **Step 1: Comprobar Node**

Run: `node -v`
Expected: `v22.x.x`. Si es 20.x, para y avisa al usuario.

- [ ] **Step 2: Escribir la migración**

```sql
-- Ediciones de libro y versiones de película (§7.x). La obra sigue siendo
-- books/movies; la edición aporta lo que varía entre tiradas: páginas, ISBN,
-- idioma, editorial (o duración y corte, en película). Un pase apunta a una
-- edición, así que "voy por la página 240 de 662" solo es cierto contra la
-- edición que estás leyendo.
create table public.book_editions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  publisher text check (char_length(publisher) <= 120),
  published_year integer check (published_year between 1400 and 2200),
  language text check (char_length(language) <= 10),
  total_pages integer check (total_pages between 1 and 20000),
  isbn text check (char_length(isbn) <= 20),
  cover_url text,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.movie_versions (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  release_year integer check (release_year between 1870 and 2200),
  duration_minutes integer check (duration_minutes between 1 and 1200),
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Una sola primaria por obra.
create unique index book_editions_one_primary
  on public.book_editions (book_id) where is_primary;
create unique index movie_versions_one_primary
  on public.movie_versions (movie_id) where is_primary;

create index book_editions_book_id_idx on public.book_editions (book_id);
create index movie_versions_movie_id_idx on public.movie_versions (movie_id);

-- Backfill: cada obra existente engendra su edición primaria con los datos
-- que hoy lleva sueltos en la ficha.
insert into public.book_editions (book_id, label, publisher, published_year, total_pages, isbn, cover_url, is_primary)
select id, 'Edición principal', publisher, published_year, total_pages, isbn, cover_url, true
from public.books;

insert into public.movie_versions (movie_id, label, release_year, duration_minutes, is_primary)
select id, 'Versión principal', release_year, duration_minutes, true
from public.movies;

alter table public.book_editions enable row level security;
alter table public.movie_versions enable row level security;

-- Catálogo: lectura pública; escritura solo colaborador+ (igual que sagas, §7.35).
create policy "book_editions readable by all"
  on public.book_editions for select using (true);
create policy "book_editions writable by collaborators"
  on public.book_editions for insert to authenticated
  with check (public.current_user_role() in ('collaborator', 'admin'));
create policy "book_editions updatable by collaborators"
  on public.book_editions for update to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));

create policy "movie_versions readable by all"
  on public.movie_versions for select using (true);
create policy "movie_versions writable by collaborators"
  on public.movie_versions for insert to authenticated
  with check (public.current_user_role() in ('collaborator', 'admin'));
create policy "movie_versions updatable by collaborators"
  on public.movie_versions for update to authenticated
  using (public.current_user_role() in ('collaborator', 'admin'));

grant select on public.book_editions, public.movie_versions to anon, authenticated;
grant insert, update on public.book_editions, public.movie_versions to authenticated;
```

Nota: verifica que la función `public.current_user_role()` existe (la usan las políticas de sagas). Si no, búscala con
`select proname from pg_proc where proname = 'current_user_role';` y usa el mismo mecanismo que use `item_sagas`.

- [ ] **Step 3: Aplicar la migración**

Con el MCP de Supabase: `apply_migration` con nombre `20260714_editions`.

- [ ] **Step 4: Verificar el backfill**

```sql
select (select count(*) from public.books) as books,
       (select count(*) from public.book_editions where is_primary) as primary_editions,
       (select count(*) from public.movies) as movies,
       (select count(*) from public.movie_versions where is_primary) as primary_versions;
```
Expected: `books = primary_editions` y `movies = primary_versions`.

- [ ] **Step 5: Regenerar tipos**

Con el MCP: `generate_typescript_types`, y vuelca el resultado en `src/lib/supabase/database.types.ts`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260714_editions.sql src/lib/supabase/database.types.ts
git commit -m "feat(editions): tablas de ediciones de libro y versiones de pelicula"
```

---

### Task 2: Dominio de ediciones

**Files:**
- Create: `src/lib/editions/types.ts`, `src/lib/editions/edition-label.ts`, `src/lib/editions/edition-label.test.ts`, `src/lib/editions/get-editions.ts`
- Test: `src/lib/editions/edition-label.test.ts`

**Interfaces:**
- Consumes: tablas de la Tarea 1.
- Produces:
  - `type Edition = { id: string; label: string; publisher: string | null; year: number | null; language: string | null; totalUnits: number | null; isbn: string | null; coverUrl: string | null; isPrimary: boolean }` — `totalUnits` son páginas en libro y minutos en película, para que el resto del código no tenga que ramificar.
  - `formatEdition(edition: Edition, itemType: ItemType): string`
  - `getEditions(supabase, itemType: ItemType, itemId: string): Promise<Edition[]>` — primaria primero, luego por año descendente.
  - `primaryEdition(editions: Edition[]): Edition | null`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/editions/edition-label.test.ts
import { describe, expect, it } from "vitest";
import { formatEdition, primaryEdition } from "./edition-label";
import type { Edition } from "./types";

const base: Edition = {
  id: "1", label: "Bolsillo", publisher: "DeBolsillo", year: 2011,
  language: "ES", totalUnits: 880, isbn: null, coverUrl: null, isPrimary: false,
};

describe("formatEdition", () => {
  it("junta editorial y paginas en un libro", () => {
    expect(formatEdition(base, "book")).toBe("Bolsillo · DeBolsillo · 880 p");
  });

  it("usa minutos en una pelicula", () => {
    const extended: Edition = { ...base, label: "Extendida", publisher: null, totalUnits: 166 };
    expect(formatEdition(extended, "movie")).toBe("Extendida · 2h 46m");
  });

  it("se queda en la etiqueta cuando no hay mas datos", () => {
    const bare: Edition = { ...base, publisher: null, totalUnits: null };
    expect(formatEdition(bare, "book")).toBe("Bolsillo");
  });
});

describe("primaryEdition", () => {
  it("devuelve la primaria", () => {
    const primary: Edition = { ...base, id: "2", isPrimary: true };
    expect(primaryEdition([base, primary])?.id).toBe("2");
  });

  it("devuelve null sin ediciones", () => {
    expect(primaryEdition([])).toBeNull();
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/editions/edition-label.test.ts`
Expected: FAIL — no existe `./edition-label`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/editions/types.ts
export type Edition = {
  id: string;
  label: string;
  publisher: string | null;
  year: number | null;
  language: string | null;
  /** Páginas en libro, minutos en película. */
  totalUnits: number | null;
  isbn: string | null;
  coverUrl: string | null;
  isPrimary: boolean;
};
```

```ts
// src/lib/editions/edition-label.ts
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

function runtime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Una línea legible para una edición: "Bolsillo · DeBolsillo · 880 p".
export function formatEdition(edition: Edition, itemType: ItemType): string {
  const parts = [edition.label];
  if (edition.publisher) parts.push(edition.publisher);
  if (edition.totalUnits !== null) {
    parts.push(itemType === "movie" ? runtime(edition.totalUnits) : `${edition.totalUnits} p`);
  }
  return parts.join(" · ");
}

export function primaryEdition(editions: Edition[]): Edition | null {
  return editions.find((e) => e.isPrimary) ?? null;
}
```

```ts
// src/lib/editions/get-editions.ts
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Las series no tienen ediciones: su unidad de progreso son los episodios.
export async function getEditions(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string
): Promise<Edition[]> {
  if (itemType === "series") return [];

  if (itemType === "book") {
    const { data } = await supabase
      .from("book_editions")
      .select("id, label, publisher, published_year, language, total_pages, isbn, cover_url, is_primary")
      .eq("book_id", itemId)
      .order("is_primary", { ascending: false })
      .order("published_year", { ascending: false });

    return (data ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      publisher: r.publisher,
      year: r.published_year,
      language: r.language,
      totalUnits: r.total_pages,
      isbn: r.isbn,
      coverUrl: r.cover_url,
      isPrimary: r.is_primary,
    }));
  }

  const { data } = await supabase
    .from("movie_versions")
    .select("id, label, release_year, duration_minutes, is_primary")
    .eq("movie_id", itemId)
    .order("is_primary", { ascending: false })
    .order("release_year", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    publisher: null,
    year: r.release_year,
    language: null,
    totalUnits: r.duration_minutes,
    isbn: null,
    coverUrl: null,
    isPrimary: r.is_primary,
  }));
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/editions/edition-label.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editions
git commit -m "feat(editions): dominio de ediciones (tipos, formato, lectura)"
```

---

### Task 3: Alta y edición de ediciones (colaborador+)

**Files:**
- Create: `src/lib/editions/actions.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `Edition` (T2), `hasMinRole`/`getCurrentUserRole` de `src/lib/auth/roles.ts`.
- Produces:
  - `type CreateEditionState = { error?: "forbidden" | "invalidLabel" | "generic" }`
  - `createEdition(itemType: ItemType, itemId: string, prev: CreateEditionState, formData: FormData): Promise<CreateEditionState>` — campos del form: `label`, `publisher`, `year`, `language`, `totalUnits`, `isbn`.

- [ ] **Step 1: Implementar la acción**

```ts
// src/lib/editions/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { itemHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";

export type CreateEditionState = {
  error?: "forbidden" | "invalidLabel" | "generic";
};

function intOrNull(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Crear ediciones es curación del catálogo compartido → colaborador+, igual
// que asignar sagas (§7.35). RLS lo vuelve a comprobar; esto es para dar un
// mensaje decente en vez de un error genérico.
export async function createEdition(
  itemType: ItemType,
  itemId: string,
  _prev: CreateEditionState,
  formData: FormData
): Promise<CreateEditionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (itemType === "series") return { error: "forbidden" };
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { error: "forbidden" };
  }

  const label = String(formData.get("label") ?? "").trim();
  if (!label || label.length > 60) return { error: "invalidLabel" };

  const error =
    itemType === "book"
      ? (
          await supabase.from("book_editions").insert({
            book_id: itemId,
            label,
            publisher: String(formData.get("publisher") ?? "").trim() || null,
            published_year: intOrNull(formData.get("year")),
            language: String(formData.get("language") ?? "").trim() || null,
            total_pages: intOrNull(formData.get("totalUnits")),
            isbn: String(formData.get("isbn") ?? "").trim() || null,
            created_by: user.id,
          })
        ).error
      : (
          await supabase.from("movie_versions").insert({
            movie_id: itemId,
            label,
            release_year: intOrNull(formData.get("year")),
            duration_minutes: intOrNull(formData.get("totalUnits")),
            created_by: user.id,
          })
        ).error;

  if (error) return { error: "generic" };

  revalidatePath(itemHref(itemType, itemId));
  return {};
}
```

- [ ] **Step 2: Añadir la copy**

En `messages/es.json`, dentro del objeto raíz, añade la sección `editions` (respeta el orden alfabético si el fichero lo sigue):

```json
"editions": {
  "titleBook": "Ediciones",
  "titleMovie": "Versiones",
  "count": "{count} en esta ficha",
  "add": "Añadir edición",
  "addMovie": "Añadir versión",
  "yours": "La tuya",
  "label": "Nombre",
  "labelHint": "p. ej. Tapa dura, Bolsillo, Extendida",
  "publisher": "Editorial",
  "year": "Año",
  "language": "Idioma",
  "pages": "Páginas",
  "duration": "Duración (min)",
  "isbn": "ISBN",
  "submit": "Guardar edición",
  "submitting": "Guardando…",
  "errors": {
    "forbidden": "Necesitas ser colaborador para añadir ediciones.",
    "invalidLabel": "Pon un nombre a la edición.",
    "generic": "No se pudo guardar la edición."
  }
}
```

- [ ] **Step 3: Comprobar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/editions/actions.ts messages/es.json
git commit -m "feat(editions): alta de ediciones para colaboradores"
```

---

### Task 4: Tira de ediciones en la pestaña Info

**Files:**
- Create: `src/components/detail/edition-strip.tsx`
- Modify: `src/app/libro/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`

**Interfaces:**
- Consumes: `getEditions`, `formatEdition` (T2), `createEdition` (T3).
- Produces: `<EditionStrip itemType itemId editions selectedEditionId canContribute />` — tarjetas horizontales según el mockup (pantalla 1, clase `.eds-row`), la seleccionada con ✓ y borde de acento, y "+ Añadir edición" al final solo si `canContribute`.

- [ ] **Step 1: Escribir el componente**

Sigue las convenciones de `src/components/detail/saga-strip.tsx` (mismo patrón de tira horizontal). Estructura, con la copy vía `useTranslations("editions")`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "@/lib/editions/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { createEdition, type CreateEditionState } from "@/lib/editions/actions";

const initialState: CreateEditionState = {};

export function EditionStrip({
  itemType,
  itemId,
  editions,
  selectedEditionId,
  canContribute,
}: {
  itemType: ItemType;
  itemId: string;
  editions: Edition[];
  /** La edición del pase abierto del que mira, si tiene. */
  selectedEditionId: string | null;
  canContribute: boolean;
}) {
  const t = useTranslations("editions");
  const accent = MEDIA_ACCENT[itemType];
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(
    createEdition.bind(null, itemType, itemId),
    initialState
  );
  // ...tarjetas horizontales con overflow-x-auto; la seleccionada lleva ✓ y
  // `accent.border`. El botón "+" abre el formulario inline (label, editorial,
  // año, idioma, páginas/duración, ISBN) que hace submit a `formAction`.
}
```

Detalles obligatorios:
- Cabecera: título (`titleBook`/`titleMovie` según `itemType`) y contador (`count`).
- Cada tarjeta: etiqueta en mono mayúsculas, nombre, y `formatEdition` debajo en mono pequeño.
- La tarjeta de `selectedEditionId` lleva ✓ y el badge `yours`.
- El formulario de alta solo se pinta si `canContribute`; los campos de película son solo `label`, `year` y `totalUnits` (duración).
- Errores: `t(\`errors.${state.error}\`)`.

- [ ] **Step 2: Enchufarlo en la ficha de libro**

En `src/app/libro/[id]/page.tsx`, junto a las demás cargas de datos:

```tsx
const editions = await getEditions(supabase, "book", book.id);
```

y dentro del slot `info`, después de `<SagaStrip …>` y antes de `<InfoPanel …>`:

```tsx
<EditionStrip
  itemType="book"
  itemId={book.id}
  editions={editions}
  selectedEditionId={null}
  canContribute={canContribute}
/>
```

(`selectedEditionId` se conectará al pase abierto en la Tarea 12; de momento `null`.)

- [ ] **Step 3: Lo mismo en película**

Igual en `src/app/pelicula/[id]/page.tsx` con `itemType="movie"`. Ojo: esa página quizá no calcula `canContribute` — cópialo de la de libro (`hasMinRole(await getCurrentUserRole(supabase), "collaborator")`).

- [ ] **Step 4: Comprobar**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/edition-strip.tsx src/app/libro/\[id\]/page.tsx src/app/pelicula/\[id\]/page.tsx
git commit -m "feat(editions): tira de ediciones en la pestana Info"
```

---

### Task 4b: Crear la edición al añadir desde la búsqueda

**Files:**
- Modify: `src/lib/library/add-existing-item.ts`, `src/lib/catalog/search.ts` (solo si hace falta propagar el ISBN), `supabase/migrations/20260714_editions_from_search.sql`

**Interfaces:**
- Consumes: `book_editions` (T1).
- Produces: al añadir un libro cuyo ISBN no existe como edición de esa obra, se inserta la edición. Esta alta **no** exige colaborador: el dato viene de Google Books, no es curación a mano.

- [ ] **Step 1: Política RLS para el alta automática**

La política de la Tarea 1 solo deja insertar a colaborador+, así que esta alta fallaría. Añade una política que permita a cualquier autenticado insertar una edición **con ISBN** (las de creación a mano no lo llevan obligatoriamente, y así no se abre la puerta a ediciones inventadas):

```sql
create policy "book_editions from catalog sources"
  on public.book_editions for insert to authenticated
  with check (isbn is not null and char_length(isbn) between 10 and 20);
```

- [ ] **Step 2: Insertar la edición al añadir el libro**

En `src/lib/library/add-existing-item.ts`, tras asegurar la fila de `books`, si el libro trae ISBN y no existe ya una edición con ese ISBN para esa obra, insértala (`label: 'Edición'`, con `publisher`, `published_year`, `total_pages`, `isbn` de la fuente). Si ya existe, no hagas nada. **Idempotente**: dos usuarios añadiendo el mismo ISBN a la vez no deben crear dos filas — añade un índice único:

```sql
create unique index book_editions_isbn_unique
  on public.book_editions (book_id, isbn) where isbn is not null;
```

y traga el error `23505` (duplicado) como éxito.

- [ ] **Step 3: Comprobar**

Run: `npx tsc --noEmit`
Añade un libro por ISBN desde `/buscar` con la cuenta `devtest` y comprueba por SQL que aparece su edición:
```sql
select label, isbn, total_pages from book_editions where book_id = '<id>';
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/library/add-existing-item.ts supabase/migrations/20260714_editions_from_search.sql
git commit -m "feat(editions): crear la edicion del ISBN al anadir desde la busqueda"
```

---

## Fase 2 — Escala de estrellas y pases

### Task 5: Escala 1–10 ↔ estrellas

**Files:**
- Create: `src/lib/rating/stars.ts`, `src/lib/rating/stars.test.ts`, `src/components/ui/star-rating.tsx`

**Interfaces:**
- Produces:
  - `toStars(rating: number | null): number | null` — 1–10 → 0,5–5.
  - `fromStars(stars: number): number` — 0,5–5 → 1–10 (entero).
  - `formatStars(rating: number | null): string | null` — "4,5" con coma decimal.
  - `<StarRating value={number|null} onChange?={(rating10: number) => void} size?="sm"|"md"|"lg" />` — medias estrellas; sin `onChange` es solo lectura.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/rating/stars.test.ts
import { describe, expect, it } from "vitest";
import { fromStars, toStars, formatStars } from "./stars";

describe("toStars", () => {
  it("convierte 1-10 a medias estrellas", () => {
    expect(toStars(10)).toBe(5);
    expect(toStars(9)).toBe(4.5);
    expect(toStars(1)).toBe(0.5);
  });

  it("mantiene null", () => {
    expect(toStars(null)).toBeNull();
  });
});

describe("fromStars", () => {
  it("es la inversa exacta", () => {
    for (let r = 1; r <= 10; r++) expect(fromStars(toStars(r)!)).toBe(r);
  });

  it("recorta fuera de rango", () => {
    expect(fromStars(0)).toBe(1);
    expect(fromStars(7)).toBe(10);
  });
});

describe("formatStars", () => {
  it("usa coma decimal", () => {
    expect(formatStars(9)).toBe("4,5");
    expect(formatStars(8)).toBe("4");
    expect(formatStars(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/rating/stars.test.ts`
Expected: FAIL — no existe `./stars`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/rating/stars.ts
// La nota se guarda 1–10 (smallint) y se enseña 0,5–5 estrellas. Este es el
// único módulo que conoce la equivalencia: nunca guardes estrellas.
export function toStars(rating: number | null): number | null {
  return rating === null ? null : rating / 2;
}

export function fromStars(stars: number): number {
  const rating = Math.round(stars * 2);
  return Math.min(10, Math.max(1, rating));
}

export function formatStars(rating: number | null): string | null {
  const stars = toStars(rating);
  if (stars === null) return null;
  return stars.toLocaleString("es-ES", { maximumFractionDigits: 1 });
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/rating/stars.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir `StarRating`**

`src/components/ui/star-rating.tsx`, cliente. Cinco estrellas; cada una son dos mitades pulsables (izquierda = media, derecha = entera) cuando hay `onChange`. Las llenas usan `text-gold` y las vacías `text-surface-muted` (mismas variables que `.stars5` del mockup). Sin `onChange` no es interactivo y no lleva `button`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rating src/components/ui/star-rating.tsx
git commit -m "feat(rating): escala de estrellas sobre la nota 1-10"
```

---

### Task 6: Migración de pases

**Files:**
- Create: `supabase/migrations/20260714_passes.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerar)

**Interfaces:**
- Produces: `diary_entries` con `finished_on` nullable, `is_public`, `edition_id`; `progress_sessions.pass_id`; un pase por cada `library_entry` con nota, notas o estado avanzado.

- [ ] **Step 1: Consultas de control ANTES (guarda los números)**

```sql
select count(*) filter (where rating is not null) as entries_con_nota,
       count(*) filter (where notes is not null and notes <> '') as entries_con_notas,
       (select count(*) from diary_entries) as diary,
       (select count(*) from progress_sessions) as sesiones
from library_entries;

-- Media de comunidad por ítem, fuente actual. Guarda el resultado.
select item_type, item_id, round(avg(rating)::numeric, 2) as media, count(rating) as votos
from library_entries where rating is not null
group by item_type, item_id order by item_type, item_id;
```

- [ ] **Step 2: Escribir la migración**

```sql
-- El "pase" (una lectura, un visionado) pasa a ser el dueño de la nota y la
-- reseña. La tabla sigue llamándose diary_entries: nada la referencia por FK,
-- pero renombrarla obligaría a tocar RLS, feed, notificaciones e interacciones
-- de reseña sin ganar nada funcional.
alter table public.diary_entries
  alter column finished_on drop not null,
  add column is_public boolean not null default true,
  add column edition_id uuid;

-- Un pase abierto (finished_on null) = "lo estoy leyendo ahora". Como mucho
-- uno por entrada, garantizado en BD porque los cambios de estado pueden
-- llegar en paralelo.
create unique index diary_entries_one_open_pass
  on public.diary_entries (library_entry_id) where finished_on is null;

alter table public.progress_sessions
  add column pass_id uuid references public.diary_entries(id) on delete cascade;

-- Backfill 1: pase cerrado para entradas completadas que aún no tienen ninguno
-- (las que ya tienen diary_entries se quedan como están: ya son pases).
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating, review, is_public)
select le.id, le.user_id, le.started_at, coalesce(le.updated_at::date, current_date),
       le.rating, nullif(le.notes, ''), false
from public.library_entries le
where le.status = 'completed'
  and not exists (select 1 from public.diary_entries d where d.library_entry_id = le.id);

-- Backfill 2: pase ABIERTO para entradas en curso.
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating, review, is_public)
select le.id, le.user_id, le.started_at, null, le.rating, nullif(le.notes, ''), false
from public.library_entries le
where le.status = 'in_progress'
  and not exists (
    select 1 from public.diary_entries d
    where d.library_entry_id = le.id and d.finished_on is null
  );

-- Backfill 3: entradas 'dropped' o 'planned' con nota o notas — no encajan en
-- ninguno de los dos anteriores, pero su nota no puede evaporarse. Pase cerrado
-- que NO cuenta para la comunidad se distingue por el estado de la entrada.
insert into public.diary_entries (library_entry_id, user_id, started_on, finished_on, rating, review, is_public)
select le.id, le.user_id, le.started_at, coalesce(le.updated_at::date, current_date),
       le.rating, nullif(le.notes, ''), false
from public.library_entries le
where le.status in ('planned', 'dropped')
  and (le.rating is not null or nullif(le.notes, '') is not null)
  and not exists (select 1 from public.diary_entries d where d.library_entry_id = le.id);

-- Las notas migradas son reseñas privadas; las reseñas que ya existían en el
-- diario eran públicas por definición (se veían en Comunidad).
update public.diary_entries set is_public = true
where review is not null and is_public = false
  and created_at < now() - interval '1 minute';

-- Backfill 4: las sesiones existentes cuelgan del pase abierto de su entrada;
-- si no hay abierto (entrada ya completada), del pase cerrado más reciente.
update public.progress_sessions ps
set pass_id = coalesce(
  (select d.id from public.diary_entries d
   where d.library_entry_id = ps.library_entry_id and d.finished_on is null limit 1),
  (select d.id from public.diary_entries d
   where d.library_entry_id = ps.library_entry_id
   order by d.finished_on desc limit 1)
)
where ps.pass_id is null;
```

Ojo con el `update` de `is_public`: distingue las reseñas preexistentes de las recién insertadas por `created_at`. Si el backfill tarda más de un minuto, ajusta el intervalo — o, más seguro, ejecuta ese `update` **antes** de los tres `insert` (no hay filas nuevas todavía). **Hazlo así: mueve el `update` al principio de la migración.**

- [ ] **Step 3: Aplicar y verificar**

```sql
-- Ninguna nota se ha perdido: cada entrada con rating tiene su pase con rating.
select count(*) from library_entries le
where le.rating is not null
  and not exists (select 1 from diary_entries d where d.library_entry_id = le.id and d.rating is not null);
```
Expected: `0`.

```sql
-- La media de comunidad no se mueve: misma media desde la nueva fuente
-- (último pase cerrado no abandonado de cada usuario).
with ultimo as (
  select distinct on (le.item_type, le.item_id, d.user_id)
         le.item_type, le.item_id, d.rating
  from diary_entries d
  join library_entries le on le.id = d.library_entry_id
  where d.finished_on is not null and d.rating is not null and le.status <> 'dropped'
  order by le.item_type, le.item_id, d.user_id, d.finished_on desc
)
select item_type, item_id, round(avg(rating)::numeric, 2) as media, count(*) as votos
from ultimo group by item_type, item_id order by item_type, item_id;
```
Expected: mismos ítems y medias que la consulta del Paso 1 (salvo ítems cuya única nota venía de una entrada `dropped`, que ahora desaparecen a propósito — anótalos).

```sql
select count(*) from progress_sessions where pass_id is null;
```
Expected: `0`.

- [ ] **Step 4: Regenerar tipos y commitear**

```bash
git add supabase/migrations/20260714_passes.sql src/lib/supabase/database.types.ts
git commit -m "feat(passes): pases abiertos, visibilidad y edicion; sesiones colgando del pase"
```

---

### Task 7: Transiciones de pase (lógica pura)

**Files:**
- Create: `src/lib/passes/types.ts`, `src/lib/passes/transitions.ts`, `src/lib/passes/transitions.test.ts`

**Interfaces:**
- Produces:
  - `type Pass = { id: string; startedOn: string | null; finishedOn: string | null; rating: number | null; review: string | null; isPublic: boolean; editionId: string | null }`
  - `type PassEffect = { kind: "none" } | { kind: "open" } | { kind: "close" } | { kind: "openAndClose" }`
  - `passEffect(from: MediaStatus | null, to: MediaStatus, hasOpenPass: boolean): PassEffect`

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/passes/transitions.test.ts
import { describe, expect, it } from "vitest";
import { passEffect } from "./transitions";

describe("passEffect", () => {
  it("abre pase al empezar a leer", () => {
    expect(passEffect("planned", "in_progress", false)).toEqual({ kind: "open" });
  });

  it("no abre un segundo pase si ya hay uno abierto", () => {
    expect(passEffect("planned", "in_progress", true)).toEqual({ kind: "none" });
  });

  it("cierra el pase abierto al terminar", () => {
    expect(passEffect("in_progress", "completed", true)).toEqual({ kind: "close" });
  });

  it("abre y cierra de golpe cuando se marca visto sin haber empezado", () => {
    // El ciclo natural de una película: pendiente -> visto.
    expect(passEffect("planned", "completed", false)).toEqual({ kind: "openAndClose" });
    expect(passEffect(null, "completed", false)).toEqual({ kind: "openAndClose" });
  });

  it("abre un pase nuevo al releer algo ya terminado", () => {
    expect(passEffect("completed", "in_progress", false)).toEqual({ kind: "open" });
  });

  it("cierra el pase abierto al abandonar", () => {
    expect(passEffect("in_progress", "dropped", true)).toEqual({ kind: "close" });
  });

  it("no hace nada al abandonar algo que no habias empezado", () => {
    expect(passEffect("planned", "dropped", false)).toEqual({ kind: "none" });
  });

  it("no hace nada al volver a pendiente", () => {
    expect(passEffect("in_progress", "planned", true)).toEqual({ kind: "none" });
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/passes/transitions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/passes/transitions.ts
import type { MediaStatus } from "@/lib/library/types";

export type PassEffect =
  | { kind: "none" }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "openAndClose" };

// El usuario nunca crea un pase a mano: lo abre y lo cierra el cambio de
// estado. Una película va de pendiente a visto sin pasar por "viendo", así que
// marcarla vista tiene que abrir y cerrar el pase en el mismo gesto.
// `from` es null cuando el ítem aún no estaba en la biblioteca.
export function passEffect(
  from: MediaStatus | null,
  to: MediaStatus,
  hasOpenPass: boolean
): PassEffect {
  if (to === "in_progress") {
    return hasOpenPass ? { kind: "none" } : { kind: "open" };
  }
  if (to === "completed") {
    return hasOpenPass ? { kind: "close" } : { kind: "openAndClose" };
  }
  if (to === "dropped") {
    return hasOpenPass ? { kind: "close" } : { kind: "none" };
  }
  return { kind: "none" };
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/passes/transitions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/passes
git commit -m "feat(passes): reglas de apertura y cierre de pase"
```

---

### Task 8: Server actions de pases + estado

**Files:**
- Create: `src/lib/passes/get-passes.ts`, `src/lib/passes/actions.ts`
- Modify: `src/lib/library/manage-actions.ts`, `messages/es.json`
- Delete: nada todavía.

**Interfaces:**
- Consumes: `passEffect` (T7), `Pass` (T7).
- Produces:
  - `getPasses(supabase, entryId: string): Promise<Pass[]>` — más reciente primero; el abierto siempre el primero.
  - `openPass(entryId: string, editionId: string | null): Promise<void>`
  - `type ClosePassState = { error?: "invalidDate" | "invalidRating" | "generic" }`
  - `closePass(passId, itemType, itemId, prev, formData): Promise<ClosePassState>` — campos: `finishedOn`, `rating` (1–10), `review`, `isPublic` (checkbox).
  - `updatePass(passId, itemType, itemId, prev, formData): Promise<ClosePassState>` — mismos campos, para editar un pase del diario.
  - `deletePass(passId, itemType, itemId): Promise<void>`
  - `setPassEdition(passId, itemType, itemId, editionId: string | null): Promise<void>`
  - `updateStatus` (existente) pasa a aplicar `passEffect` además de escribir el estado.

- [ ] **Step 1: Escribir `get-passes.ts`**

```ts
import type { createClient } from "@/lib/supabase/server";
import type { Pass } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Pases de una entrada: el abierto primero (finished_on null), luego los
// cerrados de más reciente a más antiguo. Ese orden es el que espera el diario
// para calcular el delta contra el pase anterior.
export async function getPasses(
  supabase: SupabaseServerClient,
  entryId: string
): Promise<Pass[]> {
  const { data } = await supabase
    .from("diary_entries")
    .select("id, started_on, finished_on, rating, review, is_public, edition_id")
    .eq("library_entry_id", entryId)
    .order("finished_on", { ascending: false, nullsFirst: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    startedOn: r.started_on,
    finishedOn: r.finished_on,
    rating: r.rating,
    review: r.review,
    isPublic: r.is_public,
    editionId: r.edition_id,
  }));
}
```

- [ ] **Step 2: Escribir `actions.ts`**

Sigue el patrón de `src/lib/library/manage-actions.ts` (comprobar usuario → `redirect("/login")`, escribir con `.eq("user_id", user.id)`, `revalidateItemViews`). Puntos que no puedes saltarte:

- `closePass` valida `finishedOn` como fecha ISO (`/^\d{4}-\d{2}-\d{2}$/`) y no futura; `rating` entero 1–10 o nulo; `isPublic` es `formData.get("isPublic") === "on"`.
- `openPass` inserta con `finished_on: null` y `started_on: <hoy>`; si el índice único parcial se queja (código Postgres `23505`), traga el error: ya había un pase abierto, que es exactamente lo que queríamos.
- `deletePass` borra en cascada sus sesiones (ya lo hace la FK).

- [ ] **Step 3: Enchufar los pases a `updateStatus`**

En `src/lib/library/manage-actions.ts`, `updateStatus` pasa a leer el estado y el pase abierto actuales antes de escribir, y a aplicar el efecto:

```ts
const { data: entry } = await supabase
  .from("library_entries")
  .select("id, status")
  .eq("id", entryId)
  .eq("user_id", user.id)
  .maybeSingle();
if (!entry) redirect("/login");

const { data: openPass } = await supabase
  .from("diary_entries")
  .select("id")
  .eq("library_entry_id", entryId)
  .is("finished_on", null)
  .maybeSingle();

const effect = passEffect(entry.status as MediaStatus, status, Boolean(openPass));

// ...escribir el estado como hoy...

if (effect.kind === "open" || effect.kind === "openAndClose") {
  await supabase.from("diary_entries").insert({
    library_entry_id: entryId,
    user_id: user.id,
    started_on: today,
    finished_on: effect.kind === "openAndClose" ? today : null,
    is_public: true,
  });
} else if (effect.kind === "close" && openPass) {
  await supabase
    .from("diary_entries")
    .update({ finished_on: today })
    .eq("id", openPass.id)
    .eq("user_id", user.id);
}
```

`today` es `new Date().toISOString().slice(0, 10)`.

- [ ] **Step 4: Copy nueva**

En `messages/es.json`, sección `passes`:

```json
"passes": {
  "diaryTitle": "Diario",
  "empty": "Todavía no has registrado ningún pase.",
  "open": "En curso",
  "pass": "{n}º pase",
  "closeTitle": "¿Qué te ha parecido?",
  "finishedOn": "Fecha",
  "rating": "Tu nota",
  "review": "Reseña",
  "reviewPlaceholder": "Qué te ha parecido…",
  "isPublic": "Visible para la comunidad",
  "skip": "Ahora no",
  "submit": "Guardar",
  "submitting": "Guardando…",
  "delta": "▲ {delta} vs. anterior",
  "deltaDown": "▼ {delta} vs. anterior",
  "delete": "Borrar pase",
  "errors": {
    "invalidDate": "La fecha no es válida.",
    "invalidRating": "La nota va de media estrella a cinco.",
    "generic": "No se pudo guardar."
  }
}
```

- [ ] **Step 5: Comprobar y commitear**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores, tests en verde.

```bash
git add src/lib/passes src/lib/library/manage-actions.ts messages/es.json
git commit -m "feat(passes): abrir y cerrar pases al cambiar de estado"
```

---

## Fase 3 — Comunidad

### Task 9: La comunidad agrega desde pases

**Files:**
- Modify: `src/lib/community/get-community.ts`, `src/components/detail/community-panel.tsx`

**Interfaces:**
- Consumes: `Pass` (T7), `Edition`/`formatEdition` (T2).
- Produces: `CommunityReview` gana `editionLabel: string | null`. `Community.avgRating` y `distribution` salen del último pase cerrado no abandonado de cada usuario.

- [ ] **Step 1: Cambiar la fuente de las notas**

En `get-community.ts`, sustituye la lectura de `library_entries.rating` por los pases. La consulta:

```ts
const { data: rows } = await supabase
  .from("diary_entries")
  .select("rating, finished_on, edition_id, user_id, library_entries!inner(item_type, item_id, status)")
  .eq("library_entries.item_type", itemType)
  .eq("library_entries.item_id", itemId)
  .not("finished_on", "is", null)
  .not("rating", "is", null)
  .neq("library_entries.status", "dropped");
```

Y en TypeScript, quédate con el pase de `finished_on` mayor por `user_id` (un voto por usuario, el más reciente) antes de calcular media y distribución. RLS ya limita a perfiles públicos + los propios, así que no hace falta filtro extra.

- [ ] **Step 2: Reseñas con chip de edición**

Las reseñas pasan a ser los pases con `is_public = true` y `review` no vacía. Trae `edition_id` y resuelve su etiqueta con una sola consulta a `book_editions`/`movie_versions` por los ids que aparezcan; rellena `editionLabel` con `formatEdition` (o `null` si el pase no tiene edición).

- [ ] **Step 3: Pintar el chip**

En `community-panel.tsx`, en la cabecera de cada reseña, junto a la fecha, un chip discreto en mono cuando `review.editionLabel` no sea nulo (mismo estilo que `.review .ep` del mockup: fondo de acento al 10%, texto de acento, texto pequeño en mayúsculas).

- [ ] **Step 4: Verificar que la media no se ha movido**

Con el MCP de Supabase, repite la consulta de control del Paso 3 de la Tarea 6 y compárala con lo que pinta la ficha de un libro con votos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/community/get-community.ts src/components/detail/community-panel.tsx
git commit -m "feat(community): media y resenas desde los pases, con chip de edicion"
```

---

## Fase 4 — Pestaña Registro

### Task 10: Segmented control de estado

**Files:**
- Create: `src/components/detail/status-segments.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Produces: `<StatusSegments status itemType onChange={(next: MediaStatus) => void} disabled />` — cuatro pastillas con punto de color, según `.seg` del mockup (pantalla 3).

- [ ] **Step 1: Escribir el componente**

Cuatro opciones (`planned`, `in_progress`, `completed`, `dropped`), cada una con un punto de color que sale de las variables de estado ya existentes (`--st-planned` etc. son `bg-status-*` en Tailwind; comprueba los nombres reales en `globals.css` y en `src/components/ui/status-badge.tsx`). La activa lleva fondo `bg-surface` y sombra suave. Las etiquetas vienen de `library.status.*`, que ya existen, salvo que el verbo cambie por tipo de medio (Leyendo/Viendo): usa las claves que ya use `status-badge.tsx`.

- [ ] **Step 2: Comprobar**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/detail/status-segments.tsx messages/es.json
git commit -m "feat(log): segmented control de estado"
```

---

### Task 11: Hoja de cierre de pase

**Files:**
- Create: `src/components/detail/close-pass-sheet.tsx`

**Interfaces:**
- Consumes: `closePass` (T8), `StarRating` (T5).
- Produces: `<ClosePassSheet passId itemType itemId open onClose />` — fecha (por defecto hoy), estrellas, reseña, interruptor "visible para la comunidad", botones Guardar y "Ahora no".

- [ ] **Step 1: Escribir el componente**

Diálogo modal (usa `<dialog>` nativo o el patrón de modal que ya exista en el repo — busca con `grep -rl "role=\"dialog\"\|<dialog" src/components`). Formulario con `useActionState(closePass.bind(null, passId, itemType, itemId), {})`. "Ahora no" cierra sin guardar: el pase se queda cerrado sin nota, y se puede completar luego desde el diario.

- [ ] **Step 2: Comprobar y commitear**

```bash
git add src/components/detail/close-pass-sheet.tsx
git commit -m "feat(log): hoja de cierre de pase"
```

---

### Task 12: Pestaña Registro completa

**Files:**
- Create: `src/components/detail/log-panel.tsx`, `src/components/detail/pass-diary.tsx`
- Delete: `src/components/item-manage-panel.tsx`, `src/components/progress-panel.tsx`, `src/components/diary-panel.tsx`
- Modify: `src/app/{libro,pelicula,serie}/[id]/page.tsx`, `src/components/session-list.tsx`

**Interfaces:**
- Consumes: `StatusSegments` (T10), `ClosePassSheet` (T11), `StarRating` (T5), `getPasses` (T8), `getEditions` (T2), `SessionList` (existente).
- Produces: `<LogPanel itemType itemId entry passes sessions editions queues />`, con `entry: ManagedEntry | null` (mismo tipo que hoy, exportado ahora desde `log-panel.tsx`).

- [ ] **Step 1: Escribir `pass-diary.tsx`**

Lista de pases (los que da `getPasses`, ya ordenados). Cada tarjeta: estrellas (`StarRating` de solo lectura), fecha (o etiqueta "En curso" si `finishedOn` es nulo), chip de edición, reseña, y el delta contra el **siguiente** elemento del array (que es el pase anterior en el tiempo) reutilizando la lógica que hoy vive en `diary-panel.tsx:89`. Acciones por pase: editar (`updatePass`) y borrar (`deletePass`).

- [ ] **Step 2: Escribir `log-panel.tsx`**

Orden vertical exacto del mockup (pantalla 3):
1. `<StatusSegments>` — al cambiar, llama a `updateStatus`; si el nuevo estado es `completed`, abre además `<ClosePassSheet>` con el pase que se acaba de cerrar.
2. Bloque **Progreso**, solo si hay pase abierto: `StarRating` editable (guarda con `updatePass`), "voy por la página X de Y" contra la edición del pase (o la primaria), selector de edición (`setPassEdition`), y enlace a `/sesion/[entryId]`.
3. `<SessionList>` con la edición rotulada encima (solo libro y serie).
4. `<PassDiary>`.
5. Botón "Quitar de mi biblioteca".

Si `entry` es null, el panel es solo el botón "Añadir a mi biblioteca" (como hoy en `item-manage-panel.tsx:54`).

- [ ] **Step 3: Cambiar las tres páginas de detalle**

En cada una, sustituye `<ItemManagePanel …>` por `<LogPanel …>` y añade las cargas nuevas:

```tsx
const passes = entry ? await getPasses(supabase, entry.entryId) : [];
const editions = await getEditions(supabase, "book", book.id);
```

Y ahora sí, pasa `selectedEditionId={passes.find((p) => !p.finishedOn)?.editionId ?? null}` al `<EditionStrip>` de la Tarea 4.

- [ ] **Step 4: Borrar los componentes viejos**

```bash
git rm src/components/item-manage-panel.tsx src/components/progress-panel.tsx src/components/diary-panel.tsx
```

Comprueba que nadie más los importaba: `grep -rn "item-manage-panel\|progress-panel\|diary-panel" src/`. Expected: sin resultados.

- [ ] **Step 5: Comprobar**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: build limpio.

- [ ] **Step 6: Commit**

```bash
git add -A src/components src/app
git commit -m "feat(log): pestana Registro con estado, progreso, sesiones y diario"
```

---

## Fase 5 — Sesiones

### Task 13: Sesión de libro con tramo y delta

**Files:**
- Modify: `src/app/sesion/[entryId]/session-form.tsx`, `src/app/sesion/[entryId]/page.tsx`, `src/lib/sessions/actions.ts`, `messages/es.json`

**Interfaces:**
- Consumes: `getEditions`/`primaryEdition` (T2), `getPasses` (T8).
- Produces: `addSession` acepta `pass_id` y guarda la sesión colgando del pase abierto; el total contra el que se valida la página sale de la edición del pase, no de `books.total_pages`.

- [ ] **Step 1: Contexto del ítem en la página**

En `page.tsx`, añade la tarjeta de contexto del mockup (portada 40×60, título, autoría, badge de tipo) y carga el pase abierto y su edición para conocer el total real:

```tsx
const passes = await getPasses(supabase, entry.id);
const openPass = passes.find((p) => !p.finishedOn) ?? null;
const editions = await getEditions(supabase, itemType, entry.item_id);
const edition = editions.find((e) => e.id === openPass?.editionId) ?? primaryEdition(editions);
const total = edition?.totalUnits ?? book?.total_pages ?? series?.total_episodes ?? null;
```

- [ ] **Step 2: Tramo desde → hasta con delta**

En `session-form.tsx` (libro), sustituye el campo único de página por dos: `fromPage` (por defecto, la página actual de la entrada, solo lectura editable) y `page` (hasta dónde has llegado). Debajo, en vivo con `useState`, el delta:

`▲ {n} páginas · quedan {total - page}` — con la copy en `messages/es.json` bajo `session.delta` y `session.remaining`.

`fromPage` no se guarda en base de datos: la sesión ya registra la posición alcanzada, y el tramo se deduce de la sesión anterior. Es solo ayuda visual para calcular el delta.

- [ ] **Step 3: `addSession` cuelga del pase**

En `src/lib/sessions/actions.ts`, antes del `insert`, busca el pase abierto de la entrada y añade `pass_id` a la fila. Si no hay pase abierto (el usuario registra una sesión sobre algo que aún estaba en "pendiente"), abre uno con `openPass` y usa ese: registrar una sesión implica que has empezado.

- [ ] **Step 4: Comprobar**

Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/app/sesion src/lib/sessions/actions.ts messages/es.json
git commit -m "feat(session): tramo desde-hasta con delta contra tu edicion"
```

---

### Task 14: Cronómetro persistente

**Files:**
- Create: `src/lib/sessions/timer.ts`, `src/lib/sessions/timer.test.ts`, `src/app/sesion/[entryId]/session-timer.tsx`
- Modify: `src/app/sesion/[entryId]/session-form.tsx`, `messages/es.json`

**Interfaces:**
- Produces:
  - `type TimerState = { startedAt: number | null; accumulatedMs: number }` — `startedAt` nulo = en pausa.
  - `elapsedMs(state: TimerState, now: number): number`
  - `start(state, now): TimerState` / `pause(state, now): TimerState` / `reset(): TimerState`
  - `isStale(state, now): boolean` — más de 4 horas corriendo.
  - `toMinutes(ms: number): number`
  - `<SessionTimer entryId onMinutes={(m: number) => void} />` — guarda el estado en `localStorage` bajo `biblioshare:timer:<entryId>`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// src/lib/sessions/timer.test.ts
import { describe, expect, it } from "vitest";
import { elapsedMs, isStale, pause, reset, start, toMinutes, type TimerState } from "./timer";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe("cronometro", () => {
  it("no cuenta mientras esta en pausa", () => {
    const paused: TimerState = { startedAt: null, accumulatedMs: 5 * MIN };
    expect(elapsedMs(paused, T0 + 99 * MIN)).toBe(5 * MIN);
  });

  it("cuenta el tiempo transcurrido desde el arranque", () => {
    const running = start({ startedAt: null, accumulatedMs: 0 }, T0);
    expect(elapsedMs(running, T0 + 3 * MIN)).toBe(3 * MIN);
  });

  it("acumula tramos entre pausas", () => {
    let s = start(reset(), T0);
    s = pause(s, T0 + 10 * MIN);
    s = start(s, T0 + 60 * MIN);
    expect(elapsedMs(s, T0 + 65 * MIN)).toBe(15 * MIN);
  });

  it("sigue contando aunque la pagina estuviera cerrada", () => {
    // El estado guarda el instante de arranque, no un intervalo corriendo.
    const running = start(reset(), T0);
    expect(toMinutes(elapsedMs(running, T0 + 45 * MIN))).toBe(45);
  });

  it("detecta que te lo dejaste corriendo", () => {
    const running = start(reset(), T0);
    expect(isStale(running, T0 + 3 * 60 * MIN)).toBe(false);
    expect(isStale(running, T0 + 5 * 60 * MIN)).toBe(true);
  });

  it("redondea a minutos", () => {
    expect(toMinutes(89_000)).toBe(1);
    expect(toMinutes(91_000)).toBe(2);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/sessions/timer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/lib/sessions/timer.ts
// Cronómetro de sesión. Guarda el INSTANTE de arranque, no un contador
// corriendo: así sobrevive a recargar y a cerrar la app, y el tiempo sigue
// avanzando aunque la pestaña esté dormida. El estado vive en localStorage
// (por dispositivo): leer no suele repartirse entre móvil y portátil, y
// llevarlo a la base de datos costaría tabla, acciones y conflictos.
export type TimerState = { startedAt: number | null; accumulatedMs: number };

const STALE_MS = 4 * 60 * 60 * 1000;

export function reset(): TimerState {
  return { startedAt: null, accumulatedMs: 0 };
}

export function start(state: TimerState, now: number): TimerState {
  return state.startedAt !== null ? state : { ...state, startedAt: now };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.startedAt === null) return state;
  return { startedAt: null, accumulatedMs: elapsedMs(state, now) };
}

export function elapsedMs(state: TimerState, now: number): number {
  const running = state.startedAt === null ? 0 : now - state.startedAt;
  return state.accumulatedMs + Math.max(0, running);
}

// Te lo dejaste corriendo: más de 4 horas seguidas sin pausar.
export function isStale(state: TimerState, now: number): boolean {
  return state.startedAt !== null && now - state.startedAt > STALE_MS;
}

export function toMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export const timerStorageKey = (entryId: string) => `biblioshare:timer:${entryId}`;
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/sessions/timer.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Escribir `session-timer.tsx`**

Cliente. Lee el estado de `localStorage` al montar; pinta `HH:MM:SS` en mono grande (mockup, pantalla 3), con "En marcha" y un punto de acento cuando corre. Botones Pausar/Reanudar y Reiniciar. Un `setInterval` de 1 s **solo repinta**: el tiempo siempre se calcula con `elapsedMs(state, Date.now())`, nunca sumando ticks.

Si al montar `isStale(state, Date.now())`, muéstralo en pausa con el aviso `session.timerStale` y dos salidas: escribir los minutos a mano (rellena el campo de duración y descarta el cronómetro) o descartarlo (`reset()`).

Al guardar la sesión, `toMinutes(elapsedMs(...))` rellena `durationMinutes` y se limpia la clave de `localStorage`.

- [ ] **Step 6: Conmutador "A mano / Cronómetro"**

En `session-form.tsx` (solo libro), el segmented `.segt` del mockup elige entre el input de minutos y `<SessionTimer>`.

Copy nueva en `messages/es.json` → `session`:

```json
"durationManual": "A mano",
"durationTimer": "Cronómetro",
"timerRunning": "En marcha",
"timerPause": "Pausar",
"timerResume": "Reanudar",
"timerReset": "Reiniciar",
"timerHint": "Se registra como duración al guardar la sesión.",
"timerStale": "Parece que lo dejaste corriendo. Escribe los minutos a mano o descártalo.",
"timerDiscard": "Descartar cronómetro"
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/sessions/timer.ts src/lib/sessions/timer.test.ts src/app/sesion messages/es.json
git commit -m "feat(session): cronometro persistente con aviso de olvido"
```

---

### Task 15: Sesión de serie que marca episodios

**Files:**
- Modify: `src/app/sesion/[entryId]/session-form.tsx`, `src/lib/sessions/actions.ts`, `src/lib/library/progress.ts`

**Interfaces:**
- Consumes: las acciones de episodio que ya existen en `src/lib/series/episode-actions.ts` (léelas antes: reutiliza la que marca visto, no dupliques la escritura en `episode_watches`).
- Produces: el formulario de serie manda `episodes` (lista de números) y `season`; `addSession` marca esos episodios vistos y deriva la posición de la entrada del episodio más alto marcado.

- [ ] **Step 1: Formulario de serie**

Selector de temporada (`<Select>`, escala a cualquier número de temporadas — sácalas de `series_episodes`) y chips de episodios de esa temporada, pulsables. Los ya vistos aparecen marcados. Sin campo de duración (`addSession` ya ignora los minutos en series, ver el comentario en `src/lib/sessions/actions.ts`).

Delta bajo los chips: `▲ {n} episodios · vas por T{s}·E{e}`.

- [ ] **Step 2: `addSession` marca los episodios**

Cuando `itemType === "series"` y llegan `episodes`, marca cada uno como visto reutilizando la acción existente, y calcula la posición de la entrada como `{ season, episode: max(episodes) }` — pero solo si avanza (no retrocedas la posición si el usuario registra un episodio antiguo).

- [ ] **Step 3: Comprobar**

Run: `npx tsc --noEmit && npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/app/sesion src/lib/sessions src/lib/library/progress.ts
git commit -m "feat(session): la sesion de serie marca episodios vistos"
```

---

## Cierre

### Task 16: Documentación y checklist manual

**Files:**
- Create: `docs/superpowers/plans/2026-07-14-registro-pases-ediciones-manual-test.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Actualizar los requisitos**

En `docs/REQUIREMENTS.md` §7, añade los apartados nuevos (ediciones, pases, cronómetro) siguiendo la numeración existente, y **corrige** los que quedan obsoletos: §7.13 (diario), §7.14 (sesiones) y §7.1 (formato del libro, que ahora es una edición). Usa el subagente `backlog-scribe`.

- [ ] **Step 2: Escribir el checklist manual**

Un punto por caso, con qué hacer y qué debe verse (ver `docs/TESTING.md`). Casos obligatorios:
1. Libro: Pendiente → Leyendo abre pase; el diario muestra "En curso".
2. Libro: Leyendo → Leído abre la hoja de cierre; guardar con 4,5★ y reseña pública; aparece en Comunidad con chip de edición.
3. Película: Pendiente → Visto en un gesto; la hoja de cierre aparece igual.
4. Relectura: volver a Leyendo abre un 2.º pase; ponerle 5★ muestra "▲ +0,5★ vs. anterior".
5. Dos ediciones: leer la extendida y la teatral en pases distintos; el diario muestra cada chip.
6. Progreso contra tu edición: cambiar de edición cambia el "de 662" a "de 880".
7. Sesión con cronómetro: arrancar, recargar la página, comprobar que sigue contando; guardar y ver los minutos.
8. Cronómetro olvidado: manipular `localStorage` para poner `startedAt` cinco horas atrás y comprobar el aviso.
9. Serie: registrar sesión marcando E5 y E6; verlos marcados en la pestaña Episodios y el progreso en T2·E6.
10. Nota media: apuntar la media de un libro antes y después; no debe cambiar.

- [ ] **Step 3: Commit y PR**

```bash
git add docs/
git commit -m "docs: requisitos y checklist manual de registro, pases y ediciones"
git push -u origin worktree-registro-pases-ediciones
gh pr create --draft --title "feat: registro, pases y ediciones" --body "…"
```

---

## Notas de ejecución

- **Fases entregables:** tras la Fase 1 la app funciona con ediciones visibles pero sin pases; tras la Fase 2 los pases existen pero la interfaz vieja sigue; la Fase 4 es la que cambia lo que el usuario ve. No mezcles fases en un mismo commit.
- **La Tarea 6 es la peligrosa.** Migra datos de todos los usuarios. No la des por buena sin las tres consultas de verificación.
- **Fuera de alcance** (specs propias): sagas múltiples, editor de ficha del moderador, reparto y plataformas, filtro de reseñas por edición, y la limpieza final de `library_entries.rating` / `notes`.
