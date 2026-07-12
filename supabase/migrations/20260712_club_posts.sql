-- EPIC-05 Bloque F — Feed del club. Ver
-- docs/superpowers/specs/2026-07-12-epic05-bloque-f-club-feed-design.md. Reutiliza
-- is_club_member/has_min_club_role (Bloque E) y el motor polimórfico
-- reactions/comments (Bloque B, SD-3) — los posts se vuelven un target_kind más.

create type public.club_post_kind as enum ('text', 'activity_share', 'poll');

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  kind public.club_post_kind not null,
  body text not null,              -- texto / caption obligatorio de activity_share / pregunta de poll
  ref jsonb,                       -- solo activity_share: {sourceTable, rowId} -- mismo vocabulario
                                    -- que FeedEvent.id de Bloque C (src/lib/social/feed.ts), partido
                                    -- por ":" en vez de reinventar una nomenclatura paralela
  poll_ends_at timestamptz,        -- solo poll: cierre de votación
  created_at timestamptz not null default now()
);

create table public.club_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  label text not null,
  position smallint not null
);

create table public.club_poll_votes (
  post_id uuid not null references public.club_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id uuid not null references public.club_poll_options(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (post_id, user_id)   -- elección única: una fila por votante, UPSERT para cambiar voto
);

create index idx_club_posts_club on public.club_posts (club_id, created_at desc);
create index idx_club_poll_options_post on public.club_poll_options (post_id, position);
create index idx_club_poll_votes_post on public.club_poll_votes (post_id);

comment on table public.club_posts is 'Posts del feed de un club (EPIC-05 Bloque F). kind=text/activity_share/poll. Sin UPDATE -- no editables, mismo criterio "Reddit-lite" que comments (Bloque B).';
comment on table public.club_poll_options is 'Opciones de una encuesta de club. Sin política de escritura de cliente -- solo se crean vía create_club_poll() (SECURITY DEFINER), atómico con el post.';
comment on table public.club_poll_votes is 'Un voto por usuario por encuesta (PK compuesta = elección única). Sin política de escritura de cliente -- solo vía vote_club_poll() (SECURITY DEFINER), que revalida el cierre server-side.';

-- ── target_kind (Bloque B) gana dos valores: los posts se vuelven
-- reaccionables/comentables, y los comentarios se vuelven reaccionables (like
-- en comentarios, decisión de sesión: app-wide, no solo en posts de club, ya
-- que comparte el mismo target_kind que las reseñas).
alter type public.target_kind add value 'club_post';
alter type public.target_kind add value 'comment';

-- Postgres exige que un valor nuevo de enum esté COMMITted antes de poder
-- usarse (55P04 "unsafe use of new value of enum type") -- y el CHECK y
-- can_view_target() de abajo lo referencian como literal inmediatamente.
-- Cierra la transacción implícita de este script para que quede confirmado
-- antes de su primer uso; no hay BEGIN explícito que cerrar, así que
-- Postgres simplemente reabre una transacción implícita para el resto.
commit;

-- Sin esto, nada impediría insertar un comentario cuyo propio target_type
-- fuera 'comment' (anidación) -- el diseño no la contempla ("hilo plano, sin
-- anidación", Bloque B) y además rompería la terminación de la rama
-- recursiva de can_view_target() de abajo: un comentario cuyo target_id
-- apuntase a sí mismo produciría recursión infinita. El CHECK hace la
-- anidación irrepresentable en el esquema, no solo "no soportada por la UI".
alter table public.comments add constraint comments_no_nesting check (target_type <> 'comment');

-- can_view_target() (Bloque B) gana dos ramas. 'comment' es recursiva sobre
-- la misma función -- termina en una sola pasada porque comments_no_nesting
-- de arriba garantiza que el target de un comentario nunca es otro
-- comentario.
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.diary_entries d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
  end;
$$;

-- ── Visibilidad de actividad compartida a un club: pieza genuinamente nueva
-- de este bloque. Un club_post de kind='activity_share' comparte una fila
-- de diary_entries/episode_watches -- si el que comparte tiene perfil
-- privado y un compañero de club no le sigue, ese compañero igualmente debe
-- poder ver el detalle (decisión de sesión: compartir a un club es una
-- elección explícita de audiencia que prevalece sobre la visibilidad de
-- seguidor/perfil normal, solo dentro de ese club). Se aísla en un helper
-- NUEVO y angosto en vez de tocar can_view_profile() (helper transversal
-- usado por todo el contenido de perfil desde Bloque A, ya verificado --
-- menor riesgo mantenerlo intacto). p_target_type solo puede ser
-- 'diary_entry'/'episode_watch' en la práctica (los únicos dos tipos de fila
-- que activity_share puede referenciar y que a su vez tienen RLS propia que
-- necesita este override); el CASE cubre exactamente esos dos.
create or replace function public.is_visible_via_club_share(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and cp.ref->>'sourceTable' = case p_target_type
        when 'diary_entry' then 'diary_entries'
        when 'episode_watch' then 'episode_watches'
        else null
      end
      and cp.ref->>'rowId' = p_target_id::text
      and public.is_club_member(cp.club_id)
  );
$$;

comment on function public.is_visible_via_club_share(public.target_kind, uuid) is 'True si target_id fue compartido como activity_share en un club del que el usuario actual es miembro (EPIC-05 Bloque F). Extra OR en las políticas SELECT de diary_entries/episode_watches -- NO se integra en can_view_profile() a propósito, ver comentario de la función.';

-- ── Extiende la visibilidad de diary_entries/episode_watches (Bloque A) con
-- el OR de arriba. drop+create porque Postgres no permite ALTER POLICY para
-- cambiar el USING.
drop policy "diary entries select visible" on public.diary_entries;
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('diary_entry', id)
  );

drop policy "episode_watches select visible" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('episode_watch', id)
  );

-- ── RPCs SECURITY DEFINER ────────────────────────────────────────────────
-- create_club_poll: inserta club_posts + club_poll_options atómicamente,
-- mismo patrón que create_club (Bloque E). Revalida "al menos 2 opciones" y
-- "cierre en el futuro" server-side, no solo confía en el chequeo cliente
-- de createPoll() (Dominio, Task 6) -- SECURITY DEFINER es alcanzable
-- directamente vía RPC, no solo desde la app.
create or replace function public.create_club_poll(
  p_club_id uuid,
  p_question text,
  p_options text[],
  p_ends_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
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
end;
$$;

revoke execute on function public.create_club_poll(uuid, text, text[], timestamptz) from public, anon;
grant execute on function public.create_club_poll(uuid, text, text[], timestamptz) to authenticated;

-- vote_club_poll: UPSERT del voto propio (elección única, PK compuesta en
-- club_poll_votes fuerza esto). Revalida "es miembro", "es una encuesta
-- real", "sigue abierta" y "la opción pertenece a este post" -- votar tras
-- el cierre se rechaza aquí, no solo se oculta en la UI.
create or replace function public.vote_club_poll(p_post_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id uuid;
  v_kind public.club_post_kind;
  v_ends_at timestamptz;
begin
  select club_id, kind, poll_ends_at into v_club_id, v_kind, v_ends_at
    from public.club_posts where id = p_post_id;

  if v_club_id is null or v_kind <> 'poll' then
    raise exception 'not a poll';
  end if;
  if not public.is_club_member(v_club_id) then
    raise exception 'forbidden';
  end if;
  if v_ends_at <= now() then
    raise exception 'poll is closed';
  end if;
  if not exists (
    select 1 from public.club_poll_options where id = p_option_id and post_id = p_post_id
  ) then
    raise exception 'invalid option';
  end if;

  insert into public.club_poll_votes (post_id, user_id, option_id)
  values (p_post_id, auth.uid(), p_option_id)
  on conflict (post_id, user_id) do update set option_id = excluded.option_id, voted_at = now();
end;
$$;

revoke execute on function public.vote_club_poll(uuid, uuid) from public, anon;
grant execute on function public.vote_club_poll(uuid, uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.club_posts enable row level security;

create policy "club_posts select member" on public.club_posts
  for select to authenticated
  using (public.is_club_member(club_id));

-- Cualquier miembro activo puede publicar (decisión de sesión: unirse a un
-- club es participar, no gateado a moderator+ como en Bloque E).
create policy "club_posts insert member" on public.club_posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_club_member(club_id));

-- Autor propio o moderator+ (mismo patrón que "club_members delete self or
-- moderate", Bloque E). Sin política UPDATE -- posts no editables.
create policy "club_posts delete self or moderate" on public.club_posts
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.has_min_club_role(club_id, 'moderator')
  );

alter table public.club_poll_options enable row level security;

-- Legible si el club_posts padre lo es. Sin INSERT/UPDATE/DELETE de cliente
-- a propósito -- create_club_poll() (SECURITY DEFINER) es el único camino,
-- mismo patrón que clubs no tener política INSERT (create_club() la
-- bypassa).
create policy "club_poll_options select via post" on public.club_poll_options
  for select to authenticated
  using (
    exists (
      select 1 from public.club_posts cp
      where cp.id = post_id and public.is_club_member(cp.club_id)
    )
  );

alter table public.club_poll_votes enable row level security;

-- has_voted_in_club_poll: la política SELECT de abajo necesita "¿tiene el
-- usuario actual una fila propia en club_poll_votes para esta encuesta?" --
-- pero un exists(...) inline contra la MISMA tabla que la política protege
-- es exactamente el patrón que Postgres rechaza como recursión estructural
-- (error 42P17), igual que el cruce clubs<->club_members de Bloque E
-- (ver comentario de club_member_row_exists() en 20260712_clubs.sql). Mismo
-- remedio: aislarlo en una función SECURITY DEFINER, que al ejecutar como el
-- owner de la función no reevalúa esta política sobre sí misma.
create or replace function public.has_voted_in_club_poll(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_poll_votes
    where post_id = p_post_id and user_id = auth.uid()
  );
$$;

comment on function public.has_voted_in_club_poll(uuid) is 'True si el usuario actual ya tiene un voto propio en esta encuesta de club (EPIC-05 Bloque F). Rompe la recursión estructural (42P17) de la política SELECT de club_poll_votes referenciándose a sí misma -- ver comentario de la función.';

-- Tu propio voto SIEMPRE visible. Los votos de los demás solo una vez que TÚ
-- ya has votado en esa encuesta, o la encuesta ya cerró -- esto es lo que de
-- verdad hace cumplir "resultados ocultos hasta que votas" (decisión de
-- sesión): si la política permitiera ver todos los votos a cualquier
-- miembro, un cliente podría consultar club_poll_votes directamente vía
-- PostgREST y saltarse el ocultamiento que hace listClubPosts() a nivel de
-- aplicación -- la RLS es la garantía real, no solo la capa de dominio.
-- Sin INSERT/UPDATE/DELETE de cliente -- vote_club_poll() (SECURITY
-- DEFINER) es el único camino.
create policy "club_poll_votes select own or revealed" on public.club_poll_votes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.club_posts cp
        where cp.id = post_id and public.is_club_member(cp.club_id)
      )
      and (
        public.has_voted_in_club_poll(post_id)
        or (select poll_ends_at from public.club_posts where id = post_id) <= now()
      )
    )
  );

-- ── Notificaciones de club post (EPIC-05 Bloque F), simétrico a
-- club_invite/club_invite_accepted (Bloque E). club_post enruta a
-- /club/[slug] reutilizando el targetType='club' ya existente en
-- notify()/listNotifications() (sin deep-link al post concreto, decisión de
-- sesión: mantenerlo simple). club_post_liked/club_post_commented/
-- comment_liked dan paridad completa con review_liked/review_commented
-- (decisión de sesión) -- ver Task 5 para su resolución de href.
alter type public.notification_type add value 'club_post';
alter type public.notification_type add value 'club_post_liked';
alter type public.notification_type add value 'club_post_commented';
alter type public.notification_type add value 'comment_liked';
