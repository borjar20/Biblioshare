begin;
create temporary table xp(k text primary key,id uuid not null default gen_random_uuid());
insert into xp(k) values('owner'),('root'),('moment'),('place');
grant select,update on xp to anon,authenticated;
insert into auth.users(id) select id from xp where k='owner';
insert into public.profiles(user_id,username,is_public) select id,'plc_'||left(replace(id::text,'-',''),15),true from xp where k='owner';
-- As postgres (service path): upsert inserts, then updates in place.
update xp set id=public.place_upsert('{"provider":"osm","providerRef":"W123","name":"Museo del Prado","category":"tourism:museum","layer":"poi","lat":40.4138,"lng":-3.6921,"city":"Madrid","region":"Comunidad de Madrid","country":"España","countryCode":"ES","wikidataQid":"Q160112"}') where k='place';
do $$ begin
  if public.place_upsert('{"provider":"osm","providerRef":"W123","name":"Museo Nacional del Prado","category":"tourism:museum","layer":"poi","lat":40.4138,"lng":-3.6921,"city":"Madrid","region":null,"country":"España","countryCode":"ES","wikidataQid":null}')<>(select id from xp where k='place') then raise exception 'FAIL upsert identity'; end if;
  if (select name from public.places where id=(select id from xp where k='place'))<>'Museo Nacional del Prado' then raise exception 'FAIL upsert refresh'; end if;
  if (select wikidata_qid from public.places where id=(select id from xp where k='place'))<>'Q160112' then raise exception 'FAIL qid kept'; end if;
  begin perform public.place_upsert('{"provider":"osm","providerRef":"X1","name":"x","category":"tourism:museum","layer":"poi","lat":0,"lng":0}'); raise exception 'FAIL bad ref'; exception when check_violation then null; end;
  begin perform public.place_upsert('{"provider":"osm","providerRef":"N1","name":"x","category":"tourism:museum","layer":"street","lat":0,"lng":0}'); raise exception 'FAIL bad layer'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from xp where k='owner'),true);
do $$ begin
  -- Clients read places but never write them, directly or through place_upsert.
  if not exists(select 1 from public.places where id=(select id from xp where k='place')) then raise exception 'FAIL places readable'; end if;
  begin perform public.place_upsert('{"provider":"osm","providerRef":"N9","name":"x","category":"tourism:museum","layer":"poi","lat":0,"lng":0}'); raise exception 'FAIL client upsert'; exception when insufficient_privilege then null; end;
  begin insert into public.places(provider,provider_ref,name,category,layer,lat,lng) values('osm','N8','x','tourism:museum','poi',0,0); raise exception 'FAIL direct insert'; exception when insufficient_privilege then null; end;
end $$;
-- Create with placeId: label becomes the official name, whatever the client sent.
update xp set id=(public.experience_create(jsonb_build_object('title','[TEST] places','kind','museum','state','lived','placeLabel','lo que sea','placeId',(select id from xp where k='place')))->>'id')::uuid where k='root';
update xp set id=(select id from public.experience_moments where experience_id=(select id from xp where k='root')) where k='moment';
do $$ declare m public.experience_moments; begin
  select * into m from public.experience_moments where id=(select id from xp where k='moment');
  if m.place_id is distinct from (select id from xp where k='place') or m.place_label<>'Museo Nacional del Prado' then raise exception 'FAIL create link'; end if;
  -- Unknown place id is invalid.
  begin perform public.experience_create(jsonb_build_object('title','x','kind','museum','state','lived','placeId',gen_random_uuid())); raise exception 'FAIL unknown place'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_create('{"title":"x","kind":"museum","state":"lived","placeId":"nope"}'); raise exception 'FAIL bad uuid'; exception when sqlstate '22023' then null; end;
  -- keepPlace is only for existing moments.
  begin perform public.experience_create('{"title":"x","kind":"museum","state":"lived","keepPlace":true}'); raise exception 'FAIL keepPlace on create'; exception when sqlstate '22023' then null; end;
end $$;
do $$ declare rev bigint; m public.experience_moments; begin
  select revision into rev from public.experiences where id=(select id from xp where k='root');
  -- keepPlace preserves link and label even if a different label is sent.
  perform public.experience_save_moment((select id from xp where k='root'),rev,jsonb_build_object('id',(select id from xp where k='moment'),'title','Prado','kind','museum','placeLabel','otra cosa','keepPlace',true));
  select * into m from public.experience_moments where id=(select id from xp where k='moment');
  if m.place_id is distinct from (select id from xp where k='place') or m.place_label<>'Museo Nacional del Prado' then raise exception 'FAIL keepPlace'; end if;
  begin perform public.experience_save_moment((select id from xp where k='root'),rev+1,jsonb_build_object('title','n','kind','museum','keepPlace',true)); raise exception 'FAIL keepPlace on insert'; exception when sqlstate '22023' then null; end;
  begin perform public.experience_save_moment((select id from xp where k='root'),rev+1,jsonb_build_object('id',(select id from xp where k='moment'),'title','n','kind','museum','keepPlace',true,'placeId',(select id from xp where k='place'))); raise exception 'FAIL both'; exception when sqlstate '22023' then null; end;
  -- Plain text clears the link.
  perform public.experience_save_moment((select id from xp where k='root'),rev+1,jsonb_build_object('id',(select id from xp where k='moment'),'title','Prado','kind','museum','placeLabel','Casa de mis padres'));
  select * into m from public.experience_moments where id=(select id from xp where k='moment');
  if m.place_id is not null or m.place_label<>'Casa de mis padres' then raise exception 'FAIL text clears link'; end if;
end $$;
reset role;
-- Grants: place_upsert only for service_role; no PUBLIC execute.
do $$ begin
  if has_function_privilege('authenticated','public.place_upsert(jsonb)','execute') or has_function_privilege('anon','public.place_upsert(jsonb)','execute') then raise exception 'FAIL upsert grants'; end if;
  if not has_function_privilege('service_role','public.place_upsert(jsonb)','execute') then raise exception 'FAIL service grant'; end if;
  if not (select relrowsecurity from pg_class where oid='public.places'::regclass) then raise exception 'FAIL places RLS'; end if;
end $$;
rollback;
