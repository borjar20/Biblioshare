-- La colocación de una subsaga dentro de su padre, como dato explícito
-- (spec 2026-07-25).
--
-- Hasta hoy vivía en dos sitios y ninguno era propio: o en
-- saga_nodes.child_saga_id + order_no (SOLO si la saga tiene grafo: 4 de 75 en
-- prod), o DEDUCIDA del menor position de sus miembros (main-order.ts, rama sin
-- grafo). Al retirarse el editor de grafo (fase 2) esa colocación se quedaba
-- sin ningún sitio donde escribirse.
alter table public.sagas
  add column position_in_parent integer,
  add column placement_in_parent public.saga_placement,
  add column optional_in_parent boolean not null default false;

-- Backfill = escribir lo que la app YA deduce hoy, para que nadie vea cambiar
-- nada. La regla vigente (main-order.ts, rama sin grafo) es: primero TODOS los
-- miembros directos del padre por position, y DESPUÉS las hijas ordenadas por
-- el menor position de sus miembros, con el nombre como desempate.
--
-- De ahí el offset: si las hijas empezaran en 1 chocarían con los huecos de los
-- miembros directos del padre, y un empate de position significa TÁNDEM en el
-- modelo nuevo — escribiríamos una mentira.
--
-- Ese "lo que la app YA deduce" solo vale para un padre SIN grafo. Si el padre
-- tiene filas en saga_nodes, la app no mira min(position) para nada: el orden
-- sale de saga_nodes.order_no, y una hija sin nodo (o con order_no null) hoy no
-- está colocada en ningún sitio. Colocarla aquí con 'fijo' sería inventar una
-- curación que nadie deriva. Esas hijas se quedan sin clasificar (null/null) a
-- propósito: los 4 grafos de prod se migran uno a uno y a mano en la fase 3
-- (spec «Migración», §2).
with base as (
  select p.id as parent_id,
         coalesce((select max(i.position) from public.saga_items i where i.saga_id = p.id), 0) as offset_pos
  from public.sagas p
), ranked as (
  select s.id,
         b.offset_pos + row_number() over (
           partition by s.parent_saga_id
           order by coalesce(
                      (select min(i.position) from public.saga_items i where i.saga_id = s.id),
                      2147483647),
                    s.name
         ) as pos
  from public.sagas s
  join base b on b.parent_id = s.parent_saga_id
  where s.parent_saga_id is not null
    and not exists (
      select 1 from public.saga_nodes n where n.saga_id = s.parent_saga_id
    )
)
update public.sagas s
   set position_in_parent = r.pos,
       placement_in_parent = 'fijo'
  from ranked r
 where s.id = r.id;

alter table public.sagas
  add constraint sagas_placement_position check (
    (placement_in_parent = 'fijo'  and position_in_parent is not null) or
    (placement_in_parent = 'libre' and position_in_parent is null)     or
    (placement_in_parent is null   and position_in_parent is null)
  ),
  -- Una saga raíz no está colocada en ningún sitio: las tres columnas no
  -- pueden llevar valor. Sin esto, «sacar del universo» dejaría restos.
  add constraint sagas_placement_needs_parent check (
    parent_saga_id is not null or
    (position_in_parent is null and placement_in_parent is null and optional_in_parent = false)
  );

comment on column public.sagas.position_in_parent is
  'Hueco del bloque-subsaga en la secuencia de su padre. null si es raíz o no está colocada.';
comment on column public.sagas.optional_in_parent is
  'true = el bloque entero sale del denominador del progreso de su PADRE (no del suyo propio).';
