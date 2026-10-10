# Carga de Entre nosotros — evidencia del componente

[Histórico · verificado 2026-10-10] QA visual acotado del componente real `ComparisonLoading` en un harness de Chromium. No acredita el flujo autenticado completo ni producción. Las herramientas Preview MCP no estaban expuestas en esta sesión.

El harness importó directamente `loading.tsx` y los CSS Modules reales de carga, Explorer y Canvas. Reutilizó los tokens `:root` y `.dark` de `globals.css`, con la tipografía sans-serif de reserva; no sirvió Geist. La variante completa se alojó en `.workspace` y la compacta en `.detailEvidence`. Los textos son los existentes en `messages/es.json`.

Resultado: **8/8 estados PASS**, variantes completa/compacta a 1280 y 320 px, en claro y oscuro. En cada estado: desbordamiento horizontal 0, una región `status`, texto visible, SVG decorativo `aria-hidden="true"` sin foco, tres portadas dentro del gráfico. Los instantes CSS 0, 1000, 2200 y 4400 ms prueban desplazamiento y retorno al inicio; otra observación de 1000 ms de tiempo real confirma que el ciclo avanza en el navegador. Con movimiento reducido, 0 animaciones y estado estático. Console errors, solicitudes fallidas y solicitudes externas: 0.

Inspección visual de las capturas de escritorio, móvil y detalle oscuro: composición y texto legibles, sin recorte. El journal registra hashes de los archivos comprobados, posiciones y transformaciones de cada instante.

Limpieza: navegador cerrado y servidor temporal de 127.0.0.1:3000 detenido. No se inició Next, no se usó ninguna cuenta ni se escribieron datos en la base.
