# Recursos: publicación después del guardado (#1328)

> **[Histórico · candidato local verificado el 2026-10-03; revisión independiente y QA nativa final pendientes]**

El candidato conserva el último valor guardado mientras IndexedDB confirma un
cambio. Si el guardado falla, permite continuar en memoria y avisa de que los
últimos cambios se perderán al salir, recargar o cerrar.

## Diagnóstico conservado

Dos recorridos nativos anteriores mostraron Oro `6` y restauraron `5` al
recargar inmediatamente. El último conserva la secuencia causal: revisión
durable `10` con valor `5`, apertura de una nueva transacción y solicitud `get`,
banco `6` visible, recarga 4 ms después y `pagehide` con esa transacción aún
pendiente. No se observó su `put` ni su `complete`; el nuevo documento leyó de
nuevo la revisión `10` y mostró `5`. No se atribuye el fallo a CAS, cuota ni
modo privado.

El informe sellado anterior vive en la raíz de campaña:
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/alias-resources-native-1791037489506/resources-causal-diagnosis.json`,
SHA256 `66bd02844ff5f5cee006c498d6d58f1974f886fc7d0e57fa099a096b64e6b557`.
El build anterior fue `vk0dxnMykxanh8hNm62zS`; sus FAIL y artefactos no se cambian.

## Cambio y decisión

`useResources` activa el `publishAfterPersist: true` existente y expone
`CompanionPersistence`. El core, el adaptador IDB, el reducer, las revisiones y
el CAS permanecen intactos. El ACK procede de `tx.oncomplete`, no de iniciar
una transacción ni de completar un `put` aislado.

La pantalla anuncia `pending`, `saved` o `memory`. Sólo deshabilita el
fieldset de configuración mientras guarda: ese editor calcula valores
absolutos a partir del snapshot publicado. Los controles de deltas del tablero
y deshacer siguen disponibles y el core compone sus eventos desde el head
lógico, aunque el banco visible siga mostrando `5`.

Mantener pulsado conserva su vista previa provisional y emite un único delta
al soltar. Esa vista previa termina al confirmar el gesto: mientras el guardado
sigue pendiente vuelve a mostrarse el valor durable. No se cambia el hook de
repetición ni la identidad del editor de #1007.

La única copy nueva está bajo `play.resources.persistence` en `messages/es.json`:

- `pending`: «Guardando los recursos…».
- `saved`: «Los recursos están guardados en este dispositivo.».
- `memory`: «No se han guardado los últimos cambios de los recursos. Puedes
  seguir aquí, pero esos cambios se perderán al salir de esta pantalla,
  recargar o cerrar.».

## Verificación local del candidato

Base congelada `256eb5cdf4361ba79a7ef9210acf3b31b04ccca3`, rama
`codex/resources-durable-updates-1328`, Node `24.19.0`. Evidencia fuera del
checkout en
`.scratch/ticket-campaign/20261002-resolve-all/resources1328-implementation/candidate-1791039685222/`.

| Gate | Resultado | Alcance |
| --- | --- | --- |
| RED previo a producto | 10/10 FAIL semánticos | Nuevos hook y screen; fuente y resultados conservados |
| GREEN de Recursos | 37/37 PASS | 6 nuevos hook, 4 nuevos screen, 7 editor #1007 y 20 reducer |
| Suite compartida | 20/20 PASS | Sólo se adapta el caso que exigía Recursos optimista; se conserva su RED anterior |
| TypeScript | PASS | `tsc --noEmit --incremental false` |
| ESLint | PASS | Hook, screen y tests propios; caso compartido y nuevo spec nativo |
| Discovery nativa | 5 casos | Playwright `--list`, config real sin `webServer`; no ejecutados |

Las pruebas unitarias usan `useResources`, el core y el reducer reales. La única
frontera controlada es fake-indexeddb: se mantiene una transacción con
solicitudes reales o se llama a `abort()`. Cubren `5→6` pendiente/ACK/remontaje,
deltas acumulados y undo antes del ACK, rechazo antes de hidratar o por payload
inválido, fallback visible y recuperación de `5`, callbacks de una identidad
anterior, espera de una escritura aceptada al remontar y el gesto repetido de
un solo evento.

La primera RED se conserva por separado: un helper de timers incompleto hizo
que el caso de hold y el siguiente acabasen con fallo de harness. La RED
posterior corrigió sólo ese helper, aún antes de tocar producto, y produjo los
10 FAIL semánticos. También se conserva el primer FAIL de tipos: `exact` es una
opción de Playwright, no de Testing Library; quitar esa opción del test no
cambia su comparación por nombre. No se sustituyen esos intentos por los PASS.

## Gate nativo pendiente

`e2e/ci/resources-persistence.spec.ts` prepara cinco casos independientes,
anónimos y con IDB propio del contexto:

1. Inicio Oro `5→6`, ACK nativo anterior al banco, recarga inmediata y registro
   exacto restaurado, a 320, 390 y 1280 px.
2. Transacción nativa retenida: banco `5`, configuración pendiente, deltas y
   undo utilizables; al liberar, ACK y banco `7`, seguido de recarga inmediata.
3. Cierre de la conexión nativa del contexto: `InvalidStateError`, aviso claro,
   controles utilizables en memoria y recarga que recupera `5`.

La revisión r2 añade sólo dos capturas del mismo estado en memoria a 320 y
1280 px para revisar la legibilidad del aviso. Vuelve a 390 px antes de la
recarga ya existente; no añade gestos de datos ni cambia sus asserts. El sello
r1 de 205 archivos permanece íntegro y se referencia desde el recibo r2.

En los casos de confirmación, `expect(banco).toHaveText(...)` y `page.reload()`
son adyacentes. No hay sleep, lectura IDB, evaluate, captura ni drenaje de
eventos entre ambos. El observador conserva los resultados y excepciones de
las APIs nativas; sólo el caso controlado retiene una transacción real. Los
registros, revisiones, tiempos y eventos se adjuntan sin credenciales.

El recorrido natural original de #1007 y el observador causal anterior
permanecen idénticos. La QA final debe ejecutarlos contra el candidato después
de la revisión independiente y de integrar la base actual. `--list` y los
unitarios no prueban todavía Chromium ni el empaquetado de producción.
La auditoría global de red sigue siendo un dictamen separado; ninguna acción,
respuesta HTTP 200 o fallo de navegación se reclasifica aquí.

No se arrancó ningún servicio, build, navegador ni backend, no se crearon
actores ni datos remotos y no se leyeron/escribieron `.env`. No hay commit,
push ni cambio canónico en esta fase.

## Sincronización canónica propuesta al coordinador

Tras revisión y QA final, registrar una decisión append-only sobre el opt-in
de Recursos, la cola de deltas y el bloqueo acotado de configuración; actualizar
el mapa de arquitectura y el contrato de pruebas que aún describen Recursos
como optimista; cerrar #1328 sólo con evidencia nativa del gesto original y del
fallback. Es una propuesta: este candidato no modifica esos documentos.

## Verificación coordinada posterior — 2026-10-03

Revisión del coordinador sin hallazgos. Cinco casos durables, recorrido natural original y dos permanentes #1007 PASS, sin retries, en build nuevo w0fPfzXH53lyqUsYDgEfX, HEAD e22afd7de6731f751b9dac6dc6e1e369a26f2e48/base4a/backend273. Recorrido original: ACK revisión11/evento86 antes del banco6/evento87 (1,1ms), reload27ms después, pagehide sin transacciones activas y restauración exacta. Son mediciones de ese recorrido, no plazos garantizados.

Antes de ejecutar, r3 corrigió sólo el oráculo de cola: banco7 podía verse en una revisión intermedia. Se espera saved antes del último banco7; recarga adyacente, producto y recorrido natural intactos. Candidatos anteriores y diff conservados.

Las ocho capturas originales se revisaron. memory320/fullPage y memory390 estaban desplazadas y no acreditaban legibilidad. Un contexto nuevo, sin modificar esas capturas ni producto, confirmó aviso completo a320/390 con scroll0, sin overflow ni oclusión de cabecera: visual independiente PASS. La original1280 también muestra el aviso completo.

Evidencia pública en la raíz de campaña qa-evidence/resources1328-final-native-1791045239755/:307 archivos exactos, manifiesto8e7b9dfc6ee73f2acba2c993a85424772d490056dc905adea28eff5d0368a531. Fuentes y895 artefactos previos intactos, cleanup real PASS, datos/cuentas/sesiones propios0 y servicios parados con backup.

Auditorías de Recursos PASS. La del original de Colecciones conserva FAIL separado #1301, sin reclasificar por ActionID/200. Main avanzó con Experiencias (#1323): se integra maina0b0 más commits #789/#662/#746 con ascendencia real, once blobs propios idénticos y tres keys de Recursos conservadas junto al nuevo español. Nueva QA del lote actual y CI completa son gates antes del merge.


## Gate de integración actual — 2026-10-03

Nueva build zOSPb8W0Exp_IruBgC7iv de HEAD 9a3f13a749d178e12c443b80d7c2a4b85b18eb77, con base main a0b0e031/Experiencias y backend local 282: 9/9 recorridos funcionales PASS, cero reintentos, SKIP o flaky. Cinco casos de persistencia de Recursos, dos del editor y dos de Colecciones (nuevo y original). Tipos y lint PASS; 95 unitarios focales PASS en nueve archivos. El recorrido natural original previo conserva su resultado en build w0f; no se vuelve a declarar ejecutado en esta tanda.

ACK de revisión 8: evento 70 anterior al banco/evento 71 a 320, 390 y 1280 px. Con transacción retenida, ACK de revisión 11/evento 97 anterior al banco/evento 98; la cola pendiente acaba vacía. Los tests conservan recarga adyacente tras la aserción del banco. El fallback continúa utilizable en memoria y restaura el último valor durable tras recargar.

Auditoría global FAIL conservada: POST #22 de /partidas/recursos y #59 de /coleccion se corresponden con pullPendingCelebrations según el índice de esta misma build; POST #38 de /login queda fuera del probe, sin atribución. Los tres siguen UNCLASSIFIED: no hay recibo RPC/filas por petición. #22 empezó y falló antes del ACK retenido, por lo que no se atribuye a la recarga final. #1301 y #1334 permanecen abiertos; identificar la acción o recibir HTTP 200 no acredita inocuidad ni pérdida.

Evidencia local sellada: resources-coverage-current-native-1791046824201/final-public-manifest.sha256.json, 173 archivos, SHA-256 a7d1bdca4d9821971beaeba05439a04a927eef6c6c513fd7cc418db44dd7d8d5. Se preservan 2012 inputs, 23 fuentes congeladas y los 307 artefactos de la tanda previa. Infra/probe/cleanup PASS; actores eliminados con Auth404 y nueve tablas vacías por actor, seis tablas de Experiencias vacías, Next cerrado, puerto 3000 libre y Supabase parado con backup normal de 282 pasos. Son recibos de cierre de esa tanda; otro gate local puede utilizar después el backend.

CI de publicación exigida en la PR. Estos datos acreditan el contrato local de Recursos; no acreditan salud global de la acción de celebraciones ni almacenamiento remoto.
