-- SEGURIDAD: profile_identities era escribible por anon.
--
-- Encontrado el 2026-07-13 al aplicar club_stats, que reproducía sin querer el
-- mismo patrón. La vista lleva en producción desde el 11 de julio.
--
-- La cadena completa:
--
--   1. Los default privileges del esquema `public` de Supabase conceden ALL a
--      anon/authenticated sobre CUALQUIER relación nueva. El `grant select` de
--      la migración original (20260711_profile_identities.sql) no quita nada:
--      se SUMA. anon acabó con INSERT/UPDATE/DELETE/TRUNCATE sobre la vista.
--
--   2. profile_identities es una vista AUTO-ACTUALIZABLE sobre `profiles`
--      (information_schema.views → is_updatable = YES, is_insertable_into =
--      YES). No hace falta trigger INSTEAD OF: Postgres reescribe la escritura
--      contra la tabla base.
--
--   3. La vista NO es security_invoker — y eso es deliberado, es lo que le
--      permite leer la identidad de perfiles privados saltándose la RLS de
--      `profiles`. Pero el mismo mecanismo aplica a las ESCRITURAS: se ejecutan
--      con los privilegios del DUEÑO de la vista, que es `postgres`.
--
--   4. `profiles` tiene RLS activada pero NO forzada (relforcerowsecurity =
--      false). El dueño de una tabla se salta su propia RLS salvo que se fuerce.
--
-- Resultado: un cliente ANÓNIMO podía UPDATE / DELETE / TRUNCATE filas de
-- `profiles` a través de la vista, saltándose la RLS por completo.
--
-- El arreglo es el mismo que en club_stats: la vista existe para LEER identidad
-- pública, así que se le quita todo lo demás. `revoke` antes del `grant`, que es
-- lo que faltaba.
revoke all on public.profile_identities from anon, authenticated;
grant select on public.profile_identities to anon, authenticated;

-- Cinturón y tirantes: la deja explícitamente de solo lectura, para que un
-- grant accidental futuro no vuelva a abrir la puerta.
alter view public.profile_identities set (security_barrier = true);
