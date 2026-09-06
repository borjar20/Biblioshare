-- Local bootstrap adapter for 20260728_migrar_grafos_a_itinerarios.sql.
-- The source migration moves production saga data with literal IDs. A fresh
-- database has none of those records. Do not invent them or disable its FKs.
-- Refuse a populated database rather than silently omit its data migration.
do $bootstrap_data$
begin
  if exists (select 1 from public.sagas) then
    raise exception 'Historical graph data migration requires an empty bootstrap database';
  end if;
end $bootstrap_data$;
