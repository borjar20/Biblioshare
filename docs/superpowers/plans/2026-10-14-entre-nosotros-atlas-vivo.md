# Entre nosotros: agrupación y lectura del atlas

> Plan de mejora local sobre PR #1529 (`818a8446`), 2026-10-14. Petición: reagrupar Quién según la selección y mejorar medias y conexiones en Islas.

**Objetivo:** que seleccionar personas cambie la composición del mapa y que las medias y las obras repetidas se puedan leer sin adivinar.

**Arquitectura:** reutilizar layouts puros, sprites interpolados y pintores Canvas existentes. Conservar colores, tipografía, cámara, filtros, RLS y lectura de datos de la PR. Sin dependencias nuevas ni esquema.

- [x] Quién: proyectar los dueños sobre la selección activa; A+B y A+B+C forman una única agrupación cuando C está desactivado. Mantener los polos estables, conservar tenuemente las obras sin dueños activos y animar los destinos con el motor existente. Verificar retorno a la selección completa, selección de una persona y coherencia con la lista. Seguir destinos que quedan fuera de una cámara propia conservando zoom, también al volver desde la lista.
- [x] Islas: identificar las medias con cifras y escala explícita, conservar la ausencia de nota y el umbral actual de tres valoraciones; incluir tamaño de muestra en la lista accesible. Reservar píxeles por fila/columna para los rótulos, acotar títulos y mostrar detalle progresivamente cuando no quepa; verificar diez personas, móvil y zoom-out.
- [x] Conexiones: curvas adaptadas a la dirección de cada par, menos ruido de fondo y realce de todas las copias y sus hilos al señalar o tocar una obra. Conservar lote de trazos y descarte fuera de pantalla.
- [x] Verificación: regresiones focales, TypeScript/lint, revisión independiente y navegador escritorio/móvil con capturas. Actualizar backlog/decisiones y registrar evidencia y límites reales en `docs/testing/2026-10-14-entre-nosotros-atlas-vivo.md`.

**Criterios visuales:** la información cultural sigue siendo el centro; movimiento únicamente en respuesta a la selección; dorado para coincidencias y atención, colores personales para notas; números legibles, sin movimiento continuo y con movimiento reducido respetado.
