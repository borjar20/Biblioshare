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
          and p.invitation_state='accepted' and public.can_view_profile(r.author_id))));
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

create function public.experience_set_review_sharing(p_review_id uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if r.author_id<>auth.uid() or p_enabled is null then raise exception 'author required' using errcode='42501'; end if;
  update public.experience_moment_reviews set share_with_profile=p_enabled,updated_at=now() where id=p_review_id;
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

create function public.experience_delete_moment_review(p_review_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.experience_moment_reviews;
begin
  select * into r from public.experience_moment_reviews where id=p_review_id;
  if not found then raise exception 'not found' using errcode='PT404'; end if;
  perform private.experience_lock(r.experience_id);
  if r.author_id<>auth.uid() then raise exception 'author required' using errcode='42501'; end if;
  delete from public.experience_moment_reviews where id=p_review_id;
  return jsonb_build_object('experienceId',r.experience_id);
end $$;

revoke all on function public.experience_save_moment_review(uuid,smallint,text),
  public.experience_set_review_sharing(uuid,boolean),public.experience_delete_moment_review(uuid) from public,anon;
grant execute on function public.experience_save_moment_review(uuid,smallint,text),
  public.experience_set_review_sharing(uuid,boolean),public.experience_delete_moment_review(uuid) to authenticated;
