# Foco visible de los radios de acento de saga — #1025

> [Verificado contra código y navegador local · 2026-10-02 · candidato conjunto base `2c133cf`; CI pendiente]

Las etiquetas de `AccentRadio` reciben un contorno de acento de 2 px, separado
2 px, cuando su radio nativo tiene `:focus-visible`. Se aplica a Automático y a
los cinco colores. El estado seleccionado conserva su borde y el valor vacío
sigue representando el acento automático.

Las comprobaciones estáticas y los cuatro recorridos reales han pasado en
tandas separadas sobre el mismo build. Las tandas fallidas se conservan; CI
sigue pendiente.
Issue: [#1025](https://github.com/borjar20/Biblioshare/issues/1025).

## Alcance confirmado

- Cambio de producto: `src/components/saga/accent-radio.tsx`, en sus dos
  etiquetas. Los controles siguen siendo radios nativos del mismo formulario.
- El diagnóstico original de ClassPicker ya estaba resuelto en el código:
  `src/components/pet/game/pet-game.module.css:376` contiene
  `.game label:has(input[type="radio"]:focus-visible)` con contorno dorado de
  2 px y separación de 3 px.
- Su descendencia efectiva se comprobó por lectura: `HatchForm` llega como
  `hatch` desde `src/app/mascota/page.tsx` y se monta dentro de `PetGame`; el
  otro uso está en `PetDetail`, montado en la sección de personaje del mismo
  `PetGame`. Ambos quedan bajo el `<div className={styles.game}>` del módulo
  CSS que declara la regla. Esto es evidencia estática de montaje, sin atribuir
  todavía un PASS de navegador a ClassPicker.

## Cobertura y resultado local

| Comprobación | Resultado |
|---|---|
| Vitest de AccentRadio, jsdom, un worker | PASS: 8/8, un archivo, 2,17 s |
| ESLint focal, incluido el spec nuevo | PASS, sin diagnósticos |
| TypeScript de todo el worktree, sin emisión ni caché incremental | PASS, sin diagnósticos |
| `git diff --check` | PASS |
| Playwright `--list`, configuración CI local | PASS: descubre 4 casos en un archivo |
| Build/start y recorridos reales | PASS funcional: tres casos originales y mobile/edit recuperado, sin retries ni skipped |

Los unitarios comprueban la selección inicial automática o por color, un único
radio nativo seleccionado y el valor enviado por FormData al volver de un
color a Automático. La regresión del foco vive en
`e2e/ci/saga-radio-focus.spec.ts`, porque jsdom no demuestra que se pinte CSS.

El spec permanente está incluido automáticamente por `playwright.ci.config.ts`:

- Creación con valor inicial automático y edición con verde persistido, en
  320 y 1280 px: cuatro casos.
- Entrada con Tab, recorrido completo con flecha derecha y vuelta al inicio;
  flecha izquierda, salida con Tab y reentrada con Shift+Tab.
- Comprueba `:focus-visible`, contorno computado sólido de al menos 2 px y
  separación de al menos 2 px sobre una etiqueta de tamaño visible. Las otras
  etiquetas deben carecer de contorno; también comprueba selección exclusiva
  y FormData. No compara nombres de clases CSS.
- Envía el formulario real: creación con púrpura y edición de vuelta a
  automático. Lee el valor guardado y vuelve a abrir el editor para comprobar
  la selección persistida.
- Cada caso dispone de un actor colaborador y una saga propios, con nombre
  aleatorio. Solo acepta Supabase local `http://127.0.0.1:54321`; limpia la saga,
  exige Auth 404 y comprueba que no quede el perfil. Adjunta muestras de foco,
  captura y limpieza. Las trazas están desactivadas para evitar guardar las
  credenciales del login.

## Checks reproducibles

Se usó Node `24.19.0`, ejecutable
`C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

```powershell
$runtimeNode = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $runtimeNode node_modules/vitest/vitest.mjs run src/components/saga/accent-radio.test.tsx --maxWorkers=1 --no-file-parallelism
& $runtimeNode node_modules/eslint/bin/eslint.js src/components/saga/accent-radio.tsx src/components/saga/accent-radio.test.tsx e2e/ci/saga-radio-focus.spec.ts src/lib/sagas/validate-sequence-draft.test.ts
& $runtimeNode node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
git diff --check
& $runtimeNode node_modules/@playwright/test/cli.js test --config playwright.ci.config.ts e2e/ci/saga-radio-focus.spec.ts --list
```

Para el listado se pasaron URLs de proceso locales y una clave ficticia:
no se ejecutaron fixtures ni consultas. La ejecución posterior necesita el
bootstrap local habitual y un build/start local de este cambio.

## Evidencia conservada y límites

Scratch propio: `.superpowers/brainstorm/2026-10-02/focus1025-r1/` y `focus1025-r2/`.
La primera revisión del fixture dio FAIL: ESLint confundió su callback `use`
con el hook de React (dos diagnósticos) y el helper genérico no admitía la unión
de respuestas de Auth (dos diagnósticos TypeScript). Se conservan fuente y logs
en `r1`; el callback pasó a `provide` y las respuestas de Auth se estrechan
explícitamente. Lint y TypeScript pasan en `r2`.

| Fichero final | SHA-256 |
|---|---|
| `src/components/saga/accent-radio.tsx` | `578f67a5c991ce94e96b3c7d61f8c2fb8d23d735a1c9fe45adc952563dbf1618` |
| `src/components/saga/accent-radio.test.tsx` | `a0498294df659fe5e0b8a25d52a1390ca6eba47a3d89c15b85fa16e1037a08da` |
| `e2e/ci/saga-radio-focus.spec.ts` | `88bdf362bb4e7cbe5470744122c9aeb939cf47f346a362e03223a37e5eed184f` |

## Navegador: resultados y límites

La tanda `integration-1790941810044`, build `OoCu8n-Ri7vaoI-BoFqww`, dio
PASS a creación móvil y creación/edición de escritorio. Mobile/edit completó
las nueve comprobaciones de foco, pero falló antes de guardar por exigir cero
desbordamiento global: el documento medía 352 px sobre un viewport de 320 px.
El botón «Crear y anidar» es el ofensor independiente registrado en #1311.

El spec conserva las comprobaciones de radio, selección, FormData y contorno;
añade que el contorno entero de cada muestra cabe dentro del viewport. El
desbordamiento del documento se adjunta como diagnóstico, porque se mantiene
antes del foco, con el contorno desactivado y tras restaurarlo. No se oculta
el botón ni se cambia CSS del producto para superar la prueba.

La tanda `ui-recovery-1790942887441` conservó otro FAIL propio del helper:
CSSOM convirtió un atributo `style` ausente en vacío al restaurarlo. El probe
aislado `outline-probe-1790943177287` distingue esos valores y verificó ocho
restauraciones. La recuperación `saga-helper-recovery-1790943291312` ejecutó
únicamente mobile/edit: **1 PASS, 0 FAIL, 0 SKIP, 0 retries**, 1881 ms en el
caso. Las nueve muestras comprobaron un contorno sólido de 2 px, separación
de 2 px y límites completos dentro de los 320 px; seis atributos se
restauraron exactamente. Guardado real de automático (NULL), lectura en BD y
reapertura conservaron la selección.

El build y su manifiesto de Server Actions se conservaron; todas las cuentas,
sagas, sesiones, refresh tokens y cuotas propios quedaron eliminados, con
sign-out global y Auth 404. Los tres PASS originales y el PASS recuperado
pertenecen a ejecuciones distintas: no se atribuye un único «4 PASS» a una
tanda. Las aserciones añadidas después sobre los otros tres casos quedan
pendientes de CI. La regla de ClassPicker se comprobó estáticamente; no se
añade una prueba nativa de ese control.

El audit agregado de la última tanda sigue **FAIL** por dos abortos sin
clasificar y `destination stream closed early` (#1301/#1263); el recorrido
funcional es PASS. Solo se aisló el script opcional de Speed Insights #1306.
Los archivos públicos se conservaron con hashes verificados bajo
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/`:

| Tanda | Resultado / manifiesto SHA-256 |
|---|---|
| `outline-probe-1790943177287` | `3279827d7af264dc728c7ae91f5b57aa27d636702bb07389b08e78acaef4a855` / `fbf37b0ab8393e2a88f386cca024515dbbbdcd463d71f52d6474e200d11020f2` |
| `saga-helper-recovery-1790943291312` | `a97380e34ea6617674e6ddb2bb2444b02de9aae1fe3ea89b40b4beddbf737c28` / `f6793491cfec981d77e1011464fd59fc086ec95e0aca5e80a8911fb5719480f5` |
