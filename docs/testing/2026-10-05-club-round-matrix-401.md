# Rondas #401: candidato estático y gate de SQL local

[Candidato · verificado contra runner Node el 2026-10-05 · SQL y concurrencia NOT_RUN]

La matriz y su runner están preparados para verificar las ramas de la casa y la
relectura del ganador de una carrera. **#401 sigue abierto: no se ha ejecutado
PostgreSQL, Docker, navegador ni un backend durante esta implementación.** El
coordinador mantiene HOLD: ahora tiene prioridad el diagnóstico CDP #1385 sobre
el backend 966 congelado. Sólo su nuevo GO puede liberar la ejecución de #401.

Base: `f5839cf8c55b649daf62ffc08d216268eb28a9f3`, rama
`codex/club-round-matrix-401`, worktree `coverage1307`. La rama hermana #405 se
recibió en `d2274d07a44e70cc45db6fbf44db15168f169c47`. El coordinador integró
su baseline documental en `f4119d476fa478a50519ea2236dd303a0a002790`; el primer
commit sigue siendo ancestro y este worker no modificó esa rama. Esta pieza
no contiene la corrección del fixture E2E #405.

## Problema y fuentes

[#401](https://github.com/borjar20/Biblioshare/issues/401), releída el 2026-10-04,
describe que el día real decide qué rama prueba la matriz histórica. El
diagnóstico r2 confirma además que `scripts/db/verify.mjs` no la invocaba. El
control del caller ejecuta ese fichero real con fronteras de proceso/archivos
controladas: obtiene cero llamadas de rondas antes del arreglo.

El contrato está en `docs/requirements/data-model.md`, apartado de rondas, y en
`20260803_club_rounds.sql`: semana y turno pertenecen a SQL Madrid; la casa
comienza el día 3; una ronda existente manda; el índice único y la relectura
resuelven la carrera. La columna de la RPC es `round_prompt`, aunque la tabla
la llama `prompt`. Las funciones privadas conservan su execute revocado y las
RPC su aislamiento de search_path.

CREATE OR REPLACE conserva propietario y permisos; las demás propiedades se
deben expresar o restaurar mediante la definición capturada.
[PostgreSQL 17: CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).
El lock EXCLUSIVE permite las lecturas previas y detiene los INSERT con
RowExclusiveLock; su estado granted=false se observa en pg_locks.
[Compatibilidad de locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[pg_locks](https://www.postgresql.org/docs/17/view-pg-locks.html).

## Cambio preparado

- La matriz mantiene las aserciones previas de RLS/turnos y del reloj Madrid
  real antes del seam. Añade clubes propios alineados con 28/29/30 de septiembre
  de 2026, semana W40. Lunes/martes exigen estado sin consigna y error exacto
  `42501 / house_round_too_early`. Miércoles exige consigna visible,
  materialización sin prompt, autor NULL, mismo ID para el segundo socio y un
  target canónico. La ronda preexistente manda los tres días. Todo se revierte.
- `scripts/db/verify-club-rounds.mjs` ejecuta esa fuente y exige sus 11 marcas
  de finalización. Contrasta el reloj después del ROLLBACK y actores de matriz
  cero. Prepara dos actores y un club aleatorios propios para la carrera.
- Sólo la base Docker local exclusiva recibe un reloj común fijo confirmado
  para ambas sesiones. Se guarda primero definición, ACL, propietario,
  configuración y OID en un journal local ignorado, con hash del snapshot.
  No hay GUC ni migración de producto.
- Un coordinador conserva el lock EXCLUSIVE. Las dos RPC omiten prompt y
  corren como authenticated con identidades distintas. Se exigen dos pids y
  dos locks de INSERT no concedidos en esa relación antes de liberar. El
  intervalo de polling sólo evita consultas continuas; el tiempo no es prueba.
- Ambas llamadas devuelven un UUID idéntico; hay una fila de casa, consigna
  canónica, W40 y un target. El finally termina sesiones propias, elimina filas
  propias y restaura/contrasta el reloj. AggregateError conserva la causa
  primaria y los errores posteriores, aunque fallen la limpieza/restauración.
- `verify.mjs` alcanza la pieza antes de cualquier SQL general. Los dos jobs
  de bootstrap/critical-flows declaran su contenedor recién creado como
  exclusivo. `test:db:bootstrap` incluye los contratos Node y el comando focal
  `test:db:club-rounds` evita repetir la suite SQL completa para esta QA.

## Qué está acreditado ahora

Node 24.19.0, compatible con los engines del repo. Quince contratos del checker
y ocho del bootstrap pasan: **23/23**, cero skip. Lint focal y node --check de
los tres módulos JavaScript pasan. No cambia TypeScript/producto ni se repite
la suite general de UI o el baseline SQL.

Los contratos ejecutan el caller real mediante VM y el checker real con
transporte PostgreSQL controlado. Cubren GO antes de acceder, marcas SQL
incompletas, rollback filtrado, barrera incompleta, pid duplicado, perdedor
NULL, dos filas pese a IDs iguales, fallo de worker más cleanup, sesiones sin
terminar, restauración fallida/OID cambiado y recuperación antes del reintento.
**Estos PASS no acreditan parseo, funciones SQL ni locks PostgreSQL reales.**

Evidencia histórica en
`.scratch/ticket-campaign/20261002-resolve-all/club-round-matrix401-20261004-static-r1/`.
La captura final posterior, tras explicitar Read Committed y las seis
postcondiciones de limpieza de la matriz, está en la ruta nueva
`.scratch/ticket-campaign/20261002-resolve-all/club-round-matrix401-20261005-static-r2/`.

| Artefacto | Resultado | Alcance |
|---|---|---|
| caller-RED.log + snapshots | 1 FAIL | La entrada anterior no alcanzaba rondas |
| caller-GREEN.log | 1 PASS | Reachability controlada |
| gate-before-sql-RED.log + snapshots | 12 PASS / 1 FAIL | La primera integración consultaba el ledger antes de validar GO; corregido |
| contracts-r2.log | 12 PASS / 1 FAIL | Oráculo de preparación contaba la matriz del intento anterior; corregido a delta por intento |
| bootstrap-contracts-final.log (r2) | 23 PASS | Contratos Node y wiring de bootstrap |
| lint-final.log, syntax-final.json (r2) | PASS | JavaScript; no parser SQL |
| seal.json, HANDOFF.md (r2) | Sellado | Fuentes finales, hashes y gate pendiente |

Los FAIL no se sobrescriben ni se suman como pruebas PostgreSQL. La firma
round_prompt se contrastó con el código real antes de entregar; la ejecución
SQL sigue pendiente.

## GO y protocolo para QA

El coordinador debe confirmar proyecto/contenedor exactos, QA975 terminada,
actores ajenos cero y puerto 3000 libre. El receipt es un JSON local de esa
autorización. Sustituir el ejemplo por los valores del manifest real:

```json
{
  "projectId": "biblioshare-local-<8hex-del-manifest>",
  "container": "supabase_db_biblioshare-local-<8hex-del-manifest>",
  "scope": "exclusive-disposable-local",
  "qa975Finished": true,
  "qaActors": 0,
  "port3000Free": true
}
```

El runner valida el receipt, contexto Docker local por socket/pipe, nombre exacto
del contenedor, PostgreSQL 17, puerto 3000 IPv4/IPv6 libre y Auth sin actores
anteriores. Un journal pendiente bloquea un nuevo intento. La modalidad CI
sólo se admite dentro de GitHub Actions, después del bootstrap aislado ya
presente en ambos workflows; conserva los mismos preflight reales.

Con el backend reservado y el receipt del coordinador:

```powershell
npm run test:db:club-rounds -- --club-rounds-receipt <ruta-al-GO.json>
```

Guardar cada ejecución en carpeta nueva con comando, exit code, stdout/stderr,
SHA de fuentes y dictamen. Gates para cerrar #401:

1. Matriz real completa, 11 marcas, aserciones previas/nuevas PASS; el primer
   rollback restaura el reloj y no deja actores de matriz.
2. Barrera real: dos pids y dos RowExclusiveLock no concedidos sobre
   public.club_rounds antes de liberar; dos resultados no nulos iguales.
3. Una ronda/target; actores, perfiles, club, miembros, rondas y targets propios
   cero. Definición/ACL/propietario/configuración/OID y hash del reloj originales.
4. Revisar el resultado en contexto fresco y completar CI del HEAD final.
   Un PASS Node, otro SHA o llamadas secuenciales no sustituyen estos gates.

## Recuperación y límites

Ante FAIL gestionado, se intenta cada limpieza y restauración aunque las
anteriores fallen. Si falla el cierre de una sesión, la limpieza de filas o la
comprobación de restauración, se conserva
`.superpowers/supabase-local/club-rounds-recovery.json` y falla el gate.

Una terminación forzosa o apagado puede cortar el finally. El journal previo
permite recuperar definición y filas/sesiones propias, y prohíbe continuar
una prueba como si el estado estuviera limpio:

```powershell
npm run test:db:club-rounds -- --club-rounds-receipt <ruta-al-GO.json> --restore-clock
```

La recuperación exige exclusividad y receipt. Sólo tolera los actores del
journal al comprobar el entorno, y verifica snapshot y nombres/UUID propios.
Si un agente externo cambia el OID o la base queda inaccesible, no se declara
restauración PASS: se conserva el FAIL/journal para el coordinador. No se
promete restauración durante una caída física del backend.

Esta fase no acredita SQL válido, RLS real, grants remotos, concurrencia nativa
ni navegador. No toca migraciones, passes, Auth persistente, credenciales,
dependencias, dev/prod o configuración de producción. No hay push, PR, merge
ni cierre remoto en este encargo.
