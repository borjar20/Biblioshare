---
title: Normalizar las listas de obras de Open Library
date: 2026-08-13
status: design
area: catalogo
---

# Obras únicas, con año, portada y título en español

## Problema

Abrir la ficha de una persona dispara `hydratePersonCredits`, que se trae la bibliografía del
autor de `/authors/<key>/works.json` y crea un libro de catálogo por cada entrada. Lo que
entra por ahí es esto (medido el 2026-08-13):

| | dev | producción |
|---|---|---|
| libros | 371 | 194 |
| **sin año** | **323 (87%)** | **0** |
| sin portada | 142 | 6 |
| sin sinopsis | 340 | — |

Producción está limpia porque sus libros vinieron de la **búsqueda** (`search.json`, que sí
trae `first_publish_year`). Los 112 libros que dev ha ganado esta semana salieron todos de
fichas de autor.

Neal Shusterman: 84 libros, **83 sin año**. Suzanne Collins: 25 entradas, de las que ~13 son
basura —tres `Dena sutan` en euskera, cuatro estuches, un registro fantasma sin ediciones, un
`The Hunger Games [2/2]`, un título que es el número `12`—, y la obra real queda enterrada.

### Tres fallos distintos, todos nuestros

1. **Endpoint equivocado.** `/authors/<key>/works.json` es un volcado en crudo: sin orden, sin
   `edition_count`, y con fecha de publicación en menos de la mitad de las entradas.
2. **Tiramos datos que ya nos llegan.** De las 84 entradas de Shusterman, **36 traían
   `first_publish_date`** y ninguna llegó a la base: `author-works.ts` no mapea el campo y
   `hydrate-person-credits.ts:86` escribe `year: null` literal.
3. **No se desduplica, a propósito.** El comentario de `author-works.ts` lo justifica por el
   riesgo de falsos positivos («Fundación» vs «Fundación e Imperio»).

### Lo que sí da la API (comprobado, no supuesto)

`search.json?author_key=<key>` devuelve, **en una sola llamada**, `first_publish_year`,
`cover_i`, `edition_count` y el array `language` de cada obra, ordenados por popularidad real
con `sort=readinglog`:

```
142 ed  es/en  The Hunger Games            ← reales, arriba
  1 ed  es/en  Gregor the Overlander Box Set  ← el estuche se delata por el conteo
  0 ed    —    Catching Fire               ← registro fantasma, 0 ediciones
  0 ed    —    Dena sutan (×3)             ← euskera, los tira el filtro de idioma
```

Y con `fields=…,editions,editions.title,editions.language&lang=es` la **misma** llamada trae la
mejor edición por obra, con su título traducido:

```
work "The Hunger Games"                    → edición: Los juegos del hambre
work "Fatta Eld"                           → edición: En llamas
work "The Ballad of Songbirds and Snakes"  → edición: Balada de pájaros cantores y serpientes
```

Esto último importa más de lo que parece: **el `title` de una obra en Open Library es
arbitrario**. `OL36410330W` se titula `Fatta Eld` (sueco) y tiene 116 ediciones, de las cuales
55 son inglesas y 7 españolas —tituladas `En llamas`— y solo 2 suecas. El título bueno vive en
las ediciones, y se consigue sin llamadas extra.

## Decisiones tomadas

1. El normalizador es **una capa sobre las listas de obras**, no un envoltorio de toda llamada
   a Open Library. La búsqueda del usuario, `/works/<key>.json` y `/isbn/` no cambian.
2. Filtro de inclusión: **idioma más descarte de omnibus por título**, sin umbral de ediciones
   —un umbral se llevaría por delante las novedades reales, que es justo lo que más interesa.
3. Título: **edición española → edición inglesa → título de la obra**, con una regla de
   contención para no perder información.
4. Los duplicados entre idiomas **se atacan en este diseño**, no se dejan como límite asumido.
5. `collection` **queda fuera** de los patrones de omnibus: es el único con riesgo real de
   tragarse un libro legítimo.
6. Que la bibliografía deje de crear catálogo es **otro proyecto** (ver «Fuera de alcance»).

## Solución

### 1. `src/lib/catalog/openlibrary/normalize.ts` — puro, sin red

Recibe los `docs` de las dos pasadas y devuelve obras limpias. No hace llamadas, no toca la
base de datos, no sabe qué es Biblioshare. Eso lo hace testeable con respuestas reales
guardadas como fixtures, igual que `pickDisplayName` y `mapWorkDoc`.

```ts
export type ObraNormalizada = {
  /** "/works/OL5735363W" — el formato que guarda `books.openlibrary_work_key`. */
  workKey: string;
  titulo: string;
  anio: number | null;
  /** Construida con `buildCoverUrl`, mismo tamaño que usa `mapWorkDoc`. */
  portadaUrl: string | null;
};
```

`edition_count` **no se devuelve**: solo se usa dentro, para desempatar fusiones. Nadie lo
consume y no se guarda en ninguna columna.

```ts

export function normalizarObras(
  docsEs: OpenLibraryWorkDoc[],
  docsEn: OpenLibraryWorkDoc[]
): ObraNormalizada[];
```

### 2. Las reglas, en orden

**Normalización de texto** (para comparar, nunca para mostrar): minúsculas, `NFD` sin marcas
diacríticas, y solo `[a-z0-9]`. Validada contra casos reales: casa `Duckling ugly` con
`Duckling Ugly` y `It's O.K. to say no…` con `It's Ok to Say No…`.

1. **Juntar** las dos pasadas por `key`. De cada obra salen hasta dos títulos de edición.
2. **Título.** Candidato español si el `editions.language` devuelto incluye `spa`; candidato
   inglés si incluye `eng`. **Un candidato se descarta si, normalizado, es más corto que el
   título de la obra y está contenido en él** — eso rescata «Gregor and the Code of Claw» de
   quedarse en «Gregor». Se muestra el primero que sobreviva: español → inglés → título de la
   obra. La comprobación de `editions.language` no es opcional: `lang=es` devuelve la mejor
   edición *disponible*, y sin ella se cuelan títulos en alemán y turco, que son peores que el
   inglés de la obra.
3. **Idioma.** Fuera toda obra cuyo array `language` no contenga `spa` ni `eng`.
4. **Omnibus.** Fuera si **cualquiera** de sus títulos candidatos contiene `box set`,
   `boxed set`, `trilogy`, `trilogía`, `tetralogía`, `volume set`, `complete series` u
   `omnibus`; o si el título tiene tres o más segmentos separados por ` / `. Se miran todos los
   candidatos, no solo el elegido, porque la obra titulada «Gregor» solo se delata por su
   edición «The Underland Chronicles 5 Volume Set».
5. **Desduplicar.** El conjunto candidato de una obra son sus títulos normalizados: el de la
   obra, el de la edición española aceptada y el de la inglesa aceptada. **Dos obras son la
   misma si sus conjuntos se cruzan.** Sobrevive la de más ediciones. La fusión exige **evidencia
   directa** contra el conjunto propio del superviviente — no hereda los candidatos de la obra
   fusionada, porque esa herencia permitía cadenas transitivas sin límite que fusionaban (y
   borraban) obras que entre sí no compartían ningún título; medido contra los 111 works de los
   fixtures de prueba, la herencia no ganaba ninguna fusión (0 casos) y los recuentos eran
   idénticos con y sin ella.
6. **Orden:** el que da Open Library con `sort=readinglog`, por popularidad. No alfabético.

### 3. `buscarObrasDeAutor(authorKey)` — la única función con red

Hace las dos llamadas en paralelo (`lang=es` y `lang=en`) y pasa el resultado por el
normalizador. Sustituye entera a `getAuthorWorks`; `author-works.ts` y su test se borran, y con
ellos el uso de `/authors/<key>/works.json`.

Mismo contrato que el resto del módulo: **nunca lanza**, devuelve `[]` ante fallo o timeout,
con `AbortSignal.timeout(5000)` y `next: { revalidate: 86400 }`.

**Límite asumido:** `limit=100`, sin paginar. Un autor con más de cien obras se queda con las
cien más populares — que es mejor que las mil sin ordenar que traía el endpoint anterior.

### 4. `hydratePersonCredits` deja de tirar los datos

Hoy construye cada `SearchResult` con `year: null` literal y sin portada fiable. Pasa a
rellenarlos desde la obra normalizada: `title: o.titulo`, `year: o.anio`,
`coverUrl: o.portadaUrl`. El resto de esa función —cómo crea los ítems y sus créditos— no
cambia.

## Resultado esperado

Con las reglas completas, sobre datos reales del 2026-08-13:

| Autor | Antes | Después |
|---|---|---|
| Suzanne Collins | 25 entradas, 24 sin año | **14 obras, todas con año** |
| Neal Shusterman | 86 entradas, 83 sin año | **68 obras, todas con año** |

```
142ed 2008  Los juegos del hambre          21ed 2016  Scythe
116ed 2009  En llamas                      21ed 2007  Desconexión
 98ed 2010  Sinsajo                        16ed 2006  Everlost
 41ed 2003  Las Tierras Bajas              15ed 2018  Nimbo
```

Las fusiones que hace, todas correctas: `Amanecer de la Cosecha` con `Sunrise on the Reaping`
—dos registros de obra del mismo libro, en idiomas distintos— y los tres `Dread locks` de
Shusterman entre sí. **Cero fusiones falsas** en las 111 obras de los dos autores.

Ojo con un matiz que se presta a confusión: el registro fantasma `Catching Fire` (`OL20357056W`,
0 ediciones) **no llega a fusionarse** con `Fatta Eld`. Lo elimina antes el filtro de idioma,
porque sin ediciones no tiene ningún idioma. La desduplicación entre idiomas se comprueba con
`Amanecer de la Cosecha`, que sí sobrevive al filtro.

## Límites conocidos

- **Mayúsculas chillonas.** `GREGOR Y LA PROFECIA DE LA DESTRUCCION` sale así porque así está
  la edición. No se corrige: normalizar mayúsculas rompe siglas y nombres propios.
- **Obras sin edición en español ni inglés se pierden enteras**, no solo su título. Es el
  precio del filtro de idioma y es deliberado.
- **El filtro de omnibus es una heurística de título.** Sin `collection`, los seis patrones que
  quedan son inequívocos, pero un libro real llamado «Omnibus» caería.
- **La desduplicación no ve dos registros del mismo libro que no compartan ningún título** en
  ninguno de los dos idiomas. No se ha observado ninguno, pero el mecanismo no lo garantiza.

## Fuera de alcance

- **Que la bibliografía deje de crear filas de catálogo** (proyecto B). Requiere fundir dos
  fuentes en la ficha de persona, una ruta que resuelva una obra a un libro, estados de tarjeta
  para lo que no tienes, y decidir qué significan las medias y los colaboradores cuando media
  lista no está en el catálogo. Depende de este trabajo: sin la lista normalizada no hay nada
  decente que pintar.
- **Limpiar lo ya contaminado.** Este cambio evita que entre más basura; no toca los 112 libros
  que dev ya tiene. El backfill se decide cuando esto esté hecho y se vea qué pinta tiene lo
  que sí queremos.
- **Cambiar de proveedor o cruzar fuentes** (Wikidata, Hardcover, Inventaire). La evidencia
  dice que el problema era el endpoint, no el proveedor; cruzar fuentes antes de usar bien la
  que tenemos sería construir sobre una herida autoinfligida. Wikidata sigue siendo interesante
  para **personas**, no para bibliografías.
- **Sin cambios de esquema.** Ni tablas, ni columnas, ni RLS, ni migraciones.

## Caché y RLS (regla #437)

No se añade ni se modifica ningún `use cache`. El normalizador es una función pura sobre datos
públicos de Open Library, idénticos para anónimo, dueño y tercero; no toca `cookies()`,
`headers()` ni `searchParams`, y no recibe el cliente de la petición.

## Verificación

- **Vitest sobre `normalizarObras`**, con las respuestas reales de Collins (`OL1394359A`) y
  Shusterman (`OL234454A`) capturadas hoy como fixtures. Al ser fixtures congelados, los
  recuentos son estables aunque Open Library cambie: 25 → 14 y 86 → 68.

  **Medido después de quitar `collection`:** el número de Shusterman es 68 y no 67 porque
  «The Unwind Collection» sobrevive al filtro. Es el único estuche que pasa en las 111 obras
  probadas, y el precio exacto de esa decisión. Lleva su propio test para que quede escrito.
- Casos concretos por regla: `Fatta Eld` se titula «En llamas»; `Gregor and the Code of Claw`
  **no** se queda en «Gregor»; una obra sin edición española ni inglesa no cuela un título en
  alemán; `Amanecer de la Cosecha` y `Sunrise on the Reaping` colapsan en una; los `Dena sutan`
  desaparecen por idioma; los cuatro estuches de Collins desaparecen por título.
- **Un test que fija el límite:** un libro real llamado «Omnibus» se descarta. Documenta el
  falso positivo aceptado en vez de fingir que no existe.
- **Vitest sobre `buscarObrasDeAutor`** con `fetch` simulado: dos llamadas en paralelo, y `[]`
  cuando cualquiera de las dos falla o expira.
- No hay e2e nuevo: el flujo depende de Open Library en vivo y sería inestable.
