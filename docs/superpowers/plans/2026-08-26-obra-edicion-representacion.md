# Obra / Edición / Representación (B′) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catálogo work-first con representación ES→EN→otro, ediciones solo bajo identificación explícita, Google Books como enriquecedor, y capa Wikidata/Inventaire para identidad inter-idioma y colapso de duplicados.

**Architecture:** La búsqueda sigue sin escribir (escalera de hidratación intacta). Se añade una tercera pasada (Inventaire) al fan-out de búsqueda y un colapso por QID. `hydrate_book` pasa a fill-or-upgrade por rango de idioma con procedencia por campo en `books.repr_meta`. `sync-editions` muere; el picker consulta OL en vivo y persiste solo la edición elegida. La precedencia de páginas queda en 2 niveles (edición del pase → `books.total_pages` orientativas).

**Tech Stack:** Next.js (App Router, server actions, `after()`), Supabase (RPC `SECURITY DEFINER`, migraciones SQL), OpenLibrary API, Inventaire API, Google Books API, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-obra-edicion-representacion-design.md` — leerla antes de empezar.

## Global Constraints

- Node v22 obligatorio para tests: el shell arranca con v20 y rompe Vitest. `fnm use 22` antes de `npm test` / `npm run test:e2e`.
- Migraciones: **dev primero** (`supabase-dev`, project `tyvzpuhxfwxrnkcpzxyg`); prod (`vmutcradmodhiltuohys`) solo tras verificación. Verificar SIEMPRE contra objetos reales (`pg_proc`, `pg_attribute`, `information_schema`), nunca `list_migrations`.
- Al cambiar la firma de una RPC: `drop function` explícito ANTES del `create` (una firma nueva con `create or replace` crea una sobrecarga y PostgREST no sabe cuál llamar).
- `revoke` de funciones nuevas: nombrar a `anon` explícitamente (`revoke all from public` NO le quita el execute que Supabase concede por default privileges — issue #831).
- Toda función de hidratación: NUNCA lanza hacia el render (try/catch + `console.error`), y escribe solo vía RPC con `set_config('app.hydrating','on',true)`.
- Rango de idioma canónico: `es=0, en=1, other=2, desconocido=3`. `source ∈ openlibrary|google_books|wikidata|manual`. `source='manual'` es intocable para automatismos.
- Errores de dominio como `{ok:false, reason}`, nunca throw en server actions.
- Fases: 0 (backup) → A (migraciones aditivas) → B (código) → C (destructiva, SOLO tras verde en prod). No adelantar C.
- Un solo `next dev` en puerto 3000; Playwright reutiliza el que haya.
- Al terminar cada tarea: commit. Al terminar el plan: sincronizar `data-model.md`, `decisiones.md`, backlog e issues (Task 17).
- **Toda comparación de nombres o títulos pasa por `isSameTitle` de `src/lib/catalog/title-match.ts`.**
  Prohibido escribir una variante nueva a base de `normalizeTitleForComparison` + `includes`
  bidireccional: ha sido un hallazgo bloqueante en dos tareas de este mismo plan, la segunda
  reintroduciendo palabra por palabra el código que el commit anterior acababa de borrar.
- **Los tests se validan por MUTACIÓN antes de darlos por buenos**: rompe la comprobación que el test
  dice cubrir y confirma que el test falla. En este plan han aparecido ya varios tests que pasaban
  igual con la implementación rota. Incluye la tabla de mutaciones en el informe de la tarea.

---

### Task 0: Backup previo (Fase 0)

**Files:** ninguno (operación de BD vía MCP supabase; sin `psql` en esta máquina).

**Interfaces:**
- Produces: esquema `backup_obra_edicion_20260826` en dev y prod con copias de `books`, `book_editions` y `passes`.

- [ ] **Step 1: Crear el esquema de respaldo en dev** (`mcp__supabase-dev__execute_sql` o el conector claude.ai con project_id `tyvzpuhxfwxrnkcpzxyg`):

```sql
create schema if not exists backup_obra_edicion_20260826;
create table backup_obra_edicion_20260826.books as select * from public.books;
create table backup_obra_edicion_20260826.book_editions as select * from public.book_editions;
create table backup_obra_edicion_20260826.passes as select * from public.passes;
revoke all on all tables in schema backup_obra_edicion_20260826 from anon, authenticated;
```

- [ ] **Step 2: Verificar counts origen = respaldo en dev**

```sql
select 'books' t, (select count(*) from public.books) src, (select count(*) from backup_obra_edicion_20260826.books) bak
union all select 'book_editions', (select count(*) from public.book_editions), (select count(*) from backup_obra_edicion_20260826.book_editions)
union all select 'passes', (select count(*) from public.passes), (select count(*) from backup_obra_edicion_20260826.passes);
```

Expected: `src = bak` en las tres filas. Si no, PARAR.

- [ ] **Step 3: Repetir Steps 1–2 en prod** (project `vmutcradmodhiltuohys`). Nota: la escritura en prod puede requerir autorización explícita del dueño en el chat — pedirla, no saltársela.

- [ ] **Step 4: Comprobar que el backup diario de Supabase de prod está disponible** (panel del proyecto → Database → Backups). Anotar fecha del último en el mensaje de cierre de la tarea.

- [ ] **Step 5: Abrir issue-recordatorio de limpieza**

```sh
gh issue create --label "area:catalogo,tipo:deuda,P3" \
  --title "Borrar esquema backup_obra_edicion_20260826 cuando la pieza obra/edición lleve un ciclo estable" \
  --body "Creado como Fase 0 del plan docs/superpowers/plans/2026-08-26-obra-edicion-representacion.md. Existe en dev y prod. Borrar con 'drop schema backup_obra_edicion_20260826 cascade' en ambos cuando la migración de representación lleve >2 semanas sin incidencias."
```

---

### Task 1: Migración A1 — columnas de representación e ids externos + backfill

**Files:**
- Create: `supabase/migrations/20260882_repr_a_columns.sql`

**Interfaces:**
- Produces: `books.repr_meta jsonb`, `books.google_books_volume_id text`, `books.wikidata_id text`, índices únicos `books_google_books_volume_id_key`, `books_wikidata_id_key`; filas existentes con `repr_meta` backfilled.

- [ ] **Step 1: Escribir la migración**

```sql
-- Spec 2026-08-26 (obra/edición/representación B'). Columnas de representación
-- e identidad. Sin grants de cliente: las escriben solo RPCs SECURITY DEFINER
-- y las actions de curación de colaborador (evita la trampa #375 a propósito:
-- ninguna escritura de rol `user` pasa por aquí).

alter table public.books add column if not exists repr_meta jsonb;
alter table public.books add column if not exists google_books_volume_id text;
alter table public.books add column if not exists wikidata_id text;

-- Únicos SIN predicado, mismo criterio que books_openlibrary_work_key_key
-- (20260870): los NULL no chocan entre sí, y ON CONFLICT los necesita únicos.
create unique index if not exists books_google_books_volume_id_key
  on public.books (google_books_volume_id);
create unique index if not exists books_wikidata_id_key
  on public.books (wikidata_id);

-- Backfill: todo valor existente queda con lang 'unknown' (rango 3, mejorable
-- por cualquier candidata es/en) y source 'openlibrary'. Limitación asumida en
-- el spec §7: la curación manual previa es indistinguible y queda mejorable.
update public.books set repr_meta =
  (select jsonb_object_agg(f.k, jsonb_build_object('lang','unknown','source','openlibrary'))
   from (values ('title', title), ('cover', cover_url), ('synopsis', synopsis)) as f(k, v)
   where f.v is not null and f.v <> '')
where repr_meta is null;

comment on column public.books.repr_meta is
  'Procedencia e idioma por campo representable: {"title":{"lang":"es","source":"openlibrary"},...}. lang: es|en|other|unknown. source: openlibrary|google_books|wikidata|manual. manual = curado, intocable para automatismos. Escrito solo por RPCs de hidratación y actions de colaborador.';
```

- [ ] **Step 2: Aplicar en dev** (`mcp__supabase-dev__apply_migration`, name `repr_a_columns`).

- [ ] **Step 3: Verificar contra objetos reales en dev**

```sql
select column_name from information_schema.columns
 where table_name='books' and column_name in ('repr_meta','google_books_volume_id','wikidata_id');
select indexname from pg_indexes where tablename='books' and indexname like '%wikidata%' or indexname like '%google_books%';
select count(*) filter (where repr_meta is not null) as with_meta, count(*) filter (where title is not null and repr_meta is null) as missing from public.books;
```

Expected: 3 columnas, 2 índices, `missing = 0`.

- [ ] **Step 4: Regenerar tipos** (`mcp__supabase-dev__generate_typescript_types` → `src/lib/supabase/database.types.ts`). Ojo al efecto colateral conocido de regenerar desde dev (issue #701): revisar el diff y no colar cambios ajenos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260882_repr_a_columns.sql src/lib/supabase/database.types.ts
git commit -m "feat(catalogo): columnas repr_meta, google_books_volume_id y wikidata_id en books"
```

---

### Task 2: Migración A2 — `hydrate_book` v3 (fill-or-upgrade)

**Files:**
- Create: `supabase/migrations/20260883_repr_b_hydrate_book_v3.sql`

**Interfaces:**
- Consumes: columnas de Task 1.
- Produces: RPC `hydrate_book(p_book_id uuid, p_fields jsonb, p_genres text[], p_published_year integer, p_total_pages integer, p_pages_source text, p_wikidata_id text) returns void` y helper `public.repr_lang_rank(text) returns int`. `p_fields` = `{"title":{"value":"…","lang":"es","source":"openlibrary"}, "cover":{…}, "synopsis":{…}}` (claves opcionales).

- [ ] **Step 1: Escribir la migración**

```sql
-- hydrate_book v3 (spec 2026-08-26 §2): de fill-only puro a FILL-OR-UPGRADE por
-- rango de idioma, con procedencia por campo en repr_meta. Regla única:
--   escribe si source guardado != 'manual' Y (campo vacío O rank(nuevo) < rank(guardado)).
-- Empate de rango: no se pisa. La curación manual es intocable.

create or replace function public.repr_lang_rank(p_lang text)
returns integer language sql immutable as $$
  select case p_lang when 'es' then 0 when 'en' then 1 when 'other' then 2 else 3 end;
$$;

-- Firma anterior (20260871). create or replace con firma nueva crearía sobrecarga.
drop function if exists public.hydrate_book(uuid, text, text[], text, text, text, integer);

create function public.hydrate_book(
  p_book_id uuid,
  p_fields jsonb default null,
  p_genres text[] default null,
  p_published_year integer default null,
  p_total_pages integer default null,
  p_pages_source text default null,
  p_wikidata_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.books%rowtype;
  v_meta jsonb;
  v_field text;
  v_new jsonb;
  v_value text;
  v_lang text;
  v_source text;
  v_current text;
  v_max int;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  perform set_config('app.hydrating', 'on', true);

  select * into v_row from public.books where id = p_book_id for update;
  if not found then
    perform set_config('app.hydrating', 'off', true);
    return;
  end if;
  v_meta := coalesce(v_row.repr_meta, '{}'::jsonb);

  foreach v_field in array array['title','cover','synopsis'] loop
    v_new := p_fields -> v_field;
    continue when v_new is null;
    v_value := v_new ->> 'value';
    v_lang  := v_new ->> 'lang';
    v_source := v_new ->> 'source';
    continue when v_value is null or v_value = ''
      or v_lang not in ('es','en','other')
      or v_source not in ('openlibrary','google_books','wikidata');

    v_current := case v_field
      when 'title' then v_row.title
      when 'cover' then v_row.cover_url
      when 'synopsis' then v_row.synopsis end;

    -- Curación manda; luego vacío o mejora estricta de rango.
    if coalesce(v_meta -> v_field ->> 'source', '') = 'manual' then
      continue;
    end if;
    if v_current is not null and v_current <> ''
       and public.repr_lang_rank(v_lang) >= public.repr_lang_rank(v_meta -> v_field ->> 'lang') then
      continue;
    end if;

    v_max := case v_field when 'title' then 300 when 'cover' then 2000 else 5000 end;
    v_value := left(v_value, v_max);
    if v_field = 'title' then v_row.title := v_value;
    elsif v_field = 'cover' then v_row.cover_url := v_value;
    else v_row.synopsis := v_value;
    end if;
    v_meta := v_meta || jsonb_build_object(v_field,
      jsonb_build_object('lang', v_lang, 'source', v_source));
  end loop;

  -- Campos sin dimensión de idioma: fill-only como siempre.
  if (v_row.published_year is null) and p_published_year is not null then
    v_row.published_year := p_published_year;
  end if;
  if (v_row.genres is null or cardinality(v_row.genres) = 0) and p_genres is not null then
    v_row.genres := p_genres;
  end if;
  if v_row.total_pages is null and p_total_pages is not null and p_total_pages between 1 and 20000 then
    v_row.total_pages := p_total_pages;
    if p_pages_source in ('openlibrary','google_books') then
      v_meta := v_meta || jsonb_build_object('pages', jsonb_build_object('source', p_pages_source));
    end if;
  end if;

  update public.books
     set title = v_row.title,
         cover_url = v_row.cover_url,
         synopsis = v_row.synopsis,
         published_year = v_row.published_year,
         genres = v_row.genres,
         total_pages = v_row.total_pages,
         repr_meta = v_meta,
         hydrated_at = now()
   where id = p_book_id;

  -- Ancla de identidad inter-idioma: null → valor solamente. Si el QID ya lo
  -- tiene OTRA obra (unique_violation), aquí NO se fusiona: se deja sin QID y
  -- lo resuelve el barrido/fusión cobarde (spec §6). La hidratación nunca
  -- destruye por su cuenta.
  if p_wikidata_id is not null and v_row.wikidata_id is null then
    begin
      update public.books set wikidata_id = p_wikidata_id
       where id = p_book_id and wikidata_id is null;
    exception when unique_violation then
      null;
    end;
  end if;

  perform set_config('app.hydrating', 'off', true);
end;
$$;

revoke all on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text) from public;
revoke execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text) from anon;
grant execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text) to authenticated;

comment on function public.hydrate_book is
  'v3 (spec 2026-08-26): fill-or-upgrade por rango de idioma (es<en<other<unknown) con procedencia por campo en repr_meta. source=manual intocable. p_wikidata_id solo null→valor; conflicto de QID lo resuelve la fusión cobarde, no esta RPC.';
```

- [ ] **Step 2: Aplicar en dev** (`apply_migration`, name `repr_b_hydrate_book_v3`).

- [ ] **Step 3: Probar las ramas a mano en dev** (execute_sql, con una fila de prueba; borrar la fila al final del mismo paso):

```sql
-- sembrar
insert into public.books (id, title, repr_meta) values
  ('00000000-0000-4000-8000-00000000dead', 'Polnoc library', '{"title":{"lang":"other","source":"openlibrary"}}') ;
-- upgrade other→es (debe escribir):
select public.hydrate_book('00000000-0000-4000-8000-00000000dead',
  '{"title":{"value":"La biblioteca","lang":"es","source":"wikidata"}}'::jsonb);
select title, repr_meta->'title' from public.books where id='00000000-0000-4000-8000-00000000dead';
-- downgrade es→en (NO debe escribir):
select public.hydrate_book('00000000-0000-4000-8000-00000000dead',
  '{"title":{"value":"The Library","lang":"en","source":"openlibrary"}}'::jsonb);
select title from public.books where id='00000000-0000-4000-8000-00000000dead';
-- manual intocable:
update public.books set repr_meta = jsonb_set(repr_meta,'{title,source}','"manual"') where id='00000000-0000-4000-8000-00000000dead';
select public.hydrate_book('00000000-0000-4000-8000-00000000dead',
  '{"title":{"value":"Otro","lang":"es","source":"openlibrary"}}'::jsonb);
select title from public.books where id='00000000-0000-4000-8000-00000000dead';
delete from public.books where id='00000000-0000-4000-8000-00000000dead';
```

Expected: título pasa a «La biblioteca» tras el upgrade; NO cambia en el downgrade; NO cambia con manual. (Nota: `hydrate_book` exige `auth.uid()`; ejecutar el sondeo con un JWT de usuario de dev o envolver el test con `set local role authenticated` + claim, como en sondeos anteriores del repo.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260883_repr_b_hydrate_book_v3.sql
git commit -m "feat(catalogo): hydrate_book v3 fill-or-upgrade por rango de idioma con repr_meta"
```

---

### Task 3: Migración A3 — alta GB-only y alta manual con edición

**Files:**
- Create: `supabase/migrations/20260886_repr_e_alta_gbonly.sql`
- Modify: `src/app/buscar/manual/actions.ts` (tras el `register_manual_catalog_item`, registrar la edición)

**Interfaces:**
- Produces: RPC `register_catalog_item_by_volume(p_volume_id text) returns uuid` (shell GB-only). El alta manual con ISBN registra además la edición vía `register_book_edition` existente (`p_book_id, p_isbn, p_cover_url` — ver firma en `20260714_editions_c_register.sql`).

- [ ] **Step 1: Migración**

```sql
-- Shell de obra a partir de un volumen de Google Books (spec §4): SOLO para el
-- camino ISBN-que-OL-no-conoce. Mismo patrón que register_catalog_item (#674):
-- nace vacía, canónicos por hidratación.
create or replace function public.register_catalog_item_by_volume(p_volume_id text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_volume_id is null or btrim(p_volume_id) = '' then raise exception 'volume id required'; end if;
  insert into public.books (google_books_volume_id)
    values (btrim(p_volume_id))
    on conflict (google_books_volume_id) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.books where google_books_volume_id = btrim(p_volume_id);
  end if;
  return v_id;
end;
$$;

revoke all on function public.register_catalog_item_by_volume(text) from public;
revoke execute on function public.register_catalog_item_by_volume(text) from anon;
grant execute on function public.register_catalog_item_by_volume(text) to authenticated;
```

- [ ] **Step 2: Aplicar en dev + verificar** (`pg_proc`: `prosecdef=true`, `anon` sin execute vía `has_function_privilege`).

- [ ] **Step 3: Alta manual con edición.** En `src/app/buscar/manual/actions.ts`, tras obtener el `uuid` de `register_manual_catalog_item`, si el formulario trae ISBN:

```ts
if (isbn) {
  const { error: editionError } = await supabase.rpc("register_book_edition", {
    p_book_id: bookId,
    p_isbn: isbn,
    p_publisher: publisher || undefined,
    p_pages: totalPages || undefined,
    p_cover_url: coverUrl || undefined,
  });
  // Mejora, no requisito: el alta de la obra ya está hecha.
  if (editionError) console.error("register_book_edition (alta manual)", { bookId, editionError });
}
```

(Comprobar la firma exacta de `register_book_edition` en `20260714_editions_c_register.sql` — acepta `p_label`, `p_publisher`, `p_year`, `p_pages`, `p_cover_url` opcionales — y pasar solo lo que el formulario tenga.)

- [ ] **Step 4: Test manual en dev**: crear obra manual con ISBN desde `/buscar/manual` con cuenta colaborador → verificar fila en `book_editions` con ese ISBN.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260886_repr_e_alta_gbonly.sql src/app/buscar/manual/actions.ts
git commit -m "feat(catalogo): alta GB-only por volume id y edición real en el alta manual con ISBN"
```

---

### Task 4: Migración A4 — `merge_book_into` (fusión cobarde como función)

**Files:**
- Create: `supabase/migrations/20260887_repr_f_merge_books_fn.sql`
- Read first: `supabase/migrations/20260870_books_openlibrary_work_key_unique.sql` (la fusión inline que esta función generaliza — copiar su lista de tablas EXACTA, que es la autoritativa)

**Interfaces:**
- Produces: `merge_book_into(p_loser uuid, p_winner uuid) returns void` — repunta referencias polimórficas del perdedor al ganador y borra el perdedor; **aborta** (raise) si el repunte chocara con un único de tabla de usuario. Solo `service_role`/admin (sin grant a `authenticated`).

- [ ] **Step 1: Leer `20260870_books_openlibrary_work_key_unique.sql`** y extraer la lista de tablas que repunta (passes, collection_items, interaction_targets, club_activity_items, saga_items, credits, notes vía passes… la lista del fichero manda).

- [ ] **Step 2: Escribir la función** portando esa lógica tal cual, parametrizada:

```sql
-- Fusión COBARDE de dos filas de books (spec 2026-08-26 §6, patrón 20260870):
-- repunta lo que puede sin destruir datos de usuario y ABORTA con detalle si un
-- movimiento chocara con un único de tabla de usuario. Gana quien diga el
-- llamador (criterio: más rastro de usuario, lo decide el barrido, no esta fn).
create or replace function public.merge_book_into(p_loser uuid, p_winner uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if p_loser = p_winner then raise exception 'loser = winner'; end if;
  if not exists (select 1 from public.books where id = p_winner) then
    raise exception 'winner % no existe', p_winner;
  end if;

  -- DOS CLASES DE FILA, y confundirlas rompe la fusión (ver más abajo):
  --
  -- a) DATO DE USUARIO (passes, collection_items, saga_items…): si repuntarlo
  --    chocara con un único, ABORTAR con detalle. Nadie decide por el usuario
  --    qué pase suyo sobrevive.
  -- b) DATO DERIVADO del proveedor (credits, book_editions): la fila duplicada
  --    del perdedor SOBRA — se borra y se repunta el resto. Abortar aquí haría
  --    IMPOSIBLE toda fusión útil: dos shells de la misma obra creadas por la
  --    ficha de autor llevan AMBAS su credit (person_id, role='author'), así
  --    que el choque es la norma, no la excepción.
  --
  -- El cuerpo de 20260870 ya implementa exactamente esto (chequeo previo de
  -- conflictos de usuario → raise; delete de credits/book_editions duplicados
  -- → update del resto). PORTARLO TAL CUAL, tabla por tabla, es el trabajo de
  -- este paso: su lista es la autoritativa (17 tablas), no inventar.
  --
  -- Único cambio respecto al original: fuera la línea
  -- `update book_editions set is_primary = false`, porque la columna muere en
  -- la fase C (Task 16). Si esta migración se aplica ANTES que la fase C, la
  -- línea debe seguir; si después, sobra. Escribirla condicionada:
  --   if exists (select 1 from information_schema.columns
  --              where table_name='book_editions' and column_name='is_primary')
  --   then execute 'update public.book_editions set is_primary=false where book_id=$1' using p_loser;
  --   end if;

  delete from public.books where id = p_loser;
end;
$$;
revoke all on function public.merge_book_into(uuid, uuid) from public, anon, authenticated;
```

**El bloque `[PORTAR AQUÍ…]` es trabajo de este paso, no un hueco a dejar**: la migración no se commitea hasta sustituirlo por los UPDATE reales sacados de `20260870`. El repunte de `passes` debe respetar cualquier único parcial que exista sobre `(user_id, item_type, item_id)`.

- [ ] **Step 3: Probar en dev** con tres casos sembrados, limpiando las filas al final:
  1. Dos shells sin pases, **ambas con un credit del mismo autor y rol** (es el caso real que produce la ficha de autor): la fusión debe COMPLETARSE, borrando el credit sobrante. Si aborta, el `delete` previo de `credits` no se portó.
  2. Fusión hacia la fila que tiene el pase: funciona, el pase queda apuntando al ganador.
  3. Fusión que provocaría dos pases activos del mismo usuario sobre la misma obra: ABORTA con mensaje que nombra la tabla.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260887_repr_f_merge_books_fn.sql
git commit -m "feat(catalogo): merge_book_into, fusión cobarde reutilizable de obras"
```

---

### Task 5: Cliente Inventaire

**Files:**
- Create: `src/lib/catalog/inventaire/client.ts`
- Test: `src/lib/catalog/inventaire/client.test.ts`

**Interfaces:**
- Produces:
  - `type InventaireEntity = { uri: string; labels: Record<string, string>; authorNames: string[] }`
  - `searchInventaireEntities(query: string): Promise<InventaireEntity[]>` — nunca lanza, `[]` en fallo. Máx. 5 entidades, con labels y nombres de autor resueltos.
  - `qidFromUri(uri: string): string | null` — `"wd:Q8034469"` → `"Q8034469"`; `inv:` → `null` (solo entidades Wikidata anclan identidad).

- [ ] **Step 1: Test failing** (unidad de la parte pura + shape del fetch mockeado):

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { qidFromUri, searchInventaireEntities } from "./client";

afterEach(() => vi.restoreAllMocks());

describe("qidFromUri", () => {
  it("extrae QID de uri wd:", () => expect(qidFromUri("wd:Q8034469")).toBe("Q8034469"));
  it("rechaza entidades inv: (no son identidad Wikidata)", () =>
    expect(qidFromUri("inv:de41d4750b6a757d5d0b8102b51909a0")).toBeNull());
});

describe("searchInventaireEntities", () => {
  it("devuelve [] si la API falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await searchInventaireEntities("palabras radiantes")).toEqual([]);
  });
  it("resuelve labels y autores de las entidades wd:", async () => {
    const fetchMock = vi.fn()
      // 1ª llamada: /api/search
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ uri: "wd:Q8034469", label: "Palabras radiantes" }],
      })))
      // 2ª: by-uris de las obras (labels + P50)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q8034469": {
          labels: { es: "Palabras radiantes", en: "Words of Radiance" },
          claims: { "wdt:P50": ["wd:Q47217"] },
        } },
      })))
      // 3ª: by-uris de los autores
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entities: { "wd:Q47217": { labels: { en: "Brandon Sanderson" } } },
      })));
    vi.stubGlobal("fetch", fetchMock);
    const out = await searchInventaireEntities("palabras radiantes");
    expect(out).toEqual([{
      uri: "wd:Q8034469",
      labels: { es: "Palabras radiantes", en: "Words of Radiance" },
      authorNames: ["Brandon Sanderson"],
    }]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/catalog/inventaire/client.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implementación**

```ts
// Capa de identidad inter-idioma (spec 2026-08-26 §6). Inventaire expone las
// entidades de Wikidata con labels multilingües: es la única fuente que sabe
// que «Words of Radiance» y «Palabras Radiantes» son la misma obra. Dependencia
// BLANDA: cualquier fallo degrada a [] y la búsqueda sigue sin colapso.
const API = "https://inventaire.io/api";
const REVALIDATE_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 4000;
const MAX_ENTITIES = 5;

export type InventaireEntity = {
  uri: string;
  labels: Record<string, string>;
  authorNames: string[];
};

export function qidFromUri(uri: string): string | null {
  const m = /^wd:(Q\d+)$/.exec(uri);
  return m ? m[1] : null;
}

type RawEntity = { labels?: Record<string, string>; claims?: Record<string, unknown[]> };

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function searchInventaireEntities(query: string): Promise<InventaireEntity[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const search = await getJson<{ results?: Array<{ uri?: string }> }>(
      `${API}/search?types=works&search=${encodeURIComponent(trimmed)}&limit=${MAX_ENTITIES}&lang=es`
    );
    const uris = (search?.results ?? [])
      .map((r) => r.uri)
      .filter((u): u is string => typeof u === "string" && qidFromUri(u) !== null)
      .slice(0, MAX_ENTITIES);
    if (uris.length === 0) return [];

    const works = await getJson<{ entities?: Record<string, RawEntity> }>(
      `${API}/entities?action=by-uris&uris=${encodeURIComponent(uris.join("|"))}`
    );
    if (!works?.entities) return [];

    const authorUris = new Set<string>();
    for (const entity of Object.values(works.entities)) {
      for (const a of (entity.claims?.["wdt:P50"] ?? []) as string[]) {
        if (typeof a === "string") authorUris.add(a);
      }
    }
    const authors = authorUris.size
      ? await getJson<{ entities?: Record<string, RawEntity> }>(
          `${API}/entities?action=by-uris&uris=${encodeURIComponent([...authorUris].join("|"))}`
        )
      : null;

    const authorName = (uri: string): string | null => {
      const labels = authors?.entities?.[uri]?.labels ?? {};
      return labels.es ?? labels.en ?? Object.values(labels)[0] ?? null;
    };

    return uris.flatMap((uri) => {
      const raw = works.entities?.[uri];
      if (!raw?.labels) return [];
      const names = ((raw.claims?.["wdt:P50"] ?? []) as string[])
        .map(authorName)
        .filter((n): n is string => Boolean(n));
      return [{ uri, labels: raw.labels, authorNames: names }];
    });
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/inventaire/client.ts src/lib/catalog/inventaire/client.test.ts
git commit -m "feat(catalogo): cliente Inventaire para identidad inter-idioma"
```

---

### Task 6: Colapso por QID en la búsqueda

**Files:**
- Create: `src/lib/catalog/wikidata-collapse.ts`
- Test: `src/lib/catalog/wikidata-collapse.test.ts`
- Modify: `src/lib/catalog/types.ts` (añadir `wikidataId?: string` a `SearchResult`, con comentario)
- Modify: `src/lib/catalog/local-search.ts` (añadir `wikidata_id` a `BOOK_COLUMNS` y a `mapBookRow` → `wikidataId`)
- Modify: `src/lib/catalog/search.ts` (tercera pasada + colapso)

**Interfaces:**
- Consumes: `InventaireEntity`, `qidFromUri` (Task 5); `normalizeTitleForComparison` de `./openlibrary/normalize`.
- Produces: `collapseByWikidata(results: SearchResult[], entities: InventaireEntity[]): SearchResult[]` — pura, asigna `wikidataId` por match título↔label + autor↔autor, y funde los resultados que compartan QID. Preferencia del superviviente: (1) el que tenga `catalogId`, (2) mayor `editionCount`. El fundido hereda `altTitles` unidos y la mejor posición.

- [ ] **Step 1: Test failing**

```ts
import { describe, expect, it } from "vitest";
import { collapseByWikidata } from "./wikidata-collapse";
import type { SearchResult } from "./types";

const base: SearchResult = {
  itemType: "book", externalId: "", title: "", subtitle: null,
  coverUrl: null, year: null, synopsis: null, genres: null,
};
const entity = {
  uri: "wd:Q8034469",
  labels: { es: "Palabras radiantes", en: "Words of Radiance" },
  authorNames: ["Brandon Sanderson"],
};

describe("collapseByWikidata", () => {
  it("funde dos works de OL que son la misma entidad, prefiriendo el local", () => {
    const local: SearchResult = { ...base, externalId: "/works/OL16813053W", catalogId: "uuid-1",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson", altTitles: ["Palabras Radiantes"] };
    const api: SearchResult = { ...base, externalId: "/works/OL38056408W",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson", altTitles: ["Palabras Radiantes"], editionCount: 1 };
    const out = collapseByWikidata([local, api], [entity]);
    expect(out).toHaveLength(1);
    expect(out[0].catalogId).toBe("uuid-1");
    expect(out[0].wikidataId).toBe("Q8034469");
  });
  it("NO funde si el autor no casa", () => {
    const a: SearchResult = { ...base, externalId: "/works/OL1W", title: "Palabras radiantes", subtitle: "Otro Autor" };
    const b: SearchResult = { ...base, externalId: "/works/OL2W", title: "Words of Radiance", subtitle: "Brandon Sanderson" };
    expect(collapseByWikidata([a, b], [entity])).toHaveLength(2);
  });
  it("respeta wikidataId ya persistido en el local aunque el título no case con el label", () => {
    const local: SearchResult = { ...base, externalId: "", catalogId: "uuid-2",
      wikidataId: "Q8034469", title: "Palabras radiantes (ed. col.)", subtitle: "Brandon Sanderson" };
    const api: SearchResult = { ...base, externalId: "/works/OL38056408W",
      title: "Palabras Radiantes", subtitle: "Brandon Sanderson" };
    const out = collapseByWikidata([local, api], [entity]);
    expect(out).toHaveLength(1);
    expect(out[0].catalogId).toBe("uuid-2");
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementación**

```ts
import type { SearchResult } from "./types";
import { normalizeTitleForComparison } from "./openlibrary/normalize";
import { qidFromUri, type InventaireEntity } from "./inventaire/client";

// Colapso por entidad de Wikidata (spec 2026-08-26 §6). Regla de seguridad:
// sin verificación de AUTOR no hay match — un duplicado visible es recuperable,
// una fusión errónea destruye. PURO: no toca red ni BD.
function authorsMatch(subtitle: string | null, entity: InventaireEntity): boolean {
  if (!subtitle || entity.authorNames.length === 0) return false;
  const have = normalizeTitleForComparison(subtitle);
  return entity.authorNames.some((name) => {
    const n = normalizeTitleForComparison(name);
    return n.length > 0 && (have.includes(n) || n.includes(have));
  });
}

function entityQidFor(result: SearchResult, entities: InventaireEntity[]): string | null {
  if (result.wikidataId) return result.wikidataId;
  const titles = new Set(
    [result.title, ...(result.altTitles ?? [])]
      .map(normalizeTitleForComparison)
      .filter((t) => t.length > 0)
  );
  for (const entity of entities) {
    const qid = qidFromUri(entity.uri);
    if (!qid || !authorsMatch(result.subtitle, entity)) continue;
    const labels = Object.values(entity.labels).map(normalizeTitleForComparison);
    if (labels.some((label) => label.length > 0 && titles.has(label))) return qid;
  }
  return null;
}

export function collapseByWikidata(
  results: SearchResult[],
  entities: InventaireEntity[]
): SearchResult[] {
  if (entities.length === 0 && !results.some((r) => r.wikidataId)) return results;

  const out: SearchResult[] = [];
  const byQid = new Map<string, number>(); // qid -> índice en out

  for (const result of results) {
    const qid = entityQidFor(result, entities);
    if (!qid) {
      out.push(result);
      continue;
    }
    const tagged = { ...result, wikidataId: qid };
    const twinIndex = byQid.get(qid);
    if (twinIndex === undefined) {
      byQid.set(qid, out.length);
      out.push(tagged);
      continue;
    }
    const twin = out[twinIndex];
    // Superviviente: el que ya está en catálogo; si empatan, más ediciones.
    const winner =
      (twin.catalogId ? 1 : 0) !== (tagged.catalogId ? 1 : 0)
        ? (twin.catalogId ? twin : tagged)
        : (twin.editionCount ?? 0) >= (tagged.editionCount ?? 0) ? twin : tagged;
    const loser = winner === twin ? tagged : twin;
    out[twinIndex] = {
      ...winner,
      wikidataId: qid,
      altTitles: [...new Set([...(winner.altTitles ?? []), ...(loser.altTitles ?? []), loser.title])],
      editionCount: Math.max(winner.editionCount ?? 0, loser.editionCount ?? 0) || undefined,
    };
  }
  return out;
}
```

- [ ] **Step 4: `types.ts`** — añadir al type `SearchResult`:

```ts
  // Libros: QID de Wikidata cuando la capa de identidad lo resolvió (columna
  // books.wikidata_id en local, o match Inventaire en búsqueda). Es la clave
  // del colapso inter-idioma: dos works de OL con el mismo QID son LA MISMA
  // obra. Ver spec 2026-08-26 §6.
  wikidataId?: string;
```

- [ ] **Step 5: `local-search.ts`** — `BOOK_COLUMNS` gana `wikidata_id`; `mapBookRow` gana `...(row.wikidata_id ? { wikidataId: row.wikidata_id } : {})` (y el type `BookRow`, el campo).

- [ ] **Step 6: `search.ts`** — rama libro por texto pasa a tres patas + colapso tras el merge:

```ts
    const [local, api, entities] = await Promise.all([
      searchLocalCatalog(supabase, "book", trimmed),
      searchWorks(trimmed),
      searchInventaireEntities(trimmed).catch(() => []),
    ]);
    return collapseByWikidata(mergeByExternalId(local, api), entities);
```

(Imports arriba: `searchInventaireEntities`, `collapseByWikidata`.)

- [ ] **Step 7: Run tests + typecheck** `npx vitest run src/lib/catalog && npx tsc --noEmit` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/catalog/wikidata-collapse.ts src/lib/catalog/wikidata-collapse.test.ts src/lib/catalog/types.ts src/lib/catalog/local-search.ts src/lib/catalog/search.ts
git commit -m "feat(busqueda): colapso de works por entidad de Wikidata (tercera pasada Inventaire)"
```

---

### Task 7: Cliente Google Books

**Files:**
- Create: `src/lib/catalog/googlebooks/client.ts`
- Test: `src/lib/catalog/googlebooks/client.test.ts`
- Modify: `src/lib/catalog/official-covers.ts` (allowlist: añadir el host real de `imageLinks` — verificarlo con una llamada real durante la implementación; se espera `books.google.com`)

**Interfaces:**
- Produces:
  - `type GoogleVolume = { volumeId: string; title: string | null; authors: string[]; synopsis: string | null; coverUrl: string | null; pageCount: number | null; language: string | null }`
  - `findVolumeByIsbn(isbn: string): Promise<GoogleVolume | null>`
  - `findBestVolume(title: string, author: string | null, lang: "es" | "en"): Promise<GoogleVolume | null>` — usa `langRestrict`, verifica título+autor normalizados contra la respuesta; sin match fiable → `null`.
  - Ambas devuelven `null` sin API key (`GOOGLE_BOOKS_API_KEY`) o en fallo. Nunca lanzan.
  - `coverUrl`: normalizada a `https`, `zoom=2`, y **solo** si su host pasa la allowlist.

- [ ] **Step 1: Test failing** — casos: sin key → null; volumen por ISBN mapea campos; `findBestVolume` rechaza cuando el título de la respuesta no casa (`normalizeTitleForComparison`); cover `http://books.google.com/...` sale como `https://` con `zoom=2`.

```ts
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { findVolumeByIsbn, findBestVolume } from "./client";

beforeEach(() => { process.env.GOOGLE_BOOKS_API_KEY = "test-key"; });
afterEach(() => { vi.restoreAllMocks(); delete process.env.GOOGLE_BOOKS_API_KEY; });

const volume = {
  id: "vol1",
  volumeInfo: {
    title: "La biblioteca de la medianoche",
    authors: ["Matt Haig"],
    description: "Sinopsis en español.",
    pageCount: 304,
    language: "es",
    imageLinks: { thumbnail: "http://books.google.com/books/content?id=vol1&zoom=1" },
  },
};

it("null sin API key", async () => {
  delete process.env.GOOGLE_BOOKS_API_KEY;
  expect(await findVolumeByIsbn("9788410138407")).toBeNull();
});

it("mapea volumen por ISBN con cover https y zoom=2", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [volume] }))));
  const out = await findVolumeByIsbn("9788410138407");
  expect(out?.volumeId).toBe("vol1");
  expect(out?.coverUrl).toMatch(/^https:\/\/books\.google\.com\//);
  expect(out?.coverUrl).toContain("zoom=2");
  expect(out?.pageCount).toBe(304);
});

it("findBestVolume rechaza si el título no casa", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [volume] }))));
  expect(await findBestVolume("Otra obra distinta", "Matt Haig", "es")).toBeNull();
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementación**

```ts
// Google Books (spec 2026-08-26 §4): enriquecedor por campo e identidad de
// último recurso por ISBN. NUNCA crea obra desde búsqueda por texto. Sin API
// key queda desactivado y todo degrada a OL-only. Nunca lanza.
import { normalizeTitleForComparison } from "../openlibrary/normalize";
import { isAllowedOfficialCoverUrl } from "../official-covers";

const FETCH_TIMEOUT_MS = 4000;
const REVALIDATE_SECONDS = 86400;

export type GoogleVolume = {
  volumeId: string;
  title: string | null;
  authors: string[];
  synopsis: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  language: string | null;
};

type RawVolume = {
  id?: string;
  volumeInfo?: {
    title?: string; authors?: string[]; description?: string;
    pageCount?: number; language?: string;
    imageLinks?: { thumbnail?: string; small?: string };
  };
};

function mapCover(links?: { thumbnail?: string; small?: string }): string | null {
  const raw = links?.small ?? links?.thumbnail;
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  url.protocol = "https:";
  url.searchParams.set("zoom", "2");
  const out = url.toString();
  return isAllowedOfficialCoverUrl(out) ? out : null;
}

function mapVolume(raw: RawVolume): GoogleVolume | null {
  if (!raw.id) return null;
  const info = raw.volumeInfo ?? {};
  return {
    volumeId: raw.id,
    title: info.title ?? null,
    authors: info.authors ?? [],
    synopsis: info.description ?? null,
    coverUrl: mapCover(info.imageLinks),
    pageCount: typeof info.pageCount === "number" && info.pageCount > 0 ? info.pageCount : null,
    language: info.language ?? null,
  };
}

async function queryVolumes(params: Record<string, string>): Promise<GoogleVolume[]> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  if (!key) return [];
  try {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", key);
    url.searchParams.set("maxResults", "5");
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data: { items?: RawVolume[] } = await res.json();
    return (data.items ?? []).flatMap((raw) => mapVolume(raw) ?? []);
  } catch {
    return [];
  }
}

export async function findVolumeByIsbn(isbn: string): Promise<GoogleVolume | null> {
  const volumes = await queryVolumes({ q: `isbn:${isbn}` });
  return volumes[0] ?? null;
}

// Match antes de aceptar (spec §4): título normalizado igual + autor contenido.
// Mejor hueco que dato de otra obra.
export async function findBestVolume(
  title: string,
  author: string | null,
  lang: "es" | "en"
): Promise<GoogleVolume | null> {
  const q = author ? `intitle:${title} inauthor:${author}` : `intitle:${title}`;
  const volumes = await queryVolumes({ q, langRestrict: lang });
  const want = normalizeTitleForComparison(title);
  const wantAuthor = author ? normalizeTitleForComparison(author) : null;
  return (
    volumes.find((v) => {
      if (!v.title || normalizeTitleForComparison(v.title) !== want) return false;
      if (!wantAuthor) return true;
      return v.authors.some((a) => {
        const n = normalizeTitleForComparison(a);
        return n.includes(wantAuthor) || wantAuthor.includes(n);
      });
    }) ?? null
  );
}
```

- [ ] **Step 4: Allowlist.** Hacer una llamada real (`curl "https://www.googleapis.com/books/v1/volumes?q=isbn:9788410138407"`) y confirmar el host de `imageLinks`. Añadirlo al set de `src/lib/catalog/official-covers.ts` (junto a `image.tmdb.org` y `covers.openlibrary.org`), con comentario citando la decisión de allowlist (`decisiones.md` 2026-08-02). Si la función de allowlist no se llama `isAllowedOfficialCoverUrl`, usar el nombre real del módulo y ajustar el import del Step 3.

- [ ] **Step 5: `GOOGLE_BOOKS_API_KEY`** a `.env.local` (pedir al dueño la key si no existe) y documentar en `.env.example` si el repo lo tiene.

- [ ] **Step 6: Run tests** → PASS. Commit:

```bash
git add src/lib/catalog/googlebooks/ src/lib/catalog/official-covers.ts
git commit -m "feat(catalogo): cliente Google Books (enriquecimiento e ISBN de último recurso)"
```

---

### Task 8: Candidatas de representación desde OL (sin persistir)

**Files:**
- Modify: `src/lib/catalog/openlibrary/editions.ts`
- Test: `src/lib/catalog/openlibrary/editions.test.ts` (ampliar el existente si lo hay; crear si no)

**Interfaces:**
- Consumes: `fetchWorkEditions`/`pickEditions` internos del módulo (filtros: ISBN válido, sin print-on-demand, orden ES→EN→resto).
- Produces: `fetchRepresentationCandidates(workKey: string): Promise<{ es: EditionCandidate | null; en: EditionCandidate | null; pagesMedian: number | null }>` con `type EditionCandidate = { title: string | null; coverUrl: string | null; pages: number | null }`. Escaneo acotado a **2 páginas** (200 ediciones máx.), reutilizando los filtros existentes. `pagesMedian` = mediana de `total_pages` de las candidatas filtradas (orientativas de obra, spec §1). Nunca lanza (`null`/`null`/`null` en fallo).

- [ ] **Step 1: Test failing** — con docs fixture (reutilizar el patrón de fixtures del módulo): dado un lote con ediciones spa y eng, `es.title` sale de la spa con portada; `pagesMedian` es la mediana; work sin ediciones → `{es: null, en: null, pagesMedian: null}`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementar** dentro de `editions.ts`, reutilizando `languagePriority` y los filtros de `pickEditions` (no duplicar las listas negras). Cap de páginas: constante nueva `MAX_REPRESENTATION_PAGES = 2` — no tocar `MAX_EDITIONS_PAGES` si otras rutas lo usan; si tras Task 10 ya nadie lo usa, borrarlo aquí. La mediana: sobre los `total_pages` válidos de las ediciones filtradas; `null` si no hay ninguno.

- [ ] **Step 4: Run tests** → PASS. Commit:

```bash
git add src/lib/catalog/openlibrary/editions.ts src/lib/catalog/openlibrary/editions.test.ts
git commit -m "feat(catalogo): candidatas de representación ES/EN desde ediciones OL en vivo"
```

---

### Task 9: `ensureBookHydrated` v3 (política ES→EN + Wikidata + GB + cooldown)

**Files:**
- Create: `src/lib/catalog/representation.ts`
- Modify: `src/lib/catalog/hydrate-book.ts` (reescritura)
- Modify: los call sites que construyen `HydratableBook` (buscar con `grep -rn "ensureBookHydrated\|HydratableBook" src/`): el select de `books` debe traer además `repr_meta`, `wikidata_id`, `total_pages`, `author`, `title` (quitar `isbn` cuando Task 16 la borre; hasta entonces se mantiene para `resolveWorkKey`).
- Test: `src/lib/catalog/representation.test.ts`

**Interfaces:**
- Consumes: `hydrate_book` v3 (Task 2), `searchInventaireEntities`/`qidFromUri` (Task 5), `findBestVolume`/`findVolumeByIsbn` (Task 7), `fetchRepresentationCandidates` (Task 8).
- Produces en `representation.ts`:
  - `type ReprLang = "es" | "en" | "other"`, `type ReprSource = "openlibrary" | "google_books" | "wikidata" | "manual"`
  - `type ReprMeta = Partial<Record<"title" | "cover" | "synopsis" | "pages", { lang?: string; source?: string }>>`
  - `langRank(lang: string | null | undefined): number` (es→0, en→1, other→2, resto→3)
  - `needsRepresentationReview(hydratedAt: string | null, meta: ReprMeta | null): boolean` — `true` si `hydratedAt === null`, o si (algún campo de title/cover/synopsis falta o tiene `langRank > 0`) y `hydratedAt` es anterior a 30 días (`REVIEW_COOLDOWN_DAYS = 30`).
- Produces en `hydrate-book.ts`: `ensureBookHydrated(supabase, book)` con el mismo contrato externo (idempotente, nunca lanza), `HydratableBook` ampliado: `{ id, openlibrary_work_key, isbn, hydrated_at, repr_meta, wikidata_id, title, author, total_pages }`.

- [ ] **Step 1: Test failing de `representation.ts`**

```ts
import { describe, expect, it } from "vitest";
import { langRank, needsRepresentationReview } from "./representation";

const days = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

describe("langRank", () => {
  it("es<en<other<unknown", () => {
    expect([langRank("es"), langRank("en"), langRank("other"), langRank(undefined)]).toEqual([0, 1, 2, 3]);
  });
});

describe("needsRepresentationReview", () => {
  it("sin hidratar → true", () => expect(needsRepresentationReview(null, null)).toBe(true));
  it("todo ES reciente → false", () =>
    expect(needsRepresentationReview(days(1), {
      title: { lang: "es" }, cover: { lang: "es" }, synopsis: { lang: "es" },
    })).toBe(false));
  it("título EN pero hidratado hace poco → false (cooldown)", () =>
    expect(needsRepresentationReview(days(1), {
      title: { lang: "en" }, cover: { lang: "es" }, synopsis: { lang: "es" },
    })).toBe(false));
  it("título EN e hidratación vieja → true", () =>
    expect(needsRepresentationReview(days(45), {
      title: { lang: "en" }, cover: { lang: "es" }, synopsis: { lang: "es" },
    })).toBe(true));
  it("todo ES pero viejo → false (no hay nada que mejorar)", () =>
    expect(needsRepresentationReview(days(400), {
      title: { lang: "es" }, cover: { lang: "es" }, synopsis: { lang: "es" },
    })).toBe(false));
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** implementar `representation.ts` (puro, sin red). **Step 4: Run** → PASS.

- [ ] **Step 5: Reescribir `ensureBookHydrated`** conservando su forma actual (guard → resolver work key → fetch → RPC → nunca lanza):

```ts
export async function ensureBookHydrated(
  supabase: SupabaseServerClient,
  book: HydratableBook
): Promise<void> {
  try {
    const meta = (book.repr_meta ?? null) as ReprMeta | null;
    if (!needsRepresentationReview(book.hydrated_at, meta)) return;

    let workKey = book.openlibrary_work_key;
    if (!workKey && book.isbn) {
      workKey = await resolveWorkKey(book.isbn);
      if (workKey) {
        await supabase.from("books").update({ openlibrary_work_key: workKey }).eq("id", book.id);
      }
    }

    // Sin work key: puede seguir siendo hidratable por GB (obra GB-only) o al
    // menos reconciliable por Wikidata. Ya no se marca hidratada y punto.
    const work = workKey ? await fetchWork(workKey) : null;
    if (workKey && !work) return; // API caída: reintentar en la próxima visita.

    const authorKey = work?.authorKeys[0];
    const author =
      (authorKey ? (await fetchOpenLibraryAuthorByKey(authorKey))?.name : null) ??
      book.author ?? null;
    const titleForLookups = work?.title ?? book.title ?? null;

    // Candidatas por idioma, en paralelo (spec §2): ediciones OL en vivo,
    // entidad Wikidata (labels + QID), y GB solo después si quedan huecos.
    const [candidates, entities] = await Promise.all([
      workKey
        ? fetchRepresentationCandidates(workKey)
        : Promise.resolve({ es: null, en: null, pagesMedian: null }),
      titleForLookups
        ? searchInventaireEntities(titleForLookups)
        : Promise.resolve([]),
    ]);

    // Entidad fiable = autor verificado (spec §6).
    const entity = entities.find(
      (e) => author && e.authorNames.some((n) => isSameTitle(n, author))
    ) ?? null;
    const qid = entity ? qidFromUri(entity.uri) : null;

    const fields: HydrateFields = {};
    pickField(fields, "title", [
      { value: candidates.es?.title, lang: "es", source: "openlibrary" },
      { value: entity?.labels.es, lang: "es", source: "wikidata" },
      { value: candidates.en?.title, lang: "en", source: "openlibrary" },
      { value: entity?.labels.en, lang: "en", source: "wikidata" },
      { value: work?.title, lang: "other", source: "openlibrary" },
    ]);
    pickField(fields, "cover", [
      { value: candidates.es?.coverUrl, lang: "es", source: "openlibrary" },
      { value: candidates.en?.coverUrl, lang: "en", source: "openlibrary" },
      { value: work?.coverUrl, lang: "other", source: "openlibrary" },
    ]);
    const synopsis = work?.description ?? (workKey ? await fetchFirstEditionDescription(workKey) : null);
    pickField(fields, "synopsis", [{ value: synopsis, lang: synopsisLang(synopsis), source: "openlibrary" }]);

    // GB por campo, solo si el mejor candidato quedó vacío o con rango > 1
    // (spec §4; máx. 2 llamadas por evaluación).
    let gbCalls = 0;
    let gbVolumeId: string | null = null;
    for (const [field, wanted] of [["synopsis", "es"], ["cover", "es"]] as const) {
      if (gbCalls >= 2 || !titleForLookups) break;
      const current = fields[field];
      if (current && langRank(current.lang) <= 1) continue;
      const volume = await findBestVolume(titleForLookups, author, wanted);
      gbCalls += 1;
      if (!volume) continue;
      gbVolumeId = gbVolumeId ?? volume.volumeId;
      const value = field === "synopsis" ? volume.synopsis : volume.coverUrl;
      if (value) fields[field] = { value, lang: wanted, source: "google_books" };
    }

    const genres = work ? mapSubjectsToGenres(work.subjects) : [];
    const { error } = await supabase.rpc("hydrate_book", {
      p_book_id: book.id,
      p_fields: Object.keys(fields).length > 0 ? fields : undefined,
      p_genres: genres.length > 0 ? genres : undefined,
      p_published_year: work?.firstPublishYear ?? undefined,
      p_total_pages: candidates.pagesMedian ?? undefined,
      p_pages_source: candidates.pagesMedian != null ? "openlibrary" : undefined,
      p_wikidata_id: qid ?? undefined,
    });
    if (error) console.error("hydrate_book rpc failed", { bookId: book.id, error });

    if (gbVolumeId) {
      // null → valor; el gate de columnas técnicas lo permite para cualquier rol.
      await supabase.from("books").update({ google_books_volume_id: gbVolumeId })
        .eq("id", book.id).is("google_books_volume_id", null);
    }
  } catch (error) {
    console.error("ensureBookHydrated failed", { bookId: book.id, error });
  }
}
```

Helpers en el mismo fichero (código completo en implementación, comportamiento fijado aquí):
- `pickField(fields, key, options)`: primera opción con `value` no vacío gana; guarda `{value, lang, source}`.
- **Comparación de autor: usa `isSameTitle` de `src/lib/catalog/title-match.ts`.** NO escribas un helper
  nuevo con `normalizeTitleForComparison` + contención bidireccional: esa forma exacta ya se ha
  reintroducido DOS veces en este plan y las dos fue un defecto bloqueante (Task 6 y Task 7). Falla de
  dos maneras: sin cota de longitud, «Ana» casa con «Susana Fortes» (la normalización pega las
  palabras, así que la contención cruza fronteras de palabra); y un autor que normaliza a cadena vacía
  («—», «...») casa con cualquiera, porque `x.includes("")` es siempre true. `isSameTitle` ya trae las
  dos guardas (umbral 65% y rechazo de cadena vacía). Compara nombre a nombre, partiendo por comas,
  para no romper el caso «autor, traductor».
- `synopsisLang(text)`: heurística mínima — `"other"` si `null`; si no, `"en"` (OL casi nunca tiene sinopsis ES; no intentar detectar idioma por contenido — YAGNI, y un falso "es" bloquearía el upgrade de GB).
- `type HydrateFields = Partial<Record<"title" | "cover" | "synopsis", { value: string; lang: ReprLang; source: ReprSource }>>`.

Nota: ~~`google_books_volume_id` es null→valor con el cliente de la petición~~ **— CORREGIDO el
2026-08-28 (condición de merge C1). Esta nota era FALSA y el código la siguió al pie de la letra.**
`authenticated` **no tiene grant de UPDATE** sobre esa columna: nace sin él a propósito en
`20260882`, y así lo dice `docs/DRIFT-CHECK.md` (superficie 6, `books | 17 | 0 | 9`). Con el cliente
de la petición el update devolvía **42501 permission denied for table books** SIEMPRE — sondeado en
dev: 397 filas en `books`, 397 con la columna a null — y como el `await` no destructuraba `error`,
fallaba **sin una sola línea de log** (el modo de fallo de #871, repetido dos líneas por debajo del
arreglo de #871). Se escribe con `createServiceRoleClient()`, igual que la RPC `hydrate_book`, y el
error se registra.

Que «null→valor» esté permitido por el *trigger* no implica que lo esté por los *grants*: son dos
puertas distintas y esta columna solo pasa la primera. Ese fue el atajo mental que produjo la
contradicción — la base siguió a la doc y el código siguió a esta nota, y la superficie 6 no lo cazó
porque compara **números** de grants, no **escritores**.

Consecuencia para el gate de columnas técnicas (patrón S2-14, `20260878`): añadir la columna a ese
gate en Task 16 sigue siendo defensa en profundidad razonable, pero **ya no es lo que la protege** —
hoy la protege la ausencia de grant, que es la puerta anterior y no depende de desplegar nada.

- [ ] **Step 6: Actualizar call sites** de `HydratableBook` (ficha `src/app/libro/[id]/page.tsx`, `src/app/buscar/actions.ts` `hydrateNewItem`, y cualquiera que salga en el grep): ampliar el select con las columnas nuevas.

- [ ] **Step 7:** `npx tsc --noEmit` + `npx vitest run src/lib/catalog` → PASS. Probar en dev browser: abrir la ficha de un libro nuevo desde `/buscar` → título/portada/sinopsis pobladas; segunda visita no re-llama (log).

- [ ] **Step 8: Commit**

```bash
git add src/lib/catalog/representation.ts src/lib/catalog/representation.test.ts src/lib/catalog/hydrate-book.ts src/app/libro/[id]/page.tsx src/app/buscar/actions.ts
git commit -m "feat(catalogo): hidratación v3 con política ES→EN, capa Wikidata y enriquecimiento GB"
```

---

### Task 9bis: Hidratación en LOTE de libros (arregla las shells vacías de la ficha de autor)

**Diagnóstico medido en prod el 2026-08-26.** Abrir la ficha de Brandon Sanderson
creó 87 créditos de libro, y **61 de esas filas de `books` están completamente
vacías**: `title`, `author`, `published_year`, `cover_url` y `hydrated_at` a NULL,
todas con `openlibrary_work_key`. En el catálogo entero de prod hay 268 libros y
**61 shells vacías — el 23% del catálogo, todas de esa única visita**. La ficha de
autor las pinta leyendo `books.title`, así que salen como «Sin título» y sin año.

**Causa:** `hydratePersonCredits` construye los `SearchResult` CON título, año y
portada (`fetchAuthorWorks` los trae: medido, 100/100 con título, 100/100 con
`first_publish_year`, 91/100 con `cover_i`) y `findOrCreateCatalogItemsBulk`
**los tira**: su rama de hidratación arranca con
`if (itemType !== "movie" && itemType !== "series") return;`. El comentario lo
justifica diciendo que el lote «rara vez trae sinopsis de libro» — cierto para la
sinopsis, falso para título/año/portada, que son justo lo que la ficha de autor
enseña.

**Por qué esto pertenece a ESTE plan y no se arregló antes:** hidratar libros en
lote con la `hydrate_book` vieja habría sido un tiro en el pie — escribiría el
título y marcaría `hydrated_at`, congelando para siempre un título posiblemente
inglés y dejando la obra sin sinopsis ni géneros. Es el modo de fallo exacto de
#730. Con `repr_meta` + fill-or-upgrade (Task 2) escribir el título del lote es
seguro: queda etiquetado con su idioma y la visita a la ficha lo MEJORA si
encuentra candidata española. La pieza nueva es la que hace posible el arreglo.

**Files:**
- Create: `supabase/migrations/20260889_repr_g_hydrate_books_bulk.sql`
- Modify: `src/lib/catalog/openlibrary/normalize.ts` (regla 4 expone el idioma elegido)
- Modify: `src/lib/catalog/openlibrary/author-books.ts` (propaga `titleLang`)
- Modify: `src/lib/catalog/types.ts` (`SearchResult.titleLang`)
- Modify: `src/lib/catalog/find-or-create.ts` (deja de saltarse los libros)
- Modify: `scripts/reconcile-wikidata.ts` (Task 15) — añadir el modo `--backfill-shells`
- Test: `src/lib/catalog/openlibrary/normalize.test.ts` (ampliar), `src/lib/catalog/find-or-create.test.ts`

**Interfaces:**
- Consumes: `repr_lang_rank` y la regla de escritura de Task 2.
- Produces:
  - SQL: `repr_should_write(p_current text, p_meta jsonb, p_field text, p_lang text) returns boolean` — **única implementación de la regla** (curación manda; luego vacío o mejora estricta de rango). `hydrate_book` de Task 2 se refactoriza para llamarla, de modo que no existan dos copias de la regla.
  - SQL: `hydrate_books_bulk(p_rows jsonb) returns void` — cada fila `{book_id, title, title_lang, author, cover_url, cover_lang, published_year}`. Fill-or-upgrade por campo. **NO toca `hydrated_at`** (ver abajo).
  - TS: `NormalizedWork` gana `titleLang: "es" | "en" | "other"`; `SearchResult` gana `titleLang?: "es" | "en" | "other"` (solo libros).

**`hydrated_at` se queda NULL a propósito.** El lote solo tiene título, autor,
año y portada — no sinopsis, géneros, páginas orientativas ni QID. Si marcara la
obra como hidratada, la ficha nunca completaría el resto (y con el cooldown de
`needsRepresentationReview` tardaría 30 días en reconsiderarlo). Dejándolo NULL:
la ficha hace su trabajo completo en la primera visita, y como es fill-or-upgrade
no destruye lo que el lote escribió — lo mejora si puede.

**Seguridad (#674):** escribir canónicos aquí NO reabre el envenenamiento del
catálogo. Es el mismo argumento que ya justifica que el lote de película/serie sí
use los canónicos del `SearchResult`: el origen es una llamada de SERVIDOR a
OpenLibrary por `author_key`, sin un solo campo procedente del cliente. Y la RPC
es fill-or-upgrade, así que tampoco podría pisar una curación aunque quisiera.

- [ ] **Step 1: Test failing en `normalize.ts`** — la regla 4 debe declarar de dónde salió el título:

```ts
it("declara el idioma del título elegido", () => {
  const [work] = normalizeAuthorWorks(
    [{ key: "/works/OL1W", title: "Words of Radiance", language: ["spa", "eng"], edition_count: 23,
       editions: { docs: [{ title: "Palabras Radiantes", language: ["spa"] }] } }],
    [{ key: "/works/OL1W", title: "Words of Radiance", language: ["spa", "eng"], edition_count: 23,
       editions: { docs: [{ title: "Words of Radiance", language: ["eng"] }] } }]
  );
  expect(work.title).toBe("Palabras Radiantes");
  expect(work.titleLang).toBe("es");
});

it("marca 'other' cuando cae al título de la obra", () => {
  const [work] = normalizeAuthorWorks(
    [{ key: "/works/OL2W", title: "Elantris", language: ["eng"], edition_count: 5 }], []
  );
  expect(work.titleLang).toBe("other");
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/catalog/openlibrary/normalize.test.ts` → FAIL (`titleLang` no existe).

- [ ] **Step 3: Implementar** en `normalize.ts` regla 4, sustituyendo la línea `const title = entry.es ?? entry.en ?? workTitle;` por:

```ts
    // 4. Título: español, si no inglés, si no el de la obra. El IDIOMA elegido
    //    viaja con él: la hidratación en lote lo necesita para etiquetar
    //    repr_meta y que una visita posterior a la ficha pueda mejorarlo
    //    (spec 2026-08-26 §2). Sin esta etiqueta, un título inglés escrito por
    //    el lote sería indistinguible de uno curado y quedaría congelado.
    const title = entry.es ?? entry.en ?? workTitle;
    const titleLang: "es" | "en" | "other" = entry.es ? "es" : entry.en ? "en" : "other";
```

y añadirlo al objeto `work` que se empuja a `candidates` (y al type `NormalizedWork`). Hacer el mismo cambio en `search-normalize.ts` regla 5, poblando `titleLang` en el `SearchResult` que devuelve — misma línea, y así los dos normalizadores coinciden.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Migración** `20260889_repr_g_hydrate_books_bulk.sql`:

```sql
-- La regla de escritura de la representación, en UN solo sitio: la usan
-- hydrate_book (una obra, ficha) y hydrate_books_bulk (lote, bibliografía de
-- autor). Dos copias de esta regla se desincronizan en el primer arreglo.
create or replace function public.repr_should_write(
  p_current text, p_meta jsonb, p_field text, p_lang text
) returns boolean language sql immutable as $$
  select case
    when coalesce(p_meta -> p_field ->> 'source', '') = 'manual' then false
    when p_current is null or p_current = '' then true
    else public.repr_lang_rank(p_lang) < public.repr_lang_rank(p_meta -> p_field ->> 'lang')
  end;
$$;

-- Hidratación en LOTE de libros (spec 2026-08-26; arregla las shells vacías que
-- deja la ficha de autor). Hermana de hydrate_screens_bulk. Escribe SOLO lo que
-- la bibliografía sabe —título, autor, año, portada— y NO toca hydrated_at: la
-- obra sigue pendiente de su hidratación completa (sinopsis, géneros, páginas,
-- QID) en la primera visita a su ficha, que además puede MEJORAR estos valores.
create or replace function public.hydrate_books_bulk(p_rows jsonb)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  v_row public.books%rowtype;
  v_meta jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  perform set_config('app.hydrating', 'on', true);

  for r in select * from jsonb_array_elements(p_rows) loop
    select * into v_row from public.books where id = (r ->> 'book_id')::uuid;
    continue when not found;
    v_meta := coalesce(v_row.repr_meta, '{}'::jsonb);

    if (r ->> 'title') is not null and (r ->> 'title_lang') in ('es','en','other')
       and public.repr_should_write(v_row.title, v_meta, 'title', r ->> 'title_lang') then
      v_row.title := left(r ->> 'title', 300);
      v_meta := v_meta || jsonb_build_object('title',
        jsonb_build_object('lang', r ->> 'title_lang', 'source', 'openlibrary'));
    end if;

    if (r ->> 'cover_url') is not null and (r ->> 'cover_lang') in ('es','en','other')
       and public.repr_should_write(v_row.cover_url, v_meta, 'cover', r ->> 'cover_lang') then
      v_row.cover_url := left(r ->> 'cover_url', 2000);
      v_meta := v_meta || jsonb_build_object('cover',
        jsonb_build_object('lang', r ->> 'cover_lang', 'source', 'openlibrary'));
    end if;

    -- Sin dimensión de idioma: fill-only de siempre.
    if (v_row.author is null or v_row.author = '') and (r ->> 'author') is not null then
      v_row.author := left(r ->> 'author', 200);
    end if;
    if v_row.published_year is null and (r ->> 'published_year') is not null then
      v_row.published_year := (r ->> 'published_year')::integer;
    end if;

    update public.books
       set title = v_row.title, author = v_row.author,
           cover_url = v_row.cover_url, published_year = v_row.published_year,
           repr_meta = v_meta
     where id = v_row.id;
  end loop;

  perform set_config('app.hydrating', 'off', true);
end;
$$;

revoke all on function public.hydrate_books_bulk(jsonb) from public;
revoke execute on function public.hydrate_books_bulk(jsonb) from anon;
grant execute on function public.hydrate_books_bulk(jsonb) to authenticated;

comment on function public.hydrate_books_bulk is
  'Hidratación en lote de libros desde la bibliografía de autor (spec 2026-08-26). Fill-or-upgrade vía repr_should_write. NO marca hydrated_at: la ficha completa sinopsis/géneros/páginas/QID después y puede mejorar estos valores.';
```

En la misma migración, **refactorizar `hydrate_book` (Task 2) para que use `repr_should_write`** en vez de su copia inline de la condición — misma semántica, una sola implementación. `drop function` + `create` como siempre.

- [ ] **Step 6: Aplicar en dev y probar** con dos filas sembradas: una shell vacía (debe rellenarse) y una con título ES ya puesto (un título EN del lote NO debe pisarlo). Verificar que `hydrated_at` sigue NULL en ambas.

- [ ] **Step 7: `find-or-create.ts`** — la rama que hoy dice:

```ts
      if (itemType !== "movie" && itemType !== "series") return;
```

pasa a derivar a la RPC de libros:

```ts
      if (itemType === "book") {
        // Título, autor, año y portada SÍ vienen en la bibliografía y son justo
        // lo que la ficha de autor pinta; tirarlos dejaba shells vacías («Sin
        // título», sin año) — 61 de 268 libros del catálogo de prod el
        // 2026-08-26, todas de una sola visita. Sinopsis y géneros no vienen, y
        // por eso la RPC NO marca hydrated_at: los completa la ficha.
        const bookRows = externalIds
          .map((externalId) => {
            const result = bucket.get(externalId)!;
            const bookId = map.get(`book:${externalId}`);
            if (!bookId) return null;
            return {
              book_id: bookId,
              title: result.title || null,
              title_lang: result.titleLang ?? "other",
              author: result.subtitle,
              cover_url: result.coverUrl,
              cover_lang: "other",
              published_year: result.year,
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);
        if (bookRows.length === 0) return;
        try {
          const { error } = await supabase.rpc("hydrate_books_bulk", { p_rows: bookRows });
          if (error) console.error("hydrate_books_bulk failed", { count: bookRows.length, error });
        } catch (error) {
          console.error("hydrate_books_bulk failed", { count: bookRows.length, error });
        }
        return;
      }
      if (itemType !== "movie" && itemType !== "series") return;
```

(`cover_lang: "other"`: la portada del doc de búsqueda es la del work, no la de una edición de idioma conocido — se etiqueta como el fallback que es, para que la ficha pueda mejorarla con una portada española.)

Actualizar el comentario de cabecera del módulo, que hoy afirma «Los libros SOLO se registran (shell), nunca se hidratan aquí».

- [ ] **Step 8: Test** de `find-or-create` con supabase mockeado: un lote de 2 libros llama a `hydrate_books_bulk` con las filas mapeadas y `title_lang` propagado. Run → PASS.

- [ ] **Step 9: Backfill de las 61 shells existentes.** No se arreglan solas: `credits_hydrated_at` de Sanderson ya está puesto, así que la bibliografía no se vuelve a pedir, y nadie va a abrir 61 fichas. Añadir a `scripts/reconcile-wikidata.ts` el modo `--backfill-shells`:
  1. `select` de personas con `openlibrary_key` que tengan créditos de libro apuntando a filas con `title is null`.
  2. Por persona (throttle 1/s): `fetchAuthorWorks(openlibraryKey)` — 2 llamadas, y devuelve exactamente los datos que se tiraron, ya con el título ES-preferente.
  3. Casar por `openlibrary_work_key` con las shells vacías y llamar a `hydrate_books_bulk` en tandas de 50.
  4. Las shells vacías que no cuelguen de ninguna persona con clave OL (hoy: cero) se listan al final para revisión manual.

  La RPC es **solo para `service_role`** (decisión de la revisión de Task 2, ver «Endurecimiento» más abajo), así que el script usa `SUPABASE_SERVICE_ROLE_KEY` de `.env.local` — el mismo cliente que ya usa para leer. No hace falta ningún token de usuario.

- [ ] **Step 10: Ejecutar el backfill** en dev, luego en prod. Verificar en prod:

```sql
select count(*) filter (where title is null) as vacias, count(*) as total from public.books;
```

Expected: `vacias` cae de 61 a ~0. Anotar la cifra final.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/20260889_repr_g_hydrate_books_bulk.sql src/lib/catalog/openlibrary/normalize.ts src/lib/catalog/openlibrary/search-normalize.ts src/lib/catalog/openlibrary/author-books.ts src/lib/catalog/types.ts src/lib/catalog/find-or-create.ts scripts/reconcile-wikidata.ts
git commit -m "fix(catalogo): la bibliografía de autor hidrata sus libros en lote (61 shells vacías en prod)"
```

---

### Task 10: Muerte del sync masivo de ediciones

**Files:**
- Delete: `src/lib/editions/sync-editions.ts`
- Modify: `src/lib/editions/load-editions.ts`, `src/app/libro/[id]/page.tsx` (quitar `editions_synced_at` del select y el `canSync`), `src/lib/catalog/edit-actions.ts` (`resyncEditions` → `reevaluateRepresentation`)
- Test: los tests que referencien `sync-editions` (grep) se borran o reescriben.

**Interfaces:**
- Produces: `loadBookEditions(supabase, bookId: string): Promise<Edition[]>` — solo lee persistidas (`getEditions`), sin sync. `reevaluateRepresentation(bookId)` (server action colaborador+): `update books set hydrated_at = null where id = …` con el cliente de la petición (reescritura valor→null: la permite el gate S2-14 a colaborador+) y llama a `ensureBookHydrated` inmediatamente.

- [ ] **Step 1:** Borrar `sync-editions.ts`. `load-editions.ts` queda:

```ts
import type { createClient } from "@/lib/supabase/server";
import type { Edition } from "./types";
import { getEditions } from "./get-editions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Solo tiradas IDENTIFICADAS (spec 2026-08-26 §1): elegidas en el picker,
// escaneadas por ISBN o creadas por un colaborador. El sync masivo desde OL
// murió con el spec de representación; las candidatas se consultan en vivo.
export async function loadBookEditions(
  _supabase: SupabaseServerClient,
  bookId: string
): Promise<Edition[]> {
  return getEditions("book", bookId, true);
}
```

(Si tras esto el parámetro `supabase` no lo usa nadie, simplificar la firma y sus call sites.)

- [ ] **Step 2:** `resyncEditions` en `edit-actions.ts` se renombra a `reevaluateRepresentation`: mismo gate colaborador+, cuerpo = poner `hydrated_at = null` y re-lanzar `ensureBookHydrated` con la fila releída. Actualizar el componente de la ficha de edición que lo invoca (grep `resyncEditions`).

- [ ] **Step 3:** `grep -rn "editions_synced_at\|ensureBookEditions\|sync-editions" src/ e2e/` → cero referencias vivas (la columna sigue en BD hasta fase C, pero el código ya no la lee).

- [ ] **Step 4:** `npx tsc --noEmit` + `npx vitest run` → PASS. Commit:

```bash
git add -A src/lib/editions src/lib/catalog/edit-actions.ts src/app/libro
git commit -m "feat(ediciones): muere el sync masivo; las ediciones persistidas son solo las identificadas"
```

---

### Task 11: Búsqueda por ISBN contra ediciones + fallback GB

**Files:**
- Modify: `src/lib/catalog/local-search.ts` (`findLocalBookByIsbn` → join con `book_editions`), `src/lib/catalog/search.ts` (rama ISBN con GB), `src/lib/catalog/find-or-create.ts` (alta GB-only + edición explícita)
- Test: `src/lib/catalog/local-search.test.ts` (si no existe, cubrir al menos el mapeo en un test de la rama ISBN de `search.ts` con mocks)

**Interfaces:**
- Consumes: `findVolumeByIsbn` (Task 7), `register_catalog_item_by_volume` (Task 3).
- Produces: `SearchResult` de ISBN-GB con `externalId: ""`, `googleVolumeId: string` (campo nuevo en `SearchResult`, comentado como «solo camino ISBN-GB»), `matchedIsbn`. `findOrCreateCatalogItem` decide la RPC de alta: work key → `register_catalog_item`; sin work key y con `googleVolumeId` → `register_catalog_item_by_volume`.

- [ ] **Step 1:** `findLocalBookByIsbn` pasa a:

```ts
export async function findLocalBookByIsbn(
  supabase: SupabaseServerClient,
  isbn: string
): Promise<SearchResult | null> {
  // El ISBN vive en book_editions (spec §1): books.isbn está muerta y cae en
  // la fase destructiva. inner join: una edición huérfana no es un resultado.
  const { data } = await supabase
    .from("book_editions")
    .select(`isbn, book:books!inner(${BOOK_COLUMNS})`)
    .eq("isbn", isbn)
    .limit(1)
    .maybeSingle();
  if (!data?.book) return null;
  return { ...mapBookRow(data.book as BookRow), matchedIsbn: isbn };
}
```

(`mapBookRow` deja de leer `row.isbn` — quitar ese campo de `BookRow` y de `BOOK_COLUMNS`.)

- [ ] **Step 2:** Rama ISBN de `searchCatalog`:

```ts
    if (isbn) {
      const cached = await findLocalBookByIsbn(supabase, isbn);
      if (cached) return [cached];

      const found = await lookupIsbn(isbn);
      if (found) return [found];

      // Último recurso (spec §4): el ISBN identifica; si OL no lo conoce y GB
      // sí, la obra nace GB-only, sin work key.
      const volume = await findVolumeByIsbn(isbn);
      if (!volume?.title) return [];
      return [{
        itemType: "book",
        externalId: "",
        googleVolumeId: volume.volumeId,
        title: volume.title,
        subtitle: volume.authors.join(", ") || null,
        coverUrl: volume.coverUrl,
        year: null,
        synopsis: volume.synopsis,
        genres: null,
        matchedIsbn: isbn,
      }];
    }
```

- [ ] **Step 3:** `findOrCreateCatalogItem`: si `result.itemType === "book"` y `!result.externalId` y `result.googleVolumeId`, alta por `register_catalog_item_by_volume`; el resto igual. `ensureBookEdition` **se queda solo en este flujo con `matchedIsbn`** (búsqueda explícita por ISBN — escáner, tecleo, GB-only): es el único automatismo superviviente (spec §3). El alta por clic de una búsqueda por texto no trae `matchedIsbn`, así que no registra nada — comportamiento ya correcto, documentarlo en el comentario de `ensureBookEdition`.

- [ ] **Step 4:** `npx tsc --noEmit` + tests → PASS. Probar en dev: buscar el ISBN `9788410138407` (OL lo desconoce) → tarjeta GB-only; añadirla → fila en `books` con `google_books_volume_id` y edición con ese ISBN.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/local-search.ts src/lib/catalog/search.ts src/lib/catalog/find-or-create.ts src/lib/catalog/types.ts
git commit -m "feat(busqueda): ISBN contra book_editions y alta GB-only de último recurso"
```

---

### Task 12: Precedencia de páginas a 2 niveles (muerte de la primaria en código)

**Files:**
- Modify: `src/lib/editions/edition-label.ts` (borrar `primaryEdition`), `src/lib/sessions/actions.ts`, `src/lib/sessions/load-context.ts`, `src/components/detail/log-panel.tsx`, `src/lib/library/get-library-items.ts`, `src/lib/pace/fetch-catalog-meta.ts`, `src/app/libro/[id]/page.tsx` (rail de PC)
- Create: `supabase/migrations/20260888_widget_snapshot_two_level.sql` (reescribir la función del snapshot del widget quitando el peldaño de primaria — leer antes `20260806_widget_snapshot_edition_pages.sql` y conservar el resto del cuerpo tal cual)
- Delete: `src/lib/passes/edition-choice.ts` y su lector en `log-panel.tsx` (código muerto verificado)
- Test: ajustar los tests de esos módulos que mencionen `primaryEdition`/`is_primary` (grep)

**Interfaces:**
- Produces: precedencia única en todo el código: `edición del pase → books.total_pages`. Nueva helper donde haga falta:

```ts
// Precedencia de páginas (spec 2026-08-26 §5): la edición que el usuario
// IDENTIFICÓ manda; sin ella, las páginas orientativas de la obra. La
// "edición primaria" murió: ya no hay tercer peldaño.
export function pagesForPass(
  passEdition: { totalPages: number | null } | null,
  workTotalPages: number | null
): number | null {
  return passEdition?.totalPages ?? workTotalPages ?? null;
}
```

(colocarla en `src/lib/editions/edition-label.ts` sustituyendo a `primaryEdition`).

- [ ] **Step 1:** `grep -rn "primaryEdition\|is_primary\|isPrimary" src/ supabase/ e2e/` — inventario de sitios. En cada consumidor: sustituir el fallback `?? primaryEdition(editions)` por el paso directo a `books.total_pages` (o `pagesForPass`). En `fetch-catalog-meta.ts` quitar TAMBIÉN el tercer nivel «cualquier edición con páginas».

- [ ] **Step 2:** Rail de PC (`libro/[id]/page.tsx:236` aprox.): alinear con `pagesForPass` (si el pase abierto tiene edición, sus páginas; si no, `book.total_pages`).

- [ ] **Step 3:** `Edition` type: quitar `isPrimary` cuando ya nadie lo lea (get-editions, edition-strip, edition-picker — grep). Las tiras/pickers dejan de destacar «principal».

- [ ] **Step 4:** Migración del widget (`apply_migration` en dev): copiar la función de `20260806_widget_snapshot_edition_pages.sql` cambiando solo la precedencia (fuera el `is_primary`); verificar `pg_get_functiondef` en dev.

- [ ] **Step 5:** Borrar `src/lib/passes/edition-choice.ts` y el efecto lector en `log-panel.tsx` (bloque ~625–644).

- [ ] **Step 6:** `npx tsc --noEmit` + `npx vitest run` → PASS. QA en dev: registrar sesión de un pase sin edición en un libro con `total_pages` → el % usa las orientativas.

- [ ] **Step 7: Commit**

```bash
git add -A src/lib src/components src/app supabase/migrations/20260888_widget_snapshot_two_level.sql
git commit -m "feat(progreso): precedencia de páginas a 2 niveles; muere la edición primaria en código"
```

---

### Task 13: Picker de edición con candidatas OL en vivo

**Files:**
- Create: `src/lib/editions/fetch-candidates.ts` (server action / loader)
- Modify: `src/components/detail/edition-picker.tsx`, `src/components/detail/log-panel.tsx` (CTA), `messages/es.json` (+ resto de locales vía i18n-keeper)
- Test: `src/lib/editions/fetch-candidates.test.ts`

**Interfaces:**
- Consumes: `fetchWorkEditions`/filtros de `editions.ts` (Task 8), `register_book_edition` RPC, `setPassEdition` (`src/lib/passes/actions.ts`).
- Produces:
  - `type EditionCandidate = { isbn: string; label: string; publisher: string | null; year: number | null; pages: number | null; coverUrl: string | null; language: string | null }`
  - `fetchEditionCandidates(bookId: string): Promise<EditionCandidate[]>` — lee `openlibrary_work_key` de la obra; sin key → `[]`; con key → ediciones OL en vivo (mismos filtros, orden ES→EN→resto, máx. 30), **sin escribir en BD**; excluye ISBNs ya persistidos en `book_editions` del libro.
  - `chooseEditionCandidate(passId: string, bookId: string, candidate: EditionCandidate): Promise<{ok: true} | {ok: false; reason: string}>` — server action: `register_book_edition` con los datos de la candidata + `setPassEdition` con el id resultante (si la RPC devuelve NULL por conflicto, re-selecciona la edición por `(book_id, isbn)`).

- [ ] **Step 1: Test failing** de `fetchEditionCandidates` (mocks de red + supabase): sin work key → `[]`; con key → mapea, filtra persistidas, cap 30.

- [ ] **Step 2: Run** → FAIL. **Step 3:** implementar. **Step 4: Run** → PASS.

- [ ] **Step 5: UI.** `EditionPicker`: tres bloques en este orden — (1) ediciones persistidas del libro (destacando las usadas en pases, comportamiento actual), (2) CTA principal «Escanea o teclea el ISBN» (navega a `/buscar?type=book` con el teclado ISBN / escáner nativo como hoy), (3) «Más ediciones (OpenLibrary)» — lista de candidatas cargada perezosamente al expandir (`fetchEditionCandidates`), cada una con botón que llama a `chooseEditionCandidate`. «No lo sé» intacto. Claves i18n nuevas (`editionPicker.scanCta`, `editionPicker.moreFromOpenLibrary`, `editionPicker.candidateHint`) — pasar el subagente i18n-keeper tras el cambio de copy.

- [ ] **Step 6:** QA en dev (qa-verifier): abrir libro con work key, picker → candidatas visibles, elegir una → aparece en `book_editions` y el pase la referencia. Verificar que abrir la ficha NO crea ediciones.

- [ ] **Step 7: Commit**

```bash
git add src/lib/editions/fetch-candidates.ts src/lib/editions/fetch-candidates.test.ts src/components/detail/edition-picker.tsx src/components/detail/log-panel.tsx messages/
git commit -m "feat(ediciones): picker con candidatas OL en vivo, persistiendo solo la elegida"
```

---

### Task 14: Import CSV con edición

**Files:**
- Modify: `src/lib/import/match-row.ts` (pasar `userId` a `findOrCreateCatalogItem`), `src/lib/import/commit-row.ts` (escribir `edition_id` en el pase cuando la fila casó por ISBN)
- Test: ampliar el test existente del importador (grep `match-row` en tests) con el caso «fila con ISBN → pase con edition_id».

**Interfaces:**
- Consumes: `findOrCreateCatalogItem` (que ya registra la edición si hay `matchedIsbn` + `userId`), `setPassEdition` o update directo del pase en el mismo insert.
- Produces: fila de Goodreads con ISBN → obra + `book_edition` + `passes.edition_id` poblado. Fila sin ISBN → obra sola, `edition_id NULL`.

- [ ] **Step 1: Test failing** (fixture de fila con ISBN13): tras el commit de la fila, el pase insertado lleva `edition_id` de la edición con ese ISBN.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3:** `match-row.ts`: el call site del importador recibe/propaga `userId` (viene de la sesión del import — grep quien llama a `matchBook`). `commit-row.ts`: tras crear el pase, si el match trae `matchedIsbn`, resolver `book_editions.id` por `(book_id, isbn)` y escribir `edition_id` (mismo patrón que `setPassEdition`; el trigger de integridad ya valida obra↔edición).
- [ ] **Step 4: Run** → PASS. Commit:

```bash
git add src/lib/import/
git commit -m "fix(import): el ISBN de la fila registra su edición y la asocia al pase"
```

---

### Task 15: Barrido de reconciliación QID + fusión de duplicados existentes

**Files:**
- Create: `scripts/reconcile-wikidata.ts` (script Node, se ejecuta a mano con `npx tsx`, env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` de `.env.local`)

**Interfaces:**
- Consumes: `searchInventaireEntities`/`qidFromUri` (Task 5), `merge_book_into` (Task 4).
- Produces: barrido en dos modos:
  - `--dry-run` (default): para cada fila de `books` sin `wikidata_id`, resuelve entidad por título+autor (autor verificado, regla del spec §6); imprime tabla `book_id | title | qid | acción` donde acción ∈ `set-qid` | `merge-into:<id>` | `sin-match`. NO escribe.
  - `--apply`: ejecuta los `set-qid` (update directo con service role) y los `merge-into` (RPC `merge_book_into`; el ganador = fila con más pases, empate → más antigua). Los merges que aborten se listan al final para revisión manual.
  - Throttle: 1 req/s contra Inventaire (respetar la API pública).

- [ ] **Step 1:** Escribir el script (estructura):

```ts
import { createClient } from "@supabase/supabase-js";
import { searchInventaireEntities, qidFromUri } from "../src/lib/catalog/inventaire/client";
// (si el import de src/ no resuelve fuera de Next, duplicar aquí el cliente
// mínimo de Inventaire — 60 líneas — antes que montar un build especial)

const apply = process.argv.includes("--apply");
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: books } = await supabase
    .from("books")
    .select("id, title, author, wikidata_id")
    .is("wikidata_id", null)
    .not("title", "is", null);

  const plan: Array<{ id: string; title: string; qid: string | null; action: string }> = [];
  const qidOwner = new Map<string, string>(); // qid -> book_id ya asignado (BD o este plan)
  const { data: withQid } = await supabase.from("books").select("id, wikidata_id").not("wikidata_id", "is", null);
  for (const row of withQid ?? []) qidOwner.set(row.wikidata_id!, row.id);

  for (const book of books ?? []) {
    await new Promise((r) => setTimeout(r, 1000));
    const entities = await searchInventaireEntities(book.title!);
    const entity = entities.find((e) =>
      book.author && e.authorNames.some((n) => isSameTitle(n, book.author!))
    );
    const qid = entity ? qidFromUri(entity.uri) : null;
    if (!qid) { plan.push({ id: book.id, title: book.title!, qid: null, action: "sin-match" }); continue; }
    const owner = qidOwner.get(qid);
    if (owner) plan.push({ id: book.id, title: book.title!, qid, action: `merge-into:${owner}` });
    else { qidOwner.set(qid, book.id); plan.push({ id: book.id, title: book.title!, qid, action: "set-qid" }); }
  }
  console.table(plan);
  if (!apply) return;
  // aplicar: updates set-qid; merges con ganador por nº de pases (consultar
  // passes por item_id), vía rpc merge_book_into; recoger aborts.
}
main();
```

(El bloque de `--apply` se completa en la implementación; la comparación de autor usa `isSameTitle` de `src/lib/catalog/title-match.ts`, igual que Task 6 y Task 9 —escribir un helper propio con contención bidireccional ha sido un defecto bloqueante dos veces—; el ganador del merge se decide consultando `count(*)` de pases por obra — más pases gana, empate → `created_at` más antiguo.)

- [ ] **Step 2:** `npx tsx scripts/reconcile-wikidata.ts` (dry-run) contra **dev**. Revisar la tabla A MANO: ningún `merge-into` sospechoso.

- [ ] **Step 3:** `--apply` en dev. Verificar: los duplicados sembrados/conocidos se fusionan; pases intactos (`count` antes/después).

- [ ] **Step 4:** Dry-run contra **prod**, pegar la tabla en el chat para revisión del dueño, y solo tras su OK: `--apply` en prod. Esperado con los datos de hoy: las dos filas de Midnight Library se fusionan (la manual pierde — 0 pases ambas, gana la más antigua no: gana por criterio; revisar a mano) y su ISBN 9788410138407 sobrevive como edición.

- [ ] **Step 5: Commit**

```bash
git add scripts/reconcile-wikidata.ts
git commit -m "feat(catalogo): barrido de reconciliación QID y fusión de duplicados"
```

---

### Task 16: Fase C — purga y drops (SOLO tras deploy verde en prod)

**Files:**
- Create: `supabase/migrations/20260893_repr_k_purge_editions.sql`
- Create: `supabase/migrations/20260894_repr_l_drops.sql`

**Gate:** no empezar hasta que fase B esté desplegada en prod y estable (búsqueda, ficha, picker, import verificados en prod). Confirmar con el dueño en el chat antes de aplicar en prod.

> ⚠️ **Comprueba los números antes de crear estos ficheros.** Ya se han renumerado dos veces durante
> la ejecución: los prefijos que este plan reservaba originalmente (`20260884`…`20260891`) los fueron
> ocupando las migraciones que salieron de las revisiones. Haz `ls supabase/migrations/ | tail` y usa
> el siguiente libre. Esto importa **aquí más que en ninguna otra tarea**, porque es la fase que
> borra y se ejecuta contra producción.

- [ ] **Step 1: Purga conservadora** (`20260893_repr_k_purge_editions.sql`):

```sql
-- Purga conservadora (spec §7 fase c): fuera las ediciones del sync masivo que
-- nadie referencia. Se conservan: referenciadas por pases, y las creadas por
-- colaborador/admin (curación). Ante duda, conservar.
delete from public.book_editions e
where not exists (select 1 from public.passes p where p.edition_id = e.id)
  and not exists (
    select 1 from public.profiles pr
    where pr.id = e.created_by and pr.role in ('collaborator','admin')
  );
```

Antes de aplicar: `select count(*)` con el mismo `where` en dev y prod, y anotar la cifra en el mensaje del commit. Comprobar si alguna tabla más referencia `book_editions.id` (`select conrelid::regclass from pg_constraint where confrelid = 'public.book_editions'::regclass` + grep `edition_id` en el esquema) y añadir esos `not exists` si aparecen.

- [ ] **Step 1bis (NUEVO, va ANTES de los drops): sembrar las ediciones que solo viven en `books.isbn`.**

Descubierto al ejecutar la Task 11 (issue [#898](https://github.com/borjar20/Biblioshare/issues/898)):
hay libros con `books.isbn` relleno y **ninguna fila en `book_editions`** — típicamente altas
manuales o importaciones anteriores a esta pieza. Desde la Task 11 la búsqueda local por ISBN va
contra `book_editions`, así que esos libros **ya no se encuentran por su ISBN**, y al dropear la
columna se perdería el dato para siempre.

Antes de cualquier `drop`, sembrar la edición que falta a partir de la propia obra:

```sql
-- El ISBN de books era el espejo de la edición primaria. Donde no hay ninguna
-- edición con ese ISBN, la fila de books ES la única constancia de esa tirada:
-- se materializa como edición antes de que la columna desaparezca.
insert into public.book_editions (book_id, label, isbn, publisher, published_year, total_pages, cover_url)
select b.id, 'Edición principal', b.isbn, b.publisher, b.published_year, b.total_pages, b.cover_url
  from public.books b
 where b.isbn is not null and btrim(b.isbn) <> ''
   and not exists (select 1 from public.book_editions e where e.book_id = b.id and e.isbn = b.isbn);
```

Contar antes y después, y dejar la cifra en el mensaje del commit. **Ojo con el orden dentro de la
propia fase**: esto va antes de la purga del Step 1 (si no, la purga borraría lo recién sembrado por
no estar referenciado por ningún pase) — o bien se excluyen estas filas de la purga. Decídelo a
propósito y déjalo escrito.

- [ ] **Step 1ter (NUEVO, BLOQUEANTE): ningún código puede seguir escribiendo `books.isbn` ni
      `books.publisher` cuando caiga el `drop`.** Un `insert`/`update` sobre una columna que ya no
      existe es un **`42703` en producción**, no una degradación. Inventario hecho el 2026-08-27
      (rehazlo antes de dropear, puede haber crecido):

  Son **TRES** caminos, no dos, y son código duplicado entre sí (el comentario de uno dice
  literalmente «misma forma por tipo que `commitManualImportRow`»). El primer inventario de este
  plan citaba una línea atribuyéndola a la función equivocada; corregido tras la revisión de la
  Task 14:

  - **`src/lib/import/commit-row.ts:336-352`** — `commitManualImportRow` (alta manual desde una fila
    del CSV que no casó): escribe `publisher` e `isbn` en `books` y **nunca registra la edición**.
    Issue [#910](https://github.com/borjar20/Biblioshare/issues/910).
  - **`src/app/importar/actions.ts:258-272`** — `resolvePendingRow` (la cola de revisión del
    colaborador): **el mismo insert crudo**, y tampoco registra edición. Verificado además que la
    RPC `resolve_pending_import` no toca `edition_id` en ningún punto. Este es el que faltaba.
  - **`register_manual_catalog_item`** escribe `p_isbn`/`p_publisher` en `books`.

  Los tres hay que migrarlos al camino único: crear la obra y registrar la tirada con
  `register_book_edition`.
  La redefinición de `register_manual_catalog_item` ya estaba prevista en esta fase: hazla **antes**
  del `drop`, no después.

  Comando para rehacer el inventario:

  ```sh
  grep -rn "isbn\|publisher" src/ --include=*.ts --include=*.tsx | grep -v "book_editions\|matchedIsbn\|test"
  grep -rn "books.isbn\|books.publisher" supabase/migrations/ | tail -20
  ```

  Y comprobar en la base qué funciones las tocan todavía:

  ```sql
  select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.prosrc like '%books%isbn%' or p.prosrc like '%books%publisher%');
  ```

- [ ] **Step 2: Drops** (`20260894_repr_l_drops.sql`):

```sql
drop trigger if exists books_create_primary_edition on public.books;
drop trigger if exists ensure_primary_book_edition on public.book_editions;
-- (comprobar los nombres reales de trigger/función en pg_trigger antes; las
--  funciones asociadas se dropean también si nadie más las usa)
drop index if exists book_editions_one_primary;
alter table public.book_editions drop column if exists is_primary;
alter table public.books drop column if exists editions_synced_at;
alter table public.books drop column if exists isbn;
alter table public.books drop column if exists publisher;
```

Además, en la misma migración: ajustar el gate de columnas técnicas (`20260878`) — quitar `editions_synced_at` de su lista y **añadir `google_books_volume_id` y `wikidata_id`** (~~transición null→valor libre, reescritura colaborador+~~ — **matizado el 2026-08-28, C1:** ninguna de las dos tiene grant de `authenticated`, así que hoy el cliente no puede escribirlas ni en null→valor; añadirlas al gate es defensa en profundidad por si algún día se concede el grant, no lo que las protege), y revisar `register_manual_catalog_item` para que deje de escribir `books.isbn/publisher` (nueva versión de la función en esta migración, mismo `drop function` + `create`).

- [ ] **Step 3:** Aplicar en dev → `npx tsc --noEmit`, `npx vitest run`, `npm run build && npm run start` + e2e contra build de producción → verde. Regenerar tipos.

- [ ] **Step 4:** Aplicar en prod (con autorización del dueño). Verificar objetos reales en ambos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260893_repr_k_purge_editions.sql supabase/migrations/20260894_repr_l_drops.sql src/lib/supabase/database.types.ts
git commit -m "feat(catalogo): fase destructiva — purga de ediciones huérfanas y muerte de is_primary/isbn/publisher/editions_synced_at"
```

---

### Task 17: e2e, documentación e issues

**Files:**
- Modify/Create: specs e2e afectadas (grep `edicion|edition` en `e2e/`), `docs/requirements/data-model.md`, `docs/requirements/decisiones.md` (append), `docs/requirements/backlog.md`

- [ ] **Step 1: e2e** (contra build de producción, `npm run build && npm run start`): cubrir — alta desde `/buscar` y ficha con datos; identificar edición vía picker; búsqueda del mismo libro por título ES y EN no muestra dos tarjetas (usar `MOCK_EXTERNAL_APIS` con fixtures que incluyan el caso de dos works + entidad, ampliando el mock si hace falta); import con ISBN puebla `edition_id`. Ejecutar `npm run test:e2e` → verde.

- [ ] **Step 2: `data-model.md`**: actualizar §2 (columnas nuevas de `books` con su semántica, muerte de primaria/espejos, `hydrate_book` v3, precedencia 2 niveles del widget) + fecha de verificación. DRIFT-CHECK superficie 6 sobre las columnas nuevas.

  **Lo que la revisión de Task 2 dejó mintiendo y hay que corregir aquí, punto por punto** (todo verificado como falso a día de hoy):
  - `data-model.md:155`, `:344-354` y `:440` describen `hydrate_book` como **fill-only puro** con grant a `authenticated`, y la línea 440 dice literalmente que «nunca pisa lo que el colaborador escribió». Las tres afirmaciones son ahora falsas: es fill-or-upgrade por rango de idioma y su ejecución es **solo de `service_role`**.
  - El comentario VIVO de la columna `books.repr_meta` (puesto por `20260882`) dice «Escrito solo por RPCs de hidratación y actions de colaborador». Lo escribe además un **trigger**, y las actions no lo tocan nunca. Corregirlo con `comment on column`.
  - `src/lib/supabase/server.ts:84` y `src/app/libro/[id]/page.tsx:168` documentan el guard `authentication required` de `hydrate_book`, que ya no existe (ahora el guard es del rol invocador).
  - La cabecera de `20260880_manual_catalog_item.sql` justifica dejar `hydrated_at` a NULL diciendo «hydrate_book es fill-only, nunca pisa lo que el colaborador escribió» — la premisa que rompió esta pieza, y el origen de los dos Critical de la revisión. Corregir el comentario donde esté vivo.
  - Documentar en §2 el trigger `trg_stamp_books_repr_manual` y su regla (estampa `source:'manual'` cuando cambia una columna de representación **con sesión de usuario y fuera de `app.hydrating`**), y que el alta manual nace ya marcada.
  - Dejar escrito que, desde `20260885`, **`repr_meta is null` ya no significa «fila sin procedencia»** sino «fila nacida antes de esa migración»: un alta manual de libro nace siempre con al menos la clave `title`. El marcador de «fila sin procesar» sigue siendo `hydrated_at is null`.

- [ ] **Step 3: `decisiones.md`** (append, con fecha): política ES→EN→otro fill-or-upgrade; muerte de la edición primaria; papel de GB; capa Wikidata/Inventaire como identidad blanda; fusión siempre cobarde con autor verificado.

- [ ] **Step 4: backlog**: marcar lo cerrado; abrir issues:

```sh
gh issue create --label "area:catalogo,tipo:deuda,P2" --title "Curación manual previa a repr_meta es indistinguible y queda mejorable" --body-file …
gh issue create --label "area:catalogo,tipo:deuda,P3" --title "Gate S2-14 de google_books_volume_id/wikidata_id pendiente hasta fase C en prod (paralelo a #812)" --body-file …
gh issue create --label "area:catalogo,tipo:cobertura,P2" --title "Cobertura del colapso por QID con fixtures reales de OL+Inventaire" --body-file …
```

(cuerpos con repro/contexto según la regla del repo; añadir cualquier hallazgo de refilón del propio desarrollo).

- [ ] **Step 5:** `git worktree list` limpio, un solo dev server, commit final y PR según `superpowers:finishing-a-development-branch`.

---

## Endurecimiento decidido en la revisión de Task 2 (2026-08-27) — vincula a Tasks 9 y 9bis

La revisión de Task 2 encontró, y el controlador confirmó reproduciéndolo en dev, que
`hydrate_book` v3 permitía a **cualquier `authenticated` con rol `user` reescribir el catálogo
compartido**: el bypass `app.hydrating` salta el trigger de curación, y ese bypass se había
autorizado con el argumento «la RPC es fill-only y no pisa nada» — premisa que fill-or-upgrade
rompe. Con el backfill de Task 1 dejando todas las filas en `lang:'unknown'` (rango 3), bastaba
declarar `"lang":"es"` para pisar cualquier libro.

**Dos decisiones del dueño, ya implementadas en `20260884_repr_c_hydrate_hardening.sql`:**

1. **Las RPC de hidratación de libros son SOLO para `service_role`.** `authenticated` pierde el
   execute. El precedente es #725: las escrituras que el servidor deriva del proveedor, sin un
   solo campo del cliente, las respalda el servidor. Consecuencias que estas tasks DEBEN aplicar:
   - **Task 9:** `ensureBookHydrated` llama a `hydrate_book` con **`createServiceRoleClient()`**,
     no con el cliente de la petición ni con `createTokenClient`. El resto de la función (lecturas,
     `openlibrary_work_key`, `google_books_volume_id`) sigue como esté especificado.
   - **Task 9bis:** `hydrate_books_bulk` nace igualmente **solo para `service_role`**, y la rama de
     libros de `findOrCreateCatalogItemsBulk` la invoca con el cliente de service role. Encaja con
     que `hydratePersonCredits` ya escribe `credits` con `createServiceRoleClient()` desde #725.
     **Y es requisito, no preferencia:** el trigger de estampado distingue curación de automatismo
     por `auth.uid()`, así que un escritor masivo que corriera con el cliente de la petición y
     olvidara `app.hydrating` marcaría **`manual` el catálogo entero**, en silencio y sin vuelta
     atrás para todo automatismo posterior. Con `service_role` (sin `auth.uid()`) eso es imposible.
   - **Task 15 / backfill:** el script usa la service role key, sin token de usuario.
2. **La curación se marca sola.** Un trigger `BEFORE UPDATE` en `books` estampa
   `repr_meta[campo].source='manual'` cuando una columna de representación cambia FUERA de
   `app.hydrating`. Sin grants nuevos y sin tocar las actions de edición: ningún camino de curación
   puede olvidarse de marcar la procedencia, ni ahora ni cuando se añada un campo curable.

## Camino de la ficha de AUTOR (`/persona/[id]`) — qué cambia y qué no

Verificado contra código y contra la API real (2026-08-26). El plan **no toca**
`hydratePersonCredits` ni `findOrCreateCatalogItemsBulk`, pero conviene saber
cómo le afecta, porque es el único camino que crea shells de libro en LOTE:

- **La bibliografía por autor NO tiene el bug de duplicados de la búsqueda.** Su
  dedup por *intersección de conjuntos de títulos* (`normalize.ts`, regla 5) SÍ
  cruza idiomas: comprobado con `author_key=OL1394865A` (Sanderson), OL le
  devuelve tanto `/works/OL16813053W` («Words of Radiance», 23 ediciones, con
  ediciones `spa`) como `/works/OL38056408W` («Palabras Radiantes», 1 edición),
  y la dedup funde la segunda en la primera porque la pasada `lang=es` le presta
  a la inglesa el título de edición «Palabras Radiantes». La búsqueda no puede
  hacer esto porque su **guarda de colisión** anula justo ese título compartido
  (existe para que `q="hunger games"` no contamine a Mockingjay) — de ahí que el
  colapso por QID sea necesario en búsqueda y **no** en bibliografía. **No añadir
  Inventaire al camino de autor**: serían ~100 entidades por ficha para arreglar
  algo que ya está arreglado.
- **Mejora directa y visible:** la ficha de autor pinta `books.title` leído de BD
  (`get-person-profile.ts`). Hoy, la shell superviviente de un par traducido es
  la del work INGLÉS (gana la de más ediciones), así que al hidratarse se
  quedaba en «Words of Radiance». Con la política ES→EN de Task 9 esa misma
  shell hidrata como «Palabras Radiantes», porque el work inglés sí tiene
  ediciones `spa` de las que sacar la candidata. La bibliografía en español
  mejora sin tocar su código.
- **Arreglo grande, en Task 9bis:** hoy el lote crea las shells y TIRA el título,
  el año y la portada que la bibliografía ya trae — 61 de los 268 libros de prod
  son shells vacías, todas de una sola visita a la ficha de Sanderson. Task 9bis
  las hidrata en lote, y solo es seguro hacerlo con la maquinaria de este plan
  (con la RPC vieja congelaría títulos ingleses para siempre).
- **Coste:** quien paga la hidratación nueva es la primera visita a la ficha de
  cada libro: pasa de ~3 llamadas externas a ~8 en el peor caso (work + 2
  páginas de ediciones + Inventaire + hasta 2 de GB). Es en `after()`, una vez
  por obra, y el cooldown de `needsRepresentationReview` evita repetirlo. La
  ficha de autor **no** paga nada de esto: su lote añade una sola RPC más.
- **Hueco conocido:** las shells del lote nacen sin `wikidata_id`. Si la dedup de
  bibliografía deja pasar un casi-duplicado (caso documentado en `normalize.ts`:
  un candidato que cruza con DOS supervivientes), quedan dos filas y ninguna
  tiene QID hasta que alguien abra cada ficha — y `hydrate_book` v3, ante un QID
  ya ocupado, lo deja sin asignar a propósito (no fusiona por su cuenta). Lo
  resuelve el barrido de Task 15. Registrarlo como issue en Task 17.

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** §1 esquema → Tasks 1, 12, 16; §2 política → Tasks 2, 9; §3 flujos → Tasks 9–11; §4 GB → Tasks 7, 11; §5 consumidores → Tasks 12–14; §6 reconciliación → Tasks 4–6, 15; §7 migración+backup → Tasks 0–4, 16; §8/§9 → recogidos en Global Constraints y Task 17.
- **Huecos deliberados y señalados como trabajo del paso** (no placeholders): el cuerpo de `merge_book_into` se porta de `20260870` (Task 4 Step 2 lo exige antes del commit); el host exacto de imágenes GB se verifica con una llamada real (Task 7 Step 4); los nombres reales de triggers de primaria se comprueban en `pg_trigger` (Task 16).
- **Consistencia de nombres:** `searchInventaireEntities`/`qidFromUri` (T5) consumidos en T6/T9/T15; `collapseByWikidata` (T6) en `search.ts`; `findBestVolume`/`findVolumeByIsbn` (T7) en T9/T11; `fetchRepresentationCandidates` (T8) en T9; `pagesForPass` (T12); `merge_book_into` (T4) en T15; firma `hydrate_book` v3 (T2) en T9.
