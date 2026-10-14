# Entre nosotros: selección viva, medias y conexiones

> **[Evidencia local · 2026-10-14]** Mejoras sobre PR [#1529](https://github.com/borjar20/Biblioshare/pull/1529), base `818a8446`. Cambios preparados para la rama de la PR; integración y despliegue en producción pendientes.

## Comportamiento

- **Quién:** los propietarios visuales son la intersección con las personas seleccionadas. A+B y A+B+C forman una sola agrupación al desactivar C; reactivarlo recupera ambas. Polos y obras sin personas activas conservan su posición; las obras, los recuentos, los halos y los hilos acompañan el movimiento. Con cámara propia acercada, si los nuevos destinos quedan fuera se sigue el grupo conservando zoom; también al volver al mapa tras cambiar personas en la lista.
- **Medias de Islas:** escala 1–10, iniciales y cifras decimales localizadas. Se conserva el mínimo de tres notas y la distinción entre ausencia y cero. La lista muestra nombre, media y tamaño de muestra. Las cabeceras se distribuyen en píxeles dentro de la banda libre entre controles; cuatro islas y diez medias por isla caben a 360 px. El detalle aparece progresivamente al acercar; los títulos se acotan y se ocultan cuando no caben, con nombre completo siempre en la lista.
- **Conexiones:** las curvas siguen la dirección de cada par; señalar o tocar una obra realza todas sus copias y sus hilos, atenuando el resto. Se mantienen los trazos agrupados y el descarte fuera de pantalla. No hay animación continua.

## Verificación

| Comprobación | Evidencia |
|---|---|
| Unidad final | `npx vitest run src/components/comparisons src/lib/comparisons --maxWorkers=1 --no-file-parallelism`: **33 archivos, 368 pruebas PASS**, 33,51 s. Incluye regresiones RED/GREEN de proyección, framing, zoom-out, muestras y recuperación de cámara. |
| Lint focal | `npx eslint src/components/comparisons/atlas src/lib/comparisons/atlas e2e/entre-nosotros-atlas.spec.ts`: exit 0. |
| Build final | `npm run build`: exit 0, build **`9H-8cVcvHTtvwPmkwYgJ2`**; TypeScript 8,1 s y 89 páginas estáticas. |
| Islas en navegador | Build `ruik8lyiiVUww8zaRooR4`, Chromium real y Supabase dev: dos pruebas de medias/conexiones y dos de cuatro islas/diez personas/nombre largo PASS; misma implementación de Islas que la build final. |
| Quién y cámara finales | Build `9H-8cVcvHTtvwPmkwYgJ2`: agrupación en escritorio/móvil **2/2 PASS** (43,4 s) y regreso desde ficha/lista **1/1 PASS** (15,8 s), conservando zoom ±0,01 y obras visibles. |
| Recorrido de densidad | 1280×800, 390×844 y 360×780: cuatro títulos, cero solapes y 40 medias; tras uno/dos alejamientos no se pisan etiquetas, y volver a encajar recupera las 40 medias. Foco por ratón/toque realza cuatro copias y tres tramos. |
| Lista con nombre de 80 caracteres | A 360 px, `scrollWidth = clientWidth = 360`; fila de 328 px, x=16…344, con la media `10,0` íntegra. |
| Sesión y limpieza | Login real de la cuenta persistente devtest verificado. Fixtures desechables limpiadas por REST antes/después y comprobadas en dev: cero usuarios/perfiles/libros/películas/series propios restantes; devtest sigue público. |

**Ocho casos únicos PASS**, ejecutados en tandas: cuatro de Islas, dos de Quién y dos de navegación/cámara. Los E2E usan `playwright.comparisons.config.ts`, un worker y cero reintentos; las tres regresiones afectadas por el último cambio de cámara se repitieron sobre la build final. No se modifican esquema, consultas, RLS ni caché.

## Problemas reproducidos y corregidos

1. En la primera composición, cuatro islas con diez personas solapaban títulos horizontalmente y tapaban obras de la fila superior. Se preservan [captura anterior a 360 px](assets/2026-10-14-entre-nosotros-atlas-vivo/qa-10caras-4islas-360-antes.png) y `qa-adicional-antes.json`. El packing final reserva cabeceras por fila/columna, y el zoom-out ajusta también los títulos.
2. Un nombre de 80 caracteres llevaba el ancho de la lista a 783 px sobre 360 px y ocultaba la media. Se preserva [captura anterior](assets/2026-10-14-entre-nosotros-atlas-vivo/qa-lista-nombre80-360-antes.png); la fila ahora envuelve texto sin alterar las escalas de otras fichas.
3. Tras acercar a A+B+C y apagar C, la cámara conservaba zoom 2,572 pero la sonda pasaba de 30 obras visibles a cero. `qa-camara-antes.json` y la captura `qa-camara-fuera-antes.jpeg` conservan el fallo. Dos regresiones de unidad fijan seguimiento en vivo y recuperación tras cambiar selección en la lista.

Las primeras mediciones de conexiones fueron errores del instrumento: `getImageData` rechaza portadas externas en un canvas con CORS, y un recorte demasiado ancho incluía anillos dorados que se atenúan al señalar. La prueba final analiza el PNG real en un corredor central de 1,5 %, fuera de discos y tooltip, y exige que el trazo seleccionado supere claramente al fondo. No se cambiaron las aserciones del regreso de cámara para ocultar su fallo.

## Capturas finales

- [Quién con A+B agrupado, móvil](assets/2026-10-14-entre-nosotros-atlas-vivo/mobile-quien-agrupado-no-preference.png).
- [Media y conexión seleccionada, escritorio](assets/2026-10-14-entre-nosotros-atlas-vivo/chromium-islas-conexion-seleccionada.png).
- [Cuatro islas y diez personas, 360 px](assets/2026-10-14-entre-nosotros-atlas-vivo/qa-10caras-4islas-360.png).
- [Alejar dos veces](assets/2026-10-14-entre-nosotros-atlas-vivo/qa-10caras-4islas-alejar-2-360.png).
- [Lista con nombre largo, 360 px](assets/2026-10-14-entre-nosotros-atlas-vivo/qa-lista-nombre80-360.png).
- [Cámara conservada tras cambiar selección en la lista](assets/2026-10-14-entre-nosotros-atlas-vivo/chromium-quien-camara-retorno-lista.png).

Las imágenes muestran datos desechables de QA y una portada de fixture compartida. Cero errores de consola o HTTP ≥400 en el recorrido de Islas; se conservaron 11 `ERR_ABORTED` de navegación/prefetch en `qa-adicional.json`, sin afirmar cero fallos de transporte. FPS en Android físico siguen fuera de esta verificación y ya se siguen en [#1521](https://github.com/borjar20/Biblioshare/issues/1521).
