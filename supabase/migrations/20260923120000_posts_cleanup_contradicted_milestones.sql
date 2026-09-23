-- #1187. Un hito es una afirmación sobre su pase (decisiones.md 2026-09-22): si
-- el pase CAMBIA a un estado que la desmiente, el post se va, igual que cuando
-- el pase se borra (private.cleanup_source_posts, 20260922120000).
--
-- Solo importa cuando se reescribe el MISMO pase (planTransition → updateActive):
-- Terminado→Abandonado, Abandonado→Terminado, Abandonado→Leyendo («continuar»),
-- Leyendo→Pendiente. Terminado→Leyendo archiva el pase terminado intacto, así
-- que su `finished` sigue siendo cierto y aquí no se toca.
--
--   estado nuevo   | se borran
--   planned        | started, finished, dropped
--   in_progress    | finished, dropped
--   completed      | dropped
--   dropped        | finished
--
-- `started` sobrevive salvo al volver a pendiente: empezar sigue siendo cierto.
-- Orden con el autopost: applyTransition escribe el pase (salta esto) y DESPUÉS
-- maybeAutopostMilestone publica el hito nuevo, de otro `kind`.
--
-- `author_id = new.user_id`: misma defensa que cleanup_source_posts. Un post
-- retirado por moderación no se borra: guard_moderated_write devuelve null en un
-- DELETE anidado. Spec 2026-09-23-posts-hitos-coherentes-design.md.
create or replace function private.cleanup_contradicted_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.posts p
  where p.source_kind = 'pass'
    and p.source_id = new.id
    and p.author_id = new.user_id
    and p.kind = any (
      case new.status
        when 'planned'     then array['started','finished','dropped']::public.post_kind[]
        when 'in_progress' then array['finished','dropped']::public.post_kind[]
        when 'completed'   then array['dropped']::public.post_kind[]
        when 'dropped'     then array['finished']::public.post_kind[]
        else array[]::public.post_kind[]
      end
    );
  return new;
end;
$function$;

revoke execute on function private.cleanup_contradicted_posts() from public, anon, authenticated;

create trigger passes_cleanup_contradicted_posts
  after update of status on public.passes
  for each row
  when (old.status is distinct from new.status)
  execute function private.cleanup_contradicted_posts();
