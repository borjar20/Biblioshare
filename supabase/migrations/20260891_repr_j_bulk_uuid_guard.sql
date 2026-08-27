-- Cierre de la revisión de la Task 9bis. DOS arreglos, ninguno de corrección:
-- una guarda defensiva que le faltaba al lote y un comentario de columna que
-- describía mal quién escribe.
--
--   1. `hydrate_books_bulk`: `book_id` era el ÚNICO campo de `p_rows` sin guarda
--      de tipo, y un valor que no fuese un uuid tumbaba el LOTE ENTERO.
--   2. `books.repr_meta`: el comentario de 20260882 se quedó viejo (le falta el
--      trigger y el alta manual, y atribuye la escritura a unas actions que no
--      tocan la columna).
--
-- Re-ejecutable: drop + create, y `comment on` es idempotente por definición.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · La guarda de `book_id`.
--
-- La cabecera de 20260890 declara: «Una fila mala no tumba el lote: `book_id`
-- que no existe → se salta; año que no es un número JSON o fuera de rango → se
-- ignora ese campo; `*_lang` fuera del vocabulario → se ignora ese campo». Lo
-- de `book_id` era falso a medias: un id INEXISTENTE sí se salta (el `select …
-- into` no encuentra fila), pero un id que no sea un uuid VÁLIDO ni siquiera
-- llega a esa comprobación —
--
--     select * into v_row from public.books where id = (r ->> 'book_id')::uuid …
--
-- — porque el cast revienta con `22P02 invalid input syntax for type uuid` y,
-- al no haber bloque de excepción, la excepción sube y aborta la función entera:
-- 87 libros perdidos por uno malo. Es exactamente el modo de fallo por el que la
-- propia 20260890 blindó `published_year` («un `::integer` sobre basura abortaría
-- el LOTE ENTERO. Se exige número JSON y rango razonable») y los `*_lang`.
--
-- Hoy NO es alcanzable: los dos únicos llamadores (`findOrCreateCatalogItemsBulk`
-- y `scripts/backfill-book-shells.ts`) ponen ahí ids que acaban de leer de
-- `books.id`. Pero el argumento con el que se blindaron los otros campos es el
-- mismo y no depende del llamador de hoy: la RPC recibe `jsonb`, y PostgREST no
-- valida NADA de lo que va dentro de un `jsonb` — a diferencia de un parámetro
-- `uuid`, que sí rechazaría la llamada antes de entrar. Un llamador futuro que
-- mande el `openlibrary_work_key` en vez del id, o una fila con `"book_id": ""`,
-- no debe poder tirar el lote entero.
--
-- Cómo se comprueba: `begin … exception when invalid_text_representation` en vez
-- de una regex. La regex sería más barata (nada de subtransacción por fila) pero
-- sería MÁS ESTRICTA que el parser de Postgres, que también acepta las formas con
-- llaves y sin guiones; rechazar en silencio un uuid que hoy funciona sería
-- cambiar comportamiento, no añadir una guarda. Con 87 filas por visita, la
-- subtransacción por fila no se nota.
--
-- El caso «`r` no es un objeto» sale gratis por el mismo camino: `jsonb ->> text`
-- sobre un escalar o un array devuelve NULL (verificado en dev), no lanza, y ese
-- NULL cae en el `continue` sin pasar siquiera por el manejador.
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
  v_book_id  uuid;
  v_caller   text := coalesce(current_setting('role', true), 'none');
begin
  -- El invocador EFECTIVO, no `current_user` (ver 20260890). `none`/vacío es la
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

    -- Guarda de `book_id` (ver cabecera): ausente, vacío o no-uuid → se salta
    -- ESA fila, no el lote.
    v_book_id := null;
    begin
      v_book_id := (r ->> 'book_id')::uuid;
    exception when invalid_text_representation then
      v_book_id := null;
    end;
    continue when v_book_id is null;

    select * into v_row from public.books where id = v_book_id for update;
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
    -- OJO: `hydrated_at` NO está en el SET. Ver la cabecera de 20260890.
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
  'Hidratación en lote de libros desde la bibliografía de autor (spec 2026-08-26; arregla las 61 shells vacías que dejó una sola visita a una ficha de autor en prod). Escribe solo título/autor/año/portada, fill-or-upgrade vía repr_should_write. NO marca hydrated_at: la ficha completa sinopsis/géneros/páginas/QID después y puede MEJORAR estos valores. SOLO service_role (mismo argumento que hydrate_book, C1 de 20260884: un escritor masivo con el cliente de la petición marcaría manual el catálogo entero vía trg_stamp_books_repr_manual). Ninguna fila mala tumba el lote: book_id ausente, no-uuid o inexistente, año no numérico y *_lang fuera del vocabulario se saltan.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · El comentario de `books.repr_meta`.
--
-- El de 20260882 decía «Escrito solo por RPCs de hidratación y actions de
-- colaborador». Las dos mitades están mal:
--
--   · Le faltan DOS escritores: el trigger `trg_stamp_books_repr_manual`
--     (20260884, endurecido en 20260885), que es quien estampa `source:'manual'`,
--     y `register_manual_catalog_item` (20260885), que ya nace con procedencia.
--   · Las actions de curación (`src/lib/catalog/edit-actions.ts`) NO la tocan, y
--     no pueden: `authenticated` no tiene grant de UPDATE sobre esta columna
--     (20260882 la dejó fuera a propósito). Justamente por eso el estampado se
--     hizo desde un trigger BEFORE y no desde las actions.
--
-- Se añade además qué significa NULL, que cambió con 20260885 y no estaba
-- escrito en ningún sitio.
-- ─────────────────────────────────────────────────────────────────────────────
comment on column public.books.repr_meta is
  'Procedencia e idioma por campo representable: {"title":{"lang":"es","source":"openlibrary"},...}. Claves: title | cover | synopsis | pages (esta última sin lang). lang: es|en|other|unknown. source: openlibrary|google_books|wikidata|manual. manual = curado, intocable para automatismos. LO ESCRIBEN: hydrate_book, hydrate_books_bulk, register_manual_catalog_item y el trigger trg_stamp_books_repr_manual (que es quien estampa source=manual cuando una persona autenticada cura title/cover_url/synopsis). Las actions de curación NO: authenticated no tiene grant de UPDATE sobre esta columna. NULL no significa "sin procesar" —ese marcador sigue siendo hydrated_at is null—, sino que ningún campo representable tiene procedencia registrada: shell recién creada por register_catalog_item(_bulk), o fila anterior al backfill de 20260882 que tenía TODOS los campos representables vacíos. Desde 20260885 un alta manual nunca nace con NULL aquí.';
