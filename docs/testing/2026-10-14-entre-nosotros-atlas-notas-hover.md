# Entre nosotros: notas personales en la mini-ficha

> **[Evidencia local · 2026-10-14]** Mejora de la [PR #1530](https://github.com/borjar20/Biblioshare/pull/1530), en `codex/entre-nosotros-items-grandes`. Build de esta ronda: **`lC6hCPgn3mzY1Vt5aWBWu`**. Integración y publicación pendientes.

Quién, Tiempo e Islas muestran junto a cada persona seleccionada su nota sobre diez, o «sin nota» si falta. Tiempo conserva el año o «sin fecha». La ficha es compartida por el hover de escritorio y la hoja que abre el primer toque en móvil. Opinión conserva su escala y sus notas personales existentes. Se usan las notas del snapshot, sin cambiar consultas, promedios, fechas ni selección.

El nombre puede ocupar varias líneas; la nota conserva su columna y no se corta. Solo aparecen las personas activas que tienen la obra. Una nota ausente no se convierte en cero.

| Comprobación | Resultado |
|---|---|
| Regresión antes del cambio | Los tres casos parametrizados fallaron por la ausencia de `9/10` en Quién, Tiempo e Islas. |
| Unitarios de fichas | AtlasView y RatingScale: **62 PASS**, dos archivos, 7,30 s. Cubren asociación persona/nota, ausencia de nota, fechas, filtro de caras y ficha táctil. Cuatro expectativas anteriores se amplían con las notas. |
| Tipos, lint y build | `npx tsc --noEmit`, ESLint de los archivos TSX y del spec, `git diff --check`, `npm run build`: exit 0. Build Next 16.3.8 con 89 páginas estáticas. |
| Navegador | Caso focal en Chromium y Pixel 7: **2/2 PASS**, 54,3 s, un worker, sin reintentos ni skips, sobre build/start de producción local con login, acciones y Supabase dev reales. |
| Notas y fechas | Una obra con notas 8/4/null y otra con 7/6/9. En las tres lentes nuevas cada nota corresponde a su dueño; Tiempo conserva `2026` y «sin fecha». Desmarcar Carlos elimina su fila. Opinión mantiene su escala 7/6/9. |
| Nombres largos | Escritorio 1280 px y móvil 360 px. Hover de 280 px y hoja de 336 px: `clientWidth = scrollWidth`, también en las columnas de nombre; página sin scroll horizontal. Capturas inspeccionadas. |
| Logs | Sin errores de consola ni excepciones de página. Sin peticiones fallidas fuera de `net::ERR_ABORTED` de navegación/prefetch, conservadas en las métricas. |
| Datos desechables | SQL dev confirma usuarios, perfiles, libros y pases QA a cero; devtest continúa público. Evidencia de limpieza en los assets. |
| Entorno | Servidor detenido; cero listeners en 3000. Al cerrar se recogió `The destination stream closed early`, digest `254889757` (limitación de transporte registrada también en la ronda anterior, #1263). |

Capturas de [hover en Tiempo](assets/2026-10-14-atlas-notas-hover/chromium-notas-tiempo.png) y hoja móvil en [Quién](assets/2026-10-14-atlas-notas-hover/mobile-notas-quien.png), [Tiempo](assets/2026-10-14-atlas-notas-hover/mobile-notas-tiempo.png) e [Islas](assets/2026-10-14-atlas-notas-hover/mobile-notas-islas.png). Métricas y limpieza en la misma carpeta; solo contienen datos desechables.

Esta ronda verifica las notas de la ficha. La evidencia de tamaños y aparición anticipada de portadas de la misma PR está en [su informe anterior](2026-10-14-entre-nosotros-atlas-items-grandes.md), con su propia build y sus cuatro casos únicos. No se atribuye esa ejecución a la build de esta ronda.
