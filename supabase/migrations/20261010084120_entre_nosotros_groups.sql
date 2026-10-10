-- Private saved selections. Membership never grants access to a library.
create table public.comparison_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comparison_groups_owner_idx on public.comparison_groups(owner_id);
create table public.comparison_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.comparison_groups(id) on delete cascade,
  -- Deliberately no auth FK: deleted participants leave an unavailable slot.
  user_id uuid not null,
  position integer not null check (position between 0 and 9),
  unique (group_id, user_id),
  unique (group_id, position) deferrable initially deferred
);
alter table public.comparison_groups enable row level security;
alter table public.comparison_group_members enable row level security;
create policy comparison_groups_owner_select on public.comparison_groups for select to authenticated using (owner_id = (select auth.uid()));
create policy comparison_groups_owner_insert on public.comparison_groups for insert to authenticated with check (owner_id = (select auth.uid()));
create policy comparison_groups_owner_update on public.comparison_groups for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy comparison_groups_owner_delete on public.comparison_groups for delete to authenticated using (owner_id = (select auth.uid()));
create policy comparison_group_members_owner_select on public.comparison_group_members for select to authenticated using (exists (select 1 from public.comparison_groups g where g.id = group_id and g.owner_id = (select auth.uid())));
create policy comparison_group_members_owner_insert on public.comparison_group_members for insert to authenticated with check (exists (select 1 from public.comparison_groups g where g.id = group_id and g.owner_id = (select auth.uid())));
create policy comparison_group_members_owner_update on public.comparison_group_members for update to authenticated using (exists (select 1 from public.comparison_groups g where g.id = group_id and g.owner_id = (select auth.uid()))) with check (exists (select 1 from public.comparison_groups g where g.id = group_id and g.owner_id = (select auth.uid())));
create policy comparison_group_members_owner_delete on public.comparison_group_members for delete to authenticated using (exists (select 1 from public.comparison_groups g where g.id = group_id and g.owner_id = (select auth.uid())));
revoke all on public.comparison_groups, public.comparison_group_members from public, anon, authenticated;
grant select, delete on public.comparison_groups, public.comparison_group_members to authenticated;
grant insert (name), update (name) on public.comparison_groups to authenticated;
grant insert (group_id, user_id, position), update (position) on public.comparison_group_members to authenticated;

create function public.comparison_group_touch() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger comparison_group_touch before insert or update on public.comparison_groups
for each row execute function public.comparison_group_touch();

create function public.comparison_member_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_group uuid; v_owner uuid;
begin
  v_group := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  -- Name is the only writable parent column. Its BEFORE trigger changes the token.
  -- Serialize all membership changes before reading identity/follow or counting.
  update public.comparison_groups set name = name where id = v_group returning owner_id into v_owner;
  if not found then
    -- Cascaded deletion has already removed the parent.
    if tg_op = 'DELETE' then return old; end if;
    raise exception using errcode = '42501', message = 'Group unavailable';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.profiles p where p.user_id = new.user_id)
       or not public.can_view_profile(new.user_id)
       or (new.user_id <> v_owner and not exists (
         select 1 from public.follows f where f.follower_id = v_owner
         and f.followee_id = new.user_id and f.status = 'accepted'
       )) then
      raise exception using errcode = '42501', message = 'Participant unavailable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger comparison_member_guard before insert or update or delete on public.comparison_group_members
for each row execute function public.comparison_member_guard();

create function public.comparison_group_size_check() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_group uuid; v_count integer;
begin
  if tg_table_name = 'comparison_groups' then
    v_group := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_group := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  end if;
  if exists (select 1 from public.comparison_groups where id = v_group) then
    select count(*) into v_count from public.comparison_group_members where group_id = v_group;
    if v_count not between 2 and 10 then
      raise exception using errcode = '22023', message = 'Groups require 2 to 10 participants';
    end if;
  end if;
  return null;
end;
$$;
create constraint trigger comparison_groups_size after insert or update on public.comparison_groups
deferrable initially deferred for each row execute function public.comparison_group_size_check();
create constraint trigger comparison_members_size after insert or update or delete on public.comparison_group_members
deferrable initially deferred for each row execute function public.comparison_group_size_check();

create function public.save_comparison_group(p_id uuid, p_name text, p_user_ids uuid[], p_expected_revision integer)
returns public.comparison_groups language plpgsql security invoker set search_path = '' as $$
declare v_group public.comparison_groups;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Session required'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60
     or p_user_ids is null or cardinality(p_user_ids) not between 2 and 10
     or array_ndims(p_user_ids) <> 1
     or exists (select 1 from unnest(p_user_ids) u where u is null)
     or (select count(distinct u) from unnest(p_user_ids) u) <> cardinality(p_user_ids)
     or (p_id is null and p_expected_revision is not null)
     or (p_id is not null and (p_expected_revision is null or p_expected_revision < 1)) then
    raise exception using errcode = '22023', message = 'Invalid group input';
  end if;
  if p_id is null then
    insert into public.comparison_groups(name) values (btrim(p_name)) returning * into v_group;
  else
    select * into v_group from public.comparison_groups where id = p_id for update;
    if not found then raise exception using errcode = 'PT404', message = 'Group unavailable'; end if;
    if v_group.revision <> p_expected_revision then raise exception using errcode = 'PT409', message = 'Group changed'; end if;
    update public.comparison_groups set name = btrim(p_name) where id = p_id;
    delete from public.comparison_group_members where group_id = p_id;
  end if;
  insert into public.comparison_group_members(group_id, user_id, position)
    select v_group.id, u, (ordinality - 1)::integer from unnest(p_user_ids) with ordinality as participants(u, ordinality);
  select * into v_group from public.comparison_groups where id = v_group.id;
  return v_group;
end;
$$;
create function public.delete_comparison_group(p_id uuid, p_expected_revision integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_revision integer;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Session required'; end if;
  if p_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'Invalid group input';
  end if;
  select revision into v_revision from public.comparison_groups where id = p_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Group unavailable'; end if;
  if v_revision <> p_expected_revision then raise exception using errcode = 'PT409', message = 'Group changed'; end if;
  delete from public.comparison_groups where id = p_id;
  return true;
end;
$$;
revoke execute on function public.comparison_group_touch(), public.comparison_member_guard(), public.comparison_group_size_check() from public, anon, authenticated;
revoke execute on function public.save_comparison_group(uuid,text,uuid[],integer), public.delete_comparison_group(uuid,integer) from public, anon;
grant execute on function public.save_comparison_group(uuid,text,uuid[],integer), public.delete_comparison_group(uuid,integer) to authenticated;
