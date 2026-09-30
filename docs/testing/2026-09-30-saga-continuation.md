# Continuidad de bloque de saga tras una ventana — #696

> **[Evidencia de ejecución · unitarios y navegador focalizados el 2026-09-30]**

Una ventana anclada dentro de un bloque divide la lectura visual en dos secciones
del mismo grupo. La sección posterior conserva etiqueta, color y números y se
marca «(cont.)»; el orden sigue siendo obra A → ventana → obra B. La derivación
no reemplaza filas, por lo que las ramas conservan sus referencias; una rama
suelta busca el último segmento de su grupo después de la división.

El mapa 2D deriva nodos individuales, sin cabeceras de subsaga; sus vistas móvil
y de escritorio, y la ruta con grafo, comparten `ReadingTimeline`. `RouteBlock`
es el respaldo editorial cuando no hay grafo, no un segmento partido. La revisión
de alcance confirma que no hay una segunda cabecera derivada pendiente de rotular.

## Comprobaciones

- `33` archivos y `504` pruebas de saga PASS (`696-sagas-unit-final.log`).
- Navegador real con Node 24 y fixture local temporal que compone
  `deriveTimeline` y `ReadingTimeline` reales: PASS a `390×844` y `1366×768`.
  Comprobó el orden A → ventana → B, los encabezados «Era Uno» y «Era Uno
  (cont.)», mismo acento, `consoleErrors=[]` y `failedRequests=[]`.
- Se inspeccionaron las capturas móvil y escritorio
  `qa696-mobile/desktop-20260930-root-final.png`; la revisión independiente
  dictaminó APROBABLE.

La fixture fue local y temporal porque las ventanas reales de dev estaban vacías:
esta evidencia no prueba datos de producción ni constituye una campaña completa
de navegador. Tampoco cubre todas las combinaciones de ventanas consecutivas y
ramas sueltas; afirma únicamente el recorrido sintético comprobado.
