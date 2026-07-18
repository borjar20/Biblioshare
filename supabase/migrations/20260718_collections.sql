-- Colecciones v2 (plan 02 T7): estanterías/sellos del usuario. Privadas
-- (RLS solo-dueño); `visibility` nace para abrir público más adelante sin
-- re-migrar. Un ítem puede vivir en varias colecciones (M:N por la PK compuesta).

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  visibility  text not null default 'private' check (visibility in ('private','public')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id, position, created_at);

create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  item_type     item_type not null,
  item_id       uuid not null,
  position      integer not null default 0,
  added_at      timestamptz not null default now(),
  primary key (collection_id, item_type, item_id)
);
create index collection_items_col_idx on public.collection_items (collection_id, position, added_at);

alter table public.collections enable row level security;
create policy collections_owner on public.collections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.collection_items enable row level security;
create policy collection_items_owner on public.collection_items
  for all using (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.collections c
            where c.id = collection_id and c.user_id = auth.uid())
  );
