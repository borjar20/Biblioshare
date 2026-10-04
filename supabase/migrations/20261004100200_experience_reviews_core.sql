-- One review per person and moment; it lives on the attendance row it depends on.
create table public.experience_moment_reviews (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  moment_id uuid not null,
  participant_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating between 1 and 10),
  body text check (body=btrim(body) and char_length(body) between 1 and 4000),
  share_with_profile boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rating is not null or body is not null),
  unique (moment_id,participant_id),
  foreign key (moment_id,participant_id) references public.experience_moment_participants(moment_id,participant_id) on delete cascade,
  foreign key (moment_id,experience_id) references public.experience_moments(id,experience_id) on delete cascade,
  foreign key (participant_id,experience_id) references public.experience_participants(id,experience_id) on delete cascade
);
create index experience_moment_reviews_root on public.experience_moment_reviews(experience_id);
create index experience_moment_reviews_author on public.experience_moment_reviews(author_id);
create index experience_moment_reviews_moment_root on public.experience_moment_reviews(moment_id,experience_id);
create index experience_moment_reviews_person_root on public.experience_moment_reviews(participant_id,experience_id);

alter table public.experience_moment_reviews enable row level security;
revoke all on public.experience_moment_reviews from public,anon,authenticated;
grant select on public.experience_moment_reviews to anon,authenticated;
grant all on public.experience_moment_reviews to service_role;

-- Inside the group: every review of a lived memory. Outside: author consent per review
-- plus share_identity and a visible profile, as with photos.
create function private.can_view_experience_review(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.experience_moment_reviews r
    join public.experiences e on e.id=r.experience_id
    join public.experience_participants p on p.id=r.participant_id
    where r.id=p_id and e.state='lived'
      and private.moderation_available('experience_review',r.id)
      and private.can_view_experience(e.id)
      and not public.users_are_blocked(r.author_id)
      and (private.can_contribute_experience(e.id)
        or (e.audience='profile' and r.share_with_profile and p.share_identity
          and p.invitation_state='accepted' and public.can_view_profile(r.author_id)
          and not exists(select 1 from public.user_blocks b
            where (b.blocker_id=e.creator_id and b.blocked_id=r.author_id)
               or (b.blocker_id=r.author_id and b.blocked_id=e.creator_id)))));
$$;
revoke all on function private.can_view_experience_review(uuid) from public;
grant execute on function private.can_view_experience_review(uuid) to anon,authenticated;
create policy experience_moment_reviews_read on public.experience_moment_reviews for select
  using(private.can_view_experience_review(id));

-- Defense in depth for any path: a review needs a lived memory, an account and attendance.
create function private.guard_experience_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.experience_moment_participants a
      join public.experience_participants p on p.id=a.participant_id
      join public.experiences e on e.id=a.experience_id
      where a.moment_id=new.moment_id and a.participant_id=new.participant_id and a.experience_id=new.experience_id
        and a.attendance_state='attended' and p.user_id=new.author_id and p.invitation_state='accepted' and e.state='lived')
    then raise exception 'attended lived account required' using errcode='42501'; end if;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function private.guard_experience_review() from public,anon,authenticated;
create trigger experience_moment_reviews_guard before insert or update of rating,body,moment_id,participant_id,author_id
  on public.experience_moment_reviews for each row execute function private.guard_experience_review();

-- Attendance cannot leave a review orphaned; the attendance RPC deletes first when asked.
create function private.guard_reviewed_attendance() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.attendance_state='attended' and new.attendance_state<>'attended' and exists(
    select 1 from public.experience_moment_reviews r where r.moment_id=old.moment_id and r.participant_id=old.participant_id)
    then raise exception 'review exists' using errcode='PT409'; end if;
  return new;
end $$;
revoke all on function private.guard_reviewed_attendance() from public,anon,authenticated;
create trigger experience_attendance_review_guard before update of attendance_state on public.experience_moment_participants
  for each row execute function private.guard_reviewed_attendance();

create function public.experience_save_moment_review(p_moment_id uuid,p_rating smallint,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare root uuid; person uuid; body text:=nullif(btrim(coalesce(p_body,'')),''); existing uuid; saved uuid; recipients uuid[];
begin
  select experience_id into root from public.experience_moments where id=p_moment_id;
  if root is null then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(root);
  if not private.can_contribute_experience(root) then raise exception 'member required' using errcode='42501'; end if;
  if p_rating is not null and p_rating not between 1 and 10 then raise exception 'invalid rating' using errcode='22023'; end if;
  if char_length(body)>4000 then raise exception 'invalid body' using errcode='22023'; end if;
  select p.id into person from public.experience_participants p
    join public.experience_moment_participants a on a.participant_id=p.id and a.moment_id=p_moment_id and a.attendance_state='attended'
    join public.experiences e on e.id=p.experience_id and e.state='lived'
    where p.experience_id=root and p.user_id=auth.uid() and p.invitation_state='accepted';
  if person is null then raise exception 'attended lived member required' using errcode='42501'; end if;
  select id into existing from public.experience_moment_reviews where moment_id=p_moment_id and participant_id=person;
  if p_rating is null and body is null then
    delete from public.experience_moment_reviews where id=existing;
    return jsonb_build_object('id',null,'experienceId',root,'created',false,'notifyUserIds','[]'::jsonb);
  end if;
  insert into public.experience_moment_reviews(experience_id,moment_id,participant_id,author_id,rating,body)
    values(root,p_moment_id,person,auth.uid(),p_rating,body)
    on conflict(moment_id,participant_id) do update set rating=excluded.rating,body=excluded.body
    returning id into saved;
  if existing is null then
    select coalesce(array_agg(p.user_id),'{}') into recipients from public.experience_participants p
      where p.experience_id=root and p.invitation_state='accepted' and p.user_id is not null
        and p.user_id<>auth.uid() and not public.users_are_blocked(p.user_id);
  end if;
  return jsonb_build_object('id',saved,'experienceId',root,'created',existing is null,'notifyUserIds',to_jsonb(coalesce(recipients,'{}')));
end $$;

-- Granting consent needs full group access; withdrawing it (and deleting) is the author's own
-- withdrawal and must work despite blocks or moderation, as with experience_set_share_identity.
create function public.experience_set_review_sharing(p_review_id uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  if p_enabled is null then raise exception 'invalid consent' using errcode='22023'; end if;
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  if p_enabled then
    perform private.experience_lock(r.experience_id);
    if not private.can_contribute_experience(r.experience_id) then raise exception 'member required' using errcode='42501'; end if;
  else perform private.experience_withdrawal_lock(r.experience_id); end if;
  select * into r from public.experience_moment_reviews where id=p_review_id for update;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  if r.author_id<>auth.uid() then raise exception 'author required' using errcode='42501'; end if;
  update public.experience_moment_reviews set share_with_profile=p_enabled,updated_at=now() where id=p_review_id;
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

create function public.experience_delete_moment_review(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_withdrawal_lock(r.experience_id);
  select * into r from public.experience_moment_reviews where id=p_review_id for update;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  if r.author_id<>auth.uid() then raise exception 'author required' using errcode='42501'; end if;
  delete from public.experience_moment_reviews where id=p_review_id;
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

revoke all on function public.experience_save_moment_review(uuid,smallint,text),
  public.experience_set_review_sharing(uuid,boolean),public.experience_delete_moment_review(uuid) from public,anon;
grant execute on function public.experience_save_moment_review(uuid,smallint,text),
  public.experience_set_review_sharing(uuid,boolean),public.experience_delete_moment_review(uuid) to authenticated;

drop function public.experience_set_attendance(uuid,text);
create function public.experience_set_attendance(p_moment_id uuid,p_state text,p_drop_reviews boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare root uuid; person uuid;
begin
  select experience_id into root from public.experience_moments where id=p_moment_id;
  perform private.experience_lock(root);
  if not private.can_contribute_experience(root) then raise exception 'member required' using errcode='42501'; end if;
  select id into person from public.experience_participants where experience_id=root and user_id=auth.uid() and invitation_state='accepted';
  if person is null then raise exception 'member required' using errcode='42501'; end if;
  if p_state is null or p_state not in ('planned','attended','skipped') then raise exception 'invalid attendance' using errcode='22023'; end if;
  -- The trigger rejects orphaning a review; only an explicit confirmation removes it first.
  if p_state<>'attended' and coalesce(p_drop_reviews,false) then
    delete from public.experience_moment_reviews where moment_id=p_moment_id and participant_id=person;
  end if;
  insert into public.experience_moment_participants(experience_id,moment_id,participant_id,attendance_state) values(root,p_moment_id,person,p_state)
    on conflict(moment_id,participant_id) do update set attendance_state=excluded.attendance_state;
  return jsonb_build_object('experienceId',root);
end $$;
revoke all on function public.experience_set_attendance(uuid,text,boolean) from public,anon;
grant execute on function public.experience_set_attendance(uuid,text,boolean) to authenticated;

-- Invoker on purpose: the average is over the rows the caller can read (decisiones.md).
create function public.get_experience_rating_summaries(p_ids uuid[])
returns table(experience_id uuid,moment_id uuid,avg_rating numeric,rating_count integer)
language sql stable security invoker set search_path='' as $$
  select r.experience_id,r.moment_id,round(avg(r.rating)::numeric,1),count(r.rating)::integer
  from public.experience_moment_reviews r
  where r.experience_id=any(p_ids[1:100]) and r.rating is not null
  group by grouping sets((r.experience_id),(r.experience_id,r.moment_id));
$$;
revoke all on function public.get_experience_rating_summaries(uuid[]) from public;
grant execute on function public.get_experience_rating_summaries(uuid[]) to anon,authenticated;

create function public.get_own_experiences_ranked(p_state text default 'all',p_kind text default null,p_companion uuid default null,p_offset integer default 0)
returns setof public.experiences language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then return; end if;
  if p_state is null or p_state not in ('all','planned','lived','cancelled') or (p_kind is not null and not private.is_experience_kind(p_kind))
    or p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'invalid filters' using errcode='22023'; end if;
  return query select e.* from public.experiences e
    join public.experience_participants own on own.experience_id=e.id and own.user_id=auth.uid() and own.invitation_state='accepted'
    left join lateral (select avg(r.rating) a from public.experience_moment_reviews r where r.experience_id=e.id and r.rating is not null) s on true
    where (p_state='all' or (p_state='lived' and e.state<>'cancelled' and exists(select 1 from public.experience_moment_participants m where m.participant_id=own.id and m.attendance_state='attended'))
        or (p_state in ('planned','cancelled') and e.state=p_state))
      and (p_kind is null or exists(select 1 from public.experience_moments m where m.experience_id=e.id and m.kind=p_kind))
      and (p_companion is null or exists(select 1 from public.experience_participants c where c.experience_id=e.id and (c.user_id=p_companion or c.id=p_companion)))
    order by s.a desc nulls last,e.created_at desc,e.id desc limit 21 offset p_offset;
end $$;
revoke all on function public.get_own_experiences_ranked(text,text,uuid,integer) from public,anon;
grant execute on function public.get_own_experiences_ranked(text,text,uuid,integer) to authenticated;
