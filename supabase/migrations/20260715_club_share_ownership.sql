-- SEGURIDAD: compartir a un club solo concede visibilidad sobre filas PROPIAS
-- (revisión 2026-07-14).
--
-- El agujero: is_visible_via_club_share() añade un OR a las políticas SELECT de
-- diary_entries / episode_watches / library_entries / progress_sessions que
-- concede lectura a cualquier miembro del club cuyo post activity_share
-- referencie la fila — y el `ref` {sourceTable, rowId} lo escribía el CLIENTE
-- sin validación alguna (createShareActivityPost inserta lo que llegue). Un
-- usuario podía crear un club propio, insertar un post con el rowId de una fila
-- privada AJENA, y leerla. La única mitigación era que los UUIDs no se adivinan
-- — pero los ids circulan (FeedEvent.id lleva `sourceTable:rowId`).
--
-- El arreglo tiene dos capas:
--
--   1. La política es la garantía: is_visible_via_club_share() gana un tercer
--      parámetro p_owner_id y exige cp.author_id = p_owner_id — un post solo
--      puede dar visibilidad de club a filas DE SU PROPIO AUTOR. Es exactamente
--      la semántica de diseño ("compartir a un club es una elección explícita
--      de audiencia" — del dueño del contenido; el picker de la UI,
--      loadOwnRecentActivity, solo ofrece actividad propia).
--
--   2. El trigger da el error claro: valida en el INSERT que el ref tenga la
--      forma canónica y apunte a una fila del propio autor, en vez de aceptar
--      basura que luego fallaría en silencio al renderizar.
--
-- En prod hay 0 posts activity_share, así que no hay datos que migrar.

-- ── 1. Nueva firma de la función (owner-aware) ──────────────────────────────
create or replace function public.is_visible_via_club_share(
  p_source_table text,
  p_row_id uuid,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_posts cp
    where cp.kind = 'activity_share'
      and cp.ref->>'sourceTable' = p_source_table
      and cp.ref->>'rowId' = p_row_id::text
      and cp.author_id = p_owner_id
      and public.is_club_member(cp.club_id)
  );
$$;

comment on function public.is_visible_via_club_share(text, uuid, uuid) is 'True si p_row_id de p_source_table fue compartido como activity_share en un club del que el usuario actual es miembro, Y el autor del post es el dueño de la fila (p_owner_id). El check de autor cierra el agujero de autoconcederse visibilidad sobre filas ajenas insertando un ref manipulado (revisión 2026-07-14).';

revoke all on function public.is_visible_via_club_share(text, uuid, uuid) from public;
grant execute on function public.is_visible_via_club_share(text, uuid, uuid) to anon, authenticated;

-- ── 2. Recablear las 4 políticas a la firma nueva ───────────────────────────
drop policy "diary entries select visible" on public.diary_entries;
create policy "diary entries select visible" on public.diary_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('diary_entries', id, user_id)
  );

drop policy "episode_watches select visible" on public.episode_watches;
create policy "episode_watches select visible" on public.episode_watches
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('episode_watches', id, user_id)
  );

drop policy "library entries select visible" on public.library_entries;
create policy "library entries select visible" on public.library_entries
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('library_entries', id, user_id)
  );

drop policy "progress sessions select visible" on public.progress_sessions;
create policy "progress sessions select visible" on public.progress_sessions
  for select to anon, authenticated
  using (
    public.can_view_profile(user_id)
    or public.is_visible_via_club_share('progress_sessions', id, user_id)
  );

-- Sin dependientes ya: fuera la firma antigua (sin owner check).
drop function public.is_visible_via_club_share(text, uuid);

-- ── 3. Validación del ref en el INSERT ──────────────────────────────────────
-- SECURITY INVOKER a propósito: el trigger lee la fila origen bajo la RLS del
-- llamante, y una fila PROPIA siempre es visible para su dueño — si el exists
-- falla es que la fila no existe o no es tuya, que es exactamente lo que hay
-- que rechazar. La política INSERT de club_posts ya fuerza author_id = auth.uid().
create or replace function public.validate_club_post_ref()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source text;
  v_row uuid;
  v_owned boolean;
begin
  if new.kind <> 'activity_share' then
    -- ref es exclusivo de activity_share; en el resto de kinds no significa
    -- nada y dejarlo pasar solo invita a datos basura.
    if new.ref is not null then
      raise exception 'ref_only_for_activity_share';
    end if;
    return new;
  end if;

  if new.ref is null then
    raise exception 'ref_required';
  end if;

  v_source := new.ref->>'sourceTable';
  begin
    v_row := (new.ref->>'rowId')::uuid;
  exception when others then
    raise exception 'invalid_ref';
  end;

  v_owned := case v_source
    when 'diary_entries' then exists (
      select 1 from public.diary_entries where id = v_row and user_id = new.author_id
    )
    when 'episode_watches' then exists (
      select 1 from public.episode_watches where id = v_row and user_id = new.author_id
    )
    when 'library_entries' then exists (
      select 1 from public.library_entries where id = v_row and user_id = new.author_id
    )
    when 'progress_sessions' then exists (
      select 1 from public.progress_sessions where id = v_row and user_id = new.author_id
    )
    else null
  end;

  if v_owned is distinct from true then
    raise exception 'invalid_ref';
  end if;

  -- Normaliza a la forma canónica: exactamente las dos claves, sin extras.
  new.ref := jsonb_build_object('sourceTable', v_source, 'rowId', v_row::text);
  return new;
end;
$$;

comment on function public.validate_club_post_ref() is 'BEFORE INSERT en club_posts: para kind=activity_share exige que ref sea {sourceTable, rowId} válido y que la fila referenciada pertenezca al AUTOR del post; para el resto de kinds exige ref null. La garantía de lectura es is_visible_via_club_share (que revalida el autor); esto da el error claro en el alta (revisión 2026-07-14).';

create trigger trg_validate_club_post_ref
  before insert on public.club_posts
  for each row execute function public.validate_club_post_ref();

-- ── 4. El índice que sostiene el OR de las políticas ────────────────────────
-- is_visible_via_club_share se evalúa POR FILA candidata en las 4 tablas más
-- consultadas de la app, y club_posts no tenía ningún índice sobre ref -> seq
-- scan por fila. Índice de expresión, parcial a los posts que importan.
create index idx_club_posts_share_ref
  on public.club_posts ((ref->>'sourceTable'), (ref->>'rowId'))
  where kind = 'activity_share';
