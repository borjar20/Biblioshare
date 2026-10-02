-- #1299: disposable/local database only. Verify storage after the complete
-- bootstrap, without repairing the enum in the test. All fixtures roll back.
begin;

do $test$
declare
  actor uuid := gen_random_uuid();
  recipient uuid := gen_random_uuid();
  notification_id uuid := gen_random_uuid();
begin
  if not exists (
    select 1
    from pg_catalog.pg_enum e
    join pg_catalog.pg_type t on t.oid = e.enumtypid
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notification_type'
      and e.enumlabel = 'mentioned'
  ) then
    raise exception 'FAIL #1299: empty bootstrap omitted notification_type.mentioned';
  end if;

  insert into auth.users(id) values (actor), (recipient);
  execute 'set local role service_role';
  insert into public.notifications(id, user_id, actor_id, type)
    values (notification_id, recipient, actor, 'mentioned');
  execute 'reset role';

  if (select type::text from public.notifications where id = notification_id)
    is distinct from 'mentioned' then
    raise exception 'FAIL #1299: service-role mention notification did not round-trip';
  end if;
end;
$test$;

rollback;
