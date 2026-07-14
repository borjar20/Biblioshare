-- Límites de longitud en texto de usuario + formato de clubs.slug
-- (revisión 2026-07-14).
--
-- Ningún campo de texto libre tenía tope: cualquier autenticado podía insertar
-- megabytes por fila (y el feed / getInteractionSummary traen los cuerpos
-- completos). Los CHECKs son la garantía; las server actions añaden su propia
-- validación para dar errores legibles antes de llegar aquí.
--
-- Límites holgados a propósito (ninguna fila de prod se acerca; verificado con
-- max(char_length()) antes de escribir esto): el objetivo es cortar el abuso,
-- no acotar la escritura legítima.

alter table public.comments
  add constraint comments_body_len check (char_length(body) <= 2000);

alter table public.club_posts
  add constraint club_posts_body_len check (char_length(body) <= 5000);

alter table public.diary_entries
  add constraint diary_entries_review_len check (review is null or char_length(review) <= 10000);

alter table public.episode_watches
  add constraint episode_watches_review_len check (review is null or char_length(review) <= 10000);

alter table public.profiles
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 500),
  add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 80);

alter table public.library_entries
  add constraint library_entries_notes_len check (notes is null or char_length(notes) <= 2000);

alter table public.progress_sessions
  add constraint progress_sessions_note_len check (note is null or char_length(note) <= 2000);

-- clubs.slug se usa como segmento de ruta /club/[slug] y solo se saneaba en el
-- onChange del formulario (cliente). Mismo trato que profiles.username_format.
alter table public.clubs
  add constraint clubs_slug_format check (slug ~ '^[a-z0-9-]{3,40}$'),
  add constraint clubs_name_len check (char_length(name) between 1 and 80),
  add constraint clubs_description_len check (description is null or char_length(description) <= 2000);

alter table public.club_activities
  add constraint club_activities_title_len check (char_length(title) between 1 and 120),
  add constraint club_activities_description_len check (description is null or char_length(description) <= 2000);

alter table public.club_activity_checkpoints
  add constraint club_activity_checkpoints_label_len check (char_length(label) between 1 and 120);

alter table public.club_activity_opinions
  add constraint club_activity_opinions_comment_len check (comment is null or char_length(comment) <= 2000);

alter table public.club_poll_options
  add constraint club_poll_options_label_len check (char_length(label) between 1 and 120);

alter table public.challenges
  add constraint challenges_name_len check (char_length(name) between 1 and 120);

alter table public.queues
  add constraint queues_name_len check (char_length(name) between 1 and 80);
