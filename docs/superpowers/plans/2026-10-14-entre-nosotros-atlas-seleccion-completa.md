# Entre nosotros: cruces completos y grupos pequeños

> Cambio solicitado el 2026-10-14 sobre `56f4e4f2` (PR #1529). El anuncio PNG/Markdown existente es un artefacto independiente y se conserva.

**Objetivo:** evitar grupos que parezcan obras perdidas y que una selección de tres personas mezcle comparaciones entre parejas.

- [x] Quién: todos los grupos compartidos activos, incluidos los de una y dos obras, muestran cifra e hilos en el zoom del mapa. Los grupos de una sola persona continúan junto a su polo; grupos apagados siguen tenues. Conservar disposición, movimiento y cámara.
- [x] Opinión, Tiempo e Islas: usar la intersección de todas las personas activas; con una persona Tiempo/Islas conserva sus obras y Opinión pide dos. Opinión necesita nota explícita de cada persona para comparar al conjunto completo. Tiempo conserva ausencias de fecha y cuenta solo obras comunes. Resumen, mapa y lista se derivan de la misma selección. Desmarcar C habilita A+B.
- [x] Otros por autor/director: conservar identidad canónica y top diez; explicar por separado obras fuera del top, sin crédito identificado y series cuyo creador no se modela como autor/director. Ninguna consulta nueva ni comparación de identidades por nombre libre.
- [x] Verificar regresiones RED/GREEN, unidad/lint/TypeScript/build y navegador de producción con datos QA propios, tres personas y cruces mixtos. Actualizar mensajes, backlog, decisiones y evidencia.

**Límites:** sin cambios de esquema/RLS, sin inventar notas/fechas/créditos, sin introducir nuevos filtros ni desplegar a producción. Si un cruce queda vacío se explica y se invita a cambiar las caras seleccionadas.
