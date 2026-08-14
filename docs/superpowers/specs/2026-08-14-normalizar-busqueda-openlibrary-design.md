---
title: Normalizar la búsqueda de libros de Open Library
date: 2026-08-14
status: design
area: catalogo
---

# Normalizar la búsqueda de libros de Open Library

## El problema

El proyecto anterior (`2026-08-13-normalizar-obras-openlibrary-design.md`) limpió las
**bibliografías** de autor: obras únicas, con año, con título en español cuando existe, sin
estuches ni traducciones sueltas. La **búsqueda** no se tocó, y quedó una asimetría que el
dueño detectó de inmediato:

| | Búsqueda | Bibliografía |
|---|---|---|
| Título | crudo (`Fatta Eld`) | `En llamas` |
| Estuches, fantasmas, traducciones sueltas | salen | fuera |
| Registros duplicados de la misma obra | salen | fusionados |

El título crudo no es un defecto cosmético. El `title` de un work de Open Library es
arbitrario: `OL36410330W` se llama **`Fatta Eld`** (sueco) y tiene 116 ediciones, de las
cuales 55 en inglés y 7 en español tituladas «En llamas». Y hay un consumidor que **compara
ese título como si fuera identidad**:

```ts
// src/lib/import/match-row.ts
const apiTitleResults = await searchWorks(row.title);
const apiTitleMatch = apiTitleResults.find((r) => isSameTitle(r.title, row.title));
```

Verificado contra la API real: `q="En llamas"` **sí** devuelve esa obra, pero con el título
`Fatta Eld`, así que `isSameTitle` falla y **la fila del CSV se queda sin casar**. Un usuario
que importa su Goodreads en español pierde libros que Open Library había encontrado.

Además, `find-or-create.ts` escribe `title` **solo en el insert**: el primer camino que crea
la fila fija su título para siempre. Con la búsqueda sin normalizar, ese primer camino
escribe `Fatta Eld`.

## El hallazgo que definió el diseño

La tentación era reutilizar `normalizeAuthorWorks` tal cual. **No se puede**, y la razón
apareció al medir sobre consultas reales antes de escribir código.

`editions.docs[0]` de `search.json` **no es «la mejor edición de la obra»: es la edición que
mejor casa con la consulta.** Comprobado comparando la misma obra pedida de las dos formas,
con los mismos `lang`, contra los fixtures ya commiteados de Collins y contra la API:

| obra | pedida por `author_key=OL18319A` | pedida por `q=hunger games` |
|---|---|---|
| `OL14908941W` (Mockingjay) | `Sinsajo` / `Mockingjay` | **`The Hunger Games`** |
| `OL36410330W` (Fatta Eld) | `En llamas` / `Catching Fire` | **`The Hunger Games`** |

En una bibliografía la consulta es el autor, así que cada obra saca su propia edición y el
mecanismo funciona. En una búsqueda por título la consulta contamina: **toda la serie recibe
la edición que se llama como lo que escribiste.**

Aplicar la regla de desduplicación de la bibliografía sobre eso es catastrófico. Medido,
`q="hunger games"` con `limit=20`:

```
de 20 crudos sobreviven 12 — fuera 2 por idioma, 1 estuche, 5 por desduplicación
/works/OL14908941W  ed= 98  work='Mockingjay'  edicion_en='The Hunger Games'  -> BORRADO
/works/OL36410330W  ed=116  work='Fatta Eld'   edicion_en='The Hunger Games'  -> BORRADO
```

Buscas «hunger games» y **desaparecen los libros 2 y 3 de la trilogía**. No hay forma de
añadirlos.

Las reglas de idioma y de omnibus sí sobreviven intactas: leen `language` y el título de la
obra, campos que la consulta no toca.

## Decisión

**Un segundo normalizador, con las cuatro reglas adaptadas.** No una rama del primero: las
reglas coinciden en el nombre pero no en el mecanismo, y mezclarlas en una función con un
parámetro `modo` esconde justo la diferencia que importa.

Alternativas descartadas:

- **No traducir en búsqueda** (solo idioma, omnibus y desduplicación por título de obra).
  Simple y sin riesgo, pero deja abierto el fallo del importador de CSV, que es el daño
  concreto y medido.
- **Resolver el título con una llamada por obra.** Correcto siempre; 20 llamadas por
  búsqueda en una ruta interactiva. Descartado por coste.

## Las reglas, en orden

Entrada: los `docs` de dos pasadas de `search.json` (`lang=es` y `lang=en`) sobre la misma
`q`. Salida: `SearchResult[]`. Función pura, sin red ni base de datos.

1. **Juntar** las dos pasadas por work key. El orden lo marca la pasada española; las obras
   que solo aparecen en la inglesa van detrás. En búsqueda, el orden es **relevancia**: no se
   pide `sort` (la bibliografía sí pide `sort=readinglog`).

2. **Guarda de colisión.** Un título de edición reclamado por **dos obras distintas** del
   mismo resultado no es el título de ninguna: es la edición que casa con la consulta. Se
   anula para todas ellas. Es el paso que salva a Mockingjay y a Fatta Eld. Medido: envenena
   2 títulos en `q="hunger games"`, 2 en `q="en llamas"`, 3 en `q="el señor de los anillos"`,
   1 en `q="dune"`.

3. **Idioma.** Fuera lo que no tenga `spa` ni `eng` en `language`, incluido lo que no traiga
   el campo en absoluto. Idéntica a la bibliografía, con el mismo precio asumido allí.

4. **Omnibus.** Los mismos ocho patrones y la regla de «tres o más obras separadas por ` / `»,
   evaluados sobre el título de obra y sobre los títulos de edición **que hayan sobrevivido al
   paso 2**. Nunca sobre uno envenenado: un estuche que casa con la consulta se llevaría por
   delante un libro legítimo.

5. **Título.** Español, si no inglés, si no el de la obra — usando solo títulos de edición no
   anulados.

6. **Desduplicar por título de OBRA y autoría.** Los títulos de edición no participan en el
   cruce: son los que la consulta contamina. Sobrevive la de más ediciones, y el grupo se
   queda con la **mejor** posición de sus miembros, para que fusionar nunca hunda una obra
   fuera del corte de 20.

   La autoría entra en la clave por una revisión de esta misma rama, medida sobre el fixture
   de `q="en llamas"`: con el título solo, «México en llamas» de Anabel Hernández y «Mexico en
   llamas» de Alejandro Basañez Loyola —dos novelas sin ninguna relación— se fundían, y la de
   menos ediciones desaparecía de la búsqueda sin que nada dijera que existe. Es el modo de
   fallo que este rediseño existe para eliminar; el primer borrador solo lo había movido de
   sitio.

   El precio, también medido: en `q="hunger games"` reaparecen cinco works homónimos de la
   novela —Kate Egan, Emily Seife, Nicola Balkind, Jessica Linn Butler y James Newton Howard,
   o sea guías, acompañamientos y la partitura— y empujan cinco obras fuera del corte visible,
   entre ellas una novela sin relación con la consulta. Nada queda inalcanzable: solo pierde
   posiciones en una búsqueda que no es la suya. Se acepta, porque ver de más es recuperable
   y un libro que no puedes añadir no lo es.

   **Sin autoría no hay clave, y sin clave no se desduplica.** Dos works anónimos con el mismo
   título son dos libros distintos hasta que se demuestre lo contrario, y `author_name` falta
   en 2 de cada 40 docs de los fixtures. Se aplica el mismo criterio: antes un duplicado a la
   vista que un libro borrado.

7. **Recortar a 20**, en el orden del paso 1.

Los pasos 2 y 6 son la diferencia entera con la bibliografía, y los dos salen de la misma
causa: la consulta contamina la elección de edición.

## Módulos

- **`src/lib/catalog/openlibrary/normalize.ts`** — sin cambios de lógica. Pasa a exportar
  `isOmnibus`, hoy privada. `normalizeTitleForComparison` y `acceptEditionTitle` ya se
  exportan.
- **`src/lib/catalog/openlibrary/search-normalize.ts`** (nuevo) — puro. Recibe los docs de
  las dos pasadas, devuelve `SearchResult[]`. Se le muda `mapWorkDoc` desde `work-search.ts`,
  con sus tests: hoy no la usa nadie más.
- **`src/lib/catalog/openlibrary/work-search.ts`** — `searchWorks` pasa de una llamada a dos
  en paralelo, `limit=40` cada una, con `language,editions,editions.title,editions.language`
  en `fields` y sin `sort`. **Su firma no cambia.** `resolveWorkByTitleAuthor` no se toca.
- **`src/lib/catalog/types.ts`** — `SearchResult` gana `altTitles?: string[]`. **Opcional**, como
  los otros dos campos de título alternativo del mismo tipo (`originalTitle`, `englishTitle`,
  que rellena solo la ruta de importación de cine): así no hay que tocar cine, series,
  catálogo local ni los datos de `MOCK_EXTERNAL_APIS` para que compile.
- **`src/lib/import/match-row.ts`** — casa contra `[title, ...(altTitles ?? [])]`, que es el
  mismo patrón que ya usa `matchMovie` con sus tres títulos.

`searchCatalog` no cambia: sigue fusionando con el catálogo local, **y lo local sigue ganando
el título**. El atajo por ISBN sigue igual. Cine y series, intactos.

### Cuánto se pide

`limit=40` por pasada, recorte a 20. Medido con las reglas de este diseño, las cuatro
consultas de prueba entregan **20 resultados de 40 docs por pasada**; pedir solo 20 dejaba
listas visiblemente más cortas que las de hoy (con las reglas de la bibliografía, 12 de 20 en
`q="hunger games"`). Las dos llamadas van en paralelo, así que la latencia es la de una sola,
y la caché de una hora sigue delante.

### Degradación

**Divergencia deliberada con la bibliografía.** Allí, si una pasada vuelve vacía y la otra no,
se devuelve `[]`, porque el resultado se **escribe** y medio resultado quedaría congelado para
siempre. La búsqueda no escribe nada, así que aquí media respuesta es mejor que ninguna: se
normaliza con lo que haya llegado. Si fallan las dos, `[]` y la búsqueda se degrada al
catálogo local, como hoy. `searchWorks` sigue sin lanzar nunca.

## Pruebas

Fixtures capturados de `q="hunger games"` y `q="en llamas"`, 40 docs por pasada, commiteados
junto a los de Collins y Shusterman (`search-hunger-games-{es,en}.json`,
`search-en-llamas-{es,en}.json`). Contra ellos:

- Mockingjay y Fatta Eld siguen en la lista — regresión del fallo que definió el diseño.
- `q="en llamas"` devuelve un resultado con `title === "En llamas"` y `"Fatta Eld"` entre sus
  `altTitles`.
- La guarda anula un título de edición reclamado por dos obras, y solo entonces.
- La desduplicación funde dos registros del mismo título Y autor, y NO funde dos homónimos de
  autores distintos.
- Al fusionar, el grupo se queda con la mejor posición de sus miembros.
- 40 docs por pasada entran, 20 resultados salen.
- `match-row` casa una fila cuyo título coincide con un `altTitle` y no con el mostrado.
- Una pasada vacía y la otra no: se devuelve lo normalizado de la que respondió, no `[]`.

## Límites asumidos

Cada uno se abre como issue al cerrar el trabajo.

1. **Envenenamiento de un solo dueño.** La guarda detecta colisiones, no una edición mal
   elegida que ninguna otra obra reclama. Real y medido en `q="dune"`: la obra
   `Hunter's Moon & Other American Gothic Tales` se muestra como `Hunters of Dune`. No hay
   guarda barata: exigir que el título de edición comparta una palabra con el de la obra
   rompería «Fatta Eld» → «En llamas», que es correcto.
2. **Los patrones de omnibus son ingleses.** En `q="el señor de los anillos"` sobreviven dos
   «Estuche…». Añadir el patrón es trivial, pero es un cambio de comportamiento de la
   bibliografía y no entra de tapadillo aquí.
3. **Las filas ya guardadas conservan su título**, porque lo local gana en `mergeByExternalId`.
   La alternativa —mostrar el título de la API sobre una fila local— daría dos nombres al
   mismo libro entre la búsqueda y su ficha. La reparación va aparte, con la limpieza de los
   112 libros basura de dev.
4. **`resolveWorkByTitleAuthor` no casa contra títulos de edición.** Pide `limit=1` y sin
   ediciones, y ya tiene su `titleMatches`. Cambiarlo es otro trabajo.

## Fuera de alcance

Cambiar de proveedor, añadir Inventaire / Hardcover / Wikidata, y que la bibliografía deje de
crear filas de catálogo (proyecto B, diseñado a grandes rasgos y sin spec).
