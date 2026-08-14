-- create_club_poll pasa a devolver el id del post creado (`returns uuid`, antes
-- `void`) -- createPoll (Task 4 de menciones, issue #320) lo necesita como
-- interactionTargetId para notifyMentions, igual que ya hacen los posts de
-- texto y de actividad compartida (la pregunta de la encuesta es texto libre
-- y puede llevar @menciones). CREATE OR REPLACE no permite cambiar el tipo de
-- retorno de una función existente: DROP + CREATE.
drop function public.create_club_poll(uuid, text, text[], timestamptz);

create function public.create_club_poll(
  p_club_id uuid,
  p_question text,
  p_options text[],
  p_ends_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post_id uuid;
begin
  if not public.is_club_member(p_club_id) then
    raise exception 'forbidden';
  end if;
  if array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    raise exception 'at least two options required';
  end if;
  if p_ends_at <= now() then
    raise exception 'poll end date must be in the future';
  end if;

  insert into public.club_posts (club_id, author_id, kind, body, poll_ends_at)
  values (p_club_id, auth.uid(), 'poll', p_question, p_ends_at)
  returning id into v_post_id;

  insert into public.club_poll_options (post_id, label, position)
  select v_post_id, opt, (ord - 1)::smallint
  from unnest(p_options) with ordinality as t(opt, ord);

  return v_post_id;
end;
$$;

revoke execute on function public.create_club_poll(uuid, text, text[], timestamptz) from public, anon;
grant execute on function public.create_club_poll(uuid, text, text[], timestamptz) to authenticated;
