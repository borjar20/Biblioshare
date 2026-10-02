# Recolocación del desplegable de menciones — #765

> **[Canónico · código, unitarios y tres recorridos de geometría móvil/escritorio verificados localmente el 2026-10-02; CI pendiente]**

La lista ya elegía lado y alto al llegar los resultados. La reproducción del
hook confirma que un cambio posterior de tamaño o scroll conservaba esa
colocación, aunque el campo hubiera cambiado de posición. El parche vuelve a
medir mientras hay candidatos, sin llamar a la búsqueda ni reiniciar la
selección activa.

## Cambio y alcance

- `window.resize` y `window.scroll` en captura siguen también los contenedores
  de scroll: el evento de un sheet no burbujea.
- `VisualViewport.resize/scroll`, su `height` y su `offsetTop` describen el
  área visible cuando se recorta o desplaza sin cambiar `window.innerHeight`.
- Se agrupan los eventos en una medición por frame; una colocación idéntica
  conserva el estado. Al desaparecer la lista o desmontar se retiran las
  cuatro escuchas y se cancela el frame pendiente.
- Se conserva la medición antes del primer pintado, el anclaje relativo,
  el margen existente, la elección de lado y el máximo de 240 px.

El cambio de producto está sólo en
`src/components/social/use-mention-autocomplete.tsx`. No modifica los
composers ni los contratos de búsqueda, y no incorpora los problemas
independientes de #791/#844.

## Reproducción anterior al parche

El 2026-10-02 se creó primero
`src/components/social/use-mention-autocomplete.position.test.tsx`, usando el
hook real y una búsqueda controlada. Tras abrir con `@d`, se cambió el rect
del campo y se emitió un evento, sin modificar el token ni buscar de nuevo.

| Caso mínimo | Antes | Esperado |
|---|---|---|
| Resize: viewport 740→320, campo 120–160→190–230 | Conserva `top-full`, 240 px | `bottom-full`, 182 px |
| Scroll de contenedor: campo 550–590→70–110 | Conserva `bottom-full` | `top-full`, 240 px |

Resultado conservado antes de modificar el hook:

```text
Test Files  1 failed (1)
Tests       2 failed (2)
expected false to be true // Object.is equality
```

La ampliación anterior al parche dio **4 PASS / 7 FAIL**, añadiendo
VisualViewport, agrupación de eventos y retirada de escuchas. Los cuatro
controles que ya pasaban comprueban lista vacía y selección por Enter, Tab
y ratón.

| Artefacto local conservado | SHA-256 |
|---|---|
| `.scratch/mention765/unit-red.txt` | `9BE6042F4701488015D7B18C8CB096D0528E052B35E9926D2697B08CA1E09DDB` |
| `.scratch/mention765/unit-red-expanded.txt` | `A247F284A10B72276686249771B8BDBCC5490AFCF88B2E345DF952DD76729936` |
| `.scratch/mention765/typecheck-fail.txt` | `113D1C7B7C4839178B37F4F62B236A5D15F9E9E54C0570DA1975C222F2F484A1` |

El primer typecheck del parche señaló TS2769 en tres `removeEventListener`:
un objeto con sólo `passive` no comparte propiedades con
`EventListenerOptions`. Añadir `capture: false` a las opciones de las
escuchas sin captura resolvió el error; el typecheck posterior pasa.
Los logs completos son artefactos locales ignorados; los resultados,
síntoma, reproducción y hashes anteriores quedan registrados aquí.

## Verificación local ejecutada

Node **24.19.0**, Vitest **4.1.11**, un worker y sin paralelismo de archivos.

| Check | Resultado | Evidencia local |
|---|---|---|
| Hook y parser de token | **16 PASS, 0 FAIL, 0 SKIP** | `.scratch/mention765/unit-green-final.txt` |
| Lint de los cinco archivos de código/pruebas | **PASS** | `.scratch/mention765/lint-final.txt` |
| TypeScript del checkout | **PASS** | `.scratch/mention765/typecheck-green.txt` |
| `git diff --check` | **PASS** | Ejecución local |
| Recogida del spec por configuración CI | **3 casos listados** | `.scratch/mention765/e2e-list.txt` |
| Build/start local del candidato conjunto | **PASS**, build fresco `OoCu8n-Ri7vaoI-BoFqww` | `integration-1790941810044/build-result.json`, `build-identity.json` |
| E2E #765 original | **2 PASS / 1 FAIL**, 0 retries | Móvil 320/360 PASS; escritorio falló en una precondición, antes del scroll |
| E2E tras corregir la preparación compartida | **3 PASS, 0 FAIL, 0 SKIP, 0 retries** | Móvil 320/360 y escritorio; `ui-recovery-1790942887441/cases.json` |

La prueba del hook verifica resize, scroll de contenedor, altura y offset
del VisualViewport al abrir y al cambiar, una medición por frame, ausencia
de escuchas sin candidatos y limpieza/cancelación al cerrar o desmontar.
También conserva selección y foco después de recolocar, mediante flechas
con Enter/Tab y mediante ratón. Los eventos no vuelven a buscar.

```powershell
$node765 = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $node765 node_modules/vitest/vitest.mjs run src/components/social/use-mention-autocomplete.position.test.tsx src/components/social/use-mention-autocomplete.test.ts --maxWorkers=1 --no-file-parallelism
& $node765 node_modules/typescript/bin/tsc --noEmit
& $node765 node_modules/eslint/bin/eslint.js src/components/social/use-mention-autocomplete.tsx src/components/social/use-mention-autocomplete.position.test.tsx src/components/social/use-mention-autocomplete.test.ts e2e/menciones-desplegable-movil.spec.ts e2e/ci/menciones-desplegable-movil.spec.ts
```

## E2E preparado: contrato y limpieza

`e2e/menciones-desplegable-movil.spec.ts` contiene una sola suite, importada
por `e2e/ci/menciones-desplegable-movil.spec.ts`. El punto de entrada CI
rechaza URLs remotas o claves locales ausentes. El spec principal omite la
suite si falta el entorno local; no usa `.env` de dev ni la cuenta persistente.

Requiere Supabase local preparado, un build/start de esta revisión y las
variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` y `PLAYWRIGHT_BASE_URL` ya provistas por el runner.
La prueba crea siete cuentas nuevas (`role=user`, públicas y con onboarding),
seis candidatas con un prefijo único, un libro, un pensamiento y un comentario
propios. El contenido real por encima y debajo del composer permite desplazarlo
en escritorio sin cambiar CSS ni simular respuestas del producto.

Los tres casos previstos son:

1. Móvil de 320 px: altura 740→300, rotación a 740×320 y vuelta a 320×740.
2. Móvil de 360 px: altura 740→300, rotación a 740×360 y vuelta a 360×740.
3. Escritorio de 1280×900: scroll del campo entre los bordes, volteo arriba→abajo→arriba.

Se comprueban los cuatro bordes reales de la lista contra el área visible,
el ancho del documento, cambios del `max-height`, conservación del token y
ausencia de nuevas Server Actions durante los cambios geométricos. Móvil
selecciona una candidata real con clic; escritorio usa ArrowDown y Enter.
En ambos se verifica el valor resultante, el foco y el cierre de la lista.
Las cajas se adjuntan como JSON y se capturan las fases después del login.
Traces y capturas automáticas de login están desactivados.

En escritorio el campo se posiciona **después** de enfocar, abrir y comprobar
las seis identidades/orden de candidatos en el DOM. Se hace scroll nativo a
`y=720`, `y=100` y vuelta a `y=720`; antes de exigir el lado se verifica
el rect del campo, su foco, el hueco disponible en los dos lados y la variación
real de `window.scrollY`. Se adjuntan `desktop-anchor-lower`,
`desktop-anchor-upper` y `desktop-anchor-returned`, además de las cajas de
la lista. El autor tiene un username/nombre visible fuera del prefijo buscado.

La limpieza borra primero por REST el comentario, post y libro, filtrando
UUID y dueño/título; verifica propiedad de las cuentas mediante email y
marca antes de borrarlas, revoca globalmente las sesiones del actor que
inició sesión y comprueba Auth 404. Antes/después audita ocho tablas por
los UUID de usuario, los tres recursos y sus targets: doce superficies.

```powershell
& $node765 node_modules/@playwright/test/cli.js test e2e/ci/menciones-desplegable-movil.spec.ts --config=playwright.ci.config.ts
```

## Límites actuales

Los unitarios usan rects y VisualViewport controlados en JSDOM: verifican
la reacción del hook, no una caja producida por el motor de layout. Los dos
casos móviles y el escritorio pasaron contra build/start después de corregir
la preparación compartida. El escritorio original falló antes de probar el
scroll y se conserva. Los tres casos se repitieron porque el cambio de los
usuarios y del orden de candidatos afecta también a las aserciones móviles;
la revisión corregida del spec es `E53B0A…`. CI aún no ejecutada.

La reducción y rotación de Playwright son nativas del navegador. No abren
el teclado de un sistema operativo ni acreditan un dispositivo físico.
La ruta de VisualViewport se comprueba por unitarios; no se atribuye una
prueba de teclado real a esos controles.

## FAIL nativo conservado y corrección sólo del test

La tanda conjunta conserva su resultado original en
`.scratch/ticket-campaign/joint765-1025-633/integration-1790941810044/`.
`spec-copy-proof.json` acredita que el spec original `E59375…` se copió al
runner nativo sin perder assertions. La ejecución no reintentó ningún caso.

| #765, spec original | Resultado nativo | Duración |
|---|---|---|
| Móvil 320 px | PASS | 2272 ms |
| Móvil 360 px | PASS | 1969 ms |
| Escritorio 1280×900 | FAIL | 1807 ms |

El FAIL de `native-e2e/mentions-suite.ts:230` fue:

```text
expect(before.side).toBe("arriba")
Expected: "arriba"
Received: "abajo"
```

El adjunto `desktop-open` y su captura muestran la lista en
`top=495.25`, `bottom=697.25`, `left=283`, `right=507`, dentro del viewport
1280×900, con `maxHeight=240`. El test había desplazado el campo antes de
enfocar/teclear y no verificaba la posición tras abrir. Por eso el FAIL no
confirma una regresión de geometría ni alcanzó el cambio de scroll.

La captura también muestra al autor como primer candidato: `owner_${marker}`
contenía el término buscado por `ilike %query%`. El límite de seis dejaba
fuera una candidata, y la selección por ArrowDown no tenía el índice supuesto.
El test corregido mantiene al autor fuera del prefijo y exige las seis
identidades, en orden, mediante los textos reales del DOM.

Esta corrección toca sólo `e2e/menciones-desplegable-movil.spec.ts` y este
informe. El hook conserva su hash `4C9A2065…`. No sustituye el hook, la lista,
`getBoundingClientRect` ni `window.scroll`; no cambia CSS ni elimina las
assertions de ambos lados, scroll, acciones, token, clic móvil, ArrowDown/Enter,
valor seleccionado o foco. Lint focal del spec y `tsc --noEmit` pasan tras
la corrección. QA ejecutó después los tres casos corregidos sobre el mismo
build, sin modificar el hook ni reconstruir el producto.

La limpieza original de #765 está acreditada por `cleanup-after`:
`globalSignOut=true`, siete Auth 404 y doce superficies con cero filas.
La corrección del test conserva ese mismo contrato de limpieza.

| Artefacto original intacto | SHA-256 |
|---|---|
| `playwright.json` | `3DAE43513A11E584A86386E9E3C69904F9A5E6C3B2D9D7F4573CBD877D49A124` |
| `cases.json` | `7CB7C54EA8F9376ADC04496A4A3B1360162E34A281DEEACD0E52B08102009938` |
| `artifacts/menciones-desplegable-movi-34c99-croll-de-página-sin-teclear/desktop-open.png` | `41E9BABB02CEA35E669B36B462278E7AB702B5A2D0866EF6641F1DD8D4A47ECE` |

Para aislar el escritorio con el entorno local ya provisto:

```powershell
& $node765 node_modules/@playwright/test/cli.js test e2e/ci/menciones-desplegable-movil.spec.ts --config=playwright.ci.config.ts --grep 'en escritorio'
```

## Recuperación nativa verificada

`ui-recovery-1790942887441` ejecutó el spec corregido: móvil 320 px PASS
(2034 ms), móvil 360 px PASS (1716 ms) y escritorio PASS (1822 ms), sin
reintentos ni omisiones. El build `OoCu8n-Ri7vaoI-BoFqww` y el manifiesto de
Server Actions `3170a6efa5c0265498b57445430433b9ebc1e4d226e8207b7bbf452697c62e7b`
se conservaron. Se eliminaron los ocho actores de esa tanda conjunta, con
Auth 404, sign-out global y cero fixtures, sesiones, refresh tokens y cuotas
propios al terminar.

Esta tanda contiene además un FAIL del helper de restauración de estilos de
#1025; su resultado agregado sigue siendo **FAIL**, aunque los tres casos de
#765 son PASS. Los abortos de navegación sin clasificar siguen registrados en
#1301/#1263. El script opcional de Speed Insights se aisló expresamente durante
esta QA (#1306); ese aislamiento no demuestra que el SDK esté corregido.

Se conservan los 48 artefactos públicos y sus hashes en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/ui-recovery-1790942887441/`:
resultado `ab04da6852e5ebdaaa6644914252064650cdab32a580df4b0a560af0ecc2b82a`,
manifiesto `01c188cfb0bde3ad49beb3691136436c15c4c2ba16f78b11dce113b0f0984ecb`.

## Archivos de implementación verificados

| Archivo | SHA-256 |
|---|---|
| `src/components/social/use-mention-autocomplete.tsx` | `4C9A2065C589C286F07B37AECD6F4B753CAD751427C286E3951F500A9E64BDBD` |
| `src/components/social/use-mention-autocomplete.position.test.tsx` | `486DBB1E1F2DF882C7543417D01CBB3189311C142A3CE624C130FB0384A89911` |
| `e2e/menciones-desplegable-movil.spec.ts` | `E53B0A3403D6B14EB87217659C3E7BED349120B7F13764FBE696992328F7524A` |
| `e2e/ci/menciones-desplegable-movil.spec.ts` | `F1750A0B968DE618C4873400268051EDF5E6FECCB4BFB34DAE01701BD0B8DE9A` |
