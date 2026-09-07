-- #920: automatic registration is server-only; identity and metadata are verified upstream.
create or replace function public.register_verified_book_edition(
  p_book_id uuid,
  p_created_by uuid,
  p_isbn text,
  p_label text default 'Edición',
  p_publisher text default null,
  p_year integer default null,
  p_pages integer default null,
  p_cover_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digits text;
  v_id uuid;
  v_sum integer := 0;
  v_i integer;
begin
  if p_created_by is null then
    raise exception 'auth required';
  end if;

  v_digits := regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g');

  -- Dígito de control: un ISBN mal formado no entra en el catálogo compartido.
  if char_length(v_digits) = 13 then
    for v_i in 1..12 loop
      v_sum := v_sum + (substr(v_digits, v_i, 1))::integer
                       * case when v_i % 2 = 0 then 3 else 1 end;
    end loop;
    if ((10 - (v_sum % 10)) % 10)::text <> substr(v_digits, 13, 1) then
      raise exception 'invalid isbn13';
    end if;
  elsif char_length(v_digits) = 10 then
    for v_i in 1..9 loop
      v_sum := v_sum + (substr(v_digits, v_i, 1))::integer * (11 - v_i);
    end loop;
    v_sum := v_sum + case when upper(substr(v_digits, 10, 1)) = 'X' then 10
                          else (substr(v_digits, 10, 1))::integer end;
    if v_sum % 11 <> 0 then
      raise exception 'invalid isbn10';
    end if;
  else
    raise exception 'invalid isbn length';
  end if;

  insert into public.book_editions
    (book_id, label, publisher, published_year, total_pages, isbn, cover_url, created_by)
  values
    (p_book_id, coalesce(nullif(trim(p_label), ''), 'Edición'), p_publisher,
     public.sane_int(p_year, 1400, 2200), public.sane_int(p_pages, 1, 20000),
     v_digits, p_cover_url, p_created_by)
  on conflict do nothing
  returning id into v_id;

  return v_id;  -- null si ya existía: el alta es idempotente
end;
$$;

revoke all on function public.register_verified_book_edition(uuid, uuid, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.register_verified_book_edition(uuid, uuid, text, text, text, integer, integer, text) to service_role;

-- Keep the manual curator API, with the same privilege as direct edition editing.
create or replace function public.register_book_edition(
  p_book_id uuid, p_isbn text, p_label text default 'Edición',
  p_publisher text default null, p_year integer default null,
  p_pages integer default null, p_cover_url text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('collaborator', 'admin'), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.register_verified_book_edition(p_book_id, auth.uid(), p_isbn,
    p_label, p_publisher, p_year, p_pages, p_cover_url);
end;
$$;
revoke all on function public.register_book_edition(uuid, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.register_book_edition(uuid, text, text, text, integer, integer, text) to authenticated;