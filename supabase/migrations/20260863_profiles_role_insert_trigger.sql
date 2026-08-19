-- #689/#687 (P0) — segundo cinturón para la escalada de rol en el ALTA de perfil.
--
-- La migración 20260861 cerró el agujero por la vía de la RLS: la policy
-- `profiles insert own` solo acepta `role='user'`. Eso basta hoy, pero deja el
-- caso colgando de UNA sola frase de una policy: si alguien reescribe ese
-- `with check` (p. ej. al añadir una condición nueva al alta) el agujero P0
-- vuelve sin que nada chille.
--
-- Por qué NO se hace con grants por columna
-- ------------------------------------------
-- El fix que proponía el issue era `revoke insert (role) on public.profiles from
-- authenticated`. Sobre esta tabla es un NO-OP silencioso: `profiles` tiene
-- grants de TABLA (INSERT/UPDATE/... completos para anon y authenticated, los de
-- serie de Supabase), y en PostgreSQL revocar un privilegio de COLUMNA no revoca
-- el privilegio de TABLA que lo cubre. Para que sirviera habría que revocar el
-- INSERT de tabla y volver a concederlo columna a columna; eso es justo la
-- maniobra que ya rompió producción dos veces (regla #375: una columna sin su
-- grant tumba la escritura ENTERA de la tabla, y compila y pasa los tests).
--
-- El cinturón bueno es un trigger: cubre TODO camino de escritura (REST, RPC,
-- server action, SQL suelto), no depende de la policy y no puede romper otras
-- columnas. Es el hermano BEFORE INSERT del ya existente
-- `enforce_role_change_admin_only` (BEFORE UPDATE), cuya ausencia era el punto 3
-- de la causa raíz del issue.
--
-- Semántica, calcada de su hermano de UPDATE:
--   - `auth.uid() is null`  -> no hay sesión (service_role, seeds, migraciones):
--     se permite, igual que en el UPDATE. La confianza aquí es la de la clave.
--   - con sesión, solo un admin puede dar de alta un perfil con rol != 'user'.
create or replace function public.enforce_role_insert_user_only()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.role is distinct from 'user'::user_role
     and auth.uid() is not null
     and not public.has_min_role('admin') then
    raise exception 'Only an admin can create a profile with a role other than user';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_role_insert_user_only on public.profiles;
create trigger enforce_role_insert_user_only
  before insert on public.profiles
  for each row execute function public.enforce_role_insert_user_only();

comment on function public.enforce_role_insert_user_only() is
  'Cierra la escalada user->admin en el alta de perfil (#689). Hermano BEFORE INSERT de '
  'enforce_role_change_admin_only. Cinturón independiente de la policy `profiles insert own`.';
