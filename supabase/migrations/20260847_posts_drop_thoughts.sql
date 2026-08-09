-- Task 13 (POST-merge): retirar `thoughts`, ya ABSORBIDA en `posts`.
--
-- ORDEN NO NEGOCIABLE: se aplica DESPUÉS de desplegar el código que dejó de leer
-- `thoughts` (feed -> posts, compositor -> createPost, tarjeta/hilo -> posts).
-- Verificado: cero `.from("thoughts")` en src. Los datos se copiaron a `posts`
-- (reusando el MISMO id) en el backfill 20260846_posts_backfill.sql.
--
-- Regla del repo: código primero, esquema (DROP) después; dev primero, prod
-- después; verificar contra objetos reales (to_regclass), no contra el ledger.

drop trigger if exists thoughts_sync_interaction_target on public.thoughts;
drop trigger if exists thoughts_cleanup_social_target on public.thoughts;
drop trigger if exists thoughts_set_updated_at on public.thoughts;
drop table if exists public.thoughts;

-- Los valores de enum MUERTOS ('thought' en target_kind, thought_commented /
-- thought_liked en notification_type) NO se dropean: quitar un valor de enum en
-- Postgres exige recrear el tipo, y son inertes una vez que nada los escribe.
-- Deuda cosmética; issue si molesta.

-- ALCANCE DELIBERADAMENTE ACOTADO: aquí NO se retiran los triggers fuente de
-- passes / progress_sessions / episode_watches, a diferencia de lo que proponían
-- la spec (§4.3) y el plan (Task 13). Verificado contra dev que retirarlos NO es
-- seguro en Spec 1:
--
--   · episode_watches (trg_episode_watches_sync_interaction_target):
--     `get-episode-reviews` SIGUE resolviendo targets `episode_watch` (las
--     reseñas de episodio NO son posts en Spec 1 — `watched` es share-only,
--     Spec 2). Retirar su trigger las rompería igual que el backfill rompió la
--     ficha (ver fix de get-community). NO tocar hasta migrar episodios a posts.
--
--   · passes (trg_passes_sync_interaction_targets) y progress_sessions
--     (trg_progress_sessions_sync_interaction_target): sus targets
--     (diary_entry / pass / progress_session) ya no los lee ninguna superficie
--     viva —el feed y la ficha leen `posts`—, pero el trigger los sigue creando:
--     es RESIDUO INERTE, no un fallo. Retirarlo, además, deja las reseñas
--     importadas (sin post) sin hilo en la ficha. Se difiere a una fase de
--     limpieza con su issue de seguimiento.
