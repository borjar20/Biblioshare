# Inicio/feed: resúmenes visuales y lateral accesible

> Diseño aprobado en conversación el 2026-10-07; implementación solicitada explícitamente. Issues #1454 y #1453.

Bajo 1100 px, Inicio muestra resúmenes visuales: obra/progreso con sesión directa, narradora/crónica, portadas de novedades y actividad semanal. Pulsar abre el contenido completo creciendo desde la tarjeta. Cerrar conserva feed, filtros, cursor, obra elegida y foco. La escalera sin obra en curso (cola, colección, descubrimiento) sigue funcionando.

En PC se mantienen crónica, Hoy, Continúa, Para más tarde y estadísticas completos. Solo Sale esta semana pasa a piezas breves con portada, título y fechas/modalidades, con acceso directo a /novedades. Los laterales tienen una altura acotada y scroll propio.

Se reutilizan consultas y acciones. El contenido completo llega como slots del servidor y permanece montado; la interacción no duplica consultas ni añade caché compartida. La crónica reutiliza el reproductor actual, cargado al abrir, y no se marca vista al mostrar el resumen. No cambian esquema, RLS, navegación primaria, feed, datos ni arte.

Los resúmenes y esqueletos reservan alturas equivalentes. La crónica ausente no inventa una tarjeta. Las vistas completas conservan vacíos y errores. Diálogos nativos, Escape, fondo, retorno de foco y bloqueo de scroll; compatibilidad con las hojas internas de sesión. Animación aproximada de 340/270 ms, sin movimiento si se solicita. El cambio de breakpoint devuelve el contenido a escritorio sin perder su estado.

Verificar con regresiones de TodayPicker y diálogo, tarjetas de lanzamientos y build/start de producción a 320/390/768/1280 px, ambos temas y movimiento reducido. Probar sesiones, selector, estados fríos, novedades, filtros/feed y último elemento del lateral con login real. La evidencia de maqueta no acredita app ni producción.
