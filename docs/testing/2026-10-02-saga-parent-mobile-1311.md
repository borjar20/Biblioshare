# #1311 — Crear y anidar cabe en el editor móvil

> **[Histórico · congelado el 2026-10-02; código, checks estáticos y dos recorridos de navegador verificados ese día]**

El campo para crear un universo padre permite reducir su ancho dentro de la
fila, y el botón conserva el espacio necesario para su texto. El editor
mantiene la misma acción inmediata y el campo recibe un nombre accesible a
partir de su texto ya existente. No cambia copy, esquema, permisos ni caché.

## Diagnóstico y baseline conservado

La QA compartida de la campaña reproduce un desbordamiento en el editor de
una saga manual sin padre a 320 × 844 px. El documento tiene scrollWidth
352 y clientWidth 320: 32 px de exceso. El único control fuera del viewport
es «Crear y anidar», de x=269 a x=352,265625, ancho 83,265625; su fila va de
x=16 a x=304, ancho 288 px.

Los nueve controles de foco de aquella pasada mantienen su indicador. El
desbordamiento existe antes del foco, con los outlines desactivados y tras
restaurarlos. Esa comparación acota la causa a la fila de creación, cuyo
campo conserva su mínimo intrínseco en flex; no atribuye el fallo al foco ni
acredita un baseline medido en producción.

La primera evidencia se conserva en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/integration-1790941810044/`.
La recuperación conserva el FAIL y su prueba geométrica en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/saga-helper-recovery-1790943291312/`.
Sus archivos se han leído y sus huellas SHA256 se han comprobado:

- `manifest.sha256.json`:
  `f6793491cfec981d77e1011464fd59fc086ec95e0aca5e80a8911fb5719480f5`.
- `result.json`:
  `a97380e34ea6617674e6ddb2bb2444b02de9aae1fe3ea89b40b4beddbf737c28`.

## Regresión durable

`e2e/ci/saga-parent-mobile.spec.ts` añade dos recorridos, 320 × 844 y
1280 × 900, contra Supabase/Auth locales reales y la aplicación completa.
El spec rechaza otro destino de base de datos. Cada recorrido inicia sesión
con un actor temporal collaborator, crea la saga manual desde la aplicación
y abre la URL real de edición sin padre.

Comprueba la fila vacía, campo con nombre y foco por teclado, y botón con
foco por teclado. Documento y body deben caber sin tolerancia añadida; la
fila tampoco puede tener scrollWidth superior a clientWidth. Los controles
y el texto del botón deben quedar dentro de sus cajas, con 0,5 px de margen
para coordenadas fraccionarias. También se rechaza recortar la fila y se
comprueba que el indicador de foco siga visible.

Activa «Crear y anidar» con Enter y comprueba nombre canónico, nueva saga
manual y parent_saga_id de la hija. Recarga la página y exige de nuevo la
relación en UI y en la base local, con el nombre de la hija intacto. La
prueba no simula login, acciones, base de datos ni respuestas del producto.

La limpieza REST se ejecuta antes y después, por nombres exactos con un
identificador aleatorio de esta invocación. Conserva la identidad de los
UUID encontrados, rechaza filas no manuales e hijas ajenas y comprueba que
no queden sagas, actor Auth ni filas del actor en ocho tablas. Publica
`cleanup-before.json`, `cleanup-after.json`, medidas y capturas del editor;
no conserva credenciales en traces o capturas de login. El coordinador puede
activar `QA1311_FIXTURE_REGISTRY` y `QA1311_OUT` para guardar la planificación
y el recibo de limpieza fuera del informe de Playwright.

## Verificación de esta entrega

- Node 24.19.0.
- ESLint focal del componente y el spec: PASS, cero diagnósticos.
- TypeScript del proyecto con `--noEmit --incremental false`: PASS.
- `git diff --check`: PASS.
- Navegador contra un build nuevo: 2 PASS propios, sin retries ni skipped.

| Viewport | Resultado | Comprobaciones completadas |
|---|---|---|
| 320 × 844 | PASS | Fila vacía, campo y botón con foco visible y sin desbordar; creación con Enter, relación REST y recarga |
| 1280 × 900 | PASS | Las mismas comprobaciones, incluida la persistencia del padre y del nombre de la hija |

La pasada `integration-1790944752297` usó el build fresco de producción
`1ZoZ14Zb9TbyLBvQW8yRJ`, con manifiesto de acciones SHA256
`e2c6b91cac181c68f0b2d848826c3f012153c926d31be60a1091790a02aae5b7`.
Las fuentes se mantuvieron idénticas antes y después: componente
`b114bb2f1456c1ed48d7f43fa8540ac45be74725658f01c88a8c2c451cb3305f`
y spec `731535a4814dc4eba1c6824573b4957965c6a895cab0fc8a2c48f9cefa2f6cb0`.
Los dos casos duraron 2948 y 2629 ms, respectivamente, y no registraron
errores del producto en el recorrido. La observación de SDK encontró cero
scripts o peticiones de Speed Insights; no se sustituyó el SDK por un NOOP.

La limpieza confirma el actor Auth ausente (404), cero filas suyas en las
ocho tablas auditadas y cero sagas de los cuatro nombres exactos usados.
El puerto 3000 quedó libre, Next detenido y Supabase detenido con su parada
normal que conserva backup. Las evidencias públicas están archivadas en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/integration-1790944752297/`:

- `cases.json` y `playwright.json`: estados nativos y geometría por etapa.
- `artifacts/`: capturas del botón enfocado y del editor tras recargar.
- `cleanup-2852b96f-7032-4cee-90a2-8628b2e67eb8.json`: recibo de limpieza.
- `result.json` SHA256:
  `d424cdb7bafa40c9933476838ff0f6a2d71f65cadfa7e4e32195112105883931`.
- `manifest.sha256.json` SHA256:
  `2dec9fd2d7ef6c58f575fd600a3142f26cded0b792a54c1d253f89a80557c02e`.

## Límite de la tanda compartida

El resultado global original sigue siendo **FAIL**: 9 PASS / 2 FAIL entre
once casos, sin retries, flaky ni skipped. Fallaron el guard de Speed
Insights por una petición RSC de login cancelada (`net::ERR_ABORTED`) y el
helper de puntuación por comparar `-4` con el signo tipográfico `−4`.
La auditoría global conserva otras peticiones RSC canceladas, incluidas
algunas sin clasificación. No hubo errores de página, consola o HTTP ni
errores de hidratación o ejecución en el servidor.

Los dos casos propios de #1311 pasaron completos en esa misma tanda. Ese
resultado acredita el arreglo geométrico y el flujo real probado, sin
convertir el FAIL de la campaña en PASS ni atribuir a #1311 los fallos de
los otros recorridos. La evidencia es local; no acredita una comprobación
visual posterior en producción.

El spec entra en el config CI por vivir en `e2e/ci`; no se modifica la
configuración del workflow. Para ejecutarlo con el entorno local preparado:

```sh
npm run test:ci:smoke -- saga-parent-mobile.spec.ts
```

El FAIL original de desbordamiento queda acotado por el baseline conservado
y las dos regresiones propias completas. El FAIL global de la tanda se
mantiene con su evidencia y límites.
