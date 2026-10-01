# Retorno administrativo al iniciar sesión — #1271

> **[Canónico · verificación acotada el 2026-10-01]**

## Resultado y causa

**PASS del arreglo.** Antes, entrar sin sesión en `/admin/mascota` producía
`/login?next=%2Fadmin`. El guard compartido de `admin/layout.tsx`, añadido en
`04bf5fa9`, se adelantaba al redirect específico de la página hija. El login
obedecía ese destino: perdía el contexto del visor. El test original detectaba
una regresión real de retorno, no un contrato retirado.

El proxy añade únicamente la rama anónima `/admin` o `/admin/…` y recuerda
`pathname + search` con `loginHref`. Reutiliza el helper de redirects que
propaga cookies y cabeceras del SDK. El layout, páginas y RPC conservan sus
checks de sesión/rol; no se confía en el proxy para autorizar datos. El login
sigue usando `safeNext`. No se modifican esquema, credenciales ni cachés.

## Verificación

Windows, Node 24.19.0 para Next/Vitest/Playwright, Next 16.3.8 y Playwright
1.61.1/Chromium. Aplicación en `http://localhost:3000`, Supabase local limitado
a `127.0.0.1`. Base `bf2187209dfcfdc41c7cf657543332e567fa3d68`, más los tres
archivos de código/pruebas identificados por sus hashes abajo.

| Comprobación | Resultado | PASS / FAIL / SKIPPED | Tiempo |
|---|---|---|---:|
| Baseline: E2E original anónimo contra build/start de #1274 | FAIL esperado | 0 / 1 / 0 | 24,78 s |
| Unitarios nuevos, antes del cambio de proxy | FAIL esperado | 15 / 7 / 0 | — |
| Proxy + destinos seguros, después del cambio | PASS | 22 / 0 / 0 | — |
| Navegador en dev, selección final | PASS | 8 / 0 / 0 | 21,10 s |
| Build final | PASS | — | 38,03 s |
| Navegador contra build/start final | PASS | 8 / 0 / 0 | 9,32 s |
| ESLint focalizado y TypeScript | PASS | — | — |
| Mapa de arquitectura sincronizado y validado | PASS | — | — |

Los tiempos de navegador son los de Playwright. Build probado:
`Ifh29_byDpvPWnZuxDHGs`; el baseline usó `4cR4Zx7nNc0GGPKQoI3CV`.
Sin reintentos ni flaky. Los 22 unitarios son 18 del proxy y 4 de `safeNext`.

El E2E versionado de administrador verifica tres destinos anónimos
(`/admin`, visor y sección dinámica con filtros) y el login seguido del
regreso real al visor, con sus 19 sprites, escala y controles. Cuatro
recorridos locales adicionales comprueban login/admin en raíz y sección
filtrada, y rechazo de usuario sin rol admin tanto tras login como al
volver a pedir visor/sección. En los casos rechazados no hay enlaces de
administración ni galería. Los nueve unitarios nuevos cubren prefijo exacto,
filtros, claims ausentes/erróneos, cookie de onboarding aislada y propagación
de cookies/cabeceras; los existentes conservan onboarding y recuperación.

Cada lote de navegador creó dos cuentas propias (admin/user) con onboarding
completo. Al terminar: Auth 404 y cero filas por actor en `profiles`,
`pet_state`, `passes`, `pet_acorn_ledger` y `pet_cosmetics`. El puerto 3000
quedó libre. No se usaron actores ni datos productivos.

## Evidencia conservada

Directorio local ignorado: `.scratch/ticket-campaign/qa1271/`.

| Artefacto | SHA-256 |
|---|---|
| `baseline-prod-1790857448488/server-and-test.log` | `9D4BA9EB5A7E2504F895A5ED2F2A77F4B6C140140D39615ED32B133FB2E479F7` |
| `units-red-1790857605596/results.json` | `A0FC10ED2B39ED3B127C9EFC186E76E663E4D89903FFD0944DB00C4FD089E4D3` |
| `units-green-1790857676074/results.json` | `194E3EEC706345CD34AC12FBA1D4703CC35AEE94B5F6899DBCCF891F12F025AA` |
| `dev-1790857727188/server-and-test.log` | `E761BCE1B0F45625B2D12239DEA336A7EA45B0E45D2E5C18D464B5B49974B02A` |
| `dev-final-1790857875758/server-and-test.log` | `0C5EFC9A69ED4DF76291DD3866B997A2B2941FF40CF2DCF15FB7157B29487515` |
| `build-final-1790858037999/build.log` | `06A0AD53538CB95504C90D37ED91649578639EC7A96514D6A037081380AC2A3A` |
| `prod-final-1790858235053/server-and-test.log` | `91945C7CD56D2286A0872F01C4BE744CF338560DBE4475EFDD280C11C656B75F` |
| `src/lib/supabase/proxy.ts` | `7DE4305ECA23739DB92EF0E41BD5C5360EC1C988D795FFFF5C28CB569E33B4F6` |
| `src/lib/supabase/proxy.test.ts` | `212DF866901E8157F617F214109BFA4D5D25621379828E2D3AA617480FA20ED7` |
| `e2e/admin-mascota.spec.ts` | `068B978B5CB6AA17C6FE98EA4B65545F83AFB37B2264840543121C36CEA146A6` |

`evidence-final.json` contiene también los hashes de resultados e informes.
`run.mjs`, su configuración acotada y `admin-return.spec.ts` conservan el
procedimiento local; los cuatro casos de `admin-mascota.spec.ts` quedan
versionados. Los `testMatch` exactos evitan otros checkouts de `.scratch`.

El primer lote dev se conserva como **7 PASS / 1 FAIL**: mi nueva aserción
comparaba la codificación literal `%20` con `+`. La URL recibida conservaba
todos los filtros y su texto; se corrigió el test para comparar los valores,
sin cambiar el proxy por ese fallo. La variante final repitió los ocho casos
y amplió el retorno filtrado a un texto con espacio. No se cuentan las
observaciones de ese lote como ocho PASS ni como un segundo bug de producto.

Los lotes finales registran cero errores de prerender de admin, cero mensajes
`destination stream closed early` y cero avisos Gzip. Esto no resuelve #1263
ni #1251: no se verificó su reproducción ni el preview pendiente. El scope
local no demuestra toda la suite ni aceptación de producción.
