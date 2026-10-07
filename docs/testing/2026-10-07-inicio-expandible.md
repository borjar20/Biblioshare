# Inicio expandible — verificación local del 2026-10-07

> [Canónico para este corte de pruebas · build/start local · candidato en codex/inicio-feed-expandible · no acredita publicación]

Alcance aprobado: tarjetas visuales que crecen bajo 1100 px; PC conserva sus paneles completos y reduce únicamente Sale esta semana, con enlace directo a /novedades. Se corrige el scroll de los laterales. Seguimiento: #1453/#1454; el rediseño público de #1450 queda fuera.

Entorno: worktree d7df, base 9e3d45b5, Node 22.23.1, Next 16.3.8. Supabase local desechable con 306 pasos preparados y activación de celebraciones previa a crear usuarios; sin credenciales ni escrituras de prueba remotas. Build final b2SEH9oTtf5_Z2LWWc9zx. Los actores, obras, pases, sesiones, posts y anuncios de CI se limpian antes y después.

## Evidencia

- RED original de TodayPicker: 3 fallos por ausencia de entrada expandible; GREEN 3/3. Regresión de navegación: RED 1/4, GREEN 4/4.
- Línea base focal y controles: 50 unitarios de selector, acciones de Hoy, releases UI, reproductor y fila de crónicas PASS antes de la revisión. Regresión de actualización de la crónica fijada: RED 1/3, GREEN 3/3; junto con TodayPicker, 7/7 PASS.
- Build local de producción y TypeScript PASS; eslint focal PASS.
- Playwright real en Chromium, build/start y auth real: **6/6 PASS, 27,2 s, cero reintentos/skip**, tras las correcciones de revisión. Sin errores JavaScript de página.

| Recorrido | Resultado |
|---|---|
| 320 × 640 claro, movimiento reducido | Resúmenes, primer post dentro del viewport útil, selección/sesión, vistas completas y retorno PASS |
| 390 × 844 claro, movimiento normal | Crecimiento y retorno, crónica solo vista al abrir, publicar/despublicar con controles actualizados PASS |
| 768 × 844 oscuro, movimiento reducido | Resúmenes y cuatro paneles, foco/scroll y ancho sin desborde PASS |
| 1280 × 680 | Detalle de Hoy conservado; anuncio final alcanzable sin scroll de página ni movimiento del feed; portada semanal ≤36 px; acceso a Novedades PASS |
| Móvil → PC → móvil; sesión interceptada y atrás | Obra/contenido montados, cierre de capas y liberación del scroll PASS |
| Cola → colección completada → descubrimiento; anuncios vacíos | Controles de sorteo/reinicio/búsqueda y enlace general conservados PASS |

Las pruebas durables viven en `e2e/ci/home-expandable.spec.ts`, `today-picker.test.tsx` y `home-wrap-up.test.tsx`. Comandos: `npm run test:ci:build`; `npm run test:ci:smoke -- home-expandable.spec.ts`; eslint focal; `npm test -- --maxWorkers=2`. El wrapper recibe SUPABASE_CLI apuntando al binario nativo local y configura las claves dentro del proceso, sin imprimirlas.

## Revisión y límites

Revisión independiente de toda la rama 9e3d45b5..665dc358: dos hallazgos corregidos. Se fija la identidad de la crónica abierta, reconciliando sus datos nuevos desde las mismas lecturas del servidor; la publicación y despublicación se comprobaron en navegador. La animación usa transform-origin superior izquierdo y cancela sus transiciones antes de volver a medir. Cancela exclusivamente animaciones home-panel, preservando relojes y barras internas.

La geometría RED del reproductor original fue comprobada por el revisor en Chromium: origen (20,240,170,96) generaba rectángulo (130,614,170,96) por el origen centrado. La altura inicial del rail tampoco descontaba el saludo: el anuncio final quedaba fuera del viewport. HomeRail mide el espacio real hasta su borde inferior; el E2E pasó tras corregirlo.

Los logs conservan Gzip MaxListeners y «The destination stream closed early» durante estos recorridos. Ambos tipos ya aparecen en informes previos (#1251/#1263/#1301); no se afirma igualdad de causa ni ausencia de impacto. No hubo errores JavaScript de página ni fallos funcionales en los seis recorridos. No hay nueva validación nativa Android/iOS ni despliegue productivo.

La primera suite general leyó una regresión RED de HomeWrapUp mientras se añadía y falló también en la prueba previa de reintento de Retirar aviso: 5412 PASS / 2 FAIL en 547 archivos. Ese intercalado de pruebas no es el corte final. La incidencia anterior de retirada se registró en #1456, con etiqueta/estado intermedio y reproducción; su código de producto no se modifica aquí. **Corte general final: 547 archivos / 5414 pruebas PASS, 269,01 s.** La incidencia intermitente #1456 sigue abierta; un pase posterior no elimina su reproducción anterior.

Capturas finales de app en el directorio de visualizaciones de esta conversación: home-320.png, home-390.png, home-768.png, home-desktop.png y home-expanded.png. La captura ampliada se toma tras terminar WAAPI; una captura anterior durante el fade no representa el estado final.

Entorno cerrado: puerto 3000 sin listener; proyecto Docker local biblioshare-local-cdfa98e0 detenido sin backup. Se restaura la copia local del entorno de desarrollo y se retira la build de QA con sus claves sintéticas. El worktree administrado y la rama se conservan para revisar los cambios. No se publica ni se integra en main.
