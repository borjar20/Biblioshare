-- Endurecimiento del catálogo enriquecible + higiene de funciones e índices
-- (revisión 2026-07-14).

-- ── 1. series_episodes: fuera el UPDATE abierto ──────────────────────────────
-- La política "series_episodes updatable" era using(true)/check(true) para
-- cualquier autenticado — vandalismo trivial de títulos/sinopsis de episodios.
-- La app NUNCA actualiza esta tabla (ensure-series-episodes solo INSERTa, el
-- backfill de tamaños toca `series`, no `series_episodes`), así que el UPDATE
-- sobra entero.
drop policy "series_episodes updatable" on public.series_episodes;
revoke update on public.series_episodes from anon, authenticated;

-- ── 2. people: enriquecer es RELLENAR, no sobrescribir ───────────────────────
-- El grant de columna (bio, photo_url, birth_date, death_date, place_of_birth)
-- + la política using(true) dejaban a cualquier autenticado REESCRIBIR la bio
-- de cualquier persona. El único UPDATE legítimo de la app (enrichTmdbBio en
-- get-person.ts) solo corre cuando bio IS NULL — es decir, solo rellena campos
-- vacíos. Este trigger convierte esa convención en regla: un valor no-NULL solo
-- lo cambia un collaborator+.
--
-- auth.uid() IS NULL => contexto sin usuario (service_role / SQL del owner, que
-- ya bypassan RLS) — se deja pasar, mismo idiom que enforce_role_change_admin_only.
create or replace function public.enforce_people_enrich_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_min_role('collaborator') then
    return new;
  end if;

  if (old.bio is not null and new.bio is distinct from old.bio)
     or (old.photo_url is not null and new.photo_url is distinct from old.photo_url)
     or (old.birth_date is not null and new.birth_date is distinct from old.birth_date)
     or (old.death_date is not null and new.death_date is distinct from old.death_date)
     or (old.place_of_birth is not null and new.place_of_birth is distinct from old.place_of_birth)
  then
    raise exception 'people fields can only be filled in, not overwritten';
  end if;

  return new;
end;
$$;

comment on function public.enforce_people_enrich_only() is 'BEFORE UPDATE en people: el cache-as-you-go solo puede RELLENAR campos NULL (bio/foto/fechas); cambiar un valor existente exige collaborator+. Cierra el vector de vandalismo del grant de columna abierto (revisión 2026-07-14).';

create trigger trg_enforce_people_enrich_only
  before update on public.people
  for each row execute function public.enforce_people_enrich_only();

-- ── 3. Higiene: las funciones de trigger no son RPCs ─────────────────────────
-- El grant implícito a PUBLIC las dejaba invocables vía /rest/v1/rpc/ (advisor
-- anon_security_definer_function_executable). Ninguna es llamable fuera de su
-- trigger (PostgREST fallaría con "trigger functions can only be called as
-- triggers"), pero no hay razón para exponerlas.
revoke execute on function public.autoadd_library_on_activity_join() from public, anon, authenticated;
revoke execute on function public.autoadd_library_on_activity_item() from public, anon, authenticated;
revoke execute on function public.enforce_buddy_read_item_rules() from public, anon, authenticated;
revoke execute on function public.enforce_club_owner_change_authorized() from public, anon, authenticated;
revoke execute on function public.reassign_club_ownership() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_people_enrich_only() from public, anon, authenticated;
revoke execute on function public.validate_club_post_ref() from public, anon, authenticated;

-- ── 4. Índices para FKs calientes (advisor 0001) ─────────────────────────────
-- Solo los dos con camino de borrado/consulta real: borrar una opción de
-- encuesta (cascade desde club_poll_options) y borrar una cola (on delete set
-- null sobre library_entries.queue_id — el índice parcial de la cola ordena por
-- (user_id, queue_id, queue_order), que no cubre el lookup puro por queue_id).
create index idx_club_poll_votes_option on public.club_poll_votes (option_id);
create index idx_library_entries_queue on public.library_entries (queue_id) where queue_id is not null;
