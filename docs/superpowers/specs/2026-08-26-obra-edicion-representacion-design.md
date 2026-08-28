# Obra / Edición / Representación — diseño B′ (Work-first + Edition-on-demand + capa Wikidata)

> **[Spec de diseño · 2026-08-26 · estado: aprobada en sesión de brainstorming, pendiente de plan de implementación]**
> Congelada por feature según la gobernanza documental: describe la decisión, no el estado del código.

## 0. Contexto y problema

Biblioshare distingue Obra (`books`) → Edición (`book_editions`) → Pase (`passes`), con catálogo
cache-as-you-go. La revisión de diseño (sesión 2026-08-26) constató:

- La búsqueda ya es **work-first y solo OpenLibrary** (doble pasada `lang=es`/`lang=en`,
  dedup por work key, título es→en→work). Google Books está muerto en código y su columna borrada.
- El ruido real de ediciones viene de `ensureBookEditions` (`src/lib/editions/sync-editions.ts`):
  persiste hasta ~500 ediciones por obra al abrir la ficha, y de los triggers de «edición primaria»
  (`is_primary`), cuya elección es un accidente del orden de inserción, no una regla.
- `books.isbn/publisher/total_pages` son espejo de la primaria; 7 consumidores aplican la
  precedencia edición-del-pase → primaria → obra.
- **Defecto estructural de OpenLibrary: las traducciones se catalogan como works separados.**
  Verificado con datos reales:
  - «The Midnight Library» = `/works/OL20965973W` (27 ediciones, sin `spa`); «La Biblioteca de la
    Medianoche» = `/works/OL24230447W` (work aparte, 1 edición spa). Portugués: tercer work.
  - «Words of Radiance» = `/works/OL16813053W`; «Palabras Radiantes» = `/works/OL38056408W`.
  - En prod hay ya duplicados materializados: dos filas de Midnight Library (una con el work ES,
    otra manual sin work key con ISBN 9788410138407, que OL no conoce — 404), y la fila local de
    Palabras Radiantes apunta a un work distinto del que la búsqueda devuelve hoy → dos tarjetas.
- Ninguna normalización monolingüe puede casar «Words of Radiance» con «Palabras Radiantes»:
  hace falta una fuente que sepa que son la misma obra. **Wikidata (vía la API de Inventaire) lo
  sabe**: ambas búsquedas devuelven `wd:Q8034469`, con labels multilingües. Verificado también
  para Midnight Library (`wd:Q106814534`, label es «La biblioteca de la medianoche»).
- Inventaire como fuente **primaria** se descartó con datos: cobertura de ediciones anémica
  (15 ediciones para un mega-bestseller, ninguna española), portadas pobres, agujeros en el
  catálogo español medio («La saga de los longevos» no existe). Como **capa de identidad y
  etiquetas**, es exactamente lo que falta.

### Decisiones de producto tomadas en la sesión

1. **Representación GLOBAL de catálogo**: una representación canónica por obra (política
   ES→EN→otro), la misma para todos los usuarios. No per-locale.
2. **Páginas orientativas en la obra**: `books.total_pages` se rellena con un valor representativo
   del proveedor; sirven para el progreso cuando el pase no tiene edición. Las páginas de la
   edición del pase mandan si existe.
3. **Curación manda**: un valor fijado por colaborador es intocable para cualquier automatismo;
   solo re-curación manual lo cambia.
4. **Purga conservadora** de las ediciones auto-sincronizadas no referenciadas.
5. **Picker de edición**: lista de candidatas de OL en vivo (sin persistir), persistiendo solo la
   elegida; el camino recomendado en la UI es escanear/teclear el ISBN.
6. **Google Books entra YA** en esta pieza, como enriquecedor por campo e identidad de último
   recurso por ISBN.
7. **Capa Wikidata/Inventaire aprobada** (B′) para identidad inter-idioma.
8. **Backup previo** a cualquier fase destructiva (sección 8).

## 1. Esquema

### `books` (obra = identidad + representación elegida)

| Cambio | Detalle |
|---|---|
| Nueva `repr_meta jsonb` | Procedencia e idioma por campo representable: `{"title":{"lang":"es","source":"openlibrary"}, "cover":{…}, "synopsis":{…}, "pages":{"source":"google_books"}}`. `lang ∈ es\|en\|other`; `source ∈ openlibrary\|google_books\|wikidata\|manual`. La escriben solo las RPC de hidratación (vía `app.hydrating`) y las actions de curación; gateada a colaborador+ como columna técnica (patrón S2-14, por transición). Sin grants de cliente. |
| Nueva `google_books_volume_id text` | Segundo id externo; índice único sin predicado (los NULL no chocan). GB nunca crea obra salvo el camino ISBN-que-OL-no-conoce. |
| Nueva `wikidata_id text` | Tercer id externo (QID, p. ej. `Q8034469`); índice único sin predicado. Ancla de identidad inter-idioma. |
| `total_pages` re-semantizada | Orientativas de obra (mediana de OL o `pageCount` de GB). Mandan las de la edición del pase si existe. |
| `editions_synced_at` muere | Sin sync masivo no hay nada que marcar. Columna fuera y gate S2-14 ajustado. |
| `isbn`, `publisher` mueren | Eran espejo de la primaria. El ISBN vive en `book_editions.isbn`; la búsqueda local por ISBN pasa a join contra ediciones. El alta manual con ISBN/editorial crea obra **+ edición**. |
| Sin cambios | `title`, `author`, `cover_url`, `synopsis`, `published_year`, `genres`, `openlibrary_work_key`, `hydrated_at`. La identidad interna sigue siendo `books.id`; los tres ids externos son opcionales (obra manual, GB-only o OL-only siguen siendo posibles). |

Tres columnas de id externo bastan; **no** se introduce tabla genérica de identificadores
(YAGNI: se reevaluará si aparece un cuarto proveedor).

### `book_editions` (solo tiradas identificadas)

- **`is_primary` muere**: columna, índice parcial único `book_editions_one_primary` y los dos
  triggers (`books_create_primary_edition`, `ensure_primary_book_edition`). Ninguna edición es
  «la canónica»; la representación de la obra vive en `books`.
- Resto igual: `label`, `publisher`, `published_year`, `language`, `total_pages`, `isbn`,
  `cover_url`, `created_by`; unicidad `(book_id, isbn)`; guard de borrado en uso.
- Solo entran por: elección en el picker (lista OL en vivo), escáner/tecleo de ISBN, import CSV
  con ISBN, alta manual de colaborador.

### `passes`

Sin cambios de esquema. `edition_id NULL` es estado legítimo permanente («no sé / no me importa
qué edición»), no «pendiente de asignar primaria».

## 2. Política ES → EN → otro (representación)

- **Rango de idioma:** `es = 0, en = 1, other = 2, desconocido = 3`. Por campo (título, portada,
  sinopsis), no por obra entera: portada española con sinopsis inglesa es un resultado válido.
- **Regla de escritura única** — `hydrate_book` pasa de fill-only puro a **fill-or-upgrade**:

  ```
  escribe(campo, valor, lang, source) si:
    1. repr_meta[campo].source != 'manual'         -- curación manda, siempre
    2. y ( campo vacío
           o rank(lang) < rank(repr_meta[campo].lang ?? desconocido) )
  ```

  - Un valor automático inglés es mejorable a español en cualquier visita futura: la primera
    hidratación no condena.
  - Empate de rango: no se pisa (estabilidad, nada de flapping entre dos ediciones españolas).
  - Filas antiguas sin `repr_meta`: rango «desconocido» → cualquier candidata ES/EN las mejora.
- **Candidatas por idioma, sin persistir ediciones** (en hidratación, tras `fetchWork`):
  1. Escaneo acotado de ediciones OL en vivo (~2 páginas, 200 máx., filtros de `pickEditions`):
     mejor edición ES y mejor EN → título y portada candidatos.
  2. Labels de Wikidata (`es`, `en`) como candidatas de **título** — cubre el caso Midnight
     Library, donde la edición ES cuelga de otro work y OL no da título español.
  3. Google Books por campo (sección 4).
  4. Último fallback: valores del work (título original, portada del work) con `lang:'other'`.
  - Sinopsis: regla práctica es→en→work; GB con `langRestrict=es` es el proveedor realista de
    sinopsis en español.
- **Curación**: `edit-actions` (título/portada/sinopsis manual, `setOfficialCover`, galería)
  escriben `repr_meta[campo] = {source:'manual'}`. El trigger de curación existente sigue igual
  para valor→valor de cliente; esta política vive dentro de las RPC.

## 3. Búsqueda, alta e hidratación

- **Búsqueda por texto:** fan-out actual (OL `lang=es` + `lang=en`) **+ tercera pasada
  Inventaire** (`/api/search?types=works`), cada una con su `.catch(() => [])`. Normalización
  igual que hoy, más el **colapso por QID** (sección 7). La tarjeta sigue sin escribir nada
  (escalera de hidratación intacta).
- **Búsqueda por ISBN:** local contra `book_editions.isbn` (join a la obra) → `lookupIsbn` OL →
  **GB `q=isbn:…`** como identidad de último recurso (obra GB-only, sin work key). El ISBN
  buscado explícitamente (escáner o tecleo) cuenta como identificación de edición: se registra la
  edición y se asocia al pase si se crea. **Es el único automatismo de creación de ediciones que
  sobrevive.**
- **Alta (clic/añadir):** `register_catalog_item` shell por work key, igual que hoy.
  `ensureBookEdition` desaparece del alta genérica. Obra GB-only o manual: RPC de alta ampliada.
- **Hidratación (`ensureBookHydrated`):** igual de perezosa (`after()`, presupuesto, guard),
  pero: recoge candidatas por idioma y llama a `hydrate_book` con valor+lang+source por campo;
  rellena `total_pages` orientativas; resuelve `wikidata_id` (sección 7). El guard `hydrated_at`
  pasa de «una vez y nunca más» a **cooldown**: re-evaluar solo si algún campo tiene rango > 0 o
  está vacío **y** `hydrated_at` es viejo (~30 días). La mayoría de obras quedan en ES y no
  reconsultan.
- **`sync-editions.ts` muere.** `loadBookEditions` devuelve solo las persistidas.
  `resyncEditions` de colaborador se sustituye por «re-evaluar representación» (fuerza la
  re-hidratación con la política de la sección 2).
- **Bibliografía por autor:** sin cambios (author_key, doble pasada, dedup por intersección de
  títulos).

## 4. Google Books

**Papel: enriquecedor por campo + identidad de último recurso. Nunca duplica.** Un resultado GB
jamás crea obra si la búsqueda fue por texto; solo enriquece obras existentes o crea obra por
ISBN que OL no conoce.

- **Enriquecimiento** (dentro de la hidratación, tras OL), por campo vacío o con rango > 1:
  - Sinopsis: `volumes?q=intitle:… inauthor:…&langRestrict=es` → luego `en`.
  - Portada: `imageLinks` (normalizada a `https`, mayor tamaño con `zoom`) si OL no dio ES/EN.
  - Páginas orientativas: `pageCount` si OL no dio mediana.
  - **Match antes de aceptar:** por ISBN de alguna edición conocida; si no, título+autor
    normalizados. Sin match fiable → no se enriquece (mejor hueco que dato de otra obra).
  - Al aceptar algo se persiste `google_books_volume_id`.
- **Fontanería:** allowlist de portadas ampliada con el host real de `imageLinks` (verificar en
  implementación; presumiblemente `books.google.com`). API key en env del servidor; sin key, GB
  desactivado y todo degrada a OL-only. GB solo en hidratación/`after()`, nunca en el camino
  síncrono de búsqueda por texto; máx. 2 llamadas por obra y evaluación; el cooldown evita
  martilleo. `source:'google_books'` es reversible: si aparece edición ES en OL, el rango de
  idioma decide, no el proveedor.

## 5. Consumidores

- **Precedencia de páginas: de 3 niveles a 2** — `edición del pase → books.total_pages`
  (orientativas). Afecta a: `src/lib/sessions/actions.ts`, `src/lib/sessions/load-context.ts`,
  `log-panel`, `src/lib/library/get-library-items.ts`, `src/lib/pace/fetch-catalog-meta.ts`
  (pierde también su tercer nivel «cualquier edición con páginas»), sorteo, y el snapshot SQL del
  widget. El rail de PC de la ficha (`libro/[id]/page.tsx`) se alinea con la precedencia común.
  Hitos de club: sin cambio de comportamiento, mejor poblado.
- **Picker de edición:** candidatas = lista OL en vivo (filtros de `pickEditions`, orden
  ES→EN→resto) + las persistidas del libro destacadas primero. CTA principal: «Escanea o teclea
  el ISBN». Elegir candidata OL → `register_book_edition` de esa única edición + `setPassEdition`.
  «No lo sé» sigue igual. Se borra el código muerto `src/lib/passes/edition-choice.ts` y su
  lector en `log-panel`.
- **Import CSV:** fila con ISBN = identificación explícita → se registra la edición y
  `commit-row` escribe `edition_id` (arregla además el defecto actual: la llamada sin `userId`
  perdía todos los ISBN de Goodreads). Fila sin ISBN: obra sola, `edition_id NULL`.
- **Ficha:** la tira de ediciones muestra solo las identificadas; con cero, CTA de identificar
  (decisión fina de UI en el plan). Colaborador: crear/editar/borrar edición manual igual.

## 6. Reconciliación y fusión (capa Wikidata)

- **Colapso en búsqueda:** los works de OL que casen con la misma entidad de Inventaire
  (título contra labels + verificación de autor) se funden en una tarjeta. La tarjeta colapsada
  **conserva el work key que ya exista en local** (lo local va primero, como hoy) → el clic no
  crea una segunda fila. Título de la tarjeta según política ES→EN.
- **Backstop en hidratación:** al resolver el QID, si otra obra ya lo tiene (`wikidata_id`
  único) → fusión cobarde (patrón `20260870`): gana la fila con más rastro de usuario, aborta si
  chocara con un único de tabla de usuario. Con shells sin pases es trivial.
- **Obras sin work key (manuales, GB-only):** reconciliación vía búsqueda Inventaire por
  título+autor (su búsqueda es fuzzy: casa «La Biblioteca de Medianoche» con «La biblioteca de
  la medianoche»), verificada contra autor. QID asignado → dup detectado → fusión; el ISBN de la
  fila manual se registra como `book_edition` real de la obra superviviente.
- **Regla de seguridad:** sin verificación de autor no hay match; ante duda, no fusionar. Un
  duplicado visible es recuperable; una fusión errónea destruye.
- **Dependencia blanda:** Inventaire caído o sin match → todo degrada al diseño sin capa
  (tarjetas sin colapsar, sin QID). Ninguna ruta depende de él para funcionar.

## 7. Migración y despliegue

Orden del repo: dev primero; aditivas antes del deploy, destructivas después de verde en prod.

**Fase 0 — backup (antes de tocar nada, en cada entorno):**
- Copia íntegra de las tablas afectadas a un esquema de respaldo con fecha:
  `create schema backup_obra_edicion_20260826` + `create table … as select` de **`books`,
  `book_editions` y `passes`** (esta última solo por `edition_id`, pero se copia entera: es
  barata y es la que duele). Sin `psql` en esta máquina, se hace vía MCP/SQL editor.
- Verificar counts origen = respaldo antes de continuar. El esquema de respaldo se borra en una
  migración posterior, cuando la pieza lleve estable un ciclo (issue de recordatorio al crearlo).
- Además: comprobar que el backup automático diario de Supabase del proyecto prod está
  disponible como segunda red.

**Fase a — aditiva (antes del deploy):**
1. `books.repr_meta`, `books.google_books_volume_id`, `books.wikidata_id` + índices únicos sin
   predicado. Sin grants de cliente (escriben solo RPC `SECURITY DEFINER` y actions de
   colaborador) — evita la trampa #375 por diseño; superficie 6 de DRIFT-CHECK igualmente.
2. `hydrate_book` nueva firma (**`drop function` antes de `create`**): valor+lang+source por
   campo, fill-or-upgrade + respeto a `source:'manual'`.
3. Backfill `repr_meta`: valores existentes → `lang: desconocido, source: 'openlibrary'`
   (mejorables). **Limitación asumida:** la curación manual previa a la migración es
   indistinguible y queda mejorable; si una re-evaluación la pisa, el colaborador re-cura (y ahí
   queda `manual`). Issue `tipo:deuda` documentándolo.
4. Ampliación del alta manual / GB-only (RPC).
5. **Barrido único de reconciliación** (catálogo pequeño): resolver QID de cada obra vía
   Inventaire (título+autor con verificación de autor; sin match fiable → sin QID) y fusión
   cobarde de los que colisionen. Limpia los dups ya materializados en prod (Midnight ×2,
   Palabras Radiantes cuando aparezca el segundo).

**Fase b — deploy de código:** búsqueda ISBN contra `book_editions`, muerte de `sync-editions`,
picker nuevo, precedencia 2 niveles en todos los consumidores + widget SQL, import con
`edition_id`, GB, capa Inventaire, borrado de código muerto.

**Fase c — destructiva (tras verde en prod):**
6. Purga conservadora de `book_editions`: se conservan las referenciadas por `passes.edition_id`
   (el guard de borrado ya las protege) y las de `created_by` con rol colaborador/admin; el
   resto fuera. Ante duda, conservar.
7. Drop: triggers de primaria (×2), índice parcial, `book_editions.is_primary`,
   `books.editions_synced_at`, `books.isbn`, `books.publisher`. Gate S2-14 ajustado.

**Sin backfill masivo de representación:** `total_pages` orientativas y mejoras ES llegan
cache-as-you-go vía el cooldown de re-evaluación. Cero barrido de API (el único barrido es el de
QID, que es una llamada barata a Inventaire por obra, una vez).

**Verificación:** e2e contra build de producción (alta desde /buscar, ficha con datos,
identificar edición por ISBN, import con ISBN, colapso de duplicado conocido); objetos reales en
dev y prod (`pg_proc`, `pg_attribute`), nunca `list_migrations`.

**Doc al cerrar:** `data-model.md` (esquema + fecha), `decisiones.md` append (política ES→EN,
muerte de la primaria, papel de GB, capa Wikidata), backlog, issues nuevas (deuda de curación
previa, verificación del host de imágenes GB, recordatorio de borrar el esquema de backup).

## 8. Supuestos actuales que este diseño rompe

1. «Abrir una ficha sincroniza todas las ediciones de OL» → muere (`sync-editions.ts`).
2. «Toda obra tiene una edición primaria» → muere (`is_primary`, triggers, y el peldaño
   intermedio de la precedencia de páginas).
3. «`books.isbn/publisher/total_pages` espejan la primaria» → mueren las dos primeras;
   `total_pages` cambia de semántica (orientativas de obra).
4. «Fill-only puro: el primer valor gana para siempre» → fill-or-upgrade por rango de idioma
   (la curación manual sigue siendo intocable).
5. «`hydrated_at` = nunca más preguntar» → cooldown condicionado a representación mejorable.
6. «El título/portada que diga OL es el bueno» → política ES→EN→otro con candidatas de
   ediciones OL, labels de Wikidata y GB.
7. «Un work key de OL identifica la obra» → `books.id` identidad interna; work key, volume id y
   QID son anclas externas opcionales; la identidad inter-idioma la da el QID.

## 9. Contrato que queda fijado (para el plan de implementación)

- La búsqueda no escribe en BD. El alta crea shell por id externo. La hidratación escribe solo
  por RPC `SECURITY DEFINER` con `app.hydrating`, fill-or-upgrade según sección 2.
- Ninguna ruta crea `book_editions` salvo: elección explícita en picker, ISBN
  (escáner/tecleo/CSV), alta manual de colaborador.
- `passes.edition_id NULL` es permanente y legítimo; precedencia de páginas de 2 niveles.
- Proveedores: OL = identidad y bibliografía principal; Wikidata/Inventaire = identidad
  inter-idioma y labels (dependencia blanda); GB = enriquecimiento por campo e identidad por
  ISBN de último recurso. Ningún proveedor es imprescindible para que una obra exista.
- Fusión de obras: siempre cobarde, siempre con verificación de autor, nunca automática sin QID.
