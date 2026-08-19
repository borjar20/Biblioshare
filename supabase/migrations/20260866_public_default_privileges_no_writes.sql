-- Issue #691: toda relación nueva de `public` nacía ESCRIBIBLE por anon y
-- authenticated.
--
-- Los default privileges del esquema conceden `arwdDxtm` (ALL) a `anon` y a
-- `authenticated` en cada relación nueva —tablas Y vistas—:
--
--   select defaclrole::regrole, defaclacl from pg_default_acl
--   where defaclnamespace='public'::regnamespace and defaclobjtype='r';
--   -- {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--   --  authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--
-- En una TABLA la RLS contiene el daño. En una VISTA no: una vista
-- auto-updatable owner-privileged (owner `postgres`, sin `security_invoker`) no
-- tiene RLS propia, hereda esos grants de escritura y propaga la escritura a la
-- tabla base con privilegios del owner. Eso fue la causa real de #690
-- (`pass_reviews`). Aquel caso se mitigó con un `revoke` por objeto, PERO ESE
-- REVOKE SE REVIERTE SOLO: el patrón `drop view … create view` es frecuente en
-- este repo, y la vista recreada vuelve a nacer con los grants heredados. El
-- default privilege es lo único que sobrevive a una recreación.
--
-- ── Qué cambia y qué NO ─────────────────────────────────────────────────────
-- Un ALTER DEFAULT PRIVILEGES afecta SOLO a relaciones FUTURAS: no toca ni un
-- grant existente. Su radio de acción hoy es CERO — comprobado antes de
-- aplicarlo: en dev y en prod, TODAS las tablas de `public` tienen RLS activa
-- (`relrowsecurity`), así que ninguna depende del grant de tabla en lugar de la
-- RLS; las únicas relaciones sin RLS son las cuatro vistas (`pass_reviews`,
-- `club_identities`, `club_stats`, `profile_identities`), que es justo lo que
-- esto protege.
--
-- Lo que sí cambia es el futuro: **una migración que cree una tabla y espere que
-- `authenticated` escriba en ella tiene que conceder el grant a mano.** Eso es lo
-- que se busca (explícito > heredado), pero conviene saberlo antes de que
-- aparezca un `permission denied for table` en una feature nueva:
--
--   grant select, insert, update, delete on public.<tabla> to authenticated;
--
-- Se conserva SELECT por defecto: es la convención de Supabase y en tablas la
-- RLS filtra las filas. Se retiran las de escritura y `trigger` (que permite
-- colgar una función propia de la tabla).
--
-- ── Límite conocido ─────────────────────────────────────────────────────────
-- Hay DOS juegos de default privileges en `public`, uno por grantor: `postgres`
-- y `supabase_admin`. Esta migración solo puede tocar el de `postgres` —
-- `current_user` es `postgres`, que no es superusuario ni miembro de
-- `supabase_admin`. Es suficiente para todo lo que crea este repo (las
-- migraciones corren como `postgres`, y el ACL que se aplica es el del rol que
-- CREA el objeto), pero una relación creada por `supabase_admin` seguiría
-- naciendo escribible. Queda anotado en la issue.

alter default privileges in schema public
  revoke insert, update, delete, truncate, trigger on tables
  from anon, authenticated;

-- ── Y de paso, se normalizan las cuatro vistas que ya existen ───────────────
-- El revoke de #690 sobre `pass_reviews` quitó INSERT/UPDATE/DELETE pero dejó
-- el resto de lo heredado: hoy, en dev Y EN PROD, su ACL es `anon=rDxtm` y
-- `authenticated=rDxtm` (truncate, references, trigger, maintain) frente al
-- `anon=r` limpio de las otras tres. TRUNCATE sobre una vista es inerte, pero
-- TRIGGER no: con él se puede colgar un `instead of` de la vista. No hay razón
-- para que ninguna de las cuatro tenga nada más que SELECT.
--
-- Se escriben las cuatro (no solo la que está sucia) a propósito: así este
-- bloque es el patrón copiable para cualquier `create view` futuro de `public`,
-- que es lo que la issue pedía formalizar.
revoke all on public.pass_reviews from anon, authenticated;
revoke all on public.club_identities from anon, authenticated;
revoke all on public.club_stats from anon, authenticated;
revoke all on public.profile_identities from anon, authenticated;

grant select on public.pass_reviews to anon, authenticated;
grant select on public.club_identities to anon, authenticated;
grant select on public.club_stats to anon, authenticated;
grant select on public.profile_identities to anon, authenticated;

-- Verificación (contra el catálogo real, no contra el ledger):
--
--   select defaclrole::regrole, defaclacl from pg_default_acl
--   where defaclnamespace='public'::regnamespace and defaclobjtype='r';
--   -- esperado para postgres: anon=r*x*m? no — anon=rxm/postgres,
--   --                          authenticated=rxm/postgres
--
--   begin;
--   create view public._t as select 1 as x;
--   select has_table_privilege('authenticated','public._t','UPDATE'),  -- false
--          has_table_privilege('anon','public._t','DELETE'),           -- false
--          has_table_privilege('authenticated','public._t','SELECT');  -- true
--   rollback;
