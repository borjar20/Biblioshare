# Plan y ledger — Inicio inline

Base92776090, rama/PR1457 existente. Diseño de expansión en Inicio aprobado por respuesta del usuario; no se reabre esa elección. Ejecutar como cambio acotado sobre el componente compartido, con TDD y una revisión final del delta.

1. Actualizar pruebas de TodayPicker y agregar exclusión de paneles. Ejecutar RED.
2. Reemplazar diálogo por región inline montada, contexto de un solo bloque y grid/animación CSS; GREEN + tipos/lint.
3. Adaptar E2E a regiones y scroll natural. Build/start local con backend desechable, controlar móvil/PC, sesión, cola/colección, crónica e integridad de feed.
4. Revisión independiente final, corregir hallazgos pertinentes con regresiones. Sincronizar UI/decisiones/mapa/QA y subir a PR existente. Limpieza de servidores propios.

Ruling: usar CSS grid0fr/1fr con clipper min-height0 — evita medir alturas y carreras con WAAPI para despliegues, respeta movimiento reducido. StoryPlayer conserva su animación aparte.
