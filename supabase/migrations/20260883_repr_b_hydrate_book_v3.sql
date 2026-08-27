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
