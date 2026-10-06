-- Uses existing Vault secrets without creating or changing any environment configuration.
-- Keep the new job INACTIVE until its target application has been deployed and verified.
-- This is critical in dev: its existing app_base_url must not be assumed to be a dev URL.
create or replace function private.dispatch_cultural_releases() returns void
language plpgsql security definer set search_path='' as $$
declare app_url text; secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name='app_base_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='cron_secret';
  if app_url is null or secret is null then
    raise warning 'cultural releases: scheduler requires existing app_base_url and cron_secret';
    return;
  end if;
  perform net.http_post(url:=rtrim(app_url,'/')||'/api/cron/releases',
    headers:=jsonb_build_object('content-type','application/json','x-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
end $$;
revoke all on function private.dispatch_cultural_releases() from public,anon,authenticated;
do $$ declare job_id bigint;
begin
  if exists(select 1 from cron.job where jobname='cultural-releases') then perform cron.unschedule('cultural-releases'); end if;
  -- Hourly delivery sweep; the endpoint gates TMDB fetching to one successful daily sync.
  job_id:=cron.schedule('cultural-releases','0 * * * *',$job$select private.dispatch_cultural_releases();$job$);
  perform cron.alter_job(job_id,active:=false);
end $$;
