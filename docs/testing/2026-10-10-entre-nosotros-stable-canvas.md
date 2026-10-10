# Entre nosotros: relevo de carga y marco estable

**[Histórico · candidato local verificado el 2026-10-10]**

La carga cede al mapa con un fundido CSS de 420 ms, sin retener evidencia anterior.
La rueda ya no controla los niveles. El marco exterior y el viewport del lienzo
comparten una altura responsive de 560–720 px; controles, portadas y detalles largos
se desplazan dentro. El retorno conserva foco, scroll interior y posición de página.

## Evidencia

- 344 pruebas focales en seis archivos PASS; TypeScript, ESLint focal y diff-check PASS.
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

Las cinco fuentes medidas conservan sus hashes tras QA. Journal y tres capturas
en [la evidencia](assets/2026-10-10-entre-nosotros-stable-canvas/journal.json).
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
