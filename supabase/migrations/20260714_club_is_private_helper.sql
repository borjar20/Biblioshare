-- Arregla la política de solicitud de entrada, que no podía funcionar.
--
-- La política "club_members insert self, request or invite" comprueba que el
-- club sea privado con un `exists (select 1 from clubs ...)`. Pero las subqueries
-- de una política RLS corren con los permisos de QUIEN LLAMA, y la RLS de `clubs`
-- ("clubs select public or member") NO deja a un no-miembro ver un club privado.
--
-- Resultado: el exists devolvía siempre falso y el insert se denegaba SIEMPRE.
-- La solicitud de entrada era imposible — precisamente para el único caso en el
-- que existe.
--
-- Es la misma trampa por la que el modelo original creó club_member_row_exists():
-- cuando una política necesita mirar una tabla que el llamante no puede leer,
-- hace falta un helper SECURITY DEFINER. Este expone lo mínimo: un booleano de
-- visibilidad, nada más.
create or replace function public.club_is_private(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.visibility = 'private'
  );
$$;

revoke all on function public.club_is_private(uuid) from public, anon;
grant execute on function public.club_is_private(uuid) to authenticated;

comment on function public.club_is_private is
  '¿Es privado este club? SECURITY DEFINER porque la RLS de clubs niega la fila de un club privado a quien no es miembro, y la política de solicitud de entrada necesita justo eso. Expone un booleano y nada más.';

drop policy "club_members insert self, request or invite" on public.club_members;

create policy "club_members insert self, request or invite" on public.club_members
  for insert to authenticated
  with check (
    role = 'member'
    and (
      -- Auto-alta en club público: inmediata.
      (
        user_id = (select auth.uid())
        and status = 'active'
        and exists (
          select 1 from public.clubs c
          where c.id = club_id and c.visibility = 'public'
        )
      )
      -- Auto-solicitud en club privado: queda pendiente de moderación.
      -- Vía helper, porque el llamante NO puede leer la fila del club privado.
      or (
        user_id = (select auth.uid())
        and status = 'requested'
        and public.club_is_private(club_id)
      )
      -- Invitación de un moderator+.
      or (
        user_id <> (select auth.uid())
        and status = 'invited'
        and public.has_min_club_role(club_id, 'moderator')
      )
    )
  );

-- ── Avisar a quien puede resolver la solicitud ───────────────────────────────
--
-- Mismo problema, otra cara: para notificar a los moderadores hay que SABER
-- quiénes son, y "club_members select member" solo deja leer el roster si ya
-- eres miembro. Quien solicita, por definición, no lo es — así que el fan-out
-- desde el cliente leería 0 filas y la notificación se perdería en SILENCIO.
--
-- SECURITY DEFINER, y solo hace una cosa: insertar la notificación a los
-- moderadores del club de la solicitud que ACABAS de hacer tú. No devuelve el
-- roster ni nada que el llamante no debiera ver.
create or replace function public.notify_club_join_request(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo puedes disparar el aviso de TU propia solicitud, y solo si existe.
  if not exists (
    select 1 from public.club_members m
    where m.club_id = p_club_id
      and m.user_id = (select auth.uid())
      and m.status = 'requested'
  ) then
    raise exception 'no_pending_request';
  end if;

  insert into public.notifications (user_id, actor_id, type)
  select m.user_id, (select auth.uid()), 'club_join_request'
  from public.club_members m
  where m.club_id = p_club_id
    and m.status = 'active'
    and m.role in ('moderator', 'owner');
end;
$$;

revoke all on function public.notify_club_join_request(uuid) from public, anon;
grant execute on function public.notify_club_join_request(uuid) to authenticated;

comment on function public.notify_club_join_request is
  'Avisa a los moderadores de un club de que has solicitado entrar. SECURITY DEFINER porque quien solicita no puede leer el roster (no es miembro) y el fan-out desde cliente se perdería en silencio. Exige que la solicitud exista y sea tuya.';
