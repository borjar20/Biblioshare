# Colapso por QID con respuestas grabadas de OpenLibrary e Inventaire — #916

> **[Verificación del candidato · 2026-10-04]** Base
> `31430e62d41de11c6f525062eeee7c6146d11a33`, rama
> `codex/catalog-qid-fixtures-916`. Capturas públicas del 2026-10-03;
> implementación y controles del 2026-10-04. Se añade cobertura, sin cambiar
> código de producto.

La suite `src/lib/catalog/search-qid-fixtures.test.ts` ejecuta la búsqueda
pública con respuestas completas grabadas de las dos APIs. El par
`OL16813053W` / `OL38056408W` llega como dos candidatos desde OpenLibrary y
termina como una tarjeta con `Q8034469`. Los homónimos de autores diferentes
y las obras de la saga Hunger Games conservan sus identidades.

## Origen e integridad

Los archivos viven en
`src/lib/catalog/__fixtures__/qid-collapse-2026-10-03/`. Cada caso conserva
dos respuestas de `search.json` (`lang=es/en`), búsqueda de Inventaire,
entidades de obras y entidades de autores. Palabras Radiantes conserva
además las dos respuestas `/works/<key>.json` como evidencia de origen;
la búsqueda no pide esos endpoints.

Son **17 respuestas HTTP completas y tres manifests**, sin filtrar campos,
reordenar resultados ni sintetizar metadata. Todos los registros conservan
URL exacta, fecha UTC, HTTP 200, URL final, tipo de contenido, tamaño y
SHA-256. No se recapturó ninguna respuesta al reanudar. Se cotejaron los
20 JSON con el checkpoint de pausa: 20/20 tamaños y hashes idénticos.
La `.gitattributes` local (`*.json -text`) evita que Git transforme sus
saltos de línea.

| Consulta | Respuestas | Ventana de captura UTC (2026-10-03) | Bytes de respuestas |
|---|---:|---|---:|
| `palabras radiantes` | 7 | 21:26:00.598–21:26:04.458 | 163925 |
| `the stranger` | 5 | 21:27:01.864–21:27:07.022 | 236585 |
| `hunger games` | 5 | 21:28:21.896–21:28:22.941 | 74894 |

Los hashes de cada respuesta están en el manifest correspondiente. Los
hashes de los manifests completos, cotejados con las capturas originales:

| Manifest | SHA-256 |
|---|---|
| `palabras-radiantes/manifest.json` | `1a9d238d92af2922569b41bdaef04fe3f9eb507f0107167fee4b3b8578edd43b` |
| `the-stranger/manifest.json` | `1c1d4367ab0650638d36aa14f6b46b16197d6ede69b68a3561f3fa079970a96c` |
| `hunger-games/manifest.json` | `3d13f2f7795a1c4c78115943917d39fe3276e24398ff370183f44b303cc87356` |

Fuentes: respuestas públicas de [OpenLibrary](https://openlibrary.org/search.json)
y [Inventaire](https://inventaire.io/api/search), identificadas por sus URLs
completas en los manifests. Las dos obras canónicas tienen también sus
capturas de [Words of Radiance](https://openlibrary.org/works/OL16813053W.json)
y [Palabras Radiantes](https://openlibrary.org/works/OL38056408W.json).

## Qué ejecuta el test

`MOCK_EXTERNAL_APIS` se fuerza a `false` durante cada caso y después se
restaura. El único módulo sustituido es el constructor del cliente de
catálogo local: devuelve una tabla vacía. `searchLocalCatalog` sí ejecuta
su código y se comprueban tabla, filtro y límite de lectura.

`fetch` sirve los bytes grabados en un `Response` nuevo, por URL exacta.
Ejecutan código real `searchCatalog`, el fan-out, ambas pasadas de
OpenLibrary, `normalizeSearchWorks`, el parser de Inventaire y la segunda
ronda de resolución de autores, `mergeByExternalId` y `collapseByWikidata`.
La suite no sustituye esos algoritmos ni realiza conexiones de red o a BD.

El replay comprueba las cinco URLs de cada búsqueda, su multiplicidad y
sus bytes/hashes. Una petición no grabada queda registrada y provoca
un error después de completar la búsqueda: lanzar sólo desde `fetch`
sería insuficiente, porque las dependencias blandas absorben errores.
El sexto caso elimina deliberadamente la respuesta de autores y verifica
que el cliente absorbe la excepción y el replay la denuncia igualmente.
La observación de `console.warn` en ese caso sólo comprueba esa frontera.

## Casos y corrección de la causalidad de la issue

1. Integridad y origen de las 17 respuestas HTTP completas.
2. `palabras radiantes`: OpenLibrary conserva `Words of Radiance`
   (`OL16813053W`, 23 ediciones) y `Palabras Radiantes` (`OL38056408W`, una).
   Sus títulos canónicos diferentes sobreviven a la deduplicación anterior.
   Inventaire aporta `wd:Q8034469`, labels español/inglés y el autor mediante
   `wdt:P50 → wd:Q457608 → Brandon Sanderson`. La búsqueda pública devuelve
   una tarjeta, retiene `OL16813053W` e incorpora los títulos de ambos.
3. Invertir los dos candidatos reales conserva `OL38056408W`, pese a tener
   una sola edición. Se usan los clientes reales y se cambia únicamente
   el orden de entrada del colapso, sin inventar un resultado ni un QID.
4. `the stranger`: las obras homónimas de Harlan Coben
   (`OL17358805W`, `Q107296246`) y Chris Van Allsburg
   (`OL3743755W`, `Q7766935`) siguen separadas. El título mostrado de Coben
   lleva una decoración editorial; ambos títulos canónicos grabados son
   `The Stranger`.
5. `hunger games`: las ediciones que la consulta adjudica a Mockingjay
   y Catching Fire llevan `The Hunger Games`. La guarda elimina ese título
   compartido antes de resolver identidad. Sobreviven The Hunger Games
   (`OL5735363W`, `Q11678`), Mockingjay (`OL14908941W`, `Q40354`) y Catching
   Fire (`OL5735360W`, `Q837140`), todos de Suzanne Collins.
6. URL de autores ausente: el fallo del replay sigue siendo visible aunque
   el cliente de producción capture la excepción.

El punto 3 de [la issue #916](https://github.com/borjar20/Biblioshare/issues/916)
atribuyó el superviviente al número de ediciones. **Ese diagnóstico causal
no describe `collapseByWikidata`**: recibe `SearchResult`, sin
`edition_count`, y prioriza `catalogId`; en empate conserva el primero por
relevancia. El contador sólo desempata antes, en `normalizeSearchWorks`,
entre obras con el mismo título canónico y autoría. En este par, el primero
también tiene más ediciones; la inversión del caso 3 distingue coincidencia
de causa. Se conserva el contrato existente y se corrige la explicación.
La preferencia de un registro con `catalogId` sigue cubierta por los
unitarios existentes de `wikidata-collapse.test.ts`; el replay usa un
catálogo vacío.

## Verificación del 2026-10-04

Todas las ejecuciones usan explícitamente Node **24.19.0**, admitido por
`package.json`, desde el runtime local de Codex; no el Node 23 del PATH.

| Check | Resultado | Evidencia |
|---|---|---|
| Integridad al reanudar | PASS: 20/20 JSON idénticos al checkpoint | `resume-fixture-integrity-v001.json` |
| Suite nueva | PASS: 6/6, 1 archivo, 506 ms | `qid-suite-v001.receipt.json` y `.vitest.json` |
| Tipos del proyecto, sin emitir ni escribir caché incremental | PASS, salida vacía | `typecheck-v001.receipt.json` |
| ESLint del test, `--max-warnings=0` | PASS, salida vacía | `lint-v001.receipt.json` |
| Tanda final tras restaurar controles | PASS: 79/79, 6 archivos, 1.64 s; cero pendientes/todo/reintentos | `catalog-focal-final-v001.receipt.json` y `.vitest.json` |
| Diff, alcance e integridad del índice de Git | PASS: 23 altas propias, 20/20 JSON con bytes idénticos; diff de producto vacío | `git-integrity-v002.json` |

La tanda final incluye los 73 casos de la línea base de pausa y los seis
nuevos. Los avisos de Inventaire de esa tanda pertenecen a los casos
unitarios existentes de respuestas inválidas/429/500, sin red real.

Se realizaron tres mutaciones temporales, una por una y sólo en el worktree
del candidato. Se guardaron bytes originales y mutados, hashes, logs y
reportes; cada `finally` restauró los bytes y comprobó el SHA-256 original.
Un hash inesperado habría detenido la restauración para preservar esa
edición. Las tres restauraciones fueron exactas y el diff de producto quedó
vacío.

| Mutación | FAIL observado y conservado | Dictamen del control |
|---|---|---|
| Saltar `collapseByWikidata` en `searchCatalog` | 3/6 FAIL; Palabras Radiantes pasa de una tarjeta a dos y faltan QIDs en los negativos | PASS: detectada, fuente restaurada |
| Quitar verificación de autor en el colapso | 1/6 FAIL; desaparece la obra de Coben | PASS: detectada, fuente restaurada |
| Quitar anulación de títulos de edición en colisión | 1/6 FAIL; desaparece Mockingjay | PASS: detectada, fuente restaurada |

Los FAIL de mutación son controles causales esperados, no defectos del
producto en el candidato restaurado. Las fuentes originales relevantes
quedaron con estos hashes:

| Fuente | SHA-256 restaurado |
|---|---|
| `src/lib/catalog/search.ts` | `f61f3e262c8f46324f68f8f4ce96cad193c118e77dbf2caa44be03ac4c60f9af` |
| `src/lib/catalog/wikidata-collapse.ts` | `a2fd3a1c869d13c53f28092213377a45eeefc0f6f908bb758c8588d2ab897aa7` |
| `src/lib/catalog/openlibrary/search-normalize.ts` | `ac4ca5f34cf36b6bbdf9952989497ac7603750f357f3f6abe365bde0aa230616` |

Evidencia de pausa y capturas originales: directorio local
`.scratch/ticket-campaign/20261002-resolve-all/catalog-qid916-20261003/`.
Evidencia de reanudación, checks y controles:
`.scratch/ticket-campaign/20261002-resolve-all/catalog-qid916-20261004/`.
Cada recibo registra ejecutable, argumentos, timestamps, métricas cuando
corresponde y hashes de log/reporte/fuentes. Los artefactos anteriores se
conservan. Los fixtures y este informe forman parte del repositorio; la
evidencia local auxiliar permanece fuera de Git.

Para repetir la suite desde la raíz del repositorio, con un Node admitido:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/catalog/search-qid-fixtures.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/catalog/search-qid-fixtures.test.ts --max-warnings=0
```

## Límites

Esta evidencia verifica la compatibilidad del pipeline actual con las
respuestas públicas completas de esas capturas, de manera determinista.
No comprueba el estado actual de las APIs ni pretende detectar por sí sola
un cambio futuro de sus respuestas: renovar fixtures requiere una captura
explícita con nuevo origen/hash, sin editar a mano la metadata antigua.
Los tamaños y las cifras de ediciones pertenecen a la captura, no a un
contador vivo de producción.

No se verificó interfaz, navegador, red de producción, persistencia ni
hidratación de fichas: este cambio sólo añade un test de integración de
la búsqueda, fixtures y documentación. No se iniciaron servicios ni se
modificaron dependencias, credenciales, configuración o datos. No se
detectó un bug real que exigiera ampliar el alcance.
