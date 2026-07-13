-- Recuento de miembros por club (rediseño de clubes · Paper).
--
-- El problema: la política "club_members select member" solo deja leer filas de
-- club_members si YA eres miembro de ese club. Perfectamente correcto — la
-- lista de miembros de un club es de sus miembros — pero significa que la
-- pantalla "Descubrir" no puede decir "310 miembros" de un club al que no
-- perteneces, que es justo donde ese dato ayuda a decidir si te unes.
--
-- La solución es la misma que ya usa el proyecto para los perfiles privados
-- (profile_identities): una vista que NO es security_invoker, así que salta la
-- RLS de la tabla base, y que por eso expone SOLO un agregado — un número. De
-- la vista no se puede sacar QUIÉN está en el club, únicamente CUÁNTOS.
create view public.club_stats as
  select
    c.id as club_id,
    (
      select count(*)
      from public.club_members m
      where m.club_id = c.id
        and m.status = 'active'
    )::int as member_count
  from public.clubs c;

comment on view public.club_stats is
  'Recuento de miembros activos por club. Bypassa la RLS de club_members al no ser security_invoker; por eso SOLO expone el agregado (cuántos), nunca la identidad de los miembros (quiénes). Lo necesita "Descubrir": un no-miembro no puede leer club_members, pero sí debe ver cuánta gente hay en un club público.';

grant select on public.club_stats to anon, authenticated;
