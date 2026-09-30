-- #906: ISBN-10 and their ISBN-13 (978) equivalents identify the same
-- edition. Existing duplicates are preserved for manual resolution; this
-- migration prevents new valid canonical duplicates without assuming an
-- external ISBN allowlist.
create or replace function public.canonical_isbn13(p_isbn text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_isbn text;
  v_digits text;
  v_sum integer := 0;
  v_i integer;
  v_first_twelve text;
begin
  -- Match ECMAScript String.prototype.trim() used by normalizeIsbn(): its
  -- Unicode whitespace set includes BOM (U+FEFF), but not NEXT LINE (U+0085).
  -- Only ASCII space and hyphen are accepted inside the ISBN afterwards.
  v_isbn := btrim(p_isbn,
    chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) ||
    chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) ||
    chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) ||
    chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) ||
    chr(8239) || chr(8287) || chr(12288) || chr(65279));
  if v_isbn !~ '^[0-9Xx -]+$' then
    return null;
  end if;
  v_digits := replace(replace(v_isbn, '-', ''), ' ', '');

  if v_digits ~ '^[0-9]{13}$' then
    for v_i in 1..13 loop
      v_sum := v_sum + (substr(v_digits, v_i, 1))::integer
                       * case when v_i % 2 = 0 then 3 else 1 end;
    end loop;
    if v_sum % 10 = 0 then
      return v_digits; -- including valid 979 ISBN-13 values
    end if;
    return null;
  end if;

  if v_digits ~ '^[0-9]{9}[0-9Xx]$' then
    for v_i in 1..9 loop
      v_sum := v_sum + (substr(v_digits, v_i, 1))::integer * (11 - v_i);
    end loop;
    v_sum := v_sum + case when upper(substr(v_digits, 10, 1)) = 'X' then 10
                          else substr(v_digits, 10, 1)::integer end;
    if v_sum % 11 <> 0 then
      return null;
    end if;

    v_first_twelve := '978' || substr(v_digits, 1, 9);
    v_sum := 0;
    for v_i in 1..12 loop
      v_sum := v_sum + (substr(v_first_twelve, v_i, 1))::integer
                       * case when v_i % 2 = 0 then 3 else 1 end;
    end loop;
    return v_first_twelve || ((10 - (v_sum % 10)) % 10)::text;
  end if;

  return null;
end;
$$;

create index if not exists book_editions_canonical_isbn_idx
  on public.book_editions (book_id, public.canonical_isbn13(isbn))
  where public.canonical_isbn13(isbn) is not null;

drop trigger if exists book_editions_canonical_isbn_guard on public.book_editions;
drop function if exists public.enforce_book_edition_canonical_isbn();

-- Existing ISBN-10/13 pairs cannot enter a unique index without deleting or
-- merging community data. This private admission ledger preserves those rows,
-- while its primary key gives new canonical identities an atomic owner.
create table private.book_edition_isbn_keys (
  book_id uuid not null references public.books(id) on delete cascade,
  isbn13 text not null,
  row_count integer not null check (row_count >= 0),
  primary key (book_id, isbn13)
);

revoke all on table private.book_edition_isbn_keys from public, anon, authenticated;

insert into private.book_edition_isbn_keys (book_id, isbn13, row_count)
select edition.book_id, public.canonical_isbn13(edition.isbn), count(*)::integer
  from public.book_editions edition
 where public.canonical_isbn13(edition.isbn) is not null
 group by edition.book_id, public.canonical_isbn13(edition.isbn);

create or replace function private.maintain_book_edition_isbn_keys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_isbn13 text;
  v_new_isbn13 text;
  v_claimed integer;
begin
  if tg_op = 'DELETE' then
    v_old_isbn13 := public.canonical_isbn13(old.isbn);
    if v_old_isbn13 is null then
      return old;
    end if;
    update private.book_edition_isbn_keys
       set row_count = row_count - 1
     where book_id = old.book_id and isbn13 = v_old_isbn13 and row_count > 0;
    if not found then
      -- `books` cascades to both this ledger and `book_editions`. PostgreSQL
      -- may remove the key first; its parent is already gone in that path.
      if not exists (select 1 from public.books where id = old.book_id) then
        return old;
      end if;
      raise exception 'canonical isbn admission key missing for deleted edition';
    end if;
    return old;
  end if;

  v_new_isbn13 := public.canonical_isbn13(new.isbn);
  if tg_op = 'UPDATE' then
    v_old_isbn13 := public.canonical_isbn13(old.isbn);
    if new.book_id = old.book_id and v_new_isbn13 is not distinct from v_old_isbn13 then
      return new;
    end if;
  end if;

  -- Claim the new identity first. The PK serializes concurrent writers at all
  -- isolation levels; historical row_count > 0 deliberately rejects a third.
  if v_new_isbn13 is not null then
    insert into private.book_edition_isbn_keys as key (book_id, isbn13, row_count)
    values (new.book_id, v_new_isbn13, 1)
    on conflict (book_id, isbn13) do update
      set row_count = 1
      where key.row_count = 0
    returning row_count into v_claimed;
    if v_claimed is null then
      raise exception 'canonical isbn already exists for book' using errcode = '23505';
    end if;
  end if;

  if tg_op = 'UPDATE' and v_old_isbn13 is not null then
    update private.book_edition_isbn_keys
       set row_count = row_count - 1
     where book_id = old.book_id and isbn13 = v_old_isbn13 and row_count > 0;
    if not found then
      raise exception 'canonical isbn admission key missing for updated edition';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.maintain_book_edition_isbn_keys() from public, anon, authenticated;

create trigger book_editions_canonical_isbn_admission
after insert or update of book_id, isbn or delete on public.book_editions
for each row execute function private.maintain_book_edition_isbn_keys();

/*
 * The RPC also serializes and reselects at READ COMMITTED so concurrent users
 * get an actual existing edition ID. The private PK is the integrity boundary:
 * a stale REPEATABLE READ snapshot can fail/retry, but can never create a clone.
 */

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
  v_canonical text;
  v_id uuid;
  v_sum integer := 0;
  v_i integer;
begin
  if p_created_by is null then
    raise exception 'auth required';
  end if;

  v_digits := regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g');
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

  v_canonical := public.canonical_isbn13(v_digits);
  if v_canonical is null then
    raise exception 'invalid isbn canonicalization';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_book_id::text || ':' || v_canonical, 906)
  );

  -- A historical ISBN-10/13 pair remains untouched. Return a stable existing
  -- row rather than reporting a successful registration without an edition id.
  select id into v_id
    from public.book_editions
   where book_id = p_book_id
     and public.canonical_isbn13(isbn) = v_canonical
   order by created_at, id
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.book_editions
    (book_id, label, publisher, published_year, total_pages, isbn, cover_url, created_by)
  values
    (p_book_id, coalesce(nullif(trim(p_label), ''), 'Edición'), p_publisher,
     public.sane_int(p_year, 1400, 2200), public.sane_int(p_pages, 1, 20000),
     v_digits, p_cover_url, p_created_by)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_verified_book_edition(uuid, uuid, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.register_verified_book_edition(uuid, uuid, text, text, text, integer, integer, text) to service_role;

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
