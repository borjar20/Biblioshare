-- Fix de la rama `checkpoint_reached` de `private.can_view_interaction_target`.
--
-- La definición anterior (introducida en 20260730212803 y reescrita sin cambios
-- en 20260730213248) era:
--
--     when 'checkpoint_reached' then public.has_reached_checkpoint(t.source_id)
--
-- Dos defectos en una sola línea:
--
-- 1. Leía `t.source_id` en vez de `t.audience_id`, al revés que las otras tres
--    ramas del `case`. Coinciden solo en el target propio del checkpoint. Un
--    target heredado —`private.sync_comment_interaction_target` copia del padre
--    `audience_kind`/`audience_id` pero pone `source_id = new.id`— acababa
--    preguntando `has_reached_checkpoint(<uuid del comentario>)`, que es siempre
--    falso. Resultado: la fila del comentario en el chat de un checkpoint es
--    visible por la política de `comments`, pero su target canónico NO, que es
--    justo el estado que `getInteractionSummary` trata como corrupción
--    (`Interaction target missing for comment:<id>`). Un solo comentario dejaba
--    `/club/<slug>/actividad/<id>` en 500 permanente para todos los
--    participantes, sin auto-curación. También rompía las reacciones a esos
--    comentarios y la resolución de menciones de `addComment`.
--
-- 2. Comprobaba solo la fila de lectura, perdiendo el conjunto
--    `is_activity_participant` que `public.can_view_target('activity_checkpoint',…)`
--    sí exige. Salir de una actividad o ser expulsado del club no borra
--    `club_activity_checkpoint_reads`, así que un ex-participante conservaba
--    acceso de lectura al chat del checkpoint por la Data API. Como el SELECT de
--    `comments`/`reactions` delega ya por completo en esta función, era una
--    ampliación de privilegio introducida por esta rama.
--
-- Ambos cierran delegando en `public.can_view_target('activity_checkpoint', …)`
-- sobre `t.audience_id`, que es la definición canónica de "puedo ver este
-- checkpoint" y exige los dos conjuntos.
--
-- Seguridad de la delegación (verificado contra `pg_proc` en dev, no contra
-- ficheros de migración):
--   · `public.can_view_target` es STABLE SECURITY DEFINER, owner `postgres`,
--     `search_path = 'public, pg_temp'`, y su rama `activity_checkpoint` exige
--     `public.is_activity_participant(cc.activity_id)` AND
--     `public.has_reached_checkpoint(cc.id)`.
--   · Sin recursión: esa rama no vuelve a llamar a `can_view_interaction_target`.
--     La única recursión de `can_view_target` es su rama `comment`, y aquí nunca
--     se le pasa `'comment'`.
--   · Sin problema de `search_path`: esta función mantiene `search_path = ''` y
--     la llamada va cualificada, igual que las otras tres ramas; el literal se
--     castea a `public.target_kind` explícitamente.
--   · Sin problema de ACL: `can_view_target` tiene EXECUTE para PUBLIC
--     (`=X/postgres`), y en cualquier caso el cuerpo se ejecuta como `postgres`,
--     que es su dueño. No se crea ni se amplía ningún grant.
--
-- `create or replace` preserva firma, `security definer`, `search_path` y los
-- grants existentes (`anon`, `authenticated`): no se toca la ACL.
create or replace function private.can_view_interaction_target(p_interaction_target_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.interaction_targets t
    where t.id = p_interaction_target_id
      and not public.users_are_blocked(t.owner_id)
      and case t.audience_kind
        when 'profile' then public.can_view_profile(t.audience_id)
        when 'club_member' then public.is_club_member(t.audience_id)
        when 'activity_participant' then public.is_activity_participant(t.audience_id)
        when 'checkpoint_reached' then public.can_view_target('activity_checkpoint'::public.target_kind, t.audience_id)
      end
  );
$function$;
