---
title: Autores de libro — identidad por obra en vez de búsqueda por nombre
date: 2026-08-13
status: design
area: catalogo / people
---

# Autores de libro: dejar de inventarlos

## Problema

Un autor de libro se crea hoy buscando su **nombre suelto** en Open Library y quedándose con
el primer resultado:

```ts
// src/lib/catalog/openlibrary/authors.ts
searchUrl = "https://openlibrary.org/search/authors.json?q=" + name;
const doc = search.docs?.[0];   // «El match es difuso: se toma el primer resultado»
```

Ese `docs[0]` es la raíz de todo lo que sigue. Medido en **producción** el 2026-08-13: 61
autores de libro para 194 libros (154 con `openlibrary_work_key`, 54 con ISBN).

**1. Identidades falsas.** El primer resultado no es la persona:

| En la app | Key resuelta | Qué es en realidad |
|---|---|---|
| Frank Herbert | `OL1758387A` | nacido 1872, muerto «16.02.1954» — no es el de *Dune* (`OL79034A`, 1920–1986) |
| Dan Simmons | — | `death_date` = «2026»; está vivo |
| H.P. Lovecraft | `OL12771220A` | ficha vacía; el bueno es `OL22161A`, con bio y foto |
| Homero | `OL6010306A` | ficha vacía |

**2. Un autor por idioma.** El match es `.eq("name", name)` exacto, así que «Fiódor
Dostoyevski», «Fyodor Dostoevsky» y «Dostoievski» son tres filas. Peor: si dos de esas
grafías resuelven a la **misma** `openlibrary_key`, el índice único parcial
`people_openlibrary_key_key` tumba el INSERT; el `catch` re-selecciona **por nombre**, no
lo encuentra, `findOrCreateBookAuthor` lanza, `ensureItemEnriched` se lo traga en su
try/catch — y **el libro se queda sin ningún crédito, en silencio**.

**3. Traductores e ilustradores acreditados como autores.** El origen es el string
`books.author` de la edición española, que los mete en la misma cadena: Marc Simonetti,
Alejandro Colucci, Manu Viciano, Borja García Bercero, Carlos di Urarte están en `people`
con `role: "author"`. Y `books.author = "Rodolfo Acuña, Rodolfo Acuna"` produce dos filas
para un solo humano.

**4. Dato crudo.** Seis formatos de fecha conviviendo, markdown dentro de las bios, idiomas
mezclados; 30 de 61 sin bio y 23 de 61 sin foto.

### Lo que sí ofrece la API (comprobado, no supuesto)

- **`search.json` ya puede devolver la identidad correcta sin llamadas extra**: con
  `fields=...,author_key` trae `author_key` alineado con `author_name`. Hoy no se pide.
- **`/works/<key>.json` trae `authors[].author.key`**, y `fetchWork` ya hace esa llamada
  (solo lee `description`, `subjects`, `covers`).
- **Pero el work NO distingue roles.** Todos los autores vienen con
  `type: "/type/author_role"`:
  - `OL8479867W` (*El nombre del viento*) → `OL2830895A` (Rothfuss) **y** `OL9118672A`
    (Marc Simonetti, ilustrador).
  - `OL152268W` → Lovecraft **y** `OL2943988A` (Enrique Breccia, ilustrador).
  - `OL893414W` (*Dune*) → `OL79034A` **y** `OL7388009A`, que es *Френк Герберт*: **el
    mismo humano duplicado en cirílico dentro del mismo work**.
- **Las ediciones tampoco dan roles**: en 12 ediciones de `OL8479867W`, `contributions`
  vino `undefined` en todas, y una edición española trae `authors: []`.
- **El nombre canónico de Open Library no es necesariamente latino**: `OL22242A` es
  `name: "Фёдор Достоевский"` con `personal_name: "Fyodor Mikhaylovich Dostoyevsky"`;
  Homero es `Όμηρος` con `personal_name: "Homer."`.

## Decisiones tomadas

1. Arreglar la **fuente** y además limpiar lo ya guardado; la fuente primero.
2. Los libros sin `openlibrary_work_key` resuelven la obra por título+autor y **guardan la
   key**.
3. Nombre visible = el canónico de Open Library; el resto de grafías se guardan como
   **alias** para casar y buscar.
4. Traductores e ilustradores **fuera**: no se crean más, y el backfill borra los créditos
   `author` falsos y las personas que queden huérfanas.
5. El backfill es un **script de Node en `scripts/`**, a mano, idempotente, con log de
   fusiones y borrados; dev primero, luego prod.
6. Se acreditan **todos los autores del work en escritura latina**, con `billing_order` por
   el orden del work. La fila «Autor» de la ficha enseña al primero.
7. Sin autor resoluble → **no se escribe crédito**. La ficha enseña `books.author` como
   texto plano, sin ficha de persona.

## Solución

### 1. La identidad viene de la obra, nunca del nombre

`resolveOpenLibraryAuthor(name)` —la búsqueda difusa por nombre— **se borra**. Nadie la
llama después de este cambio. En su lugar, `src/lib/catalog/openlibrary/work-authors.ts`:

```ts
// Keys de autor de una obra. Todas vienen con type "/type/author_role": Open
// Library NO distingue autor de ilustrador, así que aquí no se puede filtrar.
export async function fetchWorkAuthorKeys(workKey: string): Promise<string[]>

// Ficha de autor POR KEY. Sustituye a la búsqueda por nombre: la key ya es
// identidad, no hay nada que adivinar.
export async function fetchOpenLibraryAuthorByKey(key: string): Promise<OpenLibraryAuthor | null>

// Nombre visible + alias, aplicando la regla de escritura latina (abajo).
export function pickDisplayName(detail: AuthorDetail): { name: string; aliases: string[] } | null
```

`SEARCH_FIELDS` de `work-search.ts` gana `author_key`, y `OpenLibraryWorkDoc` el campo
`author_key?: string[]`, para tener la identidad ya en el resultado de búsqueda.

### 2. Regla de escritura latina

Sobre `[name, personal_name, ...alternate_names]`:

- **Nombre visible** = el primer candidato **en escritura latina** (sin ninguna letra de
  otro alfabeto), con los puntos finales recortados — `"Homer."` → `"Homer"`.
- **Alias** = el resto de candidatos, deduplicados, incluida la forma no latina.
- **Ningún candidato latino → el autor se descarta** (no se crea persona, no se escribe
  crédito).

Esto es lo que mata al duplicado cirílico de *Dune*: `OL7388009A` es un stub
`{"name": "Френк Герберт"}` **sin `personal_name` y sin `alternate_names`**, así que no
tiene forma latina y cae. `Όμηρος` y Dostoyevski sobreviven por su `personal_name`.

Coste asumido: un autor cuya única grafía sea no latina (japonés, coreano) se descarta
entero y su libro se queda sin ficha de persona. Es raro en este catálogo y es preferible a
pintar un nombre que quien lo lea no puede leer.

### 3. `findOrCreateBookAuthorByKey`

Reemplaza a `findOrCreateBookAuthor(supabase, name)`:

```ts
export async function findOrCreateBookAuthorByKey(
  supabase: SupabaseServerClient,
  key: string
): Promise<string | null>
```

- Busca por **`openlibrary_key`**, no por nombre.
- Si no está: `fetchOpenLibraryAuthorByKey` + `pickDisplayName`; si no hay nombre latino,
  devuelve `null`.
- Inserta con `name` canónico, `aliases`, `openlibrary_key`, foto, bio y fechas.
- **En error 23505 re-selecciona por `openlibrary_key`** — el arreglo del bug del problema
  2, que hoy re-selecciona por nombre y por eso deja el libro sin créditos.
- **Nunca lanza**: devuelve `null` y el llamador omite ese autor.

### 4. `ensureItemEnriched`, rama libro

```
work key del libro (o resolverla por título+autor y guardarla)
  └─ sin work key ..................... salir sin escribir créditos
keys de autor del work
  └─ vacías ........................... salir sin escribir créditos
por cada key, en orden: findOrCreateBookAuthorByKey
  └─ null (sin forma latina) .......... se omite ese autor
upsert de créditos role="author", billing_order = posición en el work
```

`splitAuthors(item.author)` desaparece de esta rama: el string `books.author` deja de ser
fuente de identidad de personas. Sigue siendo lo que se pinta cuando no hay créditos.

`EnrichableItem` gana `openlibraryWorkKey?: string | null`.

**Grants, verificados en producción el 2026-08-13.** Guardar la work key resuelta es un
UPDATE sobre `books.openlibrary_work_key`: `authenticated` **ya tiene** ese grant de
columna, así que no hace falta migración. `anon` no tiene UPDATE sobre `books`, o sea que
un visitante sin sesión resolverá la obra y no podrá guardar la key (error `42501`); se
trata como ya se trata en `writeSizes` — esperado e inocuo, no se registra como error, y la
guarda el primer visitante con sesión.

En `people`: `authenticated` tiene UPDATE solo sobre `bio`,
`birth_date`, `death_date`, `photo_url`, `place_of_birth` y `credits_hydrated_at` — **no
sobre `name` ni `openlibrary_key`**, y `anon` no tiene UPDATE ninguno. Consecuencia de
diseño: **la app puede crear personas pero no renombrarlas**; corregir nombres ya guardados
es exclusivamente cosa del backfill, que corre con `service_role`.

### 5. Esquema: `people.aliases`

```sql
alter table public.people add column aliases text[] not null default '{}';
grant insert (aliases), references (aliases) on public.people to anon, authenticated;
```

El `grant insert` **no es opcional**: sin él, el INSERT de `people` de la app falla entero.
No se añade `grant update(aliases)`: la app no actualiza personas, y el backfill va con
`service_role`.

Sin índice: el único lector es el backfill, sobre 61 filas. Si algún día la búsqueda del
catálogo casa por alias, entonces un GIN — no antes.

`docs/requirements/data-model.md` se actualiza con la columna y su fecha de verificación.

### 6. Backfill — `scripts/backfill-book-authors.ts`

`npx tsx --env-file=.env.local scripts/backfill-book-authors.ts [--apply]`, en la línea de
`backfill-sizes.ts`. **Por defecto es dry-run**: lista lo que haría y no escribe. Fases:

1. **Work key.** Por cada libro sin `openlibrary_work_key`, resolverla por título+autor y
   guardarla.
2. **Derivar.** Autores correctos de cada libro con **las mismas funciones que usa la app**
   (no una copia del criterio: una copia se desincroniza).
3. **Casar, no duplicar.** Cada autor derivado se busca en `people` por `openlibrary_key`;
   si no, por nombre normalizado o alias. Si hay fila, se **corrige** (nombre canónico,
   key, bio, foto, fechas, alias) en vez de crear otra.
4. **Fusionar duplicados.** Si dos filas acaban con la misma `openlibrary_key`, sobrevive
   la más antigua: se repuntan sus `credits.person_id` y se borra la otra. Seguro porque
   **`credits.person_id` es la única FK a `people`** — verificado en prod.
5. **Reescribir créditos.** Por libro: borrar los `author` que ya no correspondan (ahí
   caen traductores e ilustradores heredados), insertar los que falten, `billing_order` por
   el orden del work.
6. **Barrer huérfanos.** Borrar personas con `tmdb_id` nulo y cero créditos.

Idempotente: una segunda pasada no debe imprimir ni una acción. Log de una línea por
fusión y por borrado, con nombre y key, para que quede rastro de qué se tocó.

Orden: dev, revisar el log, prod.

### 7. Caché

No se añade ni se modifica ningún `use cache`. Pero el backfill escribe **por fuera de
Next**, así que las entradas ya cacheadas de créditos y fichas de persona seguirán sirviendo
lo viejo hasta que caduque su `cacheLife`. Es aceptable —los datos convergen solos— y hay
que decirlo en el log del script para que no se lea como «el backfill no hizo nada».

## Fuera de alcance (issues aparte)

- **Ilustradores que el work lista como autor** (Simonetti, Breccia). La opción de
  intersectar los autores del work con los de sus ediciones los eliminaría, pero cuesta una
  llamada más por libro y la cobertura de `authors` en ediciones es irregular (hay
  `authors: []`). Issue con la evidencia ya medida.
- **Normalizar `birth_date`/`death_date`** (seis formatos) y **limpiar el markdown de las
  bios**. Es presentación, no identidad; el trabajo de aquí no lo empeora.
- **Autores sin ninguna grafía latina.**
- **Personas de cine (`tmdb_id`)**: no se tocan. Su identidad ya viene por id, no por
  nombre.

## Verificación

- **Vitest** sobre lo puro, con las respuestas reales capturadas hoy como fixtures:
  `pickDisplayName` (Dostoyevski → «Fyodor Mikhaylovich Dostoyevsky» + alias cirílico;
  `Όμηρος` → «Homer» sin punto final; `OL7388009A` → `null`) y el mapeo
  `work.authors[] → keys` (Dune → dos keys, Rothfuss → dos keys).
- **Vitest** sobre `findOrCreateBookAuthorByKey`: con el cliente simulado devolviendo
  23505, tiene que resolver por `openlibrary_key` y **no** lanzar — la regresión concreta
  que dejaba libros sin créditos.
- **Dry-run del backfill contra dev**, comparando el recuento de personas, créditos
  `author` y huérfanos antes y después; segunda pasada en vacío para probar idempotencia.
- No hay e2e nuevo: el flujo depende de Open Library en vivo y un e2e así sería inestable.
  Lo que sí se comprueba a mano en dev tras el backfill: la ficha de *Dune* enseña «Frank
  Herbert» una sola vez y su enlace lleva a una ficha con bio, foto y 1920–1986.
