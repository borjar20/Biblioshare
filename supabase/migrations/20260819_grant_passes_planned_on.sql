-- FIX: "Seguir" en una ficha reventaba con pantalla de error.
--
-- `passes` NO tiene grants de tabla, sino POR COLUMNA (20260714_passes_grants.sql
-- hizo `revoke all` + grant fino, y 20260717_pass_hub_b4_hub_writes.sql enumeró
-- las del hub). Postgres comprueba el privilegio de TODAS las columnas que
-- aparecen en el INSERT/UPDATE, tenga la columna valor o NULL.
--
-- 20260817_passes_planned_on.sql añadió la columna `planned_on` pero no su
-- grant, así que en cuanto se desplegó el #366 el insert de applyTransition
-- (que siempre nombra planned_on) empezó a devolver 42501 "permission denied
-- for table passes" para `authenticated`: toda alta de pase — o sea, TODO
-- "Seguir" y todo cambio de estado que crea pase — caía en el error boundary.
--
-- El UPDATE lo necesita el camino in_progress → planned (volver a Pendiente),
-- que sella planned_on.
--
-- Se le dan los MISMOS privilegios que a sus hermanas `started_on`/`finished_on`
-- (verificado en prod: anon=SELECT; authenticated=INSERT,SELECT,UPDATE), no solo
-- los dos que hoy están rotos: es la misma clase de dato (fecha hito del pase) y
-- así el SELECT no vuelve a faltar cuando /estadisticas lo lea. El SELECT de
-- `anon` solo alcanza filas que la RLS ya expone (pases públicos).
--
-- Aviso a quien añada la siguiente columna a `passes`: la columna sin su grant
-- compila, pasa los tests y solo falla en runtime contra la BD real.
grant insert (planned_on) on public.passes to authenticated;
grant update (planned_on) on public.passes to authenticated;
grant select (planned_on) on public.passes to anon, authenticated;
