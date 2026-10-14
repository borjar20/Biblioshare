# Entre nosotros: ítems más grandes y portadas antes

> **[Evidencia local · 2026-10-14]** Candidato en `codex/entre-nosotros-items-grandes`, desde `main` `e567e4fd` ([PR #1529](https://github.com/borjar20/Biblioshare/pull/1529) integrada). Publicación e integración de este ajuste se registran en su nueva PR.

Los puntos y las portadas crecen un 40 % sobre su escala anterior. Opinión y Tiempo activan las portadas con zoom mayor que **0,6**, frente a **1,1**; cuando se activan, su ancho mínimo es **12 px** y conservan la proporción. Quién/Islas mantienen el umbral 1,1 y los títulos el 3,2.

La geometría se comparte entre dibujo, interacción y descarte fuera del lienzo. Las portadas responden en su rectángulo completo, incluidas esquinas; los puntos conservan hit circular. El mínimo táctil es 10 px desde el centro, con selección por centro más próximo y empate hacia la última aparición. Una obra parcialmente visible se sigue dibujando también con zoom alto. Dos tamaños se calculan una vez por frame y la compartición una vez por sincronización, sin objetos nuevos por cada ítem.

| Comprobación | Resultado |
|---|---|
| Regresión antes del arreglo | Ocho fallos reales de Canvas: aparición a 0,7, aumento de tamaño, esquinas y portadas parcialmente visibles a zoom 16. |
| Unidad final | `npx vitest run src/lib/comparisons src/components/comparisons --maxWorkers=1 --no-file-parallelism`: **37 archivos, 409 PASS**, 33,78 s. Incluye presupuesto del motor con contexto simulado, sin acreditar GPU ni móvil físico. |
| Tipos y lint | `npx tsc --noEmit`, ESLint de atlas y spec, `git diff --check`: exit 0. |
| Build | `npm run build`: exit 0; **`1eZQUvRfb9pmQ6CDhUlLz`**, 89 páginas estáticas. |
| Baseline | Build anterior **`BCib195qC4SLImf_BoE68`**: cuatro lentes en escritorio y móvil; sin portadas en Opinión/Tiempo a 0,7. |
| Candidato | **Cuatro casos únicos PASS** (dos en Chromium y dos en Pixel 7), 1,1 min, un worker, sin reintentos/skips. Focal móvil a 360 px repetido PASS, 21,5 s, misma build; no se cuenta como quinto caso único. |
| Umbral | A 0,7 aparecen portadas de 12 px en Opinión/Tiempo; Quién/Islas siguen como puntos. En Tiempo se observan 90 apariciones de 30 obras. |
| Tamaño al mismo zoom | A 1,4: Opinión pasa de ≈14 a ≈19,61 px de ancho; las otras lentes, de ≈11,76 a ≈16,46 px. A 0,5: radios observados de ≈3 a ≈4,2 px y de ≈3,45 a ≈4,83 px, respectivamente. |
| Interacción | A 3,4, clic/toque en la esquina de portadas de ≈47,6×69 px (Opinión) y ≈40×58 px (Tiempo) navega a la obra correcta o abre su hoja. |
| Densidad | Treinta notas iguales siguen superpuestas: antes eran puntos; ahora son portadas apiladas. Resumen, intersección y lista conservan las 30 obras. No se cambian jitter, notas, fechas, layouts ni sus coordenadas. |
| Móvil | 390 y 360 px, portadas de al menos 12 px y sin scroll horizontal. |
| Limpieza | SQL dev confirma usuarios, perfiles, libros y pases QA a cero; devtest público. Servidor detenido y sin listener en 3000. |

Las comparativas usan el mismo zoom, pero UUID distintos y ancla elegida desde la sonda: los encuadres no son idénticos y no acreditan cambios de posición. El harness móvil tuvo que compensar el delta de rueda dividido por el DPR emulado; el fallo inicial de preparación no produjo cambios de aplicación.

Capturas: Opinión [antes](assets/2026-10-14-atlas-items-grandes/mobile-antes-opinion-07.png) y [después](assets/2026-10-14-atlas-items-grandes/mobile-despues-opinion-07.png); Tiempo [antes](assets/2026-10-14-atlas-items-grandes/mobile-antes-tiempo-07.png) y [después](assets/2026-10-14-atlas-items-grandes/mobile-despues-tiempo-07.png); notas iguales [antes](assets/2026-10-14-atlas-items-grandes/mobile-antes-opinion-densa-07.png) y [después](assets/2026-10-14-atlas-items-grandes/mobile-despues-opinion-densa-07.png). Todos son datos desechables y una portada de fixture. Métricas y limpieza en la misma carpeta.

Consola sin errores ni fallos de red distintos de `ERR_ABORTED` de navegación/prefetch, conservados en los JSON. Al cerrar la primera sesión del candidato se recogió `The destination stream closed early`, digest `254889757`; no se afirma una auditoría global de transporte limpia. El gate usa login, acciones y datos reales de Supabase dev y solo intercepta el asset de portada.

Se conservan caché de 300 portadas y 24 peticiones por frame. El riesgo preexistente de autodesalojo con más de 300 portadas diferentes visibles sigue en [#1524](https://github.com/borjar20/Biblioshare/issues/1524): el umbral menor puede exponerlo antes. Esta fixture comparte portada ([#1527](https://github.com/borjar20/Biblioshare/issues/1527)), por lo que no acredita ese estrés. FPS de Android físico siguen fuera del gate ([#1521](https://github.com/borjar20/Biblioshare/issues/1521)). Sin cambios de consultas, esquema, RLS ni caché de datos.
