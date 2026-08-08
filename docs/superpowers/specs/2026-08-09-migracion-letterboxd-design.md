# Migración completa desde Letterboxd — diseño

Fecha: 2026-08-09 · Sustituye al flujo de `diary.csv` descrito en
[`2026-07-20-import-en-onboarding-design.md`](./2026-07-20-import-en-onboarding-design.md)
(que sigue siendo canónico para el bucle de lotes y para Goodreads).

## 1. Problema

Hoy `/importar` acepta **un CSV suelto**. Para Letterboxd solo entiende `diary.csv`,
que es el único fichero con fecha por visionado. El resultado es que quien migra su
cuenta trae **el diario y nada más**: pierde las películas vistas sin entrada de
diario (`watched.csv`), las notas de las que nunca escribió (`ratings.csv`), todas
las reseñas (`reviews.csv`), la watchlist entera (`watchlist.csv`) y sus listas
(`lists/*.csv`).

Un export real de Letterboxd es un **ZIP con nueve ficheros**. Aceptar solo uno de
ellos no es «importar desde Letterboxd»: es leer una esquina del export.

Además, **en la APK de Android la importación no funciona en absoluto** — ver §11,
donde resulta no ser un problema de permisos.

### Lo que condiciona el diseño

Todo lo de esta tabla está verificado en el repo, no supuesto.

| Hecho | Dónde | Consecuencia |
|---|---|---|
| **Los seis CSV llevan la URI de la película** (`Letterboxd URI`, o `URL` en los de lista) | export de Letterboxd | El «matching global» es un `Map<uri, …>` exacto, no reconciliación difusa de títulos |
| `detectFormat` mira **la primera línea del CSV** | `src/lib/import/detect-format.ts:12` | Un ZIP es indetectable así: hace falta una rama por bytes mágicos |
| `ImportRow` tiene **un solo `rating`** y ningún `review` | `src/lib/import/types.ts:15` | `reviews.csv` (nota y reseña **por visionado**) no cabe: hay que bajarlos a la fecha |
| **Un solo pase activo por obra** (índice parcial `passes_one_active`) | `supabase/migrations/20260716_pass_hub_a_columns.sql:84` | «Watchlist + visionados previos» obliga a elegir quién ocupa el hueco activo |
| La nota que pinta la biblioteca sale del **último pase CERRADO**, no del activo | `src/lib/library/get-library-items.ts:181` (`keepLatestClosedPass`) | Un activo `planned` **no** esconde tu valoración. La decisión D3 es segura |
| `ensureActivePass` pone siempre el **visionado más reciente** como activo | `src/lib/import/commit-row.ts:47` | Hay que reescribirlo para D3 |
| Matching y escritura están **fusionados** en `commitImportRow` | `src/lib/import/commit-row.ts:191` | No hay dónde meter un preview: hay que separar decidir de escribir |
| `bodySizeLimit: "5mb"` en server actions | `next.config.ts` | El ZIP cabe de sobra: es texto comprimido |
| `MAX_ROWS = 3000`, **por fila de CSV** | `src/app/importar/actions.ts:32` | Con seis ficheros el tope se agota sin llegar a 3.000 películas |
| Cada película única gasta una búsqueda a TMDB, y el catálogo local no casa títulos en inglés | issue **#388** (abierta) | El coste de matching es el cuello de botella: hay que gastarlo **una vez por película**, no una por fila |
| `saveUnmatchedBatch` ya guarda en bloque las filas sin match | `src/app/importar/actions.ts:302` | Las películas irreconocibles ya tienen destino; no hay que inventarlo |
| No hay dependencia de ZIP en `package.json` | `package.json` | Se resuelve con `node:zlib` o se añade una dependencia |
| **El APK carga producción** (`https://biblioshare-nine.vercel.app`) | `capacitor.config.ts` | Nada de esto es probable en la APK hasta que esté desplegado en prod |

### Escala asumida

**500–2000 películas** por cuenta (respuesta del dueño). Eso descarta sostener la
importación solo en memoria del navegador: son minutos de matching, y un refresco
o un cambio de app en el móvil se lo lleva por delante.

## 2. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| **D1** | **Se sube el ZIP entero, sin descomprimir en el cliente.** El servidor lo abre. | Es el payload **más pequeño posible**: son seis CSV de texto, y comprimidos caben en una fracción del `bodySizeLimit` de 5 MB. Descomprimir en el navegador y mandar los CSV sería mandar *más* bytes. |
| **D2** | **Sin dependencia nueva para el ZIP**: `node:zlib` + ~60 líneas de lectura del directorio central. | Un `.zip` de Letterboxd son entradas `stored` o `deflate`. `inflateRawSync` es stdlib. `jszip` (~100 KB) o `fflate` no aportan nada que no sea esas 60 líneas, y esto corre en servidor, donde el tamaño del bundle da igual pero la superficie de dependencias no. |
| **D3** | **La watchlist gana el pase activo.** Si una película está en `watchlist.csv`, su pase activo es `planned` y **todos** sus visionados bajan a pases cerrados. | Decisión del dueño. Modela la intención real («quiero reverla») y es lo que Letterboxd muestra. Segura porque la nota se lee del último pase cerrado (§1), así que no se pierde de vista. |
| **D4** | **Nota y reseña bajan al visionado.** `ImportDiaryDate` gana `rating` y `review`. | Es la forma real del dato: `reviews.csv` ata cada reseña a un `Watched Date`. Y encaja con el modelo del repo, donde **el pase es dueño de la nota y la reseña** (`data-model.md` §3). `ImportRow.rating` se conserva para Goodreads. |
| **D5** | **Las ambiguas se auto-eligen y se marcan para revisar**, no bloquean la importación. | Decisión del dueño. Con 500–2000 películas el triaje previo son 50–200 clics antes de ver nada. Es asumible **porque existe D6**: si el auto-pick mete basura, se deshace. |
| **D6** | **La corrida se persiste** en `import_runs` + `import_run_items`, con **deshacer**. | Tres pájaros de un tiro: el preview sobrevive a un refresco, «revisar» es un `where needs_review`, y deshacer es borrar los pases que registró. **No toca `passes`**, así que esquiva la trampa de grants por columna (#375). |
| **D7** | **`watchlist.csv` NO crea colección**, solo pases `planned`. | Se evaluó como alternativa y se descartó: duplicaría el estado en dos sitios. Lo que sí son colecciones es `lists/*.csv`. |
| **D8** | **El `.csv` suelto sigue funcionando.** No se sustituye la ruta, se amplía. | Goodreads no tiene ZIP, y un `diary.csv` suelto es un caso legítimo. Cambiar `detectFormat` para rechazarlo sería una regresión gratis. |
| **D9** | **#388 (`movies.english_title`) se queda fuera.** | Mejora la **segunda** importación y las de otros usuarios, no la primera (el catálogo empieza vacío de esas películas). Meter migración + backfill aquí sería encadenar dos diagnósticos a una PR. La issue ya está abierta. |
| **D10** | **`watched.csv` aporta `finished_on`** aunque su fecha sea «cuándo lo marcaste». | Un pase completado **sin fecha no cuenta en estadísticas ni en rachas**, que es peor que una fecha aproximada. Se mitiga con `created_at` backdateado (no inunda el feed) y con D6 (se deshace). Riesgo asumido y escrito: quien marcó 600 películas al registrarse verá un pico ese día. |

## 3. La clave: la URI es el join

Los seis ficheros del export traen la URI canónica de cada película:

| Fichero | Columnas que importan |
|---|---|
| `diary.csv` | `Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date` |
| `watched.csv` | `Date, Name, Year, Letterboxd URI` |
| `ratings.csv` | `Date, Name, Year, Letterboxd URI, Rating` |
| `reviews.csv` | `Date, Name, Year, Letterboxd URI, Rating, Rewatch, Watched Date, Tags, Review` |
| `watchlist.csv` | `Date, Name, Year, Letterboxd URI` |
| `lists/*.csv` | `Position, Name, Year, URL, Description` (tras un bloque de cabecera propio) |

Por eso el punto 2 del plan («normalizar y hacer matching global») **no es trabajo
difuso**: se agrupa por `uri`, exacto, antes de preguntarle nada a TMDB. La clave
`título+año` que usa hoy `parse-letterboxd.ts` deja de hacer falta para Letterboxd
(se conserva como respaldo si a alguna fila le falta la URI).

**Trampa de los ficheros de lista:** tienen **dos cabeceras**. Primero un bloque con
los metadatos de la lista, luego una línea en blanco, y solo entonces la tabla de
películas:

```
Date,Name,Tags,URL,Description
2024-03-01,Mis favoritas de terror,,https://boxd.it/xxxxx,"Las que repito cada octubre"

Position,Name,Year,URL,Description
1,Hereditary,2018,https://boxd.it/gPMg,
2,The Witch,2015,https://boxd.it/cRfa,
```

`Papa.parse` con `header: true` lee eso mal. Se corta por la primera línea vacía:
el primer bloque da nombre y descripción de la colección, el segundo las películas.

## 4. Entrada: el ZIP

**`src/lib/import/unzip.ts`** — nuevo, ~60 líneas, sin dependencias:

1. Buscar el *End of Central Directory* (firma `PK\x05\x06`) desde el final.
2. Recorrer el directorio central: por cada entrada, nombre, método y offsets.
3. Por cada fichero que nos interese: saltar la cabecera local y, según el método,
   `inflateRawSync` (8) o slice directo (0).

Se leen por el directorio central, no por las cabeceras locales, para no tener que
lidiar con *data descriptors* (bit 3 del flag), que dejan los tamaños a cero en la
cabecera local.

Extrae **solo** lo que se usa: `diary.csv`, `watched.csv`, `ratings.csv`,
`reviews.csv`, `watchlist.csv` y `lists/*.csv`. `likes/`, `comments.csv` y
`profile.csv` se ignoran (§10).

**`detect-format.ts`** gana una rama antes de decodificar texto:

```ts
const bytes = new Uint8Array(buffer, 0, 4);
if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
  return "letterboxd-zip";
}
```

## 5. Normalización: un `FilmRef` por película

**`src/lib/import/letterboxd/collect.ts`** — puro, sin I/O, testeable a mano:

```ts
type Viewing = {
  watchedOn: string;          // YYYY-MM-DD
  rating: number | null;      // ya en la escala interna 1-10
  review: string | null;
};

type FilmRef = {
  uri: string;
  title: string;
  year: number | null;
  viewings: Viewing[];              // diary ∪ reviews, dedup por (uri, watchedOn)
  watchedOnlyDate: string | null;   // Date de watched.csv, SOLO si viewings está vacío
  rating: number | null;            // ratings.csv — la nota "actual" de la película
  watchlistedOn: string | null;
  lists: { listName: string; position: number }[];   // pertenencia, no metadatos
};

// La lista es una entidad aparte: su nombre y descripción salen del PRIMER
// bloque de cabecera del fichero (§3), no de las filas de película. Meterlos
// en cada FilmRef los repetiría por película y no habría dónde poner una
// lista vacía.
type ListRef = { name: string; description: string | null };

export function collectLetterboxd(files: Record<string, string>): {
  films: FilmRef[];
  lists: ListRef[];
};
```

Reglas de precedencia, en este orden:

1. **`diary.csv`** define los visionados: uno por fila, con su `Watched Date` y su
   `Rating` propios.
2. **`reviews.csv`** se une **por `(uri, Watched Date)`** y rellena `review` (y
   `rating`, si el diario no lo traía). Una reseña sin visionado correspondiente
   **crea el suyo** — pasa cuando la entrada de diario se borró pero la reseña no.
3. **`ratings.csv`** rellena la nota del visionado más reciente que no tenga
   ninguna. Es la misma regla que ya aplica hoy `parse-letterboxd.ts`: *un
   revisionado sin puntuar no borra la valoración que ya tenías.*
4. **`watched.csv`** solo aporta algo si `viewings` quedó **vacío** (punto 3 del
   plan: «crear `completed` solo cuando no exista información de diario más
   precisa»).
5. **`watchlist.csv`** marca `watchlistedOn`.
6. **`lists/*.csv`** añaden pertenencias con su posición.

## 6. Matching: una vez por película

`matchImportRow` se reutiliza **sin tocarlo**. Lo que cambia es la cardinalidad: se
le llama una vez por `FilmRef`, no una por fila de CSV. En un export real eso es la
diferencia entre ~4.000 llamadas a TMDB y ~900.

Antes de preguntar a TMDB, **se mira `import_run_items` de corridas anteriores del
mismo usuario por `uri`**: si esa película ya se resolvió, se reutiliza su
`item_id` y la llamada no se hace. Eso es lo que hace barata la reimportación
(§9).

Desenlaces:

| Del matcher | Qué se hace |
|---|---|
| `matched` | se guarda `item_id` |
| `ambiguous` | **`chooseBest()`** se queda con uno y marca `needs_review = true` (D5) |
| `unmatched` | a `pending_import_rows` con `saveUnmatchedBatch`, que ya existe |

**`chooseBest(candidates, ref)`** — desempate determinista, en este orden:

1. título normalizado **exacto** (ya lo hace `preferExactTitle`, se reutiliza)
2. año más cercano al del `FilmRef`
3. el primero que devolvió TMDB (viene ordenado por relevancia)

## 7. Escritura: decidir y escribir se separan

**`src/lib/import/letterboxd/plan-film-passes.ts`** — puro, sin BD:

```ts
type PassPlan = {
  status: MediaStatus;
  isActive: boolean;
  startedOn: string | null;
  finishedOn: string | null;
  rating: number | null;
  review: string | null;
  createdAt: string;        // backdateado
};

export function planFilmPasses(ref: FilmRef): PassPlan[];
```

Reglas:

- **Con `watchlistedOn`** → el activo es `{ status: "planned", isActive: true,
  createdAt: watchlistedOn }`, sin fechas ni nota, y **todos** los visionados son
  pases cerrados (`completed`, `isActive: false`). **(D3)**
- **Sin `watchlistedOn`** → el activo es el visionado **más reciente**
  (`completed`), y el resto cerrados. Es el comportamiento de hoy.
- **Sin visionados y con `watchedOnlyDate`** → un único `completed` activo con esa
  fecha. **(D10)**
- Cada pase cerrado lleva **su** `rating` y **su** `review`, y su `finishedOn`.
- `createdAt` va **backdateado** a la fecha real. Sin eso, importar una película
  con 4 revisionados dispara 4 eventos «añadió» de hoy en el feed de quien te
  sigue: `addedResult` no filtra por `is_active` a propósito, y ordena por
  `created_at` (ya documentado en `commit-row.ts:114`).
- `is_public: true`, como hoy — el default de columna es `false` y dejaría lo
  importado fuera del feed.

Esto sustituye a `ensureActivePass` + `addHistoricalPasses`, que quedan reducidos a
un escritor tonto que recibe `PassPlan[]` y los inserta. **Toda la decisión pasa a
ser testeable sin base de datos**, que es lo que hoy no se puede.

Las **colecciones** salen de los `ListRef` (nombre y descripción) y sus miembros de
`ref.lists` (pertenencia + posición): una fila en `collections` por lista —creada
si no existe, reutilizada por nombre si sí— y una en `collection_items` con su
`position`. El `Position` del CSV se conserva, así que las listas ordenadas siguen
ordenadas.

## 8. Fases

1. **Subir ZIP** → server action: desempaqueta, `collectLetterboxd`, **crea la
   corrida** con sus `import_run_items` en estado `pending`. Devuelve recuentos
   brutos. Todavía **no se ha tocado TMDB ni `passes`**.
2. **Matching por lotes** — el bucle de `useImportRun` que ya existe, ahora sobre
   `FilmRef[]`, escribiendo `item_id` / `needs_review` en `import_run_items`.
3. **Preview** — lee de la corrida, no de memoria del cliente:

   ```
   842 películas reconocidas · 118 auto-elegidas (revisar después) · 31 sin encontrar
   1.204 pases (912 vistas + 292 revisionados)
   310 pendientes (watchlist)
   7 listas → colecciones
                                        [ Importar ]   [ Cancelar ]
   ```
4. **Commit** por lotes: pases y colecciones, registrando los ids creados en
   `import_run_items.created_pass_ids`.
5. **Resumen** con «N por revisar» y **«Deshacer esta importación»**.

`MAX_ROWS` pasa a ser un tope **por película** (`MAX_FILMS = 5000`), no por fila de
CSV: con seis ficheros, el tope actual de 3.000 filas se agota antes de llegar a
3.000 películas. 5.000 cubre con holgura la escala asumida (§1) sin dejar el
servidor abierto a un ZIP fabricado.

**Alcance de la corrida en v1:** solo el camino del **ZIP** crea `import_runs`. El
CSV suelto (Goodreads, `diary.csv`) mantiene su flujo actual sin corrida — es
rápido, cabe en memoria y no tiene nada que deshacer. La columna `source` admite
los otros valores para no tener que migrarla cuando se unifiquen.

## 9. Esquema

Dos tablas nuevas. **Ninguna columna nueva en `passes`** — deliberado, para no
tocar sus grants por columna (trampa #375: una columna sin su `grant` rompe la
escritura **entera** de la tabla).

```sql
create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,                        -- 'letterboxd-zip' | 'goodreads' | 'letterboxd-csv'
  status text not null default 'collecting',   -- collecting|matching|preview|committing|done|undone
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);

create table public.import_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.import_runs(id) on delete cascade,
  uri text,                                    -- Letterboxd URI: la clave de reimportación
  title text not null,
  year int,
  payload jsonb not null,                      -- el FilmRef normalizado
  item_id uuid,                                -- obra de catálogo resuelta
  needs_review boolean not null default false,
  outcome text,                                -- matched|auto|unmatched|error
  created_pass_ids uuid[] not null default '{}'
);
```

- **RLS**: dueño y punto, en las dos. `import_run_items` deriva el dueño por
  `run_id`.
- **Grants**: `select, insert, update, delete` a `authenticated` sobre las dos
  tablas. Son tablas nuevas, así que grant de tabla entera — no hay grant fino que
  respetar.
- **Índices**: `import_run_items(run_id)` y `import_run_items(run_id) where
  needs_review` para la pantalla de revisión.
- Orden de despliegue: **migración primero en dev, luego en prod, y el código
  después** (regla del repo).

### Idempotencia

Reimportar el mismo ZIP, o uno más nuevo de la misma cuenta:

| Nivel | Regla |
|---|---|
| **Obra** | `uri` contra `import_run_items` de corridas no deshechas del usuario → se reutiliza `item_id` y **no se llama a TMDB** |
| **Pase activo** | el índice `passes_one_active` ya lo garantiza: la violación de unicidad se trata como «ya estaba» (idioma que `ensureActivePass` ya usa) |
| **Pase cerrado** | `(user_id, item_type, item_id, finished_on)` — si existe, no se duplica |
| **Nota / reseña** | si el pase existe con la misma fecha pero distinta nota o reseña, **se actualiza** (es el caso «escribí la reseña después de la primera importación») |
| **Colecciones** | colección por nombre; `collection_items` por `(collection_id, item_type, item_id)` |

### Deshacer

Borrar los `created_pass_ids` de la corrida y marcar `undone_at`.

⚠️ **Trampa:** existe el trigger `promote_active_pass_after_delete`
(`20260719_...`). Al borrar el pase activo, promueve otro a activo. Si el usuario
tenía pases **propios** de esa película desde antes de la importación, eso es
exactamente lo que se quiere. Si no, el siguiente `delete` del mismo lote se lo
lleva. El estado final es correcto en los dos casos, pero el orden importa para el
número de escrituras: **borrar en un solo `delete ... where id = any(...)`**.

Deshacer **no borra ítems de catálogo**: son compartidos, y además el trigger
`forbid_delete_with_passes` lo impediría si otro usuario tuviera pases.

## 10. Fuera de alcance

- `likes/films.csv`, `likes/reviews.csv`, `likes/lists.csv`
- `Tags` del diario (no hay dónde ponerlas hoy)
- `comments.csv`, `profile.csv`
- `movies.english_title` (**#388**, ver D9)

Las tres primeras son la «segunda iteración» del plan original.

## 11. La APK: no es un problema de permisos

**Síntoma:** en la APK, pulsar «elegir archivo» en `/importar` no hace nada.

**Diferencial:** la app tiene 6 `<input type="file">`. Cinco usan MIME types
(`image/*`, `image/jpeg,image/png,image/webp`) y funcionan. **Los dos únicos que
usan una extensión son los del importador** (`accept=".csv"` en
`import-form.tsx:65` y `onboarding/import-panel.tsx:115`), y son los dos que
fallan. Esa diferencia decide la rama que toma Capacitor.

`BridgeWebChromeClient.showFilePicker()`
(`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java:374`):

```java
Intent intent = fileChooserParams.createIntent();   // 1 accept type → setType(".csv")
if (acceptTypes.length > 1 || intent.getType().startsWith(".")) {   // ← ".csv" entra
    String[] validTypes = getValidTypes(acceptTypes);   // MimeTypeMap: "csv" → ?
    intent.putExtra(Intent.EXTRA_MIME_TYPES, validTypes);
    if (intent.getType().startsWith(".")) {
        intent.setType(validTypes[0]);                  // ← si está vacío, revienta
    }
}
try { … activityLauncher.launch(intent); }              // ← el try empieza DESPUÉS
```

`getValidTypes` traduce la extensión con `MimeTypeMap.getMimeTypeFromExtension("csv")`.
Dos desenlaces posibles, y **los dos producen el síntoma**:

- **Devuelve `null`** → `validTypes` vacío → `validTypes[0]` lanza
  `ArrayIndexOutOfBoundsException` **fuera del `try`**. El selector no llega a
  abrirse y `filePathCallback` **nunca se resuelve**, así que el `<input>` queda
  muerto: Android no vuelve a abrir un chooser hasta que esa callback se consuma.
- **Devuelve algo** (p. ej. `text/comma-separated-values`) → el picker abre pero
  filtra por ese MIME exacto, y Drive/Descargas etiquetan los CSV como `text/csv`
  o `application/octet-stream` → todo gris, nada seleccionable.

Con `image/*` no se entra en ese `if` en absoluto: por eso el avatar sí funciona.
Capacitor ya puso el guard `startsWith(".")` porque conocía el problema — se les
olvidó el caso de lista vacía.

**Arreglo**, en los dos inputs, y sale gratis porque hay que tocarlos igual para
aceptar el ZIP:

```diff
- accept=".csv"
+ accept=".zip,.csv,application/zip,text/csv,application/octet-stream"
```

Con ≥2 valores, `createIntent()` pone el tipo en `*/*`, `startsWith(".")` es falso,
**la línea que revienta no se ejecuta**, y `EXTRA_MIME_TYPES` va lo bastante ancho
como para que el ZIP descargado sea seleccionable venga de donde venga.

**No se toca el manifest ni se añade ningún permiso.** `ACTION_GET_CONTENT` (SAF)
concede acceso por URI sin permiso alguno; `READ_EXTERNAL_STORAGE` no arreglaría
nada. El único permiso que ese método pide es CAMERA, y solo con `capture` +
`image/*`, que no es este caso.

**Lo que falta por confirmar:** esto es análisis del código, **no reproducido en
dispositivo**. Lo confirma un `adb logcat` mientras se pulsa el botón — si sale el
`ArrayIndexOutOfBoundsException` en `BridgeWebChromeClient`, es la primera rama; si
el picker abre y todo está gris, es la segunda. El arreglo cubre las dos.

**Secuencia:** el APK carga **producción** (`capacitor.config.ts`), así que la
migración por ZIP no es probable en la APK hasta que esté desplegada en prod.

Se abre issue (`area:infra` / `tipo:bug` / `P2`) documentando la rama de Capacitor,
para que el próximo `accept=".xyz"` de cualquier parte de la app no repita el
viaje. El arreglo va en esta PR; el diagnóstico merece quedar escrito aparte.

## 12. Pruebas

| Qué | Cómo |
|---|---|
| `unzip.ts` | ZIP fijo en `e2e/fixtures/`, con una entrada `stored` y otra `deflate` |
| `collect.ts` | los seis CSV de juguete → precedencia diario > watched, join de reviews por `(uri, fecha)`, reseña huérfana que crea su visionado, `ratings.csv` que no pisa una nota del diario |
| `plan-film-passes.ts` | puro: watchlist gana el activo · sin watchlist gana el último visionado · solo watched → un `completed` con fecha · `createdAt` backdateado |
| `chooseBest` | exacto gana a contención; año desempata |
| lista con doble cabecera | nombre y descripción del primer bloque, películas del segundo |
| e2e | ampliar `e2e/importar-letterboxd.spec.ts` con un ZIP; el CSV suelto **debe seguir pasando** |
| idempotencia | importar dos veces el mismo ZIP → segunda corrida sin pases nuevos y **sin llamadas a TMDB** |

Regla del repo que aplica aquí: **provoca el bug y comprueba que el test se pone
rojo**. Un test de `planFilmPasses` que pase con la regla de D3 invertida no está
probando D3.

## 13. Riesgos anotados

1. **D10 mete un pico de fechas.** Quien marcó 600 películas al registrarse en
   Letterboxd verá 600 pases el mismo día en estadísticas. Es consciente y
   reversible (D6).
2. **El auto-pick de D5 mete datos posiblemente erróneos.** Mitigado por la lista
   «revisar» y por deshacer. Sin D6, D5 no sería aceptable.
3. **La primera importación sigue costando ~900 llamadas a TMDB.** No se arregla
   aquí (D9). Minutos de espera con la pestaña abierta; la corrida persistida evita
   que un refresco lo tire, pero no acorta el reloj.
4. **§11 no está reproducido en dispositivo.** El arreglo cubre las dos ramas
   posibles, pero la confirmación es un `adb logcat`.

## 14. Definición de «hecho»

- [ ] `data-model.md` actualizado con `import_runs` / `import_run_items` y su fecha
      de verificación
- [ ] casilla marcada en `backlog.md`
- [ ] entrada **al final** de `decisiones.md` (append-only) con D3, D5, D6 y D10
- [ ] migración aplicada y verificada **en dev y en prod**
- [ ] issue de la rama de Capacitor abierta con sus tres etiquetas
- [ ] verificado en dispositivo, tras desplegar a producción (§11)
