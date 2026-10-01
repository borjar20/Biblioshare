# Contrato de recursos del hero — #1287

> **[Canónico · verificación acotada el 2026-10-01]**

## Resultado y contrato

**PASS local de la prueba corregida.** El E2E compara el conjunto exacto de
URLs solicitadas con las imágenes visibles. Conserva todas las solicitudes
en `image-resources`, antes de las aserciones del contrato, incluidas las
repeticiones de una URL. Una URL adicional sigue haciendo fallar el caso.

Portada y backdrop de película/serie se comparan con sus fixtures
independientes y deben ser distintos. Para comparar la identidad TMDB sólo
se normaliza `/t/p/wNNN/` o `/t/p/original/`; origen y resto del pathname se
conservan. El bucket responsive del fondo se comprueba por separado. En
libros, las dos imágenes comparten `currentSrc` y `sizes`. Siguen verificándose
carga efectiva, una sola prioridad alta, cajas 110/140/200 y desbordamiento.
No cambia código del producto, ni se añaden esperas o reintentos.

## Diagnóstico y FAIL conservado

El [run de CI 36897878091](https://github.com/borjar20/Biblioshare/actions/runs/36897878091)
de la PR #1286, head `c26f9961b1310f9ab49aae782e016d2099d363e9`, ejecutó
**64 PASS / 1 FAIL**. El único fallo era `lg-1x / openlibrary`: la aserción
exigía una petición y registró dos GET de la misma URL M. Ambas respuestas
sintéticas terminaron con HTTP 200, cuerpo idéntico de 120 bytes y sin marca
de aborto/fallo. Empezaron a las 17:18:11.908Z y 17:18:12.215Z; la primera
terminó antes de la segunda. La traza no identifica el iniciador de cada GET.

Las dos imágenes visibles seleccionaban esa misma URL y `sizes`; sólo la
portada tenía prioridad alta. El original L del visor no se solicitó. El
cleanup del worker confirmó cinco obras propias a cero. No se atribuye cada
GET a un elemento ni se diagnostica una regresión del producto con estos datos.

[`page.route()` desactiva la caché HTTP](https://playwright.dev/docs/api/class-page#page-route),
confirmado también en el paquete instalado. El recuento de GET bajo routing
no prueba reutilización en un navegador con caché activa. El contrato anterior
confundía selección del recurso con ese comportamiento de transporte. #1208
y #1278 conservan sus entregas; este seguimiento corrige la comprobación.

## Verificación y límites

Base `762e6aef98fd2a386ffc6b0ab7c83b25028da778`, Node 24.19.0,
Playwright 1.61.1/Chromium. Supabase local `127.0.0.1:54321` y
`http://localhost:3000`. Se reutilizó el build `anXbXwrsAUwKALk10uz3K`
tras comprobar que hero, loader, visor y configuración no habían cambiado.

| Control | Resultado | Tiempo |
|---|---|---:|
| CI original, contrato de una petición | 64 PASS / 1 FAIL | conservado |
| Matriz intermedia, SHA `8cfe1d81…` | 30 PASS / 0 FAIL / 0 SKIP | 15,37 s |
| Matriz final, SHA `7a3238d6…` | 30 PASS / 0 FAIL / 0 SKIP | 14,35 s |
| ESLint final, reporte JSON nativo | 0 errores / 0 avisos | 2,16 s |
| TypeScript completo final | PASS, exit 0 | 3,74 s |

Cada matriz ejecutó cinco fixtures en seis perfiles de pantalla/DPR, sin
retries ni flaky. El SHA se comprobó antes y después del lote. El primer lote
capturó dos casos con peticiones duplicadas reales de una misma URL; el lote
final no las necesitó para pasar. No se suman los lotes como 60 casos finales.

La finalización intermedia detectó la edición posterior del spec y conservó
un **FAIL del gate de identidad** en `qa/evidence-final.json`. Sus 30 PASS
nativos corresponden al SHA intermedio; la nueva ruta final valida el SHA
con las comprobaciones de identidad añadidas por la revisión independiente.

Cuatro controles sobre una copia del adjunto de CI aceptan sus dos GET
idénticos y rechazan una URL extra, dos prioridades altas y un fondo fallback
distinto. Son controles de predicados sobre evidencia: **cero casos nuevos
de navegador**. Se revisaron cuatro capturas finales de 375/1024/1600:
portada/fondo cargados, título y acciones legibles, sin recorte del hero.
Las cinco filas propias de cada lote quedan a cero, las marcas antes/después
también y el puerto 3000 termina libre. No se crean cuentas ni se modifica
la cuenta persistente de QA.

Esta prueba usa respuestas sintéticas. No mide bytes transferidos desde el
CDN real, caché de producción ni LCP. El PASS no representa aceptación de
producción ni de todas las fichas posibles.

## Evidencia

Directorio ignorado `.scratch/ticket-campaign/qa1287/`:

- `checks-1790876840700/`: resultados, JSON de ESLint y logs nativos.
- `qa/prod-1790876399534/`: 30 casos intermedios, adjuntos y limpieza.
- `qa/prod-1790876825526/`: 30 casos finales, SHA antes/después, adjuntos,
  capturas y limpieza. Playwright: 14,35 s; harness: 15,91 s.
- `qa/controlled-ci-contract.json`: cuatro controles sobre el adjunto copiado.
- `qa/evidence-final.json`: FAIL intermedio de identidad preservado.
- `qa/evidence-final-7a.json`: cierre PASS del SHA final, inspección visual
  y distinción explícita de los resultados intermedios.
- `evidence-integrated-v2.json`: manifiesto SHA-256 de fuente, documentación,
  controles y evidencia CI/local conservada, generado después del cierre de QA.

El diagnóstico original, log fallido, traza, captura y extracto sin cookies
ni cabeceras viven en `.scratch/ticket-campaign/qa1116/ci-analysis/` y
`ci-artifacts-36897878091/`. No se sustituyen ni se etiquetan como un lote verde.

SHA-256 del spec final:
`7a3238d691d45f43fa2f1adfefbfa3528723e931053c072a54650f0e38974425`.
