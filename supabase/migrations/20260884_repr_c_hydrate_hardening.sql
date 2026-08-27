-- Endurecimiento de la representación de obra (revisión de la Task 2 sobre
-- `20260883_repr_b_hydrate_book_v3.sql`). Una sola migración con TODOS los
-- arreglos; la 20260883 queda intacta porque ya está aplicada en dev.
--
-- Índice de lo que se arregla, con el número del hallazgo:
--
--   C1  `hydrate_book` pasa a ser SOLO de `service_role`.
--   C2  Trigger que estampa `source:'manual'` en `repr_meta` cuando la
--       curación humana cambia un campo de representación.
--   I3  La lista blanca de `p_fields` fallaba ABIERTA con NULL.
--   I4  `lang` ausente y `lang` inválido convergen en «desconocido» (rango 3).
--   I5  `repr_lang_rank` sin `revoke` ni `search_path`.
--   I6  v3 perdió la hidratación de `author` (recaída de #730).
--   M8  `repr_meta` malformado perdía la protección en silencio.
--   M10 La migración anterior no era re-ejecutable (42723 en la 2ª pasada).
--
-- NO se toca aquí (a propósito, va en otra tarea del plan):
--   · `hydrated_at = now()` incondicional — queda como Minor; con la RPC
--     restringida a `service_role` su vector de abuso desaparece.
--   · `src/lib/catalog/hydrate-book.ts` — lo reescribe la Task 9 para pasar a
--     `createServiceRoleClient()`. **Hasta ese cambio la hidratación de libros
--     queda ROTA en dev**: el cliente de la petición ya no puede llamar la RPC.
--     Es el mismo orden de despliegue que documenta 20260875 (#725): primero el
--     código con service_role, después la base. Aquí se invierte a sabiendas
--     porque el hallazgo C1 es una escritura ARBITRARIA sobre catálogo
--     compartido y no puede quedarse abierta esperando al deploy.

-- ─────────────────────────────────────────────────────────────────────────────
-- I5 · repr_lang_rank: era la única `function_search_path_mutable` del proyecto
-- (proconfig NULL) y su `proacl` incluía `PUBLIC` y `anon`, rompiendo el estado
-- limpio que dejó 20260869. `alter function` no recrea el cuerpo.
--
-- El cuerpo NO cambia y ya cumple I4 por construcción: `case p_lang when 'es'
-- … else 3 end` devuelve 3 tanto para NULL (NULL = 'es' es NULL, no casa, cae
-- al ELSE) como para cualquier idioma fuera del vocabulario ('fr', 'es-ES',
-- 'spa'). El bug de I4 estaba en el filtro de `hydrate_book`, no aquí.
-- ─────────────────────────────────────────────────────────────────────────────
alter function public.repr_lang_rank(text) set search_path = public, pg_temp;

revoke all on function public.repr_lang_rank(text) from public;
revoke execute on function public.repr_lang_rank(text) from anon;        -- #831: `from public` NO se lo quita
revoke execute on function public.repr_lang_rank(text) from authenticated;
grant execute on function public.repr_lang_rank(text) to service_role;

comment on function public.repr_lang_rank is
  'Rango de preferencia de idioma para la representación de una obra: es=0 < en=1 < other=2 < desconocido=3. NULL y cualquier idioma fuera del vocabulario caen en 3 a propósito (un proveedor puede devolver "es-ES" o "spa"): rellenan hueco vacío, nunca pisan un valor de idioma conocido. Helper interno de hydrate_book; sin EXECUTE para roles de cliente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- C2 · La curación humana estampa `source:'manual'` sola.
--
-- El guard `source = 'manual'` de v3 era código MUERTO: nadie escribía nunca esa
-- marca. Las actions de curación (`src/lib/catalog/edit-actions.ts`) no pueden:
-- `authenticated` no tiene grant de UPDATE sobre `books.repr_meta` (20260882 lo
-- dejó fuera a propósito). Medido en la revisión: una fila con título curado a
-- mano y `repr_meta` NULL fue pisada por un título inglés del proveedor, porque
-- rank(en)=1 < rank(ausente)=3.
--
-- Se estampa desde un trigger BEFORE UPDATE en vez de desde las actions:
--   · no hace falta ningún grant nuevo (un BEFORE trigger modifica NEW sin que
--     Postgres compruebe privilegios de columna sobre lo que el trigger toca),
--   · no hay que tocar las actions,
--   · es imposible de olvidar el día que alguien añada un campo curable.
--
-- La marca se pone solo FUERA de `app.hydrating='on'`: la hidratación escribe su
-- propia procedencia (lang+source del proveedor) y no debe auto-marcarse manual.
--
-- Si el campo se VACÍA, en vez de estampar se BORRA la entrada de `repr_meta`:
-- la procedencia describe el valor que hay, y sin valor no hay procedencia. Si
-- se estampase 'manual' sobre un hueco, el guard bloquearía para siempre incluso
-- el relleno de ese hueco vacío.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.stamp_repr_manual_on_curation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meta    jsonb;
  v_touched boolean := false;

  -- Mapa columna→clave de repr_meta:
  --   title → 'title' · cover_url → 'cover' · synopsis → 'synopsis'
begin
  -- Escrituras de hidratación: NO son curación. Salen sin tocar nada.
  if coalesce(current_setting('app.hydrating', true), 'off') = 'on' then
    return new;
  end if;

  -- M8 defensivo también aquí: un repr_meta que no sea objeto se normaliza en
  -- vez de propagar el `||` sobre un escalar.
  v_meta := case when jsonb_typeof(new.repr_meta) = 'object'
                 then new.repr_meta else '{}'::jsonb end;

  if new.title is distinct from old.title then
    v_touched := true;
    if new.title is null or new.title = '' then
      v_meta := v_meta - 'title';
    else
      v_meta := v_meta || jsonb_build_object('title',
        (case when jsonb_typeof(v_meta -> 'title') = 'object'
              then v_meta -> 'title' else '{}'::jsonb end)
        || jsonb_build_object('source', 'manual'));
    end if;
  end if;

  if new.cover_url is distinct from old.cover_url then
    v_touched := true;
    if new.cover_url is null or new.cover_url = '' then
      v_meta := v_meta - 'cover';
    else
      v_meta := v_meta || jsonb_build_object('cover',
        (case when jsonb_typeof(v_meta -> 'cover') = 'object'
              then v_meta -> 'cover' else '{}'::jsonb end)
        || jsonb_build_object('source', 'manual'));
    end if;
  end if;

  if new.synopsis is distinct from old.synopsis then
    v_touched := true;
    if new.synopsis is null or new.synopsis = '' then
      v_meta := v_meta - 'synopsis';
    else
      v_meta := v_meta || jsonb_build_object('synopsis',
        (case when jsonb_typeof(v_meta -> 'synopsis') = 'object'
              then v_meta -> 'synopsis' else '{}'::jsonb end)
        || jsonb_build_object('source', 'manual'));
    end if;
  end if;

  if v_touched then
    new.repr_meta := v_meta;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_repr_manual_on_curation() from public;
revoke execute on function public.stamp_repr_manual_on_curation() from anon;
revoke execute on function public.stamp_repr_manual_on_curation() from authenticated;

comment on function public.stamp_repr_manual_on_curation is
  'BEFORE UPDATE en books: si la curación humana cambia title/cover_url/synopsis fuera de app.hydrating, estampa {"source":"manual"} en la entrada de repr_meta de ese campo (y la BORRA si el campo se vacía). Hace real el guard `source=manual` de hydrate_book, que sin esto era código muerto. Sin grants nuevos: un BEFORE trigger modifica NEW sin comprobar privilegios de columna.';

-- ORDEN DE LOS BEFORE TRIGGERS: se ejecutan por orden ALFABÉTICO de nombre.
--   trg_enforce_books_edit_collaborator_only  ← 'e' … corre PRIMERO
--   trg_stamp_books_repr_manual               ← 's' … corre DESPUÉS
-- Es el orden que se quiere: si la edición la va a rechazar el gate de
-- colaborador, no se estampa nada. Y el estampado no puede reactivar ese gate,
-- porque `repr_meta` no está entre las columnas que vigila (20260878).
drop trigger if exists trg_stamp_books_repr_manual on public.books;
create trigger trg_stamp_books_repr_manual
  before update on public.books
  for each row
  execute function public.stamp_repr_manual_on_curation();

-- ─────────────────────────────────────────────────────────────────────────────
-- C1 + I3 + I4 + I6 + M8 + M10 · hydrate_book v4.
--
-- C1 — CUALQUIER `authenticated` podía reescribir el catálogo COMPARTIDO.
-- Reproducido en dev con `set local role authenticated` y un perfil `role='user'`:
-- la llamada pisó `title` y `synopsis` de una fila. La causa es que
-- `app.hydrating='on'` hace que `enforce_catalog_edit_collaborator_only`
-- devuelva `new` ANTES de mirar el rol, y ese bypass (20260818) se autorizó con
-- el argumento textual «la RPC es fill-only y no pisa nada» — premisa que v3
-- rompió al pasar a fill-or-upgrade. Agravante: el backfill de 20260882 dejó
-- TODAS las filas en `lang:'unknown'` (rango 3), así que cualquier `"lang":"es"`
-- declarado por el cliente las pisaba.
--
-- La RPC pasa a ser SOLO de `service_role`. Precedente exacto del repo: #725
-- (20260875) movió a `createServiceRoleClient()` justamente las escrituras que
-- el servidor deriva del proveedor sin un solo campo del cliente. Este es ese
-- caso: los valores vienen de OpenLibrary / Google Books / Wikidata.
--
-- Y por eso desaparece el `auth.uid() is null → raise`: con `service_role` NO
-- hay `auth.uid()`, así que ese guard fallaría SIEMPRE para el único invocador
-- legítimo. Se sustituye por la comprobación del rol invocador. Ojo con cómo se
-- lee ese rol: dentro de una SECURITY DEFINER, `current_user`/`session_user`
-- valen el DUEÑO (verificado en dev: `postgres`), no quien llama. Lo que sí
-- sobrevive intacto a la entrada en la función es el GUC `role`, que es
-- exactamente lo que PostgREST fija con `set local role <rol del JWT>`.
--   · role = 'service_role' → adelante.
--   · role = 'none'/vacío   → conexión directa SIN `set role` (psql de
--     mantenimiento del dueño); se acepta solo si ese `session_user` es miembro
--     de service_role, para no dejar la función inejecutable en mantenimiento.
--   · cualquier otro ('anon', 'authenticated') → excepción.
-- El grant es la primera barrera; esta comprobación es defensa en profundidad y
-- deja el motivo escrito en el error.
--
-- M10 — la 20260883 hacía `create function` sin dropear su PROPIA firma: una
-- segunda pasada moría con 42723. Aquí se dropean las DOS: la de v3 (que hay que
-- quitar de todas formas, porque `create or replace` con firma distinta crearía
-- una SOBRECARGA y PostgREST no sabría cuál llamar) y la nueva.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text);
drop function if exists public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text);

create function public.hydrate_book(
  p_book_id uuid,
  p_fields jsonb default null,
  p_genres text[] default null,
  p_published_year integer default null,
  p_total_pages integer default null,
  p_pages_source text default null,
  p_wikidata_id text default null,
  p_author text default null
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
  v_entry jsonb;
  v_value text;
  v_lang text;
  v_source text;
  v_current text;
  v_rank_new int;
  v_rank_cur int;
  v_max int;
  v_caller text := coalesce(current_setting('role', true), 'none');
begin
  -- C1: el invocador efectivo, no `current_user` (ver cabecera).
  if v_caller is distinct from 'service_role'
     and not (v_caller in ('none', '')
              and pg_has_role(session_user, 'service_role', 'member'))
  then
    raise exception 'hydrate_book: service_role only (caller role=%)', v_caller;
  end if;

  perform set_config('app.hydrating', 'on', true);

  select * into v_row from public.books where id = p_book_id for update;
  if not found then
    perform set_config('app.hydrating', 'off', true);
    return;
  end if;
  -- M8: un repr_meta que no sea objeto se normaliza antes de operar con él.
  v_meta := case when jsonb_typeof(v_row.repr_meta) = 'object'
                 then v_row.repr_meta else '{}'::jsonb end;

  foreach v_field in array array['title','cover','synopsis'] loop
    v_new := p_fields -> v_field;
    continue when v_new is null or jsonb_typeof(v_new) <> 'object';

    v_value  := v_new ->> 'value';
    -- I3: `x not in (...)` da NULL si x es NULL, y `continue when NULL` NO
    -- continúa → la lista blanca fallaba ABIERTA. Medido: un p_fields sin la
    -- clave `source` PISÓ un título existente y guardó `source: null`.
    -- El coalesce a '' la hace fallar CERRADA.
    v_source := coalesce(v_new ->> 'source', '');
    v_lang   := coalesce(v_new ->> 'lang', '');

    continue when v_value is null or v_value = ''
      or v_source not in ('openlibrary','google_books','wikidata');

    -- I4: `lang` ausente y `lang` inválido convergen en «desconocido» (rango 3),
    -- como dice la spec. Antes iban al revés: el ausente escribía y un 'fr' no
    -- rellenaba ni un campo vacío. Rango 3 = rellena hueco, nunca pisa un valor
    -- de idioma conocido. `source` inválido sí sigue rechazando la escritura:
    -- la procedencia es un hecho verificable, el idioma es una heurística.
    if v_lang not in ('es','en','other') then
      v_lang := 'unknown';
    end if;
    v_rank_new := public.repr_lang_rank(v_lang);

    v_current := case v_field
      when 'title' then v_row.title
      when 'cover' then v_row.cover_url
      when 'synopsis' then v_row.synopsis end;

    v_entry := v_meta -> v_field;

    -- M8: con `repr_meta = '{"title":"manual"}'` (escalar en vez de objeto),
    -- `-> 'source'` daba NULL y el guard fallaba ABIERTO. Se elige tratar la
    -- entrada malformada como PROTEGIDA (rango -1, imposible de mejorar) en vez
    -- de como desconocida: no sabemos de dónde salió el valor, y ante la duda no
    -- se pisa. El hueco VACÍO sí se rellena —eso no destruye nada— y de paso
    -- reescribe la entrada bien formada, así que se auto-cura.
    if v_entry is not null and jsonb_typeof(v_entry) <> 'object' then
      v_rank_cur := -1;
    elsif coalesce(v_entry ->> 'source', '') = 'manual' then
      continue;                                   -- la curación es intocable
    else
      v_rank_cur := public.repr_lang_rank(v_entry ->> 'lang');
    end if;

    -- Vacío → rellena. Con valor → solo mejora ESTRICTA de rango.
    if v_current is not null and v_current <> '' and v_rank_new >= v_rank_cur then
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
  --
  -- I6: v3 perdió `author` (ni parámetro ni columna en el UPDATE) — recaída del
  -- modo de fallo exacto que documenta la cabecera de 20260871 (#730): como la
  -- RPC marca `hydrated_at` igualmente, un libro hidratado desde la ficha se
  -- quedaba con `author = NULL` PARA SIEMPRE, porque el curador no reintenta lo
  -- que ya está marcado hidratado.
  if (v_row.author is null or v_row.author = '') and p_author is not null and p_author <> '' then
    v_row.author := left(p_author, 200);
  end if;
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
         author = v_row.author,
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

revoke all on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from public;
revoke execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from anon;
revoke execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from authenticated;
grant execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) to service_role;

comment on function public.hydrate_book is
  'v4: SOLO service_role (#725 mismo argumento — los valores los deriva el servidor de OpenLibrary/Google Books/Wikidata, ni un campo viene del cliente; con `authenticated` cualquiera reescribía el catálogo COMPARTIDO aprovechando el bypass app.hydrating de 20260818). Fill-or-upgrade por rango de idioma (es<en<other<unknown) con procedencia por campo en repr_meta; lang ausente o inválido = unknown; source fuera de la lista blanca = no escribe; repr_meta malformado = protegido. source=manual intocable, y lo estampa el trigger trg_stamp_books_repr_manual. author/published_year/genres/total_pages fill-only. p_wikidata_id solo null→valor; conflicto de QID lo resuelve la fusión cobarde, no esta RPC.';
