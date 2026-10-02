# Cobertura del bloque anclado sin ventana — #694

> [Verificado contra código y tests locales · 2026-10-02 · base `fd66c34`]

Tres casos nuevos protegen la validación de BLOQUES de
`validateSequenceDraft`. Los 32 tests del archivo pasan; al eliminar únicamente
el loop `anchoredNoWindow` de bloques en una copia aislada, fallan los dos
nuevos negativos y siguen pasando los otros 30. El validador de producto
conserva exactamente su contenido anterior.

Issue: [#694](https://github.com/borjar20/Biblioshare/issues/694).
Cambio único de cobertura: `src/lib/sagas/validate-sequence-draft.test.ts`.

## Casos añadidos

1. Una subsaga hija directa con `placement_in_parent = "anclado"`, posición
   nula y ninguna ventana debe devolver exactamente `anchoredNoWindow`, sin
   avisos de sin clasificar ni otros errores.
2. Una ventana válida perteneciente a una obra no suple la ventana ausente
   del bloque. El resultado sigue siendo exactamente `anchoredNoWindow`.
3. El mismo bloque con una ventana cuyo sujeto es `s:hija-1`, su dueña es
   `saga` y su ancla pertenece al subárbol debe devolver cero errores y cero
   avisos. Así se distingue el rechazo del caso inválido de rechazar siempre
   los bloques anclados.

## Resultados

| Comprobación | Resultado |
|---|---|
| Archivo de tests real, un worker, sin paralelismo de archivos | PASS: 32/32, 276 ms |
| Copia aislada sin mutación, mismo archivo de tests | PASS: 32/32, 268 ms |
| Copia aislada sin loop `anchoredNoWindow` de bloques | FAIL esperado: 2 FAIL / 30 PASS, 281 ms |
| ESLint focal compartido de los archivos modificados | PASS, sin diagnósticos |
| TypeScript de todo el worktree, sin emisión ni caché incremental | PASS, sin diagnósticos |
| `git diff --check` | PASS |

El FAIL conserva la señal requerida: en ambos negativos se esperaba
`errors: ["anchoredNoWindow"]` y la copia mutada devolvió `errors: []`.
La validación de entradas/obras y el resto de comprobaciones permanecieron
intactas en ese experimento.

## Reproducción y evidencia

Se usó Node `24.19.0`, ejecutable
`C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

```powershell
$runtimeNode = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $runtimeNode node_modules/vitest/vitest.mjs run src/lib/sagas/validate-sequence-draft.test.ts --maxWorkers=1 --no-file-parallelism
& $runtimeNode node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
git diff --check
```

Scratch propio: `.superpowers/brainstorm/2026-10-02/anchored-block-694-r1/`.
Contiene `unit.txt`, `control.txt`, `mutant-red.txt`, ambas fuentes como texto,
los tests exactos, `manifest.json` y `prepare-mutation.mjs`. Este último genera
dos copias temporales, exige una única coincidencia del loop de bloques y
retira solo esa rama en la copia mutada. Las copias ejecutadas están bajo
`C:/Users/jasc9/AppData/Local/Temp/biblioshare-694-orDIge/`.

```powershell
$experiment = Get-Content -LiteralPath .superpowers/brainstorm/2026-10-02/anchored-block-694-r1/manifest.json -Raw | ConvertFrom-Json
& $runtimeNode node_modules/vitest/vitest.mjs run --config (Join-Path $experiment.scratchRoot 'vitest.config.mjs') --root (Join-Path $experiment.scratchRoot 'control') --maxWorkers=1 --no-file-parallelism
& $runtimeNode node_modules/vitest/vitest.mjs run --config (Join-Path $experiment.scratchRoot 'vitest.config.mjs') --root (Join-Path $experiment.scratchRoot 'mutant') --maxWorkers=1 --no-file-parallelism
```

| Fuente | SHA-256 |
|---|---|
| Validador real, igual antes y después del experimento | `de6a35be38656991834c5b7307177a057e8de29a7eefa41d48504ee64cf615fb` |
| Tests finales y copias aisladas | `087fdb16f296a8379f4789078fc04e64e856c0aaf071d0f057e5e015e10d3f74` |
| Copia del validador con el loop de bloques eliminado | `ba0de1597677e65f0df45b1f26e89307695b716c5caf3959f1b3a4e43ab05214` |

El alcance es el validador puro que consume el payload. No hace falta navegador
ni base de datos para distinguir esta rama; no se atribuye a estos tests una
verificación de la RPC o del esquema SQL.
