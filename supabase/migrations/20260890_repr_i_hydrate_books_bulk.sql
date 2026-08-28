-- Hidratación en LOTE de libros: arregla las shells vacías que deja la ficha de
-- autor (Task 9bis del plan 2026-08-26-obra-edicion-representacion).
--
-- DIAGNÓSTICO MEDIDO EN PROD el 2026-08-26. Abrir la ficha de Brandon Sanderson
-- creó 87 créditos de libro y dejó **61 filas de `books` COMPLETAMENTE vacías**
-- (`title`, `author`, `published_year`, `cover_url` y `hydrated_at` a NULL, todas
-- con `openlibrary_work_key`). En el catálogo entero de prod había 268 libros:
-- 61 shells vacías, el 23%, todas de esa única visita. La ficha de autor las
-- pinta leyendo `books.title`, así que salían como «Sin título» y sin año.
--
-- La causa NO era falta de datos: `fetchAuthorWorks` los trae (medido sobre 100
-- obras de Sanderson: 100/100 con título, 100/100 con `first_publish_year`,
-- 91/100 con `cover_i`) y `findOrCreateCatalogItemsBulk` los TIRABA, porque su
-- rama de hidratación arrancaba con
-- `if (itemType !== "movie" && itemType !== "series") return;`.
--
-- POR QUÉ ESTE ARREGLO SOLO ES SEGURO AHORA. Con la `hydrate_book` anterior a
-- `repr_meta`, hidratar libros en lote habría escrito el título y marcado
-- `hydrated_at`, congelando para siempre un título posiblemente inglés y
-- dejando la obra sin sinopsis ni géneros — el modo de fallo exacto de #730.
-- Con `repr_meta` + fill-or-upgrade ya no: el título del lote queda ETIQUETADO
-- con su idioma, y una visita posterior a la ficha lo MEJORA si encuentra
-- candidata española.
--
-- SEGURIDAD (#674): escribir canónicos aquí no reabre el envenenamiento del
-- catálogo. Es el mismo argumento que ya justifica que el lote de
-- película/serie use los canónicos del `SearchResult`: el origen es una llamada
-- de SERVIDOR a Open Library por `author_key`, sin un solo campo procedente del
-- cliente. Y la RPC es fill-or-upgrade, así que no puede pisar una curación.

-- ─────────────────────────────────────────────────────────────────────────────
-- repr_should_write · la regla de escritura de la representación, en UN sitio.
--
-- Hasta ahora vivía INLINE dentro de `hydrate_book` (20260884). Con una segunda
-- escritora (`hydrate_books_bulk`) eso serían dos copias de la misma regla, y
-- dos copias se desincronizan en el primer arreglo. Se extrae tal cual, sin
-- cambiar ni un caso — incluidos los dos bordes que costaron un hallazgo cada
-- uno en la revisión de la Task 2:
--
--   · M8 · Entrada de `repr_meta` MALFORMADA (no es un objeto: p. ej.
--     `{"title":"manual"}`, un escalar). `-> 'source'` daba NULL y el guard
--     fallaba ABIERTO. Se trata como PROTEGIDA (rango -1, imposible de mejorar)
--     en vez de como desconocida: no sabemos de dónde salió el valor y ante la
--     duda no se pisa. El hueco VACÍO sí se rellena —eso no destruye nada— y de
--     paso reescribe la entrada bien formada, así que se auto-cura.
--     El orden importa: esta comprobación va ANTES que la de `manual`, igual
--     que en la v4 inline.
--
--   · I4 · `lang` ausente o fuera del vocabulario converge en «desconocido»
--     (rango 3) dentro de `repr_lang_rank`. Rango 3 rellena hueco, nunca pisa
--     un valor de idioma conocido.
--
-- Y el `p_meta` que no sea un objeto se normaliza a `{}` antes de mirarlo,
-- igual que hace la v4 al entrar (M8 a nivel de documento, no de entrada).
--
-- Semántica completa, para que no haya que reconstruirla leyendo el `case`:
--
--   entrada de repr_meta      | current vacío | current con valor
--   --------------------------|---------------|---------------------------
--   ausente                   | true          | rank(p_lang) < 3
--   malformada (no objeto)    | true          | false
--   objeto, source='manual'   | false         | false
--   objeto, resto             | true          | rank(p_lang) < rank(entrada)
--
-- IMMUTABLE y sin efectos: es un predicado puro sobre sus argumentos.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.repr_should_write(text, jsonb, text, text);

create function public.repr_should_write(
  p_current text,
  p_meta    jsonb,
  p_field   text,
  p_lang    text
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  with norm as (
    select (case when jsonb_typeof(p_meta) = 'object' then p_meta else '{}'::jsonb end) -> p_field
             as entry
  )
  select case
    -- M8: entrada malformada = protegida. Solo rellena hueco vacío.
    when entry is not null and jsonb_typeof(entry) <> 'object'
      then p_current is null or p_current = ''
    -- La curación humana es intocable, incluso sobre un hueco vacío.
    when coalesce(entry ->> 'source', '') = 'manual'
      then false
    -- Vacío → rellena.
    when p_current is null or p_current = ''
      then true
    -- Con valor → solo MEJORA ESTRICTA de rango de idioma.
    else public.repr_lang_rank(p_lang) < public.repr_lang_rank(entry ->> 'lang')
  end
  from norm;
$$;

revoke all on function public.repr_should_write(text, jsonb, text, text) from public;
revoke execute on function public.repr_should_write(text, jsonb, text, text) from anon;          -- #831: `from public` NO se lo quita
revoke execute on function public.repr_should_write(text, jsonb, text, text) from authenticated;
grant execute on function public.repr_should_write(text, jsonb, text, text) to service_role;

comment on function public.repr_should_write is
  'ÚNICA implementación de la regla de escritura de la representación de obra: curación (source=manual) intocable; entrada de repr_meta malformada = protegida (solo rellena hueco vacío); hueco vacío se rellena; valor existente solo se pisa con MEJORA ESTRICTA de rango de idioma (repr_lang_rank: es<en<other<desconocido). La usan hydrate_book (una obra, ficha) y hydrate_books_bulk (lote, bibliografía de autor). Helper interno; sin EXECUTE para roles de cliente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- hydrate_books_bulk · hermana de `hydrate_screens_bulk`, para libros.
--
-- Escribe SOLO lo que la bibliografía de autor sabe: título, autor, año y
-- portada. Fill-or-upgrade por campo vía `repr_should_write`.
--
-- **NO TOCA `hydrated_at`, y es a propósito.** El lote no tiene sinopsis,
-- géneros, páginas orientativas ni QID. Si marcara la obra como hidratada, la
-- ficha no completaría nunca el resto (y con el cooldown de
-- `needsRepresentationReview` tardaría 30 días en reconsiderarlo). Dejándolo
-- NULL: la ficha hace su trabajo completo en la primera visita y, como todo es
-- fill-or-upgrade, no destruye lo que el lote escribió — lo MEJORA si puede.
--
-- SOLO `service_role`, igual que `hydrate_book` (C1 de 20260884). No es una
-- preferencia de estilo: el trigger `trg_stamp_books_repr_manual` distingue
-- curación de automatismo por la ausencia de `app.hydrating`, así que un
-- escritor MASIVO que corriera con el cliente de la petición y olvidara el
-- `set_config` marcaría `source:'manual'` el catálogo ENTERO, en silencio y sin
-- vuelta atrás. Encaja además con que `hydratePersonCredits` ya escribe
-- `credits` con service role desde #725.
--
-- Y por eso NO lleva el `auth.uid() is null → raise` de `hydrate_screens_bulk`:
-- con `service_role` no hay `auth.uid()`, así que ese guard fallaría SIEMPRE
-- para el único invocador legítimo. Se sustituye por la comprobación del GUC
-- `role` (el que fija PostgREST con `set local role`), exactamente como la v4
-- de `hydrate_book`: dentro de una SECURITY DEFINER, `current_user` vale el
-- DUEÑO, no quien llama.
--
-- Una fila mala no tumba el lote: `book_id` que no existe → se salta; año que
-- no es un número JSON o fuera de rango → se ignora ese campo; `*_lang` fuera
-- del vocabulario → se ignora ese campo. 87 libros no pueden perderse porque
-- uno venga raro.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.hydrate_books_bulk(jsonb);

create function public.hydrate_books_bulk(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r          jsonb;
  v_row      public.books%rowtype;
  v_meta     jsonb;
  v_touched  boolean;
  v_year     integer;
  v_caller   text := coalesce(current_setting('role', true), 'none');
begin
  -- El invocador EFECTIVO, no `current_user` (ver cabecera). `none`/vacío es la
  -- conexión directa sin `set role` (psql de mantenimiento del dueño): se
  -- acepta solo si ese `session_user` es miembro de service_role, para no dejar
  -- la función inejecutable en mantenimiento.
  if v_caller is distinct from 'service_role'
     and not (v_caller in ('none', '')
              and pg_has_role(session_user, 'service_role', 'member'))
  then
    raise exception 'hydrate_books_bulk: service_role only (caller role=%)', v_caller;
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return;
  end if;

  perform set_config('app.hydrating', 'on', true);

  for r in select * from jsonb_array_elements(p_rows) loop
    v_touched := false;

    select * into v_row from public.books where id = (r ->> 'book_id')::uuid for update;
    continue when not found;

    -- M8 a nivel de documento: un repr_meta que no sea objeto se normaliza
    -- antes de operar con él (el `||` sobre un escalar propagaría la basura).
    v_meta := case when jsonb_typeof(v_row.repr_meta) = 'object'
                   then v_row.repr_meta else '{}'::jsonb end;

    -- Título. `title_lang` sale de `normalizeAuthorWorks` (regla 4): declara si
    -- el título viene de una edición española, de una inglesa o del título de
    -- la OBRA ('other', porque ese puede estar en cualquier idioma). Un lang
    -- fuera del vocabulario NO se normaliza a 'unknown' aquí: se rechaza la
    -- escritura del campo, porque en este camino el valor lo pone código
    -- nuestro y un valor inesperado significa que algo está mal, no que el
    -- idioma se desconozca.
    if coalesce(r ->> 'title', '') <> ''
       and (r ->> 'title_lang') in ('es', 'en', 'other')
       and public.repr_should_write(v_row.title, v_meta, 'title', r ->> 'title_lang')
    then
      v_row.title := left(r ->> 'title', 300);
      v_meta := v_meta || jsonb_build_object('title',
        jsonb_build_object('lang', r ->> 'title_lang', 'source', 'openlibrary'));
      v_touched := true;
    end if;

    -- Portada. El `cover_i` del doc de búsqueda es el de la OBRA, no el de una
    -- edición de idioma conocido: el llamador lo etiqueta 'other' (rango 2), el
    -- fallback que rellena hueco pero nunca sella rango 0 — así la ficha puede
    -- mejorarlo con una portada española.
    if coalesce(r ->> 'cover_url', '') <> ''
       and (r ->> 'cover_lang') in ('es', 'en', 'other')
       and public.repr_should_write(v_row.cover_url, v_meta, 'cover', r ->> 'cover_lang')
    then
      v_row.cover_url := left(r ->> 'cover_url', 2000);
      v_meta := v_meta || jsonb_build_object('cover',
        jsonb_build_object('lang', r ->> 'cover_lang', 'source', 'openlibrary'));
      v_touched := true;
    end if;

    -- Campos sin dimensión de idioma: fill-only de siempre.
    if (v_row.author is null or v_row.author = '') and coalesce(r ->> 'author', '') <> '' then
      v_row.author := left(r ->> 'author', 200);
      v_touched := true;
    end if;

    -- El año llega dentro del jsonb, no como parámetro `integer`: PostgREST no
    -- lo valida por nosotros y un `::integer` sobre basura abortaría el LOTE
    -- ENTERO. Se exige número JSON y rango razonable.
    if v_row.published_year is null and jsonb_typeof(r -> 'published_year') = 'number' then
      v_year := floor((r ->> 'published_year')::numeric)::integer;
      if v_year between -4000 and 2200 then
        v_row.published_year := v_year;
        v_touched := true;
      end if;
    end if;

    -- Sin cambios, sin UPDATE: una segunda pasada sobre una bibliografía ya
    -- hidratada no debe generar 87 versiones nuevas de fila.
    --
    -- OJO: `hydrated_at` NO está en el SET. Ver la cabecera.
    if v_touched then
      update public.books
         set title          = v_row.title,
             author         = v_row.author,
             cover_url      = v_row.cover_url,
             published_year = v_row.published_year,
             repr_meta      = v_meta
       where id = v_row.id;
    end if;
  end loop;

  perform set_config('app.hydrating', 'off', true);
end;
$$;

revoke all on function public.hydrate_books_bulk(jsonb) from public;
revoke execute on function public.hydrate_books_bulk(jsonb) from anon;          -- #831: `from public` NO se lo quita
revoke execute on function public.hydrate_books_bulk(jsonb) from authenticated;
grant execute on function public.hydrate_books_bulk(jsonb) to service_role;

comment on function public.hydrate_books_bulk is
  'Hidratación en lote de libros desde la bibliografía de autor (spec 2026-08-26; arregla las 61 shells vacías que dejó una sola visita a una ficha de autor en prod). Escribe solo título/autor/año/portada, fill-or-upgrade vía repr_should_write. NO marca hydrated_at: la ficha completa sinopsis/géneros/páginas/QID después y puede MEJORAR estos valores. SOLO service_role (mismo argumento que hydrate_book, C1 de 20260884: un escritor masivo con el cliente de la petición marcaría manual el catálogo entero vía trg_stamp_books_repr_manual).';

-- ─────────────────────────────────────────────────────────────────────────────
-- hydrate_book v5 · MISMA firma y MISMA semántica que la v4 de 20260884; el
-- único cambio es que la regla de escritura deja de estar copiada dentro y pasa
-- a llamar a `repr_should_write`. Se recrea entera (drop + create, re-ejecutable
-- como manda M10) porque `create or replace` no basta para dejar constancia del
-- cuerpo nuevo en una migración idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_value text;
  v_lang text;
  v_source text;
  v_current text;
  v_max int;
  v_caller text := coalesce(current_setting('role', true), 'none');
begin
  -- C1: el invocador efectivo, no `current_user` (ver 20260884).
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

    v_current := case v_field
      when 'title' then v_row.title
      when 'cover' then v_row.cover_url
      when 'synopsis' then v_row.synopsis end;

    -- La regla (curación intacta, entrada malformada protegida, hueco vacío se
    -- rellena, valor existente solo con mejora estricta de rango) vive ENTERA en
    -- `repr_should_write`. Antes estaba copiada aquí; con `hydrate_books_bulk`
    -- serían dos copias, y dos copias se desincronizan en el primer arreglo.
    continue when not public.repr_should_write(v_current, v_meta, v_field, v_lang);

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
revoke execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from anon;          -- #831
revoke execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from authenticated;
grant execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) to service_role;

comment on function public.hydrate_book is
  'v5: idéntica a la v4 de 20260884 salvo que la regla de escritura ya no está copiada dentro — la delega en repr_should_write, única implementación (la comparte con hydrate_books_bulk). SOLO service_role (#725). Fill-or-upgrade por rango de idioma (es<en<other<unknown) con procedencia por campo en repr_meta; lang ausente o inválido = unknown; source fuera de la lista blanca = no escribe; repr_meta malformado = protegido. source=manual intocable, y lo estampa el trigger trg_stamp_books_repr_manual. author/published_year/genres/total_pages fill-only. p_wikidata_id solo null→valor; conflicto de QID lo resuelve la fusión cobarde, no esta RPC.';
