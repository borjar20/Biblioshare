-- Fase 5, segunda mitad: `paralela` sale del vocabulario (spec 2026-07-28,
-- tabla de Esquema). En producción hay 0 filas con ese valor [MEDIDO
-- 2026-07-28], así que la retirada no pierde ningún dato curado.
--
-- ORDEN DE DESPLIEGUE — distinto al de las fases 3 y 4, a propósito: esta
-- migración va a producción DESPUÉS de que el bundle nuevo esté desplegado, no
-- antes. Retirar un valor es la dirección peligrosa: el bundle viejo sigue
-- ofreciendo «Paralela» en el <select> del editor de secuencia, y guardar con él
-- reventaría el cast de save_saga_sequence con un 22P02 en la cara del curador.
-- Es el mismo baile que la sobrecarga del RPC en las fases 2b y 4 (#217, #224).
--
-- Recrear el tipo NO rompe save_saga_sequence: es plpgsql y su cuerpo no está
-- parseado (`prosqlbody is null` [MEDIDO]), así que el cast
-- `(e->>'role')::public.saga_item_role` se resuelve POR NOMBRE en ejecución.
-- Aun así, tras aplicar hay que llamar al RPC una vez: es lo único que descarta
-- un plan cacheado en una conexión del pool.

-- Guarda explícita: sin ella el `using` de más abajo fallaría igual, pero con un
-- error de cast que no dice de qué va el problema.
do $$
begin
  if exists (select 1 from public.saga_items where role::text = 'paralela') then
    raise exception 'Hay filas con role = paralela: decide qué son antes de retirar el valor';
  end if;
end $$;

alter type public.saga_item_role rename to saga_item_role_viejo;

-- El orden es el de lectura, el mismo que src/lib/sagas/roles.ts. Nada ordena
-- datos por este enum, así que es solo legibilidad.
create type public.saga_item_role as enum (
  'precuela',
  'novela_corta',
  'relato',
  'spin_off',
  'companero',
  'crossover'
);

-- Única columna del tipo en todo el esquema [MEDIDO: pg_attribute].
alter table public.saga_items
  alter column role type public.saga_item_role
  using role::text::public.saga_item_role;

drop type public.saga_item_role_viejo;
