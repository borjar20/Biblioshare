-- EPIC-05 Bloque A — vista de identidad de perfil para el stub de "cuenta
-- privada" (modelo Instagram, decisión Q1 del backlog social-epic.md): permite
-- descubrir y solicitar seguir a un perfil privado mostrando SOLO su identidad
-- (nunca objetivos de lectura ni rol), con el contenido oculto.
--
-- Dos cambios:
--  1) Vista `profile_identities`: expone un subconjunto de IDENTIDAD de CUALQUIER
--     perfil (incl. privados). Al no marcarse security_invoker, corre con los
--     permisos del owner de la vista y bypassa la RLS de profiles a propósito —
--     por eso incluye SOLO columnas de identidad (nunca objetivos ni rol).
--  2) La política SELECT de la FILA COMPLETA de `profiles` pasa de "público u
--     propio" a `can_view_profile` (público | propio | seguidor aceptado), para
--     que un seguidor aceptado de un perfil privado lea su perfil. Los NO
--     seguidores de un perfil privado siguen sin ver la fila completa (objetivos
--     y rol) — solo su identidad vía la vista.
--
-- Nota advisors: el linter marcará esto como "security definer view"; es
-- intencional y aceptado (el objetivo es exponer identidad de perfiles privados
-- para el stub de solicitar-seguir).

create view public.profile_identities as
  select user_id, username, display_name, avatar_url, bio, is_public, created_at
  from public.profiles;

comment on view public.profile_identities is 'Identidad pública de CUALQUIER perfil (incl. privados) para el stub de solicitar-seguir de EPIC-05. Nunca expone objetivos ni rol. Bypassa la RLS de profiles al no ser security_invoker; por eso solo contiene columnas de identidad.';

grant select on public.profile_identities to anon, authenticated;

-- La fila COMPLETA de profiles pasa a ser legible por el mismo criterio que el
-- resto del contenido de perfil: público, propio, O seguidor aceptado
-- (can_view_profile, SD-2). Antes era "público u propio", lo que dejaba a un
-- seguidor aceptado de un perfil privado sin poder leer la fila del perfil (y
-- por tanto viendo el stub en vez del contenido, pese a poder ver el contenido).
-- Los NO seguidores de un perfil privado siguen sin ver la fila completa (objetivos
-- y rol incluidos) — solo su identidad vía profile_identities.
drop policy "profiles public or own readable" on public.profiles;
create policy "profiles visible to viewer" on public.profiles
  for select to anon, authenticated
  using (public.can_view_profile(user_id));
