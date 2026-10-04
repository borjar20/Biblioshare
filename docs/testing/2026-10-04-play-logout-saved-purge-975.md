# Purga del espejo de partidas al cerrar sesión — #975

[Informe de verificación · 2026-10-04]

La salida real de Ajustes espera la purga de las **copias sincronizadas sin
tombstone** de la identidad validada por Auth. Conserva partidas pendientes,
intenciones de borrado, otras identidades, las guardadas anónimas y la partida
activa. Una transacción compartida con el contexto de sesión impide que el
trabajo de sincronización retirado repueble ese espejo después del logout.

## Diagnóstico y política

La [issue #975](https://github.com/borjar20/Biblioshare/issues/975) describe
retención en disco. `listSaved(identity)` ya aísla las listas: no se atribuye
una mezcla de cuentas en la UI. La prueba anterior al cambio del botón real
falló porque `A-synced` seguía presente al llamar a la acción de salida.

El diagnóstico con IndexedDB en RAM y el ejecutor real confirmó dos riesgos:
borrar indiscriminadamente elimina fuentes pending/tombstones, y una respuesta
de pull nueva puede volver a guardar A después de una purga simple. Se aplica
la política conservadora indicada por el coordinador: **no borrar pendientes
sin confirmación**. Un tombstone con `syncStatus="synced"` también se conserva:
ese estado acredita la subida original, pero el `remove` remoto aún debe
confirmarse. El predicado de purga es `synced && deletedAt === null`.

## Contrato aplicado

- IndexedDB pasa de v4 a v5 añadiendo únicamente `saved_sessions`, por identity.
  Guarda generación, session_id actual, estado de cierre e ids retirados.
  No guarda tokens, cookies, contraseñas ni decide permisos remotos.
- `getUser(token capturado)` valida el uid en el servidor; session_id leído
  del token sólo distingue login de refresh. Un refresh mantiene generación;
  un login nuevo puede abrir otra. Ningún id retirado puede reabrir, incluso
  después de varias salidas y reentradas de A.
- Cerrar la generación y purgar `saved` ocurre en una misma transacción. Los
  put/delete de sync verifican la generación en su propia transacción conjunta
  y comprueban también el propietario de la fila antes de tocarla.
- El canal existente `biblioshare:play:saved:<identity>` acelera la cancelación;
  no constituye la garantía. Una señal vieja no cancela una generación nueva.
- El candado de sync distingue generaciones. A nueva no espera la respuesta
  vieja, y el finally viejo no puede soltar su candado. Pull/ACK de push/remove
  tardíos se descartan; las fuentes pendientes siguen disponibles para repetir.
- Guardar desde una herramienta directa puede abrir una sesión nueva validada
  sin haber montado el historial. Sólo un intento de guardar con contexto
  cerrado consulta Auth; no hay consultas Auth por render. Un ACK local de
  save que llega después del cierre no vacía la partida activa.
- Logout registra el contexto validado aun si no hubo sync y espera la purga
  antes de revocar la sesión nativa o navegar. El módulo se carga al pulsar.
  El delete remoto añade filtro owner_id a los ids; conserva RLS existente.

## Pruebas y fronteras

Node **24.19.0**, Vitest **4.1.11**, fake-indexeddb **6.2.5**. La suite usa
IndexedDB real en RAM, logs sintéticos válidos y los módulos db/store/sync
reales. Dos módulos distintos abren dos conexiones a la misma factoría IDB;
se observa su orden transaccional y el rechazo sin recibir BroadcastChannel.
Auth, backend, acción de navegación y transporte de canal son fronteras
controladas. El caso de owner_id aplica filtros a un backend doblado: no
demuestra RLS real ni ejecuta SQL. Para save tardío sólo se retiene el callback
de confirmación de una transacción que sí ha escrito y confirmado en IDB.

| Verificación | Resultado | Evidencia propia |
|---|---|---|
| Botón real antes del arreglo | RED: 1/1 falla; copia A-synced permanece | `red-logout-01/output.log` |
| Purga indiscriminada y pull tardío originales | CONFIRMED; pérdida de fuentes/repoblación | `diagnosis-01/diagnosis.json` |
| Suite completa Play + logout | PASS: 500/500, 41 ficheros | `play-suite-06/result.json` |
| Controles causales finales | PASS: 24/24 | `mutant-control-02/result.json` |
| Nueve mutantes en RAM | 9/9 KILLED por aserciones, sin error de carga | `mutants-summary-02.json` |
| Typecheck sin caché incremental | PASS | `types-final-06/output.log` |
| Lint de 15 fuentes cambiadas y fixture tipada final | PASS | `lint-final-02/`, `lint-fixture-final-03/` |
| Diff y perímetro de archivos | PASS | `diff-check.log`, `source-hashes.json` |
| Navegador, backend real, build de producción | Corte inicial: PENDIENTE; ver QA nativa posterior | En este corte no se iniciaron servicios |

Los mutantes eliminan, por separado, protección de pending, alcance por
identidad, comprobación transaccional de generación, rechazo de ids retirados,
protección del candado nuevo, comparación de generación del canal, filtro
remoto de owner_id, guarda de ACK local y reapertura de sesión al guardar.
Sólo se transforma código en RAM; los fuentes del checkout no se sustituyen.

También quedan conservados los fallos de preparación. `candidate-01` incluye
el orden de apertura de la segunda conexión y el interceptor antiguo que sólo
reconocía la transacción de un store; se corrigieron las fronteras de prueba.
`candidate-03` carecía de navigator.onLine en Node; el fixture ahora lo fija.
`types-final-04/05` detectaron la aridad sin tipo del builder doblado; se tipó.
No se presentan esos fallos como bugs de producto ni como mutantes abatidos.

Se incorporó main `2a1766b4c0a4747751c03dc144e1e44f2e933ba1`. La cobertura
de #977 conserva rollback exacto de v1 tras errores de petición asíncronos y
reintento sin reset; sólo añade el store v5 a la expectativa final. La prueba
v4→v5 aborta la creación aditiva y conserva esquema, saved y active originales;
el siguiente intento funciona. También verifica cierre por versionchange.
El informe histórico de #977 queda intacto. La suite emite una advertencia
act() en use-active-game.test.tsx; no hay errores no tratados en la ejecución.

## Límites y entrega

No es una limpieza total de datos del dispositivo: permanecen pending,
tombstones, active y los metadatos de cancelación; players/companion tampoco
son objeto de este ticket. Los ids retirados se retienen para impedir ABA y
no se presentan como credenciales. Borrar esas fuentes o diseñar borrado total
confirmado requiere una política aparte y seguimiento como issue por Root.

Sin Auth verificable, con IDB no disponible o con transacción abortada,
`purgePlaySavedOnLogout` devuelve fallo y el logout sigue siendo posible;
no se acredita purga ni barrera confirmada en ese caso. Una petición remota
ya enviada puede terminar: su ACK local retirado se descarta, conservando la
fuente para una pasada nueva. Ese corte de pruebas controladas no probó cuota
física de disco, navegador nativo, sesiones reales ni datos productivos;
la QA web posterior figura abajo.

Raíz de evidencias: `.scratch/ticket-campaign/20261002-resolve-all/play-logout-saved975-20261004/`
en el checkout raíz. `manifest.json` y su SHA-256 recogen el inventario de evidencias;
`source-head.json` y `source-hashes.json` fijan el candidato para revisión.
Root integra documentación central, seguimiento de los límites, QA y GitHub.

## Corrección de dos hallazgos de revisión — r2

La revisión independiente r1 del HEAD `ac46450` conservó dos FAIL de
comportamiento y un control PASS. Sus artefactos originales permanecen
intactos en `play-logout-saved975-independent-review-20261004-r1/`.
El parche r2 se revisa sobre ese mismo HEAD, sin commit ni publicación.

**Mutaciones explícitas tras reentrada.** Los botones reales de Guardadas
esperan `savedSessionForMutation`: una generación ya validada comprueba que
Auth sigue en su session_id sin otro getUser; una nueva espera la validación
del token capturado y el registro del contexto. La preparación no depende de
que el pull del hub termine. Mientras espera se bloquean las acciones y una
operación rechazada no cierra la hoja como si hubiera terminado.
`deleteSavedFromHistory` y `adoptAnonymousSaved` comprueban generación,
identidad de origen y fila vigente dentro de la transacción. Borrar una copia
que pasó a synced durante la espera deja tombstone; adoptar sólo mueve una
fila anónima viva y nunca otra cuenta ni un tombstone.

El diagnóstico r1 llamaba directamente a las primitivas IDB con el contexto
cerrado, antes de validar Auth. Esas escrituras deben seguir rechazadas.
El GREEN de r2 prueba el consumidor real: la acción solicitada espera y se
aplica después de la validación; no se eliminó la barrera para hacer pasar
esas llamadas prematuras.

**Finalización de save frente al cierre.** En r1 el ACK de saveFinished ya
había llegado antes del logout; se retuvo la entrega de una lectura posterior
de generación que sí había completado. Al entregarla tras el cierre, el store
consumía su snapshot antiguo y borraba active. La pending confirmada seguía
presente: no se atribuye pérdida de la única copia ni se confunde este caso
con el ACK de guardado tardío ya cubierto por el candidato original.

Ahora `releaseSavedActive` comprueba generación, revisión e id de partida en
la misma transacción `[active, saved_sessions]` que libera la activa. El store
la ejecuta en su cola, espera su confirmación y sólo entonces publica el
snapshot vacío; no encola después otro deleteActive sin barrera. Si el logout,
un relevo de la activa o un abort impiden esa liberación, save devuelve false
y conserva el snapshot y la fuente pending. La lectura readonly previa sólo
sirve de rechazo temprano, no es la garantía de exclusión.

| Recorrido | RED conservado | GREEN / contracontrol | Evidencia r2 |
|---|---|---|---|
| Mismos diagnósticos originales | 2 FAIL, 1 control PASS | Reentrada se corrige en el consumidor, manteniendo rechazadas las primitivas prematuras | `red-original/` |
| Botones reales: borrar pending y adoptar anon | 2/2 FAIL por estado persistido | Ambos esperan Auth y aplican su acción; 8 casos del componente PASS, incluyendo rechazos y offline validado | `red-consumers-01/`, `green-consumers-01/`, `contracontrols-01/` |
| Lectura completada con callback tardío, logout real | 1 FAIL, 1 control PASS | 4 casos PASS: cierre, control normal, relevo de active y rollback de liberación | `red-finalization-01/`, `green-finalization-01/`, `contracontrols-01/` |
| Mutaciones IDB por contexto y origen | — | 2 PASS: contexto retirado/nuevo, otra identidad y tombstone anónimo | `contracontrols-01/` |
| Corpus Play y componentes afectados | — | 588/588 en 56 archivos; incluye los 41 archivos del corpus anterior de 500 pruebas, sin omisiones | `play-suite-01/` |
| Tipos sin caché incremental, lint de siete fuentes y diff | — | PASS | `types-01/`, `lint-01/`, `diff-check.log` |

Los 14 casos durables nuevos usan consumidores/IDB/store/sync reales y
Auth/transporte controlados. Los mocks del select de Guardadas devuelven error
para que un pull de fondo no pueda producir el resultado que debe acreditar
la acción local. Las pruebas negativas cubren A→B durante la validación, un
token de la sesión retirada, contexto retirado frente a nuevo, otra identidad
y tombstone anónimo. La generación ya validada puede borrar/adoptar offline
sin nuevas consultas al servidor. El callback tardío y el abort se controlan
en transacciones IDB reales en RAM. El relevo de active usa otra escritura
real, sin entrega del canal; no se presenta como una nueva prueba de dos
conexiones, que sigue acreditada en el corpus original.

La suite amplia vuelve a emitir la advertencia act() histórica de
use-active-game.test.tsx; no hay errores no tratados, reintentos ni skips.
Los nueve mutantes del informe anterior corresponden al código original
sellado en `23bb9d2`, no son una nueva ejecución causal sobre el parche r2.
No se alteran el predicado de purga ni la retención deliberada de #1375.
Sin Auth/IDB verificable se conserva la operación pendiente y no se declara
éxito. Navegador, sesiones/RLS reales, cuota física, build y CI del nuevo
candidato siguen siendo gates independientes pendientes del coordinador.

Raíz nueva: `.scratch/ticket-campaign/20261002-resolve-all/play-logout-saved975-fix-20261004-r2/`.
El recibo, inventario/hash y diff de r2 fijan los ocho archivos propios (cuatro
funcionales, tres de regresión y este informe). No se tocaron fuentes de otros
tickets, docs centrales, dependencias, secretos, backend ni producción.

## Relevo de Auth durante el registro confirmado — r3

La revisión r2 conservó un hallazgo adicional en los botones reales. Auth ya
había validado el token de A-next y `startSavedSession` había confirmado A en
IndexedDB. Se retuvo únicamente la entrega de su ACK, se cambió Auth a B sin
cerrar ni purgar la generación de A, y se liberó el ACK. Borrar eliminaba la
pending de A; adoptar movía la anónima a A. Los dos fallos son de estado
persistido, con cuatro controles PASS. No es una repoblación después de una
purga: no se ejecuta la purga en esos dos escenarios.

La rama de registro de `savedSessionForMutation` espera ahora su ACK y relee
Auth antes de devolver el contexto. Exige la misma identidad **y session_id**
que se validaron con `getUser(token capturado)`. La lectura local de
`getSession` sólo detecta el relevo: no autentica por sí sola ni sustituye la
validación previa. Un refresh que cambia el token pero conserva session_id
sigue siendo válido; A→B→A con otro session_id se rechaza. La comprobación
que ya sigue a getUser continúa rechazando A→B durante esa validación, antes
de registrar IDB. Las referencias oficiales de [getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
y [getSession](https://supabase.com/docs/reference/javascript/auth-getsession)
describen esa diferencia entre validación remota y lectura de la sesión local.

No se repite getUser después del ACK ni en el camino de una generación ya
validada. Borrar/adoptar siguen disponibles offline con ese contexto. Las
escrituras conservan su barrera transaccional de generación: un logout
confirmado durante el ACK rechaza la mutación incluso si Auth local todavía
muestra A. Un rechazo por relevo no purga fuentes ni retira por su cuenta la
generación que ya confirmó en IDB; la política de retención de #1375 no cambia.

| Verificación r3 | Resultado | Evidencia propia |
|---|---|---|
| Copia del diagnóstico del revisor sobre r2 | RED: 2 FAIL persistidos y 4 controles PASS | `red-result.json`, `red-auth-registration-delete.json`, `red-auth-registration-adopt.json` |
| Regresión durable antes del arreglo | RED: 4 FAIL (borrar/adoptar, A→B y A→B→A) y 12 controles PASS | `red-durable-result.json` |
| Mismos diagnósticos y componente real después | PASS: 22/22, dos ficheros; componente 16/16 | `green-result.json`, `green-auth-registration-delete.json`, `green-auth-registration-adopt.json` |
| Sesiones, mutaciones, finalización, db/store/sync/adaptador afectados | PASS: 119/119, nueve ficheros | `focused-result.json`, `vitest.focused.config.mjs` |
| Mutante sin comprobación después del ACK | KILLED: los cuatro relevos fallan; doce controles PASS | `mutant-no-post-ack-result.json` |
| Mutante que sólo compara uid | KILLED: los dos ABA fallan; catorce controles PASS | `mutant-uid-only-result.json` |
| Tipos sin caché incremental y lint de las dos fuentes cambiadas en r3 | PASS | `types-command.json`, `lint-command.json` |

Los ocho casos durables añadidos retienen el callback de una transacción
real de `saved_sessions`, cuya confirmación se observa antes del cambio de
Auth. Cubren cuatro relevos, dos refresh de la misma sesión con getUser
posterior no disponible y dos cierres confirmados. Se conserva el control
anterior de una generación ya validada que borra/adopta offline sin getUser.
El modo offline del navegador impide que un pull de fondo explique los
resultados locales; Auth y canal siguen siendo fronteras controladas. Los
mutantes sólo transforman el módulo en RAM y fallan por las aserciones del
estado, sin sustituir fuentes del checkout ni fallos de carga.

El corpus de 588 pruebas de r2 conserva su evidencia histórica; r3 ejecuta
los 119 casos pertinentes y no atribuye una nueva pasada de todo ese corpus.
No hay reintentos, skips ni errores no tratados en las ejecuciones r3.
La garantía comprobada es el relevo durante la espera del registro; Auth e
IndexedDB no se presentan como una única transacción. Navegador, sesiones
reales, backend/RLS, build y CI del candidato nuevo siguen siendo gates
independientes del coordinador.

Raíz r3 en el checkout principal:
`.scratch/ticket-campaign/20261004-continue/fix-logout975-r3/`.
`red-manifest.json` fija el RED antes del arreglo; `source-after.json`, la
copia de los ocho fuentes y `manifest.json` sellan esta entrega. r3 sólo
modifica `saved-auth.ts`, la regresión del componente y este apéndice dentro
de los ocho archivos propios de r2. Se conservan los otros cinco hashes y
todas las evidencias anteriores. No hubo escrituras Git, backend, servicios ni publicación.

## QA nativa del candidato integrado — 2026-10-05

**PASS funcional focal agregado: diez casos distintos. Resultado global: FAIL.**
El corte integrado `7b5b426f3422b01e9d418bc7887d915cba1bdac9` incluye los arreglos
r2/r3 y el consumidor de celebraciones #1369 sobre su padre #1334. TypeScript
sin caché y los 129 casos pertinentes de diez archivos pasaron antes de la QA.
La revisión independiente r3 pasó 26/26 controles sin hallazgos y mantuvo
los hashes de las 23 fuentes revisadas.

La QA usa Chromium, IndexedDB nativa, login y logout reales, respuestas del
backend local y build de producción `cwo-7Cx3TNRRZQ8F-k_O7` (Node 24.19.0,
Next 16.3.8). Los ocho casos de `run03-integrated` acreditan guardado/finalización,
purga selectiva, pull y ACK de push tardíos, borrar y adoptar tras reentrada,
ACK de guardado después de logout y ABA. `run05-auth-switch` acredita adopción
A→B y `run06-auth-delete`, borrado A→B. Es la unión de ocho más uno más uno
sobre la misma build y fuentes; no una ejecución única de diez casos en verde.

Las fronteras declaradas controlan la entrega de respuestas reales y de
callbacks de transacciones nativas ya confirmadas. Las filas sintéticas son
propias. A→B realiza login B en un contexto separado y transfiere en RAM sus
cookies reales antes de liberar el ACK; confirma B en Auth y A aún abierto
en IDB. No se forjan JWT ni se simula Auth. El drenaje tardío de 500 ms limita
las observaciones. Esta tanda no ejercita cuota física, Android ni producción.

El journal continuo conserva dos React #418, errores Failed-to-fetch y
cancelaciones POST sin clasificación causal. No se relajan las guardas ni
se declara salud global limpia. El caso MTG original de #1008, ejecutado
aparte sin actores ni interceptaciones, reproduce dos #418 al llegar a
`/partida/activa` tanto a 390 como a 1280 px. Ese fallo confirmado se sigue en
[#1385](https://github.com/borjar20/Biblioshare/issues/1385); las cancelaciones
de red conservan su seguimiento separado en #1301. CI del candidato final
y la resolución de sus bloqueos continúan pendientes.

Los seis intentos y los tres cortes MTG se conservan, incluidos los FAIL
de preparación. Las 1995 fuentes, los diez blobs congelados y el bootstrap
local se revalidaron sin cambios. Treinta actores propios quedaron con
Auth404 y cero filas en las once tablas comprobadas. Next y navegador se
cerraron; Supabase se detuvo normalmente con backup. Los dos directorios y
volúmenes locales se conservaron, con los cuatro puertos libres.

Evidencia: `.scratch/ticket-campaign/20261004-continue/native-logout975-r2/`.
`final-report-r1/Report.md`, `receipt.json` y `manifest.json` fijan el dictamen;
SHA-256 del manifest:
`0ca8552461986a71e78a09692c8c15394eaebd792481778450fdd8c4a41a9fcd`.
Este corte sustituye únicamente los estados de QA web pendientes de los
apartados históricos; conserva sus resultados, fronteras y FAIL originales.
