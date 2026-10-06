-- Durable, service-only delivery ledger. In-app acceptance is atomic; device delivery is best effort.
create table public.release_deliveries (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.cultural_releases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  release_revision integer not null check(release_revision>0),
  reason text not null check(reason in ('reminder','confirmed','changed','cancelled')),
  consent_generation uuid not null,
  state text not null default 'pending' check(state in ('pending','claimed','accepted','suppressed')),
  available_at timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts>=0),
  accepted_at timestamptz,
  notification_id uuid references public.notifications(id) on delete set null,
  last_error text check(length(last_error)<=2000),
  created_at timestamptz not null default now(),
  constraint release_delivery_dedupe unique(user_id,release_id,consent_generation,release_revision,reason),
  constraint release_delivery_claim_shape check(state<>'claimed' or (claim_token is not null and lease_until is not null)),
  constraint release_delivery_accept_shape check((state='accepted')=(accepted_at is not null))
);
create index release_deliveries_ready on public.release_deliveries(available_at,created_at) where state in ('pending','claimed');
create index release_deliveries_release on public.release_deliveries(release_id);
create index release_deliveries_notification on public.release_deliveries(notification_id) where notification_id is not null;
alter table public.release_deliveries enable row level security;
revoke all on public.release_deliveries from public,anon,authenticated;
grant all on public.release_deliveries to service_role;
create policy release_delivery_service_all on public.release_deliveries for all to service_role using(true) with check(true);

create or replace function private.release_queue_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_reason text;
begin
  if new.revision=old.revision then return new; end if;
  -- A newer revision makes earlier unaccepted work obsolete, even if a worker has a lease.
  update public.release_deliveries set state='suppressed',claim_token=null,lease_until=null
    where release_id=new.id and state in ('pending','claimed') and release_revision<>new.revision;
  if old.status='draft' or new.status='draft' then return new; end if;
  v_reason:=case when new.status='cancelled' then 'cancelled'
    when (old.date_precision='unknown' and new.date_precision<>'unknown')
      or (old.date_precision<>'day' and new.date_precision='day') then 'confirmed'
    else 'changed' end;
  insert into public.release_deliveries(release_id,user_id,release_revision,reason,consent_generation)
    select new.id,s.user_id,new.revision,v_reason,s.consent_generation
    from public.release_subscriptions s where s.release_id=new.id and s.active and s.baseline_revision<new.revision
    on conflict on constraint release_delivery_dedupe do nothing;
  return new;
end $$;
revoke all on function private.release_queue_change() from public,anon,authenticated;
create trigger cultural_release_queue_change after update on public.cultural_releases for each row execute function private.release_queue_change();

create or replace function private.release_invalidate_consent() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.active,new.consent_generation) is distinct from (old.active,old.consent_generation) then
    update public.release_deliveries set state='suppressed',claim_token=null,lease_until=null
      where user_id=new.user_id and release_id=new.release_id and state in ('pending','claimed')
      and (not new.active or consent_generation<>new.consent_generation);
  end if;
  return new;
end $$;
revoke all on function private.release_invalidate_consent() from public,anon,authenticated;
create trigger release_consent_changed after update on public.release_subscriptions for each row execute function private.release_invalidate_consent();

create or replace function public.claim_release_deliveries(p_limit integer default 50,p_now timestamptz default now())
returns table(id uuid,release_id uuid,user_id uuid,release_revision integer,reason text,consent_generation uuid,
  claim_token uuid,lease_until timestamptz,notification_dedupe_key text,release_payload jsonb)
language plpgsql security invoker set search_path='' as $$
begin
  if p_limit is null or p_limit<1 or p_limit>500 or p_now is null then raise exception 'claim_parameters_invalid' using errcode='22023'; end if;
  -- Only an exact day can schedule a reminder. A partial date is never coerced to day 1.
  -- Europe/Madrid civil dates handle DST; subtracting 24 hours would not.
  insert into public.release_deliveries(release_id,user_id,release_revision,reason,consent_generation,available_at)
    select r.id,s.user_id,r.revision,'reminder',s.consent_generation,p_now
    from public.cultural_releases r join public.release_subscriptions s on s.release_id=r.id and s.active
    where r.status='published' and (case when r.date_precision='day' then r.date_value::date else null end)
      = (p_now at time zone 'Europe/Madrid')::date+1
    on conflict on constraint release_delivery_dedupe do nothing;

  update public.release_deliveries d set state='suppressed',claim_token=null,lease_until=null
    where d.state in ('pending','claimed') and not exists(
      select 1 from public.release_subscriptions s join public.cultural_releases r on r.id=s.release_id
      where s.user_id=d.user_id and s.release_id=d.release_id and s.active and s.consent_generation=d.consent_generation
        and r.revision=d.release_revision and ((d.reason='cancelled' and r.status='cancelled') or (d.reason<>'cancelled' and r.status='published'))
        and (d.reason<>'reminder' or (case when r.date_precision='day' then r.date_value::date else null end)
          =(p_now at time zone 'Europe/Madrid')::date+1)
    );

  return query with candidates as (
    select d.id from public.release_deliveries d
    where (d.state='pending' and d.available_at<=p_now) or (d.state='claimed' and d.lease_until<=p_now)
    order by d.available_at,d.created_at,d.id limit p_limit for update skip locked
  ), claimed as (
    update public.release_deliveries d set state='claimed',claim_token=gen_random_uuid(),lease_until=p_now+interval '5 minutes',attempts=d.attempts+1,last_error=null
    from candidates c where d.id=c.id returning d.*
  ) select d.id,d.release_id,d.user_id,d.release_revision,d.reason,d.consent_generation,d.claim_token,d.lease_until,
    'release:'||d.release_id::text||':'||d.consent_generation::text||':'||d.release_revision::text||':'||d.reason||':'||d.user_id::text,
    to_jsonb(r) from claimed d join public.cultural_releases r on r.id=d.release_id;
end $$;
revoke all on function public.claim_release_deliveries(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_release_deliveries(integer,timestamptz) to service_role;

create or replace function public.release_delivery_is_current(p_delivery_id uuid,p_claim_token uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.release_deliveries d
    join public.cultural_releases r on r.id=d.release_id join public.release_subscriptions s on s.release_id=d.release_id and s.user_id=d.user_id
    where d.id=p_delivery_id and d.claim_token=p_claim_token and d.state in ('claimed','accepted') and d.lease_until>now()
      and s.active and s.consent_generation=d.consent_generation and r.revision=d.release_revision
      and ((d.reason='cancelled' and r.status='cancelled') or (d.reason<>'cancelled' and r.status='published'))
      and (d.reason<>'reminder' or (case when r.date_precision='day' then r.date_value::date else null end)=(now() at time zone 'Europe/Madrid')::date+1)
  );
$$;
revoke all on function public.release_delivery_is_current(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_delivery_is_current(uuid,uuid) to service_role;

create or replace function public.accept_release_delivery(p_delivery_id uuid,p_claim_token uuid)
returns table(id uuid,user_id uuid) language plpgsql security invoker set search_path='' as $$
declare delivery public.release_deliveries; current_release public.cultural_releases; consent public.release_subscriptions;
  v_notification uuid; v_inserted uuid; v_key text; v_type public.notification_type;
begin
  select * into delivery from public.release_deliveries where public.release_deliveries.id=p_delivery_id;
  if not found then return; end if;
  -- Lock release -> consent -> delivery, matching the two user/editorial mutations.
  select * into current_release from public.cultural_releases where public.cultural_releases.id=delivery.release_id for update;
  select * into consent from public.release_subscriptions s where s.release_id=delivery.release_id and s.user_id=delivery.user_id for update;
  select * into delivery from public.release_deliveries where public.release_deliveries.id=p_delivery_id for update;
  if delivery.state<>'claimed' or delivery.claim_token is distinct from p_claim_token or delivery.lease_until<=clock_timestamp() then return; end if;
  if consent.active is distinct from true or consent.consent_generation is distinct from delivery.consent_generation
      or current_release.revision<>delivery.release_revision
      or not ((delivery.reason='cancelled' and current_release.status='cancelled') or (delivery.reason<>'cancelled' and current_release.status='published'))
      or (delivery.reason='reminder' and (case when current_release.date_precision='day' then current_release.date_value::date else null end)
        is distinct from (clock_timestamp() at time zone 'Europe/Madrid')::date+1) then
    update public.release_deliveries set state='suppressed',claim_token=null,lease_until=null where public.release_deliveries.id=p_delivery_id;
    return;
  end if;
  v_key:='release:'||delivery.release_id::text||':'||delivery.consent_generation::text||':'||delivery.release_revision::text||':'||delivery.reason||':'||delivery.user_id::text;
  v_type:=case delivery.reason when 'reminder' then 'release_reminder'::public.notification_type
    when 'cancelled' then 'release_cancelled'::public.notification_type else 'release_updated'::public.notification_type end;
  insert into public.notifications(user_id,actor_id,type,target_type,target_id,dedupe_key,context)
    values(delivery.user_id,null,v_type,'release',delivery.release_id,v_key,jsonb_build_object('subject',left(current_release.title,60)))
    on conflict(dedupe_key) do nothing returning public.notifications.id into v_inserted;
  v_notification:=v_inserted;
  if v_notification is null then select n.id into v_notification from public.notifications n where n.dedupe_key=v_key; end if;
  if v_notification is null then raise exception 'release_notification_not_persisted'; end if;
  update public.release_deliveries set state='accepted',accepted_at=now(),notification_id=v_notification,last_error=null
    where public.release_deliveries.id=p_delivery_id;
  -- Existing rows prove acceptance but must never fan out another push on a retry.
  if v_inserted is not null then id:=v_inserted; user_id:=delivery.user_id; return next; end if;
end $$;
revoke all on function public.accept_release_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.accept_release_delivery(uuid,uuid) to service_role;

create or replace function public.retry_release_delivery(p_delivery_id uuid,p_claim_token uuid,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.release_deliveries set state='pending',available_at=now()+interval '1 minute',claim_token=null,lease_until=null,last_error=left(p_error,2000)
    where id=p_delivery_id and claim_token=p_claim_token and state='claimed';
  return found;
end $$;
revoke all on function public.retry_release_delivery(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.retry_release_delivery(uuid,uuid,text) to service_role;
comment on table public.release_deliveries is 'Service-only consent/revision ledger. accepted_at proves durable in-app acceptance; it never proves Web Push/Android delivery.';
