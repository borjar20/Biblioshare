# Novedades — verificación y alcance

> [Verificado el 2026-10-06: esquema local y biblioshare-dev, backend, controles unitarios y seis recorridos de navegador R3 con revisión independiente PASS. La red y el servidor conservan errores sin causa clasificada. Producción y publicación en GitHub no autorizadas en esta ejecución.]

Contrato de producto: [diseño acordado](../design/2026-10-06-novedades.md). Implementación en `codex/novedades`, aislada desde `origin/main` `bd98ec117567a45436cce4a6c18987d00814ddf7`. Implementación y revisiones delegadas con GPT-6.1 Sol, esfuerzo max, según la corrección del usuario.

## Comprobaciones

| Comprobación | Resultado y evidencia local |
|---|---|
| Backend, avisos, proveedor y escritor de pases | PASS: 171 pruebas / 14 archivos; `.scratch/novedades/backend-test-r9.log`. Tipos y lint finales PASS. |
| UI, formularios, acciones y navegación | PASS: 82 pruebas focales iniciales y 25 relevantes tras las correcciones del navegador; tipos y lint finales PASS. |
| Instalación vacía del esquema final | PASS: 302 pasos del manifest, transición local acreditada y contratos SQL completos; `fresh-replay-r1.log`, `fresh-activation-r1.log`, `fresh-verify-r2.log`. |
| Privacidad y avisos concurrentes | PASS: roles PostgreSQL reales, dos cuentas, claim y aceptación simultáneos, recuperación de leases, deduplicación, retirada del consentimiento y reloj civil de Madrid. |
| Edición y sincronización concurrentes | PASS: formularios antiguos no sobrescriben metadatos; intento antiguo de TMDB no rebobina fecha, revisión ni éxito de fuente. Probes del revisor y sesiones concurrentes reales. |
| Esquema en biblioshare-dev | PASS: cuatro migraciones aplicadas, contrato completo con UUID aleatorios y ROLLBACK, cuatro tablas/RLS, siete políticas, catorce funciones, firmas y grants por columna comprobados contra los objetos reales. `dev-apply-r1.json`, `dev-contract-r1.json`, `dev-metadata-r1.json`. |
| Tipos de aplicación/local/dev | PASS: 69 comprobaciones de superficie nueva; `types-comparison-dev-r1.md`. |
| Seguridad de dev | PASS de delta: cero hallazgos nuevos ni retirados frente a la línea base; `security-advisor-delta-r1.json`. No declara resueltos los avisos anteriores. |
| Compilación de producción local | PASS final con Next 16.3.8/Webpack y Node 24.19.0; `build-webpack-r3.log`. Turbopack rechaza el junction de dependencias fuera de su raíz: `build-r2.log`, sin modificar paquetes ni configuración. |
| Navegador R1 | FAIL conservado: 3 PASS / 3 FAIL, seis casos, cero reintentos. Los filtros fallan en el matcher de la etiqueta anidada; el control real sí tiene nombre accesible Mercado. La retirada cancelada se comprueba antes de recibir respuesta, durante Guardando. `e2e-r1.log` y `e2e-r1-artifacts/`. |
| Navegador R2 y revisión visual | Runner 6 PASS; revisión independiente FAIL: el selector conserva España tras navegar al mercado internacional. `e2e-r2.log`, `ui-review-r2.md`. El PASS del runner no cierra ese hallazgo. |
| Regresión del mercado internacional | RED real contra build R2: esperaba INT y recibió ES durante 33 lecturas. `e2e-market-red-r1.log` y sus artefactos preservados. |
| Navegador R3 final | PASS: 6/6 E2E en 25,6 s, 390/1280 px, sin reintentos ni skip. Revisión independiente de seis trazas, DOM nativo, capturas y persistencia PASS; `e2e-r3.log`, `ui-review-r3.md`, `ui-review-r3-artifacts/`. |
| Limpieza final | PASS: nueve superficies de datos propios a cero; cero listeners en 3000, contenedores y volúmenes propios. `cleanup-r3.json`, `cleanup-final-r1.json`. Worktree activo y cambios ajenos preservados. |

Los artefactos completos están en `.scratch/novedades/`, excluido de Git. Se conservan los cortes FAIL y los informes independientes; las correcciones usan nuevos nombres de evidencia. La revisión R1 del esquema tuvo contexto nuevo; su R2 la realizó el autor del backend, que no escribió SQL, reutilizando su contexto por el límite de hilos. La revisión del backend la realizó el autor del esquema, que no escribió ese backend. UI, i18n y cobertura tuvieron revisores separados con contexto nuevo; no se presenta la revisión R2 del esquema como un segundo contexto nuevo.

## Hallazgos corregidos

- R1 del esquema: revisión de avisos insuficiente para proteger correcciones editoriales simultáneas, e intento TMDB antiguo que podía sobrescribir uno reciente. Se separa el token exacto `updated_at` de la revisión del evento y se exige el intento vigente bajo bloqueo. R2 del revisor PASS.
- R1 del backend: primera serie anunciada sin fecha descartada y alta a Pendiente que podía reiniciar un pase concurrente. Se conserva el anuncio internacional sin fecha y se añade `requireAbsent` al escritor canónico; cualquier pase existente queda intacto, incluida la carrera posterior a la lectura. R2 independiente: nueve probes PASS. El comportamiento predeterminado de las demás transiciones se conserva.
- R1 del navegador: etiqueta de filtros explícita y confirmación visible al retirar el aviso de un lanzamiento cancelado, con barrera de persistencia en la prueba; R3 PASS.
- R2 de la revisión visual: el formulario nativo conservaba el filtro previo tras cambiar la URL. Se remonta con la selección confirmada de la ruta, conservando la edición todavía no enviada. La prueba durable comprueba URL, tipo y valor INT en las dos anchuras; RED contra R2 y GREEN en R3.

## Qué acredita el navegador final

Los seis casos cubren Explorar público a 390/1280 px, selección personal de dos cuentas, Pendiente y avisos separados por modalidad, publicación de un libro sin ISBN y con mes, cancelación/retirada, rechazo de un formulario editorial antiguo y cron → campana → enlace directo internacional con deduplicación y retirada. No hay desbordamiento horizontal en las comprobaciones públicas.

El filtro INT final tiene imagen, DOM real y aserciones de los selects en ambas anchuras. La confirmación de retirada de un lanzamiento cancelado y el aviso de la campana se acreditan por DOM real y comprobaciones persistidas; sus últimos screencasts aún capturan Guardando/Cargando y no se presentan como imágenes finales del éxito. El destino del aviso sí está capturado. Informe R3 SHA-256: `12580FE718D8DB92634214BE1FEE98AF69D09747DAF8318541859B4E09A7E357`.

## Red y servidor: límite conservado

Las seis trazas finales contienen cero errores de consola y cero `pageError`, pero 34 solicitudes con status -1: 16 `ERR_ABORTED` explícitos y 18 sin respuesta completa al cerrar la traza. El log conserva tres `The destination stream closed early`, digest 1269780123. El único rechazo HTTP inventariado es el 401 deliberado del cron. Las comprobaciones funcionales y de persistencia pasan; no atribuyen una causa a cada petición incompleta ni declaran la red global limpia.

Las familias de cancelación siguen rastreadas en [#1263](https://github.com/borjar20/Biblioshare/issues/1263) y [#1301](https://github.com/borjar20/Biblioshare/issues/1301). Su identidad de causa con los cierres de esta ejecución no está demostrada; no se cierran ni se presentan como arregladas.

## Límites y entrega posterior

La selección TMDB es acotada; no promete todos los estrenos. Los libros necesitan publicación y revisión manual por administración. La ausencia en el proveedor no se interpreta como cancelación. Una fecha internacional no acredita disponibilidad española ni una plataforma digital.

La aceptación del aviso acredita una notificación persistida en la campana. Web Push sigue siendo un transporte de mejor esfuerzo: no se ha probado recepción en un dispositivo y no se promete exactamente una entrega. Un fallo tras aceptar en la campana y antes del envío puede perder el push.

El recorrido de cron del navegador omite la fuente externa mediante una última sincronización satisfactoria sintética; prueba endpoint protegido, cola, campana, enlace, repetición y retirada. La integración TMDB se cubre con respuestas simuladas y unitarios, sin una consulta autenticada real al proveedor en esta ejecución.

El navegador no acredita selección por seguimiento de sagas/series, fechas anuales, errores del proveedor, portadas remotas o ejecución real del scheduler. Los unitarios y contratos SQL pertinentes conservan su alcance sin convertirlo en observación de navegador.

El job `cultural-releases` nace inactivo. Su activación exige que el endpoint esté desplegado y que el destino sea el correcto; el `app_base_url` existente en dev no se presupone de desarrollo. No se leen ni cambian secretos. No hay migraciones, datos, scheduler ni aplicación modificados en producción.

La publicación del código y el pase a producción requieren sus autorizaciones independientes. Tras el rechazo inicial de la revisión automática, el usuario autorizó únicamente el ticket de seguimiento: [#1423](https://github.com/borjar20/Biblioshare/issues/1423), creado y verificado el 2026-10-06 con área catálogo, tipo feature y prioridad P3. Su contenido coincide con `.scratch/novedades/pending-github-issue.md`; recibo local `github-issue-1423-r1.json`. Esta aprobación no incluye publicación del código ni producción. El worktree conserva el cambio sin commit para esa revisión. Los cambios preexistentes del checkout principal permanecen intactos. Se han detenido únicamente los servicios de pruebas propios y retirado sus volúmenes; la cuenta persistente `codex_qa` de dev permanece intacta.
