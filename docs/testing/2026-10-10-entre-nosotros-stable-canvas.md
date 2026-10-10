# Entre nosotros: relevo de carga y marco estable

**[Histórico · candidato local verificado el 2026-10-10]**

La carga cede al mapa con un fundido CSS de 420 ms, sin retener evidencia anterior.
La rueda ya no controla los niveles. El marco exterior y el viewport del lienzo
comparten una altura responsive de 560–720 px; controles, portadas y detalles largos
se desplazan dentro. El retorno conserva foco, scroll interior y posición de página.

## Evidencia

- 345 pruebas focales en seis archivos PASS; TypeScript, ESLint focal y diff-check PASS.
- Ocho regresiones nuevas observadas RED y luego GREEN: tres del relevo de carga,
  cuatro de rueda nativa y una de retorno del scroll. Otra regresión detectó que
  el botón sticky restaba 60 px al scroll restaurado; reparación y prueba GREEN.
- Revisión independiente de carga, privacidad, rueda, foco y cambios finales de
  controles/padding: sin hallazgos pendientes.
- Chromium: diez escenarios de Explorer completo a 1280/430/320 px, claro/oscuro
  y con grupos de tres/diez personas. Marco y canvas de 576 px para viewport de
  800 px de altura; deriva de 0 px en aproximadamente 660 muestras RAF por caso.
- Opacidades intermedias reales en el relevo, retirada del overlay y movimiento
  reducido inmediato. Rueda sin navegación ni cancelación, con desplazamiento
  nativo hacia la página al alcanzar el borde.
- Dieciséis retrocesos con Shift+Tab mantienen las portadas visibles bajo la barra
  sticky. El padding se mide con su altura real; la sonda anterior reprodujo 70 px
  de portada oculta y el candidato final corrige ese fallo.
- Obra situada más abajo: retorno exacto de ambos desplazamientos y foco al mismo
  elemento. Serie de cuarenta episodios: último episodio alcanzable. Cargar más
  conserva las posiciones de las filas anteriores y la altura del marco.
- Dos escenarios adicionales de movimiento reducido a 1280/320 × 720 px, con
  Geist y estructura de fixtures de CI: título y retorno visibles al abrir una
  obra, sin mover la página. El título termina en 705,14/644,91 px. El contenido
  empieza en la barra de retorno mediante scroll interior; Escape devuelve foco
  y posición al origen. La regresión unitaria de esta entrada pasó de RED a GREEN.

Las cinco fuentes medidas conservan sus hashes tras QA. Journal y cinco capturas
en [la evidencia](assets/2026-10-10-entre-nosotros-stable-canvas/journal.json).
La sonda adicional con Geist está en
[work-entry-720.json](assets/2026-10-10-entre-nosotros-stable-canvas/work-entry-720.json).
Navegadores y servidor del harness cerrados; puerto 3000 libre. Cero escrituras,
solicitudes externas o cambios de cuentas persistentes.

## Alcance

El harness usa los componentes, CSS Modules y tokens reales, con navegación,
acciones y Auth simulados; portadas SVG locales, Arial de respaldo y sin compilar
las utilidades Tailwind del Button global. Acredita la mecánica del lienzo, no un
recorrido autenticado de Next, Android ni producción.

Los dos specs dedicados conservan los quince casos anteriores y añaden dos casos
de tamaño, fundido, rueda y teclado a 320/1280 px. Descubrimiento de 17 casos y lint
PASS; su ejecución autenticada queda registrada por CI en la PR de esta entrega.

## Primera ejecución de CI y reparación

La ejecución 38085487087 sobre `f1b18002` pasó 5.878 unitarios, build y 202 smoke.
Comparaciones terminó con 15 PASS y 2 FAIL: el hover de una portada tapada por
otra agotó el tiempo de la prueba de rueda; en 1280 × 720 el título de obra
terminaba en 759,14 px, fuera del viewport. La primera prueba ahora apunta a la
portada activa situada delante, conserva todas las comprobaciones de rueda y
preserva el error original si el contexto se cierra. La segunda se corrige en
el producto alineando el scroll interior con la barra de retorno; su aserción
de visibilidad permanece intacta. Evidencia del fallo conservada localmente.
La reparación cuenta con revisión independiente, 345 pruebas focales y los doce
escenarios Chromium anteriores; necesita CI del nuevo commit antes de integrar.
