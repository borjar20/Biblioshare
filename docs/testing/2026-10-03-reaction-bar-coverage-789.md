# ReactionBar: cobertura de componente — #789

> **[Informe de verificación · código y pruebas locales verificados el 2026-10-03 sobre `d9c2246512d605a1936fb8dd23eb44a66fee4b06`; candidato pendiente de revisión e integración]**

Los cuatro contratos de [#789](https://github.com/borjar20/Biblioshare/issues/789) quedan cubiertos por **nueve pruebas de componente**. La tanda final pasa **38/38 pruebas en cuatro archivos**; un control idéntico para los mutantes pasa **9/9**. Ocho mutaciones aisladas producen **17 fallos de comportamiento**, con el producto original intacto. TypeScript y lint pasan.

La condición histórica «cuando main tenga runner de .test.tsx» ya estaba satisfecha: el diagnóstico previo verificó Vitest/jsdom/Testing Library y su uso real en CI. Este cambio añade la cobertura que seguía pendiente, sin modificar el runner ni dependencias. No se cierra la issue desde esta implementación.

## Qué se prueba

La única fuente de test nueva es [`src/components/social/reaction-bar.test.tsx`](../../src/components/social/reaction-bar.test.tsx). Monta **ReactionBar real**, `NextIntlClientProvider` con los mensajes reales, `next/dynamic`, **EmojiPicker real**, su catálogo y los helpers reales. `onToggle` es un callback observable del consumidor, no una sustitución del comportamiento interno de la barra.

| Contrato | Casos y contraste |
| --- | --- |
| Colapsado: tres emojis y total completo | Cuatro emojis con cuentas distintas; aparecen `❤️ 📖 🔥`, se excluye `🦊` y el total es **21**, incluidos los dos votos de la cuarta reacción |
| Clic: carácter exacto a `onToggle` | Fila rápida (`❤️`, con selector de variación), reacción existente (`🦊`) y búsqueda/selección en el catálogo real (`🐙`); se verifica una llamada y su argumento |
| Seis propias: nuevos disabled, propios utilizables | Fila rápida y catálogo real; se bloquean emojis nuevos y ajenos, el clic bloqueado no invoca el callback y una propia sigue permitiendo su retirada. Control con **cinco propias y 50 votos ajenos**: el nuevo emoji se puede elegir |
| Escape: cierre y restitución de foco | Desde un botón de la fila rápida y desde el buscador del catálogo. El foco se coloca y verifica dentro del panel antes de Escape; después no hay diálogo, `aria-expanded=false`, el foco está en el disparador y no se emite una reacción |

Las aserciones observan contenido, botones, callback, diálogo y foco. No recalculan el resultado mediante `summarize`/`capReached`, ni invocan métodos privados. Los fixtures son literales y los handlers se ejercitan mediante eventos DOM.

## Frontera simulada y límites

La única frontera simulada es `HTMLCanvasElement.getContext`, que devuelve `null`: jsdom no tiene rasterizador de glifos. Así se utiliza la degradación real del detector de soporte; no se sustituye `isEmojiSupported`, el catálogo, el picker, los helpers ni `next/dynamic`. Se restaura el spy y se desmonta el árbol después de cada caso.

Esto comprueba los contratos del componente síncrono. No acredita tipografía/renderizado de glifos del dispositivo, geometría/estilos del popover, distribución del chunk en un build, persistencia remota de reacciones ni un recorrido de navegador. No se ejecuta el e2e con servicios de `e2e/reacciones-emoji.spec.ts`. La guía local de Next (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) mantiene el límite de Vitest para renderizar Server Components async; ReactionBar es un cliente síncrono y ese límite no bloquea estos casos.

## Sensibilidad de la versión final

Cada mutante conserva una copia exacta del test final y del picker. Sólo se cambia una expresión de **una copia de ReactionBar en scratch**; el consumidor original y sus colaboradores permanecen intactos. El control scratch usa la misma configuración y pasa los nueve casos. Los fallos de esta tabla proceden de las aserciones del contrato, no de errores de importación, entorno o sintaxis.

| Mutante final | Resultado y causa |
| --- | --- |
| `mutant-collapsed-all-03` | **1 FAIL**: aparece el cuarto emoji que debía ocultarse |
| `mutant-collapsed-visible-total-01` | **1 FAIL**: el total visible baja a 19; falta el 21 esperado |
| `mutant-toggle-wrong-character-03` | **6 FAIL**: el callback recibe `❌` en lugar del carácter elegido |
| `mutant-cap-new-enabled-03` | **2 FAIL**: los nuevos botones quedan habilitados con seis propias |
| `mutant-cap-own-disabled-01` | **2 FAIL**: se bloquean también las propias |
| `mutant-cap-premature-01` | **1 FAIL**: el nuevo emoji se bloquea ya con cinco propias |
| `mutant-escape-stays-open-02` | **2 FAIL**: Escape conserva el diálogo abierto |
| `mutant-escape-no-focus-01` | **2 FAIL**: al cerrar, el foco queda en body y no vuelve al disparador |

## Checks ejecutados

Runtime explícito: **Node v24.19.0**, ejecutable `C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`. No se usa el shim de npm ni se instalan paquetes.

| Gate | Resultado |
| --- | --- |
| `reaction-bar.test.tsx` | **9 PASS**, cero FAIL/SKIP |
| `reaction-display.test.ts` | **8 PASS** |
| `emoji-catalog.test.ts` | **10 PASS** |
| `emoji-support.test.ts` | **11 PASS** |
| Control scratch del test final | **9 PASS**, cero FAIL/SKIP |
| Ocho mutantes finales | **17 fallos causales**, todos con salida de Vitest 1 |
| `tsc --noEmit --incremental false` sobre el checkout completo | **PASS**, sin emitir fuentes ni caché incremental |
| ESLint del test nuevo | **PASS**, cero diagnósticos |
| Espacios/finales de línea en las dos fuentes nuevas | **PASS**, sin diagnósticos; `git --no-index` devuelve 1 por el contenido añadido, corroborado con el escaneo de las dos fuentes |

Las invocaciones exactas, configuración efectiva, JSON de Vitest y logs están bajo la raíz del repositorio:

```text
.scratch/ticket-campaign/20261002-resolve-all/runner789-implementation-20261003/attempt-20261003152428Z/
```

El wrapper de control importa la configuración real del proyecto, mantiene su root y añade ubicación de caché en scratch, `envDir=false`, un worker y ejecución serial. Los mutantes resuelven `@/` contra las fuentes originales y montan el test/picker copiados. No se ejecutaron suites completas por rutina.

Se conservan los intentos previos fallidos: una importación nativa de configuración con ruta Windows en vez de URL `file:`, el localizador `🦊 2` que no coincidía con el nombre accesible real y el nombre de catálogo supuesto `cara de zorro` en vez de `zorro`. Se corrigieron sólo el harness/localizadores y se repitieron en rutas nuevas. **No se cuentan como RED causales** los mutantes de esos intentos con un control inválido. El primer check `git diff --no-index --check` devolvió 1 por la comparación de contenido añadido y mostró únicamente el aviso LF/CRLF; se conserva sin atribuirle un defecto de espacios.

## Entrega

Propiedad limitada al test nuevo y a este informe. Producto, mensajes, helpers existentes, dependencias, `.env`, esquema, fuentes de #901 y documentos canónicos compartidos quedan sin editar. No se ha detectado un bug actual del producto. No se levantaron servicios, build, navegador ni DB, y no se hicieron commit/push/PR/comentarios/cierres remotos.

Los hashes de las dos fuentes finales, de las dieciséis fuentes protegidas antes/después y de todos los artefactos se publican en el sello local. El checkout permanece en `codex/reaction-bar-coverage-789`, HEAD `d9c2246512d605a1936fb8dd23eb44a66fee4b06`. El coordinador sincroniza `docs/TESTING.md` y decide revisión, integración con el main posterior y CI antes del cierre de la issue.
