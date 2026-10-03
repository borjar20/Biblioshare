# Inicio del reloj confirmado por persistencia (#1313)

> **[Corrección r3 · verificada con unitarios, revisión independiente y navegador local de producción el 2026-10-03]**
> 163 unitarios, 11 diagnósticos independientes y 19 casos nativos del reloj
> repartidos entre la tanda inicial y una recuperación focal PASS. Se conservan
> los FAIL originales de QA, Recursos #1328 y POST sin clasificar #1301.
> CI es el gate separado de la PR de integración.

## Fallo observado y evidencia conservada

CI `37005173568` terminó con **104 PASS / 1 FAIL**. El caso de #995 a
1280 × 844 px mostró el banco de Beto `1:30`, recargó y perdió el tablero:
volvió a la configuración vacía de 300 segundos. Falló antes de Reiniciar;
no demuestra una regresión de la conversión de segundos del formulario.

La traza original sitúa `page.reload()` 1,193 ms después del PASS de `1:30`.
Ambas respuestas conservan la identidad `anon`. La UI final ya terminó la
hidratación: `ClockScreen` no muestra su contenido mientras `loaded=false`.
La traza estándar no registra transacciones IDB, por lo que inicialmente sólo
permitía plantear una carrera entre publicación y persistencia.

La observación nativa posterior confirmó esa carrera sin retener transacciones,
cambiar resultados, simular tiempo, esperar IDB ni leerla antes de recargar.
El intento 1 pasó; el intento 2 reprodujo el fallo y detuvo la campaña. En el
segundo intento:

- `1790945396231`: Beto `1:30` visible; `tx4`, `readwrite` de `companion`, seguía
  pendiente con un `get("anon:clock")` sin respuesta.
- `1790945396237`: el driver pidió recargar; en `pagehide`, a `...6243`, la
  transacción seguía pendiente. No se observó `put`, `complete` ni `abort`
  antes de descargar el documento.
- Después de recargar, tanto la lectura de la aplicación como otra lectura
  nativa independiente encontraron `anon:clock` ausente. La UI mostró 300 s
  y ningún jugador.

Esto verifica publicación anterior a durabilidad y pérdida real. No acredita
un callback de aborto concreto. Los observadores pasivos añaden algo de
trabajo al navegador; sus resultados nativos permanecen intactos.

Evidencia durable del intento 2, archivada en el checkout principal:
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/integration-1790944752297/clock1313/attempt-02-unchanged/`.
Se verificaron los tres archivos contra su manifiesto: **3 coincidencias / 0
discrepancias**.

| Archivo | SHA256 |
|---|---|
| `manifest.sha256.json` | `1534793172fc36b85cb835a05703e25af0fb8c0312761f7d0aaf00e3fdecdd02` |
| `native-events.json` | `b1535490ac2c0053483ce70efceb37e0758285477db8bec410834042bad0ce57` |
| `result.json` | `a3f666cab3779faa3648b8e464755c91c91e58602b054646e87a0e34e7344828` |
| `after-reload-loss.png` | `0ee07b3fe2adc2286e001273a1d0ea96423cda45480c2c3ae647da8600cf8392` |

El FAIL original de CI sigue en el checkout principal, bajo
`.scratch/ticket-campaign/20261002-resolve-all/`: log
`person-books1307-fail-ci-37005173568.log` y artefactos
`person-books1307-ci-artifacts-37005173568/`. Sus SHA256 comprobados son:

| Archivo | SHA256 |
|---|---|
| Log CI | `81265f8617abf37cc843a47ad5302b1cfe5ab56405e707d116f2b61885cb06c1` |
| `trace.zip` del reloj 1280 px / 90 s | `6cbdb95729972b25f203dfd1b3347fb7c0b2dd66574db3412433162ea34da120` |
| `error-context.md` de ese caso | `4fddd54c5850feeddde8c40a6518c057d1884e3e4498e165ccfcef9d399cd700` |

## Garantía del candidato

`useCompanionStore` incorpora `publishAfterPersist`, activado sólo por
`useClock`. `emit` conserva su resultado booleano de aceptación y validación;
no promete durabilidad al devolver `true`. Aleatorio, Recursos y Turnos siguen
publicando de forma optimista.

El reloj mantiene el snapshot visible anterior mientras IDB confirma. La
pantalla explica el guardado y deshabilita sus controles mediante un
`fieldset`. Con una escritura correcta, el tablero se publica después de
`tx.oncomplete`.
El timestamp sigue siendo el del evento original, por lo que esperar al
guardado no reinicia ni congela el tiempo transcurrido.

Si la escritura devuelve `unavailable`, o un conflicto contiene un registro
que no se puede reproducir, se conserva el fallback en memoria y se informa:
«No se han guardado los últimos cambios del reloj. Puedes seguir jugando
aquí, pero esos cambios se perderán al salir de esta pantalla, recargar o
cerrar.» Puede existir un snapshot durable anterior; el aviso delimita los
cambios no confirmados. Una acción posterior puede recuperar la persistencia
guardando el log completo.

El head lógico se actualiza sincrónicamente y queda separado del snapshot
publicado. La cola conserva emits consecutivos y sus revisiones; publicar un
ACK intermedio no rebobina ese head. Un CAS válido adopta la rama vigente y
descarta los commits en cola construidos desde la rama perdida, evitando que
una revisión mayor sobrescriba el log ganador.

Cada sesión de efectos tiene un token propio. Se ignoran respuestas de instancias
anteriores y se rechazan callbacks antiguos del reloj tras cambiar de identidad
o desmontar. Volver a una identidad, también al recuperar una pantalla retenida
por Activity con la misma clave, requiere una nueva hidratación. Mientras esa
lectura está pendiente, `loaded=false` y `persistence=idle`. Las escrituras ya
aceptadas conservan su clave original; sólo un CAS válido invalida la cola de
la rama perdedora, aunque su pantalla ya haya salido.

Antes de leer su clave, una hidratación nueva espera las escrituras que ya
aceptaron las sesiones e instancias anteriores de ese reloj en el documento
actual. El registro de promesas pendientes se actualiza sincrónicamente antes
de que `emit` devuelva `true`; las promesas salen al terminar, también en
conflicto o error. La barrera es por `storageKey`, sólo con el opt-in: no
serializa las escrituras de distintas instancias ni cambia el CAS. Tampoco
retrasa por su cuenta las lecturas de otras identidades; IndexedDB conserva
su propia serialización de transacciones sobre el almacén.

No se cambia el reducer, `db.ts`, el tratamiento de errores de lectura, el
esquema, las dependencias ni las variables de entorno. Los E2E existentes
se conservan; se añaden siete regresiones nativas para CI. No se añade
una espera antes de `page.reload()` ni se utiliza el helper del almacén
`active`: el reloj vive en `companion["anon:clock"]`.

## RED y verificación del contrato de r1

Las pruebas usan interfaces públicas (`useClock`, los otros acompañantes y la
pantalla real), `fake-indexeddb` como límite externo y solicitudes nativas
pendientes para retener una transacción. No sustituyen hooks, reducers ni
`db.ts`. El tiempo simulado sólo verifica el timestamp y su monotonía.

Todos los RED se conservan en `.scratch/clock1313/` de este worktree:

| Artefacto | Resultado y causa |
|---|---|
| `unit-red-start.txt` | 1 FAIL: se publicaba `chess` con la transacción pendiente; se esperaba `null`. SHA256 `dac509ea28a5f413949840e7a43bbfcda6bb6b9f8870e5149f44cb9ab75075c6`. |
| `unit-red-screen.txt` | 1 FAIL: faltaba el estado accesible de guardado. |
| `unit-red-lifecycle.txt` | 2 FAIL / 2 PASS: callbacks antiguos aceptaban acciones tras cambiar de identidad o desmontar. |
| `unit-red-return-identity.txt` | 1 FAIL / 8 PASS: volver a `anon` reutilizaba la marca de carga anterior. |
| `typecheck-fail-iterable.txt` | 2 diagnósticos en las fixtures: el parámetro IDB es iterable; se corrigió con `Array.from`. |

La tanda final de r1 con Node **24.19.0**, Vitest **4.1.11**, un worker y sin
paralelismo entre archivos acredita **151 PASS / 0 FAIL / 0 SKIPPED en 10
archivos**. Incluye 13 casos nuevos: diez de hooks y tres de pantalla. Cubren
publicación pendiente/confirmada, recuperación al remontar, timestamps,
fallback y recuperación posterior, conservación del último snapshot durable,
emits del mismo tick, ACK intermedio, CAS, identidad/desmontaje, validación,
compatibilidad optimista y cuenta atrás.

```powershell
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/vitest/vitest.mjs run src/lib/play/core/use-companion-store.test.tsx src/components/play/clock src/lib/play/core/db.test.ts src/lib/play/clock src/lib/play/random src/lib/play/resources src/lib/play/turns --maxWorkers=1 --no-file-parallelism
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit --incremental false
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/eslint/bin/eslint.js src/lib/play/core/use-companion-store.ts src/lib/play/core/use-companion-store.test.tsx src/lib/play/clock/use-clock.ts src/components/play/clock/clock-screen.tsx src/components/play/clock/clock-screen.test.tsx
```

`unit-release.txt`, `typecheck-release.txt` y `lint-release.txt` conservan los
resultados finales: **unitarios, TypeScript y ESLint focal PASS**. El primer
fallo de tipos se conserva; la recuperación final se ejecutó sobre las
fixtures corregidas y el copy aceptado.

| Comprobación | SHA256 del resultado |
|---|---|
| Unitarios finales | `8e7041814cbf81c6f07d6daf6f32985f20abded8f40be0d121cbf4bc23551d9d` |
| TypeScript final | `c1e97067c5f479a44a6f57297a0a8f87a59d181c3c529910f8bf059094bc3abb` |
| ESLint final | `c1e97067c5f479a44a6f57297a0a8f87a59d181c3c529910f8bf059094bc3abb` |

La revisión final de i18n-keeper dio **PASS** para las tres claves y la
redacción de memoria aceptada por el coordinador.
La comprobación de JSON/whitespace y el manifiesto de fuentes se conservan
en `.scratch/clock1313/`.

## Revisión independiente de r1: FAIL y corrección r2

La revisión encontró dos fallos independientes, reproducidos con hooks y
adaptador reales. Sólo `fake-indexeddb` sustituye el límite externo:

- **P1 — CAS después de salir.** Una instancia atrasada aceptaba configurar
  Ana/Beto en rev 1 y pausar en rev 2. Si se desmontaba antes del resultado, el
  retorno por `session.active=false` omitía la invalidación de la cola tras
  perder el CAS. El segundo commit sobrescribía la partida durable de
  Cara/Dani. Cambiar de identidad antes del resultado producía el mismo fallo.
- **P2 — regreso con Activity.** Next.js conserva estado y memoización al
  ocultar una ruta, pero limpia y recrea sus efectos. La marca antigua devolvía
  `loaded=true` y `persistence=saved` durante la nueva lectura pendiente; los
  controles seguían presentes y `emit` rechazaba sus acciones.

La evidencia original de revisión permanece intacta en
`.scratch/review-clock1313/`: `review.test.jsx`, SHA256
`e0188dcb2830baa3b62b1c2304853e82b762e3eb4c71e30212166b3d274d64a1`, y
`unit-diagnostic-01.txt`, SHA256
`cba3fbc5fa3e1b513854b38ff99e7c2e1be994c09968d7554e43854d8b08f531`.
Su resultado es **2 FAIL / 1 PASS**. La reproducción sobre r1 se volvió a
ejecutar en una ruta nueva y dio el mismo resultado.

En r2 el resultado de un CAS válido invalida la cola antes de comprobar si
procede publicar en la UI. Desmontar por sí solo no cancela las escrituras
aceptadas: la prueba de configuración más pausa confirma rev 2 durable tras
salir cuando no existe conflicto. Las actualizaciones de estado y los ACK
siguen limitados a la sesión visible vigente.

El token de carga de la clave se distingue del token creado en cada sesión de
efectos. La limpieza retira la marca de hidratación y la sesión nueva sólo se
declara cargada al terminar su lectura. Los callbacks de la sesión anterior
siguen rechazados después de recuperar Activity. La pantalla real no ofrece
controles durante esa lectura; después muestra la partida vigente y acepta
Pausa/Reanudar.

Se promovieron seis casos a las pruebas durables: CAS tras desmontar o cambiar
identidad, carga de Activity, controles de pantalla tras Activity, commits sin
conflicto después de salir y configure/undo del mismo tick. El RED de esas
pruebas dio **4 FAIL / 15 PASS** sobre r1; tras la corrección dio **19 PASS / 0
FAIL**. Se conservan todos los intentos en `.scratch/clock1313-r2/`:

| Artefacto | Resultado | SHA256 |
|---|---|---|
| `unit-review-red-01.txt` | 2 FAIL / 1 PASS | `2d61d12068807abd88807479c3a0d5d556218687573c81bc31ef84aed59601d2` |
| `unit-durable-red-01.txt` | 4 FAIL / 15 PASS | `8b398a3203de4d6f47731838379fe8ba53dce14edd04c6dbd110843d99b325b6` |
| `unit-durable-green-01.txt` | 19 PASS / 0 FAIL | `6a324a37d8ea89e9553c6c6910adab78a0fcfa2cc3ffdc9a90e8458737923dfe` |
| `unit-review-green-01.txt` | 3 PASS / 0 FAIL | `81d4354af8e2c8127e75da45e3a903271cf1abdf50f9a6afbe4240ea57df3fe4` |
| `unit-suite-green-01.txt` | 157 PASS / 0 FAIL / 0 SKIPPED, 10 archivos | `7d22932d4a14cf75da5d134f7b0aa837a09c6e7d56c803bb6ad05f0f269938c5` |
| `typecheck-green-01.txt` | PASS | `c1e97067c5f479a44a6f57297a0a8f87a59d181c3c529910f8bf059094bc3abb` |
| `lint-green-01.txt` | PASS | `c1e97067c5f479a44a6f57297a0a8f87a59d181c3c529910f8bf059094bc3abb` |

La suite pertinente, TypeScript y ESLint repiten los comandos de arriba con
Node **24.19.0** explícito. Los 157 casos incluyen los 19 casos nuevos del
candidato completo (15 de hooks y cuatro de pantalla), el adaptador IDB y los
reducers de Reloj, Aleatorio, Recursos y Turnos. La publicación optimista de
los otros tres acompañantes, los emits del mismo tick, el ACK intermedio, los
timestamps y el fallback siguen cubiertos.

El diagnóstico independiente original se repite sin editar su harness, con
una configuración y caché nuevas:

```powershell
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/vitest/vitest.mjs run --config .scratch/clock1313-r2/vitest-review.config.mjs
```

La integridad de los 19 artefactos listados en el manifiesto de r1 se comprobó:
**19 coincidencias / 0 discrepancias**. Su `source-manifest.json` conserva
SHA256 `a1268ba52904963b4c94afb762446b3d1e78df04b1af19aa203a946c9f7b3cbe` y
`candidate.patch` conserva
`56c10742eb3dbd9a657bdc1ebddc2f353415d99693529a9185a47b56ccb7812a`.
El manifiesto de las siete fuentes actuales y los checks de r2 viven en
`.scratch/clock1313-r2/source-manifest.json`, con su archivo de hash separado.
La copia española conserva exactamente el hash revisado en r1.

## Revisión independiente de r2: FAIL y corrección r3

La revisión de r2 confirmó que los tres diagnósticos originales ya pasaban,
pero encontró **P1 — la hidratación puede adelantarse a una escritura ya
aceptada**. `session.tail.then(...)` difiere el comienzo de la escritura; un
efecto nuevo llama inmediatamente a `readCompanion`. La protección correcta
del ACK anterior impide publicar en una sesión terminada, pero no reconcilia
la lectura adelantada de la sesión nueva.

Se reprodujeron tres variantes:

- Un único `chess_configured`, desmontaje y nueva instancia inmediatos: IDB
  termina en rev 1 con Ajedrez, pero la instancia cargada conserva `mode=null`.
- Un único `chess_configured`, Activity oculto y visible inmediatamente:
  produce el mismo estado vacío. Ambas variantes se reprodujeron sin retener
  IDB ni simular el tiempo.
- Configurar y pausar en el mismo tick, regresar con Activity antes de acabar
  la cola: la lectura puede encontrar sólo rev 1 y mostrar `paused=false` y
  `persistence=saved`, mientras IDB termina en rev 2 con `paused=true`.

El dictamen original está intacto en
`.scratch/review-clock1313-r2/review-result-01.json`, SHA256
`e25a338bfb24f0f30df0382af3a0d252086e01fe7bd92fafd9c1cce57389ff34`.
`unit-single-diagnostic-01.txt` conserva **2 FAIL**, SHA256
`8221a9d0b3ee10acd7dc30830a2c9d57d536b9c053539252f423960ee015a732`;
`unit-queue-diagnostic-01.txt` conserva **1 FAIL**, SHA256
`8f4f24658bd1b96d5ea9568560bfb9bc458b3d35a53ddcbde7b1f39cb46e8c10`.
No se editaron los harness de revisión ni sus configuraciones y resultados.

r3 añade un registro de las promesas aceptadas por clave, compartido entre
instancias del hook. Cada commit del reloj entra en ese registro antes de
devolver aceptación. La nueva hidratación espera las promesas de su clave y
vuelve a comprobar si se aceptaron más durante la espera. Después lee IDB;
si su sesión ya terminó, omite esa lectura. La cola sigue perteneciendo a cada
sesión y las instancias ya cargadas mantienen su arbitraje CAS anterior.

Al resolver o rechazar una promesa se retira su entrada; si no queda ninguna,
se elimina también la clave. Esto incluye las escrituras canceladas al perder
un CAS y las que degradan a memoria. No se conserva un snapshot global ni se
transforma un ACK antiguo en una actualización de la UI nueva. Los callbacks,
el head lógico, las revisiones y los timestamps conservan su contrato.

Se promovieron las tres variantes a pruebas públicas durables y se añadieron
controles de otra instancia aún montada, solicitud de lectura de otra
identidad y pantalla real que sale y vuelve inmediatamente. Los casos de CAS
tras desmontaje/cambio de identidad ahora también rehidratan la partida
ganadora. El control de otra identidad observa únicamente la solicitud IDB:
no afirma que una transacción de lectura pueda saltarse un bloqueo nativo del
mismo almacén.

Todos los intentos nuevos viven en `.scratch/clock1313-r3/`:

| Artefacto | Resultado | SHA256 |
|---|---|---|
| `unit-review-red-01.txt` | 3 FAIL / 3 PASS, diagnósticos originales sobre r2 | `f4213fa08762c2e18576282bbd67651d91ab9aa815126b7f19a1f98e2abcae7a` |
| `unit-durable-red-01.txt` | 5 FAIL / 20 PASS sobre r2 | `4d89c3854fefebbfba46521790c370cc1db227c08417725c2d9bfc982ce26363` |
| `unit-durable-green-01.txt` | 25 PASS / 0 FAIL | `5db22374a5dda436a099c19618f86882e05413750905e57bc51444b23977cda7` |
| `unit-review-green-01.txt` | 6 PASS / 0 FAIL, tres harness originales | `1b3168ba4b20829eaab44f687d22d6a0bdb69090f14d2ae72fe66335e5d0ddd8` |
| `unit-suite-green-01.txt` | 163 PASS / 0 FAIL / 0 SKIPPED, 10 archivos | `eeb2fb2da296d1d8d728510409fd3ce20552b5e4574a116c5f31c986d3740e32` |
| `typecheck-green-01.txt` | PASS | `c1e97067c5f479a44a6f57297a0a8f87a59d181c3c529910f8bf059094bc3abb` |
| `lint-green-01.txt` | PASS | `c1e97067c5f479a44a6f57297a0a8f87a59d181c3c529910f8bf059094bc3abb` |

Los checks repiten los comandos pertinentes anteriores con Node **24.19.0**
explícito, Vitest **4.1.11**, un worker y sin paralelismo entre archivos. El
candidato completo tiene 25 casos nuevos durables: 20 de hooks y cinco de
pantalla. Aleatorio, Recursos y Turnos siguen publicando de forma optimista.
La ejecución de los diagnósticos originales utiliza una configuración y
caché nuevas, sin modificar sus archivos:

```powershell
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/vitest/vitest.mjs run --config .scratch/clock1313-r3/vitest-review.config.mjs
```

La revisión de integridad confirmó **8/8** evidencias del revisor r2,
**13/13** evidencias del candidato r2 y **7/7** copias de fuentes r2, sin
discrepancias. El manifiesto r2 conserva SHA256
`36e67f14995374dc7a0467c26b4d87111c617d25e6685cc5b22d1dd1f6a362bd`.
Las siete fuentes actuales, sus copias y los checks r3 se registran en
`.scratch/clock1313-r3/source-manifest.json`, con su hash separado. El
manifiesto y el parche r1 también se conservan.

La barrera pertenece al documento en ejecución; no sobrevive a una recarga
ni comunica ventanas independientes. La durabilidad visible sigue dependiendo
de publicar después del resultado de IDB. El CAS continúa protegiendo las
escrituras entre ventanas. No se modifica el driver de recarga, los tests de
QA/CI ni los archivos prestados de Recursos. Esta tanda no ejecutó navegador,
servicios, build, CI ni comprobación nativa del candidato.

## Revisión independiente r3 y gate nativo final

La revisión independiente de r3 dio **PASS sin hallazgos accionables**. Volvió
a ejecutar los seis diagnósticos originales y añadió cinco comprobaciones de
frontera: crecimiento de cola, aborto/error nativo normalizado, otra identidad,
otro escritor CAS y recuperación de hidratación. Los **11 casos pasaron**; se
verificaron 37/37 fuentes, copias y evidencias antes y después. La suite de
163 unitarios no se repitió por rutina: se inspeccionó su resultado sellado.
Dictamen SHA256 `12e97b9944796ee5636e727136502c929005d839c18c09c2fb5e076b85417df0`.
Los once artefactos de revisión están archivados en la raíz bajo
`static-evidence/clock1313/r3-independent-review-20261003/`, manifiesto
`6167a1d4fe7b7f26024179f36194468495533301a92f7e5c095cfbd9b41a5374`.

La prueba nativa usó un build nuevo de producción, Turbopack, Node 24.19.0,
Chrome real e IndexedDB real. Build `qvnNjTgRKwN_3BAycNSkg`, manifiesto de
referencias del servidor SHA256
`a715a27ee57d130edd720fb4fbe94b33bde99b7c7a079db3086fb2fa31d2c1e6`,
HEAD `3a8a865db113af423a3fc2242925446980508925`, siete fuentes r3 selladas y
tres archivos prestados de #1007. Se desactivó únicamente la lectura de
archivos de entorno para usar el backend local; el SDK permaneció real. El
primer intento de preparación falló al interpretar la ruta Windows del
preload, antes de construir o ejecutar casos. Una recuperación de esa ruta
permitió la única construcción nueva; ambos intentos y sus resultados se
conservan.

La ejecución conjunta hizo **21 casos: 19 PASS / 2 FAIL**, sin retries,
flaky ni skipped. Los doce casos existentes del reloj y sus seis nuevos casos
de persistencia pasaron. A 320, 390 y 1280 px, tanto con transacción natural
como con bloqueo IDB real controlado, el ACK de la revisión 1 ocurrió antes
de publicar el banco; la recarga inmediata recuperó Ana/Beto y los 90.000 ms
de base. En las observaciones naturales, el ACK precedió la publicación entre
1,1 y 1,8 ms y `pagehide` no conservó transacciones pendientes. No se añadió
ninguna espera ni lectura IDB entre el banco visible y `page.reload()`.

Los dos FAIL se conservan con su causa y alcance:

- El caso de fallback del reloj buscaba «Pausar», mientras la traducción y
  el snapshot reales decían «Pausa». Había observado el aviso y los controles
  utilizables; no alcanzó la captura final ni la recarga. Se corrigió sólo
  ese literal del locator, sin tocar producto, asserts restantes ni fixture.
- El caso prestado de Recursos canceló correctamente el gesto antiguo al
  cambiar recurso y mostró Oro 6 con el siguiente click, pero la recarga
  restauró Oro 5. La persistencia de ese contador se rastrea en **#1328**;
  esa observación carecía de probe IDB, por lo que su causa nativa no se
  atribuye a publicación, aborto ni CAS. El otro caso de Recursos pasó.

Se repitió **sólo el fallback fallido**, una vez, en una ruta nueva, con el
mismo build y producto: **1 PASS en 1,752 s**, retries 0. Cerrar la conexión
IDB nativa produjo `InvalidStateError`; el reloj mostró el aviso íntegro,
mantuvo «Pausa» habilitada y mostró Ana/Beto. Se inspeccionó la cuarta captura,
sin secretos. Después de recargar, `anon:clock` era `null` y la pantalla
volvió a configuración: el aviso describe correctamente la memoria volátil.
La auditoría global de esta recuperación dio PASS, con un único aborto que
conserva la firma completa de prefetch.

El resultado del alcance Clock es **19 casos nativos PASS repartidos entre
la ejecución conjunta (18) y esta recuperación focal (1)**. No se reescribe
la tanda original como 21 PASS. La auditoría global de aquella tanda sigue
FAIL: de sus 42 abortos, 41 tenían firma completa de prefetch y un POST de
`/partidas/reloj` en el caso de tiempos inválidos a 1280 px quedó sin
clasificar. No se guardó su identificador de acción, así que no se conoce su
causa. Se rastrea en **#1301**, sin suprimirlo ni equipararlo a un prefetch.
Console, errores de página, HTTP, peticiones SDK y overflow dieron cero.

La limpieza final acredita actores/Auth, sesiones, refresh, catálogo y
cuotas a cero, 273 migraciones locales sin cambios, Next propio detenido,
Supabase detenido normalmente con backup y puerto 3000 libre. Los 108
artefactos de la tanda original y las fuentes/build permanecieron intactos
durante la recuperación. La tanda adicional confirmó también el RED de
**#1325**, separado del resultado del reloj, con su propio FAIL global de un
POST sin clasificar.

Evidencia pública en la raíz, bajo
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/`:

| Carpeta | Manifiesto público SHA256 | Alcance |
|---|---|---|
| `clock-resources-r3-1791029802882` | `e7d731fe2b216864f606e18202be5aca3e94b9440b5c92c4a336d6e245c85521` | 108 artefactos verificados; conserva los 19 PASS / 2 FAIL originales. |
| `clock-fallback-alias1325-1791031910098` | `5431ae05451f98a637ee64c7ab8cb3f2e386550d2fb87fe1847b3eb8615ef9c3` | 99 copias y su prueba de copia: 100 entradas verificadas por raíz; fases y auditorías separadas. |

Resultado focal Clock SHA256
`62c456366a0052f5a92de401558b9c5c8e7471763c3fb123e4b68f334962dab7`;
manifiesto final focal
`0aae107655673c5f9c7007ec8702039e2efedea14043331cd67fa686500d230a`.
La corrección única del locator conserva SHA256
`4070b14fbadfe48b4518216a3a7af84741a201a69ff10640fe6d32d70f67514c`.

## Alcance de integración

La PR incluye el opt-in, hook y pantalla de Reloj, sus dos archivos de
unitarios, tres claves españolas y siete casos nativos en
`e2e/ci/clock-persistence.spec.ts`. Conserva los E2E existentes y los
artefactos de todos los FAIL interpretables. Los tres archivos prestados de
Recursos se excluyen de la publicación de Clock y siguen en #1007.

Después de sellar y liberar QA, el checkout avanzó a
`ececd57d3a40ef23bb2d6d8bcbf2de15a14af292` para incluir #1324 y #965:
el diff upstream sólo cambió JointCard y la cobertura de puntuación. Las
siete fuentes r3 y los cuatro originales canónicos conservaron sus hashes;
el único cambio posterior de esas siete fuentes es este informe documental.
La decisión append-only y el mapa explican la garantía observable. No cambia
el esquema ni el estado de una feature del backlog. CI se exige por separado
en la PR de integración; un PASS de sus casos no convertiría los dos POST
sin clasificar ni #1328 en resueltos.
