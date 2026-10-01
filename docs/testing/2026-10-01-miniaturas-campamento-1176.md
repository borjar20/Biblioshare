# Miniaturas completas del Campamento (#1176)

> **[Evidencia · verificada el 2026-10-01]**

La miniatura del arroyo forzaba 3/4 y `object-fit: cover`, aunque su lámina
mide 280×380. Ahora `height: auto` conserva la proporción nativa que declara
la imagen. Las otras cuatro miniaturas mantienen su tamaño proporcional.

La regresión de navegador mide la imagen cargada y compara su altura con
`ancho × alto_nativo / ancho_nativo`, con tolerancia de un píxel. No comprueba
una declaración CSS: detecta el recorte real al abrir la tienda a 320 px.

| Comprobación | Antes | Después |
|---|---|---|
| Error de altura respecto a la proporción nativa | FAIL: 5,9866 px | PASS: 0,00223 px |
| Tres E2E de tienda y concurrencia | — | PASS, 3/3, 5,1 s |
| Build de producción y TypeScript | — | PASS, 73 páginas |
| Lint de la prueba modificada | — | PASS |

Dimensiones medidas tras corregirlo: 251,21875×340,9375 px; lámina natural
280×380. La captura de la miniatura muestra la lámina completa. Compra,
elección, recarga y ausencia de desborde pasan; dos compras con saldo para
una y dos recogidas de bienvenida conservan la idempotencia.

Build: `8YE5QAuVCXvO6b0ZCncvv`. Artefactos locales ignorados en
`.scratch/ticket-campaign/qa1176-local/`: `baseline.log`,
`baseline-error-context.md`, `build.log`, `after.log`, `after.json`,
`metrics.json` y `creek-thumbnail.png`. El FAIL previo se conserva.

Comandos reproducibles con Node soportado y la CLI local fijada:

```text
node scripts/ci-local.mjs shop e2e/mascota-tienda.spec.ts
node scripts/ci-local.mjs build
node scripts/ci-local.mjs shop
node node_modules/eslint/bin/eslint.js e2e/mascota-tienda.spec.ts
```

Las cuentas desechables se eliminan por sus IDs de Auth en `finally`.
El servidor de prueba se detuvo al terminar. No hay cambios en las láminas,
el escalado del Campamento, los precios ni la base de datos.
