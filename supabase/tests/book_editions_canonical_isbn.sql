-- #906: canonical ISBN admission. All fixtures and trigger-state changes are
-- local to this transaction and disappear on rollback.
begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then raise exception 'assertion_failed: %', p_message; end if;
end;
$function$;

-- Pre-migration fixture plus the ledger state that the migration backfill creates.
alter table public.book_editions disable trigger book_editions_canonical_isbn_admission;
do $seed$
declare actor uuid := '00000000-0000-4000-8000-000000000906'; historical_book uuid := '00000000-0000-4000-8000-000000000961';
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values (actor,'authenticated','authenticated','canonical-isbn-906@example.test',now(),now());
  insert into public.profiles(user_id,username,role) values (actor,'canonical_isbn_906','collaborator');
  insert into public.books(id,title) values
    (historical_book,'[TEST #906] historical pair'),
    ('00000000-0000-4000-8000-000000000962','[TEST #906] delete and readd'),
    ('00000000-0000-4000-8000-000000000965','[TEST #906] on conflict'),
    ('00000000-0000-4000-8000-000000000966','[TEST #906] move destination'),
    ('00000000-0000-4000-8000-000000000968','[TEST #906] cascade delete'),
    ('00000000-0000-4000-8000-000000000969','[TEST #906] ECMAScript trim');
  insert into public.book_editions(id,book_id,label,isbn,created_by) values
    ('00000000-0000-4000-8000-000000000963',historical_book,'[TEST #906] ISBN-10','8433920421',actor),
    ('00000000-0000-4000-8000-000000000964',historical_book,'[TEST #906] ISBN-13','9788433920423',actor);
  insert into private.book_edition_isbn_keys(book_id,isbn13,row_count)
  select book_id, public.canonical_isbn13(isbn), count(*)::integer from public.book_editions
  where book_id=historical_book group by book_id, public.canonical_isbn13(isbn);
end;
$seed$;
alter table public.book_editions enable trigger book_editions_canonical_isbn_admission;

do $test$
declare
  actor uuid := '00000000-0000-4000-8000-000000000906'; historical_book uuid := '00000000-0000-4000-8000-000000000961';
  readd_book uuid := '00000000-0000-4000-8000-000000000962'; conflict_book uuid := '00000000-0000-4000-8000-000000000965'; moved_book uuid := '00000000-0000-4000-8000-000000000966';
  cascade_book uuid := '00000000-0000-4000-8000-000000000968';
  trim_book uuid := '00000000-0000-4000-8000-000000000969';
  historical_first uuid := '00000000-0000-4000-8000-000000000963'; edition_id uuid; trim_edition_id uuid; nel_edition_id uuid; rpc_id uuid; blocked boolean := false; checks integer := 0;
begin
  perform pg_temp.assert_true(public.canonical_isbn13('8433920421')='9788433920423','valid ISBN-10 becomes its 978 ISBN-13');
  perform pg_temp.assert_true(public.canonical_isbn13('9788433920423')='9788433920423','valid ISBN-13 remains canonical');
  perform pg_temp.assert_true(public.canonical_isbn13('9791234567896')='9791234567896','valid 979 ISBN-13 remains canonical');
  perform pg_temp.assert_true(public.canonical_isbn13('155404295X') is not null,'valid ISBN-10 with X check digit remains canonical');
  perform pg_temp.assert_true(public.canonical_isbn13('isbn10terminadoX') is null,'letters around ISBN-10 do not normalize');
  perform pg_temp.assert_true(public.canonical_isbn13('8433920422') is null,'invalid checksum has no canonical identity');
  perform pg_temp.assert_true(public.canonical_isbn13(chr(160) || '8433920421' || chr(160))='9788433920423','ECMAScript trim accepts NBSP at ISBN boundaries');
  perform pg_temp.assert_true(public.canonical_isbn13(chr(65279) || '8433920421' || chr(65279))='9788433920423','ECMAScript trim accepts BOM at ISBN boundaries');
  perform pg_temp.assert_true(public.canonical_isbn13(chr(133) || '8433920421' || chr(133)) is null,'ECMAScript trim rejects NEXT LINE at ISBN boundaries');
  checks := checks + 9;

  perform pg_temp.assert_true(not has_function_privilege('anon','public.register_book_edition(uuid,text,text,text,integer,integer,text)'::regprocedure,'execute'),'anon cannot call manual RPC');
  perform pg_temp.assert_true(has_function_privilege('authenticated','public.register_book_edition(uuid,text,text,text,integer,integer,text)'::regprocedure,'execute'),'authenticated retains manual RPC');
  perform pg_temp.assert_true(not has_function_privilege('authenticated','public.register_verified_book_edition(uuid,uuid,text,text,text,integer,integer,text)'::regprocedure,'execute'),'authenticated cannot call verified RPC');
  perform pg_temp.assert_true(has_function_privilege('service_role','public.register_verified_book_edition(uuid,uuid,text,text,text,integer,integer,text)'::regprocedure,'execute'),'service_role retains verified RPC');
  perform pg_temp.assert_true(not has_table_privilege('authenticated','private.book_edition_isbn_keys','select'),'authenticated cannot read private ledger');
  checks := checks + 5;

  perform pg_temp.assert_true((select count(*) from public.book_editions where book_id=historical_book)=2,'historical ISBN-10/ISBN-13 pair remains intact');
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=historical_book and isbn13='9788433920423')=2,'backfill records historical pair count');
  checks := checks + 2;

  execute 'set local role service_role';
  rpc_id := public.register_verified_book_edition(historical_book,actor,'9788433920423');
  perform pg_temp.assert_true(rpc_id=historical_first,'service RPC reselects historical canonical row');
  execute 'reset role';
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000906","role":"authenticated"}',true);
  execute 'set local role authenticated';
  rpc_id := public.register_book_edition(historical_book,'9788433920423');
  perform pg_temp.assert_true(rpc_id=historical_first,'manual RPC reselects historical canonical row');
  begin
    insert into public.book_editions(book_id,label,isbn,created_by) values (historical_book,'[TEST #906] forbidden third','978-84-339-2042-3',actor);
  exception when unique_violation then blocked := true;
  end;
  perform pg_temp.assert_true(blocked,'new third row is rejected for historical canonical pair');
  checks := checks + 3;

  insert into public.book_editions(book_id,label,isbn,created_by) values (readd_book,'[TEST #906] delete','8433920421',actor) returning id into edition_id;
  delete from public.book_editions where id=edition_id;
  execute 'reset role';
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=readd_book and isbn13='9788433920423')=0,'deleting final row releases key');
  execute 'set local role authenticated';
  insert into public.book_editions(book_id,label,isbn,created_by) values (readd_book,'[TEST #906] readd','9788433920423',actor) returning id into edition_id;
  perform pg_temp.assert_true(edition_id is not null,'released key admits replacement');
  checks := checks + 3;

  insert into public.book_editions(book_id,label,isbn,created_by) values (conflict_book,'[TEST #906] original','8433920421',actor) returning id into edition_id;
  insert into public.book_editions(book_id,label,isbn,created_by) values (conflict_book,'[TEST #906] ignored exact duplicate','8433920421',actor) on conflict (book_id,isbn) where isbn is not null do nothing;
  delete from public.book_editions where id=edition_id;
  execute 'reset role';
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=conflict_book and isbn13='9788433920423')=0,'ON CONFLICT DO NOTHING does not reserve key');
  execute 'set local role authenticated';
  insert into public.book_editions(book_id,label,isbn,created_by) values (conflict_book,'[TEST #906] admitted after exact conflict','9788433920423',actor) returning id into edition_id;
  checks := checks + 3;

  insert into public.book_editions(book_id,label,isbn,created_by) values (trim_book,'[TEST #906] BOM direct',chr(65279) || '8433920421' || chr(65279),actor) returning id into trim_edition_id;
  blocked := false;
  begin
    insert into public.book_editions(book_id,label,isbn,created_by) values (trim_book,'[TEST #906] NBSP duplicate',chr(160) || '9788433920423' || chr(160),actor);
  exception when unique_violation then blocked := true;
  end;
  insert into public.book_editions(book_id,label,isbn,created_by) values (trim_book,'[TEST #906] NEXT LINE non-ISBN',chr(133) || '8433920421' || chr(133),actor) returning id into nel_edition_id;
  perform pg_temp.assert_true(trim_edition_id is not null,'direct BOM ISBN insert is admitted with a canonical identity');
  perform pg_temp.assert_true(blocked,'direct NBSP ISBN insert is blocked as the same canonical identity');
  perform pg_temp.assert_true(nel_edition_id is not null,'direct NEXT LINE input has no canonical identity and remains independently storable');
  execute 'reset role';
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=trim_book and isbn13='9788433920423')=1,'direct ECMAScript-trimmed ISBN keeps one ledger claim');
  execute 'set local role authenticated';
  checks := checks + 4;

  update public.book_editions set book_id=moved_book where id=edition_id;
  execute 'reset role';
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=conflict_book and isbn13='9788433920423')=0,'moving edition releases old book key');
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=moved_book and isbn13='9788433920423')=1,'moving edition claims destination key');
  checks := checks + 2;

  execute 'set local role authenticated';
  update public.book_editions set isbn='9780441172719' where id=edition_id;
  execute 'reset role';
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=moved_book and isbn13='9788433920423')=0,'changing ISBN releases old canonical key');
  perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=moved_book and isbn13='9780441172719')=1,'changing ISBN claims replacement canonical key');
  checks := checks + 3;

  insert into public.book_editions(book_id,label,isbn,created_by) values (cascade_book,'[TEST #906] cascade','8433920421',actor);
  delete from public.books where id=cascade_book;
  perform pg_temp.assert_true(not exists (select 1 from public.book_editions where book_id=cascade_book),'deleting a book cascades its editions');
  perform pg_temp.assert_true(not exists (select 1 from private.book_edition_isbn_keys where book_id=cascade_book),'deleting a book cascades its admission keys');
  checks := checks + 2;

  perform pg_temp.assert_true(not exists (
    select 1 from (
      select book_id,public.canonical_isbn13(isbn) as isbn13,count(*)::integer as row_count from public.book_editions
      where public.canonical_isbn13(isbn) is not null group by book_id,public.canonical_isbn13(isbn)
    ) editions full join private.book_edition_isbn_keys keys using (book_id,isbn13)
    where coalesce(editions.row_count,0) is distinct from keys.row_count
  ),'admission ledger counts remain consistent');
  checks := checks + 1;
  raise notice 'PASS #906: % canonical ISBN admission checks',checks;
end;
$test$;

rollback;

-- The original #906 collision: a loser ISBN-10 is the same canonical ISBN as
-- a winner ISBN-13.  With no referenced loser edition it must merge safely.
begin;
create or replace function pg_temp.assert_true(p boolean,m text) returns void language plpgsql as $f$ begin if not coalesce(p,false) then raise exception 'assertion_failed: %',m; end if; end $f$;
alter table public.book_editions disable trigger book_editions_canonical_isbn_admission;
do $seed$
declare u uuid:='00000000-0000-4000-8000-000000000987'; l uuid:='00000000-0000-4000-8000-000000000988'; w uuid:='00000000-0000-4000-8000-000000000989';
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at) values(u,'authenticated','authenticated','merge-direct-906@example.test',now(),now());
 insert into public.profiles(user_id,username,role) values(u,'merge_direct_906','collaborator');
 insert into public.books(id,title) values(l,'[TEST #906] direct loser'),(w,'[TEST #906] direct winner');
 insert into public.book_editions(id,book_id,label,isbn,created_by,publisher) values
 ('00000000-0000-4000-8000-000000000990',l,'[TEST #906] loser ISBN-10','8433920421',u,'loser metadata'),
 ('00000000-0000-4000-8000-000000000991',w,'[TEST #906] winner ISBN-13','9788433920423',u,'winner metadata');
 insert into private.book_edition_isbn_keys values(l,'9788433920423',1),(w,'9788433920423',1);
end $seed$;
alter table public.book_editions enable trigger book_editions_canonical_isbn_admission;
do $test$
declare l uuid:='00000000-0000-4000-8000-000000000988'; w uuid:='00000000-0000-4000-8000-000000000989';
begin
 execute 'set local role service_role';
 perform public.merge_book_into(l,w);
 execute 'reset role';
 perform pg_temp.assert_true(not exists(select 1 from public.books where id=l),'ISBN-10/ISBN-13 collision merges the loser book');
 perform pg_temp.assert_true(exists(select 1 from public.book_editions where id='00000000-0000-4000-8000-000000000991' and book_id=w and publisher='winner metadata'),'winner ISBN-13 edition and metadata survive');
 perform pg_temp.assert_true(not exists(select 1 from public.book_editions where id='00000000-0000-4000-8000-000000000990'),'equivalent loser ISBN-10 edition is deduplicated before move');
 perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=w and isbn13='9788433920423')=1 and not exists(select 1 from private.book_edition_isbn_keys where book_id=l),'merge preserves the winner admission key and removes loser keys');
 raise notice 'PASS #906: canonical ISBN-10/ISBN-13 merge collision deduplicates safely';
end $test$;
rollback;

-- A pass on an edition that canonical merge would delete is user state: abort
-- before repointing either book or deleting either edition.
begin;
create or replace function pg_temp.assert_true(p boolean,m text) returns void language plpgsql as $f$ begin if not coalesce(p,false) then raise exception 'assertion_failed: %',m; end if; end $f$;
alter table public.book_editions disable trigger book_editions_canonical_isbn_admission;
do $seed$
declare u uuid:='00000000-0000-4000-8000-000000000981'; l uuid:='00000000-0000-4000-8000-000000000982'; w uuid:='00000000-0000-4000-8000-000000000983';
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at) values(u,'authenticated','authenticated','merge-block-906@example.test',now(),now());
 insert into public.profiles(user_id,username,role) values(u,'merge_block_906','collaborator');
 insert into public.books(id,title) values(l,'[TEST #906] blocked loser'),(w,'[TEST #906] blocked winner');
 insert into public.book_editions(id,book_id,label,isbn,created_by) values
 ('00000000-0000-4000-8000-000000000984',l,'[TEST #906] loser pass edition','8433920421',u),
 ('00000000-0000-4000-8000-000000000985',w,'[TEST #906] winner canonical edition','9788433920423',u);
 insert into private.book_edition_isbn_keys values(l,'9788433920423',1),(w,'9788433920423',1);
 insert into public.passes(id,user_id,item_type,item_id,status,edition_id) values('00000000-0000-4000-8000-000000000986',u,'book',l,'planned','00000000-0000-4000-8000-000000000984');
end $seed$;
alter table public.book_editions enable trigger book_editions_canonical_isbn_admission;
do $test$
declare l uuid:='00000000-0000-4000-8000-000000000982'; w uuid:='00000000-0000-4000-8000-000000000983'; blocked boolean:=false;
begin
 execute 'set local role service_role';
 begin perform public.merge_book_into(l,w); exception when others then
   blocked:=sqlerrm like 'merge_book_into abortada:%book_editions%';
 end;
 perform pg_temp.assert_true(blocked,'canonical merge with a referenced loser edition aborts with its conservative conflict');
 execute 'reset role';
 perform pg_temp.assert_true(exists(select 1 from public.books where id=l) and exists(select 1 from public.books where id=w),'blocked merge preserves both books');
 perform pg_temp.assert_true(exists(select 1 from public.book_editions where id='00000000-0000-4000-8000-000000000984' and book_id=l) and exists(select 1 from public.book_editions where id='00000000-0000-4000-8000-000000000985' and book_id=w),'blocked merge preserves both editions');
 perform pg_temp.assert_true((select item_id from public.passes where id='00000000-0000-4000-8000-000000000986')=l and (select edition_id from public.passes where id='00000000-0000-4000-8000-000000000986')='00000000-0000-4000-8000-000000000984','blocked merge preserves pass item and edition');
 perform pg_temp.assert_true((select row_count from private.book_edition_isbn_keys where book_id=l and isbn13='9788433920423')=1 and (select row_count from private.book_edition_isbn_keys where book_id=w and isbn13='9788433920423')=1,'blocked merge preserves admission ledger');
 raise notice 'PASS #906: canonical merge pass-reference conflict blocks before writes';
end $test$;
rollback;

-- #906 merge regression: canonical equivalents are deduplicated before the
-- move; an edition referenced by a pass still blocks any destructive merge.
begin;
create or replace function pg_temp.assert_true(p_condition boolean, p_message text) returns void language plpgsql as $f$
begin if not coalesce(p_condition,false) then raise exception 'assertion_failed: %',p_message; end if; end;
$f$;
alter table public.book_editions disable trigger book_editions_canonical_isbn_admission;
do $seed$
declare u uuid := '00000000-0000-4000-8000-000000000971'; l uuid := '00000000-0000-4000-8000-000000000972'; w uuid := '00000000-0000-4000-8000-000000000973';
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at) values(u,'authenticated','authenticated','merge-906@example.test',now(),now());
 insert into public.profiles(user_id,username,role) values(u,'merge_906','collaborator');
 insert into public.books(id,title) values(l,'[TEST #906] loser'),(w,'[TEST #906] winner');
 insert into public.book_editions(id,book_id,label,isbn,created_by,publisher) values
 ('00000000-0000-4000-8000-000000000974',l,'[TEST #906] survivor','8433920421',u,'survivor publisher'),
 ('00000000-0000-4000-8000-000000000975',l,'[TEST #906] duplicate','9788433920423',u,'duplicate publisher'),
 ('00000000-0000-4000-8000-000000000976',l,'[TEST #906] invalid loser','bad-isbn',u,'invalid loser'),
 ('00000000-0000-4000-8000-000000000977',w,'[TEST #906] invalid winner','bad-isbn',u,'invalid winner');
 insert into private.book_edition_isbn_keys(book_id,isbn13,row_count) values(l,'9788433920423',2);
 insert into public.passes(id,user_id,item_type,item_id,status,edition_id) values('00000000-0000-4000-8000-000000000978',u,'book',l,'planned','00000000-0000-4000-8000-000000000974');
end;
$seed$;
alter table public.book_editions enable trigger book_editions_canonical_isbn_admission;
do $test$
declare l uuid := '00000000-0000-4000-8000-000000000972'; w uuid := '00000000-0000-4000-8000-000000000973';
begin
 execute 'set local role service_role';
 perform public.merge_book_into(l,w);
 perform pg_temp.assert_true(not exists(select 1 from public.books where id=l),'loser book deleted after canonical merge');
 perform pg_temp.assert_true(exists(select 1 from public.book_editions where id='00000000-0000-4000-8000-000000000974' and book_id=w and publisher='survivor publisher'),'earliest loser canonical edition survives with metadata');
 perform pg_temp.assert_true(not exists(select 1 from public.book_editions where id='00000000-0000-4000-8000-000000000975'),'second historical loser canonical edition is deduplicated');
 perform pg_temp.assert_true(not exists(select 1 from public.book_editions where id='00000000-0000-4000-8000-000000000976'),'invalid ISBN exact duplicate preserves original exact-match deletion rule');
 perform pg_temp.assert_true((select item_id from public.passes where id='00000000-0000-4000-8000-000000000978')=w and (select edition_id from public.passes where id='00000000-0000-4000-8000-000000000978')='00000000-0000-4000-8000-000000000974','pass keeps surviving edition ID and repoints book');
 execute 'reset role';
 perform pg_temp.assert_true(not exists(select 1 from (select book_id,public.canonical_isbn13(isbn) k,count(*)::int c from public.book_editions where public.canonical_isbn13(isbn) is not null group by book_id,public.canonical_isbn13(isbn)) e full join private.book_edition_isbn_keys k on k.book_id=e.book_id and k.isbn13=e.k where coalesce(e.c,0) is distinct from k.row_count),'ledger equals canonical rows after merge');
end;
$test$;
rollback;
