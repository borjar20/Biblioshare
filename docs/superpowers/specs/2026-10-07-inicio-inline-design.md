# Inicio móvil — despliegues dentro de la página

> [Histórico · congelado el 2026-10-07 · implementado y verificado localmente]

> Diseño elegido explícitamente por el usuario el 2026-10-07: «Desplegar dentro de Inicio (recomendado)».

Hoy, Sale esta semana y Actividad crecen dentro del flujo de Inicio. Un bloque abierto a la vez, sin scrim, top layer ni bloqueo del feed. Resúmenes visuales conservados; detalle permanentemente montado y desplazamiento de página normal. Crónica mantiene su reproductor existente. PC conserva sus paneles completos y barras ocultas.

Plan acotado: RED de ausencia de modal/scroll libre, exclusión entre bloques y persistencia de controles; componente disclosure con aria-expanded/aria-controls/region/inert; coordinación por contexto en layout de Home, sin consultas nuevas; CSS grid 0fr/1fr y movimiento reducido; detalle semanal a todo el ancho bajo las dos tarjetas. Actualizar E2E a regiones inline, verificar build/start con auth local y casos largos/resize/sesión/teclado; revisión independiente del delta; doc canónica y PR1457.

Cerrar devuelve foco al resumen y lo acerca al viewport si estaba fuera de vista. Abrir conserva foco en la tarjeta y permite seguir leyendo el feed. Escape recoge solo el bloque, respetando diálogos internos. Cambiar de ruta o a PC limpia la selección expandida; sigue montado el contenido funcional.
