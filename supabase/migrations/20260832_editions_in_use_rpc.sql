-- #278 (Bloque 6 del triage #496): detección exacta de ediciones en uso.
--
-- getUsedEditionIds y el `count` previo de deleteEdition contaban los pases de
-- una edición A TRAVÉS de la RLS de `passes` (solo pases propios y de perfiles
-- públicos). Una edición usada solo por perfiles privados salía como "libre", se
-- ofrecía el × y el borrado luego reventaba contra el trigger
-- block_edition_delete_if_used (que sí ve todos los pases). Fallo de interfaz:
-- se ofrece una acción imposible.
--
-- Esta RPC SECURITY DEFINER ve TODOS los pases sin RLS y devuelve, de la lista
-- que le pasan, los edition_id que tienen algún pase. Solo revela un booleano
-- "esta edición está en uso" sobre ediciones que el llamante ya ve en el
-- catálogo — no expone de quién es el pase, así que no hay fuga.
create or replace function public.editions_in_use(p_edition_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct edition_id
  from public.passes
  where edition_id = any(p_edition_ids);
$$;

revoke execute on function public.editions_in_use(uuid[]) from public, anon;
grant execute on function public.editions_in_use(uuid[]) to authenticated;

comment on function public.editions_in_use(uuid[]) is
  'De la lista de edition_id dada, cuáles tienen algún pase. SECURITY DEFINER: salta la RLS de passes para no ofrecer borrar ediciones usadas solo por perfiles privados (#278).';
