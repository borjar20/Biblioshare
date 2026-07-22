-- Un itinerario no puede repetir la misma obra ni la misma subsaga: además de
-- carecer de sentido, dos pasos idénticos colisionan en la key de React y el
-- estado de plegado se asocia al bloque equivocado. Mismo par de uniques
-- parciales que ya protege saga_nodes.
create unique index saga_route_entries_item_key
  on public.saga_route_entries (route_id, item_type, item_id)
  where item_id is not null;
create unique index saga_route_entries_child_key
  on public.saga_route_entries (route_id, child_saga_id)
  where child_saga_id is not null;
