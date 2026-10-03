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
