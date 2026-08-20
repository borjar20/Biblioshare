-- #729 — 167 de los 407 pases de producción (41 %) tenían `started_on` POSTERIOR
-- a `finished_on`: empezados después de terminarse. En dev: 0.
--
-- El CHECK que pedía F1-011 se dejó fuera de `20260868` precisamente por esto:
-- con el 41 % de las filas violándolo, ponerlo exigía decidir qué hacer con
-- datos reales del usuario. La decisión, y por qué no destruye nada:
--
--   **Las 167 filas tienen `started_on` EXACTAMENTE igual a `created_at::date`**
--   (medido en prod el 2026-08-20: 167 de 167, no 166). O sea, esa fecha no es
--   «cuándo empezó a leer»: es el día en que se dio de alta la obra, casi
--   siempre importando. Ponerla a NULL no pierde información — sigue en
--   `created_at`, que es de donde salió.
--
-- Se descartó la otra salida (`started_on = finished_on`, «lectura de un día»)
-- porque se inventa una duración que nadie ha dicho.
--
-- Qué cambia de lo que se ve:
--   - `get-records.ts` («libro más rápido») ya hacía
--     `row.started_on ?? row.created_at.slice(0, 10)`, así que calcula EXACTAMENTE
--     lo mismo que antes para estas filas.
--   - El feed dejaba de anunciar lecturas de «1 día» que en realidad eran de
--     años: con las fechas invertidas, el `Math.max(1, negativo)` daba 1. Ahora
--     no pinta duración, que es lo correcto cuando no se sabe.

update public.passes
   set started_on = null
 where started_on is not null
   and finished_on is not null
   and finished_on < started_on;

-- Y la puerta cerrada. Complementa el `passes_status_dates` de #719: aquel dice
-- «cerrado ⟺ tiene fecha de fin», este dice «si están las dos, van en orden».
-- La puerta de la app (`savePassFields`) pone `started_on` a NULL en vez de
-- rechazar: cerrar hoy una obra leída hace años es un camino legítimo, no un
-- error que haya que devolverle al usuario.
alter table public.passes
  add constraint passes_started_before_finished
  check (started_on is null or finished_on is null or finished_on >= started_on);
