-- La tanda B ató episode_watches.pass_id con ON DELETE CASCADE, y eso
-- contradice su propia semántica: pass_id nulo significa "visto alguna vez,
-- aunque la serie ya no esté en la biblioteca". Si borrar los pases (quitar
-- de biblioteca) arrastrara los vistos, esa capa desaparecería justo cuando
-- tiene que sobrevivir. El FK pasa a SET NULL: el pase muere, el visto queda.
alter table public.episode_watches
  drop constraint if exists episode_watches_pass_id_fkey;
alter table public.episode_watches
  add constraint episode_watches_pass_id_fkey
  foreign key (pass_id) references public.diary_entries(id) on delete set null;
