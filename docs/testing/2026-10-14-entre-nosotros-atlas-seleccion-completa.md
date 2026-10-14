# Entre nosotros: selección completa, grupos pequeños y Otros

> **[Evidencia local · 2026-10-14]** Correcciones sobre `56f4e4f2` en [PR #1529](https://github.com/borjar20/Biblioshare/pull/1529). Integración y despliegue en producción pendientes.

## Comportamiento verificado

- **Quién:** todo grupo compartido, también de una o dos obras, dibuja su cifra y un hilo hacia cada dueño en el zoom del mapa. Si queda apagado conserva cifra e hilos tenues. Las obras de una sola persona siguen junto a su polo y se reconocen por su posición y color. Se conserva la reagrupación y el movimiento de la entrega anterior.
- **Opinión, Tiempo e Islas:** con A+B+C activas solo entran obras de las tres. AB, AC y BC se recuperan desmarcando la persona restante. Una selección vacía no compara nada; Tiempo/Islas con una cara muestran sus obras y Opinión pide al menos dos.
- **Opinión:** exige una nota explícita de cada cara seleccionada. Si C tiene la obra pero no la ha valorado, no se presenta la comparación A/B como una comparación de las tres.
- **Tiempo:** conserva las fechas disponibles de obras comunes a todas; una fecha ausente no se inventa ni convierte la obra en una de pareja. El resumen excluye esas obras del cálculo de primeras llegadas y cuenta las ausencias.
- **Otros:** distingue obras fuera de las diez islas principales, obras sin autor/director identificado y series que no se agrupan por autor/director. En género distingue límite y género ausente. La explicación usa los mismos motivos y recuentos en mapa y lista; no afirma que todas las obras de Otros carezcan de metadatos.

## Criterio de autor/director

Las categorías se obtienen de créditos canónicos con identidad y nombre: autores de libros y directores de películas. Las series no forman categorías de autor/director. No se utiliza el texto libre de `books.author` o `movies.director` como identidad de persona.

Se dibujan las diez categorías principales entre las obras de la selección. Una obra entra en Otros únicamente si ninguna de sus categorías está entre las elegidas; con varios autores basta uno elegido para que no entre en Otros. Cada obra de Otros aporta exactamente un motivo y se cuenta una sola vez. No cambian consultas, top diez, créditos, esquema, RLS ni caché.

## Verificación

| Comprobación | Resultado |
|---|---|
| Regresiones antes del arreglo | Ocho fallos de selección completa y dos de pintura de grupos pequeños; cinco fallos de motivos de Otros. |
| Unidad final | `npx vitest run src/lib/comparisons src/components/comparisons --maxWorkers=1 --no-file-parallelism`: **36 archivos, 387 pruebas PASS**, 33,99 s. |
| TypeScript | `npx tsc --noEmit`: exit 0. |
| Lint focal | `npx eslint src/lib/comparisons/atlas src/components/comparisons/atlas` y `npx eslint e2e/entre-nosotros-atlas.spec.ts`: exit 0. |
| Build | `npm run build`: exit 0; **`h2QPPzSuMTZo3PSJxKcph`**, 89 páginas estáticas. |
| Revisión independiente | Sin hallazgos accionables; auditoría de cobertura sin nuevos huecos significativos. |
| Navegador de producción | **Siete casos únicos PASS** sobre la misma build: cuatro en Chromium de escritorio y tres en Chromium móvil. Runner dedicado `playwright.comparisons.config.ts`, un worker y cero reintentos. |
| Selección mixta | Regiones AB de una obra, AC/BC de dos y ABC de tres. En Quién: cifras `1, 2, 2, 3` y nueve curvas reales. Opinión, Tiempo e Islas: mapa, lista y resumen excluyen parejas con ABC activas y las recuperan al desmarcar C. |
| Datos ausentes | Una ABC sin nota de C se excluye de Opinión. Otra ABC sin fecha de C conserva las fechas A/B, informa la ausencia y la hoja móvil muestra «Carlos QA: sin fecha». |
| Otros a 360 px | Once autores canónicos: el undécimo aporta una obra por límite; veinte obras sin crédito identificado y una serie completan Otros. Las 22 obras y los tres motivos coinciden en mapa/lista, sin scroll horizontal ni solape con el dock. |
| Densidad | Diez caras activas y cuatro géneros muestran solo las tres obras comunes a las diez: cuarenta medias con muestra de tres notas; nombre de 80 caracteres íntegro en lista, sin scroll horizontal. |
| Sesión y limpieza | Login real de actores desechables; smoke de lectura con devtest PASS, sin crear grupo. SQL de dev confirma cero usuarios, perfiles, libros, películas, series, personas y créditos propios restantes; devtest continúa público. Servidor detenido y puerto 3000 libre. |

La primera tanda de unidad detectó un mock de canvas incompleto: el caso de portadas no devolvía un degradado válido, porque antes los grupos de una obra no tenían halo. Se corrigió el mock y se repitió la tanda completa, sin modificar el pintor para acomodar la prueba.

La tanda inicial de escritorio obtuvo tres PASS y un fallo del selector del harness de Otros: intentaba localizar la región de lista dentro de su propia sección. Se corrigió a la sección padre del encabezado, conservando las aserciones de producto; su repetición focal obtuvo PASS. Móvil obtuvo tres PASS. No se presentan estas tandas como una sola ejecución de siete pruebas ni se cuenta la repetición como un caso nuevo.

Los registros [inicial de escritorio](assets/2026-10-14-atlas-seleccion/chromium-ronda-inicial.json), [Otros focal](assets/2026-10-14-atlas-seleccion/chromium-otros-focal.json), [móvil final](assets/2026-10-14-atlas-seleccion/mobile-ronda-final.json) y [smoke de devtest](assets/2026-10-14-atlas-seleccion/devtest-smoke.json) conservan cero errores de consola o excepciones de navegador en los seis recorridos instrumentados y el smoke, pero también peticiones `ERR_ABORTED` de navegación/prefetch. Al detener el servidor se recogió `The destination stream closed early`, digest `254889757`, sin fallo de las aserciones del flujo. No se afirma que toda la red o los logs del servidor estén libres de errores. El caso existente de Tiempo/Islas pasa sin journal propio.

## Capturas

- [Quién: cifras e hilos de grupos de una y dos obras, móvil](assets/2026-10-14-atlas-seleccion/mobile-quien-grupos-uno-dos.png).
- [Opinión: selección de las tres personas](assets/2026-10-14-atlas-seleccion/mobile-opinión-abc.png) y [cruce A+B al desmarcar C](assets/2026-10-14-atlas-seleccion/mobile-opinión-ab.png).
- [Tiempo: obras comunes a las tres](assets/2026-10-14-atlas-seleccion/mobile-tiempo-abc.png).
- [Otros: tres causas a 360 px](assets/2026-10-14-atlas-seleccion/mobile-otros-tres-causas-mapa.png) y [explicación en la lista](assets/2026-10-14-atlas-seleccion/mobile-otros-tres-causas-lista.png).
- [Cuatro islas con diez personas](assets/2026-10-14-atlas-seleccion/mobile-islas-cuatro-diez-personas-nombre-largo.png).

Las imágenes muestran únicamente datos desechables de QA. La captura aportada por el usuario y el smoke de su cuenta persistente no se publican como imágenes de evidencia. Android físico no forma parte de este gate.
