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

- Windows/PowerShell; código de aplicación de
  `b94d2dad7f38eab5fa7c7d78a944778c9b715808`, integrado por PR #1270 en
  `1bc59a3fb7268d3cd9c6d6ae0c10e9d82ff98196`. Los controles finales se
  ejecutaron en `5ea06e37590e7e41cff464a43b097e20bf3529ee`, cuyo diff en
  src/e2e/Supabase/scripts/config/dependencias es vacío respecto a ese código.
- Next 16.3.8; Playwright 1.61.1; Chromium Desktop Chrome; un worker;
  sin reintentos. Memoria total observada: 34.129.043.456 bytes, unos 32 GiB,
  con 16,7–16,8 GB libres durante la serie final. No reproduce la antigua
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
- La serie final usa `http://localhost:3000`, valor por defecto del proyecto.
  Los controles anteriores con `127.0.0.1` quedan separados: en el control
  original Next bloqueó `/_next/hmr` por origen no permitido. La guía instalada
  `allowedDevOrigins.md` confirma esta restricción. No se modifica su allowlist
  ni se atribuyen todos los síntomas a ese bloqueo.
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
| warm1 | 1709 | 3165 | PASS | PASS |
| warm2 | 1751 | 3223 | PASS | PASS |
| warm3 | 1795 | 3286 | PASS | PASS |
| cold1 | 1712 | 8551 | PASS | PASS |
| cold2 | 1941 | 8409 | PASS | PASS |
| cold3 | 1780 | 8336 | PASS | PASS |

**6 PASS, 0 FAIL, 0 SKIPPED, 0 reintentos.** Cada actor queda ausente en Auth
(404) y con cero filas en `profiles`, `pet_state`, `passes`,
`pet_acorn_ledger` y `pet_cosmetics`.

Una serie previa con el test original «sin sesión no hay compañera» también
pasó 6/6, con escucha en 1.419–1.560 ms. Se amplió de forma concreta porque
esa aserción negativa no exigía HTTP 200 ni formulario y no producía una
medición del login; sus verdes no sustituyen la serie final de arriba.
Una segunda serie HTTP/formulario a `127.0.0.1` pasó 6/6
(`run-1790852707180`, escucha 1.461–1.583 ms, login 3.181–8.972 ms);
se repitió con `localhost` por la duda concreta del origen y para usar el
valor nativo del proyecto.

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

No se inventa una causa común ni se atribuyen al timeout de #1073.
El rojo original sigue conservado en
`run-1790852204496/warm1`, con reporte, log y contexto de los tests.

Controles posteriores sobre el mismo código de aplicación:

- `paired-localhost-1790853624367`: **2 PASS / 3 FAIL**, sin reintentos;
  el visor completo, incluida escala, pausa y replay, pasa. La eclosión sí
  llega a Nuez, pero falta la compañera en Colección. El perfil temporal no
  tenía `onboarded_at`: `AppShell` exige onboarding para `showNav`, y
  `SessionCompanion` se omite antes de llamar a la RPC si es falso. Tras fallar
  el primer test de mascota, el worker reinicia y su `beforeAll` vuelve a
  borrar `pet_state`, invalidando la precondición del test de ajustes.
- `paired-onboarded-1790854158407`: con `localhost` y `onboarded_at` sembrado,
  **4 PASS / 1 FAIL** en 38,4 s, sin reintentos. Pasan escala/animaciones,
  eclosión/Personaje/compañera, ocultar y mostrar desde Ajustes y ausencia
  anónima. El único FAIL es el deep link de #1271. Next aún registra dos
  errores `blocking-prerender-dynamic` de `/ajustes` (#1274), aunque su flujo
  y escrituras pasan. No se atribuye ahora a ese error la ausencia del toggle.

Las sospechas de escala (#1272) y eclosión (#1273) no se sostienen bajo las
precondiciones válidas actuales; no se cambia producto para ocultar errores
de preparación. Se conserva su observación inicial y se cierra explicando
la rectificación. #1271 y #1274 siguen separados y pendientes. Ambas cuentas
de los controles quedaron ausentes en Auth y con cero filas en las cinco
tablas verificadas.

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
Serie final con localhost: `run-1790853899705`; cada subcarpeta contiene `start.json`,
`result.json`, `playwright.json` y `server-and-test.log`.
`evidence.json` fija SHA-256 de los tres artefactos por caso. No se publican
credenciales ni trazas de autenticación.

| Log | SHA-256 |
|---|---|
| warm1 | `05B254B0C3BF0C90007D915E5E47F3E184ED328BE70DD08EA7CBC4D92D1BF838` |
| warm2 | `3F63F2D7ECAC8D671E7A1AFB5257FDF7C53FB6B648973CD2776D4C377B6FBA78` |
| warm3 | `37F22B32BE6123BB91D90C93082458D32941CF1DCC1F0C99A74392E8F85B7742` |
| cold1 | `47A274A0F4BC2A67777988215A8300145BC0349FD3E233436AEF9F7B4719DBE8` |
| cold2 | `4712B11DF647DE041E350416023DBF1E90646E1EA23679CF7C384C7DCA5B0A18` |
| cold3 | `BE152AC3A103BE3CF8DE3746A6512AA0F5F6EB9F1B2934B9D249146E417CB88D` |
| Cinco specs originales, 1 PASS / 4 FAIL | `7D9A6FAA03BA75BD4BB78E9DFBD27012234F18E2659CF13D87C3F2F0ACFD3B8F` |
| Control localhost, 2 PASS / 3 FAIL | `EC722DA8315A5CC791B3C8F4CE977A50CB17562D060A9CC1B63196F59505BEB5` |
| Control onboarding completo, 4 PASS / 1 FAIL | `7C2A27CE4A2D0A120D0CD652D7FCADCC4E93FCAEA97B4E876FFDE0C7C82A351C` |
