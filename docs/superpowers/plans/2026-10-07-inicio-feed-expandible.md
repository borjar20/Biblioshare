# Plan de Inicio/feed expandible

> [Histórico · congelado el 2026-10-07 · implementación y verificación local en docs/testing/2026-10-07-inicio-expandible.md]
Diseño: ../specs/2026-10-07-inicio-feed-expandible-design.md. Ejecución directa autorizada por «Ve con la implementación». Rama codex/inicio-feed-expandible, base 9e3d45b5.

## Restricciones

Slots del servidor; sin consultas duplicadas, caché compartida, migraciones, dependencias nuevas ni cambios de arte. Mantener TodayPicker montado. Resúmenes bajo 1100; solo Novedades compacto en PC. Reutilizar StoryPlayer al pulsar, sin marcar visto antes. No tocar el DOM/estado del feed al abrir.

## Tareas

1. Escribir regresiones de TodayPicker: control completo oculto hasta abrir, contador/obra persistentes al cerrar y foco restaurado. Ejecutarlas contra la versión actual y conservar RED. Línea base: releases UI, wrap-ups row, navegación y Today focus.
2. Crear HomeExpandable con props {title, openLabel, closeLabel, summary: ReactNode, quickAction?: ReactNode, children: ReactNode}. Un único dialog/slot, no portal ni montaje condicional del selector. Usar animación nativa de 340/270 ms y movimiento reducido. Integrar slots summary/quickAction opcionales en TodayEntry y panelLabels en TodayPicker. Completar resumen servidor de TodayBlock y sus cuatro estados fríos; confirmar GREEN.
3. Envolver estadísticas y Novedades con el mismo componente. Crear fila semanal breve que conserva todos los anuncios/modalidades y las fechas civiles. Preservar enlace a la ficha o al anuncio y /novedades. Añadir regresiones de fechas/canonical href/vacíos.
4. Crear entrada cliente de crónica con summary/desktopCover, datos privados ya autorizados y modelos de Poster; cargar StoryPlayer solo al pulsar. Añadir origen opcional de animación al reproductor existente y retorno a la tarjeta al cerrar. Ampliar mensajes de ruta solo con namespaces que consume el reproductor.
5. Actualizar home-grid y loading: Hoy ocupa primera fila móvil; crónica/Novedades comparten fila; estadísticas quedan en resumen. En PC, DOM/orden completos y laterales con max-height y overflow propio. Reservar alto móvil de 106/96/54 px en los fallbacks.
6. Typecheck/lint focales, unitarios pertinentes, build/start y browser E2E. Documentar diseño vigente en UI-GUIA, append decisiones, backlog y mapa derivado. Revisión independiente de toda la rama después de la implementación, como exige executing-plans; corregir hallazgos pertinentes y volver a comprobar.

## Riesgos que se verifican

- Transición móvil/escritorio mientras el diálogo está abierto: no queda bloqueo de scroll/foco.
- Cambios en obras/pases con refresh: el selector reconcilia y la acción de sesión usa el pase elegido.
- Cola/colección/descubrimiento y fallo de Novedades: hay acceso útil, sin tarjetas de datos ficticios.
- Crónica no vista: abrir realiza el marcado actual; el resumen no lo realiza.
- Datos largos y ventana baja: sin overflow horizontal, último anuncio y enlace alcanzables sin bajar el feed.

## Estado

Preparación instalada desde lockfile; Next 16.3.8 y Node 22.23.1. Desarrollo y QA se harán en este worktree ya aislado. El usuario autoriza ejecutar directamente el diseño elegido; no se reabre su elección con aprobaciones de proceso adicionales.
