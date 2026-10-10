# Entre nosotros: fidelidad con el prototipo y verificación visual

> **[Evidencia · 2026-10-10 · candidato local, no acredita publicación ni Android.]**

La referencia es el [prototipo aprobado de Sites](https://biblioshare-entre-nosotros.borjar20.chatgpt.site/).
Se contrastaron en el navegador su mapa, Venn y Gustos. La revisión visual del
producto usa Chromium real contra `next build` + `next start`, login, cookies,
RLS y Server Actions reales. No se sustituyeron sesiones ni respuestas de datos.
Sólo las portadas reciben recursos de imagen reales guardados para estabilizar
la comparación visual; el catálogo y las valoraciones del escenario son fixtures
locales, no bibliotecas de usuarios de producción.

## Candidato y entorno

- Backend desechable: `http://127.0.0.1:54321`, proyecto generado
  `biblioshare-local-5e2cc809`, con el bootstrap de 307 pasos y su activación
  histórica protegida ya preparados. No se ejecutó el verificador general ni
  se cambió ningún reloj interno.
- Node 22.23.1, Next 16.3.8. Un solo servidor de producción local, puerto 3000.
- Build final: `LVQT9ZvljG75urh3G4djs`, compilación 5,1 s, TypeScript 12,1 s,
  generación de 89 páginas 2,5 s, salida 0.
- Época de fuente: `2026-10-10T19:01:36.662Z`.
- SHA-256 agregado de los 13 archivos de producto en `src/components/comparisons/`
  y `messages/es.json`:
  `c3bded6e78bb19d604b9c428475f269a199115ea15c0e21d82523e4cb900e2c3`.
- `.env.local` remoto y las cuentas persistentes `devtest`/`codex_qa` se conservaron.
  La ejecución dedicada usa los diez actores locales desechables de
  `comparison-fixtures.ts`, no replica sus credenciales persistentes.
- Se usaron el navegador integrado y Chrome para contrastar Sites, y
  Chromium/Playwright para conducir el flujo completo del producto. La
  inspección de código y el typecheck no sustituyen esta prueba.

La primera build visual, `_Tiw5duyqQh5QGTxNb_UE`, conserva sólo dos capturas
comparativas en la evidencia pública. Sus 30 estados fueron una ronda intermedia:
detectaron la herencia serif de los headings y el espacio adicional de Gustos.
La build `r7HGezG06b8shEZ9yLinS` compiló después de corregirlos, pero no se usó
para la aceptación final; se retiró una clave de traducción sin uso y se construyó
el candidato definitivo indicado arriba. No se suman esas builds como una única
tanda de verificación.

## Comparación visual y flujo real

La ronda final recorrió 30 estados: mapa de diez personas, Venn de tres,
cruce, obra y Gustos, en 1280/430/320 × 1000 px, claro y oscuro. Todos pasaron
sin desbordamiento horizontal. El registro incluye dimensiones de escenario,
portadas cargadas, rectángulos, opacidad, difuminado y familias tipográficas.

Se comprobó además:

- Headings locales Sans: `Geist, "Geist Fallback", sans-serif`, medido con
  `getComputedStyle`, sin cambiar la tipografía del resto de Biblioshare.
- Nombres de las obras de la estantería común visibles, con altura real positiva
  en los seis estados del mapa.
- Trío seleccionado → Venn → mapa: el foco vuelve al CTA «Comparar selección»;
  volver a activarlo abre las mismas tres personas, no una pareja distinta.
- Cruce → obra → cruce: la portada permanece en el lienzo, el resto se difumina,
  y el retorno conserva el foco sobre la portada de origen.
- Los paneles de Gustos recuperan las burbujas de consumo y los rangos de notas,
  distinguiendo muestra consumida de muestra valorada y sin inventar un porcentaje
  de afinidad. La cabecera compactada adelanta las tarjetas de aproximadamente
  y=545 en la ronda intermedia a y=428 en la final a 1280 px.

El root contrastó las capturas finales con Sites y aceptó la fidelidad de
mapa/Venn a 1280 px, Gustos en ambos temas, Venn a 320 px y obra a 430 px oscuro.
Su verificación independiente pasa 329 pruebas focales y ESLint en diez archivos
con salida 0. La revisión independiente final no encontró bloqueantes.

Capturas conservadas para revisar el resultado:

- [Mapa completo, claro](assets/2026-10-10-entre-nosotros/visual/map10-1280-light.png)
  y [mapa oscuro](assets/2026-10-10-entre-nosotros/visual/map10-1280-dark-viewport.png).
- [Venn de tres, claro](assets/2026-10-10-entre-nosotros/visual/venn3-1280-light.png)
  y [Venn oscuro](assets/2026-10-10-entre-nosotros/visual/venn3-1280-dark-viewport.png).
- [Cruce](assets/2026-10-10-entre-nosotros/visual/region3-1280-light-viewport.png)
  y [cruce móvil](assets/2026-10-10-entre-nosotros/visual/region3-320-light.png).
- [Obra seleccionada](assets/2026-10-10-entre-nosotros/visual/work-1280-light-viewport.png)
  y [obra móvil oscura](assets/2026-10-10-entre-nosotros/visual/work-430-dark-viewport.png).
- [Gustos claro](assets/2026-10-10-entre-nosotros/visual/tastes-1280-light-viewport.png),
  [oscuro](assets/2026-10-10-entre-nosotros/visual/tastes-1280-dark-viewport.png),
  [320 px](assets/2026-10-10-entre-nosotros/visual/tastes-320-light.png)
  y [430 px oscuro](assets/2026-10-10-entre-nosotros/visual/tastes-430-dark.png).
- [Venn a 320 px](assets/2026-10-10-entre-nosotros/visual/venn3-320-light.png).
- Baseline: [mapa](assets/2026-10-10-entre-nosotros/visual/baseline-map10-1280-light-viewport.png)
  y [Gustos](assets/2026-10-10-entre-nosotros/visual/baseline-tastes-1280-light-viewport.png).

El [journal final de 30 estados](assets/2026-10-10-entre-nosotros/visual/visual-journal.json)
conserva las mediciones completas. Las capturas redundantes permanecen como
artefactos temporales de la sesión; no es necesario duplicar las 60 imágenes
en el repositorio para sostener los 30 estados medidos.

## Portada central del mapa móvil

La captura de página completa desde scroll 0 parecía no mostrar la portada a
320 px. El journal acredita imagen cargada, opacidad 1 y caja
`x=134,2; y=937,5; ancho=51,6; alto=65,6`: estaba dentro del escenario, pero coincidía
con la barra móvil fija del viewport de 1000 px al tomar esa captura.

Se repitió sólo esta comprobación en el mismo candidato, con scroll normal de
183 px. La portada queda en `y=754,5`, visible, sin filtro y con opacidad 1;
`elementFromPoint` en su centro devuelve un descendiente de la propia portada.
No se ocultó la navegación, no se cambió el encuadre por código de producto y
no se encontró clipping de la portada por el escenario.

[Captura móvil con scroll normal](assets/2026-10-10-entre-nosotros/visual/map10-320-light-canvas-viewport.png),
[medición e hit-test](assets/2026-10-10-entre-nosotros/visual/map10-320-cover-probe.json)
y [journal de la sonda](assets/2026-10-10-entre-nosotros/visual/map10-320-probe-journal.json).

## Regresiones E2E dedicadas

La primera ejecución sobre el candidato final terminó con **12 PASS y 3 FAIL
en 2,9 minutos**, un trabajador y cero reintentos. Pasaron los cuatro recorridos
de movimiento/rueda/táctil/foco, CRUD de diez personas, Gustos en tres tamaños,
conflicto entre pestañas, aislamiento/revocación/bloqueo/borrado y recuperación
de error de transporte, además del diagnóstico acotado de imágenes M3.

Los tres fallos midieron contratos del diseño anterior:

| Comprobación antigua | Resultado real | Diagnóstico |
|---|---|---|
| Span del nombre de Diana >40 px de alto | 26,375 px | El nombre está separado del control completo con avatar; no mide el objetivo táctil real. |
| Selector móvil >220 px de ancho | 186 px con nombre largo | La nueva fila en línea reserva espacio a editar/crear; la comprobación no contemplaba ese diseño. |
| Diez elementos `[data-compact]` | Once | El resumen central también usa ese atributo; no es una persona adicional. |

El autor de pruebas adaptó los selectores a los controles reales manteniendo
objetivos táctiles de 44 px, wrapping, bounds y todas las comprobaciones de
solapamiento. La revisión independiente aceptó esos cambios de instrumentación.

La segunda ejecución completa sobre **la misma build** terminó con **14 PASS
y 1 FAIL en 6,2 minutos**, un trabajador y cero reintentos. Pasaron la geometría
real de diez personas en 18 anchos de 365 a 1280 px y el tramo completo de HTTP
de 1.205 obras, sin prosa privada. Su [medición local](assets/2026-10-10-entre-nosotros/visual/volume-measurement.json)
registra 1.207 obras de catálogo, 1.292 registros de persona/obra, refresco de
3.798 ms y respuesta de acción sin comprimir de 361.170 bytes. Estas cifras
son de ese fixture local, no una estimación de rendimiento productivo.

El único fallo restante fue un timeout de 180 s en el caso de selector/foco/
episodios/exclusiones, después de acreditar selector, retorno de foco y el cambio
de muestra conjunta de 40 a cero episodios. El trace identifica exactamente
`call@2403`: esperaba pulsar «Comparar selección» tras un refresco que conservó
el Venn. La captura y el árbol accesible muestran «Volver al grupo», Venn y las
dos personas seleccionadas. El CTA se encuentra ahora dentro del mapa, por lo
que el test necesitaba volver al grupo por la navegación visible antes de
pulsarlo, también en su segundo tramo tras refrescar una región.

Se conserva este diagnóstico separado de los tres fallos de métricas anteriores.
Tras la revisión independiente, el test comprueba explícitamente que el refresco
conserva Venn/región, vuelve por los botones visibles al mapa y mantiene A/B
seleccionados. Su **repetición focal pasa 1/1 en 35,6 s** (caso 34,5 s), sobre
la misma build, un trabajador y cero reintentos. No se incrementa el timeout ni
se altera el producto, el backend o los datos para que pase.

El resultado local final comprende **14 PASS en la segunda ronda completa +
1 PASS focal posterior**, cubriendo los quince casos únicos; **no es una tanda
única local de quince PASS**. CI ejecutará el conjunto completo de forma
independiente antes de integrar. [Registro de candidato y rondas](assets/2026-10-10-entre-nosotros/visual/final-verification.json).

## Consola, red, limpieza y límites

La ronda visual final tiene cero excepciones JavaScript y cero respuestas
HTTP ≥400. Conserva dos avisos de registro de Service Worker bloqueado por
Playwright y trece solicitudes `ERR_ABORTED`. No se declara la red limpia.
La sonda móvil guarda su propio journal, sin sobrescribir la ronda de 30 estados.

El servidor registró `The destination stream closed early`, digest `3204442879`,
tanto en la ronda visual como durante E2E y la sonda. Se conserva como límite
preexistente de #1263, sin atribuirle una causa nueva. El `PT409 / Group changed`
del escenario de conflicto entre pestañas es la respuesta esperada de esa prueba.
El diagnóstico M3 no acredita que bloquear Service Workers resuelva todos los
fallos de imágenes; sigue vigente el alcance registrado en #1471.
El copy singular preexistente («1 obras»/«1 historiales») queda registrado en
[#1475](https://github.com/borjar20/Biblioshare/issues/1475); no se modifica en
este candidato visual congelado.

Tras la ronda visual, las dos tandas E2E, la sonda y el caso focal se verificaron **cero**
actores `qa_comp_motion_*`, libros, películas y series propios en la base local.
La limpieza REST elimina filas por sus identidades reconocidas y Auth por UUID,
antes y después de cada prueba. No se borraron cuentas persistentes ni datos
remotos. [Comprobación final de limpieza](assets/2026-10-10-entre-nosotros/visual/local-fixtures-cleanup.json).
El servidor propio quedó detenido y el puerto 3000 sin listener. El CLI retiró
exclusivamente el proyecto `biblioshare-local-5e2cc809` y sus seis contenedores/
volúmenes desechables, con `--project-id` exacto y sin `--all`; no quedan
contenedores corriendo. Se cerró la pestaña temporal usada para contrastar Sites.

Esta evidencia no acredita producción, otros navegadores, Android ni funcionamiento
offline. No se aplicó ninguna migración de esta revisión visual a una base remota.
