# Inicio — transformación visual del 2026-10-07

> [Canónico para este delta focal local · PR #1457 · sin nuevo corte de backend]

El usuario pide continuidad entre estados al abrir cada bloque. Ajuste de CSS:
resumen/cabecera fundidos dentro del mismo botón, altura/contorno de 460 ms,
detalle con entrada progresiva tras 100 ms, portadas semanales que se despliegan.
El cierre invierte el recorrido. Estado y consultas conservados; PC mantiene su
vista completa. Movimiento reducido desactiva todas estas transiciones, incluyendo
reglas de mayor especificidad del estado abierto.

## Prueba focal

Harness Chromium con **HomeExpandable y HomePanelsProvider reales**, React/DOM
reales, globals.css real y slots representativos de datos. Solo la navegación
se sustituye por pathname=/; no hay auth, backend ni escrituras remotas. El
bundle efímero de prueba no introduce dependencias de producto.

Se reproducen antes los saltos: en el primer fotograma el resumen ya tenía
`display:none`, y cabecera/detalle opacidad 1; recoger empezaba en 106 px aunque el
estado abierto medía 64 px. Se conserva baseline.json en
.superpowers/qa/2026-10-07-inicio-motion/.

| Fase de Hoy | Altura resumen | Opacidad resumen/cabecera/detalle |
|---|---:|---|
| Recogido | 106px | 1 / 0 / 0 |
| Apertura, inicio | 106px | 1 / 0 / 0 |
| Apertura, 160 ms | 70,22px | 0,013 / 0,839 / 0,704 |
| Abierto | 64px | 0 / 1 / 1 |
| Recogida, inicio | 64px | 0 / 1 / 1 |
| Recogida, 160 ms | 99,77px | 0,896 / 0,002 / 0,002 |
| Recogido de nuevo | 106px | 1 / 0 / 0 |

**PASS**: estados intermedios y apertura/cierre reversibles, detalle gradual en
Hoy/Actividad/Novedades, contador hijo conservado al cambiar de bloque, movimiento
reducido sin animaciones y detalle completo en PC. El observador de cambio de
estado pausa antes de pintar, evitando que un host lento cambie el fotograma
comparado. RED original de sustitución abrupta; GREEN con el parche. Una segunda
regresión detectó especificidad en movimiento reducido y también quedó GREEN.

10/10 unitarios de TodayPicker/HomeWrapUp PASS; TypeScript y eslint focal PASS. El test E2E
existente incorpora el contrato de fotogramas 0/160 ms en el recorrido de 390 px para
la CI. Este delta no vuelve a ejecutar los seis recorridos de auth/backend ni
la suite general; sus resultados previos siguen en inicio-inline.md. No se
atribuye a este harness evidencia de despliegue, lector de pantalla ni Safari.
