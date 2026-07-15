# Ediciones de libro en la primera visita — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Que al abrir por primera vez la ficha de un libro recién traído de la búsqueda aparezcan sus ediciones reales (por streaming) y NO una "Edición principal" en blanco.

**Architecture:** Dos cambios independientes. (1) BD: el trigger `create_primary_book_edition` deja de crear una primaria en blanco cuando la obra nace ligera (sin editorial/ISBN/páginas), + limpieza de las ya creadas. (2) App: el bloque de ediciones se alimenta de un `Promise<Edition[]>` que sincroniza-si-hace-falta + lee, resuelto con `use()` dentro de dos `<Suspense>` en el componente cliente `EditionsSection`, dejando la sinopsis (que va en medio como `children`) inmediata. Se quita el sync de ediciones de `after()`.

**Tech Stack:** Next.js 16.2.10 (App Router, React 19 `use()`/streaming), Supabase (Postgres, triggers SECURITY DEFINER), next-intl, Playwright.

## Global Constraints

- **Node 22 para el runner** (`fnm use 22` antes de vitest/playwright). Ver memoria `node-y-vitest`.
- **Migraciones: dev primero, prod después.** Ver memoria `supabase-environments`. La de limpieza toca datos existentes (dev Y prod).
- **AGENTS.md:** "This is NOT the Next.js you know." `use(promise)` + streaming es de React 19; si algo no cuadra, consultar `node_modules/next/dist/docs` antes de improvisar.
- **La ficha no bloquea nunca.** El sync de ediciones es lento (hasta ~5 s en clásicos); por eso va tras un `<Suspense>` (solo el bloque de ediciones espera, no la página). NO volver a `await`earlo en el cuerpo de la page.
- **Comentarios y copy en español**, siguiendo el estilo existente.

---

### Task 1: Migración — no crear (ni conservar) la edición primaria en blanco

**Files:**
- Create: `supabase/migrations/20260715_book_editions_no_blank_primary.sql`

**Interfaces:**
- Produces: el trigger `create_primary_book_edition` guardado; ninguna `book_editions` con `is_primary` y `publisher/isbn/total_pages` los tres nulos.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260715_book_editions_no_blank_primary.sql`:

```sql
-- Una obra nacida ligera desde la búsqueda por texto (findOrCreateCatalogItem
-- solo pone work_key/título/autor/portada/año) hacía que el trigger
-- create_primary_book_edition creara una "Edición principal" en blanco, sin
-- editorial/ISBN/páginas. Esa edición vacía es la que se ve en la primera
-- visita a la ficha, antes de que ensureBookEditions sincronice las reales.
--
-- Arreglo: no crear la primaria cuando NO hay ningún dato de tirada. Cuando sí
-- lo hay (escáner por ISBN, importador), se sigue creando como hasta ahora. La
-- primera edición real que sincronice pasará a primaria via
-- ensure_primary_book_edition (BEFORE INSERT), que ya existe.

create or replace function public.create_primary_book_edition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin ningún dato de tirada: no se crea primaria en blanco.
  if new.publisher is null
     and (new.isbn is null or char_length(trim(new.isbn)) = 0)
     and new.total_pages is null then
    return new;
  end if;

  insert into public.book_editions
    (book_id, label, publisher, published_year, total_pages, isbn, cover_url, is_primary)
  values
    (new.id, 'Edición principal', new.publisher,
     public.sane_int(new.published_year, 1400, 2200),
     public.sane_int(new.total_pages, 1, 20000),
     case when char_length(coalesce(new.isbn, '')) <= 20 then new.isbn end,
     new.cover_url, true)
  on conflict do nothing;
  return new;
exception when others then
  -- La obra manda: si su edición primaria no se puede crear, que nazca igual.
  raise warning 'edicion primaria omitida para el libro %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- Limpieza de las primarias en blanco ya creadas por el bug (dev y prod). Si el
-- libro tiene además ediciones reales, se promueve la mejor a primaria DESPUÉS
-- de borrar la blanca (el índice único parcial (book_id) where is_primary exige
-- que solo haya una, por eso primero se borra y luego se promueve).
do $$
declare b record;
begin
  for b in
    select id as blank_id, book_id
    from public.book_editions
    where is_primary
      and publisher is null
      and isbn is null
      and total_pages is null
  loop
    delete from public.book_editions where id = b.blank_id;

    update public.book_editions
       set is_primary = true
     where id = (
       select id
       from public.book_editions
       where book_id = b.book_id
       order by (publisher is not null or total_pages is not null) desc,
                published_year desc nulls last
       limit 1
     );
  end loop;
end $$;
```

- [ ] **Step 2: Aplicar en DEV y verificar**

Aplicar la migración al proyecto **dev** (ver memoria `supabase-environments`). Luego verificar que no quedan primarias en blanco:

```sql
select count(*) from public.book_editions
where is_primary and publisher is null and isbn is null and total_pages is null;
-- Esperado: 0
```

Y que la función quedó guardada:
```sql
select pg_get_functiondef('public.create_primary_book_edition'::regproc) like '%no se crea primaria%' as guardada;
```

> Prod se aplica en Task 6 (tras verificar toda la feature), no aquí.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260715_book_editions_no_blank_primary.sql
git commit -m "fix(editions): no crear la edicion primaria en blanco de un libro ligero

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Helper `loadBookEditions` (sync-si-hace-falta + lee)

**Files:**
- Create: `src/lib/editions/load-editions.ts`

**Interfaces:**
- Consumes: `ensureBookEditions` de `@/lib/editions/sync-editions`; `getEditions` de `@/lib/editions/get-editions`; `Edition` de `./types`.
- Produces: `loadBookEditions(supabase, book, canSync): Promise<Edition[]>`.

- [ ] **Step 1: Escribir el helper**

`src/lib/editions/load-editions.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { Edition } from "./types";
import { ensureBookEditions } from "./sync-editions";
import { getEditions } from "./get-editions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type LoadableBook = {
  id: string;
  openlibrary_work_key: string | null;
  isbn: string | null;
  editions_synced_at: string | null;
};

// Sincroniza las ediciones reales desde OpenLibrary si aún no se hizo (guard
// editions_synced_at) y devuelve la lista para pintar. Se resuelve como una
// promesa que la ficha pasa a <Suspense>/use(): así el sync (lento) ocurre en
// la misma petición pero en streaming, sin bloquear el resto de la página y sin
// esperar a una segunda visita. `canSync` es false para anónimos (la RPC
// register_book_edition exige auth.uid()): solo leen lo que haya. Nunca lanza
// (ensureBookEditions se traga sus errores).
export async function loadBookEditions(
  supabase: SupabaseServerClient,
  book: LoadableBook,
  canSync: boolean,
): Promise<Edition[]> {
  if (canSync && book.editions_synced_at === null) {
    await ensureBookEditions(supabase, book);
  }
  return getEditions(supabase, "book", book.id);
}
```

- [ ] **Step 2: Tipos/lint** — `fnm use 22 && npx tsc --noEmit && npx eslint src/lib/editions/load-editions.ts`. Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/editions/load-editions.ts
git commit -m "feat(editions): helper loadBookEditions (sync-si-hace-falta + lee)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `EditionsSection` se alimenta de un `Promise` y streamea con `<Suspense>`

**Files:**
- Modify: `src/components/detail/edition-details.tsx` (la función `EditionsSection`, líneas 141-189)
- Create: `src/components/detail/editions-loading.tsx`

**Interfaces:**
- Consumes: `Edition` de `@/lib/editions/types`; `EditionStrip`, `EditionDetails`, `MetadataSidebar` (ya en el fichero / importados).
- Produces: `EditionsSection` con prop `editionsPromise: Promise<Edition[]>` (en vez de `editions: Edition[]`) y `editionsFallback: ReactNode`.

- [ ] **Step 1: Crear el skeleton de carga**

`src/components/detail/editions-loading.tsx`:

```tsx
// Placeholder de la tira de ediciones mientras se sincronizan desde OpenLibrary
// en la primera visita (va como fallback del <Suspense> en EditionsSection).
export function EditionsLoading() {
  return (
    <div className="flex gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-32 w-20 shrink-0 animate-pulse rounded-cover bg-surface-muted"
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Reescribir `EditionsSection` para resolver el promise con `use()`**

En `src/components/detail/edition-details.tsx`, sustituir la función `EditionsSection` (líneas 141-189) por:

```tsx
export function EditionsSection({
  itemType,
  itemId,
  editionsPromise,
  selectedEditionId,
  canContribute,
  workRows,
  genres,
  genresLabel,
  editionsFallback,
  children,
}: {
  itemType: ItemType;
  itemId: string;
  /** Se resuelve con las ediciones (posible sync desde OpenLibrary): llega por
   *  streaming, resuelto con use() dentro de los <Suspense> de abajo. */
  editionsPromise: Promise<Edition[]>;
  selectedEditionId: string | null;
  canContribute: boolean;
  workRows: MetaRow[];
  genres: string[];
  genresLabel: string;
  /** Fallback de la tira mientras el promise no resuelve. */
  editionsFallback: ReactNode;
  /** La sinopsis (<InfoPanel>), entre la tira y el panel de metadatos. Va FUERA
   *  de los <Suspense>: se pinta al instante aunque las ediciones tarden. */
  children: ReactNode;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={editionsFallback}>
        <ResolvedEditionStrip
          itemType={itemType}
          itemId={itemId}
          editionsPromise={editionsPromise}
          selectedEditionId={selectedEditionId}
          viewingId={viewingId}
          onSelect={setViewingId}
          canContribute={canContribute}
        />
      </Suspense>

      {children}

      {/* Mientras cargan las ediciones, el panel muestra la metadata de la OBRA
          (que es justo lo que EditionDetails pinta cuando no hay edición en
          mira), así que este fallback no parpadea a "vacío". */}
      <Suspense
        fallback={
          <MetadataSidebar rows={workRows} genres={genres} genresLabel={genresLabel} />
        }
      >
        <ResolvedEditionDetails
          itemType={itemType}
          editionsPromise={editionsPromise}
          viewingId={viewingId}
          onSelect={setViewingId}
          workRows={workRows}
          genres={genres}
          genresLabel={genresLabel}
        />
      </Suspense>
    </div>
  );
}

// Resuelven el promise con use() (React 19): suspenden hasta que las ediciones
// están, y comparten viewingId con el resto de EditionsSection.
function ResolvedEditionStrip({
  editionsPromise,
  ...props
}: {
  itemType: ItemType;
  itemId: string;
  editionsPromise: Promise<Edition[]>;
  selectedEditionId: string | null;
  viewingId: string | null;
  onSelect: (id: string | null) => void;
  canContribute: boolean;
}) {
  const editions = use(editionsPromise);
  return <EditionStrip editions={editions} {...props} />;
}

function ResolvedEditionDetails({
  editionsPromise,
  ...props
}: {
  itemType: ItemType;
  editionsPromise: Promise<Edition[]>;
  viewingId: string | null;
  onSelect: (id: string | null) => void;
  workRows: MetaRow[];
  genres: string[];
  genresLabel: string;
}) {
  const editions = use(editionsPromise);
  return <EditionDetails editions={editions} {...props} />;
}
```

Y en los imports del principio del fichero, añadir `Suspense` y `use`:
```tsx
import { Suspense, use, useState, type ReactNode } from "react";
```
(sustituye al `import { useState, type ReactNode } from "react";` actual).

- [ ] **Step 3: Tipos/lint** — `fnm use 22 && npx tsc --noEmit && npx eslint src/components/detail/edition-details.tsx src/components/detail/editions-loading.tsx`. Esperado: sin errores (habrá un error en `page.tsx` hasta Task 4: aún pasa `editions=`; se arregla en el siguiente task).

- [ ] **Step 4: Commit**

```bash
git add src/components/detail/edition-details.tsx src/components/detail/editions-loading.tsx
git commit -m "feat(editions): EditionsSection streamea las ediciones con Suspense/use

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Cablear `libro/[id]/page.tsx` — promise a EditionsSection, fuera de `after()`

**Files:**
- Modify: `src/app/libro/[id]/page.tsx`

**Interfaces:**
- Consumes: `loadBookEditions` (Task 2); `EditionsSection` con `editionsPromise`/`editionsFallback` (Task 3); `EditionsLoading` (Task 3).

- [ ] **Step 1: Imports**

En `src/app/libro/[id]/page.tsx`, añadir:
```tsx
import { loadBookEditions } from "@/lib/editions/load-editions";
import { EditionsLoading } from "@/components/detail/editions-loading";
```
Quitar el import de `ensureBookEditions` (ya no se usa aquí; lo usa loadBookEditions).

- [ ] **Step 2: Quitar el sync de ediciones de `after()`**

Borrar el primer `after(() => ensureBookEditions(...))` (líneas ~117-124). **Dejar** el `after(() => ensureBookHydrated(...))` intacto (la sinopsis funciona y su curado de filas viejas sigue en after()). El bloque `if (user) { ... }` queda solo con el after() de hidratación.

- [ ] **Step 3: Crear el promise de ediciones (sin await) y mantener el array para el editor**

Donde hoy está el `Promise.all([...getEditions...])` (líneas ~135-139), dejar que `getEditions` siga dándole al `CatalogEditor` un array (lectura de BD, rápida; en la 1ª visita será `[]` y el editor solo se abre bajo demanda). Y crear el promise para el display SIN await:

```tsx
const [credits, saga, editions] = await Promise.all([
  getItemCredits(supabase, "book", book.id),
  getItemSaga(supabase, "book", book.id),
  getEditions(supabase, "book", book.id),
]);

// Ediciones del DISPLAY: se resuelven por streaming (sync-si-hace-falta + lee)
// dentro del <Suspense> de EditionsSection. NO se await aquí: eso bloquearía la
// página, que es justo lo que evitábamos con after().
const editionsPromise = loadBookEditions(
  supabase,
  {
    id: book.id,
    openlibrary_work_key: book.openlibrary_work_key,
    isbn: book.isbn,
    editions_synced_at: book.editions_synced_at,
  },
  Boolean(user),
);
```

- [ ] **Step 4: Pasar el promise a `EditionsSection`**

En el JSX (líneas ~281-297), cambiar el prop `editions={editions}` de `EditionsSection` por `editionsPromise` + `editionsFallback`:

```tsx
<EditionsSection
  itemType="book"
  itemId={book.id}
  editionsPromise={editionsPromise}
  editionsFallback={<EditionsLoading />}
  selectedEditionId={passes.find((p) => !p.finishedOn)?.editionId ?? null}
  canContribute={canContribute}
  workRows={metaRows}
  genres={genres}
  genresLabel={tDetail("genres")}
>
  <InfoPanel
    aboutLabel={tDetail("about")}
    synopsis={book.synopsis}
    noSynopsisLabel={tDetail("noSynopsis")}
    actions={<EditFichaButton />}
  />
</EditionsSection>
```

**Dejar** `editions={editions}` en `CatalogEditor` (línea ~263) tal cual: su formulario de edición (oculto salvo que un colaborador pulse "editar ficha") sigue con el array leído. En la primera visita será `[]`; es aceptable (el editor no se muestra por defecto y se rellena en visitas posteriores, ya sincronizadas).

- [ ] **Step 5: Verificar build**

Run: `fnm use 22 && npx tsc --noEmit && npx eslint src/app/libro/[id]/page.tsx && npm run build`
Expected: sin errores; build OK.

- [ ] **Step 6: Commit**

```bash
git add src/app/libro/[id]/page.tsx
git commit -m "feat(editions): la ficha streamea las ediciones en la primera visita

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: E2E — ediciones reales en la 1ª visita, sin edición en blanco

**Files:**
- Modify: `e2e/busqueda-hidratacion.spec.ts`

> Leer primero el spec: reutilizar sus helpers de login/seed, su usuario de prueba y su patrón de aserción con service key. Node 22 y contra OpenLibrary real.

- [ ] **Step 1: Añadir el caso**

Un caso nuevo que: busca por texto un título con ediciones reales conocidas en OpenLibrary, pulsa el resultado (openCatalogItem crea el libro y redirige), y en la **primera** carga de la ficha:
- espera a que la tira de ediciones muestre al menos una edición real (por streaming, sin recargar) — localizar por el contenedor de la tira / una tarjeta de edición;
- comprueba que NO aparece una "Edición principal" en blanco: aserción de BD con service key sobre `book_editions` del libro creado —

```
const res = await request.get(
  `${SUPABASE_URL}/rest/v1/book_editions?book_id=eq.${bookId}&select=is_primary,publisher,isbn,total_pages`,
  { headers: adminHeaders() },
);
const rows = await res.json();
// Ninguna primaria en blanco (los tres campos nulos):
expect(
  rows.some((r) => r.is_primary && !r.publisher && !r.isbn && !r.total_pages),
).toBe(false);
// Y hay al menos una edición real:
expect(rows.length).toBeGreaterThan(0);
```

Obtener `bookId` de la URL tras el redirect (`/libro/<id>`). Autolimpieza: borrar el libro creado (las ediciones caen por cascade) con service key en un `finally`.

- [ ] **Step 2: Correr**

Run: `fnm use 22 && npx playwright test e2e/busqueda-hidratacion.spec.ts`
Expected: PASS (incluido el caso nuevo). Si OpenLibrary tarda, el `<Suspense>` puede tardar unos segundos en poblar la tira: usar un timeout generoso en el `expect` de la tira.

- [ ] **Step 3: Commit**

```bash
git add e2e/busqueda-hidratacion.spec.ts
git commit -m "test(e2e): ediciones reales en la primera visita, sin edicion en blanco

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Verificación integral + aplicar migración a prod

**Files:** ninguno (ejecución) salvo commit de cierre si hay ajustes.

- [ ] **Step 1: Suite completa**

Run: `fnm use 22 && npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`
Expected: PASS/limpio (los tests unitarios existentes siguen verdes; esta feature es sobre todo BD + streaming).

- [ ] **Step 2: E2E completa**

Run: `fnm use 22 && npx playwright test`
Expected: PASS. Anotar el fallo preexistente de `propose-wizard.spec.ts` (locator anclado) si sigue: no es de esta rama.

- [ ] **Step 3: Aplicar la migración a PROD**

Aplicar `20260715_book_editions_no_blank_primary.sql` al proyecto **prod** (ver memoria `supabase-environments`). Reejecutar la verificación de "0 primarias en blanco" contra prod (los libros viejos de prod se limpian con la parte `do $$` de la migración).

> Acción con efecto en producción: confirmar con el usuario antes de aplicar si procede.

- [ ] **Step 4: Commit de cierre (si hubo ajustes)**

Si algún paso obligó a un ajuste, commitear. Si todo pasó sin cambios, no hay commit.

---

## Self-Review

- **Cobertura del spec:**
  - No crear la edición primaria en blanco (guard del trigger) → Task 1. ✓
  - Limpieza de las ya existentes en dev/prod → Task 1 (dev) + Task 6 (prod). ✓
  - Ediciones reactivas por streaming (Suspense/use, sinopsis inmediata) → Tasks 2, 3, 4. ✓
  - Cola larga: `fetchWorkEditions` ya trae 1 página salvo clásicos (5 páginas en paralelo con timeout 5 s), así que el sync completo va en el streaming; no se parte en dos (evita la complejidad de dos marcas de sync). Desviación consciente del "puede quedarse en after()" del spec (era opcional). ✓
  - E2E → Task 5. ✓
  - Fuera de alcance (movies, addToLibrary) → no se tocan. ✓
- **Placeholders:** ninguno; cada paso trae SQL/código/comando concretos.
- **Consistencia de tipos:** `loadBookEditions(supabase, book, canSync): Promise<Edition[]>` (Task 2) es lo que consume `page.tsx` (Task 4) y lo que `EditionsSection.editionsPromise` espera (Task 3). `EditionStrip`/`EditionDetails` siguen recibiendo `editions: Edition[]` (resuelto por los wrappers `Resolved*`).
- **Riesgo:** `use(promise)` cruzando el borde servidor→cliente en este Next; si no se comporta, plan B es un componente servidor async tras `<Suspense>` que renderice `EditionsSection` con las ediciones ya resueltas, duplicando la sinopsis en el fallback. Se prefiere `use()` por no duplicar la sinopsis. El E2E de Task 5 es la red de seguridad real.
