-- #879: a pass reassignment must also move session and comment deep links.
-- Only href changes: ownership, audience, targets and notifications keep their IDs.
begin;

create or replace function private.refresh_pass_interaction_hrefs(p_pass_id uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  with roots(id, href) as (
    select t.id, private.item_interaction_href(p.item_type, p.item_id, t.kind = 'diary_entry')
    from public.passes p
    join public.interaction_targets t on
      (t.kind in ('pass', 'diary_entry') and t.source_id = p.id)
      or (t.kind = 'progress_session' and t.source_id in (
        select s.id from public.progress_sessions s where s.pass_id = p.id
      ))
    where p.id = p_pass_id
  ), desired(id, href) as (
    select id, href from roots
    union all
    select child.id,
      case when parent.href like '%#%' then parent.href
           else parent.href || '#c-' || c.id::text end
    from roots parent
    join public.comments c on c.interaction_target_id = parent.id
    join public.interaction_targets child on child.kind = 'comment' and child.source_id = c.id
  )
  update public.interaction_targets t set href = desired.href
  from desired where t.id = desired.id and t.href is distinct from desired.href;
$function$;
revoke all on function private.refresh_pass_interaction_hrefs(uuid) from public, anon, authenticated, service_role;

-- Keep the existing trigger and its two canonical roots. Refresh descendants
-- only on an actual reassignment; rating/progress updates do not traverse them.
create or replace function private.sync_pass_interaction_targets()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  perform private.upsert_interaction_target('diary_entry', new.id, new.user_id, 'profile', new.user_id,
    private.item_interaction_href(new.item_type, new.item_id, true), true, true, 'review_commented', 'review_liked');
  perform private.upsert_interaction_target('pass', new.id, new.user_id, 'profile', new.user_id,
    private.item_interaction_href(new.item_type, new.item_id), true, true, 'activity_commented', 'activity_liked');
  if tg_op = 'UPDATE' then
    if (old.item_type, old.item_id) is distinct from (new.item_type, new.item_id) then
      perform private.refresh_pass_interaction_hrefs(new.id);
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function private.sync_pass_interaction_targets() from public, anon, authenticated, service_role;

-- Repair already stale links too. Roots converted to posts keep /post/<id>:
-- only the legacy pass/diary_entry/progress_session families are traversed.
do $backfill$
declare pass_id uuid;
begin
  for pass_id in select id from public.passes loop
    perform private.refresh_pass_interaction_hrefs(pass_id);
  end loop;
end $backfill$;

commit;
