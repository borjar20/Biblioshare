# Cutover de celebraciones (#1334)

Procedimiento del esquema versionado; no acredita una activación remota. La prueba
PostgreSQL local r5 conserva cuatro contraejemplos causales: un UPDATE legacy ya
admitido, esperando fila o tabla, puede acabar después de REVOKE o de sustituir
la función. Por eso la activación necesita cierre de admisión **y** quiescencia.

Las fases son `20261003184419_recoverable_celebrations_expand.sql` (dos columnas,
CHECK y tres RPC con EXECUTE cerrado),
`20261003184423_retire_eager_celebration_admission.sql` (cierre también del legacy)
y `20261003184427_activate_recoverable_celebrations.sql` (no-op compatible y
grants finales). No cambian earning, deduplicación, RLS ni sellos históricos.

1. Inspeccionar objetos/ACL reales, jobs y ejecutores del target; mantener nuevo
   consumidor deshabilitado. Aplicar expansión y comprobar superficie 6/advisors.
2. Pausar despachos legacy y DDL relevante por owner/superusers y roles capaces
   de heredar del owner. Esa disciplina operativa es obligatoria: REVOKE no
   puede retirar su capacidad implícita. Verificar las vías de ejecución de la
   aplicación y jobs. No se afirma una barrera universal contra un administrador.
3. Aplicar fase 2 y **COMMIT**. Se retiran todos los grantees explícitos salvo
   owner, incluidos grants por defecto a service_role; rutas efectivas ordinarias
   heredadas que sobrevivan causan error. Productores siguen disponibles.
4. Ejecutar el checker. Tiene que observar actividad completa (`pg_read_all_stats`
   USAGE o superuser, `track_activities=on`) y refresca con
   `pg_stat_clear_snapshot()` antes de cada lectura. Captura todas las transacciones
   anteriores al cutoff del reloj servidor y acredita cada identidad
   `(pid,backend_start,xact_start)` terminal, sin filtros por SQL, rol ni tipo de
   backend. No lee SQL, JWT, contraseñas ni filas privadas. NULL ocultado no
   significa ausencia. Prepared transactions o tráfico continuo bloquean.
   `track_activities=on` del observador no prueba el tracking de cada backend:
   cualquier `state=disabled` bloquea las tres barreras, aunque xact_start sea
   NULL y los grants estén cerrados. Un fixture SQL real reproduce que el
   gate anterior veía cohorte vacía y el viejo UPDATE terminaba después del
   no-op/regrant; no se interpreta eso como presentación o pérdida nativa.
5. El checker envía en una sola llamada/conexión: BEGIN READ COMMITTED, contexto
   de sesión, fase 3 real y fila del ledger, COMMIT. El guard SQL vuelve a comprobar
   visibilidad/frescura/objetos/ACL/cohorte terminal y exige cero otras transacciones
   actuales, incluso si se presentara una cohorte incompleta. Fallar revierte tanto
   DDL/grants como ledger. Sólo después verificar no-op y habilitar nuevo consumidor.

CLI local sin inputs de entorno, URL ni credenciales:

```text
node scripts/db/celebrations-cutover.mjs --container supabase_db_<project-id> --database postgres --privileged-dispatch-paused
```

`--ledger-version` (14 dígitos) y `--ledger-name` (snake_case) permiten registrar
el ordinal de un bootstrap generado. No se usa upsert ni se repara historia.
El transporte local es `docker exec -i ... psql -X -Atq -U postgres -d ...` con
ON_ERROR_STOP; el SQL va por stdin y errores se reducen a SQLSTATE. No arranca ni
para contenedores, ni mata backends. `--timeout-ms` sólo limita la espera; el paso
del tiempo nunca acredita el gate. Dejar la fase final pendiente si hay BLOCK.

Para un transporte operativo controlado, importar `runCelebrationsCutover` e
inyectar `executeJson(sql)` (inspección JSON autocommit) y `execute(sql)` (bloque
completo en una conexión con rollback al error). Inputs: `ledger:{version,name}`,
`privilegedDispatchPaused:true`, `timeoutMs` y `onReceipt`. El módulo lee la fase
3 del propio repo; el operador conserva recibos sin queries/claims/credenciales.
No inferir autorización remota de esta API. Las comprobaciones del target y
G2/G4 de producto son gates separados.

El replay CLI vacío difiere fase 3 hasta que PostgreSQL esté arrancado; después
usa la misma API y registra el ordinal real. Para el baseline psql completo,
`renderEmptyBootstrapCutoverContextSql()` se ejecuta autocommit después del cierre
y antes del BEGIN final. Requiere attestation explícita mediante
`biblioshare.celebrations_privileged_dispatch_paused=true`, Auth y celebraciones
totalmente visibles/vacías (RLS inactiva para el observador), full stats, ACL
cerradas y cero otras transacciones/prepared transactions. Reutiliza la misma
consulta de inspección y el mismo guard final; no admite excepción por bandera.
El wrapper resetea ambos GUC tras COMMIT. Un baseline psql sobre datos vivos debe
fallar cerrado; usar el checker operativo para un cutover vivo.

Si falla la fase final, mantener el legacy revocado y las claims cerradas.
No volver a conceder EXECUTE al eager drain como rollback. No usar espera fija,
table lock, HTTP 200, llamada vacía o matar un backend ajeno como sustituto de
los recibos terminales. Los sellos anteriores al cutover permanecen como estaban.

Referencias primarias: [monitorización PostgreSQL 17](https://www.postgresql.org/docs/17/monitoring-stats.html)
y [REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).
