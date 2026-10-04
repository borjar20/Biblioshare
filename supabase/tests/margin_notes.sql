-- Synthetic fixtures with real roles. Local/dev only; every write rolls back.
begin;
create temporary table margin_fixture(k text primary key, id uuid not null default gen_random_uuid());
insert into margin_fixture(k) values ('author'),('follower'),('stranger'),('blocked'),('book'),('series');
grant select on margin_fixture to anon, authenticated;
insert into auth.users(id) select id from margin_fixture where k in ('author','follower','stranger','blocked');
insert into public.profiles(user_id,username,is_public)
  select id,'mrg_'||left(replace(id::text,'-',''),15),true from margin_fixture where k in ('author','follower','stranger','blocked');
insert into public.books(id,title,total_pages) select id,'[TEST] margin book',400 from margin_fixture where k='book';
insert into public.series(id,title) select id,'[TEST] margin series' from margin_fixture where k='series';
insert into public.series_episodes(series_id,season_number,episode_number,air_date)
  select id,1,e,'2020-01-01' from margin_fixture, generate_series(1,4) e where k='series';
insert into public.follows(follower_id,followee_id,status)
  select f.id,a.id,'accepted' from margin_fixture f, margin_fixture a where f.k in ('follower','blocked') and a.k='author';
insert into public.user_blocks(blocker_id,blocked_id)
  select (select id from margin_fixture where k='author'),id from margin_fixture where k='blocked';

-- A1: el autor escribe; un tercero no puede escribir en su nombre.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience)
  values ('book',(select id from margin_fixture where k='book'),'{"kind":"ratio","ratio":0.535,"page":214,"pages":400}','Cap. 12','[TEST] aquí lloré','followers');
do $$ begin
  begin
    insert into public.margin_notes(author_id,item_type,item_id,anchor,chapter_label,body,audience)
      values ((select id from margin_fixture where k='stranger'),'book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','Cap. 1','[TEST] x','followers');
    raise exception 'FAIL A1: wrote as another author';
  exception when insufficient_privilege then null; end;
  -- A2: dedicada a quien no te sigue → 42501.
  begin
    insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience,recipient_id)
      values ('book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','Cap. 1','[TEST] x','person',(select id from margin_fixture where k='stranger'));
    raise exception 'FAIL A2: dedicated to non-follower';
  exception when insufficient_privilege then null; end;
  -- A3: libro sin capítulo → CHECK.
  begin
    insert into public.margin_notes(item_type,item_id,anchor,body,audience)
      values ('book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','[TEST] x','followers');
    raise exception 'FAIL A3: book without chapter';
  exception when check_violation then null; end;
  -- A4: episodio inexistente → 22023.
  begin
    insert into public.margin_notes(item_type,item_id,anchor,body,audience)
      values ('series',(select id from margin_fixture where k='series'),'{"kind":"episode","season":1,"episode":9}','[TEST] x','followers');
    raise exception 'FAIL A4: unknown episode';
  exception when invalid_parameter_value then null; end;
  -- A5: el ancla no se puede editar (sin grant de columna).
  begin
    update public.margin_notes set anchor='{"kind":"finish"}' where body='[TEST] aquí lloré';
    raise exception 'FAIL A5: anchor updated';
  exception when insufficient_privilege then null; end;
  -- A6: el cliente no escribe encuentros.
  begin
    insert into public.margin_note_encounters(note_id,reader_id,found_via)
      select id,(select id from margin_fixture where k='follower'),'progress' from public.margin_notes where body='[TEST] aquí lloré';
    raise exception 'FAIL A6: client wrote encounter';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- B1: sin encuentro nadie más que el autor ve la nota.
do $$ declare who record; begin
  for who in select k,id from margin_fixture where k in ('follower','stranger','blocked') loop
    perform set_config('request.jwt.claim.sub',who.id::text,true);
    set local role authenticated;
    if exists(select 1 from public.margin_notes where body='[TEST] aquí lloré') then raise exception 'FAIL B1: % sees unopened note',who.k; end if;
    reset role;
  end loop;
end $$;
set local role anon;
do $$ begin
  begin
    if exists(select 1 from public.margin_notes) then raise exception 'FAIL B1: anon reads margin notes'; end if;
  exception when insufficient_privilege then null; end; -- anon no tiene grant: también vale
end $$;
reset role;
-- Las tareas 3 y 4 añaden aquí sus bloques, ANTES del rollback.
rollback;
