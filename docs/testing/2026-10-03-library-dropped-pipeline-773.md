# Cobertura del pipeline de abandonados — #773

> **[Informe de verificación · 2026-10-03]** Candidato local de cobertura; fuentes de producto intactas. No acredita integración ni CI.

## Resultado y alcance actual

Los 16 casos nuevos pasan contra los tres consumidores reales. La pasada focal, que añade los tests existentes de biblioteca, ocultación y colecciones, pasa **38/38 pruebas en cuatro ficheros**. Seis mutaciones independientes sobre copias scratch producen fallos de aserción causales; el control con copias equivalentes pasa 16/16.

La [issue #773](https://github.com/borjar20/Biblioshare/issues/773) y la spec de agosto describían búsqueda, género y límite como un pipeline común de los tres consumidores. Las firmas actuales, verificadas en la base `0c22a6049bb8882f07a67569b7f8ea72a75b7d88`, acotan ese contrato:

| Consumidor | API actual | Regla defendida por estos tests |
|---|---|---|
| `getLibraryView` | `LibraryQuery`: búsqueda, género, orden, estado, límite y ocultación | D3: contar abandonados después de búsqueda/género, también combinados. D4: ocultar antes del límite, con `total` y `hiddenDropped` de la población completa filtrada. |
| `getUncollectedItems` | `userId`, `limit`, `hideDropped` | Excluir miembros de colecciones antes del contador; ocultar antes de recortar para llenar el límite con visibles. `total` queda antes del límite. |
| `getCollection` | `userId`, `id`, `hideDropped` | Hidratar, ocultar y contar los abandonos reales; devolver elementos y media coherentes con los visibles. |

`getUncollectedItems` no expone búsqueda ni género. `getCollection` no expone búsqueda, género ni límite. No se añaden parámetros ni variantes D3/D4 ficticias a esas APIs. El código actual manda sobre la descripción histórica; el comentario de cierre debe reflejar esta acotación.

## Frontera y oráculos

El único fichero de pruebas añadido es `src/lib/library/get-library-items.pipeline.test.ts`. Ejecuta `getLibraryView`, `getUncollectedItems`, `getCollection`, `hydrateItems`, la carga de géneros, el vocabulario y `splitDropped` reales; no usa mocks de esos módulos ni espías sobre el orden interno.

El fake recibe consultas de lectura y aplica proyección, filtros, orden, rango y `maybeSingle` sobre tablas locales coherentes. Comparte las mismas claves entre `passes`, catálogo, reseñas, colecciones y pertenencias. La población tiene tres abandonados anteriores a tres visibles; sus títulos y géneros permiten distinguir búsqueda sola, género solo y ambos juntos. Las notas visibles son 1, 3 y 5; los abandonados tienen 5. Las expectativas comprueban identificadores, títulos hidratados, contadores, totales y medias, no las llamadas del fake.

Casos nuevos:

- **Biblioteca: nueve.** Búsqueda, género, combinación, búsqueda sin coincidencias; límite de dos con tres abandonados anteriores y límite cero; control de mostrar abandonados; estado explícito `dropped`; población no vacía sin abandonos.
- **Sin colección: cuatro.** Llenado del límite tras excluir la colección y ocultar; exclusión de un abandono y un visible ya coleccionados; control de mostrar abandonados; población sin abandonos y total previo al límite.
- **Colección: tres.** Ocultación, contador y media visible; control de los seis títulos con media conjunta; colección sin abandonos. El primer caso añade un miembro de catálogo sin pase activo: la hidratación real lo descarta y no debe contarlo como abandonado.

## Sensibilidad causal conservada

Cada mutación dispone de sus dos consumidores copiados, configuración, hash, informe JSON de Vitest, log y resultado del proceso en su propia ruta. Sólo se cambian esas copias. Las importaciones relativas se redirigen a la biblioteca real para que el resto del pipeline siga ejecutándose. La misma infraestructura, sin cambiar la semántica, pasa el control 16/16.

| Copia scratch | Resultado | Diferencia observada |
|---|---|---|
| `00-control` | PASS: 16/16 | Configuración e importaciones equivalentes. |
| `01-library-count-before-filters` | RED: 4 FAIL / 12 PASS | Contador 3 en vez de 2 para búsqueda o género, 3 en vez de 1 combinados y 3 en vez de 0 sin resultados. |
| `02-library-limit-before-hide` | RED: 2 FAIL / 14 PASS | Límite dos devuelve `[]` en vez de dos visibles; límite cero pierde los totales de la población. |
| `03-uncollected-limit-before-hide` | RED: 4 FAIL / 12 PASS | Los abandonados consumen las plazas; también se trunca el total previo al límite. |
| `04-uncollected-count-before-membership` | RED: 2 FAIL / 14 PASS | Incluye el abandono ya coleccionado: contador 3 en vez de 2. |
| `05-collection-count-before-hydration` | RED: 1 FAIL / 15 PASS | Cuenta como abandonado el miembro sin pase activo: 4 en vez de 3. |
| `06-collection-average-before-hide` | RED: 1 FAIL / 15 PASS | Media 4 en vez de 3 aunque la lista oculta los abandonados. |

Los 14 fallos conservados son `AssertionError`; no son errores de sintaxis, importación, entorno o conexión. No se detectó un fallo del código actual ni se mezcló un arreglo de producto con esta cobertura.

## Checks y reproducción

Runtime explícito: `C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` (Node 24). Se usaron los paquetes ya disponibles mediante el `node_modules` del checkout; no hubo instalaciones.

Desde la raíz del checkout, con ese ejecutable:

```text
node_modules/vitest/vitest.mjs run src/lib/library/get-library-items.pipeline.test.ts src/lib/library/get-library-items.test.ts src/lib/library/hide-dropped.test.ts src/lib/library/collections.test.ts --maxWorkers=1 --no-file-parallelism
node_modules/typescript/bin/tsc --noEmit --incremental false
node_modules/eslint/bin/eslint.js src/lib/library/get-library-items.pipeline.test.ts --max-warnings 0
```

| Check | Estado |
|---|---|
| Nuevo fichero de pipeline | PASS, 16 pruebas. |
| Pasada focal de cuatro ficheros | PASS, 38 pruebas. |
| Control scratch | PASS, 16 pruebas. |
| Seis mutaciones causales | PASS del gate de sensibilidad: las seis quedan RED con 14 fallos de aserción esperados. |
| TypeScript sin emisión ni caché incremental | PASS. |
| ESLint focal, cero avisos | PASS. |
| Integridad de fuentes de producto y whitespace | PASS; comparación final en la evidencia sellada. |
| Suite completa, build, navegador, DB y servicios reales | SKIPPED; no pertenecen al alcance de esta cobertura de funciones de lectura. |

No se arrancaron servidores ni watchers, no se leyeron secretos y no se realizaron escrituras remotas, commits ni publicación. La prueba local no acredita RLS, comportamiento de PostgREST real ni paginación a gran escala; el fake cubre la semántica de lectura necesaria para esta población. La integración y sus checks quedan a cargo del coordinador.

## Evidencia y preservación

La evidencia nueva está fuera del checkout, en la raíz compartida:

```text
.scratch/ticket-campaign/20261002-resolve-all/pipeline773-implementation/attempt-20261003T134901Z/
```

Incluye `mutation-summary.json`, los siete directorios de control/mutación, logs y JSON de los checks, snapshots originales, `verified-sources.json` y `final-artifact-manifest.json`. `run-scratch-mutations.mjs` reproduce únicamente las copias scratch y `run-focal-check.mjs` contiene los argumentos exactos de los checks locales. El manifiesto final registra bytes y SHA-256.

Antes de cambiar `coverage1307` a `codex/library-dropped-pipeline-773`, se archivaron los dos archivos propios de #1307 con bytes y SHA-256 en `archived-1307/` y `archived-1307.json`. Sus evidencias anteriores y la raíz estática permanecen intactas. El checkout se conserva para revisión e integración; su retirada se hará después, por indicación del coordinador.
