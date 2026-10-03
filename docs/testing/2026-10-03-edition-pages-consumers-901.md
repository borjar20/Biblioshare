# Precedencia de páginas en consumidores — #901

> **[Informe de verificación · 2026-10-03]** Candidato local de cobertura; producto intacto. No acredita integración, CI ni ejecución de Next en producción.

## Resultado y contrato

**PASS_CANDIDATE**: 30 casos nuevos y **61/61 pruebas focales en nueve ficheros**, tipos y lint focal PASS. El control scratch pasa 30/30. Doce mutantes sobre copias de los consumidores provocan **51 fallos de aserción causales**, con los originales intactos. No se reprodujo un bug del producto actual.

La regla es edición identificada por el pase → páginas orientativas de la obra. Una edición sin páginas o no resuelta cae a la obra; otra tirada con páginas no se convierte en respaldo. Se verificó el código de la base `0c22a6049bb8882f07a67569b7f8ea72a75b7d88` y se leyó la [issue #901](https://github.com/borjar20/Biblioshare/issues/901) exacta antes de implementar.

La issue conserva dos datos históricos que ya no describen el estado actual: el runner sí incluye `.test.tsx`, con entorno jsdom por fichero, y `load-context.test.ts` ya tiene cinco casos de reanudación de #737. Esas pruebas no comprobaban `total`; los tests existentes de la regla pura tampoco demostraban que sus cuatro consumidores la aplicaran.

## APIs y archivos propios

| Consumidor actual | Prueba añadida | Oráculo |
|---|---|---|
| Hidratación de `get-library-items.ts`, vía `getLibraryView` y `getCollection` | `src/lib/library/get-library-items.edition-pages.test.ts` | `pageCount` correcto en ambos, más progreso/porcentaje de biblioteca. 12 casos. |
| `loadSessionContext(passId)` | `src/lib/sessions/load-context.edition-pages.test.ts` | `total` devuelto a la hoja de sesión. 6 casos. |
| `LogPanel`/`ManagedLog` | `src/components/detail/log-panel.edition-pages.test.tsx` | Total, porcentaje y aviso de cierre en `PassProgress` real; ausencia de barra sin total. 6 casos. |
| Wrapper público `BookDetailPage` y su hijo `BookDetail` | `src/app/libro/[id]/page.edition-pages.test.tsx` | Nombre accesible y `aria-valuenow` del `PassCard` real, texto de porcentaje y ausencia de barra sin total. 6 casos. |

El fake dedicado es `src/lib/editions/edition-pages.test-fixture.ts`. Sólo lo importan los cuatro tests nuevos. No se modifica el pipeline de #773 ni sus archivos, los consumidores, la regla pura, las dependencias o la configuración del runner.

## Matriz contrastable y frontera local

Cada superficie comparte los seis escenarios de la misma población:

| Pase/obra | Total esperado | Progreso en página 100 |
|---|---:|---:|
| Edición identificada con 200 páginas; obra con 400 | 200 | 50% |
| Sin edición identificada; obra con 400 | 400 | 25% |
| Edición identificada sin páginas; obra con 400 | 400 | 25% |
| ID de edición no resuelto; obra con 400 | 400 | 25% |
| Sin edición identificada ni páginas de obra | `null` | Barra ausente |
| Edición identificada con 200; obra sin páginas | 200 | 50% |

Las ediciones incluyen una tirada ajena de 900 páginas, anterior en el orden de consulta. Elegirla daría 11%, haciendo distinguible la selección correcta por ID. Las expectativas están fijadas por la población; no llaman a `pagesForPass` para calcular lo que luego esperan de sus consumidores.

El fake aplica consultas de lectura con proyección, igualdad, pertenencia, orden, rango y `maybeSingle`. Mantiene coherentes las filas de catálogo, pases, reseñas, ediciones y colección. Biblioteca y colección ejecutan la hidratación real. Sesión ejecuta `getActivePass`/`getPasses`, `getEditions` y `pagesForPass` reales; sólo las factorías de cliente y la identidad se sustituyen por datos locales. No se instancia un SDK ni se llama a una DB.

Registro y el rail se renderizan con React Testing Library y jsdom, mensajes españoles reales y sus barras reales. Sólo se sustituyen fronteras de lectura ajenas al total, hojas de escritura, pestañas y envoltorios fuera del contrato. `fetch` queda bloqueado en las pruebas de sesión y DOM; las acciones del Registro deben permanecer sin invocaciones.

### Límite del contrato de la ficha

La guía local de Next (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) advierte que Vitest no renderiza Server Components asíncronos. El wrapper público actual es síncrono y devuelve su hijo `BookDetail` bajo Suspense. El test entra por ese wrapper, obtiene el elemento hijo real, llama a su función asíncrona con sus props y renderiza el resultado con un shell acotado al `PassCard` real.

Esto prueba el cálculo aplicado por el consumidor y los datos/DOM del rail; los mutantes del propio `page.tsx` ponen roja esa prueba. No prueba streaming, serialización RSC, caché de Next, estilos de escritorio, navegador ni build/start. No se añade una exportación de producto ni se extrae la fórmula a una función que pudiera quedar bien testeada mientras el consumidor siguiera usando otro número.

## Sensibilidad por consumidor

Las copias scratch conservan cinco módulos de composición: los cuatro consumidores y `collections.ts`, cuya importación de la hidratación también se redirige a la copia. El resto de helpers y metadatos siguen siendo reales. El control equivalente valida el arnés con 30/30 antes de evaluar los mutantes; cada mutante corre sólo el fichero del consumidor afectado.

| Consumidor | Usar sólo obra | Elegir primera edición | Quitar respaldo de obra |
|---|---:|---:|---:|
| Biblioteca/colección | `01`: 4 FAIL / 8 PASS | `05`: 12 FAIL / 0 PASS | `09`: 6 FAIL / 6 PASS |
| Contexto de sesión | `02`: 2 FAIL / 4 PASS | `06`: 6 FAIL / 0 PASS | `10`: 3 FAIL / 3 PASS |
| Registro | `03`: 2 FAIL / 4 PASS | `07`: 4 FAIL / 2 PASS | `11`: 3 FAIL / 3 PASS |
| Rail de ficha | `04`: 2 FAIL / 4 PASS | `08`: 4 FAIL / 2 PASS | `12`: 3 FAIL / 3 PASS |

Cada directorio conserva fuentes, configuración, hashes, log, resultado del proceso y JSON de Vitest. Todos los 51 fallos son `AssertionError`: 400/900 en vez de 200, `null` en vez de 400 o ausencia del total/porcentaje esperado en la barra. Ningún mutante se da por detectado mediante un error de sintaxis, importación o entorno.

## Verificación y fallos del arnés conservados

Runtime explícito: Node **24.19.0**, ejecutable `C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`. Paquetes ya disponibles en el checkout; sin instalaciones.

| Check | Resultado |
|---|---|
| Casos nuevos, segunda pasada inicial | PASS, 30/30 en cuatro ficheros. |
| Pasada focal final, con reglas puras, contexto anterior, biblioteca anterior y PassCard | PASS, 61/61 en nueve ficheros. |
| Control scratch | PASS, 30/30. |
| Gate causal | PASS: 12/12 mutantes quedan RED con 51 fallos de aserción. |
| TypeScript `--noEmit --incremental false`, pasada 02 | PASS. |
| ESLint de los cuatro tests y el fake, `--max-warnings 0`, pasada 02 | PASS. |
| Integridad y whitespace | PASS; comparación y manifiesto finales en la evidencia. |
| Suite completa, build/start, e2e, navegador, DB/proveedores reales y CI | SKIPPED, fuera de esta verificación local de consumidores. |

`initial-01` pasó los otros 24 casos y no descubrió los seis de ficha: un import de pestañas no ejercitadas cargaba la guardia `server-only`. `types-01` detectó que el mock de traducción declaraba un namespace como `string` en vez del conjunto admitido. Son **fallos del arnés**, no bugs del producto. Se conservaron logs, JSON y el test previo con hash en `harness-attempt-01-*`. La corrección añadió mocks de esas dependencias ajenas, el hook de navegación requerido y el tipo de namespace; después se ejecutaron los casos, tipos y lint de nuevo. No se suprimió globalmente `server-only`.

Los comandos exactos, ejecutable, argumentos, tiempos y exit codes están en `run-check.mjs` y sus `*-result.json`; `run-mutations.mjs` reproduce únicamente las copias scratch. No se arrancaron servidores/watchers ni se leyeron secretos. No hubo commits, push, PR, merge ni escrituras remotas.

## Evidencia y continuidad

Raíz compartida, fuera del checkout:

```text
.scratch/ticket-campaign/20261002-resolve-all/editionpages901-implementation/attempt-20261003T142404Z/
```

`verified-sources.json` sella los seis archivos propios; `product-integrity.json` comprueba siete fuentes intactas; `mutation-summary.json` guarda el dictamen causal; `checks-summary.json` consolida los gates; `final-artifact-manifest.json` registra bytes y SHA-256 de toda la evidencia.

La rama `codex/library-dropped-pipeline-773` y el commit `bc4d0fc1621231d313b80423eba88a5cb2617237` se preservaron antes del switch. Sus dos fuentes y los 82 artefactos congelados se verifican de nuevo al sellar #901, sin modificarlos. El candidato actual vive en `codex/edition-pages-consumers-901`, desde la base exacta indicada; el coordinador decide integración, documentación canónica y CI. El worktree permanece disponible hasta entonces.
