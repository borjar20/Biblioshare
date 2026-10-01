# Listeners retenidos en Gzip (#1251)

> **[Evidencia · verificada el 2026-10-01 · diagnóstico confirmado]**

El caso original de recuperación de 940 películas terminó con código 0, pero
emitió doce `MaxListenersExceededWarning` de Gzip en 52,533 s. La traza sitúa
el alta en `ServerResponse.on` del middleware `next/dist/compiled/compression`
y en el control de backpressure del renderer de Next. Build de referencia
`8YE5QAuVCXvO6b0ZCncvv`, Node 24.19.0 y Next 16.3.8.

## Causa aislada

Un repro sin navegador, base ni red usa el middleware real de Next, un
`IncomingMessage` y un `ServerResponse`. Registra trece `once('drain')` y
emite los trece eventos. Cada callback se ejecuta, pero quedan trece wrappers
en Gzip; `response.off('drain', handler)` tampoco retira el handler añadido.
Con `Accept-Encoding: identity` se ejecutan los trece callbacks y quedan cero
listeners. Se reproduce en Node 24.19.0 y 23.11.0.

El override de `on` desvía las altas a Gzip; el target de los wrappers sigue
siendo ServerResponse y su `removeListener` actúa en el emisor equivocado.
No hace falta que la respuesta se cierre antes de `drain`. Es el mismo
desajuste descrito en [compression #152](https://github.com/expressjs/compression/issues/152).
No se ha comparado en esta comprobación con Next 16.3.0 ni se ha medido un
crecimiento acumulado de RAM; la retención de listeners sí está demostrada.

## Solución y contrato

`compress: false` evita el middleware defectuoso en el proceso Next. La
compresión pública la hace el CDN de Vercel. Es una opción soportada para un
servidor que ya dispone de compresión externa:
[Next, compress](https://nextjs.org/docs/app/api-reference/config/next-config-js/compress),
[Vercel CDN](https://vercel.com/docs/how-vercel-cdn-works).
No se aumenta el límite, se silencia el aviso ni se parchea `node_modules`.

Local y cualquier `next start` aislado quedan sin compresión; fuera de Vercel
se exige proxy/CDN que negocie br/gzip sin bufferizar streaming y prueba en
ese hosting: verificar codificación y llegada del shell antes de resolver una
frontera Suspense con retraso controlado. Content-Encoding no demuestra por
sí solo ausencia de buffering, y aquí no se verifica otro hosting.
El gate local no prueba el encoder de Vercel: exige aparte
HTTP 200, HTML completo y codificación br/gzip negociada en el preview exacto
y producción, más la respuesta sin codificación al pedir `identity`.

El wrapper de CI falla ante ese aviso específico aunque Playwright pase.
La suite crítica conserva el caso de 940 películas, que ejercita el flujo
original. El repro directo de la dependencia sigue rojo: no se afirma que
su implementación haya sido reparada.

Artefactos ignorados, conservados bajo `.scratch/ticket-campaign/qa1251-local/`:

- `full-1790847546712/`: FAIL diagnóstico, testExit 0 y doce trazas.
- `minimal-1790848101262/`: trece listeners retenidos frente a cero.
- `minimal-1790848573590/`: mismo fallo con Node 23.11.0.
- `baseline-1790848708984/`: producción anterior, br 10.553 bytes y HTML
  decodificado 77.354 bytes; identity 77.354 bytes, ambos HTTP 200.

## Candidato verificado

Build `jhKYS7nl4MzAz9b4PEkge`: compile 3,2 s, TypeScript 4,2 s y 73 páginas,
PASS. Lint de los dos archivos de código, PASS. Smoke completo: siete tests
en 65,457 s, PASS, incluido el caso original de 940 películas, con cero
avisos Gzip. Artefacto `full-1790848996802/` con log y resultado del wrapper;
no se reutiliza ningún servidor ni cuenta remota.

El guard se ejecuta con el código real del wrapper y salida capturada del
rojo: convierte testExit 0 en exit 1. También permite una salida limpia y un
warning de otro emisor. Tres controles PASS en `guard-1790848905040/`.
Una revisión independiente confirma el desajuste de emisores y el contrato
de compresión externa; su verificación HTTP no se sustituye por el smoke local.

Los resultados HTTP del preview y de producción se añaden tras verificarlos.
