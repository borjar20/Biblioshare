-- #1143: dispatch only queued work. Uses the existing environment-specific Vault
-- setup; does not create/change credentials or a production URL.
create or replace function private.dispatch_archive_imports() returns void
language plpgsql security definer set search_path='' as $$
declare app_url text; secret text;
begin
  if not exists(select 1 from public.archive_imports j where j.state='running' and exists(select 1 from public.archive_import_items r where r.job_id=j.id and r.state='pending')) then return; end if;
  select decrypted_secret into app_url from vault.decrypted_secrets where name='app_base_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='cron_secret';
  if app_url is null or secret is null then
    raise warning 'archive imports: scheduler requires app_base_url and cron_secret';
    return;
  end if;
  perform net.http_post(url:=app_url||'/api/cron/archive-imports',headers:=jsonb_build_object('content-type','application/json','x-cron-secret',secret),body:='{}',timeout_milliseconds:=55000);
end $$;
revoke all on function private.dispatch_archive_imports() from public,anon,authenticated;
do $$begin
  if exists(select 1 from cron.job where jobname='archive-imports') then perform cron.unschedule('archive-imports'); end if;
  perform cron.schedule('archive-imports','* * * * *',$job$select private.dispatch_archive_imports();$job$);
end $$;
