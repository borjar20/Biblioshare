# Purga del espejo de partidas al cerrar sesión — #975

[Informe de verificación · 2026-10-05 · Native local en corte 5679ec91]

La salida real de Ajustes espera la purga de las **copias sincronizadas sin
tombstone** de la identidad validada por Auth. Conserva partidas pendientes,
intenciones de borrado, otras identidades, las guardadas anónimas y la partida
activa. Una transacción compartida con el contexto de sesión impide que el
trabajo de sincronización retirado repueble ese espejo después del logout.

La tanda final local acredita **diez casos funcionales juntos en una build
nueva**, con Auth/backend e IndexedDB nativos. El resultado agregado del
supervisor conserva **exit1 / GLOBAL FAIL_UNCLASSIFIED**. El apartado final
fija el corte probado, el diario completo, la limpieza y los límites; los
intentos anteriores permanecen como historia con sus propios resultados.

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

## Preparación de la tanda final integrada — 2026-10-05 (corte histórico)

Se integra el objeto local `0c663a3d396e43e3524f8e11b12dc5cd852618af`
sobre `9d7271ebdc2b00e9b93433ec56d84ab118ef5a07`, conservando #1334/#1369,
el arreglo de chrome #1385 y los cambios de main de Notas en el margen y
Lugares. Los 19 archivos fuente propios de #975 conservan sus bytes; los
siete pins de código r3 siguen iguales al recibo original. El único conflicto
documental conserva ambas entradas de `decisiones.md`, sin comportamiento nuevo.

Antes de congelar el candidato pasan 20 contratos Node del bootstrap/cutover,
124 pruebas focales de Play/logout en 11 archivos, TypeScript sin caché y la
integridad del grafo (141 nodos, 280 aristas, 30 flujos y 267 pasos). Son
comprobaciones estáticas; no acreditan la futura build ni una tanda de navegador.

La nueva cápsula es
`.scratch/ticket-campaign/20261005-resume/logout975-preparation-r1/`.
Prepara los diez casos juntos contra una build de producción nueva y un
bootstrap natural calculado con `loadPlan` sobre este árbol completo; no
reutiliza el ledger 291 ni la build anterior. Conserva el setup A→B mediante
login real B y cookies sólo en RAM, los selectores corregidos en run06 y los
callbacks originales de IndexedDB retenidos después de su commit nativo.
El spec original de salud permanece intacto. La ejecución está en HOLD hasta
un GO escrito del coordinador; no se arrancaron servidores, Docker ni SQL.
Los diez PASS agregados y todos los FAIL históricos mantienen su alcance.

## Tanda final Native local — 2026-10-05

Único intento sobre HEAD `5679ec91db0563d06747c5a549da7274fbe8bf12`, árbol
`88ecd9978d488ba75757517eaee60a94d8fac370`. Node 24.19.0 y Next 16.3.8 construyen
una `.next` nueva mediante el `scripts/ci-local.mjs build` del candidato.
BUILD_ID `n7uFqvxOmrMQs2Tcyczt4`, SHA-256
`625cdd64a8b1e0fda00c410c82a9da07bdb3fb82ee2bf1a862a98dc7e8fb1d19`.
Los diez casos originales se recogen y pasan juntos, worker1/retry0/repeat1,
sin skip, unexpected ni flaky, en 32,29 segundos.

| Caso funcional | Resultado |
|---|---|
| Guardar real: ACK de saved y liberación de active antes de navegar | PASS |
| Logout selectivo: purga sólo own synced vivo y conserva fuentes | PASS |
| Pull retirado: respuesta remota tardía no repuebla tras salir | PASS |
| Push retirado: ACK tardío conserva la fuente pending | PASS |
| Nueva sesión: borrar sin esperar el pull anterior del historial | PASS |
| Relevo A→B después del commit IDB: borrar rechaza el ACK de A | PASS |
| Nueva sesión: adoptar sin esperar el pull anterior del historial | PASS |
| Relevo A→B después del commit IDB: adoptar rechaza el ACK de A | PASS |
| ACK nativo de guardar después de logout conserva la activa finalizada | PASS |
| ABA: pull de A1 retirado durante dos reentradas reales | PASS |

El backend nuevo `biblioshare-local-eabc24f2` se genera desde el plan completo:
298 pasos, 297 materializados y una activación protegida diferida. Start y
checker/quiescencia/COMMIT canónicos completan 298 versiones reales exactas;
no se reutilizan ledger291, stamp o volumen anterior. El censo inicial está
a cero. Los actores A/B son locales y propios; el cambio A→B usa login real B
y cookies Auth en RAM antes del ACK. IndexedDB ejecuta el commit nativo y el
observer entrega tarde el callback original. Se declaran las filas IDB/remotas
sintéticas propias y las respuestas REST reales retenidas. No hay JWT forjado,
Auth simulado, respuestas de Next interceptadas ni cambios del spec de salud.

La preparación R1 se conserva con FAIL material: su creación de Next podía
emitir un error fuera del try/finally. R2 instala la escucha desde la creación
y propaga el error dentro del supervisor protegido, incluyendo comandos y
salida anterior a readiness. Tres controles de proceso locales PASS acreditan
la llegada al callback y recibo de limpieza de su fixture; no se presentaron
como un PASS Native. La revisión R2 precede al único GO escrito.

### Global FAIL conservado y límites causales

El supervisor observado termina **exit1 / FAIL_PRESERVED**, pese al PASS
funcional 10/10. El diario pasivo continúa hasta cerrar todos los contextos:
6.613 eventos, 12 contextos cerrados, pageerror0, console7, HTTP2 y
requestfailed170. Los abortos son 121 GET RSC, 5 GET Auth/user y **44 POST
Next**, todos `net::ERR_ABORTED`. La consola conserva dos errores asociados
a409 y cinco `Failed to fetch` con `getUser` en el stack. Cero allowlists.
Los títulos y URLs de los POST están conservados; el journal no recoge
headers `Next-Action`, cuerpos, action IDs o el click iniciador, por lo que
no identifica cada acción ni su posible efecto servidor.
Seguimiento de cancelaciones:
[#1301](https://github.com/borjar20/Biblioshare/issues/1301#issuecomment-5997420268).

Los dos HTTP409 son POST reales a `/rest/v1/play_games`:

| Caso / paso conocido | Estado final escrito UTC | POST iniciado UTC | Respuesta409 UTC | Contexto cerrado UTC |
|---|---|---|---|---|
| Natural: finalizar y Guardar partida | 14:59:58.256 | 14:59:58.299 | 14:59:58.333 | 14:59:58.354 |
| Nueva sesión, adoptar: Añadir a mi cuenta, GET real retenido | 15:00:14.340 | 15:00:14.410 | 15:00:14.432 | 15:00:14.448 |

Ninguna fixture sintetiza ni espera409. Ambos estados finales siguen pending;
sus asserts cubren el guardado/adopción local y la barrera de sesión, sin
afirmar terminación del sync remoto. `withBattleUsers` borra Auth en finally
tras el cuerpo y el contexto aún permanece abierto. Esa ventana es compatible
con una carrera entre cleanup y sync residual, pero no demuestra la causa:
faltan body/SQLSTATE y timestamp del DELETE. El timestamp del estado se
observó después sobre el archivo sellado. La sospecha independiente sigue
en [#1417](https://github.com/borjar20/Biblioshare/issues/1417).

### Identidad, limpieza y entrega

Las 3.184 fuentes congeladas conservan sus hashes antes/después; ambos
inventarios tienen SHA-256
`d12bd96474f931ffec394935aed0a64b2e964ca555d66f5e4fd31d49cf439864`.
`.next` pasa de 2.527 a 2.694 archivos: cero previos modificados/eliminados,
827 ejecutables estables y 167 adiciones sólo en `server/route-cache/`.
El gate fijado previamente es PASS_COMPILED_IDENTITY; el inventario FULL
registra las adiciones y el FAIL FULL histórico de #1385 no se reescribe.
Service_role está ausente de build, backup y evidencia; el anon público
aparece en 13 archivos de build, como corresponde. No se leen `.env` reales.

Veinte actores propios quedan comprobados con Auth404 y cero filas en las
once tablas observadas. Antes de parar: ledger298, Auth/sesiones/perfiles/
pases/partidas/jugadores/celebraciones0. Stop normal con backup exit0; los
40 volúmenes iniciales y los tres nuevos se preservan. El contraste desde
host acredita 13 puertos libres, perfiles Playwright0, Node Native0, Docker0,
HEAD limpio y BUILD_ID rehasheado igual. El censo se cita del corte anterior
a la parada; no se rearrancó ni consultó la base detenida para repetirlo.

Evidencia en
`.scratch/ticket-campaign/20261005-resume/logout975-preparation-r2/`:

| Artefacto | SHA-256 |
|---|---|
| `execution-r1/manifest-final.sha256.json` (2.739 archivos) | `2df89f748c69bfc33523837513ef6b2ac65d7653d98975002abf372b892a8cd5` |
| `execution-r1/browser-journal.ndjson` | `91bfcd202e64143487d79e5865a03b29d53271ab7465e8ef143b2f92408b8d59` |
| `post-runtime-observation-r1/manifest-observation-r1.sha256.json` | `90332e213002980519af36793ef2590046cf4fecec1e5dfbedbaf59a8a41ed7b` |
| `post-runtime-observation-r1/receipt.json` | `d9c4ed7360291663570073fc4fff12f26786ec82f8e240132fd5b9494d7b9d25` |
| `manifest-causal-addendum-r1.sha256.json` | `6232aab5f50f214dfe04f61e4ce8b711bf8f01d477af375e1b0a1be62253f332` |

La revisión independiente fresca de la tanda acredita **PASS funcional focal,
integridad y limpieza**, conservando GLOBAL FAIL. Contrasta los 3.184 pins en
el corte `5679ec91`, nueve dependencias y 827 ejecutables, callbacks originales
tras commit, diez snapshots y los recibos completos; no ejecuta otra tanda.
Manifest de `.scratch/ticket-campaign/20261005-resume/review-logout975-runtime-fresh-r2/`:
`2f3f05e2ad90710cbabda2d8c3f8732892f841399026a8fa9e6245044e91baf2`.

La entrega integra después main `3c7b7e03efbfc916a768edd41a97858e7722b5b2`
con Patrón C del feed y #401, preservando los 19 fuentes/tests de #975 y los
siete pins r3. Ese árbol posterior incluye cambios ajenos a la tanda congelada:
no se afirma que se ejecutó Native sobre toda la entrega posterior. CI final
y publicación se coordinan aparte; esta tanda no acredita producción, dev
remoto, Android ni cuota física. `codex_qa` se conserva y no se usa.

El alcance de #975 sigue siendo purga selectiva de copias sincronizadas vivas
y retiro de generaciones. Pending, tombstones, anonimato, otras identidades,
activa y metadatos de sesión pueden permanecer en disco. Un fallo Auth/IDB
no acredita borrado; no se promete limpieza total del dispositivo ni privacidad
local por RLS. La política residual y el borrado total confirmado siguen en
[#1375](https://github.com/borjar20/Biblioshare/issues/1375), sin cierre implícito.
