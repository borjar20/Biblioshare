-- #708: one inventory for polymorphic references. Curated/user data blocks
-- deletion; provider-derived credits alone cascade. No historical rows removed.
create or replace function private.catalog_reference_rules()
returns table(table_name text, type_column text, id_column text, delete_policy text)
language sql immutable set search_path = '' as $$
  values
    ('passes','item_type','item_id','restrict'),
    ('credits','item_type','item_id','cascade'),
    ('club_activity_items','item_type','item_id','restrict'),
    ('club_activity_opinions','item_type','item_id','restrict'),
    ('club_activity_placements','item_type','item_id','restrict'),
    ('club_rounds','item_type','item_id','restrict'),
    ('collection_items','item_type','item_id','restrict'),
    ('library_entries','item_type','item_id','restrict'),
    ('notes','item_type','item_id','restrict'),
    ('saga_items','item_type','item_id','restrict'),
    ('saga_optional_skips','item_type','item_id','restrict'),
    ('saga_placement_windows','item_type','item_id','restrict'),
    ('saga_placement_windows','after_item_type','after_item_id','restrict'),
    ('saga_placement_windows','before_item_type','before_item_id','restrict'),
    ('saga_route_entries','item_type','item_id','restrict');
$$;
revoke all on function private.catalog_reference_rules() from public, anon, authenticated;

create or replace function private.lock_catalog_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_row jsonb := to_jsonb(new);
  old_row jsonb;
  item_id uuid := (new_row ->> tg_argv[1])::uuid;
  item_type text := new_row ->> tg_argv[0];
  target_table text;
  found_id uuid;
begin
  if tg_op = 'UPDATE' then
    old_row := to_jsonb(old);
    if new_row -> tg_argv[0] is not distinct from old_row -> tg_argv[0]
       and new_row -> tg_argv[1] is not distinct from old_row -> tg_argv[1] then
      return new; -- Existing orphan rows remain editable; no silent backfill.
    end if;
  end if;
  if item_id is null then return new; end if; -- Optional/global or saga-block reference.
  target_table := case item_type when 'book' then 'books' when 'movie' then 'movies' when 'series' then 'series' end;
  if target_table is null then raise exception 'invalid_catalog_reference' using errcode='23503'; end if;
  execute format('select id from public.%I where id=$1 for key share', target_table)
    into found_id using item_id;
  if found_id is null then raise exception 'catalog_item_not_found' using errcode='23503'; end if;
  return new;
end;
$$;
revoke all on function private.lock_catalog_reference() from public, anon, authenticated;

create or replace function private.protect_catalog_references()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rule record; referenced boolean;
begin
  -- The delete row lock waits for reference writers' KEY SHARE locks. At READ
  -- COMMITTED these volatile SQL reads see their committed rows after waiting.
  -- A transaction-wide old snapshot cannot safely emulate an FK crosscheck.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'catalog_delete_requires_read_committed' using errcode='25000';
  end if;
  for rule in select * from private.catalog_reference_rules() where delete_policy='restrict' loop
    execute format('select exists(select 1 from public.%I where %I=$1 and %I=$2)',
      rule.table_name, rule.type_column, rule.id_column)
      into referenced using tg_argv[0]::public.item_type, old.id;
    if referenced then
      raise exception 'catalog_item_has_references' using errcode='23503',
        hint='Reassign or remove references explicitly before deleting the catalog item';
    end if;
  end loop;
  for rule in select * from private.catalog_reference_rules() where delete_policy='cascade' loop
    execute format('delete from public.%I where %I=$1 and %I=$2',
      rule.table_name, rule.type_column, rule.id_column)
      using tg_argv[0]::public.item_type, old.id;
  end loop;
  return old;
end;
$$;
revoke all on function private.protect_catalog_references() from public, anon, authenticated;

do $install$
declare rule record; target text; kind text;
begin
  for rule in select * from private.catalog_reference_rules() loop
    execute format('create trigger %I before insert or update of %I,%I on public.%I for each row execute function private.lock_catalog_reference(%L,%L)',
      'trg_catalog_reference_' || rule.type_column, rule.type_column, rule.id_column,
      rule.table_name, rule.type_column, rule.id_column);
  end loop;
  foreach target in array array['books','movies','series'] loop
    kind := case target when 'books' then 'book' when 'movies' then 'movie' else 'series' end;
    execute format('drop trigger if exists %I on public.%I', 'trg_' || target || '_forbid_delete_with_passes', target);
    execute format('drop trigger if exists %I on public.%I', 'trg_' || target || '_cascade_credits', target);
    execute format('create trigger %I before delete on public.%I for each row execute function private.protect_catalog_references(%L)',
      'trg_' || target || '_protect_catalog_references', target, kind);
  end loop;
end;
$install$;
drop function private.forbid_delete_with_passes();
drop function private.cascade_delete_credits();
