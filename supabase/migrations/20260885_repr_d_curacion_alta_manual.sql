-- Segunda ola de la revisión de la Task 2, sobre `20260884_repr_c_hydrate_hardening.sql`.
-- La primera ola cerró la escritura arbitraria de catálogo (C1) y creó el trigger que
-- estampa `source:'manual'` (C2), pero dejó la protección de la curación A MEDIAS.
-- Una sola migración con todos los arreglos; 20260880/20260883/20260884 quedan intactas
-- porque ya están aplicadas.
--
--   A  `register_manual_catalog_item` INSERTA sin `repr_meta` → el alta manual nace
--      DESPROTEGIDA y la primera hidratación la destruye.
--   C  El trigger de estampado falla ABIERTO: sin `app.hydrating` marca `manual`
--      cualquier escritura, aunque no haya sesión humana detrás.
--   M  El estampado heredaba un `lang` que puede ser mentira.
--
-- NO se toca aquí (va como issue o como otra tarea del plan):
--   · El trigger no cubre `author` (fill-only, sin dimensión de idioma) → issue.
--   · El corpus preexistente sin marca `manual` (el backfill de 20260882 dejó todo en
--     'openlibrary'/'unknown'): limitación asumida en el plan → issue.
--   · Sincronizar `data-model.md` / `decisiones.md` / comentarios de TS → Task 17.
--   · `hydrated_at = now()` incondicional → sigue siendo Minor conocido.

-- ─────────────────────────────────────────────────────────────────────────────
-- C · El trigger de estampado pasa a fallar CERRADO: solo estampa si hay sesión.
--
-- La regla de 20260884 era «cualquier cambio fuera de app.hydrating es curación».
-- Hoy no muerde porque el único escritor automático es `hydrate_book`, que pone el
-- flag. Pero la Task 9bis trae `hydrate_books_bulk` y la Task 15 un script de
-- backfill: al primero que se le olvide el `set_config('app.hydrating','on')`, el
-- trigger marca `manual` el CATÁLOGO ENTERO — en silencio, sin error, y de forma
-- irreversible para todo automatismo posterior (el guard `source=manual` de
-- hydrate_book es intocable por diseño). Un olvido de una línea envenena el corpus.
--
-- La señal correcta no es el flag (que se puede olvidar) sino la sesión: la curación
-- SIEMPRE la hace una persona autenticada; una escritura `service_role` no tiene
-- `auth.uid()`. Es exactamente el mismo discriminante que ya usa el trigger hermano
-- `enforce_catalog_edit_collaborator_only` (20260878: `if auth.uid() is null …
-- return new`). Con esto, olvidar el flag deja de poder envenenar nada: como mucho se
-- pierde la procedencia del proveedor, que es recuperable.
--
-- Se conservan las DOS comprobaciones, no una sola: `app.hydrating` sigue haciendo
-- falta porque la hidratación puede acabar corriendo en un contexto CON sesión (es
-- justo lo que permite el bypass de 20260818) y ahí tampoco debe auto-marcarse manual.
--
-- M · La entrada se construye como `{"source":"manual"}` en vez de fusionarse sobre la
-- entrada vieja. Antes quedaba `{"lang":"en","source":"manual"}` sobre un título curado
-- en castellano: inerte (el guard corta antes de leer el rango) pero MENTIRA, y el
-- comentario de la columna dice que ese campo ES el idioma del valor. El comportamiento
-- no cambia: `repr_lang_rank(NULL) = 3`, el mismo rango que tenía el caso ausente.
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

  -- Sin sesión de usuario no hay curación que estampar: es un automatismo
  -- (`service_role`, script de backfill, mantenimiento del dueño). Fallar CERRADO
  -- aquí es lo que impide que un `app.hydrating` olvidado marque `manual` el
  -- catálogo entero. Mismo discriminante que 20260878.
  if auth.uid() is null then
    return new;
  end if;

  -- M8 defensivo también aquí: un repr_meta que no sea objeto se normaliza en
  -- vez de propagar el `||` sobre un escalar.
  v_meta := case when jsonb_typeof(new.repr_meta) = 'object'
                 then new.repr_meta else '{}'::jsonb end;

  -- La entrada se REEMPLAZA, no se fusiona: heredar el `lang` del proveedor sobre un
  -- valor tecleado a mano guardaba un idioma falso (M).
  if new.title is distinct from old.title then
    v_touched := true;
    if new.title is null or new.title = '' then
      v_meta := v_meta - 'title';
    else
      v_meta := v_meta || jsonb_build_object('title', jsonb_build_object('source', 'manual'));
    end if;
  end if;

  if new.cover_url is distinct from old.cover_url then
    v_touched := true;
    if new.cover_url is null or new.cover_url = '' then
      v_meta := v_meta - 'cover';
    else
      v_meta := v_meta || jsonb_build_object('cover', jsonb_build_object('source', 'manual'));
    end if;
  end if;

  if new.synopsis is distinct from old.synopsis then
    v_touched := true;
    if new.synopsis is null or new.synopsis = '' then
      v_meta := v_meta - 'synopsis';
    else
      v_meta := v_meta || jsonb_build_object('synopsis', jsonb_build_object('source', 'manual'));
    end if;
  end if;

  if v_touched then
    new.repr_meta := v_meta;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_repr_manual_on_curation() from public;
revoke execute on function public.stamp_repr_manual_on_curation() from anon;          -- #831: `from public` NO se lo quita
revoke execute on function public.stamp_repr_manual_on_curation() from authenticated;

comment on function public.stamp_repr_manual_on_curation is
  'BEFORE UPDATE en books: si una persona AUTENTICADA cambia title/cover_url/synopsis fuera de app.hydrating, estampa {"source":"manual"} en la entrada de repr_meta de ese campo (y la BORRA si el campo se vacía). Sin auth.uid() no estampa nada: falla CERRADO para que un app.hydrating olvidado en un bulk/backfill no marque manual el catálogo entero. No hereda el lang viejo a propósito: el valor curado no tiene por qué estar en ese idioma, y repr_lang_rank(NULL)=3 deja el comportamiento igual. Hace real el guard source=manual de hydrate_book. Sin grants nuevos: un BEFORE trigger modifica NEW sin comprobar privilegios de columna.';

-- El trigger `trg_stamp_books_repr_manual` (20260884) sigue apuntando a esta misma
-- función: `create or replace` no lo invalida y no hay que recrearlo.

-- ─────────────────────────────────────────────────────────────────────────────
-- A · El alta MANUAL de catálogo nace ya protegida.
--
-- `register_manual_catalog_item` (20260880) INSERTA el título, el autor y la portada
-- que teclea un colaborador y deja `repr_meta` a NULL. El trigger de arriba es BEFORE
-- UPDATE: no se dispara en el INSERT. Resultado, reproducido en dev con la RPC real y
-- una cuenta colaboradora real: título Y portada tecleados a mano, DESTRUIDOS en la
-- primera hidratación (repr_meta ausente = rango 3, y cualquier `es` del proveedor
-- mejora estrictamente sobre 3).
--
-- Es el MISMO error de premisa que causó el Critical de la primera ola: la cabecera de
-- 20260880 justifica dejar `hydrated_at` a NULL escribiendo literalmente «hydrate_book
-- es fill-only, nunca pisa lo que el colaborador escribió». Esa premisa la rompió v3 al
-- pasar a fill-or-upgrade por rango de idioma, y dejó DOS consecuencias, no una.
--
-- Arreglo: el INSERT de la rama de LIBRO escribe la procedencia junto al valor, en la
-- misma sentencia. No vale hacerlo con un UPDATE posterior dentro de la función: ese
-- UPDATE sí dispararía el trigger, pero abre una ventana entre INSERT y UPDATE y hace
-- depender el alta de un trigger en vez del dato.
--
-- Solo la rama de libro: la función sirve a los TRES tipos de ítem y `repr_meta` existe
-- únicamente en `books` (20260882). `movies`/`series` se quedan exactamente como estaban.
--
-- Mapa columna→clave, el mismo que usan el trigger y hydrate_book:
--   p_title → 'title' · p_cover_url → 'cover'
-- `publisher`, `total_pages`, `isbn` y `published_year` NO son campos de representación
-- (no tienen dimensión de idioma) y no llevan entrada.
--
-- Se redefine la función ENTERA con drop + create en vez de `create or replace`: la firma
-- se conserva idéntica, pero el drop explícito es la regla del proyecto para que no pueda
-- quedar una sobrecarga que PostgREST no sabría resolver. Las validaciones de servidor
-- (sesión, rol colaborador+, título obligatorio, páginas no negativas) y los
-- grants/revokes se conservan tal cual.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.register_manual_catalog_item(text, text, text, int, text, text, int, text);

create function public.register_manual_catalog_item(
  p_item_type text,
  p_title text,
  p_creator text default null,
  p_year int default null,
  p_cover_url text default null,
  p_publisher text default null,
  p_total_pages int default null,
  p_isbn text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_title text := nullif(btrim(p_title), '');
  v_creator text := nullif(btrim(p_creator), '');
  v_cover_url text := nullif(btrim(p_cover_url), '');
  v_repr jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  -- Crear ítems a mano es contribución curada → colaborador+ (§7.35). NULL
  -- (perfil sin rol) cae en el coalesce y se rechaza; sin él la comparación
  -- daría NULL y dejaría pasar.
  if coalesce(public.current_user_role(), 'user') not in ('collaborator', 'admin') then
    raise exception 'forbidden';
  end if;

  if v_title is null then
    raise exception 'title required';
  end if;

  if p_total_pages is not null and p_total_pages < 0 then
    raise exception 'invalid page count';
  end if;

  if p_item_type = 'book' then
    -- Procedencia de lo TECLEADO. Sin `lang`: nadie ha declarado en qué idioma
    -- escribió el colaborador, y repr_lang_rank(NULL)=3 da igual porque
    -- `source='manual'` corta antes de mirar el rango.
    -- v_title nunca es null aquí (validado arriba). La portada sí puede faltar, y
    -- entonces NO se estampa: la procedencia describe el valor que hay, y sin valor
    -- no hay procedencia. Estampar 'manual' sobre un hueco lo cerraría para siempre,
    -- incluso para el simple relleno — mismo criterio que el trigger.
    v_repr := v_repr || jsonb_build_object('title', jsonb_build_object('source', 'manual'));
    if v_cover_url is not null then
      v_repr := v_repr || jsonb_build_object('cover', jsonb_build_object('source', 'manual'));
    end if;

    insert into public.books (title, author, published_year, cover_url, publisher, total_pages, isbn, repr_meta)
    values (v_title, v_creator, p_year, v_cover_url, nullif(btrim(p_publisher), ''), p_total_pages, nullif(btrim(p_isbn), ''), v_repr)
    returning id into v_id;
  elsif p_item_type = 'movie' then
    insert into public.movies (title, director, release_year, cover_url)
    values (v_title, v_creator, p_year, v_cover_url)
    returning id into v_id;
  elsif p_item_type = 'series' then
    insert into public.series (title, creator, release_year, cover_url)
    values (v_title, v_creator, p_year, v_cover_url)
    returning id into v_id;
  else
    raise exception 'unknown item type: %', p_item_type;
  end if;

  return v_id;
end;
$function$;

-- `revoke ... from public` NO basta: Supabase concede execute a anon y authenticated
-- por ALTER DEFAULT PRIVILEGES en el momento de crear la funcion, y ese grant es
-- explicito, no via PUBLIC. Hay que nombrar a anon (#831). El drop + create de arriba
-- vuelve a disparar esos default privileges, asi que estos revokes NO son decorativos:
-- sin ellos anon recuperaria el execute que 20260880 le habia quitado.
-- La funcion ya rechaza al anonimo por auth.uid() null; esto es defensa en profundidad.
revoke all on function public.register_manual_catalog_item(text, text, text, int, text, text, int, text) from public;
revoke all on function public.register_manual_catalog_item(text, text, text, int, text, text, int, text) from anon;
grant execute on function public.register_manual_catalog_item(text, text, text, int, text, text, int, text) to authenticated;

comment on function public.register_manual_catalog_item is
  'Alta MANUAL de catálogo (book/movie/series) por colaborador+. Único camino de alta sin id externo; valida sesión, rol y campos EN SERVIDOR (el cliente no es fiable). En la rama de libro escribe repr_meta con source=manual para title y (si viene) cover: sin eso el alta nacía sin procedencia (rango 3) y la primera hydrate_book con un es del proveedor destruía el título y la portada tecleados. hydrated_at se deja a null a propósito para que la ficha entre en el curador — hydrate_book ya NO es fill-only (v3+), es la marca manual la que protege lo curado.';
