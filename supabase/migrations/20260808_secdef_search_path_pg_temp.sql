-- #130: `set search_path = public` no fija `pg_temp`.
--
-- Postgres busca el esquema temporal ANTES que los listados en `search_path`
-- salvo que `pg_temp` aparezca explícitamente en la lista. Con
-- `search_path = public` a secas, cualquier llamante que pueda crear una tabla
-- o un tipo temporal con el nombre de algo que una función SECURITY DEFINER
-- referencie SIN cualificar lo secuestra. Listar `pg_temp` AL FINAL lo manda al
-- último lugar de la búsqueda y cierra el vector.
--
-- Barrido genérico, no una lista escrita a mano: las funciones se han creado en
-- ~40 migraciones distintas a lo largo de un año y una lista literal se queda
-- vieja en cuanto alguien añada la siguiente. Esto lee `pg_proc` y arregla lo
-- que encuentre, preservando el search_path que cada función ya tuviera (hay
-- tres con `''` -- las de club_join -- que NO deben pasar a `public`).
--
-- Idempotente: si `pg_temp` ya está en la lista, se salta la función.
do $$
declare
  r record;
  v_actual text;
  v_lista text;
begin
  for r in
    select
      quote_ident(n.nspname) || '.' || quote_ident(p.proname)
        || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
      (select c from unnest(coalesce(p.proconfig, '{}'::text[])) c
        where c like 'search_path=%') as cfg
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
  loop
    -- Sin `set search_path` la función hereda el del llamante, que es un
    -- agujero mayor que el de esta issue; se normaliza a `public` + pg_temp.
    v_actual := coalesce(substring(r.cfg from 'search_path=(.*)$'), 'public');
    continue when v_actual ~ '(^|,)\s*"?pg_temp"?\s*(,|$)';

    -- Cada elemento se reemite como literal: `pg_proc` guarda el search_path
    -- vacío como `""`, y `alter function ... set search_path to ""` es un
    -- error de sintaxis ("zero-length delimited identifier"); `''` sí vale.
    select string_agg(quote_literal(btrim(btrim(e), '"')), ', ' order by o)
      into v_lista
      from unnest(string_to_array(v_actual, ',')) with ordinality as t(e, o);

    execute format('alter function %s set search_path to %s, pg_temp', r.sig, v_lista);
  end loop;
end;
$$;

-- La migración se verifica a sí misma: si algo quedara fuera del barrido
-- (una función nueva creada entre el bucle y aquí, un search_path con una
-- forma que el regex no reconozca), falla en vez de dar por bueno el arreglo.
do $$
declare
  v_faltan int;
begin
  select count(*) into v_faltan
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prokind = 'f'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
      where c like 'search_path=%pg_temp%');

  if v_faltan > 0 then
    raise exception '% funciones SECURITY DEFINER siguen sin pg_temp en search_path', v_faltan;
  end if;
end;
$$;
