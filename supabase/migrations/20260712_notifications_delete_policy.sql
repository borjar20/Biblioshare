-- EPIC-05, Bloque D — política DELETE en notifications, requerida por la
-- limpieza perezosa de notificaciones leídas (listNotifications borra las
-- que llevan >5 min marcadas como leídas, sin cron). Sin esta política el
-- DELETE del destinatario fallaba en silencio por RLS (0 filas, sin error) —
-- mismo patrón de bug ya visto en push_subscriptions (E5.D4).

create policy "notifications delete own" on public.notifications
  for delete to authenticated using ((select auth.uid()) = user_id);
