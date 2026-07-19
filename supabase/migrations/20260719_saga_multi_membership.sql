-- Sagas v2 fase 1 (spec §1.2): un ítem puede estar en N sagas (crossovers,
-- ítem directo en un universo). is_primary marca la saga que muestran el strip
-- de la ficha de obra y el breadcrumb; única por ítem (índice parcial).

alter table public.saga_items
  drop constraint saga_items_item_key;

alter table public.saga_items
  add constraint saga_items_saga_item_key unique (saga_id, item_type, item_id);

alter table public.saga_items
  add column is_primary boolean not null default false;

-- Backfill: hasta ahora cada ítem tenía como mucho UNA membresía (la
-- constraint borrada lo garantizaba), así que todas pasan a primary.
update public.saga_items set is_primary = true;

create unique index saga_items_primary_idx
  on public.saga_items (item_type, item_id)
  where is_primary;
