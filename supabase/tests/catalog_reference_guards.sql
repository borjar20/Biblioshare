-- #708: actual tables/triggers, synthetic data and rollback only.
begin;
do $test$
declare
  actor uuid := gen_random_uuid(); club uuid := gen_random_uuid(); activity uuid := gen_random_uuid();
  collection uuid := gen_random_uuid(); saga uuid := gen_random_uuid(); child uuid := gen_random_uuid();
  route uuid := gen_random_uuid(); person uuid := gen_random_uuid(); item uuid := gen_random_uuid();
  anchor uuid := gen_random_uuid(); target text; kind public.item_type; ref text; blocked boolean;
  checks integer := 0;
begin
  insert into auth.users(id) values(actor);
  insert into public.profiles(user_id,username) values(actor,'ref708_' || left(replace(actor::text,'-',''),12));
  insert into public.clubs(id,slug,name,owner_id) values(club,'ref708-' || left(replace(club::text,'-',''),12),'[TEST] references',actor);
  insert into public.club_activities(id,club_id,kind,title,created_by) values(activity,club,'tierlist','[TEST] references',actor);
  insert into public.collections(id,user_id,name) values(collection,actor,'[TEST] references');
  insert into public.sagas(id,name) values(saga,'[TEST] references'),(child,'[TEST] child');
  insert into public.saga_routes(id,saga_id,slug,name) values(route,saga,'test-708','[TEST] route');
  insert into public.people(id,name) values(person,'[TEST] provider');
  insert into public.books(id,title) values(anchor,'[TEST] anchor');
  foreach target in array array['books','movies','series'] loop
    kind := case target when 'books' then 'book'::public.item_type when 'movies' then 'movie'::public.item_type else 'series'::public.item_type end;
    execute format('insert into public.%I(id,title) values($1,$2)',target) using item,'[TEST] catalog reference';
    foreach ref in array array['passes','club_activity_items','club_activity_opinions','club_activity_placements',
      'club_rounds','collection_items','library_entries','notes','saga_items','saga_optional_skips',
      'saga_placement_windows','after_anchor','before_anchor','saga_route_entries'] loop
      begin
        case ref
          when 'passes' then insert into public.passes(user_id,item_type,item_id) values(actor,kind,item);
          when 'club_activity_items' then insert into public.club_activity_items(activity_id,item_type,item_id,added_by,position) values(activity,kind,item,actor,1);
          when 'club_activity_opinions' then insert into public.club_activity_opinions(activity_id,user_id,item_type,item_id,comment) values(activity,actor,kind,item,'[TEST] opinion');
          when 'club_activity_placements' then insert into public.club_activity_placements(activity_id,user_id,item_type,item_id,tier,position) values(activity,actor,kind,item,'S',1);
          when 'club_rounds' then insert into public.club_rounds(club_id,period_key,prompt,item_type,item_id) values(club,'2026-09','[TEST] round',kind,item);
          when 'collection_items' then insert into public.collection_items(collection_id,item_type,item_id) values(collection,kind,item);
          when 'library_entries' then insert into public.library_entries(user_id,item_type,item_id) values(actor,kind,item);
          when 'notes' then insert into public.notes(user_id,item_type,item_id,kind,body) values(actor,kind,item,'note','[TEST] note');
          when 'saga_items' then insert into public.saga_items(saga_id,item_type,item_id) values(saga,kind,item);
          when 'saga_optional_skips' then insert into public.saga_optional_skips(user_id,saga_id,item_type,item_id) values(actor,saga,kind,item);
          when 'saga_placement_windows' then insert into public.saga_placement_windows(saga_id,item_type,item_id,after_item_type,after_item_id) values(saga,kind,item,'book',anchor);
          when 'after_anchor' then insert into public.saga_placement_windows(saga_id,child_saga_id,after_item_type,after_item_id) values(saga,child,kind,item);
          when 'before_anchor' then insert into public.saga_placement_windows(saga_id,child_saga_id,before_item_type,before_item_id) values(saga,child,kind,item);
          when 'saga_route_entries' then insert into public.saga_route_entries(route_id,position,item_type,item_id) values(route,1,kind,item);
        end case;
        blocked := false;
        begin
          execute format('delete from public.%I where id=$1',target) using item;
        exception when foreign_key_violation then blocked := true;
        end;
        if not blocked then raise exception 'FAIL: % % did not block deletion', target,ref; end if;
        raise sqlstate 'P7080'; -- Roll back this reference before testing the next one.
      exception when sqlstate 'P7080' then null;
      end;
      checks := checks+1;
    end loop;
    insert into public.credits(item_type,item_id,person_id,role) values(kind,item,person,'author');
    execute format('delete from public.%I where id=$1',target) using item;
    if exists(select 1 from public.credits where item_type=kind and item_id=item) then
      raise exception 'FAIL: derived credit did not cascade';
    end if;
    checks := checks+1;
  end loop;
  blocked := false;
  begin
    insert into public.notes(user_id,item_type,item_id,kind,body) values(actor,'book',item,'note','[TEST] missing target');
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: insertion allowed a missing catalog target'; end if;
  insert into public.notes(user_id,item_type,item_id,kind,body) values(actor,'book',anchor,'note','[TEST] move reference');
  blocked := false;
  begin
    update public.notes set item_id=item where user_id=actor;
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: update allowed a missing catalog target'; end if;
  insert into public.books(id,title) values(item,'[TEST] new target');
  update public.notes set item_id=item where user_id=actor;
  blocked := false;
  begin
    delete from public.books where id=item;
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: moved reference does not protect new target'; end if;
  update public.notes set item_id=anchor where user_id=actor;
  insert into public.saga_placement_windows(saga_id,item_type,item_id,after_child_saga_id)
    values(saga,'book',anchor,child);
  update public.saga_placement_windows set before_item_type='book',before_item_id=item where saga_id=saga;
  blocked := false;
  begin
    delete from public.books where id=item;
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: newly populated optional anchor not protected'; end if;
  update public.saga_placement_windows set before_item_type=null,before_item_id=null where saga_id=saga;
  delete from public.books where id=item;
  if (select count(*) from private.catalog_reference_rules()) <> 15 then raise exception 'FAIL: incomplete reference inventory'; end if;
  if has_function_privilege('authenticated','private.lock_catalog_reference()','execute') or
     has_function_privilege('anon','private.protect_catalog_references()','execute') then raise exception 'FAIL: trigger helpers exposed'; end if;
  raise notice 'PASS #708: % table/type restrictions and cascades, missing target and helper grants',checks;
  raise notice 'PASS #708: reference UPDATE, optional anchor assignment and release';
end;
$test$;
rollback;

begin isolation level repeatable read;
do $test$
declare book uuid := gen_random_uuid(); blocked boolean := false;
begin
  insert into public.books(id,title) values(book,'[TEST #708] old snapshot');
  begin
    delete from public.books where id=book;
  exception when sqlstate '25000' then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: transaction-wide snapshot allowed a catalog delete'; end if;
  raise notice 'PASS #708: old-snapshot deletion rejected';
end;
$test$;
rollback;
