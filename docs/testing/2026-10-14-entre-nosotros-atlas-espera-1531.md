# Entre nosotros: sincronización del gate del atlas (#1531)

> **[Evidencia local · 2026-10-14]** Corrección del harness en `codex/entre-nosotros-items-grandes`, [PR #1530](https://github.com/borjar20/Biblioshare/pull/1530). Los resultados remotos se registran en la PR. Se reutiliza la build **`lC6hCPgn3mzY1Vt5aWBWu`** de `cb20867f`: no cambian fuentes de producto.

La [ejecución fallida de CI](https://github.com/borjar20/Biblioshare/actions/runs/38600157318/job/115977204290) abrió otra obra tras desmarcar una persona. La traza confirma que la aserción de reposo terminó a `31792,021 ms` con `moving=false`; a `31796,605 ms` ya era `true`. La sonda conservaba las coordenadas anteriores y el clic llegó durante la transición. El [extracto de la traza](assets/2026-10-14-atlas-espera-1531/ci-race-timeline.json) conserva tiempos y coordenadas, sin credenciales.

Cruzar dos frames antes de mirar el indicador corrige esa carrera, pero las primeras repeticiones descubrieron otra en la preparación: se iniciaba el zoom antes del commit de la URL del grupo recién creado. La carga RSC posterior refrescaba el snapshot y recreaba el canvas. Una traza muestra el vuelo a zoom 1,626 sin `group` en la URL y el retorno a 0,284 al completarse `?group=…`. El test también debe esperar esa navegación y la carga de datos.

La espera común observa un canvas cargado, cruza dos RAF y acepta el reposo solo si sigue conectado el mismo canvas, `aria-busy=false` y `data-atlas-moving=false`. Un montaje o carga durante la muestra obliga a repetirla. El alta espera la URL con el UUID del grupo antes de interactuar. El helper de zoom comprueba el umbral también después del reposo. Se mantienen la obra esperada, tolerancia de cámara de 0,01, plazos y ausencia de reintentos automáticos. Hit testing, geometría, cámara y consultas del producto conservan su implementación.

| Ronda | Resultado |
|---|---|
| CI original | Comparaciones: 34 PASS, 1 FAIL, 11 skips de plataforma. El fallo de retorno abrió otro UUID. |
| Barrera de frames inicial, sin esperar URL/carga | **2 FAIL + 1 PASS**; las trazas mostraron pérdida de zoom por la segunda carga del alta. Se conservan las métricas iniciales. |
| URL/carga y barrera de frames: retorno/cámara/selección ×3 | **3/3 PASS**, 56,2 s, un worker, sin retries; zoom guardado/restaurado **2,572 → 2,572** y 30 obras visibles en las tres repeticiones. |
| Tamaño, densidad y notas; escritorio/móvil | **5 PASS + 1 FAIL**, 2,9 min. El fallo adicional es un POST real con HTTP 200 que tardó **49,07 s**, superando la espera de carga de 20 s. Seguimiento separado en [#1532](https://github.com/borjar20/Biblioshare/issues/1532). |
| Repetición única de tamaño en Chromium | **PASS**, 27,7 s, sin cambios de código, expectativas ni timeout. Las rondas quedan separadas en los assets. |
| Espera atómica final sobre el mismo canvas: retorno ×3 | **3/3 PASS**, 1,1 min; zoom **2,572 → 2,572**, 30 obras visibles en las tres, cero errores de consola y cero respuestas HTTP ≥400. Refinamiento revisado para cubrir montajes durante la espera. |
| Tipos, lint y descubrimiento | TypeScript, ESLint del spec y diff-check exit 0. Config dedicado: **46 casos en dos archivos**; el descubrimiento no acredita ejecución. |
| Consola/red y limpieza | Sin errores de consola; cancelaciones de navegación registradas. SQL final: usuarios, perfiles, libros y pases QA a cero; `devtest` público. |
| Entorno | Servidor detenido, cero listeners en 3000. El servidor emitió el cierre de stream ya registrado en #1263, digest `254889757`; se distingue de la consola del navegador. |

Los JSON de cada ronda y los extractos sanitizados están en [assets](assets/2026-10-14-atlas-espera-1531/). Los datos son desechables. El gate usa login, acciones y Supabase dev reales; solo se intercepta el asset de portada. Las repeticiones con tracing amplían evidencia del navegador sin modificar el estado del producto.
