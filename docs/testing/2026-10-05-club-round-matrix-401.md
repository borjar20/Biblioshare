# Rondas #401: matriz SQL y corrección del slug del fixture

[Candidato · verificado el 2026-10-05 · Native 44be/F3/288: matriz 11/11 y carrera/cleanup y revisión independiente PASS · integración main 8424 · CI final pendiente]

El checker corregido `44be5bb` ha pasado la matriz real 11/11 y la carrera de
dos sesiones PostgreSQL en el F3 auténtico conservado `f3d738c9`, ledger 288.
Observó dos locks no concedidos antes del release, ambos RPC devolvieron el
mismo UUID y SQL confirmó una ronda y un target canónicos. Cleanup y reloj
exacto PASS, censo cero y parada normal con backup; ownership liberado al
coordinador. La revisión independiente del runtime pasó sin hallazgos; la CI
del candidato final integrado sigue pendiente. **#401 sigue abierto.**

El slug del candidato ahora elimina los guiones del UUID, conserva sus 32
caracteres y mide 38 con el prefijo. La regresión Node del checker real contrasta
su seed con la constraint SQL vigente y comprueba unicidad entre fixtures y
limpieza por el ID original. Su revisión fresca pasó antes del nuevo GO; el
runtime corregido acreditó después aceptación SQL y concurrencia real. El primer
FAIL de `3a3b9e4` por seed de 42 caracteres permanece intacto, con sus 11 casos de
matriz PASS y cleanup/restauración; no se convierte en un fallo del producto.

Base: `f5839cf8c55b649daf62ffc08d216268eb28a9f3`, rama
`codex/club-round-matrix-401`, worktree `coverage1307`. La rama hermana #405 se
recibió en `d2274d07a44e70cc45db6fbf44db15168f169c47`. El coordinador integró
su baseline documental en `f4119d476fa478a50519ea2236dd303a0a002790`; el primer
commit sigue siendo ancestro y este worker no modificó esa rama. Esta pieza
incorpora después main `4949bc376f5555e3a521915b0444d2f0bde3ccb4` y luego
`f1205b958861170c8ae2a5af3d9aa4030aebaa53` y la main definitiva
`8424eeccd1e906cb9fcf93d309832cdc927fb3f0`, con Notas en el margen PR #1396,
Experiencias/Lugares, Celebraciones, #1369/#1385 y la corrección #405 integrada.
Sus fuentes, migraciones, schema-baseline, tipos, data-model, graph y contratos
de CI se preservan; no se atribuye el Native F3/288 al nuevo plan integrado.

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

## Primer runtime real y corrección acotada del seed

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
sin modificar el checker ni la regresión revisados. El pin y GO propios del
runtime corregido se registran a continuación; el intento fallido anterior
permanece íntegro.

## Runtime corregido 44be: matriz y carrera reales PASS

El nuevo GO root tiene SHA
`7d33d143f515bf770736c25bda8abf4ab1b20001db0f8a21ac0cd6cec36984b1`.
Liga el pin `44be5bbcc452ed5a7a3a1b5fd3e21d0cb6b8bc53`, el checker
`f663ec597d575e15c9b262c4384f92e64b0e2d0b38318220caf07963149ae9fa`,
la cápsula nueva y el mismo F3/288. La planificación natural verificó 290
entradas fuente y los 288 SQL generados completos, así como los 348 artefactos
históricos, sin cambiar bind, stamp o config. El supervisor importó los exports
auténticos del checker copiado byte a byte, con journal natural en la cápsula
nueva; no falsificó el stamp fijo del CLI ni sustituyó el driver/restauración.

| Acción | Resultado | Receipt SHA-256 |
|---|---|---|
| Start | PASS, F3/288/Auth0, PostgreSQL17 | `9b03cc8379fd8c289a1c89e9bb004c2df6545bd615378955ad670b47390eda46` |
| Run | PASS, matriz11/11 y carrera real | `aee78a634aa0aa78bd651a5c6e3cd4766cbcd7cc505a80700fc223a704f67764` |
| Recover | No necesario; journal ausente | No se invocó |
| Stop | PASS, normal backup, censo0, volúmenes/puertos verificados | `696d5384558ab0dee6e477a0ee94dbf67e8daa8440be0c79c8eb512f44bc7065` |

Se ejecutó una sola llamada corregida de matriz/carrera, secuencialmente desde
host, después de examinar el start. La matriz acabó sus 11 marcas y revirtió
reloj/actores dentro de BEGIN/ROLLBACK. La carrera observó simultáneamente los
PID 312 y 313 con `RowExclusiveLock`, `granted=false`, sobre `club_rounds` y sólo
después liberó la barrera. Ambos `ensure_club_round` sin prompt devolvieron
`d911e5d5-5631-4ed7-be98-44d3a09ba8e3`; pasaron los oráculos de una fila, autor
NULL, prompt canónico, período 2026-W40 y un target. La evidencia guarda locks
y UUID final; los conteos/igualdad corresponden a las aserciones ejecutadas del
checker revisado, sin respuestas SQL crudas adicionales.

Cleanup y restoration PASS. SHA del reloj original antes/después:
`65fed91b998e2910593bebfafd3baf994d6732362c4a3d2ce0043718ea254814`.
Comparación exacta de OID, definición, owner, ACL, config y execute privado.
Auth users/sessions, profiles, passes, clubs, miembros, rondas, targets y
sesiones `cr401-*` quedaron en cero. El checker retiró su journal; no se llamó
recover. Stop normal acabó a las 12:57:31 UTC: Docker vacío, puertos 3000, 3001,
9222 y 54320–54329 libres IPv4/IPv6 y todos los volúmenes previos conservados.
Los 338 ficheros de preparación y todo el intento3a conservaron sus hashes.

Las evidencias y la liberación de ownership están en
`.scratch/ticket-campaign/20261005-resume/club401-native-corrected-r1/runtime-final-r1/`.
Manifest de 15 artefactos SHA
`6a9e66005e44ab139b27f49e37fc596c445796d12236d8d357aabdd1bb1dba20`.
Este PASS local no acredita SQL del plan posterior integrado, navegador o
dev/prod; la revisión independiente siguiente conserva ese límite y la CI del
HEAD final continúa siendo un gate distinto.

## Revisión independiente del runtime e integración local

La revisión fresca `PASS_LOCAL_NATIVE_EVIDENCE` no encontró hallazgos. Cotejó
49 controles de metadatos, los 15 artefactos finales, 338 de preparación y seis
referencias históricas contra sus hashes y los oráculos del checker real.
Verificó secuencia start/run/stop, once casos, dos locks anteriores al release,
UUID/filas, restauración y limpieza registradas. No repitió SQL ni servicios,
no inspeccionó el worktree en edición y no atribuyó el resultado al nuevo plan
de main. Se conservan el FAIL del primer seed y las respuestas SQL cuyo valor
se acredita por las aserciones ejecutadas, sin inventar payloads crudos.

El manifest está en
`.scratch/ticket-campaign/20261005-resume/review-club401-runtime-fresh-r1/manifest.json`,
SHA `8e7a61f3dec69a326ef274054d5490742121161f0ba1040a9bcd23fd5610d943`.

La integración de `4949` quedó en el merge local
`d0fa1ac9ba24504da7c521cb4e7506665c93fb08`. Su único conflicto estaba en el
índice de testing: se conserva íntegra la entrada recibida de #405 y se añade
#401. El merge posterior de `f1205` no produjo conflictos. El caller mantiene
las consultas de `margin_notes.sql` y `experiences_places.sql`, además del gate
de rondas previo al ledger. Los workflows conservan el contrato Node de #405
y la exclusividad de #401. El plan natural actual tiene 295 etapas; aquí no se
ejecuta SQL. `.env.example` se conserva por su blob recibido, sin leer valores.

Los pins y comprobaciones de preservación están en
`.scratch/ticket-campaign/20261005-resume/club401-main-integration-r1/`.
El checkout de Git convirtió inicialmente la matriz a CRLF: se guardó el FAIL
de comparación de bytes y se restituyeron los LF revisados, tras probar que
el blob y el contenido normalizado eran idénticos. El índice se refrescó sin
cambio de contenido ni nuevo commit de matriz. Checker y matriz conservan
respectivamente SHA `f663ec597d575e15c9b262c4384f92e64b0e2d0b38318220caf07963149ae9fa`
y `fc8eed0c6d9930dffae820d526704b40b185ff2ac019898b03f6e322e94bf8a0`.

La comparación de aquel corte acredita los 3316 blobs de `f1205` fuera de los
nueve archivos propios; el caller, workflows, package e índice sólo añaden el
alcance de #401. No cambian dependencias. En aquel candidato pasaron
24/24 contratos Node del bootstrap/checker y 9/9 del caller real de #405, cero
skip, además de lint focal, tipos sin emisión y sintaxis de bootstrap, caller
y checker. Los comandos, salidas y receipts se conservan en la cápsula de
integración; estos checks no ejecutan PostgreSQL ni navegador.

En aquel corte quedaba integrar la main definitiva con Celebraciones antes
de una única CI final. Su continuación se conserva en una carpeta nueva.

### Main definitiva 8424 y contratos del caller actual

La main `8424eeccd1e906cb9fcf93d309832cdc927fb3f0` tiene el mismo árbol Git
`fb875b85fc2770f57650b41b1aaeadbc4586a45e` que el candidato `0c663a3` probado
por el coordinador. El merge local conserva Celebraciones, diagnósticos #1369,
cabecera #1385, Notas y Lugares. El plan natural tiene **298 etapas**, con las
tres migraciones de Celebraciones y su activación protegida recibidas de main;
este worker no añade ni modifica migraciones.

Hubo tres conflictos: los dos workflows y `docs/TESTING.md`. La resolución
conserva exactamente el step de activación tras quiescencia, los 20 contratos
bootstrap/cutover y la fixture Node de #405, y añade sólo el flag de
exclusividad de rondas a cada comando DB. El índice conserva íntegra la doc
incoming y anexa #401. El caller mantiene todas las fases SQL de main, incluida
`verify-celebrations.sql`, y el gate de rondas anterior al ledger general.

El caller ahora importa `preparedLocalActivation`, que sólo contrasta fuentes,
stamp e identidad de configuración antes de devolver el contenedor; no ejecuta
SQL ni procesos. El harness VM anterior rechazó ese import nuevo: RED real de
27 casos, 25 PASS y dos FAIL del caller. Se guardaron salida y fuentes antes del
arreglo. La adaptación añade exclusivamente esa frontera de lectura y `resolve`
al transporte controlado; conserva los oráculos de reachability y ausencia de
SQL sin GO, además de las 14 pruebas restantes de rondas. Checker y matriz
siguen con sus bytes y blobs revisados.

GREEN del candidato: **36/36** contratos Node, cero skip/fail: 11 bootstrap,
nueve cutover y 16 rondas. Son los 20 de main y los 27 bootstrap/rondas con 11
compartidos; no se suman como tandas independientes. La fixture #405 pasa
9/9, tipos sin emisión, lint focal y sintaxis del bootstrap/caller PASS.

El diff-check general contra el corte anterior detectó una línea en blanco al
final de `20261003184419_recoverable_celebrations_expand.sql:212`, ya presente
en main `8424`. El FAIL y su reproducción entre commits incoming se conservan;
el blob de esa migración sigue idéntico. El diff-check del delta propio de #401
contra `8424` pasa. No se corrige la migración recibida para ocultar el FAIL.

Captura, conflictos, RED y checks finales en
`.scratch/ticket-campaign/20261005-resume/club401-main-integration-r1/main8424-r1/`
y sus receipts asociados dentro de la misma cápsula. Los 168 artefactos del
sello anterior `f1205` conservan sus hashes. La revisión runtime sigue PASS en
su pin 44be/F3/288; la **CI del nuevo HEAD integrado está pendiente** y deberá
ejecutar la matriz/carrera en la base actual. No se repite el F3 histórico.
En esta entrega SQL/Docker/Next/navegador quedan NOT_RUN; publicación y cierre
requieren el gate del coordinador. #401 sigue abierto.

## GO y protocolo reproducible para una siguiente QA

Los GO históricos corresponden a sus pins/cápsulas y no autorizan un nuevo
runtime del candidato integrado. El coordinador debe confirmar proyecto/contenedor
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

La matriz SQL y la carrera corregidas sí se ejecutaron y pasaron en44be/F3/288.
No acreditan SQL del plan posterior integrado, grants remotos, navegador ni CI
del candidato integrado. El runtime no cambió fuentes, migraciones, passes,
Auth persistente, credenciales, dependencias, dev/prod o configuración de
producción. La integración local posterior conserva las migraciones de main y
el checker/matriz probados; no añade migraciones ni altera esquema. La revisión
independiente del runtime pasó; la CI final del candidato integrado sigue
pendiente. No se ha cerrado #401.
