# Lint completo — #1172 y #856

> **[Evidencia de ejecución · verificada el 2026-09-30]**

El job `quality` solo comprobaba los archivos cambiados. Un error en una fuente
sin cambios podía sobrevivir indefinidamente. La limpieza permite exigir ahora
`npm run lint` completo en cada PR y push a `main`.

| Comprobación | Antes | Después |
|---|---|---|
| ESLint completo, informe JSON | FAIL: 22 errores y 46 avisos en 1839 archivos | PASS: 0 errores y 28 avisos en 1833 archivos |
| Errores de fuentes | 8 `set-state-in-effect`, 11 `no-explicit-any`, 1 `prefer-const` | 0 |
| Errores en resultados generados locales | 2 | Fuera de la superficie, junto con andamiaje de sesión |
| TypeScript | — | PASS |
| Vitest completo, un worker y sin paralelismo de archivos | — | PASS: 3761 pruebas, 0 fallos, 0 pendientes |
| Playwright de Play, Chromium, un worker y cero reintentos | — | PASS: MTG, navegación, Recursos, Reloj, Aleatorio, Habituales y Puntuación |

Las formas degradan de forma derivada la referencia a un habitual eliminado;
no sincronizan estado desde un efecto. Las lecturas asíncronas canceladas dejan
de actualizar la instancia desmontada. Recursos fija su configuración al cargar,
el reloj conserva la actualización periódica y la ruleta mantiene el giro
acumulado. `useSyncExternalStore` observa la preferencia de movimiento reducido.
Los cambios de catálogo y dobles de prueba añaden tipos explícitos.

La reverificación de navegador incluye una prueba de ruleta con movimiento
reducido, que entrega el resultado dentro de 1,5 segundos, y otra de salud de
consola/página. No hubo errores de producto. El fallo externo de Speed Insights
se excluyó de la comprobación de red de producto por su URL exacta.

Los 28 avisos permanecen visibles. No se desactivó ninguna regla para obtener
el resultado. `.superpowers/`, `.scratch/` y `android/app/build/` son resultados
generados o temporales, no fuentes de la aplicación.

La revisión independiente encontró una sospecha preexistente de conservación
transitoria de filas al cambiar de identidad en el hub de Play. Se rastrea
por separado en #1230; la cancelación de promesas no resuelve ese estado cargado.
La batería completa se ejecutó en el árbol de la campaña, que también contenía
los cambios separados de #951, #992, #1003 y #1205. CI verifica el commit entregado.

Los informes locales están bajo `.scratch/ticket-campaign/`; esta evidencia
conserva los resultados materiales sin versionar logs efímeros ni credenciales.
