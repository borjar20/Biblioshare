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
-- C: apertura. El seguidor lee una edición de 600 páginas: umbral 0.565 → p. 339.
insert into public.book_editions(id,book_id,label,total_pages)
  select gen_random_uuid(),id,'[TEST] 600 pp',600 from margin_fixture where k='book';
insert into public.passes(user_id,item_type,item_id,status,position,edition_id)
  select (select id from margin_fixture where k='follower'),'book',id,'in_progress','{"page":300}',
    (select be.id from public.book_editions be where be.book_id=margin_fixture.id and be.total_pages=600)
  from margin_fixture where k='book';
do $$ declare n int; begin
  select count(*) into n from public.margin_note_encounters;
  if n <> 0 then raise exception 'FAIL C1: opened at p.300/600 (%)',n; end if;
end $$;
update public.passes set position='{"page":338}' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
do $$ begin
  if exists(select 1 from public.margin_note_encounters) then raise exception 'FAIL C2: opened at p.338/600'; end if;
end $$;
update public.passes set position='{"page":339}' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e where e.found_via='progress'
      and e.reader_id=(select id from margin_fixture where k='follower')) then raise exception 'FAIL C3: not opened at p.339/600'; end if;
end $$;
-- C4: retroceder no quita el encuentro (339 → 300; 300/600 sigue bastando para la nota retro de C7).
update public.passes set position='{"page":300}' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
do $$ begin
  if not exists(select 1 from public.margin_note_encounters) then raise exception 'FAIL C4: encounter removed on rewind'; end if;
end $$;
-- C5 (fixture): el bloqueo borra el follow; se restaura para que solo el bloqueo explique la ausencia de encuentro.
insert into public.follows(follower_id,followee_id,status)
  select f.id,a.id,'accepted' from margin_fixture f, margin_fixture a where f.k='blocked' and a.k='author';
-- C5: el seguidor ahora la VE; el bloqueado, aunque siga y tenga pase completado, no tiene encuentro.
insert into public.passes(user_id,item_type,item_id,status)
  select (select id from margin_fixture where k='blocked'),'book',id,'completed' from margin_fixture where k='book';
do $$ begin
  if exists(select 1 from public.margin_note_encounters where reader_id=(select id from margin_fixture where k='blocked')) then
    raise exception 'FAIL C5: blocked reader got an encounter'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='follower'),true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.margin_notes where body='[TEST] aquí lloré') then raise exception 'FAIL C6: follower cannot read opened note'; end if;
end $$;
reset role;
-- C7: retroactiva — nota nueva sobre algo que el seguidor ya superó → encuentro 'retro'.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience)
  values ('book',(select id from margin_fixture where k='book'),'{"kind":"ratio","ratio":0.01,"page":4,"pages":400}','Cap. 1','[TEST] retro','followers');
reset role;
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id
      where n.body='[TEST] retro' and e.found_via='retro') then raise exception 'FAIL C7: retro not delivered'; end if;
end $$;
-- C8: serie — la nota del T1E3 no se abre al ver el T1E4, sí al ver el T1E3.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,body,audience)
  values ('series',(select id from margin_fixture where k='series'),'{"kind":"episode","season":1,"episode":3}','[TEST] ep3','followers');
reset role;
insert into public.passes(id,user_id,item_type,item_id,status)
  select gen_random_uuid(),(select id from margin_fixture where k='follower'),'series',id,'in_progress' from margin_fixture where k='series';
insert into public.episode_watches(user_id,series_id,pass_id,season_number,episode_number)
  select (select id from margin_fixture where k='follower'),s.id,p.id,1,4 from margin_fixture s join public.passes p on p.item_id=s.id where s.k='series';
do $$ begin
  if exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] ep3') then
    raise exception 'FAIL C8: opened by a later episode'; end if;
end $$;
insert into public.episode_watches(user_id,series_id,pass_id,season_number,episode_number)
  select (select id from margin_fixture where k='follower'),s.id,p.id,1,3 from margin_fixture s join public.passes p on p.item_id=s.id where s.k='series';
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] ep3') then
    raise exception 'FAIL C9: not opened by its episode'; end if;
end $$;
-- C10: un follow nuevo recibe lo ya superado ('retro').
insert into public.passes(user_id,item_type,item_id,status)
  select (select id from margin_fixture where k='stranger'),'book',id,'completed' from margin_fixture where k='book';
insert into public.follows(follower_id,followee_id,status)
  values ((select id from margin_fixture where k='stranger'),(select id from margin_fixture where k='author'),'accepted');
do $$ begin
  if (select count(*) from public.margin_note_encounters where reader_id=(select id from margin_fixture where k='stranger') and found_via='retro') <> 2 then
    raise exception 'FAIL C10: new follower did not receive both book notes'; end if;
end $$;
-- C11: dejar de seguir oculta lo encontrado; volver a seguir lo recupera.
delete from public.follows where follower_id=(select id from margin_fixture where k='stranger');
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='stranger'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.margin_notes) then raise exception 'FAIL C11: unfollowed reader still reads'; end if;
end $$;
reset role;
-- C11b: volver a seguir recupera lo encontrado.
insert into public.follows(follower_id,followee_id,status)
  values ((select id from margin_fixture where k='stranger'),(select id from margin_fixture where k='author'),'accepted');
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='stranger'),true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.margin_notes) then raise exception 'FAIL C11b: re-followed reader does not read again'; end if;
end $$;
reset role;
-- C12: frontera exacta, espejo de isRatioReached (TS). Obra aparte de 600 páginas, ratio 0.058333333333333334:
-- (ratio+0.03)*600 = 53.0000000000000004 -> TS abre en la p.53 (épsilon 1e-9); sin épsilon SQL abriría en la 54.
create temporary table margin_fixture2(id uuid not null default gen_random_uuid());
grant select on margin_fixture2 to anon, authenticated;
insert into margin_fixture2 default values;
insert into public.books(id,title,total_pages) select id,'[TEST] margin boundary book',600 from margin_fixture2;
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience)
  select 'book',id,'{"kind":"ratio","ratio":0.058333333333333334,"page":35,"pages":600}','Cap. 1','[TEST] frontera','followers' from margin_fixture2;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience)
  select 'book',id,'{"kind":"finish"}','Final','[TEST] final','followers' from margin_fixture2;
reset role;
insert into public.passes(user_id,item_type,item_id,status,position)
  select (select id from margin_fixture where k='follower'),'book',id,'in_progress','{"page":52}' from margin_fixture2;
do $$ begin
  if exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body in ('[TEST] frontera','[TEST] final')) then
    raise exception 'FAIL C12a: boundary note opened at p.52/600'; end if;
end $$;
update public.passes set position='{"page":53}' where user_id=(select id from margin_fixture where k='follower') and item_id=(select id from margin_fixture2);
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] frontera' and e.found_via='progress') then
    raise exception 'FAIL C12b: boundary note not opened at p.53/600'; end if;
  if exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] final') then
    raise exception 'FAIL C12b: finish note opened before finishing'; end if;
end $$;
-- C13: cerrar el pase abre la nota 'finish' con found_via='finish'.
update public.passes set status='completed' where user_id=(select id from margin_fixture where k='follower') and item_id=(select id from margin_fixture2);
do $$ begin
  if not exists(select 1 from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] final' and e.found_via='finish') then
    raise exception 'FAIL C13: completing the pass did not open the finish note via finish'; end if;
end $$;
-- D: hilo privado. El target existe y solo lo ven autor y lector.
do $$ begin
  if not exists(select 1 from public.interaction_targets t join public.margin_note_encounters e on e.id=t.source_id
      where t.kind='margin_encounter' and t.audience_id=e.reader_id and t.href='/margen/'||e.id and t.commentable) then
    raise exception 'FAIL D1: encounter target missing'; end if;
end $$;
do $$ declare who record; seen int; eids uuid[]; begin
  select array_agg(e.id) into eids from public.margin_note_encounters e where e.reader_id=(select id from margin_fixture where k='follower');
  for who in select k,id from margin_fixture where k in ('author','follower','stranger','blocked') loop
    perform set_config('request.jwt.claim.sub',who.id::text,true);
    set local role authenticated;
    -- Directo sobre interaction_targets (sin join a encuentros): prueba su RLS, no la de los encuentros.
    select count(*) into seen from public.interaction_targets t
      where t.kind='margin_encounter' and t.source_id = any(eids);
    if (seen>0) <> (who.k in ('author','follower')) then raise exception 'FAIL D2: % thread visibility %',who.k,seen; end if;
    reset role;
  end loop;
end $$;
-- D3: reclamar avisos de dedicadas — una vez y solo autor/lector.
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience,recipient_id)
  values ('book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','Cap. 30','[TEST] para ti','person',(select id from margin_fixture where k='follower'));
reset role;
update public.passes set status='completed' where user_id=(select id from margin_fixture where k='follower') and item_type='book';
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='stranger'),true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.margin_claim_notices()) then raise exception 'FAIL D3: stranger claimed notices'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='follower'),true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.margin_claim_notices();
  if n <> 1 then raise exception 'FAIL D4: expected one dedicated notice, got %',n; end if;
  select count(*) into n from public.margin_claim_notices();
  if n <> 0 then raise exception 'FAIL D5: notice claimed twice'; end if;
end $$;
reset role;
-- D6: borrar la nota borra encuentros, targets y (por cascada) sus comentarios.
insert into public.comments(author_id,body,interaction_target_id)
  select e.reader_id,'[TEST] hilo',t.id from public.margin_notes n
  join public.margin_note_encounters e on e.note_id=n.id
  join public.interaction_targets t on t.kind='margin_encounter' and t.source_id=e.id
  where n.body='[TEST] para ti';
do $$ begin
  if not exists(select 1 from public.comments where body='[TEST] hilo') then raise exception 'FAIL D6: fixture comment missing'; end if;
end $$;
delete from public.margin_notes where body='[TEST] para ti';
do $$ begin
  if exists(select 1 from public.interaction_targets t where t.kind='margin_encounter'
      and not exists(select 1 from public.margin_note_encounters e where e.id=t.source_id)) then
    raise exception 'FAIL D6: orphan margin_encounter target'; end if;
  if exists(select 1 from public.comments where body='[TEST] hilo') then
    raise exception 'FAIL D6: orphan comment'; end if;
end $$;
-- E: la relación rota (desseguir / bloquear) cierra el hilo también al autor-moderador.
create temporary table margin_leak(enc uuid, tgt uuid, cmt uuid, enc2 uuid);
grant select on margin_leak to anon, authenticated;
insert into margin_leak(enc,tgt)
  select e.id,t.id from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id
  join public.interaction_targets t on t.kind='margin_encounter' and t.source_id=e.id
  where n.body='[TEST] aquí lloré' and e.reader_id=(select id from margin_fixture where k='follower');
insert into public.comments(author_id,body,interaction_target_id)
  select (select id from margin_fixture where k='follower'),'[TEST] privado',tgt from margin_leak;
update margin_leak set cmt=(select id from public.comments where body='[TEST] privado');
-- nota dedicada pendiente de aviso, para el claim con la relación rota
select set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k='author'),true);
set local role authenticated;
insert into public.margin_notes(item_type,item_id,anchor,chapter_label,body,audience,recipient_id)
  values ('book',(select id from margin_fixture where k='book'),'{"kind":"finish"}','Cap. 31','[TEST] dedicada rota','person',(select id from margin_fixture where k='follower'));
reset role;
update margin_leak set enc2=(select e.id from public.margin_note_encounters e join public.margin_notes n on n.id=e.note_id where n.body='[TEST] dedicada rota');
do $$ begin
  if (select enc2 from margin_leak) is null then raise exception 'FAIL E0: dedicated encounter not opened (fixture)'; end if;
end $$;
-- E1: control. Con la relación viva, autor y lector ven target y comentario.
do $$ declare who text; t int; c int; begin
  foreach who in array array['author','follower'] loop
    perform set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k=who),true);
    set local role authenticated;
    select count(*) into t from public.interaction_targets where id=(select tgt from margin_leak);
    select count(*) into c from public.comments where id=(select cmt from margin_leak);
    reset role;
    if t<>1 or c<>1 then raise exception 'FAIL E1: % should see thread (t=%, c=%)',who,t,c; end if;
  end loop;
end $$;
-- E2: el lector deja de seguir al autor: ni el autor ni el lector ven target ni comentario.
delete from public.follows where follower_id=(select id from margin_fixture where k='follower') and followee_id=(select id from margin_fixture where k='author');
do $$ declare who text; t int; c int; begin
  foreach who in array array['author','follower'] loop
    perform set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k=who),true);
    set local role authenticated;
    select count(*) into t from public.interaction_targets where id=(select tgt from margin_leak);
    select count(*) into c from public.comments where id=(select cmt from margin_leak);
    reset role;
    -- El lector sigue viendo SU PROPIO comentario (regla general de comments: c.author_id = auth.uid()); lo que no puede es ver el hilo.
    if t<>0 or (who='author' and c<>0) then raise exception 'FAIL E2: % still sees thread after unfollow (t=%, c=%)',who,t,c; end if;
  end loop;
end $$;
-- E3: vuelve a seguir y el autor lo bloquea: igual.
insert into public.follows(follower_id,followee_id,status)
  values ((select id from margin_fixture where k='follower'),(select id from margin_fixture where k='author'),'accepted');
insert into public.user_blocks(blocker_id,blocked_id)
  values ((select id from margin_fixture where k='author'),(select id from margin_fixture where k='follower'));
do $$ declare who text; t int; c int; begin
  foreach who in array array['author','follower'] loop
    perform set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k=who),true);
    set local role authenticated;
    select count(*) into t from public.interaction_targets where id=(select tgt from margin_leak);
    select count(*) into c from public.comments where id=(select cmt from margin_leak);
    reset role;
    -- El lector sigue viendo SU PROPIO comentario (regla general de comments: c.author_id = auth.uid()); lo que no puede es ver el hilo.
    if t<>0 or (who='author' and c<>0) then raise exception 'FAIL E3: % still sees thread after block (t=%, c=%)',who,t,c; end if;
  end loop;
end $$;
-- E4: con bloqueo (y sin follow) el claim no devuelve la dedicada, a nadie; y jamás una de audiencia 'followers'.
insert into public.follows(follower_id,followee_id,status)
  values ((select id from margin_fixture where k='follower'),(select id from margin_fixture where k='author'),'accepted')
  on conflict do nothing;
do $$ declare who text; n int; begin
  foreach who in array array['author','follower'] loop
    perform set_config('request.jwt.claim.sub',(select id::text from margin_fixture where k=who),true);
    set local role authenticated;
    select count(*) into n from public.margin_claim_notices();
    reset role;
    if n<>0 then raise exception 'FAIL E4: % claimed % notices under a block',who,n; end if;
  end loop;
  if exists(select 1 from public.margin_note_encounters e join public.margin_notes m on m.id=e.note_id
      where m.audience='followers' and e.notified_at is not null) then
    raise exception 'FAIL E4: a followers-audience encounter was claimed'; end if;
  if (select notified_at from public.margin_note_encounters where id=(select enc2 from margin_leak)) is not null then
    raise exception 'FAIL E4: blocked dedicated encounter was marked notified'; end if;
end $$;
-- La tarea 5 añade aquí sus bloques, ANTES del rollback.
rollback;
