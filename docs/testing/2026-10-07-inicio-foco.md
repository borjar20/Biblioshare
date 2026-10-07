# Inicio — el resumen de Hoy se transforma en el foco

> [Canónico para el delta local de PR #1457 · verificado contra código y navegador dev el 2026-10-07]

Las referencias del usuario piden el título «¿Qué has disfrutado hoy?» visible
antes de ampliar y continuidad desde la tarjeta resumida hasta el foco completo.
TodayCard se pinta una sola vez: portada, título y barra permanecen presentes;
CSS interpola la geometría y las filas de meta, racha y acciones. Se mantienen
la sesión directa del resumen, las estanterías del detalle y el contenido completo
en PC. El esqueleto móvil incluye la cabecera solicitada.

## Evidencia focal

La nueva prueba unitaria falla primero porque el título está dentro de la región
oculta. Con el cambio pasa y comprueba además la identidad del nodo Image y el
estado de un control hijo al abrir/recoger/reabrir. 14/14 unitarios de TodayPicker
y TodayActions PASS; TypeScript y eslint focal PASS.

Chromium sobre **Next dev real** en puerto 3000 y la cuenta persistente de pruebas
apuntando a biblioshare-dev; sin sembrar datos ni cambiar la biblioteca. El script
local usa los componentes, slots del servidor, CSS compilado y controles reales,
no una maqueta. La cuenta carece de imágenes de portada cargadas en estas obras:
el navegador mide y conserva el nodo de su superficie; la prueba unitaria usa
Image real y la regresión E2E de CI conserva su fixture de portada.

| Fotograma de apertura (390 px) | Ancho portada | Alto tarjeta | Opacidad portada |
|---|---:|---:|---:|
| Resumen | 48 px | 106 px | 1 |
| Inicio, 0 ms | 48 px | 106 px | 1 |
| Intermedio, 160 ms | 56,52 px | 197,75 px | 1 |
| Foco completo | 58 px | 214 px | 1 |

El primer fotograma también conserva las coordenadas iniciales del título y de
la barra. Al recoger, comienza con la geometría completa y atraviesa valores
intermedios en sentido inverso. La misma portada permanece conectada al DOM.
El observador de estado pausa las transiciones antes de pintar, evitando carreras
con el reloj del host.

Recorridos a 320/390/768/1280 px PASS: título visible, ancho sin desborde, selección
de otra obra, Escape, exclusión entre paneles, foco de vuelta al botón y movimiento
reducido sin transiciones. PC sigue mostrando el foco completo y ocultando el botón
superpuesto. Sin errores JavaScript de página. Se verifica además el enlace
«Ver todos» del contexto completo y el estado sin progreso. La cabecera añade su
altura al presupuesto vertical del primer post a 320 px; no se comprimen los demás
bloques para compensarla.

La revisión independiente encuentra un resumen sin límite de título: una obra de
nombre largo llega a 194,5 px a 320 px. Se añade RED/GREEN en la app real con
texto de prueba solo en DOM: dos líneas, 106 px de tarjeta y separación de la
sesión, también con una palabra larga. El foco muestra el título completo; PC
conserva su composición. La fixture del E2E usa el título largo como regresión
durable. Hallazgo resuelto; revisión final sin hallazgos pendientes.

Se repite la prueba focal del componente genérico de Activity/Novedades sin
regresiones. La regresión temporal del E2E existente pasa de comprobar el fundido
de dos caras a medir la portada persistente a 0/160 ms. No se atribuye a este corte
una nueva ejecución de los seis E2E autenticados de backend local ni un nuevo
build/start de producción; su evidencia previa sigue en inicio-inline.md.
Warnings de stream cerrado durante login dev corresponden a los antecedentes
#1251/#1263/#1301; el recorrido visual termina sin errores de página.

Artefactos efímeros: .superpowers/qa/2026-10-07-inicio-focus/ (script proof.mjs,
proof.json y capturas de ambos estados). Las capturas reflejan la cuenta de prueba,
no las obras personales del usuario. No se modifica esquema, consultas o cachés.
