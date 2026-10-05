# Rondas #401: matriz SQL y corrección del slug del fixture

[Candidato · verificado el 2026-10-05 · matriz SQL 11 PASS en 3a · carrera FAIL en seed · corrección de slug pendiente de nuevo runtime]

La matriz real ha pasado sus 11 comprobaciones sobre el pin `3a3b9e4` en el
backend local nuevo `f3d738c9`, con ledger de 288 pasos. La carrera falló antes
de abrir sus sesiones: el seed generaba un slug de 42 caracteres y SQL exige
3–40. El checker limpió y restauró el reloj, y el backend quedó parado con
backup normal y censo cero. El FAIL se conserva. **#401 sigue abierto.**

El slug del candidato ahora elimina los guiones del UUID, conserva sus 32
caracteres y mide 38 con el prefijo. Una regresión del checker real contrasta
su seed con la constraint SQL vigente y comprueba unicidad entre fixtures y
limpieza por el ID original. Esta corrección sólo tiene verificación Node:
La revisión independiente del ajuste ha pasado; necesita pin y GO nuevos
antes de otro runtime. El coordinador
reserva ahora el backend para la QA de #1385; no se ha repetido SQL ni navegador.

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

## Evidencia estática original

Node 24.19.0, compatible con los engines del repo. La entrega original acreditó
quince contratos del checker y ocho del bootstrap: **23/23**, cero skip. Lint
focal y node --check de los tres módulos JavaScript pasaron. No cambió
TypeScript/producto ni se repitió la suite general de UI o el baseline SQL.

Los contratos ejecutan el caller real mediante VM y el checker real con
transporte PostgreSQL controlado. Cubren GO antes de acceder, marcas SQL
incompletas, rollback filtrado, barrera incompleta, pid duplicado, perdedor
NULL, dos filas pese a IDs iguales, fallo de worker más cleanup, sesiones sin
terminar, restauración fallida/OID cambiado y recuperación antes del reintento.
**Aquellos PASS no acreditaban parseo, funciones SQL ni locks PostgreSQL reales.**
La revisión fresca de ese mismo pin añadió 20 sondas RAM sin hallazgos; no
comprobó la longitud del slug emitido por el seed contra la constraint SQL.

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
round_prompt se contrastó con el código real antes de entregar; en esa entrega
la ejecución SQL quedaba pendiente.

## Único runtime real y corrección acotada del seed

El GO del coordinador `GO-coordinator-20261005-r1.json`, SHA
`7f0d7e60fe521f0dbc381a48a6d3cfc1f9c7636a28274a6b7dc700f5463ecfce`,
autorizó sólo el supervisor sellado y las copias exactas de 3a. El bootstrap
auténtico del proyecto `biblioshare-local-f3d738c9` tiene SHA
`6ddcc827b7cbff583c6ab2b9e5539a5b6b5f269db9ee3ee12f769fbe806ae79e`.
Su ledger real confirmó las 288 versiones esperadas; los 291 pasos de 966
corresponden a otro candidato y no se intercambiaron.

| Fase | Resultado | Receipt SHA-256 |
|---|---|---|
| Start | PASS, PostgreSQL17/Auth0, ledger288 y censo0 | `52e59844708dabdd5e7f4c61b99238b423c4a188cd58a9b15ae4412627935869` |
| SQL | FAIL global; matriz11 PASS, seed de carrera rechazado | `1e6fe779c1b8a59b147aec9554200b6252da50bd57de0ce94c4ce3762a605cd9` |
| Stop | PASS, censo0, backup normal y volúmenes conservados | `69eb433cf78eafa38462fc5d5b56bee95c229525784c23139b1fdf0d3d95dbfd` |

La causa es directa: `20260715_text_length_limits.sql` define
`clubs_slug_format = ^[a-z0-9-]{3,40}$`; el checker generaba `cr401-<UUID>`
de 42 caracteres. PostgreSQL rechazó esa inserción. No se alcanzaron las
sesiones ni la barrera, por lo que no se acredita la carrera ni se diagnostica
un fallo de concurrencia del producto.

El finally original dejó cleanup/restoration PASS, comparó definición, ACL,
propietario, configuración y OID, y retiró su journal. SHA del reloj antes y
después: `65fed91b998e2910593bebfafd3baf994d6732362c4a3d2ce0043718ea254814`.
Stop confirmó cero auth.users, auth.sessions, perfiles, passes, clubs, miembros,
rondas y targets; cero pila Supabase activa y puertos libres. Los volúmenes
f3/eeaa/966 permanecen conservados. No se precisó comando recover.

Las evidencias de ese intento están en
`.scratch/ticket-campaign/20261004-continue/club401-native-r1/resume-20261005-final-r1/`.
El manifest SHA `148e9ad0acbf7f7a9acc3f519688333f032ecf4b914a24a6c7607de3b2bc8040`
se selló antes de esta corrección, con el FAIL y los tres receipts originales.
No se reescribieron las copias/pins de 3a ni el supervisor.

La corrección posterior cambia únicamente el slug a `cr401-<UUID sin guiones>`:
38 caracteres, con todos los dígitos del UUID. El ID del club y la limpieza
permanecen iguales. La regresión llama al checker público, observa el SQL de
seed/cleanup en su frontera de transporte y extrae la regla de la migración
vigente; no duplica la fórmula del slug ni exporta el helper privado. Dos
fixtures independientes deben emitir slugs válidos distintos y limpiar sus
IDs originales. RED produjo 1 FAIL por longitud 42; GREEN observa longitud 38.

Los checks de la corrección y sus fuentes están en
`.scratch/ticket-campaign/20261004-continue/club401-native-r1/resume-20261005-slug-fix-r1/`.
Los 16 contratos del checker y ocho del bootstrap pasan: **24/24**, cero skip;
la regresión focal pasa 1/1. Lint focal y sintaxis de los dos módulos pasan.
Es una corrección del harness: no cambia ninguna constraint, SQL de matriz,
migración, configuración, esquema o código de producto. Los contratos Node
no sustituyen el nuevo runtime. La revisión independiente del ajuste pasó
28 controles de fuente, 69 hashes y 16 contratos focales, sin defectos de
código; su recibo sellado es
`4caa310b142ae0a4ca5bf1092e273460df46df5338f0d6b7f29c59b5b6a98bb4`.
El coordinador aclaró después el tiempo histórico de la evidencia original,
sin modificar el checker ni la regresión revisados. Se requieren pin y GO propios,
manteniendo íntegro el intento fallido anterior.

## GO y protocolo para la siguiente QA

La autorización anterior corresponde al checker de 3a y no sirve para ejecutar
este candidato corregido. El coordinador debe confirmar proyecto/contenedor
exactos, QA975 terminada, actores ajenos cero y puerto 3000 libre. El receipt es un JSON local de esa
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

La matriz SQL de 3a sí se ha ejecutado y pasado. La corrección del seed todavía
no acredita aceptación nativa ni la carrera real; tampoco grants remotos,
navegador o CI del candidato integrado. No toca migraciones, passes, Auth
persistente, credenciales, dependencias, dev/prod o configuración de producción.
La entrega del autor y su revisión no hicieron operaciones Git ni remotas;
el coordinador prepara el pin posterior. No se ha cerrado #401.
