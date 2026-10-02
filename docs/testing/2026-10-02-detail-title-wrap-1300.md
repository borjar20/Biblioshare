# Ajuste de títulos largos en la ficha — #1300

> **[Canónico · verificado contra código y navegador local el 2026-10-02; FAIL complementario conservado]**

## Estado

Los nueve casos duraderos de títulos pasan contra un build nuevo local.
La revisión visual de QA pasa cinco vistas. El sellado global de la tanda
permanece **FAIL**: un auxiliar distinto contó cinco peticiones
`net::ERR_ABORTED`. Su causa no está acreditada y se sigue como sospecha
[#1301](https://github.com/borjar20/Biblioshare/issues/1301). No se transforma
ese FAIL en PASS ni se suman las observaciones auxiliares al total de tests.

`ItemHero` ya limita la columna mediante `minmax(0,1fr)` y `min-w-0`.
El `h1` conservaba `overflow-wrap: normal`, por lo que un token continuo
podía pintar fuera de su caja sin ensanchar la columna. Se añade únicamente
`[overflow-wrap:anywhere]` al `h1` de
`src/components/detail/item-hero.tsx`. Se mantienen el texto completo, los
tamaños de letra, la rejilla y sus controles.

La evidencia previa de #1290 mide anchos del documento de 603 y 585 px a
320 px de viewport. En la ficha ya poblada de esta tanda, alternar
temporalmente `normal` y `anywhere` en el mismo `h1` reproduce la geometría
del fallo. Se restaura su estilo inline original al acabar y no se escribe
en código ni en la base durante esta observación.

| Viewport | Documento con `normal` | Documento con `anywhere` | Columna | Texto completo |
|---|---:|---:|---:|---|
| 320 px | 601 px | 320 px | 162 px | Sí |
| 375 px | 601 px | 375 px | 217 px | Sí |

El token ocupa una línea de 458,578 px con `normal` y tres líneas dentro
de la columna con `anywhere`, manteniendo la letra de 25 px. Son mediciones
conservadas del auxiliar; su dictamen completo sigue siendo FAIL por las
peticiones abortadas. Registró cero errores de consola y de página, sin
resolver por ello la causa de esos cinco abortos.

## Contrato de la prueba

`e2e/ci/detail-title-wrap.spec.ts`, preparado en el commit `76bb6e5`, contiene
nueve casos de Chromium, con títulos de token continuo de 32 caracteres,
texto largo con espacios y texto normal, a 320, 375 y 1280 px.

La prueba crea tres libros propios ya hidratados en Supabase local,
con UUID y volumen Google únicos. Comprueba título y autor completos,
rectángulos de las líneas dentro de la columna, `scrollWidth` del título,
ancho de documento/cuerpo, tamaños de letra, portada y botón «Seguir».
Rechaza recorte, elipsis y line-clamp. Adjunta geometría, captura y errores
del navegador. Sólo simula sus imágenes sintéticas y el recurso opcional
de Speed Insights; el render y la lectura de las fichas son reales.

La guardia exige `http://127.0.0.1:54321`. La limpieza por REST ocurre antes
y después, verifica la identidad del volumen antes de borrar y comprueba
que no queden filas propias en `books`, `book_editions`, `credits` ni
`passes`. `QA1300_FIXTURE_REGISTRY` y `QA1300_OUT` permiten conservar el
inventario y la evidencia de limpieza fuera del directorio de resultados.

## Comprobaciones realizadas

| Comprobación | Resultado | Alcance |
|---|---|---|
| ESLint de hero y spec, con Node 24 | PASS, cero errores | Código modificado y prueba recuperada |
| Descubrimiento de Playwright | PASS, nueve casos en un fichero | Carga del spec; no ejecuta navegador ni siembra datos |
| Build integrado #1290 + #1300 | PASS | Next 16.3.8, Node 24.19.0, build nuevo |
| Casos duraderos de títulos | 9 PASS / 0 FAIL / 0 SKIP | Token continuo, espacios y título normal a 320/375/1280 px |
| Tanda integrada | 20 PASS / 0 FAIL / 0 SKIP | 9 títulos + 7 hidratación + 4 cuotas; 70,451 s |
| Flaky / reintentos | 0 / 0 | No se repitió ningún caso |
| Revisión visual de QA | 5 PASS | Vistas locales del detalle; observación adicional |
| Auxiliar de geometría y sellado global | FAIL conservado | Cinco `net::ERR_ABORTED`, causa pendiente en #1301 |
| Limpieza de títulos | PASS | Tres fixtures; doce comprobaciones de residuos, todas a cero |
| Limpieza de la tanda | PASS | Once actores eliminados; Auth 404 y auditoría propia a cero |
| Fuentes antes/después | PASS | 55 fuentes estables, sin cambios raw ni de LF |

Comandos de preparación:

```powershell
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/eslint/bin/eslint.js src/components/detail/item-hero.tsx e2e/ci/detail-title-wrap.spec.ts
```

El descubrimiento se ejecutó con `playwright.ci.config.ts`, el filtro
`e2e/ci/detail-title-wrap.spec.ts`, `--list --reporter=list`, URLs locales y
una clave ficticia sólo para cargar el spec. No se utilizó ninguna
credencial ni se conectó con la base.

Para repetir los nueve casos, usar el entorno desechable local y un build
nuevo, con sus credenciales sólo en variables de proceso:

```powershell
& 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/@playwright/test/cli.js test --config playwright.ci.config.ts e2e/ci/detail-title-wrap.spec.ts
```

La configuración de CI arranca `next start` y no reutiliza un servidor.
La tanda integrada empleó su configuración de campaña y un único servidor.
Next quedó apagado, el puerto 3000 libre y Supabase detenido con backup.

La revisión independiente de la primera tanda no encontró hallazgos. Esta
PR entrega sólo el ajuste de título y su prueba; no incorpora #1290.

## Evidencia conservada

Tanda integrada:
`.scratch/ticket-campaign/qa1290/integration-1790937088982/`.
`result.json` conserva `status: FAIL`, `causalExit: 1`, los veinte resultados
nativos y la limpieza. `title-causality.json` y sus dos capturas conservan
la comparación geométrica; `title-cleanup-audit.json` conserva la auditoría
independiente de los tres libros. La evidencia anterior de #1290 permanece
intacta; no se repite un build de baseline para este ajuste de una línea.

| Identidad | Valor |
|---|---|
| Build | `ueeyMS3xF3sAJkjSGGTS4` |
| Head al construir, más el ajuste de título entonces sin commit | `e3ee6206801c89f54cf704d27585f5635428f5a9` |
| Server manifest SHA-256 | `527af9d69373931942e54c6a21512b354fe0d5f21a3d9d9e19622efc95705ee4` |
| Sello `manifest.sha256.json` SHA-256 | `a100dd1a9e744f5b6c8ef248353787208741682443b25d31888db5bf3660573c` |
| `result.json` SHA-256 | `7c1a5eb339e95d1778fe3bc84f273408c784c0d6f938c0f6aa3faf86ec066207` |
| `item-hero.tsx` SHA-256 canónico LF | `2417d5c3488c83e296dca586ecee42aae371f39f497378288f8bc67432914cd2` |
| `detail-title-wrap.spec.ts` SHA-256 canónico LF | `ca3081e2b800c8b52891684b94ede5e1fe45c8d1c1e3a06a49533e81999575a7` |

## Límites

El PASS funcional de los nueve casos no convierte en PASS el recorrido
complementario ni su sello global. Los abortos se registran como sospecha,
sin diagnóstico de producto confirmado. Las mediciones del título y la
regresión funcional quedan disponibles mientras se investiga #1301.

La superficie cubierta es la ficha de libro. Películas y series comparten
`ItemHero`, pero esta prueba no verifica sus fichas. Los recursos propios
son sintéticos; no se afirma calidad de imágenes, LCP ni aceptación de
producción. La CI de la PR debe comprobar su commit de entrega; el build
local citado corresponde al conjunto integrado de la campaña.
