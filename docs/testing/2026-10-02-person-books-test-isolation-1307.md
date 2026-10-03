# Aislamiento de la siembra de libros desde persona — #1307

> **[Verificación local · 2026-10-02 · base `2c133cfacedaffd3b55e368515ef5bff0cf4931c`]**

El unitario de `hydratePersonCredits` para libros aísla explícitamente el
escritor `createServiceRoleClient()`. Conserva las comprobaciones de título,
año, portada e idioma, y comprueba el crédito sembrado con `billing_order = NULL`
y el sello `people.credits_hydrated_at` de la persona.

## Diagnóstico y sensibilidad

El diagnóstico de [#1307](https://github.com/borjar20/Biblioshare/issues/1307) se
reprodujo en la base indicada: el fichero original terminaba con **2 PASS**, pero
el primer caso registraba `supabaseUrl is required` al crear el escritor real.
Las aserciones del payload del catálogo eran válidas; no acreditaban la fase
posterior de créditos ni el sello de hidratación.

Antes de sustituir el escritor se añadió al caso nominal la exigencia de
ausencia de errores inesperados. Resultado: **1 FAIL y 1 PASS**; el FAIL muestra
la causa exacta `supabaseUrl is required`. El snapshot y el log RED se conservan.
El módulo de producto no se modificó.

## Cobertura duradera

El doble del escritor empieza sin créditos y con sello nulo. Sus operaciones
consumen los argumentos que envía el módulo; la columna de orden omitida se
representa como `NULL`. El cliente de petición rechaza cualquier acceso directo
en este unitario; la admisión en catálogo continúa mockeada como borde de la
primera fase. `fetch` devuelve exclusivamente las respuestas de prueba.

Los cinco casos verifican:

- Metadatos españoles, crédito de la obra admitida para la persona correcta,
  orden nulo, sello válido y nueva visita de la persona ya sellada sin proveedor.
- Ausencia de clave Open Library: no consulta, admisión ni escritor.
- Rechazo de créditos (`23503`): no hay crédito ni sello; un reintento completa
  ambos y se registra la causa concreta del escritor.
- Rechazo del sello (`42501`): el crédito permanece sembrado y el siguiente
  intento sella la persona sin duplicarlo.
- Catálogo sin ids admitidos: no se intenta sembrar ni sellar.

El caso nominal exige cero errores; los casos de rechazo exigen el mensaje y
error esperados. El estado de otra persona permanece intacto. No se cargan
archivos de entorno ni se construye el cliente Supabase real.

## Verificación

Node **24.19.0**, Vitest **4.1.11**, un worker y sin paralelismo de ficheros.

| Comprobación | Estado | Resultado |
|---|---|---|
| Baseline original | **PASS limitado** | 2 PASS; el escritor real falla durante el primer caso |
| Regresión antes del aislamiento | **FAIL esperado (RED)** | 1 FAIL, 1 PASS |
| Unitario focal final | **PASS** | 5 PASS, 0 FAIL, 0 SKIPPED |
| `lib/people` final en la base indicada | **PASS** | 112 PASS en 11 ficheros, 0 FAIL, 0 SKIPPED |
| Diagnóstico `supabaseUrl is required` en ambos logs finales | **PASS** | 0 coincidencias |
| ESLint del fichero cambiado | **PASS** | Sin diagnósticos |
| Typecheck del proyecto | **PASS** | Sin diagnósticos; sin emisión ni caché incremental |
| `git diff --check` | **PASS** | Sin errores de espacios |
| Producto antes/después | **PASS** | SHA-256 idéntico |
| SQL/RLS real, build, navegador y remotos | **SKIPPED** | Fuera del alcance de esta cobertura unitaria |

Comandos, desde la raíz del worktree:

```powershell
$taskNode = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $taskNode node_modules/vitest/vitest.mjs run src/lib/people/hydrate-person-credits-books.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose --silent=false
& $taskNode node_modules/vitest/vitest.mjs run src/lib/people --maxWorkers=1 --no-file-parallelism --reporter=verbose --silent=false
& $taskNode node_modules/eslint/bin/eslint.js src/lib/people/hydrate-person-credits-books.test.ts
& $taskNode node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

## Artefactos y SHA-256

Los snapshots, logs y `manifest.json` público se guardan en
`.scratch/coverage1307/`, excluido de Git. Deben preservarse antes de retirar
el worktree. El manifiesto incluye estados, comandos, base y hashes completos.

| Artefacto | SHA-256 |
|---|---|
| Test original (`test-before.ts`) | `D228D29513C1BC65302F115D5A94199FDDFF1944BFC93B9D006AF680DEBE3C09` |
| Test de regresión (`test-red.ts`) | `DEA67B61EC41AD80F7C3618261DC89F8DE8AF13E7362C773FA08A8D003B6E239` |
| `baseline-limited.log` | `CEB39A19649B20FC2993E4AD13A7E85CBA17ECC8A9B30E05948703E34A04A0DE` |
| `regression-red.log` | `EDA723A56994E6F3AB4166117D3639E0623B8CB08107DF24609EB2B3D17FBB88` |
| `green-focal.log` | `90A2601C5ED8BB9757948B992002602A6F5E3FD70D8EF56AE2913788B3BC1771` |
| `green-people.log` | `36D2E1C6F2B768701ABD4AF3BC2A92985021CF35610C9D2C29A175EB6C7E0F88` |
| `config-diagnostics.json` | `05FBDB84BDFE47AAF2709D26A8CF39B08DA1A9D0D1D5FCBB145E5EAE5EF73337` |
| Test final | `4E445C24CFC23B53561AB20ECF582EE2BC027CF3B40FF6EC147682401C56A69B` |
| `hydrate-person-credits.ts`, antes y después | `386E94D8413CC9239348A0E709ADE07370BB9FD53D972C4889A966B177A1A572` |

## Límites

La prueba ejecuta el módulo real sobre proveedores y escritores simulados.
Acredita la orquestación, los argumentos de escritura, el sello y los reintentos.
La admisión en catálogo y las restricciones, grants y políticas de Postgres
requieren sus comprobaciones de integración. Este resultado no afirma un fallo
de siembra en producción ni modifica ese comportamiento.
