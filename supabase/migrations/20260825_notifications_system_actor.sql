-- Una notificación EMITIDA POR EL SISTEMA no tiene actor humano.
--
-- Hasta ahora toda notificación era «alguien te hizo algo»: `actor_id` NOT NULL y
-- `CHECK (user_id <> actor_id)`. El recordatorio de evento (spec 2026-08-04) es el
-- primero que no encaja en esa forma — lo dispara un trabajo programado, no una
-- persona.
--
-- Se intentó evitar este cambio poniendo al ORGANIZADOR del evento como actor, y
-- fue peor por dos motivos que solo aparecieron al probarlo contra dev:
--
--   1. El organizador que sigue su propio evento choca con el CHECK: su
--      recordatorio no se puede insertar (23514), así que justo quien monta el
--      evento se quedaba sin aviso — lo contrario de lo que pide §18.
--   2. Miente en la pantalla: «Marta te avisa» cuando Marta no ha hecho nada.
--
-- Las dos son el mismo síntoma de forzar un evento del sistema por un modelo con
-- forma de persona. Se arregla el modelo, no se parchea alrededor.
--
-- Consumidores que ya tratan el actor nulo (son todos los que leen la bandeja):
-- listNotifications, buildPushPayload y notification-bell.tsx.
alter table public.notifications alter column actor_id drop not null;

-- El invariante se conserva donde sigue teniendo sentido: si HAY actor, no puede
-- ser el propio destinatario (nadie quiere «has comentado tu propio post»).
alter table public.notifications drop constraint if exists notifications_check;
alter table public.notifications
  add constraint notifications_check
  check (actor_id is null or user_id <> actor_id);
