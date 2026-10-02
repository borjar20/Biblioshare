# Convergencia de créditos de libro — #633

> **[Verificado contra código, unitarios, estáticos y PostgREST local el 2026-10-02]**

Un libro sembrado desde una persona completa el `billing_order` de sus autores
confirmados al abrir su ficha. Cuando todos sus créditos de autor presentes
tienen orden, la siguiente apertura sirve esos créditos sin invocar Open Library.
La siembra sigue dejando el orden a `NULL`.

## Diagnóstico reproducido

El diagnóstico de [#633](https://github.com/borjar20/Biblioshare/issues/633) se
confirma contra el código anterior de `f5963e20d7da57d4041ad7034378fce5bce08646`:
la siembra omite el orden y el
`upsert(ignoreDuplicates: true)` del detalle conserva el `NULL` del crédito
existente. La regresión nueva ejecuta dos aperturas contra un almacén con estado:
esperaba una invocación de `fetchWorkAuthorKeys` y observó dos.

La revisión del primer parche encontró otro caso del mismo contrato: con dos
autores sembrados, completar el primero y fallar el segundo hacía que el guard
«algún orden no nulo» impidiera reintentar. Se reprodujo antes de cambiar el
guard; tras retirar el error simulado, el segundo autor seguía a `NULL`.

## Contrato del cambio

- Los libros leen únicamente los créditos `role = 'author'` de su propia obra.
  La completitud operativa exige al menos uno y orden no nulo en **todos los
  autores ya presentes**. El guard de películas y series conserva su lógica.
- El `upsert` inserta las filas nuevas e ignora conflictos. Después, cada
  actualización rellena solo `billing_order` con identidad completa:
  `(item_type = 'book', item_id, person_id, role = 'author')` y condición
  `billing_order IS NULL`, aplicada en la propia escritura.
- Un orden no nulo se conserva, incluso si otro render lo escribió después del
  guard. Se conservan identificador, fecha, `character` y filas de otras obras,
  tipos, personas y roles; no se modifican ediciones ni representación del libro.
- Las escrituras siguen usando el cliente de sistema existente; el cliente de
  petición lee los créditos. No se cambian RLS, grants, RPC ni esquema.
- `wroteCredits` exige filas devueltas por una inserción o actualización real,
  para que el llamador invalide la caché de créditos también al completar órdenes.
  Una respuesta vacía, una resolución fallida o un error de escritura no inventan
  un marcador; un fallo parcial deja el libro reintentable.

## Verificación

Node **24.19.0**, Vitest **4.1.11**, un worker y sin paralelismo de ficheros.
La tanda final ejecutó **122 tests en 11 ficheros**, incluidos los **32 casos**
de `enrich-item.test.ts` y los recorridos de siembra, identidad y lectura de
créditos del mismo módulo.

| Comprobación | Estado | Resultado |
|---|---|---|
| Regresión inicial antes del arreglo | **FAIL esperado (RED)** | 1 FAIL, 19 PASS; proveedor invocado 2 veces en vez de 1 |
| Fallo parcial antes del nuevo guard | **FAIL esperado (RED)** | 1 FAIL, 29 SKIPPED por filtro; segundo orden seguía `NULL` |
| Primera tanda de `lib/people` | **PASS limitado** | 119 PASS; el fake antiguo no acreditaba la persistencia completa |
| Tanda final de `lib/people` | **PASS** | 122 PASS, 0 FAIL, 0 SKIPPED |
| ESLint de los tres ficheros TypeScript cambiados | **PASS** | Sin diagnósticos |
| Typecheck del proyecto, sin emisión ni caché incremental | **PASS** | Sin diagnósticos; incluye fuentes y tests según `tsconfig.json` |
| `git diff --check` | **PASS** | Sin errores de espacios |
| Módulo real contra Supabase/PostgREST local | **PASS** | 3 escenarios, 5 llamadas controladas a Open Library, 42 peticiones HTTP reales y 0 errores |
| Navegador de créditos, build, CI y entornos remotos | **SKIPPED** | El helper de créditos es una invocación nativa de Node; no cubre esos gates |

El fake anterior de `enrich-item-book.test.ts` devolvía una promesa en `upsert`
sin `.select()`, y una cadena de `update` incompleta. Sus aserciones observaban
el payload antes de que el error fuese capturado. Se adaptó la cadena al cliente
real, se conservó estado y se añadieron aserciones del efecto escrito, segunda
apertura sin proveedor y ausencia de errores inesperados. Los tests de fallo
exigen ahora la causa de base de datos concreta.

Comandos finales, desde la raíz del worktree:

```powershell
$taskNode = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $taskNode node_modules/vitest/vitest.mjs run src/lib/people --maxWorkers=1 --no-file-parallelism --reporter=verbose
& $taskNode node_modules/eslint/bin/eslint.js src/lib/people/enrich-item.ts src/lib/people/enrich-item.test.ts src/lib/people/enrich-item-book.test.ts
& $taskNode node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

### Contrato real de PostgREST y recuperación

`credit-recovery-1790942591442` ejecuta `ensureItemEnriched` real con Node
24.19.0 contra Supabase local desechable. Sólo controla respuestas de Open
Library para las claves de obra/autor de sus fixtures; los clientes Supabase,
PostgREST y las respuestas de escritura conservan su comportamiento real.

| Escenario | Resultado observado |
|---|---|
| Dos autores sembrados sin orden | `NULL → 0/1`; segunda apertura con cero llamadas al proveedor, cero escrituras y `wroteCredits = false` |
| Orden curado y otro incompleto | Conserva `17` y completa el otro `NULL → 1`, sin cambiar IDs, fechas ni `character` |
| Autor no confirmado y confirmación posterior | Conserva el `NULL` y reintenta; cuando la obra confirma al autor lo completa con `2`; apertura final con cero proveedor/escrituras y `wroteCredits = false` |

Los tres escenarios dan **PASS**, con **5 llamadas controladas al proveedor**,
**42 peticiones HTTP reales** y **0 errores**. En los conflictos, el upsert
devuelve cero IDs insertados; los PATCH condicionados por `billing_order=is.null`
devuelven sólo los IDs realmente modificados. La fuente y los dos tests del
candidato coinciden en bytes con sus hashes sellados en esta QA.

El lector es un cliente Supabase **anónimo** real y consulta los créditos
públicos. El escritor es el `createServiceRoleClient` que importa el módulo
real. Se ejercitan esas lecturas y el contrato de escritura privilegiado;
**no se acredita una matriz de RLS de escritura para anon/authenticated**.

La tanda anterior `integration-1790941810044` conserva el **FAIL del helper**:
`TransformError` por `await` de nivel superior al transformar a CJS, antes de
crear sus fixtures o realizar sus peticiones. La recuperación envuelve su
ejecución en `main`, conservando las aserciones y la importación del módulo
real; no corrige producto ni sustituye respuestas de Supabase. El PASS de esta
recuperación no reclasifica el FAIL global anterior ni sus fallos de UI y
abortos de login ajenos al contrato de créditos.

La recuperación no arrancó Next ni repitió build o navegador. Dio **PASS de
limpieza**: tres libros y cuatro personas de fixture retirados, cero créditos
residuales y recuentos globales/identidades estables. Supabase terminó con
backup normal y el puerto 3000 libre; no se detectaron secretos en la evidencia.

Las copias selladas se conservan en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/` del checkout raíz:

| Tanda | Archivo | SHA256 |
|---|---|---|
| Recuperación `credit-recovery-1790942591442` — contrato PASS | `result.json` | `a6a7d275d21f8eea9d00bd36edae6d34b5130a5df3919b4fc1cd9a3fd28731fd` |
| Recuperación | `manifest.sha256.json` | `605e00bf97e5d77803bae9cb0da1786869b698da394085d053c943405d61941b` |
| Integración `integration-1790941810044` — FAIL conservado | `result.json` | `55a3d655a31696d5685fb8dd52fa22fce0ad968f54c66393495466c57e5b7fd4` |
| Integración | `manifest.sha256.json` | `6f8a3024c38a2d4e82b747237c1b84d9fb2566ff54f6c0421179ce4f9ce812d6` |

Esta evidencia verifica el módulo candidato; CI remota y entrega siguen
pendientes de la coordinación principal. No afirma cierre de #633 ni
integración en `main`.

## Artefactos y SHA-256

Los logs y snapshots locales permanecen en `.scratch/credits633/`, excluidos de
Git. El manifiesto de esa carpeta conserva los hashes de todas las evidencias.

| Artefacto | SHA-256 |
|---|---|
| Fuente antes del arreglo (`enrich-item-before.ts`) | `0533F7FC17812625A713C054A5904250DC767B0170942134B915DC5096453B29` |
| Regresión inicial (`enrich-item-regression-red.test.ts`) | `7EE8A5A27909AE843FBCC5876BF1EC0D3908B470C8B0AC54706DB87EC18560A6` |
| `red.log` | `305297DF4069718075A8E893B644C369448DDC4E7D8D36E34F598A7EDD7AE29F` |
| `partial-red.log` | `8B0760376FBFEB591EB34B863219D8A7AB8C758F2FEE39CA06600F60B718697B` |
| `green-people.log` (observación inicial limitada) | `EFA8653FC3BB00FAC66B1870868CC1D52966E4CF0CFF3613E31E049767A9A60A` |
| `green-people-final-v2.log` | `D3DFB8F5B3A4AAC59FD0296C231C4D1503707AA72F7093D74E95062E9FDCA99E` |
| `src/lib/people/enrich-item.ts` | `DA728A381C6CB00C09E24B9661443CE007856D69965C7B20B7FD8AAB7BF244EE` |
| `src/lib/people/enrich-item.test.ts` | `798B64F80A84B8741D6032B46D1D6C0B2A896F8EE9B10FA7949F772379B7EE42` |
| `src/lib/people/enrich-item-book.test.ts` | `448E7E1A556D40143090CC64125027E4A894FD69EE84DD0585C7497269A87AF2` |

## Límites

Si Open Library no confirma un autor ya sembrado, ese crédito permanece a
`NULL` y las próximas aperturas pueden volver a invocar el proveedor. Se conserva
esa posibilidad de recuperación; no se atribuye un orden ficticio ni se borra
el crédito. El caso está probado también cuando una respuesta posterior sí
confirma al autor y la siguiente apertura ya converge.

Los unitarios cuentan invocaciones del proveedor simulado. El helper adicional
observa HTTP real de PostgREST, pero mantiene Open Library controlado; no acredita
su disponibilidad, metadatos reales ni latencia de producción. El almacén con
estado y PostgREST acreditan escrituras y reintentos. Cine/series conservan su
guard anterior y no tienen una nueva prueba nativa en este lote. La experiencia
visual, las políticas de escritura de usuarios y producción quedan fuera.

Las API empleadas se contrastaron con las referencias oficiales de
[Supabase update](https://supabase.com/docs/reference/javascript/update) y
[Supabase upsert](https://supabase.com/docs/reference/javascript/upsert); las
reglas de acceso se verificaron contra el modelo de datos y el código locales.
