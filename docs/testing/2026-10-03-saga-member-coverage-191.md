# Cobertura de los miembros de `getSaga` — #191

> **[Verificación local · contra código el 2026-10-03]**

La [issue #191](https://github.com/borjar20/Biblioshare/issues/191) describe una
ausencia de cobertura, no un bug observado. `src/lib/sagas/get-saga.test.ts`
añade 19 casos sobre la API pública `getSaga`, que usa el editor de saga. No se
exporta `resolveMembers`, no se extrae otra función y no cambia código de producto.

Base: `a0b0e0313771982322ff29e5dd3108a93fa4a931`.
Rama de preparación: `codex/saga-member-coverage-191`.
Runtime verificado: Node **24.19.0**, ejecutado por su ruta explícita;
Vitest **4.1.11** y configuración del proyecto en entorno `node`.

## Contrato cubierto

| Casos | Comportamiento comprobado |
|---|---|
| 7 variantes de curación | Conserva los seis roles y `null`, las colocaciones `fijo`/`libre`/`anclado`/`null`, `optional` verdadero/falso y `position` numérica/`null`, incluido 0. Comprueba también título, portada y enlace. |
| 1 mezcla de catálogos | Libro, película y serie comparten el mismo ID y mantienen sus metadatos y prefijos de enlace propios. El orden de entrada difiere del esperado. |
| 1 ausencia de metadatos | Omite un libro aunque una película comparta su ID; también omite la serie ausente. Una fila de catálogo ajena no crea un miembro. |
| 3 títulos nulos | Mantiene la obra de cada tipo con el título visible `Sin título` y portada nula. |
| 1 ordenación adversa | Ordena 0, 2, 2 y 10 numéricamente; coloca dos posiciones nulas al final; desempata por título tanto en 2 como en `null`. Los títulos y el orden de entrada hacen fallar una ordenación sólo alfabética, lexicográfica o estable sin desempate. Las opcionales permanecen presentes. |
| 1 ámbito de lectura | Descarta la saga y los miembros de otra saga presentes en el fixture. |
| 1 saga inexistente | Devuelve `null` y no consulta miembros ni catálogo. |
| 2 resultados de miembros vacíos | `[]` y `data: null` producen miembros vacíos y no consultan catálogo. |
| 2 resultados de catálogo vacíos | `[]` y `data: null` omiten el miembro sin crear un enlace roto. |

Las filas del fixture están tipadas desde `Database`, con los campos que consume
este recorrido. El único cast de cliente queda en la frontera de prueba. Su
consulta aplica `eq`/`in` sobre las filas y proyecta sólo las columnas de
`select`: omitir `placement` o `optional` de la consulta deja de satisfacer las
aserciones, aunque el fixture original tenga esos valores. Es una simulación
acotada de esas lecturas; no reproduce todo PostgREST. Referencias de ese contrato:
[select](https://supabase.com/docs/reference/javascript/select),
[eq](https://supabase.com/docs/reference/javascript/eq) e
[in](https://supabase.com/docs/reference/javascript/in).

Se usa una saga `manual`. TMDB, la creación de catálogo y el cliente privilegiado
están sustituidos por funciones que fallan si se llaman; cada caso comprueba
también que no se llamaron. `itemHref` y el fallback de título son los del
módulo real, y los valores esperados no llaman a esos helpers para calcularse.

## Verificación

| Check | Resultado |
|---|---|
| Baseline previo: rutas, sincronización de colección y roles | PASS: 23 tests, 3 archivos. |
| Nuevo archivo `get-saga.test.ts` | PASS: 19/19, sin skips, 1 archivo. |
| Dominio `src/lib/sagas` | PASS: 526/526, sin skips, 34 archivos; incluye los 19 nuevos. |
| `tsc --noEmit --incremental false` | PASS: proyecto completo, exit 0. |
| ESLint del archivo nuevo, `--max-warnings=0` | PASS: exit 0, sin advertencias. |
| Control aislado con fuente y test copiados | PASS: 19/19. |
| Mutaciones aisladas | PASS del dictamen: 17/17 rechazadas por aserciones; ningún superviviente ni fallo de carga. |

Ejecutables utilizados, desde el worktree, sin cambiar dependencias:

```powershell
$nodeExe = 'C:\Users\jasc9\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeExe node_modules\vitest\vitest.mjs run src/lib/sagas/get-saga.test.ts --maxWorkers=1 --no-file-parallelism
& $nodeExe node_modules\vitest\vitest.mjs run src/lib/sagas --maxWorkers=1 --no-file-parallelism
& $nodeExe node_modules\typescript\bin\tsc --noEmit --incremental false
& $nodeExe node_modules\eslint\bin\eslint.js src/lib/sagas/get-saga.test.ts --max-warnings=0
```

## Comprobación de los oráculos

Las mutaciones se generan en copias fuera del worktree, con rutas diferentes.
Cada una conserva una copia idéntica del test y sólo cambia la regla indicada.
El control usa la fuente sin cambios. Se ejecutaron 342 casos en esas 18 copias:
279 PASS y **63 FAIL causales esperados**, con exit 1 conservado en el reporte.
No representan 342 tests permanentes: la cobertura nueva son los 19 anteriores.

| Mutación | Aserciones que fallaron |
|---|---:|
| Sustituir `placement` por `null` | 6 |
| Forzar `optional=false` | 4 |
| Sustituir `role` por `null` | 7 |
| Sustituir `position` por `null` | 4 |
| Identificar metadatos sólo por ID | 2 |
| Conservar huérfanos con metadatos inventados | 3 |
| Perder el fallback de título nulo | 3 |
| Usar siempre el enlace de libro | 4 |
| Perder la portada | 8 |
| Ordenar posiciones nulas primero | 1 |
| Tratar 0 como `null` con `\|\|` | 1 |
| Invertir el orden numérico | 2 |
| Omitir el desempate por título | 1 |
| Omitir `placement`/`optional` del `select` | 12 |
| Leer películas del catálogo de libros | 3 |
| Omitir el filtro de miembros por saga | 1 |
| Comparar posiciones como texto | 1 |

El dictamen exige que se ejecuten los 19 casos de cada copia, comprueba sus
hashes y distingue un `AssertionError` de un fallo de importación o ejecución.
También comprueba que las fuentes preexistentes mantengan sus hashes.

## Evidencia y límites

La evidencia ignorada está en el checkout principal, bajo
`.scratch/ticket-campaign/20261002-resolve-all/saga191-implementation-20261003/`:

- `before-manifest.json`, `sources/before/` y `sources/after/`: fuentes y hashes.
- `baseline-related.json`, `focal-v1.json` y `sagas-domain-v1.json`, con sus logs.
- Recibos de comandos de focales, dominio, tipos, lint y mutaciones.
- `mutation-manifest.json`, `mutations/`, `mutations-v1.json` y su log con los FAIL.
- `mutation-verdict-v2.json`: dictamen de los 17 mutantes y control.
- `artifact-manifest.json` y `handoff.json`: inventario final y recibo del commit.

`get-saga.ts` mantiene antes y después el SHA-256
`48831d9dc73f89b33123ec255c7473ee3789fd93d2e9d299760346e81ef2f19b`.
El archivo de test verificado tiene SHA-256
`2b80cc6da62123ef9841dcdba4d20a054497dc7cd55024be30bbba7b88bfb2df`.

No se levantaron servicios ni se usó navegador, Docker, build, BD remota/local,
cuenta de prueba o credencial. No verifica RLS, permisos SQL, datos desplegados,
la sincronización TMDB ni el editor en navegador. Tampoco atribuye un bug real a
las mutaciones artificiales. La CI y la publicación se comprueban por separado
en la integración de la campaña.
