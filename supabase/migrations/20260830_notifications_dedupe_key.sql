-- Idempotencia de notificaciones (spec item 9). Clave de deduplicación opcional:
-- cuando no es null, un índice único parcial impide insertar dos veces la misma
-- notificación lógica. notify() la usa con upsert(ignoreDuplicates) y, si la fila
-- ya existía, se salta también el push.
--
-- Hoy la usan las REACCIONES: 'reaction:{interactionTargetId}:{actorId}'. Un
-- like → unlike → like vuelve a llamar a notify() (el relike es un insert nuevo
-- de reacción), y sin esto generaba una segunda notificación. La clave lo colapsa
-- a una. Los demás llamantes no pasan clave: su comportamiento no cambia.
--
-- La limpieza perezosa de notifications borra la fila con su dedupe_key, así que
-- una reacción repetida MUCHO después (tras la purga) vuelve a notificar: ventana
-- intencionada, no un fallo.

alter table public.notifications add column dedupe_key text;

create unique index idx_notifications_dedupe_key
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

comment on column public.notifications.dedupe_key is 'Clave de idempotencia opcional (spec item 9). Única (parcial) cuando no es null. Hoy: reacciones. Ver docs/push-notifications-android.md y notifications.ts.';

-- notifications tiene grants POR COLUMNA (cache-as-you-go, RLS hardening). Una
-- columna nueva sin su grant rompe la escritura ENTERA de la tabla para el rol
-- que sí depende del grant fino (issue #375, DRIFT-CHECK superficie 6). El
-- escritor real es service_role (que además tiene grant de tabla), pero se
-- concede dedupe_key con el MISMO patrón que las demás columnas para no dejar
-- una asimétrica.
grant select (dedupe_key), update (dedupe_key), references (dedupe_key)
  on public.notifications to anon, authenticated;
grant select (dedupe_key), insert (dedupe_key), update (dedupe_key), references (dedupe_key)
  on public.notifications to service_role, postgres;
