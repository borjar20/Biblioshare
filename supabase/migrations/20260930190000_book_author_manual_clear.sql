-- #870: a collaborator clearing a book author is deliberate curation, not an
-- unknown value for the next provider response to fill.  Keep the explicit
-- `source=manual` sentinel even when `author` becomes NULL/empty; no author
-- entry still means unknown and remains eligible for hydration.

create or replace function public.stamp_repr_manual_on_curation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_meta    jsonb;
  v_touched boolean := false;
begin
  if coalesce(current_setting('app.hydrating', true), 'off') = 'on' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  v_meta := case when jsonb_typeof(new.repr_meta) = 'object'
                 then new.repr_meta else '{}'::jsonb end;

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

  -- Unlike the language-ranked representation fields above, author is a
  -- fill-only detail.  A human clearing it must survive automation, so its
  -- manual marker is deliberately retained for both NULL and ''.
  if new.author is distinct from old.author then
    v_touched := true;
    v_meta := v_meta || jsonb_build_object('author', jsonb_build_object('source', 'manual'));
  end if;

  if v_touched then
    new.repr_meta := v_meta;
  end if;

  return new;
end;
$function$;

revoke all on function public.stamp_repr_manual_on_curation() from public;
revoke execute on function public.stamp_repr_manual_on_curation() from anon;
revoke execute on function public.stamp_repr_manual_on_curation() from authenticated;

comment on function public.stamp_repr_manual_on_curation() is
  'BEFORE UPDATE en books: si una persona AUTENTICADA cambia title/cover_url/synopsis fuera de app.hydrating, estampa source=manual en repr_meta y borra la entrada si vacía esos campos. Si cambia author, estampa source=manual y conserva el centinela aunque quede NULL o vacío: el vaciado humano no debe rehidratarse. Sin auth.uid() no estampa nada; sin grants nuevos.';

-- The bodies below retain the current signatures, service_role-only ACLs and
-- all existing filling rules.  Author gains the same manual-source guard as
-- the representation fields while keeping absence of `repr_meta.author` as
-- the historical/unknown case that providers may fill.
drop function if exists public.hydrate_books_bulk(jsonb);

create function public.hydrate_books_bulk(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r          jsonb;
  v_row      public.books%rowtype;
  v_meta     jsonb;
  v_touched  boolean;
  v_year     integer;
  v_book_id  uuid;
  v_caller   text := coalesce(current_setting('role', true), 'none');
begin
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
    v_book_id := null;
    begin
      v_book_id := (r ->> 'book_id')::uuid;
    exception when invalid_text_representation then
      v_book_id := null;
    end;
    continue when v_book_id is null;

    select * into v_row from public.books where id = v_book_id for update;
    continue when not found;

    v_meta := case when jsonb_typeof(v_row.repr_meta) = 'object'
                   then v_row.repr_meta else '{}'::jsonb end;

    if coalesce(r ->> 'title', '') <> ''
       and (r ->> 'title_lang') in ('es', 'en', 'other')
       and public.repr_should_write(v_row.title, v_meta, 'title', r ->> 'title_lang')
    then
      v_row.title := left(r ->> 'title', 300);
      v_meta := v_meta || jsonb_build_object('title',
        jsonb_build_object('lang', r ->> 'title_lang', 'source', 'openlibrary'));
      v_touched := true;
    end if;

    if coalesce(r ->> 'cover_url', '') <> ''
       and (r ->> 'cover_lang') in ('es', 'en', 'other')
       and public.repr_should_write(v_row.cover_url, v_meta, 'cover', r ->> 'cover_lang')
    then
      v_row.cover_url := left(r ->> 'cover_url', 2000);
      v_meta := v_meta || jsonb_build_object('cover',
        jsonb_build_object('lang', r ->> 'cover_lang', 'source', 'openlibrary'));
      v_touched := true;
    end if;

    if (v_row.author is null or v_row.author = '')
       and coalesce(r ->> 'author', '') <> ''
       and public.repr_should_write(v_row.author, v_meta, 'author', 'unknown')
    then
      v_row.author := left(r ->> 'author', 200);
      v_touched := true;
    end if;

    if v_row.published_year is null and jsonb_typeof(r -> 'published_year') = 'number' then
      v_year := floor((r ->> 'published_year')::numeric)::integer;
      if v_year between -4000 and 2200 then
        v_row.published_year := v_year;
        v_touched := true;
      end if;
    end if;

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
$function$;

revoke all on function public.hydrate_books_bulk(jsonb) from public;
revoke execute on function public.hydrate_books_bulk(jsonb) from anon;
revoke execute on function public.hydrate_books_bulk(jsonb) from authenticated;
grant execute on function public.hydrate_books_bulk(jsonb) to service_role;

comment on function public.hydrate_books_bulk(jsonb) is
  'Hidratación en lote de libros desde la bibliografía de autor. Escribe título/autor/año/portada, fill-or-upgrade vía repr_should_write, y no marca hydrated_at. source=manual protege también author, incluido un autor vaciado deliberadamente. SOLO service_role; book_id ausente, no-uuid o inexistente, año no numérico y *_lang fuera del vocabulario se saltan.';

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
set search_path = ''
as $function$
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
  v_meta := case when jsonb_typeof(v_row.repr_meta) = 'object'
                 then v_row.repr_meta else '{}'::jsonb end;

  foreach v_field in array array['title','cover','synopsis'] loop
    v_new := p_fields -> v_field;
    continue when v_new is null or jsonb_typeof(v_new) <> 'object';
    v_value := v_new ->> 'value';
    v_source := coalesce(v_new ->> 'source', '');
    v_lang := coalesce(v_new ->> 'lang', '');
    continue when v_value is null or v_value = ''
      or v_source not in ('openlibrary','google_books','wikidata');
    if v_lang not in ('es','en','other') then v_lang := 'unknown'; end if;
    v_current := case v_field
      when 'title' then v_row.title
      when 'cover' then v_row.cover_url
      when 'synopsis' then v_row.synopsis end;
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

  if (v_row.author is null or v_row.author = '')
     and p_author is not null and p_author <> ''
     and public.repr_should_write(v_row.author, v_meta, 'author', 'unknown')
  then
    v_row.author := left(p_author, 200);
  end if;
  if v_row.published_year is null and p_published_year is not null then v_row.published_year := p_published_year; end if;
  if (v_row.genres is null or cardinality(v_row.genres) = 0) and p_genres is not null then v_row.genres := p_genres; end if;
  if v_row.total_pages is null and p_total_pages is not null and p_total_pages between 1 and 20000 then
    v_row.total_pages := p_total_pages;
    if p_pages_source in ('openlibrary','google_books') then
      v_meta := v_meta || jsonb_build_object('pages', jsonb_build_object('source', p_pages_source));
    end if;
  end if;

  update public.books
     set title = v_row.title, author = v_row.author, cover_url = v_row.cover_url,
         synopsis = v_row.synopsis, published_year = v_row.published_year,
         genres = v_row.genres, total_pages = v_row.total_pages,
         repr_meta = v_meta, hydrated_at = now()
   where id = p_book_id;

  if p_wikidata_id is not null and v_row.wikidata_id is null then
    begin
      update public.books set wikidata_id = p_wikidata_id where id = p_book_id and wikidata_id is null;
    exception when unique_violation then null;
    end;
  end if;
  perform set_config('app.hydrating', 'off', true);
end;
$function$;

revoke all on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from public;
revoke execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from anon;
revoke execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) from authenticated;
grant execute on function public.hydrate_book(uuid, jsonb, text[], integer, integer, text, text, text) to service_role;

comment on function public.hydrate_book is
  'Hidratación de una obra. Fill-or-upgrade para representación y fill-only para author/published_year/genres/total_pages; source=manual protege también author, incluido un vaciado deliberado. SOLO service_role.';

comment on column public.books.repr_meta is
  'Procedencia e idioma por campo representable: title|cover|synopsis|author|pages. title/cover/synopsis guardan lang es|en|other|unknown; source: openlibrary|google_books|wikidata|manual. author source=manual significa que un colaborador o admin lo curó, incluso si lo dejó NULL o vacío, y los automatismos no lo rellenan. La ausencia de repr_meta.author significa autor desconocido y sigue siendo hidratable. LO ESCRIBEN: hydrate_book, hydrate_books_bulk, register_manual_catalog_item y el trigger trg_stamp_books_repr_manual; authenticated no tiene grant de UPDATE sobre esta columna.';
