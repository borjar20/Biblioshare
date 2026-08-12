---
title: Ficha de persona a tres columnas + hidratación de filmografía/bibliografía
date: 2026-08-12
status: design
area: catalogo / ui / people
---

# Ficha de persona: explorador de créditos a tres columnas

## Problema

`/persona/[id]` (`src/app/persona/[id]/page.tsx`) es hoy una ficha biográfica de una
columna: retrato + bio, y debajo «Su obra» como rejilla plana de `CoverCard`. Tiene dos
fallos que se refuerzan entre sí.

**1. La forma no aprovecha la pantalla.** Una columna centrada dentro de `SHELL_GRID` deja
los laterales vacíos en PC, y la lista de obras no se puede filtrar, ni ordenar, ni leer
por año: es una rejilla de portadas sin estado personal, sin valoración y sin el crédito
concreto de esa persona en cada obra.

**2. La ficha miente por omisión.** «Su obra» se sirve de la tabla `credits`, y `credits`
solo tiene lo que alguien haya abierto alguna vez: los créditos los escribe
`ensureItemEnriched` al abrir la ficha de **una obra concreta**
(`src/lib/people/enrich-item.ts:104`). Si en la base hay una sola película de Denis
Villeneuve porque es la única que alguien abrió, su ficha dice —sin matices— que su obra
es esa película. No es un hueco: es una afirmación falsa sobre una persona real.

La hidratación que ya existe para personas (`enrichTmdbBio`, `get-person.ts:40`) rellena
**bio, foto, fechas y lugar de nacimiento**, y nada más. Nunca ha traído obras.

## Alcance

Dos piezas independientes que se tocan solo en el contrato de datos:

1. **Hidratación de créditos de una persona** — servidor, sin UI. Trae la filmografía
   (TMDB) o la bibliografía (Open Library) completa y la persiste en catálogo + `credits`.
2. **Rediseño de `/persona/[id]`** a tres columnas, según el marco 5 (`1e`) de
   `D:\Proyectos\Personal\Mockups\Rediseño - Ficha de persona (PC + móvil).html`.

**Fuera de alcance, con issue:**

- **«Seguir a esta persona»** (botón al pie de la card izquierda en el mockup). **No existe
  backend**: hay `follows` (usuario→usuario) y `saga_follows`, no hay `person_follows`.
  Construirlo es una feature entera —tabla, RLS, acciones, y decidir qué *hace* seguir
  (¿notificar obras nuevas? eso pide un job periódico)—, no un botón. El botón **no se
  pinta**. Issue `area:social` / `tipo:feature` / `P3`.
- **Retirada del backfill de personas ya creadas.** La hidratación es perezosa por visita;
  las personas que nadie visite siguen con sus créditos parciales. Aceptado. Issue
  `area:catalogo` / `tipo:deuda` / `P2` si algún día se quiere un backfill.

---

# Parte 1 — Hidratación de créditos

## Fuentes

### Cine y series — TMDB

**Una sola llamada**: `/person/{tmdb_id}/combined_credits?language=es-ES`. Devuelve
`cast[]` y `crew[]`; cada entrada trae `id` (tmdb del ítem), `media_type`, `title`/`name`,
`poster_path`, `release_date`/`first_air_date`, `character`, `job`, `vote_average`,
`popularity`, `overview`, `genre_ids`.

**Sin tope** (decisión del usuario, 2026-08-12). Dos filtros que no son recorte de volumen
sino necesidad de esquema:

| Filtro | Motivo |
|---|---|
| `media_type ∈ {movie, tv}` | TMDB devuelve también entradas que no son obra de catálogo. |
| `job` mapeable a `CreditRole` | `credits.role` solo admite `cast/director/writer/creator/author` (`src/lib/people/types.ts:5`). `Director`→`director`; `Writer`, `Screenplay`, `Story`→`writer`; `Creator`→`creator`. **Productor, fotografía, montaje, música, etc. se descartan**: no hay rol donde meterlos. |

Entradas sin título utilizable se descartan. Las que no tienen póster o fecha **sí entran**
(la fila las pinta sin portada / sin año) — descartarlas sería recortar la obra de la
persona, que es justo el bug que arreglamos.

**Deduplicación**: la misma obra puede venir en `cast` y en `crew` (actor que además
dirige). Se conserva **una fila de `credits` por `(item, person, role)`** — dos roles en la
misma obra son dos filas, y el centro pinta la obra **una vez** con sus dos chips.

### Libros — Open Library

`people.openlibrary_key` ya existe en la tabla y lo rellena `findOrCreateBookAuthor`
(`src/lib/people/find-or-create-person.ts:72`). **Una sola llamada**:
`https://openlibrary.org/authors/{key}/works.json?limit=1000`, campo `entries[]` con
`title`, `key` (`/works/OLxxxW`) y `covers[]`.

Un autor prolífico puede pasar de 1000 obras; el `limit=1000` es el tope de la API en una
página. **No se pagina**: una segunda página es otra petición HTTP dentro de un render, y
1000 obras ya es más de lo que ninguna ficha necesita mostrar. Límite asumido, documentado
en la issue de deuda.

⚠️ **Ruido conocido de Open Library**: `/works` de un autor mezcla la obra original con
traducciones, recopilaciones y ediciones registradas como obra. Se descarta lo que no tenga
`title`, y punto — no se intenta desduplicar por título, que produce falsos positivos
(«Fundación» y «Fundación e Imperio» no son la misma obra, pero «Dune» y «Dune.» sí).
Aceptado y anotado en la issue.

## Escritura: en lote, no de una en una

`findOrCreateCatalogItem` (`src/lib/catalog/find-or-create.ts:25`) resuelve **un** ítem por
llamada: un `select` + un `insert`. Para 300 créditos son ~600 viajes a la base dentro de
un render. Inviable.

Se añade **`findOrCreateCatalogItemsBulk`** en el mismo módulo:

```
findOrCreateCatalogItemsBulk(supabase, itemType, results[]) -> Map<externalId, catalogId>
```

1. Un `select id, <idColumn> from <tabla> where <idColumn> in (...)` para los ya existentes.
2. Un `insert` con **todas** las filas que falten, `.select("id, <idColumn>")`.
3. Ante `23505` (carrera con otro render), un `select` de recuperación sobre el lote entero
   — mismo patrón que `findOrCreatePeopleByTmdb` (`find-or-create-person.ts:45`).

Los créditos se insertan igual: **un** `insert` con todas las filas.

Total por hidratación: **~6 consultas**, no ~600.

`findOrCreateCatalogItem` (singular) se mantiene y pasa a ser un envoltorio de la versión en
lote con un solo elemento, para que no puedan divergir. **Excepción**: el camino de
`ensureBookEdition` (que solo aplica al singular y necesita `matchedIsbn` + `userId`) se
queda en el envoltorio; el bulk no registra ediciones — no las tiene.

## Cuándo corre

**El primer pintado no espera a nada.** La página se parte en dos:

```
<PersonCard />                     ← inmediato: una consulta a `people`
<Suspense fallback={<WorksSkeleton/>}>
  <PersonWorks />                  ← streamed: hidrata si hace falta y pinta
</Suspense>
```

Dentro de `<PersonWorks>`, `getPersonProfile()`:

1. Lee `credits` + catálogo + `passes` del visitante (lo que ya hay). **Siempre.**
2. Si `people.credits_hydrated_at is null` → una llamada a la API externa, escritura en
   lote, y re-lectura del resultado.
3. Deriva agregados y devuelve.

**Se persiste dentro del boundary, no en `after()`.** Con las escrituras en lote el paso 2
son ~6 consultas y una petición HTTP; meterlo en `after()` obligaría a pintar obras que
**todavía no tienen id de catálogo** y por tanto no se pueden enlazar, lo que exigiría una
ruta resolvedora `/pelicula/tmdb/[tmdbId]` y filas con estados a medias. Persistiendo
dentro, todo lo que se pinta ya es enlazable. Decisión del 2026-08-12 (el usuario propuso
`after()`; se refina con este motivo).

Lo que el usuario pidió se conserva: **primer pintado instantáneo, y el explorador entra en
cuanto llega**, sin bloquear la ficha.

## Marca de hidratado y su trampa de grants

Columna nueva **`people.credits_hydrated_at timestamptz null`**. Con valor = ya se hidrató,
no se vuelve a llamar a la API.

⚠️ **`authenticated` tiene `UPDATE` acotado POR COLUMNAS sobre `people`** — hoy solo
`bio, birth_date, death_date, photo_url, place_of_birth` (verificado en dev el 2026-08-12
contra `information_schema.column_privileges`). Añadir la columna **sin su grant rompería la
escritura ENTERA de `people`**, no solo el campo nuevo: `enrichTmdbBio` dejaría de guardar
biografías. Compila, pasa typecheck y unitarios, y revienta en producción. Es la trampa de
la superficie 6 de `docs/DRIFT-CHECK.md`, que ya ha mordido dos veces (issue #375).

La migración lleva las dos cosas en el mismo fichero:

```sql
alter table public.people add column credits_hydrated_at timestamptz;
grant update (credits_hydrated_at) on public.people to authenticated;
```

Dev primero (`supabase-dev`), luego prod. Verificación **contra `information_schema`**, no
contra el ledger de `list_migrations`.

## Visitantes anónimos

`anon` no tiene —ni debe tener— `UPDATE`/`INSERT` de sincronización sobre el catálogo. Sus
escrituras devuelven **42501** y se tragan en silencio, exactamente como `writeSizes`
(`enrich-item.ts:59`) y por el mismo motivo: la navegación anónima existe (#359/#360) y no
puede romper la ficha.

**Consecuencia asumida (enmienda del 2026-08-12, durante la implementación):** el anónimo
**NO ve la filmografía completa hasta que la persista alguien con sesión**. El plan inicial
decía lo contrario —«el anónimo la ve desde la respuesta de la API, en memoria»—, y se
descartó al implementarlo: esas obras no tienen id de catálogo, así que habría que pintarlas
**sin enlace**, con una fila que no es clicable y hay que marcar visualmente como tal. Eso es
una segunda variante de la fila y un estado a medias en la pantalla, a cambio de un caso de
paso: la ficha vacía que motiva todo esto la sufre el dueño de la biblioteca, que está
logueado.

Lo que ve el anónimo, entonces: la ficha completa de la persona (bio, foto, fechas) y las
obras que YA estén en `credits`. En cuanto entra el primer visitante con sesión, la ficha
queda hidratada para todos, incluidos los anónimos siguientes. Queda como issue por si el
caso resulta importar.

## Nunca lanza

Todo el camino de hidratación va envuelto en `try/catch` con `console.error`, igual que
`ensureItemEnriched` y `populateTmdbCollection`. **Un fallo de API externa degrada la ficha
a lo que ya hubiera en BD; no la rompe.**

## Ficheros

| Fichero | Qué |
|---|---|
| `src/lib/catalog/tmdb.ts` | `getPersonCombinedCredits(tmdbId)` — nueva. |
| `src/lib/catalog/openlibrary/author-works.ts` | `getAuthorWorks(key)` — nuevo módulo. |
| `src/lib/catalog/find-or-create.ts` | `findOrCreateCatalogItemsBulk` + singular como envoltorio. |
| `src/lib/people/hydrate-person-credits.ts` | Orquesta: fuente → filtrado → lote → `credits` → marca. **Nuevo.** |
| `src/lib/people/map-tmdb-job.ts` | `job` de TMDB → `CreditRole \| null`. Puro, con test. **Nuevo.** |
| `supabase/migrations/20260823_people_credits_hydrated_at.sql` | Columna + grant. |

---

# Parte 2 — Rediseño a tres columnas

## Esqueleto

Contenedor `SHELL_PERSON` en `src/lib/ui/layout.ts` + rejilla `.person-grid` en
`globals.css`, **mismo patrón que `.post-grid` y `.home-grid`**: la escalera de columnas y
el ancho de contenedor son UNA decisión, y página y esqueleto comparten el nombre de clase
para no poder divergir (la regla que abre `layout.ts`, motivo de #372/#376).

| Ancho de ventana | Reparto |
|---|---|
| ≥1600 | Tres columnas: `308px` · fluida · `344px`, `gap 28px`, contenedor `max-w-[1740px]` |
| 1000–1600 | Dos columnas: ficha + centro; el raíl se pliega **debajo de la ficha izquierda**, sus cards a ancho de columna |
| <1000 | Una columna (marco 2): ficha como hero centrado, filtros en fila con scroll horizontal, destacadas en carrusel, resto en rejilla de 2 |

El handoff dejaba sin definir la franja 1000–1200; se cierra con **dos columnas** (mismo
tratamiento que 1200–1600): a 1100px ya caben ficha + centro sin apretar, y bajar a una
columna ahí desperdiciaría 300px.

`SHELL_PERSON = "max-w-2xl min-[1000px]:max-w-[1740px]"` — por debajo de 1000 la página va
en una columna y se queda en ancho de lectura (672), sin estirarse; mismo criterio que
`SHELL_POST`.

Las columnas laterales son `position: sticky` con `align-items: start`.

## Columna izquierda — `PersonCard`

Card única (`--surface`, borde `--border`, radio 14, padding 18):

- Retrato **cuadrado** a ancho completo (`aspect-ratio: 1`, radio 12) — no el círculo de
  hoy. Sin foto, iniciales sobre `--surface-3`.
- Nombre en Fraunces 24/600.
- **Chips de rol ordenados por volumen de obras** (`Reparto · Dirección` si actúa más de lo
  que dirige), mono uppercase.
- Metadatos en columna: nacimiento, fallecimiento (si existe), origen.
- Biografía a 3 líneas (`-webkit-line-clamp: 3`) + «Ver más» que **expande in situ**. No hay
  página de biografía aparte. El toggle es la única parte cliente de la card.
- Separador + bloque **En tu biblioteca**: barra «Has visto/leído N de M obras», tu media,
  pendientes, en progreso.

**Verbo según el tipo dominante** de sus obras: mayoría cine/series → «Has visto»; mayoría
libros → «Has leído»; mixto → «Has registrado».

El bloque «En tu biblioteca» **solo aparece si M ≥ 3 y N ≥ 1** (un «has visto 0 de 1» no
informa de nada). Y solo si hay sesión.

## Centro — `PersonWorks`

Cabecera: `Obras` (Fraunces 21) + contador `· N` + dos grupos de filtros a la derecha,
separados por una línea vertical.

1. **Tipo** — Todas / Películas / Series / Libros. **Solo se renderizan los tipos que la
   persona tiene.**
2. **Crédito** — Todo crédito / Dirección / Guion / Reparto / Autor, generados de los
   créditos reales y **con recuento** (`Dirección · 8`). Una obra puede contar en varios.

**Estado en la URL**: `?tipo=peliculas&credito=direccion`, para que un enlace desde la ficha
de un título pueda llegar prefiltrado. Los chips son `<Link>`, no estado de cliente — el
filtrado es servidor y no necesita JS. (`searchParams` ya hace la ruta dinámica; lo es de
todos modos, ver «Caché» abajo.)

### Destacadas y «El resto, por año»

- **Destacadas** — hasta **5** cards (portada 2:3, título, año · crédito, valoración o
  estado). Criterio server-side **en este orden**: obras con valoración propia alta →
  más valoradas globalmente → más recientes.
- Las destacadas **se excluyen** de la lista de abajo, que por eso se titula **«El resto,
  por año»**. Sin la exclusión la información sale duplicada — era el defecto del primer
  planteamiento y es la razón de ser del título.

### Lista por año

Año descendente. Gutter con el año (46px, mono) y filas `PersonWorkRow` con **cuatro zonas
fijas**:

| Zona | Ancho | Contenido |
|---|---|---|
| Obra | fluida | Portada 30px, título, tipo + duración — **o el personaje** si el crédito es reparto |
| Crédito | auto | Chip del rol |
| Estado | 118px | `StatusBadge`; en progreso → etiqueta + mini barra |
| Valoración | 74px | `RatingDots`; sin valoración → botón «Valorar» |

### Secciones por rol (créditos mixtos)

Si el rol secundario tiene **≥3 obras o ≥20% del total**, con «Todo crédito» activo el
centro se parte en secciones (`Como directora · 4 obras · 3 vistas`, `Como intérprete · 4
obras · 1 vista`), cada una por año descendente. **Al elegir un chip de crédito concreto la
lista se aplana** y vuelve a ser una sola secuencia cronológica. Un cameo suelto no genera
sección: se queda como una fila más con su chip `Reparto`.

## Columna derecha — `PersonRail`

Solo información **derivada**. Nunca contenido nuevo que compita con el centro.

- **Te falta ver · N** — hasta 3 obras pendientes o en progreso, portada 34px.
- **Sagas** — sagas a las que pertenecen sus obras + progreso («2 de 3 vistas»).
- **Colabora a menudo con** — personas con **≥2 obras compartidas**: avatar, nombre, rol,
  recuento; enlaza a su ficha.
- **Tu actividad** — última terminada y fecha, tu media aquí, media global.
- Botón «Añadir todas a pendientes →».

**Cada card se omite si no tiene datos. No hay estados vacíos en el raíl** — un raíl de
cuatro cajas vacías es peor que no tener raíl.

## Estados de volumen

| Obras | Forma |
|---|---|
| **0** | Sin sección de obras, sin raíl, sin resumen: ficha + aviso «Aún no hay obras de esta persona en el catálogo». Dos columnas. |
| **1** | Contador «Obras · 1», **una card protagonista** (portada 120px + sinopsis + acción principal), sin destacadas, sin raíl → dos columnas. **No se rellena el ancho.** |
| **2–3** | Sin destacadas; cards en fila a tamaño protagonista. Raíl solo si tiene datos reales. |
| **4+** | Destacadas (hasta 5) + lista completa. |

Con la Parte 1 en su sitio, los estados 0 y 1 pasan a ser **raros de verdad** (una persona
sin `tmdb_id` ni `openlibrary_key`, o cuya API no devuelve nada), en vez de ser el caso
normal de hoy.

## Tweaks del mockup → decisiones cerradas

Los controles de exploración del mockup son andamiaje, no features. Se elige uno y se cierra
el resto (no se implementa ningún conmutador):

| Tweak | Elegido |
|---|---|
| Galería | **Destacadas con exclusión** de la lista |
| Chip de crédito en la fila | **Visible** |
| Resumen «En tu biblioteca» | **Visible** (con la condición M≥3 ∧ N≥1) |
| Secciones por rol | **Activas** (con el umbral ≥3 obras o ≥20%) |

## Derivación pura y testable

Toda la lógica de forma vive en funciones puras, sin Supabase, con test unitario — estilo
del resto de `src/lib`:

| Función | Qué decide |
|---|---|
| `deriveRoleCounts(works)` | Orden de los chips de rol de la card y recuentos de los filtros |
| `pickFeatured(works, max=5)` | Las destacadas, con el orden de criterios de arriba |
| `splitFeaturedAndRest(works)` | La exclusión |
| `groupByYear(works)` | Lista descendente con su gutter |
| `deriveRoleSections(works)` | Umbral ≥3 obras o ≥20% → secciones o lista plana |
| `deriveCollaborators(credits)` | ≥2 obras compartidas, con recuento |
| `deriveLibrarySummary(works)` | N de M, verbo dominante, condición de visibilidad |
| `deriveDominantType(works)` | «visto» / «leído» / «registrado» |

## Caché y RLS (regla #437)

**Ni un `use cache` en esta ruta.** El perfil depende de `passes` del que mira: estado,
valoración, progreso, «te falta ver», «tu actividad». Cachear cualquiera de esas funciones
sería servir a un usuario las filas que solo otro podía ver, y **no se vería en desarrollo**
con una sola cuenta abierta.

La ruta sigue siendo dinámica (`export const instant = false`, ya presente). El `TODO` de
adopción de Cache Components se mantiene tal cual.

Contestando el cuestionario obligatorio de la regla:

1. **¿El dato es el mismo para un anónimo, el dueño y un tercero?** **No** — media propia,
   estado, pendientes, actividad. → no se cachea; detrás de `<Suspense>`.
2. **¿Toca `cookies()`/`headers()`/`searchParams`?** **Sí**, ambas cosas (sesión y los
   filtros de la URL). Con `use cache` fallaría con `next-request-in-use-cache`, que **pasa
   `next build` y revienta en `next start`**.

La **media global** de una obra sí es pública y sería cacheable, pero llega dentro de la
misma consulta del perfil; separarla para cachearla es optimización prematura y arrastra el
cambio semántico de #436 («sobre las filas que el que mira puede ver» → «sobre las filas
públicas»). **No se toca.** Se anota como posible mejora, no como pendiente.

## Datos que hay que servir

Contrato de `getPersonProfile(supabase, viewerId, personId)`:

**Persona** — `id`, nombre, retrato, roles con recuento, nacimiento, fallecimiento, origen,
biografía.

**Por obra** — `id`, tipo, título, portada, año, duración, **lista de créditos de esta
persona en ella** (+ personaje si es reparto), media global, saga, y el estado del visitante
(`planned|in_progress|completed|dropped`, progreso, valoración, `finished_on`).

**Agregados** — obras totales, vistas/leídas, media del visitante en esta persona,
colaboradores frecuentes (join sobre créditos compartidos, ≥2), progreso por saga.

Sin sesión, todo el bloque de estado del visitante viene vacío y las piezas que dependen de
él no se pintan.

## Componentes

Nuevo `src/components/people/`:

| Componente | Servidor/Cliente |
|---|---|
| `person-card.tsx` | Servidor; el «Ver más» de la bio en un `bio-clamp.tsx` cliente |
| `person-works.tsx` | Servidor |
| `person-filters.tsx` | Servidor (chips = `<Link>`) |
| `person-featured.tsx` | Servidor |
| `person-work-row.tsx` | Servidor |
| `person-rail.tsx` | Servidor |

Se reutilizan `RatingDots`, `StatusBadge`, `CoverCard`, `ProgressBar` — **nada de HTML del
mockup copiado**: el mockup es CSS vainilla con la paleta Paper en oscuro y se mapea a los
tokens reales (`--surface`, `--border`, `--accent`, `--status-*`, `--type-*`), nunca a sus
hex.

## i18n

El namespace `person` de `messages/*.json` tiene hoy 7 claves (`notFoundTitle`,
`notFoundDescription`, `backHome`, `worksTitle`, `born`, `died`, `noBio`). Se amplía con las
del explorador, filtros, raíl y estados de volumen. `worksTitle` («Su obra») **se retira**:
la cabecera pasa a ser «Obras · N».

---

## Pruebas

| Nivel | Qué cubre |
|---|---|
| Unitario (Vitest) | Las 8 funciones puras de derivación + `map-tmdb-job` + el filtrado y la deduplicación de `hydrate-person-credits` (con la respuesta de API mockeada). |
| Unitario | `findOrCreateCatalogItemsBulk`: lote mixto (existentes + nuevos), lote vacío, carrera `23505`. |
| e2e (Playwright) | Ficha con 4+ obras: tres columnas, filtro por tipo y por crédito vía URL, exclusión de destacadas. Ficha de 1 obra: card protagonista, sin raíl. Ficha de 0 obras: aviso. |

⚠️ Los e2e corren **contra build de producción**, no solo `next dev`: el fallo
`next-request-in-use-cache` pasa `next build` y solo aparece en `next start` (regla #437).

## Definición de «hecho»

1. `docs/requirements/data-model.md` — la columna `credits_hydrated_at`, su grant y la
   fecha de verificación.
2. `docs/requirements/backlog.md` — marcar la casilla de la ficha de persona.
3. `docs/requirements/decisiones.md` — **append**: (a) persistir dentro del `<Suspense>` en
   vez de `after()` y por qué; (b) descartar los `job` de TMDB no mapeables; (c) los cuatro
   tweaks cerrados; (d) el corte 1000–1600 a dos columnas.
4. Superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) tras la migración.
5. Issues abiertas: «Seguir a esta persona», backfill de personas ya creadas, ruido y tope
   de 1000 de Open Library.
