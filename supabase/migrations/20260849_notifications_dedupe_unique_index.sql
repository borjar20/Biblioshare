-- `notify()` / `notifyMany()` (src/lib/social/notifications.ts) colapsan avisos
-- duplicados con `upsert({ onConflict: "dedupe_key", ignoreDuplicates: true })`.
-- Ese `ON CONFLICT (dedupe_key)` NO puede usar un índice único PARCIAL como
-- árbitro: PostgREST no añade el predicado `WHERE dedupe_key IS NOT NULL`, así que
-- Postgres respondía «there is no unique or exclusion constraint matching the ON
-- CONFLICT specification» y el upsert reventaba. Como el aviso va en un try/catch
-- best-effort, la notificación DEDUPEADA (la de RESPUESTA a un comentario, entre
-- otras) NUNCA se creaba, en silencio. Lo destapó el deep-link a nivel de
-- comentario (posts Spec 2b), que depende de que ese aviso exista.
--
-- Se sustituye el índice único parcial por uno NO parcial: en Postgres los NULL
-- son distintos entre sí, así que múltiples avisos sin `dedupe_key` (la mayoría)
-- siguen permitidos; solo se colapsan los no-nulos iguales — misma semántica de
-- unicidad que el parcial, pero ahora sí válido como árbitro del upsert.
drop index if exists public.idx_notifications_dedupe_key;
create unique index idx_notifications_dedupe_key
  on public.notifications (dedupe_key);
