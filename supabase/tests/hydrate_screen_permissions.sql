-- #1204: contrato de acceso de las RPC de hidratación de pantalla.
-- No depende de datos existentes y no deja cambios ni claims de prueba.
begin;

do $check$
declare
  signature regprocedure;
begin
  foreach signature in array array[
    'public.hydrate_movie(uuid,text,text,text,text,text[],integer,text,integer,text)'::regprocedure,
    'public.hydrate_series(uuid,text,text,text,text,text[],integer,text,integer,integer,integer,text)'::regprocedure
  ] loop
    if has_function_privilege('anon', signature, 'execute') then
      raise exception '#1204: anon todavía puede ejecutar %', signature;
    end if;
    if not has_function_privilege('authenticated', signature, 'execute') then
      raise exception '#1204: se perdió EXECUTE de authenticated en %', signature;
    end if;
    if not has_function_privilege('service_role', signature, 'execute') then
      raise exception '#1204: se perdió EXECUTE de service_role en %', signature;
    end if;
  end loop;
end;
$check$;

set local role anon;
do $check$
begin
  begin
    perform public.hydrate_movie('00000000-0000-0000-0000-000000000000');
    raise exception '#1204: anon entró en hydrate_movie';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.hydrate_series('00000000-0000-0000-0000-000000000000');
    raise exception '#1204: anon entró en hydrate_series';
  exception when insufficient_privilege then
    null;
  end;
end;
$check$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
-- ID inexistente: ejercita ambas funciones sin escribir filas del catálogo.
select public.hydrate_movie('00000000-0000-0000-0000-000000000000');
select public.hydrate_series('00000000-0000-0000-0000-000000000000');
reset role;
rollback;
select 'PASS: hydrate_movie/hydrate_series rechazan anon y conservan authenticated/service_role';
