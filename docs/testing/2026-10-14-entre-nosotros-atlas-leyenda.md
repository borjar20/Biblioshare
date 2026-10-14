# Entre nosotros: leyenda móvil plegable

> **[Evidencia local · 2026-10-14]** Ajuste sobre `f0b5ac8e` en [PR #1529](https://github.com/borjar20/Biblioshare/pull/1529). Integración y despliegue en producción pendientes.

En móvil (hasta 640 px), la leyenda inferior empieza plegada y el botón «Leyenda» permite abrirla y cerrarla. El botón tiene una zona táctil de 44 px, foco visible y `aria-expanded`/`aria-controls`. La explicación sigue la lente seleccionada y conserva su estado abierto al cambiar entre lentes. En escritorio permanece visible; la vista de lista no muestra leyenda.

El observador existente mide la altura del dock al abrir/cerrar: la cámara encajada se ajusta a la banda disponible. No hay cambios en consultas, selección, esquema, RLS o caché.

| Comprobación | Resultado |
|---|---|
| Unidad focal existente | `npx vitest run src/components/comparisons/atlas/atlas-view.test.tsx --maxWorkers=1 --no-file-parallelism`: **55 PASS**, 21,80 s. |
| Tipos y lint | `npx tsc --noEmit`, ESLint de AtlasView y spec E2E, `git diff --check`: exit 0. |
| Build | `npm run build`: exit 0, **`BCib195qC4SLImf_BoE68`**, 89 páginas estáticas. |
| Navegador | Caso «leyenda del mapa: móvil plegable, escritorio visible y lista sin leyenda»: **2/2 PASS**, Chromium y Pixel 7, 29,7 s, un worker, sin reintentos ni skips. |
| Geometría móvil | 390 y 360 px: cerrada inicialmente; abrir/cerrar libera **56,5 px en Quién** y **74 px en Islas**, sin scroll horizontal. La sonda confirma obras dentro de la banda y la cámara se reencaja. |
| Acceso | Botón nativo con foco visible y relación ARIA; explicación de la nueva lente al cambiar con la leyenda abierta; desaparece en lista y vuelve al mapa. Escritorio a 1280 px conserva el texto visible y no muestra el botón. Teclado revisado estáticamente, sin recorrido de teclado en esta tanda. |
| Revisión y limpieza | Revisión independiente sin hallazgos. Fixtures dev de usuarios/perfiles/libros/películas/series a cero por SQL; devtest continúa público. Servidor detenido, sin listener en 3000. |

Los [datos de móvil](assets/2026-10-14-atlas-leyenda/mobile-leyenda-metrics.json), [datos de escritorio](assets/2026-10-14-atlas-leyenda/chromium-leyenda-metrics.json) y [limpieza](assets/2026-10-14-atlas-leyenda/cleanup.json) conservan la evidencia. Consola sin errores; 36 peticiones `ERR_ABORTED` de navegación/prefetch, por lo que no se afirma una auditoría global de red limpia. Playwright real verifica login y datos de Supabase dev, con respuestas de portada de fixture; no se simulan sesiones ni DTO.

Capturas con datos desechables: [Islas plegada a 360 px](assets/2026-10-14-atlas-leyenda/mobile-leyenda-islas-360-cerrada.png), [Islas desplegada](assets/2026-10-14-atlas-leyenda/mobile-leyenda-islas-abierta.png), [Quién plegada](assets/2026-10-14-atlas-leyenda/mobile-leyenda-quien-cerrada.png) y [escritorio](assets/2026-10-14-atlas-leyenda/chromium-leyenda-escritorio.png). No acredita Android físico.
