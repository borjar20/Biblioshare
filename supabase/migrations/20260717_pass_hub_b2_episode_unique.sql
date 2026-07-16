-- Tarea 8 (hub): el cursor de episodios pasa a ser POR PASE, no por
-- usuario+serie. Un episodio puede estar visto en varios pases distintos
-- (revisionado): la unicidad vieja (user_id, series_id, season, episode)
-- lo impedía. Se sustituye por dos índices únicos parciales:
--   - uno por pase (pass_id, season, episode) para el visionado activo,
--   - uno "legacy" (user_id, series_id, season, episode) WHERE pass_id IS
--     NULL para no duplicar historia anterior a la migración del hub (esos
--     vistos no pertenecen a ningún pase y siguen contando para "visto
--     alguna vez").
alter table public.episode_watches
  drop constraint if exists episode_watches_user_id_series_id_season_number_episode_num_key;

create unique index if not exists episode_watches_once_per_pass
  on public.episode_watches (pass_id, season_number, episode_number)
  where pass_id is not null;

create unique index if not exists episode_watches_legacy_unique
  on public.episode_watches (user_id, series_id, season_number, episode_number)
  where pass_id is null;
