# Playwright: arranque automático en Windows — #1073

> **[Canónico · verificación acotada el 2026-10-01]**

## Dictamen

**NO REPRODUCIDO en el entorno actual.** El incidente original del 2026-09-04
fue un único timeout de 120 s antes de que `next dev` escuchara. En esta
verificación el mismo comando automático arranca seis veces, incluidas tres
sin caché de `.next`, y sirve el login completo en menos de nueve segundos.
No se atribuye una causa retrospectiva ni se afirma que los cinco tests
históricos o toda la suite estén verdes.

El cierre de #1073 corresponde a una incidencia aislada no reproducida;
la configuración de producto conserva `command: "npm run dev"`,
`timeout: 120_000` y `reuseExistingServer: true`.

## Entorno y controles

- Windows/PowerShell; árbol probado `b94d2dad7f38eab5fa7c7d78a944778c9b715808`,
  integrado por PR #1270 en `1bc59a3fb7268d3cd9c6d6ae0c10e9d82ff98196`.
- Next 16.3.8; Playwright 1.61.1; Chromium Desktop Chrome; un worker;
  sin reintentos. Memoria total observada: 34.129.043.456 bytes, unos 32 GiB,
  con 16,6–16,7 GB libres durante la serie final. No reproduce la antigua
  condición de una máquina de 8 GB.
- Proceso Playwright, CLI de Next y `start-server.js`: Node 24.19.0 del
  runtime disponible, incluido en `engines`. El shim de npm ejecuta
  `npm-prefix.js`/`npm-cli.js` con Node 23.11.0 de Program Files; ese Node
  queda fuera de `engines`, pero no es el que ejecutó Next ni bloqueó esta serie.
- Supabase exclusivamente local. Credenciales de proceso y actores temporales;
  ninguna escritura en dev/prod ni en cuentas persistentes.
- Config derivado del de proyecto: mismo comando, `cwd` explícito a la raíz,
  `reuseExistingServer: false`, timeout 120 s. Puerto 3000 libre al principio
  y después de cada caso. `globalSetup` omitido para no sembrar universos ajenos.
- En la serie final, readiness consulta `/login`; Chromium vuelve a navegar
  allí, exige HTTP 200, email/password visibles y submit habilitado. No basta
  una aserción negativa de ausencia de mascota.
- Preload observacional registra ejecutable/PID y los eventos `listening` y
  primer `/login` HTTP 200 completado. No cambia las opciones de arranque ni
  el comportamiento de la aplicación. Los tiempos finales parten del instante
  anterior a lanzar Playwright, incluyendo creación de sus procesos.
- Para cada cold se mueve la carpeta `.next` completa a un destino nuevo
  dentro del workspace; se restaura al final la caché previa. El build anterior
  conserva `BUILD_ID=jhKYS7nl4MzAz9b4PEkge`. Los servidores terminan y el puerto
  queda libre; no se borran cachés ni se matan procesos ajenos.

## Resultado de la serie final

| Caso | Puerto 3000 escucha (ms) | Primer login HTTP 200 (ms) | Chromium | Limpieza |
|---|---:|---:|---|---|
| warm1 | 1554 | 3181 | PASS | PASS |
| warm2 | 1511 | 3182 | PASS | PASS |
| warm3 | 1485 | 3190 | PASS | PASS |
| cold1 | 1478 | 8805 | PASS | PASS |
| cold2 | 1461 | 8454 | PASS | PASS |
| cold3 | 1583 | 8972 | PASS | PASS |

**6 PASS, 0 FAIL, 0 SKIPPED, 0 reintentos.** Cada actor queda ausente en Auth
(404) y con cero filas en `profiles`, `pet_state`, `passes`,
`pet_acorn_ledger` y `pet_cosmetics`.

Una serie previa con el test original «sin sesión no hay compañera» también
pasó 6/6, con escucha en 1.419–1.560 ms. Se amplió de forma concreta porque
esa aserción negativa no exigía HTTP 200 ni formulario y no producía una
medición del login; sus verdes no sustituyen la serie final de arriba.

## FAIL conservados y límites

La primera pasada de los cinco tests originales ejecutó el navegador y dio
**1 PASS / 4 FAIL**. Next mostró `Ready in 511ms`; desde el marcador de runtime
de Playwright, escucha a +1.551 ms y primer login completado a +9.144 ms.
Esta última cifra incluye navegación de los specs y no mide solo readiness.

| Hallazgo posterior al arranque | Seguimiento |
|---|---|
| `/admin/mascota` recibe `next=/admin`, distinto del deep link esperado por el test | #1271 |
| El test de escala mide 184 px tanto a 2× como tras seleccionar 3×; esperaba 276 | #1272 |
| `check({force:true})` no seleccionó clase en el estado del formulario; Eclosionar quedó disabled | #1273 |
| `/ajustes` registra `blocking-prerender-dynamic`; el toggle no aparece en una tanda cuya eclosión también falló | #1274 |

Son observaciones pendientes de aislamiento; no se inventa una causa común
ni se atribuyen al timeout de #1073. El rojo original sigue conservado en
`run-1790852204496/warm1`, con reporte, log y contexto de los tests.

También se conservan los fallos del diagnóstico: en `run-1790851566305` el
preload relativo no se resolvía desde el directorio del config (738 ms,
cero tests ejecutados); se corrigieron `cwd` y ruta absoluta. Después, la
limpieza consultó la tabla inexistente `pet_cosmetic_unlocks`; se corrigió a
`pet_cosmetics` y se verificaron cero actores/huérfanos locales. Ninguno es
una reproducción del timeout de Next.

La evidencia no establece qué ocurrió con la versión de Next, PATH, caché,
memoria o carga del 4 de septiembre. CI con `next start` es otra superficie;
no se usa como prueba de arranque de `next dev`.

## Artefactos y hashes

Diagnóstico local ignorado: `.scratch/ticket-campaign/qa1073/`, con
`preload.cjs`, config derivado, `startup.spec.ts`, `case.mjs` y `run.ps1`.
Serie final: `run-1790852707180`; cada subcarpeta contiene `start.json`,
`result.json`, `playwright.json` y `server-and-test.log`.
`evidence.json` fija SHA-256 de los tres artefactos por caso. No se publican
credenciales ni trazas de autenticación.

| Log | SHA-256 |
|---|---|
| warm1 | `BA0BB7EB73DAF1C8533D3E8D60107A1CF00F689818463D09918CEC98D01694B4` |
| warm2 | `088F853B83AD1D528F92140989A53566AA81CFF2D7C2EE6FE179D05677FE38FF` |
| warm3 | `19F0BDBE7C90F96637C55C5447768734723328D4005A52A7F1C21A3245C4C9CC` |
| cold1 | `F681BD26C1785CEBB5B3DDAD80ABE9116BC05DA9E766DD5110A4988FBC8EC5B3` |
| cold2 | `81A1A783DAC4F816841420B7668E367D526334A3B9CE482E9A08D828BFB3A746` |
| cold3 | `6D2BA870261DFDF4158D3AB0138D2A135684E72699715DBB6FC7A985D7EC3B49` |
| Cinco specs originales, 1 PASS / 4 FAIL | `7D9A6FAA03BA75BD4BB78E9DFBD27012234F18E2659CF13D87C3F2F0ACFD3B8F` |
