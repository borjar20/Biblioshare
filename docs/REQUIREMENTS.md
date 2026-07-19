# Biblioshare — Requisitos y alcance

Última actualización: 2026-07-19

## 1. Visión

Una PWA para llevar el registro de tus "hobbies de consumo cultural": libros, películas y series. Para cada uno se guardan metadatos (autor, sinopsis, portada...) y tu progreso/estado personal (leyendo, terminado, valoración...). Cada usuario tiene un perfil público donde otros pueden ver su colección.

Pensar en ello como un Goodreads + Letterboxd + trackers de series, unificado, con estética visual centrada en portadas.

## 2. Usuarios y cuentas

- Multi-usuario: cualquiera puede registrarse (Supabase Auth).
- Cada usuario tiene un **perfil público** en `/u/[username]`:
  - Visible por defecto a cualquier visitante (con o sin cuenta).
  - El propio usuario puede marcar su perfil como **privado** (solo él ve su colección/progreso).
- **Fuera de alcance del MVP**: seguir a otros usuarios, feed de actividad, notificaciones sociales, comentarios. Se revisita en v2 (ver §7).

## 3. Modelo de datos

Arquitectura elegida: **"columna vertebral compartida"**. El metadata (que varía mucho por
tipo) vive en tablas separadas y tipadas; el progreso del usuario (casi idéntico entre tipos)
vive en una única tabla `library_entries`. Así, **añadir un hobby nuevo = 1 tabla de metadata +
su integración de API**, reutilizando el mismo RLS, la misma query de "mi biblioteca" y la misma
UI de progreso. Ver §9 (decisiones) para el razonamiento.

### 3.1 Catálogo (compartido entre usuarios) — *creado*
Tablas `books`, `movies`, `series`.
- Metadatos propios de cada tipo (autor/director/creador, portada, sinopsis, año, género...).
- Se rellenan automáticamente vía búsqueda en APIs externas (ver §4.2) y se comparten entre todos los usuarios (evita duplicar/re-consultar la misma película dos veces).
- `SELECT` abierto a cualquiera (incl. visitantes sin cuenta) — necesario para renderizar perfiles públicos; son metadatos públicos no sensibles.
- `INSERT` restringido a usuarios autenticados (al trackear algo se añade el ítem al catálogo si no existe).

### 3.2 Progreso unificado — *creado*
Tabla única `library_entries` (una fila por `usuario` × `ítem de catálogo`):
- `item_type` (`book` | `movie` | `series`, **extensible**) + `item_id` → referencia polimórfica al catálogo.
- `status`: `planned` | `in_progress` | `completed` | `dropped`.
- `rating` 1–10, `started_at`, `finished_at`, `notes` — comunes y tipados.
- `position` (JSONB): el único detalle que varía por tipo. Ej: `{"page": 42}` (libros), `{"season": 2, "episode": 5}` (series). La app valida su forma con los tipos de TypeScript.
- **Semántica del rating** (aclaración, *desactualizada, ver §7.37*): `library_entries.rating` es la **nota actual** del ítem (la que se muestra en el perfil y en los agregados de comunidad); `diary_entries.rating` (§3.3) es la nota **de cada pase concreto**, que puede variar entre relecturas. Al registrar un pase se puede poner una nota distinta sin alterar la nota actual; son campos independientes a propósito.
  - **Ya no es así (2026-07-14)**: `library_entries.rating` y `library_entries.notes` quedaron **huérfanos a propósito** al construir el registro de pases (§7.37) — el pase (`diary_entries`) pasa a ser el único dueño de la nota y la reseña. La media de comunidad y "tu nota" salen del **último pase cerrado no abandonado**, no de esta columna. Ambas columnas se dejan en la base de datos sin escritura ni lectura, para poder revertir sin pérdida; su eliminación queda para una limpieza posterior fuera de esta spec.
- RLS: el dueño ve/edita sus filas; cualquiera (incl. anónimo) puede **leer** las filas de un perfil público. Escritura solo el dueño.
- Trade-off aceptado: los detalles finos de `position` no se validan a nivel de BD (viven en JSONB), a cambio de eliminar la deuda de replicar toda la vertical por cada tipo nuevo.

### 3.3 Diario de pases (relecturas / re-visionados) — *creado*
Tabla `diary_entries` (muchas filas por `library_entry`):
- `library_entry_id` → FK al ítem de la estantería (borrado en cascada).
- `started_on`, `finished_on` (fecha del pase), `rating` (de ese pase), `review` (reseña de ese pase).
- Permite registrar leer/ver el mismo ítem varias veces con sus propias fechas y valoraciones (estilo diario de Letterboxd).
- Separación clave: `library_entries` = **estado actual** del ítem; `diary_entries` = **historial de pases**. Añadir el diario después con datos reales habría sido una migración dolorosa, por eso se modela desde el MVP.
- RLS: mismo modelo que `library_entries` (dueño escribe; lectura pública si el perfil lo es).
- **Actualización (2026-07-14, ver §7.37)**: esta tabla es ahora, literalmente, el **pase**. `finished_on` pasa a nullable (`null` = pase abierto, "lo estoy leyendo/viendo ahora"); ganó `is_public` (interruptor de visibilidad, antes solo existía a nivel de perfil) y `edition_id` (la edición contra la que se hizo el pase). Antes solo modelaba pases ya cerrados; ahora también el que está en curso. El nombre físico de la tabla no cambió — ver §7.37 para el porqué.

### 3.4 Perfiles — *creado*
Tabla `profiles`:
- `user_id` (FK a `auth.users`, PK)
- `username` (único, `^[a-z0-9_]{3,30}$`, usado en la URL pública; **modificable** después, con unicidad garantizada)
- `display_name`, `avatar_url`, `bio`
- `is_public` (boolean, default `true`)
- `created_at`, `updated_at`
- RLS: perfiles públicos legibles por cualquiera (incl. anónimo); el dueño siempre ve el suyo. Solo el dueño inserta/edita.

### 3.5 Episodios de serie (catálogo + visionado por episodio) — *creado*
Capa por episodio para series (§7.36), **aditiva**: convive con la nota global de serie
(`library_entries.rating`) sin alterar comunidad/stats/retos, que la siguen usando.

- **`series_episodes`** (catálogo compartido): `series_id` (FK a `series`, cascada),
  `season_number`, `episode_number`, `title`, `synopsis`, `still_url`, `air_date`,
  `runtime_minutes`. UNIQUE `(series_id, season_number, episode_number)`. Se rellena
  **cache-as-you-go** desde TMDB (`/tv/{id}/season/{n}`) la primera vez que se abre la ficha,
  igual que `credits`/sagas (§7.34); mismo RLS que el resto del catálogo (SELECT abierto,
  INSERT/UPDATE autenticado).
- **`episode_watches`** (contenido de perfil, público como `diary_entries`): `user_id`,
  `series_id`, `season_number`, `episode_number`, `rating` (1–10, **nullable** = visto sin
  nota), `review` (nullable), `watched_on`. UNIQUE `(user_id, series_id, season, episode)`.
  **La existencia de la fila = episodio visto.** RLS idéntico a `diary_entries`: el dueño
  siempre; cualquiera si el perfil es público; escritura solo el dueño.
- **Semántica**: marcar un episodio visto adelanta `library_entries.position` de la serie al
  episodio visto más avanzado (mismo "roll forward" que `addSession`, §7.14) y saca la serie
  de `planned`. La rejilla comunidad (temporada × episodio) y las reseñas por episodio se
  **agregan al vuelo** desde `episode_watches` (RLS filtra a públicos + propios), no hay tabla
  de agregados.

## 4. Funcionalidades del MVP

### 4.1 Autenticación
- Registro / login (email+contraseña; valorar login social como Google más adelante).
- Cada usuario elige un `username` único al registrarse (o en onboarding posterior).

### 4.2 Añadir ítems a tu colección
- Buscador que consulta:
  - **Google Books API** para libros.
  - **TMDB API** para películas y series.
- Al seleccionar un resultado: se guarda (o reutiliza si ya existe) en la tabla de catálogo correspondiente, y se crea una fila de progreso para el usuario actual con estado inicial `planned`.
- También debe poder añadirse un ítem manualmente (sin encontrarlo en la API).

### 4.3 Gestión de la colección personal
- Listado de "mi colección" con filtros por tipo (libro/película/serie) y por estado.
- Editar el estado del ítem: estado, rating actual, página/episodio actual (`position`), notas.
- **Registrar un pase en el diario**: al terminar (o re-leer/re-ver) un ítem, se crea una entrada de diario con fecha, rating y reseña propios. Un ítem puede acumular varios pases.
- Eliminar un ítem de tu colección (no borra el catálogo compartido, solo tu fila de estantería y sus entradas de diario).

### 4.4 Perfil público
- Página `/u/[username]` mostrando la colección del usuario (si `is_public`), agrupada/filtrable por tipo y estado.
- Visible para **cualquier visitante, con o sin cuenta** (si el perfil es público).
- Si el perfil es privado, solo el propio usuario (autenticado) puede verlo.

### 4.5 PWA
- Instalable (manifest + iconos + `display: standalone`).
- **Offline**: cache de solo lectura vía service worker — se puede navegar la colección ya cargada sin conexión. Añadir/editar requiere conexión (no hay cola de sincronización offline en el MVP).

### 4.6 Estética visual
- Grids de portadas grandes, estilo Letterboxd/Goodreads — el contenido visual (portada) es el protagonista de las listas, no tablas de texto.

### 4.7 Internacionalización (i18n)
- Toda la UI pasa por un sistema de traducción desde el primer componente (nada de textos hardcodeados).
- Idioma inicial: español. La arquitectura permite añadir inglés u otros después sin refactor.

## 5. Explícitamente fuera de alcance del MVP

Estas ideas se guardan para una v2, no se implementan ahora:

- Seguir usuarios / feed de actividad social / notificaciones.
- Dashboard de estadísticas (libros por mes, horas vistas, géneros favoritos, gráficos).
- Offline-first con edición sin conexión y sincronización posterior.
- Apps nativas (React Native u otro) — se decidió PWA-only.
- Recomendaciones (colaborativas o por IA).
- Comentarios / reseñas largas en ítems.
- Listas personalizadas (ej. "mis 10 favoritos de 2026").

## 6. Tareas técnicas pendientes derivadas de este documento

- [x] Migración: crear tabla `profiles` (con `username` único, `is_public`).
- [x] Migración: modelo de progreso unificado `library_entries` con RLS de lectura pública según `profiles.is_public`.
- [x] Migración: `diary_entries` para relecturas/re-visionados.
- [x] Elegir e integrar librería de i18n para App Router (`next-intl`).
- [x] Definir clave de TMDB API (variable de entorno, no comprometida en el repo).
- [x] Diseñar el service worker / estrategia de cache para el modo offline de solo lectura.
- [x] Definir flujo de onboarding (elección de `username` tras el primer login).
- [x] Página de perfil público `/u/[username]` con toggle de visibilidad público/privado.
- [x] Definir helpers/tipos de la capa de dominio para `position` (JSONB) por tipo de ítem, con UI de edición de rating/progreso/notas en "Mi biblioteca".
- [x] UI del diario de pases (relecturas/re-visionados) en "Mi biblioteca".
- [x] Flujo de "añadir ítem manualmente" (`/buscar/manual`) sin depender de la API externa — cierra §4.2.

## 7. Tareas pendientes (v2)

Formato checklist para seguimiento, pero **siguen siendo candidatas, no compromisos firmes**: no hay fecha ni orden asignado salvo que se diga explícitamente. Se marcan `[x]` solo cuando se implementan de verdad.

### 7.1 Metadatos de libro más ricos — *hecho*
- [x] Editorial y nº de páginas en la ficha de libro (`books.publisher`, `books.total_pages`) — capturados automáticamente al buscar (Google Books) o al añadir manualmente; mostrados en resultados de búsqueda y en "Mi biblioteca".
  - Editorial y nº de páginas son propiedades de la *obra* → tabla `books` (catálogo compartido).
  - **Desactualizado (2026-07-14, ver §7.38)**: en la **ficha** (`/libro/[id]`, `/pelicula/[id]`), el panel de metadatos **ya no pinta** editorial, ISBN, páginas ni idioma de `books`/`movies` — son datos de la *edición*, no de la obra, y mostrarlos ahí era directamente falso para quien tiene una tirada distinta a la primaria. El panel se queda con autoría, año de primera publicación y géneros; editorial/ISBN/páginas se ven pulsando una tarjeta de la tira de ediciones (§7.38, Fase A). Las columnas `books.publisher`/`.isbn`/`.total_pages` **no se borran** (las sigue usando el importador y los triggers de alta de edición primaria), solo dejan de pintarse en la ficha. **Deuda sin cerrar**: `library-item-card.tsx` y `search-result-card.tsx` (tarjetas de "Mi biblioteca" y de resultado de búsqueda) siguen pintando `publisher`/`pageCount` de `books` tal cual — fuera del alcance de §7.38, que solo tocó la ficha de detalle.
- [x] Encuadernación/formato (bolsillo, tapa blanda, tapa dura) — editable desde "Editar progreso" en "Mi biblioteca".
  - Es propiedad de **tu ejemplar**, no de la obra: vive en `library_entries.position` (tipado en `src/lib/library/position.ts`), no en `books` — consistente con cómo `position` ya modela lo que varía por usuario y por tipo.
  - **Desactualizado (2026-07-14, ver §7.37)**: el formato del ejemplar lo dice ahora la **edición** (`book_editions`/`movie_versions`) del pase, no un campo suelto de progreso — "tapa dura" o "bolsillo" son dos ediciones distintas del mismo libro, cada una con su propia paginación. `position.format` se conserva en el tipo por compatibilidad de lectura (datos antiguos, `session-list.tsx`, checkpoints de club) pero **ya no se escribe**: no existe "Editar progreso" como pantalla — el panel murió junto con `item-manage-panel.tsx`/`progress-panel.tsx`. Elegir edición se hace desde el panel Progreso de la pestaña Registro (§7.37).

### 7.2 Búsqueda de libros por ISBN — *hecho*
- [x] Buscar un libro por **ISBN** además de por título: autodetección en `src/lib/catalog/isbn.ts` (10 o 13 dígitos, tolerando guiones/espacios y la `X` final del ISBN-10), enrutada como `q=isbn:...` en Google Books.
- [x] ISBN capturado en el catálogo (`books.isbn`) leyendo `industryIdentifiers` de la respuesta, y también disponible en "añadir manualmente" con su propia validación.
- [x] Datos mock actualizados (`MOCK_EXTERNAL_APIS=true` soporta búsqueda por ISBN también).
- [x] **Búsqueda inversa para datos incompletos**: un hit directo por ISBN a veces viene sin portada o sin sinopsis (ediciones "delgadas" de Google Books). `src/lib/catalog/google-books.ts` detecta esto (`isIncomplete`: falta `coverUrl` o `synopsis`) y hace una segunda búsqueda por título+autor, rellenando solo los campos que faltaban — conserva el ISBN/identidad del hit original, no lo sustituye por otra edición. Verificado en producción con datos reales (Google Books devuelve intermitentemente `503`, manejado como "sin resultados" en vez de error).
  - **Desactualizado (2026-07-15, ver §7.39)**: ya no hay Google Books (`google-books.ts` era código muerto y se ha borrado) ni búsqueda inversa. Un ISBN es un *lookup* que resuelve la **obra** (`openlibrary/isbn-lookup.ts`), y los datos que faltaban —sinopsis, géneros, portada— los trae la hidratación de la obra al abrir su ficha, no una segunda búsqueda por título. El agrupado de ediciones por título+autor (`group-editions.ts`) también desaparece: `search.json` ya devuelve obras.

### 7.3 Escanear código de barras para añadir por ISBN — *hecho (versión nativa)*
- [x] Botón de cámara en la búsqueda de libros (`src/app/buscar/barcode-scanner.tsx`), visible **solo dentro del wrapper nativo de Capacitor** (`Capacitor.isNativePlatform()`) — nunca en la PWA web, porque no hay una vía web fiable de escaneo (ver 8-F). Usa `@capacitor-mlkit/barcode-scanning` (`scan()`, formatos `Ean13`/`Ean8`) y navega a `/buscar?type=book&q=<isbn>`, reutilizando la autodetección de ISBN de 7.2 sin cambios.
  - Reemplaza la primera versión (web, `BarcodeDetector`) construida antes de decidir adoptar Capacitor (8-F) — se descartó por completo en vez de mantenerla como fallback, ya que la cobertura de `BarcodeDetector` era el motivo original para considerar ir nativo.
  - **Sigue pendiente**: verificar con cámara real en un dispositivo — este sandbox no tiene Android SDK/emulador instalado (ver §7.31/`docs/TESTING.md`). Solo se ha podido comprobar que el botón no aparece en web (comportamiento esperado) y que `tsc`/`eslint` pasan.

### 7.4 Sagas y colecciones (gestionadas por separado) — *saga: hecho; colección: pendiente*
- [x] **Sagas** implementadas en 7.34: tabla `sagas` + `saga_items` (catálogo compartido), autopobladas para cine desde TMDB `belongs_to_collection` y asignables a mano para libros, con vista propia `/saga/[id]`. Ver 7.34 para el detalle.
  - Se optó por una **tabla `sagas` dedicada** (agrupación 1→N con vista propia) en vez de reutilizar la tabla genérica par-a-par de 8-B, precisamente porque el objetivo pedido era una *vista de saga* (agrupar+ordenar sobre relaciones par-a-par es más costoso de consultar). 8-B sigue vigente para relaciones *entre tipos distintos* (adaptación libro↔película), que es un caso diferente.
  - "series" ya significa "series de TV"; se usa **"saga"** para la agrupación, evitando la colisión.
- [x] **Sagas v2, fase 1 de 4** (2026-07-19, `docs/superpowers/specs/2026-07-19-sagas-v2-design.md`) — construida y **verificada en navegador**, migraciones **aplicadas también en prod** (actualización 2026-07-19: las 6 migraciones, incl. `sagas_insert_hardening`, se desplegaron a prod al mergear el PR #87; `schema-baseline.sql` ya las anexa): sagas dejan de ser planas — `sagas` gana `parent_saga_id` (jerarquía real de **subsagas anidadas**, con trigger anti-ciclos) y `accent_color`; `saga_items` pasa de "un ítem = una sola saga" a **multi-membresía** (`UNIQUE (saga_id, item_type, item_id)` + `is_primary` con índice único parcial, `getItemSagas` ordena primary primero). Ficha `/saga/[id]` reconstruida con el patrón hero+tabs: abanico, byline por créditos dominantes, chips, progreso segmentado por subsaga, botón «Seguir esta saga» (sobre la nueva tabla `saga_follows`), chip «Parte de {padre}», y pestaña Info con títulos agrupados por subsaga (grupo «Nexo» beige para miembros directos, solo si hay hijas). `assignItemToSaga` ya no borra membresías previas (upsert + `is_primary`); `populateTmdbCollection` pasa a un diff no destructivo (`planCollectionSync`) en vez de delete+insert. Tablas `saga_nodes`/`saga_edges` (grafo de lectura) creadas con RLS pero **vacías y sin UI** — ver detalle en 7.34.
- [x] **Sagas v2, fase 2 de 4** (2026-07-19, misma spec, §2.4-§2.5) — construida y **verificada** (QA de navegador 8/8 sobre un grafo sembrado en dev, 10 nodos/7 aristas; e2e nuevos `sagas-v2-mapa.spec.ts` 4/4): pestaña «Mapa de lectura» en `/saga/[id]` (solo si la saga tiene nodos; conmutador cliente `SagaTabs` vía `?tab=`, infonote dorada en Info). Móvil: timeline vertical ramificado **derivado determinísticamente del grafo** (`deriveTimeline` — secciones por subsaga consecutiva, ramas opcionales/de requisito, puentes de nexo), con CTA de mini-preview SVG a coordenadas reales y opción «Ver como lista lineal»; toggle Lectura|Publicación (`?orden=`; publicación = orden por año de catálogo, `books.published_year`/`movies|series.release_year`). PC: grafo embebido en la ficha + ruta `/saga/[id]/mapa` a pantalla completa, renderizado con **React Flow** (`@xyflow/react` v12, dependencia nueva) — nodos custom Paper (portada/medallón/tarjeta de saga anidada), aristas sólida-color-subsaga / discontinua-ámbar / punteada-beige, canvas oscuro fijo. De paso, se pulió el perf de `getSagaDetail` (deuda de fase 1): `getSagaBase` deja de resolver miembros dos veces y pasa a un único `auth.getUser()`.
  - **Deuda asumida a propósito para fase 3**: la navegación de nodos del grafo solo funciona con puntero — `elementsSelectable=false` en React Flow limita la navegación por teclado; documentado en el propio código, no resuelto aquí.
  - **Pendiente (fases 3-4, misma spec)**: editor del grafo para collaborator+ (`saveSagaGraph`) — el grafo hoy solo se puede poblar por SQL, sin editor —, y pestaña «Sagas» en Mi Biblioteca (`getFollowedSagas`, follow/unfollow desde la lista de sagas seguidas).
- [ ] **Colecciones/listas curadas por el usuario** (privadas): siguen pendientes — son una feature distinta de las sagas (metadato de catálogo). Ver 7.15/7.26 para la versión de listas por usuario/colaborativa.

### 7.5 Etiquetas privadas + estadísticas por etiqueta
- [ ] Etiquetas libres y **privadas** por usuario sobre sus ítems (ej. "para regalar", "recomendado por mamá", "confort") — no son públicas ni compartidas entre usuarios, a diferencia del catálogo.
- [ ] Panel de estadísticas agrupadas por etiqueta (depende de lo anterior).

### 7.6 Seguir editoriales y ver sus novedades
- [ ] Seguir editoriales y recibir sus **novedades / próximos lanzamientos**.
  - Depende de capturar la **editorial** en el catálogo (7.1).
  - **Riesgo técnico a investigar**: las APIs actuales (Google Books) no exponen un feed fiable de "novedades por editorial" — evaluar la fuente de datos antes de comprometerlo.

### 7.7 Importar biblioteca desde Goodreads / Letterboxd / Bookmory — *hecho*
- [x] Página `/importar` (`src/app/importar/{page,actions,import-form,unmatched-row-form}.tsx`): sube un fichero exportado de **Goodreads** (CSV), **Letterboxd** (`diary.csv`) o **Bookmory** (`.xlsx`), lo parsea, matchea cada fila contra el catálogo/APIs externas y crea/actualiza `library_entries` + `diary_entries` de golpe, reutilizando `findOrCreateCatalogItem`. Formato autodetectado en `src/lib/import/detect-format.ts`; parsers dedicados por fuente (`parse-goodreads.ts`, `parse-letterboxd.ts`, `parse-bookmory.ts`, todos con salida a un `types.ts` común); matching en `match-row.ts`; alta/actualización de fila en `commit-row.ts`. Dependencias nuevas: `papaparse` (CSV) y `xlsx` (Bookmory). `next.config.ts` sube `experimental.serverActions.bodySizeLimit` a `5mb` para admitir CSVs/XLSX grandes.
  - **Alcance ampliado en curso de implementación**: el ítem original solo mencionaba Goodreads/Letterboxd; se añadió **Bookmory** (.xlsx) a petición del usuario durante la construcción, no en la planificación aprobada previa. Bookmory solo lee la hoja "Libros" del Excel (la fila 2 es la cabecera real; la fila 1 es una fila de agrupación parcial, se descarta). Las hojas por libro "Notas (Título)" de Bookmory **no se importan** — se difiere porque hoy no hay hueco de esquema para notas libres por libro (futuro bajo 7.24). Varios campos de Bookmory sin hueco de esquema hoy (tags, colecciones, precio/adquisición, tiempo de lectura, notas) se **descartan en esta v1** — revisar si se retoman al construir 7.4 (colección)/7.5 (etiquetas)/7.29 (adquisición/precio).
  - **Entry point**: enlace "Importar biblioteca" en la página de perfil (`src/components/profile-header.tsx`, junto a "Editar perfil", solo visible para el dueño del perfil) — **no** en la navegación global del header, a diferencia del plan original; redirigido explícitamente por el usuario durante la revisión del plan.
  - **Conversión de rating**: `rating * 2` para las tres fuentes (Goodreads: estrellas 0-5 enteras; Letterboxd/Bookmory: pasos de 0.5 en 0.5 hasta 5) sobre la escala interna 1-10 entera.
  - **Gateo de permisos**: ejecutar la importación (filas que sí matchean) está abierto a cualquier usuario autenticado; la **resolución manual de filas sin match** (alta libre de catálogo desde la fila del CSV) está gateada a `collaborator+`, mismo nivel que `/buscar/manual` (ver §7.35).
  - **Letterboxd requiere `diary.csv`** específicamente (no `watched.csv`/`ratings.csv`) — es el único export de Letterboxd con fecha de pase por visionado, necesaria para poblar `diary_entries`.
  - **Dos bugs de matching reales encontrados y corregidos** verificando en navegador contra Open Library/TMDB reales (relevante para cualquier código futuro de matching de catálogo):
    - `isSameTitle` (`src/lib/catalog/title-match.ts`, extraído de `open-library.ts` y compartido con el fallback de búsqueda de libros ya existente) usaba contención de substring plana, lo que dejaba que un título corto como "1984" matcheara erróneamente un título largo no relacionado que lo contenía como substring. Corregido añadiendo una guarda de ratio de longitud (corto/largo ≥ 0.65): la contención solo se acepta si los dos títulos son plausiblemente la misma obra.
    - Los matches de libro **acotados por ISBN** ahora se confían directamente sin comprobación de similitud de título (el título canónico de una edición en Open Library puede diferir legítimamente del título abreviado del CSV, ej. "Nineteen Eighty-Four" vs. "1984" en el export de Goodreads) — mismo comportamiento que ya tenía el flujo de búsqueda interactiva.
    - El matching de películas/series por proximidad de año (`src/lib/import/match-row.ts`) trataba antes un candidato sin año de estreno como automáticamente compatible en año, colando resultados basura de TMDB sin fecha de estreno; corregido para solo aceptar un año de candidato nulo cuando el propio CSV tampoco tiene año con el que comparar.
  - **Limitación real descubierta (no un bug, documentada por si es relevante para trabajo futuro cercano)**: la búsqueda de TMDB en la app está fijada al locale `es-ES` (`src/lib/catalog/tmdb.ts`), así que un título en inglés de Letterboxd como "Parasite" no encuentra un match con título en español como "Parásitos" — esas filas terminan correctamente en no-match/resolución manual en vez de mezclarse con un ítem incorrecto. Restricción preexistente de `searchMovies`/`searchSeries`, no algo que esta tarea resolviera.
- **Verificado en navegador de extremo a extremo** con datos reales contra Open Library/TMDB en producción: CSV de Goodreads, `diary.csv` de Letterboxd y `.xlsx` de Bookmory, cubriendo matching, dedup/idempotencia (reimportar no duplica), entradas de diario con fechas de revisionado, y el flujo de resolución manual para filas sin match.
- **Trakt sigue siendo un caso aparte, no un CSV más**: Trakt.tv (series/películas) no exporta CSV, tiene una API REST con OAuth y sincronización continua (no un volcado de una vez). Es una integración de otra naturaleza — mantenerla como idea independiente en vez de meterla en esta tarea; solo abordarla si algún día interesa sync continuo, no solo import inicial.

### 7.8 Páginas de detalle por ítem (`/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`) — *hecho*
- [x] Página propia por libro/película/serie: portada grande, título, metadatos condicionales (autor/director/creador + año, editorial+páginas / duración / temporadas+episodios, ISBN, géneros), sinopsis, y botón de añadir a biblioteca que ya reconoce si el ítem está en la tuya (`ItemLibraryButton`, `addExistingItemToLibrary` — inserta directo en `library_entries` sin pasar por `findOrCreateCatalogItem`, porque el ítem ya tiene fila de catálogo).
  - Convención de ruta decidida: tres carpetas por tipo (`/libro`, `/pelicula`, `/serie`), no una ruta unificada `/item/[type]/[id]` — consistente con el resto de rutas en español del proyecto (`/buscar`, `/biblioteca`). Helper `itemHref(itemType, id)` en `src/lib/catalog/item-href.ts` centraliza la construcción de la URL.
  - `LibraryItemCard` y `PublicItemCard` ahora enlazan la portada+título a la ficha; se añadió `itemId` a `LibraryItem` (antes solo tenía `entryId`) para poder construir el enlace.
  - `not-found.tsx` propio por ruta para IDs inexistentes (probado con un UUID inventado).
  - Los resultados de búsqueda (`SearchResultCard`) **no** enlazan aquí todavía — un resultado de búsqueda aún no tiene fila de catálogo hasta que se añade, así que no hay id al que enlazar en ese punto del flujo.

### 7.9 Perfil público personalizable: favoritos fijados, estanterías y OG image — *hecho (versión simple)*
- [x] Fijar hasta 6 ítems favoritos arriba del perfil público (estilo Letterboxd): columna `pinned_order` (integer, nullable) añadida a `library_entries` vía migración — `NULL` = no fijado, entero positivo = orden de aparición, asignado incrementalmente con `MAX(pinned_order)+1` y limitado a 6 por código de aplicación (sin constraint ni índice nuevos en BD; el RLS existente de "actualizar tus propias filas" ya lo cubre sin cambios). `getLibraryItems()` (`src/lib/library/get-library-items.ts`) gana la opción `favoritesOnly`, y `LibraryItem` el campo `pinnedOrder: number | null`. Server action `toggleFavorite(entryId)` en `src/app/u/[username]/actions.ts` (fija/desfija, devuelve `{ error: "maxReached" }` al superar el límite). Botón de fijar/desfijar (solo para el dueño) en `library-item-card.tsx`, con aviso inline al alcanzar el máximo. Nuevo componente `src/components/favorites-shelf.tsx` — estantería "Favoritos" mostrada en `/u/[username]` justo tras `ProfileHeader`, visible en cualquier pestaña (a diferencia de `NowConsuming`/`ActivityChart`, que son solo de "resumen"); no renderiza nada si no hay favoritos. Verificado en el navegador: fijar "El Quijote" hace aparecer la estantería con la portada correcta; desfijar la hace desaparecer.
- **Diferido, no construido todavía**: la ampliación a varias **estanterías/vitrinas nombradas** (p. ej. "Mis pósters", "Lo mejor de 2026") sigue siendo solo una idea a considerar más adelante, tal como ya apuntaba este mismo apartado — se mantiene fuera de alcance salvo que surja demanda real; no es una tarea pendiente de esta iteración.
- [x] Generar una **imagen Open Graph** del perfil para cuando se comparte el link: `src/app/u/[username]/opengraph-image.tsx` con `next/og`'s `ImageResponse` (mismo patrón que `src/app/icon.tsx`), 1200x630, con nombre visible, `@username` y la línea de estadísticas (libros/películas/series), con la paleta morado oscuro/crema de la app. Verificado visitando `/u/devtest/opengraph-image` directamente.

### 7.10 Retos de lectura/visionado anuales
- [ ] Objetivo tipo "50 libros en 2026" con barra de progreso, calculado sobre `diary_entries`/`library_entries` que ya se registran.

### 7.11 Estantería "Ahora mismo" — *hecho*
- [x] El home (`src/app/page.tsx`) ahora consulta los ítems `in_progress` del usuario autenticado y reutiliza el componente `NowConsuming` ya existente (antes solo en la pestaña "resumen" de `/u/[username]`) — sin componente nuevo. Verificado mostrando "El Quijote" con su barra de progreso en el home.

### 7.12 Buscar y ordenar dentro de tu propia biblioteca — *hecho*
- [x] Caja de búsqueda por texto y tres opciones de orden (recientes/mejor valorados/título A-Z) en `src/app/u/[username]/library-filters.tsx`, cableadas vía nuevos parámetros `search`/`sort` de `getLibraryItems()` (`src/lib/library/get-library-items.ts`) — búsqueda y orden por título se aplican en JS tras el merge (el título vive en `books`/`movies`/`series`, no en `library_entries`); orden por rating y el de "recientes" (por defecto) también, por consistencia. Nuevo tipo `LibrarySort` en `src/lib/library/types.ts`. Verificado: buscar "quijote" filtra correctamente y los filtros de orden/estado preservan la búsqueda entre clics.

### 7.13 Recuento de relecturas visible y comparativa entre pases — *hecho*
- [x] `rereadCount` añadido a `LibraryItem`, calculado con una única query agrupada contra `diary_entries` (no una consulta por entrada) en `get-library-items.ts`. Mostrado en `library-item-card.tsx` como "Leído N veces" / "Vista N veces" (según tipo de ítem, solo si N > 0).
- [x] En `diary-panel.tsx`, cada entrada de diario muestra ahora una línea comparativa contra el pase anterior cuando ambos tienen rating: "{año}: {rating}★ → ahora {rating}★" — verificado con datos reales (2020: 3★ → ahora 5★).
- **Actualizado (2026-07-14, ver §7.37)**: `rereadCount` ahora **excluye el pase abierto** (solo cuenta pases con `finished_on` no nulo) — antes de la corrección, un pase en curso ya sumaba a "Leído N veces" sin haberse terminado. `diary-panel.tsx` fue jubilado junto con la pestaña Registro vieja; la comparativa contra el pase anterior vive ahora en `src/components/detail/pass-diary.tsx` como el delta "▲ +1★ vs. anterior" (en medias estrella, no en la escala entera 1–10).

### 7.14 Sesiones de progreso diarias (base de rachas, calendario y estadísticas) — *hecho*
Referencia: capturas de un competidor mostrando 4 pantallas — estadísticas diarias, calendario mensual de lectura, rachas, y estadísticas anuales. Esta es la idea de "modo racha (streaks)" — ya cubierta aquí en detalle, no se duplica en otra sección.

**Estado**: **completo**. La base del modelo (tabla `progress_sessions` + pantalla de registro `/sesion/[entryId]`) y las cuatro piezas de estadísticas (diarias, calendario mensual, rachas, anuales) están construidas y verificadas; todo el dashboard de estadísticas ahora se muestra en la página principal del usuario (home). La ruta dedicada `/estadisticas` ha sido eliminada.

- [x] Modelar `progress_sessions` (base fundacional): tabla nueva (migración aplicada) con `id`, `library_entry_id` (FK cascada), `user_id` (FK cascada), `session_date` (default hoy), `duration_minutes` (nullable, minutos introducidos a mano), `position` jsonb (el punto *alcanzado* ese día: `{page}` en libros, `{season,episode}` en series), `note` (nullable, para una nota o cita destacada) y `created_at`; índice sobre `library_entry_id`; RLS idéntico a `diary_entries` (dueño inserta/edita/borra; select "público u propio" según el `is_public` del perfil dueño). Cierra el "gap de modelo real": ahora sí se puede saber "¿qué avancé el martes?" (antes `library_entries.position` solo guardaba el punto *actual*, sin historial, y `diary_entries` solo el *pase completo*).
  - **Separación conceptual explícita**: `diary_entries` = pases completos (relectura/re-visionado, con rating + reseña); `progress_sessions` = progreso incremental diario (posición alcanzada + minutos opcionales a mano + nota/cita opcional). `library_entries.position` sigue siendo solo el punto *actual*. Ver §8-G.
  - **Alcance**: las sesiones solo aplican a **libros y series** (página / temporada+episodio); las películas mantienen solo estado + revisionados (no tienen sesión incremental natural).
  - **Tiempo a mano, no cronómetro**: la duración es un campo de minutos; el cronómetro en vivo queda como extensión futura sobre este mismo modelo.
  - **Capa de dominio** `src/lib/sessions/` (`types.ts`, `get-sessions.ts`, `actions.ts`): `addSession` registra la sesión Y adelanta la `position` + `status` del ítem (el formulario de sesión es la vía del bucle diario para actualizar el progreso); `deleteSession` la elimina.
  - **Pantalla nueva** `/sesion/[entryId]` (`src/app/sesion/[entryId]/`): formulario "Guardar sesión de lectura/visionado" (fecha, duración, posición prellenada desde la actual, nota, estado prellenado — planned→in_progress); guardas: solo el dueño, y un ítem de película redirige a su ficha. Al guardar → redirige a la ficha del ítem. Se llega desde la estantería "Ahora mismo" (home + perfil propio): al pulsar un libro/serie salta directo a `/sesion/[entryId]` (las películas → ficha), vía la nueva prop `linkToSession` de `NowConsuming` (solo en superficies del dueño).
- [x] Estadísticas diarias: tira de 7 días (`src/components/stats/weekly-strip.tsx`, barras dimensionadas por minutos de sesión por día) + minutos de hoy vs. objetivo diario como anillo SVG (`src/components/stats/circular-progress.tsx`). Datos de `src/lib/stats/get-weekly-activity.ts` (suma `progress_sessions.duration_minutes` por día, filtrado por `user_id`).
- [x] Calendario mensual: grid del mes empezando en lunes (`src/components/stats/month-calendar.tsx`) con la portada del ítem en los días que tuvieron sesión y navegación prev/next vía `?month=YYYY-MM`. Datos de `src/lib/stats/get-month-calendar.ts` (sesiones del mes unidas a `library_entries`, portadas resueltas en lote desde `books`/`series`).
- [x] Rachas: racha actual + mejor racha de días consecutivos con ≥1 sesión (`src/components/stats/streak-card.tsx`). Datos de `src/lib/stats/get-streaks.ts` (lee solo la columna `session_date`, deduplica a un conjunto de días y calcula en JS).
- [x] Estadísticas anuales: gráfico de barras de 12 meses de ítems completados (`src/components/stats/annual-stats.tsx`, un solo color, estilo `activity-chart.tsx`) + anillo de objetivo anual. Datos de `src/lib/stats/get-annual-completed.ts` (cuenta `diary_entries.finished_on` del año actual, todos los tipos incl. películas).
- [x] Objetivos configurables: columnas nullable `daily_goal_minutes` y `annual_goal_items` añadidas a `profiles` vía migración (NULL = sin objetivo; ambas globales por usuario, RLS existente de "editar tu perfil" las cubre). `Profile`/`PROFILE_COLUMNS`/`toProfile` en `src/lib/profile/get-profile-by-username.ts` extendidos; server action `updateGoals` en `src/lib/profile/actions.ts` (input vacío → NULL), editadas desde `src/components/stats/goals-form.tsx`.
  - Todo lo anterior vive en la página principal del usuario (home) — ya no existe una ruta dedicada `/estadisticas` (`src/app/estadisticas` eliminada) — NO en el perfil público.
- **Resuelto al construir la base**: aplica a **libros y series**, no a películas; el tiempo se introduce **a mano** (campo de minutos), no con cronómetro; la UX de registro es un **flujo dedicado** (`/sesion/[entryId]`), no un botón rápido "+X páginas hoy" sobre el `ProgressPanel`.
- **Resuelto al construir las estadísticas**: el objetivo diario (minutos) y el anual (ítems completados) son un **único valor global por usuario** en `profiles`, no por tipo de ítem.
- **Actualizado (2026-07-14, ver §7.37)**: `progress_sessions` gana `pass_id` y pasa a colgar del **pase** (no directamente de `library_entries`) — hereda la edición del pase, que es lo que rotula "Edición: X" sobre la lista de sesiones. La página `/sesion/[entryId]` gana un **cronómetro** persistente además de la entrada a mano (el punto de arriba decía "el cronómetro en vivo queda como extensión futura" — esta es esa extensión), y en serie pasa a **marcar episodios** con chips en vez de un campo de posición suelto, reutilizando la misma escritura que la pestaña Episodios (§7.36). El "hub de gestión" descrito en §8-G (`item-manage-panel.tsx`) fue jubilado y sustituido por `log-panel.tsx` como pestaña Registro única.

### 7.15 Otras ideas sin desarrollar todavía
- [ ] "Tu año en Biblioshare" — resumen anual compartible (estilo Spotify Wrapped), versión concreta de las estadísticas generales.
- [ ] Comparar bibliotecas entre dos perfiles (solape de ítems) — vía social ligera sin construir seguidores completos.
- [ ] Sistema de seguidores + feed de actividad.
- [ ] Estadísticas y gráficos de hábitos generales (ítems por tipo/estado, actividad del diario por mes).
- [ ] Offline-first completo (edición sin conexión + sincronización posterior).
- [ ] Listas curadas y colecciones temáticas — ver 7.4 (sagas/colecciones personales) y 7.26 (versión colaborativa/multi-usuario).
- [ ] Integración con más fuentes (videojuegos vía IGDB, música, etc.) — encaja con la idea original de "biblioteca de tus hobbies".

### 7.16 Modo "en pausa"
- [ ] Estado intermedio entre "en curso" y "abandonado", con recordatorio configurable (ej. a los 30/60/90 días) para retomar o cerrar. Ver también 7.17 (infraestructura de notificaciones, compartida).
  - **Decidido** (ver §8-A): `paused` es un estado explícito nuevo en `media_status` (`planned | in_progress | paused | completed | dropped`) — barato de migrar (`ALTER TYPE ... ADD VALUE`), evita heurísticas frágiles de inactividad. La señal de inactividad (vía 7.14) se usa solo para **sugerir** el cambio como una notificación (7.17), nunca para aplicarlo sola.
  - Al pausar, guardar opcionalmente el punto de progreso (ya existe vía `position`) — no hace falta un campo nuevo, solo el estado.
  - Transición a "abandonado" conserva el histórico (ya es así: nunca se borra `position`/`diary_entries` al cambiar de estado).

### 7.17 Recordatorios (pausas antiguas y estrenos que sigues)
- [ ] Notificación cuando: (a) un ítem lleva mucho en "pausa" (7.16) sin retomarse, o (b) sale la nueva temporada de una serie que sigues, o la adaptación de un libro que leíste.
  - **Primera pieza de infraestructura de notificaciones del proyecto** — no existe hoy nada de esto (ni email, ni push, ni jobs programados). Ver §8 (Decisiones de arquitectura) antes de empezar cualquiera de las dos, porque comparten la misma base y solo tiene sentido construirla una vez.
  - **Depende de 7.31** (adopción de Capacitor, en curso): push nativo (APNs) para usuarios iOS en la UE, donde Web Push no funciona (ver §8-F); Web Push normal para Android/desktop.
  - "Estrenos que sigues" necesita además saber si una serie/libro sigue activo (temporada en emisión, secuela anunciada) — dato que ni TMDB ni Google Books garantizan de forma fiable; evaluar viabilidad antes de comprometer esta parte.

### 7.18 Diario emocional/contextual
- [ ] Campos opcionales al registrar un pase en el diario: estado de ánimo (selector cerrado de 6–10 opciones, no texto libre — para poder agregarlo en estadísticas), compañía (solo/pareja/amigos/familia/otro), ubicación libre, nota.
  - Extiende `diary_entries` (ya tiene `rating`, `review`) con estos campos nuevos — encaja de forma natural, es la misma tabla y el mismo momento de registro.
  - **Privados por defecto**, con toggle explícito para hacerlos públicos — mismo patrón de `profiles.is_public` ya establecido, pero a nivel de campo/pase en vez de perfil completo.
  - Alimenta "Tu año en Biblioshare" (7.15) con datos más ricos (mood dominante, compañía más frecuente) — construir esto antes ayuda a que esa retrospectiva sea mejor desde el principio.

### 7.19 Recomendaciones cruzadas entre formatos
- [ ] "Si te gustó la serie X, lee el libro Y" — recomendaciones basadas en atributos compartidos (género, temas, tono), con explicación visible y opción de descartar.
  - Esfuerzo alto (XL) y depende de tener géneros/temas normalizados entre fuentes — ver §8 (normalización de géneros). Sin eso, no hay señal fiable de qué es "similar".
  - **MVP realista de esta idea**: tabla curada a mano de equivalencias famosas (adaptaciones conocidas) en vez de un motor de embeddings desde el día uno. Solo merece la pena automatizarlo con más usuarios y más datos de consumo.

### 7.20 Clubs de lectura/visionado con hitos anti-spoiler
- [ ] Grupos con checkpoints ("hasta el capítulo 10") cuyos hilos de discusión se desbloquean según el progreso registrado de cada miembro, con opción manual de "ya llegué aquí".
  - Necesita funcionalidad social real (grupos, roles, moderación) que hoy no existe — de las ideas nuevas, la que más se apoya en tener ya una base de usuarios activa para tener sentido.
  - Reutiliza el sistema de progreso existente (`position`) y comparte con 7.24/7.21/7.30 la necesidad de un mecanismo genérico de "ocultar contenido hasta que el progreso lo permita" (ver §8).

### 7.21 Comparador de adaptaciones (libro ↔ película/serie)
- [ ] Ficha comparativa entre una obra y su adaptación: portadas, ratings medios lado a lado, y voto de la comunidad ("¿cuál es mejor?") habilitado solo para quien terminó ambos.
  - **Requiere un tipo de dato que hoy no existe**: relación entre ítems de catálogo de *tipos distintos* (`books` ↔ `movies`/`series`). **Decidido** (ver §8-B): tabla genérica de relaciones, curada manualmente/por la comunidad — no inferida automáticamente de las APIs. 7.19 (recomendaciones) comparte el mismo mecanismo.
  - Las APIs actuales no siempre exponen esta relación de forma fiable (Wikidata es mejor fuente que TMDB/Google Books para esto) — contribución comunitaria editable, con cola de revisión, es probablemente necesaria tarde o temprano.

### 7.22 Cola priorizada con tiempo estimado — *hecho*
- [x] Nueva ruta `/cola` (`src/app/cola/{page,actions,queue-list,queue-item-row,queue-summary}.tsx`): lista reordenable por drag & drop de los ítems `planned` del usuario (libros/películas/series mezclados), con estimación de tiempo por ítem y total de la cola, ambas mostradas como **texto de fórmula literal** (no un modelo oculto) — cumple la transparencia pedida en el ítem original.
- [x] Columna nueva `library_entries.queue_order` (integer, nullable, sin constraints — mismo patrón low-ceremony que `pinned_order`) + índice parcial `idx_library_entries_queue_order` sobre `(user_id, queue_order) WHERE status='planned'`. **Deliberadamente no se reutilizó `pinned_order`**: ese campo es un contador de solo-incremento para fijar/desfijar favoritos (tope 6), documentado como no pensado para reordenar libremente en mitad de la lista — se necesitaba un mecanismo genuinamente distinto para "arrastrar a cualquier posición".
- [x] Estrategia de orden: **renumerado completo en cada escritura** (no índices fraccionales/de huecos) — una cola personal es pequeña (decenas de ítems), así que renumerar en O(N) en cada drop es más simple que un esquema de rebalanceo de huecos.
- [x] `queue_order` se pone a `NULL` en cuanto un ítem sale de `planned` (en `updateStatus`, `src/lib/library/manage-actions.ts`, y en `addSession`, `src/lib/sessions/actions.ts`, que también puede adelantar el estado) — verificado en el navegador: marcar como "terminado" un libro en cola limpia correctamente su `queue_order`.
- [x] **Ritmo personal**, derivado enteramente del historial propio del usuario (sin campos de tracking nuevos):
  - Libros: páginas/minuto a partir de `progress_sessions` (duración + delta de posición de página entre sesiones del mismo ítem).
  - Series: minutos/episodio igual, pero **limitado a pares de sesiones de la misma temporada** — no hay recuento de episodios por temporada en ningún sitio, así que un salto entre temporadas no se puede normalizar a un número de episodios. Aproximación aceptada y documentada explícitamente, no un bug.
  - Películas: no hay tracking de sesiones (alcance ya decidido en 7.14), así que la estimación por ítem es directamente `duration_minutes` (determinista, sin ritmo necesario). Se muestra además, aparte, una "cadencia de películas" más gruesa (películas/semana, sobre `diary_entries` en ventana de 90 días) — **deliberadamente no se suma** al total de minutos de la cola, por ser una frecuencia, no una duración.
  - Ítems sin datos suficientes (menos de 3 muestras de ritmo, o sin dato de tamaño) se excluyen del total pero se cuentan y muestran explícitamente ("N ítems sin estimación suficiente"), nunca se descartan en silencio.
- [x] Nueva dependencia `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — elegida sobre drag-and-drop nativo HTML5 porque la app se empaqueta en un wrapper Android de Capacitor y necesitaba soporte táctil real; también habilita un sensor de teclado (`KeyboardSensor` + `sortableKeyboardCoordinates`) que, además de ser un requisito real de accesibilidad (WCAG exige una vía no-puntero para DnD), fue el mecanismo usado para verificar el reordenado de extremo a extremo en esta sesión (foco en el botón de agarre, Espacio/Flecha abajo/Espacio).
- [x] Entry point en `src/components/header.tsx` (junto a `/buscar`, dentro del bloque `{user && ...}`) en vez de en la página de perfil — razonado como herramienta de planificación recurrente a la que se vuelve a menudo, a diferencia de la acción puntual `/importar`, que sí vive en el perfil.
- **Descubrimiento durante la construcción — hueco real en datos de catálogo, corregido**: `movies.duration_minutes` y `series.total_episodes`/`total_seasons` **nunca los rellenaba ningún código existente**, pese a que 7.8 (fichas de ítem) ya los mostraba defensivamente. El endpoint de detalles de TMDB que la app ya llama para créditos/saga (`getMovieDetails`/`getSeriesDetails` en `src/lib/catalog/tmdb.ts`, vía `ensureItemEnriched` en `src/lib/people/enrich-item.ts`) ya trae `runtime`/`number_of_episodes`/`number_of_seasons` en su respuesta — simplemente no se extraían. Corregido ampliando `ScreenDetails` con `runtimeMinutes`/`numberOfEpisodes`/`numberOfSeasons`, y con un backfill perezoso nuevo (`src/lib/queue/backfill-queue-sizes.ts`, tope de 10 ítems por carga de página) que corre al cargar `/cola` y encuentra películas/series `planned` sin ese dato. Es una corrección permanente del catálogo compartido, no limitada a la cola: cualquier película/serie abierta después también se beneficia en cuanto entra en la cola de alguien. Ver §9 (2026-07-10).
- **Bug encontrado y corregido durante la verificación — política RLS de `UPDATE` ausente en `movies`/`series`**: el backfill escribía "en silencio" sin error (`{data: [], error: null}`) pese a que la llamada a TMDB sí funcionaba. Causa: `movies` y `series` solo tenían políticas RLS de `INSERT`/`SELECT` — **no existía ninguna política de `UPDATE`**, así que cualquier `UPDATE` de la app afectaba a 0 filas en silencio. Confirmado con el usuario antes de aplicar por tratarse de un cambio de RLS con implicación de seguridad. Corregido con una nueva política `UPDATE` permisiva en ambas tablas (`USING (true) WITH CHECK (true)`, misma permisividad que el `INSERT` ya existente — cualquier autenticado, al ser catálogo compartido de mantenimiento colaborativo, no datos propios de un usuario). `books` se dejó deliberadamente sin política de `UPDATE` — nada la necesita hoy. Ver §9 (2026-07-10).
- Verificado en navegador de extremo a extremo: reordenar por drag & drop (ratón y teclado), estimación por ítem y total con fórmula visible, backfill de `duration_minutes`/`total_episodes` poblando datos reales, y limpieza de `queue_order` al completar un ítem en cola.

### 7.23 Retos personalizables (ampliación de 7.10)
- [ ] Más allá del objetivo simple anual (7.10): retos con **filtros** (género, autor/director, país, etiqueta, periodo), progreso automático al registrar ítems que cumplen el filtro, retos públicos clonables por otros usuarios, y tarjeta de progreso exportable.
  - Reutilizaría el mismo motor de filtros que "Mi biblioteca" (7.12) y las etiquetas (7.5) en vez de construir uno nuevo — buen momento para diseñar ambos pensando en que un tercer consumidor (retos) también los va a necesitar.
  - Criterios como "autoras" o "nacionalidad del autor/a" no los da ninguna API — requeriría etiquetado manual/comunitario, no asumirlo como dato disponible.

### 7.24 Notas ancladas al punto de progreso
- [ ] Notas privadas mientras consumes un ítem, ancladas al capítulo/minuto/episodio actual, con vista de "línea de tiempo" al terminar (para ver cómo evolucionaron tus teorías) y opción de publicar una nota suelta como reseña con aviso de spoiler.
  - Distinto de `notes` (campo único de texto libre que ya existe en `library_entries`) y de `diary_entries.review` (una reseña por pase): esto es **una lista de notas con timestamp/punto de progreso propio** — necesitaría su propia tabla si se construye (`entry_notes`: `library_entry_id`, `progress_point` jsonb, `body`, `created_at`), no encaja en los campos actuales sin perder la ordenación.
  - Comparte con 7.20/7.21/7.30 la necesidad de una utilidad genérica de "spoiler-safe" — ver §8.

### 7.25 "¿Dónde lo veo?" (disponibilidad en streaming) — *hecho*
- [x] `getWatchProviders(kind, tmdbId)` en `src/lib/catalog/tmdb.ts`, consultando `/movie/{id}/watch/providers` y `/tv/{id}/watch/providers` de TMDB (región `ES`). Componente compartido `src/components/watch-providers.tsx`, integrado en `/pelicula/[id]` y `/serie/[id]` (ambos seleccionan ahora también `tmdb_id`). Muestra los proveedores de tipo flatrate (suscripción) con logo, enlaza a la página de TMDB, con atribución "Datos de disponibilidad por JustWatch, vía TMDB". Verificado en producción con una película real (Matrix Revolutions), mostrando Movistar Plus+ y HBO Max.

### 7.26 Listas colaborativas
- [ ] Listas editables entre varios usuarios (ej. "películas para el maratón de Halloween").
  - Amplía la idea ya registrada de "listas curadas" (7.15) al caso multi-usuario — requiere modelo de permisos (quién puede añadir/quitar) que hoy no existe en ningún sitio del proyecto. Construir primero la versión de un solo dueño (7.15/7.4) y solo dar el salto a colaborativa si hay demanda, es más barato que empezar directamente por la versión multi-usuario.

### 7.27 Citas y frases destacadas
- [ ] Guardar citas/frases de un libro ancladas al ítem, con opción de foto+OCR y exportables como tarjetas visuales para compartir.
  - Versión ampliada de la idea ya apuntada en el backlog general — el OCR y la exportación como imagen son lo nuevo; el guardado simple de texto es barato, OCR es una pieza aparte (servicio externo o librería cliente) a evaluar aparte si se llega a esta idea.

### 7.28 Random picker ("no sé qué ver/leer") — *hecho*
- [x] Botón que elige al azar un ítem de tu lista de pendientes, con filtros opcionales (ej. "tengo 2 horas" usando `duration_minutes`/`total_pages`/ritmo personal de 7.22).
  - Implementado como ceremonia (mockup «Sorteo · Sacar un lomo»): la tarjeta del Rincón abre una hoja `<dialog>` con estantería de lomos reales (muestra de ~12, color por tipo, alturas deterministas), ruleta animada que desacelera hasta el ganador (decidido antes de animar; `prefers-reduced-motion` la salta) y resultado con portada y CTA contextual.
  - Filtros: tipo, duración estimada (‹2 h / 2–5 h / +5 h sobre las estimaciones de 7.22 — `computeQueueEstimates`; sin estimación solo entra en "Cualquiera") y "sin empezar" (= sin ningún pase anterior con la obra).
  - El CTA reutiliza `updateStatus(..., "in_progress")` — el mismo gesto que marcar "Leyendo" en la ficha. El ítem revelado se congela en estado propio: el revalidate posterior al CTA re-muestrea la estantería y un índice vivo señalaría otro título.
  - Spec y plan en `docs/superpowers/` (2026-07-17); lógica pura testeada en `sorteo-logic.test.ts`, flujo cubierto por `e2e/sorteo.spec.ts`.

### 7.29 Método de adquisición y "dinero ahorrado"
- [ ] Marcar cómo obtuviste cada ítem (comprado / biblioteca / prestado / regalo) y, si se compró, su precio — para poder mostrar una estadística de "dinero ahorrado" con préstamos/biblioteca.
  - Mismo patrón que la encuadernación de 7.1: es un dato **de Ejemplar**, no de Obra ni de Progreso (ver §8-C, decidido) → va en `library_entries.copy_details` (JSONB propio, separado de `position`), no en el catálogo ni mezclado con el progreso.

### 7.30 Modo sin spoilers global
- [ ] Difuminar sinopsis, duración de episodios restantes y temporadas pendientes de lo que estás viendo/leyendo actualmente.
  - Comparte necesidad con 7.20 (clubs), 7.21 (comparador) y 7.24 (notas ancladas): un mecanismo genérico de "ocultar contenido según el progreso/estado del usuario" — ver §8. Construir esta utilidad una sola vez cuando se aborde la primera de las cuatro, en vez de resolver el spoiler-hiding cuatro veces distintas.

### 7.31 Adoptar Capacitor (wrapper nativo) — *en curso*
- [x] Instalar `@capacitor/core` + `@capacitor/cli` + `@capacitor/android`, `capacitor.config.ts` apuntando `server.url` a la app desplegada en Vercel (sin tocar el código Next.js existente — SSR y Server Actions siguen funcionando igual).
- [x] Scaffolding de la plataforma **Android** (proyecto Gradle generado y comiteado). Plugin `@capacitor-mlkit/barcode-scanning` instalado y sincronizado (usado por 7.3).
- [ ] Plataforma **iOS**: solo se puede compilar/probar desde macOS (Xcode) o un runner de CI en la nube — no alcanzable desde Windows. Queda pendiente hasta disponer de esa vía.
- [ ] **Compilar y probar en un dispositivo/emulador Android real** — sigue bloqueado por falta de Android Studio/JDK en esta máquina (ver `docs/TESTING.md`). Todo lo anterior es configuración verificada por `tsc`/`eslint`, no ejecución real en el wrapper nativo.
- Decidido en §8-F como prerrequisito de 7.17 (notificaciones) — ver ahí el razonamiento completo.

### 7.32 Búsqueda "local primero" con persistencia automática al catálogo — *hecho, SUPERADO por §7.39*

> **Desactualizado (2026-07-15, ver §7.39).** Este diseño se ha rehecho entero para libros. Lo que ya
> **no** es cierto: (1) la búsqueda **no persiste** los resultados de la API — la fila de `books` nace
> al abrir la ficha o al añadir; (2) un hit local por título **no** cortocircuita la API — solo lo hace
> un ISBN exacto, porque buscar por título es descubrir; (3) la sinopsis y los géneros **no** se
> capturan en la búsqueda, sino al hidratar la obra desde `/works/<key>.json`. El "trade-off aceptado"
> de más abajo era precisamente el bug: congelaba el catálogo sucio para siempre. Para películas y
> series, lo único que cambia es que local y API se fusionan en vez de excluirse.

- [x] Cada búsqueda consulta primero el catálogo propio (`books`/`movies`/`series`) antes de llamar a la API externa — `src/lib/catalog/local-search.ts`. Para libros, si la query es un **ISBN exacto** ya cacheado, se devuelve directamente desde la base de datos y **se salta la llamada a Google Books por completo** (caso más claro de "evitar llamadas repetidas"; también beneficia directamente a 7.3, ya que cada escaneo de un libro ya visto no vuelve a llamar a la API).
- [x] Para búsquedas por título (sin ISBN exacto): **el catálogo local gana directamente si devuelve algo** — no se llama a la API en absoluto en ese caso. Solo si lo local no encuentra nada se consulta la API externa, y esos resultados se **insertan en el catálogo antes de devolver la respuesta** (`src/lib/catalog/find-or-create.ts`, reutilizado tanto por la búsqueda como por "añadir a biblioteca"), para que la próxima búsqueda de ese mismo título ya sea un hit local.
  - **Descartado un diseño anterior** que consultaba local y API en paralelo siempre: no reducía nada el consumo de API (se llamaba en cada búsqueda, cachear o no). Se cambió a "local gana si hay algo" tras detectarlo.
  - **Trade-off aceptado**: una vez que un título tiene algún resultado local, una búsqueda repetida no descubre ediciones/resultados nuevos de la API para ese título — `/buscar/manual` o una query más específica (ISBN) siguen siendo la vía para encontrar otra edición.
- [x] `SearchResult` gana un campo `catalogId` opcional: lo llevan tanto los resultados locales como los recién persistidos, y "añadir a biblioteca" lo usa directamente en vez de repetir el find-or-create (excepto en modo mock, donde no hay catálogo real de por medio).
- [x] Captura de `synopsis`/`genres` añadida a Google Books (`description`/`categories`) y TMDB (`overview` + `genre_ids` resueltos contra `/genre/{kind}/list`, cacheado en memoria por proceso) — antes estas columnas existían en el esquema pero ningún código las rellenaba nunca; ahora alimentan directamente las páginas de detalle (7.8).
- Verificado en producción con datos reales: primera búsqueda por título trae y persiste resultados con sinopsis/géneros; la **misma búsqueda repetida ya no llama a la API** (confirmado por tiempos de respuesta: ~800ms local vs. 2.5–4.9s con llamada real) y no duplica filas; búsqueda por el ISBN ya cacheado devuelve un único resultado igual de rápido; "añadir a biblioteca" usa el `catalogId` cacheado correctamente. Datos de prueba limpiados después.

### 7.33 Resumen de priorización sugerida

No vinculante — orden propuesto combinando esfuerzo, valor y dependencias, para decidir por dónde seguir. Todo lo marcado `[x]` en las secciones de arriba queda fuera de esta tabla (ya hecho).

| Idea | Esfuerzo | Depende de | Por qué este orden |
|---|---|---|---|
| **7.31 Adoptar Capacitor** | **S-M** | **§8-F (decidido)** | **En curso — falta compilar/probar en Android real; scaffolding y 7.3/7.32 ya construidos sobre esta base** |
| 7.8 Páginas de detalle por ítem | M | — | Datos ya existen sin usar; desbloquea 7.25 y da un lugar natural a 7.9/7.27 |
| 7.16 Modo "en pausa" | S-M | §8-A (resuelto) | Cierra un hueco real del modelo de estados, ya sin decisión pendiente |
| 7.5 Etiquetas privadas | M | — | Base para 7.23 (retos) y estadísticas por etiqueta |
| 7.4 Colecciones curadas por usuario | S-M | 7.15/7.26 | La parte de **sagas** ya está hecha (7.34, tabla dedicada); queda solo la colección/lista privada del usuario |
| 7.29 Método de adquisición / dinero ahorrado | S-M | §8-C (resuelto) | Ya decidido: va en `copy_details`, separado de `position` |
| 7.6 Seguir editoriales | M | Riesgo de datos sin resolver | No comprometer hasta validar que hay fuente fiable de novedades |
| 7.17 Recordatorios (pausas/estrenos) | M-L | 7.31 (Capacitor) + §8-D | Push nativo vía Capacitor para iOS+UE; Web Push + pg_cron para el resto |
| 7.18 Diario emocional/contextual | M | — | Enriquece 7.15 ("Tu año en Biblioshare") antes de construir esa retrospectiva |
| 7.27 Citas y frases destacadas | S (texto) / M (OCR) | — | Empezar por texto simple; OCR es una fase aparte |
| 7.23 Retos personalizables | L | 7.5, 7.12 | Motor de filtros compartido — construir después de esos dos |
| 7.30 Modo sin spoilers global | M | §8-E (enfoque confirmado) | Vale la pena como utilidad compartida, no antes de tener 1–2 consumidores reales |
| 7.21 Comparador de adaptaciones | M-L | §8-B (resuelto) | Diferenciador fuerte; ya tiene modelo de relaciones definido |
| 7.26 Listas colaborativas | M | 7.4/7.15, modelo de permisos | Construir primero la versión de un solo dueño |
| 7.20 Clubs con hitos anti-spoiler | L | Base de usuarios, §8-E | Necesita masa crítica para tener sentido |
| 7.24 Notas ancladas al progreso | M | §8-E | Tabla nueva; valor real pero no urgente |
| 7.19 Recomendaciones cruzadas | XL | §8-B (resuelto) + normalización géneros (abierta) | El más caro; empezar solo con tabla curada a mano si se aborda |

### 7.34 Personas (autores/reparto/equipo) y sagas — *hecho*
Información más rica de los ítems: fichas de persona con su obra, reparto/equipo en cine y series, y pertenencia a saga con vista propia. Cierra la parte de sagas de 7.4.

- [x] **Modelo nuevo** (migración `add_people_credits_sagas`): cuatro tablas de catálogo compartido con el mismo RLS que `books`/`movies`/`series` (SELECT abierto; INSERT/UPDATE autenticado):
  - `people` — entidad de persona (`tmdb_id` para cine/series, `openlibrary_key` para autores; `name`, `photo_url`, `bio`, `birth_date`, `death_date`, `place_of_birth`). Índices únicos parciales sobre `tmdb_id` y `openlibrary_key`.
  - `credits` — relación persona↔ítem **polimórfica** (`item_type` + `item_id`, sin FK cruzada, como `library_entries`), con `role` (`cast|director|writer|creator|author`), `character` y `billing_order`. UNIQUE `(item_type,item_id,person_id,role)`.
  - `sagas` — entidad de saga con página propia (`name`, `overview`, `cover_url`, `tmdb_collection_id`, `source` `tmdb|manual`).
  - `saga_items` — miembros de la saga (polimórfico + `position`). UNIQUE `(saga_id,item_type,item_id)`.
- [x] **Cine/series (TMDB)**: `getMovieDetails`/`getSeriesDetails`/`getPersonDetails`/`getCollection` en `src/lib/catalog/tmdb.ts`. Reparto top ~10 + equipo clave (dirección/guion/creación). La bio/foto/fechas de la persona se enriquecen de forma **perezosa** al abrir su ficha (`getPersonDetails`, con fallback `en-US` si la bio en español viene vacía).
- [x] **Autores de libro (Open Library)**: `resolveOpenLibraryAuthor` en `src/lib/catalog/open-library.ts` (search/authors + /authors) aporta bio/foto/fechas del autor; si no hay match, la ficha degrada con elegancia a versión ligera (solo nombre + su obra del catálogo), nunca rompe.
- [x] **Caché "cache-as-you-go"** (§7.32): `src/lib/people/enrich-item.ts` (`ensureItemEnriched`) trae y persiste créditos (y, en películas, la saga desde `belongs_to_collection`) la **primera** vez que se abre la ficha; las siguientes visitas leen solo de la BD. Guard sobre la existencia de créditos; envuelto en try/catch para que un fallo de API externa no rompa la ficha.
- [x] **Dominio**: `src/lib/people/` (`find-or-create-person.ts` con alta por lotes de personas TMDB e idempotencia de autores; `get-item-credits.ts`; `get-person.ts` con "su obra" resuelta desde `credits`) y `src/lib/sagas/` (`persist-collection.ts`, `get-item-saga.ts`, `get-saga.ts` que **completa perezosamente** las partes de una colección TMDB reconstruyendo `saga_items` de forma determinista para garantizar el orden por año, `manage-saga-actions.ts` para asignación manual).
- [x] **UI**: fichas `/persona/[id]` (foto, fechas, bio, "Su obra") y `/saga/[id]` (portada, overview, títulos ordenados) — rutas en español como el resto. Sección "Reparto y equipo" (`src/components/credits-section.tsx`) en cine/series; autor/dirección/creación enlazados a su ficha; chip de saga en la ficha; formulario de asignación manual de saga (`src/components/saga-assign-form.tsx`) para libros. Helpers `personHref`/`sagaHref`. i18n `person`/`saga` + claves nuevas en `item`.
  - **Desactualizado (2026-07-14, ver §7.38)**: `saga-assign-form.tsx` se **absorbió y se borró** al construir el editor de ficha oficial — la asignación de saga se hace ahora desde ahí (`src/components/detail/catalog-editor.tsx`), junto al resto de la edición del catálogo, no como un formulario aparte en la ficha de lectura.
- **Verificado en navegador con datos reales** (limpiados después): Matrix → reparto con fotos (Keanu Reeves como Neo, etc.), dirección/guion Wachowski enlazados, chip "Matrix - Colección", y `/saga` con las 4 películas en orden cronológico (1999→2021); El Quijote → autor Cervantes enlazado a su ficha con bio/foto de Open Library y "Su obra"; asignación manual de saga a un libro con su posición. Segunda visita no vuelve a llamar a la API (créditos/saga ya en BD).
- **Resuelto al construir**: el primer render de una ficha dispara enriquecimientos **concurrentes** (varias inserciones a la vez) → el alta de personas maneja el `23505` de carrera re-seleccionando; el orden de una colección TMDB se garantiza reconstruyendo `saga_items` (borrar+reinsertar) en cada visita de la saga, porque `upsert` sobre el índice único no actualizaba la posición de filas ya existentes.
- **A mejorar a futuro — bio de autor en español**: Open Library solo ofrece la biografía de autor **en inglés** (a diferencia de TMDB, que sí se resuelve en `es-ES` para personas de cine/series). Para tener bios de autor en español habría que añadir **Wikidata/Wikipedia** como fuente adicional (resolver el autor por nombre → QID de Wikidata → extracto de Wikipedia en español), como capa de enriquecimiento sobre la ficha ligera. No bloqueante; queda como mejora.
- **Actualización (2026-07-19, Sagas v2 fase 1 de 4, ver `docs/superpowers/specs/2026-07-19-sagas-v2-design.md` y 7.4)**: la restricción "un ítem = una sola saga" (`saga_items_item_key`) se **elimina** — un ítem puede pertenecer a N sagas, con una marcada `is_primary` (la que se muestra en el strip/breadcrumb de la ficha de obra); `getItemSagas` ordena primary primero. `sagas` gana jerarquía real (`parent_saga_id` con trigger anti-ciclos) y `accent_color`: las subsagas (ej. Iron Man dentro del UCM) son **sagas completas anidadas**, no una etiqueta ligera — las colecciones TMDB existentes se reutilizan como subsagas. `assignItemToSaga` deja de borrar la membresía previa (ahora upsert + `is_primary`); `populateTmdbCollection` deja de hacer delete+insert de `saga_items` (ahora diff no destructivo vía `planCollectionSync`, para no pisar membresías manuales ajenas a TMDB ni la `is_primary`). Tablas nuevas `saga_nodes`/`saga_edges` (grafo de lectura de una saga, referencia polimórfica a ítem o a subsaga completa) y `saga_follows` (seguimiento explícito vía `user_id`+`saga_id`, sin inclusión implícita por tener ítems propios en la saga) — creadas con RLS pero **sin datos ni UI todavía** (grafo vacío hasta fases 2-3; pestaña de Mi Biblioteca en fase 4). `database.types.ts` regenerado. **Actualización (2026-07-19)**: las 6 migraciones se aplicaron también a prod al mergear el PR #87; `schema-baseline.sql` ya las anexa.
- **Actualización (2026-07-19, Sagas v2 fase 2 de 4, ver 7.4)**: `saga_nodes`/`saga_edges` dejan de estar vacías — viewer del grafo construido y **verificado** (QA navegador 8/8 + e2e). El canvas (embebido en `/saga/[id]` y a pantalla completa en `/saga/[id]/mapa`) usa **React Flow** (`@xyflow/react`), fijo a **modo oscuro** con independencia del tema de la app — decisión de legibilidad de las aristas coloreadas por subsaga, no un descuido de tema. El timeline ramificado móvil **no se persiste aparte**: se deriva de `saga_nodes`/`saga_edges` en cada render (`deriveTimeline`), confirmando la previsión ya anotada en fase 1 de que grafo e Info nunca discrepen. Deuda consciente: la navegación de nodos solo funciona con puntero (limitación de teclado de React Flow con `elementsSelectable=false`). Sigue sin editor (fase 3) ni pestaña de Mi Biblioteca (fase 4); el grafo solo se puebla hoy por SQL.

### 7.35 RBAC: roles usuario / colaborador / administrador — *hecho*
Control de acceso por roles con tres grados jerárquicos (`user < collaborator < admin`).

- [x] **Modelo** (migración `add_rbac_roles`): enum `user_role` (orden de declaración = jerarquía),
  columna `profiles.role` (default `'user'`). Funciones `SECURITY DEFINER` `current_user_role()` y
  `has_min_role(min)` para usar en RLS **sin recursión** (bypassan la RLS de `profiles`).
- [x] **Protección anti-escalada** (crítica): trigger `BEFORE UPDATE` `enforce_role_change_admin_only`
  que impide cambiar `role` salvo que el actor sea admin. Refinado (migración
  `rbac_bootstrap_trigger_guard`) para permitir el cambio cuando `auth.uid()` es null (service_role
  / SQL directo, ya privilegiados) → así se puede **bootstrapear el primer admin** por SQL, mientras
  los usuarios finales autenticados no pueden auto-promoverse. Políticas RLS nuevas: "admins select
  all profiles" y "admins update any profile".
- [x] **Colaborador = solo contribución manual/curada.** Los flujos **automáticos**
  (`findOrCreateCatalogItem` en búsqueda→catálogo, y el auto-enriquecimiento de §7.34) **no se
  tocan** — siguen abiertos a todos. El gateo se aplica en las **server actions** manuales
  (`addManualItem`, `assignItemToSaga`/`removeItemFromSaga`, con `hasMinRole(...,'collaborator')`) y
  ocultando la UI (enlace "Añádelo manualmente" en `/buscar`, y —desde §7.38— el botón "Editar
  ficha" que da acceso a sagas/ediciones/portada, antes era `SagaAssignForm` suelto en la ficha de
  libro), además de guardar la página `/buscar/manual`. Capa de dominio: `src/lib/auth/roles.ts`
  (`UserRole`, `hasMinRole`, `getCurrentUserRole`); `Profile`/`PROFILE_COLUMNS` extendidos con `role`.
- [x] **Admin**: página `/admin` (guardada con redirect si no es admin) que lista usuarios y cambia
  su rol (`src/app/admin/`: `page.tsx`, `actions.ts` con `updateUserRole`, `role-select.tsx`); el
  admin no se cambia su propio rol (fila deshabilitada). Enlace "Admin" en el Header solo para
  admins. i18n `admin` + claves `forbidden`.
- **Bootstrap**: el primer admin se pone a mano por SQL
  (`update profiles set role='admin' where username='<owner>'`); luego se gestiona desde `/admin`.
  (Owner del proyecto = `borjar20`, ya admin.)
- **Verificado en navegador (flipando el rol en BD y recargando)**: como `user` → sin enlace manual,
  `/buscar/manual` redirige, sin formulario de saga, `/admin` redirige, sin enlace Admin, pero la
  búsqueda+añadir a biblioteca sigue funcionando; como `collaborator` → aparecen y funcionan las
  superficies manuales, sin Admin; como `admin` → enlace Admin, `/admin` lista usuarios y cambia el
  rol de otro (confirmado en BD). **Anti-escalada probada a nivel BD**: un usuario final autenticado
  no-admin recibe `ERROR: Only an admin can change a user role` al intentar cambiar un rol, mientras
  que editar el resto del perfil (bio/visibilidad/objetivos) sí funciona.

### 7.36 Información y puntuación por episodio de series — *hecho*
Referencia: captura de un competidor (Ss de The Boys) con una rejilla temporada × episodio de
notas coloreadas por tramo. La ficha de serie **sigue siendo única** (no hay página por
episodio); gana una capa por episodio para listar temporadas/episodios, marcar vistos, puntuar
y reseñar, más una rejilla de la nota agregada de la comunidad.

- [x] **Modelo nuevo** (migración `series_episodes`): dos tablas (ver §3.5). `series_episodes`
  (catálogo, mismo RLS que `series`) + `episode_watches` (visto + nota/reseña por usuario, RLS
  como `diary_entries`). **Aditivo**: la nota global de serie (`library_entries.rating`) y lo
  que la consume (comunidad, stats anuales §7.14, retos §7.10) quedan intactos — ambas capas
  conviven, decisión de producto para no tratar las series como caso especial en todo el resto.
- [x] **Rejilla = solo comunidad Biblioshare** (decisión de producto): la rejilla muestra la
  nota agregada de `episode_watches` de perfiles visibles, **no** el `vote_average` de TMDB.
  TMDB solo cataloga los episodios (título/sinopsis/fecha/imagen), no puntúa. Está vacía hasta
  que hay votos.
- [x] **Registro = marcar visto + nota/reseña opcional**: cada episodio tiene checkbox "Visto"
  y, opcional, nota (1–10) + reseña. Marcar visto **adelanta la posición** de la serie al
  episodio más avanzado (reutiliza el "roll forward" de `addSession`, §7.14) y saca de `planned`;
  si no seguías la serie, la sigue en `in_progress`.
- [x] **TMDB** `getSeriesEpisodes(tmdbId, totalSeasons)` (`src/lib/catalog/tmdb.ts`, endpoint
  `/tv/{id}/season/{n}`, temporada 0 "especiales" omitida) + **cache-as-you-go**
  `ensureSeriesEpisodes` (`src/lib/library/ensure-series-episodes.ts`), mismo patrón que
  `ensureItemEnriched` (guard de existencia, nunca lanza, ignora `23505`).
- [x] **Dominio**: `src/lib/series/` — `get-episode-data.ts` (`aggregateEpisodeData` puro +
  `getEpisodeData`: rejilla comunidad + lista por temporada con el estado del propio usuario),
  `get-episode-reviews.ts` (reseñas por episodio etiquetadas `SxEy`, patrón de
  `get-community.ts`), `episode-actions.ts` (`setEpisodeWatched`/`rateEpisode`). Test unitario
  de la agregación en `get-episode-data.test.ts`.
- [x] **UI**: pestaña **Episodios** solo para series (`ItemDetailTabs` gana un slot opcional).
  Orquestador `episode-panel.tsx` (client) con contador de vistos y dos conmutadores:
  **Rejilla/Lista** y **Mis notas/Comunidad** (este último como el selector "Public Ratings" de
  la referencia). `episode-grid.tsx`: rejilla con **temporadas en filas y episodios en
  columnas**, panel de detalle al pasar el ratón, media por temporada, escala de 6 tramos
  (`src/lib/series/rating-scale.ts`), celda con la nota o el nº de episodio si no hay dato, dot
  de "tiene nota". `episode-list.tsx`: temporadas **colapsables** con cabecera (episodios ·
  vistos · media), checkmark de visto, valoración por **dots con precisión de medio punto**
  (`episode-rating.tsx`, escala 1–10 estilo Letterboxd) y reseña expandible; iconos SVG
  `CheckIcon`/`NoteIcon`. El conmutador de fuente alterna la vista interactiva del propio usuario
  y la agregada de la comunidad. Las reseñas de la pestaña Comunidad pasan a ser **por episodio**
  para series. i18n `detail.grid.legend` + sección `episode`.
- **Descubierto y corregido durante la verificación** — hueco de datos análogo al de §7.22: una
  serie recién creada por la búsqueda llega **sin `total_seasons`** (backfill perezoso más
  tarde), así que `ensureSeriesEpisodes` no cacheaba nada y la pestaña no aparecía. Corregido
  resolviendo el nº de temporadas desde TMDB (`getSeriesDetails`) cuando el catálogo aún no lo
  tiene → funciona en la **primera** visita.
- **Verificado en navegador de extremo a extremo (dev, Playwright)**: login → buscar "the boys"
  → ficha → pestaña Episodios → rejilla (S1–S5 × E1–E8) → marcar T1E1 visto + nota 9 → la celda
  y la fila `MEDIA` muestran `9.0` → desmarcar la limpia; la serie pasa a "En curso". Migración
  aplicada a dev y prod; advisors sin regresiones nuevas.

### 7.37 Registro de pases y ediciones — *hecho*
Dos problemas resueltos juntos porque comparten modelo: el registro personal estaba fragmentado
(nota y reseña repartidas entre `library_entries.rating`, `diary_entries.rating` y hasta tres
campos de texto libre) y no había ediciones (una ficha de libro mezclaba la obra con una tirada
concreta, así que "voy por la página 240 de 662" era falso para quien lee la de bolsillo). Diseño
completo en `docs/superpowers/specs/2026-07-14-registro-pases-ediciones-design.md`.

- [x] **Ediciones de catálogo** (migraciones `20260714_editions*.sql`): dos tablas nuevas,
  `book_editions` (`label`, `publisher`, `published_year`, `language`, `total_pages`, `isbn`,
  `cover_url`, `is_primary`, `created_by`) y `movie_versions` (`label`, `release_year`,
  `duration_minutes`, `is_primary`, `created_by`), colgando de `books`/`movies` respectivamente
  — la obra sigue siendo la obra (título, autoría, sinopsis); la edición es lo que varía entre
  tiradas (editorial, ISBN, páginas) o cortes (versión teatral/extendida, duración). Índice único
  parcial garantiza una sola `is_primary` por obra. **Las series no tienen ediciones**: su unidad
  de progreso son los episodios (§7.36).
  - Backfill: cada libro/película ya existente engendró su edición/versión primaria con los datos
    que hoy llevaba sueltos en la ficha (`books.publisher`/`total_pages`/`isbn`,
    `movies.duration_minutes`). Esas columnas se dejan en `books`/`movies` como espejo hasta una
    limpieza posterior, fuera de esta spec.
  - Alta automática para obras nuevas: triggers `books_create_primary_edition`/
    `movies_create_primary_version` (`AFTER INSERT` en `books`/`movies`) crean la primaria al
    nacer la obra; `book_editions_ensure_primary`/`movie_versions_ensure_primary`
    (`BEFORE INSERT` en `book_editions`/`movie_versions`) promueven a primaria la primera edición
    de una obra que aún no tuviera ninguna — para que un libro añadido desde la búsqueda (cuya
    edición nace por la vía de abajo, no por el backfill) nunca se quede sin edición primaria.
  - RLS: lectura pública; `INSERT`/`UPDATE` directo exige colaborador+ (mismo nivel que asignar
    sagas, §7.35) — es catálogo compartido, la curación manual es cosa de colaborador+.
  - **Alta desde la búsqueda, sin exigir colaborador**: al añadir un libro por ISBN, ese ISBN
    concreto se registra como edición vía la función `register_book_edition` (`SECURITY DEFINER`,
    ejecutable por cualquier autenticado) — valida el ISBN de verdad (10/13 dígitos con dígito de
    control), sanea páginas/año fuera de rango, firma `created_by = auth.uid()` del lado del
    servidor, e ignora en silencio si ya existía (`on conflict do nothing`, idempotente). No se
    abrió el `INSERT` directo a cualquiera: se probó así primero y una revisión encontró que
    dejaba escribir editorial/portada/páginas inventadas en cualquier libro con solo poner un
    ISBN de 10–20 caracteres — la función validada es el endurecimiento posterior.
    **Riesgo residual asumido**: un usuario autenticado puede llamar a la función a mano con un
    ISBN de checksum válido y colgar una edición inventada de un libro ajeno. No es escalada de
    privilegios, queda firmado en `created_by` y es reversible; se sube el listón (límite de tasa
    o cola de revisión) solo si aparece spam real — no merece más maquinaria hoy.
- [x] **El pase**: `diary_entries` pasa a ser el "pase" — una lectura o un visionado, dueño único
  de la nota y la reseña. `finished_on` ahora nullable (`null` = pase abierto, "lo estoy
  leyendo/viendo ahora mismo"). Columnas nuevas: `is_public` (interruptor "visible para la
  comunidad") y `edition_id` (uuid nullable, la edición contra la que se hizo el pase). Nadie abre
  un pase a mano en el flujo normal: lo hace el cambio de estado (`updateStatus`,
  `src/lib/library/manage-actions.ts`, vía `passEffect` en `src/lib/passes/transitions.ts`):
  - Libro/serie → `in_progress` abre un pase (si no había ya uno abierto).
  - → `completed` cierra el pase abierto, o si no había ninguno (el ciclo natural de una
    película: Pendiente → Vista sin pasar por "viendo"), abre y cierra uno en el mismo gesto.
  - → `dropped` cierra el pase abierto (se abandonó ese día); un pase abandonado cuenta en el
    diario pero no aporta nota a la comunidad.
  - Releer/re-ver con todos los pases cerrados abre uno nuevo automáticamente.
  - **La tabla física sigue llamándose `diary_entries`**: nada la referencia por FK, pero
    renombrarla habría obligado a tocar RLS, feed, notificaciones e interacciones de reseña sin
    ganar nada funcional. La capa de dominio (`src/lib/passes/`) y la interfaz sí hablan de
    "pases" y de "diario" — la palabra "pase" no aparece en la UI que ve el usuario final.
  - Dos invariantes garantizados en **base de datos**, no solo en la app (los cambios de estado
    pueden llegar en paralelo desde dos pestañas): **un solo pase abierto por entrada** (índice
    único parcial `library_entry_id where finished_on is null`) y **un solo pase cerrado por día
    y por entrada** (índice único `(library_entry_id, finished_on) where finished_on is not
    null`) — este segundo cierra una carrera real encontrada en revisión: un doble clic en
    "Visto" insertaba dos pases, porque el primer índice solo protege pases *abiertos* y el gesto
    Pendiente→Visto inserta uno que nace ya *cerrado*. Un trigger (`check_pass_edition`) impide
    además que un pase apunte a la edición de otra obra (p. ej. colgar del pase de "Dune" una
    edición de otro libro).
- [x] **Nota: 1–10 en BD, 5 estrellas en pantalla**. La columna sigue siendo `smallint` 1–10 (sin
  migración de datos, sin pérdida de precisión); el selector y toda la UI muestran medias
  estrellas (0,5–5). Conversión centralizada en `src/lib/rating/stars.ts` (`toStars`/`fromStars`/
  `formatStars`) — módulo nuevo, no confundir con `src/lib/series/rating-scale.ts` (los colores
  por tramo de la rejilla de episodios, otra cosa distinta).
- [x] **Lo que pierde `library_entries`**: `rating` y `notes` quedan huérfanos a propósito — el
  pase es ahora el dueño de la nota y la reseña. Ambas columnas se quedan en la base de datos
  (nadie las lee ya) para poder revertir sin pérdida; su eliminación queda para una limpieza
  posterior, fuera de esta spec.
- [x] **Comunidad agrega desde pases, no desde `library_entries.rating`**: la media/histograma de
  un ítem sale ahora del **último pase cerrado no abandonado** de cada usuario
  (`src/lib/community/get-community.ts`, `latestRatingPerUser`); las reseñas son los pases con
  `is_public = true` y texto. Cada reseña luce un chip con su edición cuando el pase tiene una
  asignada (`formatEdition`); deliberadamente sin filtro por edición (con pocas reseñas dejaría la
  lista vacía). Verificado contra dev que la media no cambia tras la migración, salvo en el caso
  esperado (un ítem con dos pases del mismo usuario en fechas distintas, donde ahora gana el pase
  más reciente en vez del `library_entries.rating` desactualizado).
- [x] **Privacidad de `is_public`**: una revisión encontró que ninguna consulta de consumo público
  filtraba por esta columna — las notas privadas migradas desde `library_entries.notes`
  (backfilleadas con `is_public = false`) se habrían mostrado como reseñas públicas. Corregido con
  `.eq("is_public", true)` en las cuatro consultas de consumo público: pestaña Comunidad, pestaña
  Actividad del perfil, feed de seguidores y resolución de posts compartidos en clubes.
- [x] **Sesiones cuelgan del pase**: `progress_sessions` gana `pass_id` y hereda su edición (la
  línea "Edición: X" que se pinta sobre la lista de sesiones). Página `/sesion/[entryId]`
  repintada:
  - **Libro**: tramo página desde→hasta con delta en vivo contra la edición del pase abierto
    ("▲ 60 páginas · quedan 422"), y duración en dos modos, **a mano** o **cronómetro**.
  - **Cronómetro persistente** (`src/lib/sessions/timer.ts`): guarda el instante de arranque en
    `localStorage` (clave `biblioshare:timer:<entryId>`), no un contador corriendo — sobrevive a
    recargar y a cerrar la app, y el tiempo transcurrido se calcula siempre por diferencia de
    tiempo (`elapsedMs`), nunca acumulando ticks de un intervalo. Si al volver lleva más de 4
    horas corriendo (`isStale`), se muestra en pausa con un aviso y dos salidas: escribir los
    minutos a mano o descartarlo. No cruza de dispositivo a propósito (leer no suele repartirse
    entre móvil y portátil, y llevarlo a la base de datos costaría tabla, acciones y resolución de
    conflictos).
  - **Serie**: selector de temporada + chips de episodio que marcan vistos, reutilizando la misma
    escritura (`markEpisodeWatched`, extraída a `src/lib/series/episode-watch-store.ts`) que la
    pestaña Episodios — sin duplicar la lógica. El progreso de la entrada se deriva siempre del
    episodio más avanzado en `episode_watches` (`rollSeriesProgress`), nunca de lo que llegó en el
    último envío, así que registrar un episodio antiguo nunca retrocede el progreso.
- [x] **Interfaz de la pestaña Registro** (rehecha, `src/components/detail/log-panel.tsx`,
  sustituye a `item-manage-panel.tsx`/`progress-panel.tsx`/`diary-panel.tsx`, los tres jubilados):
  segmented control de estado con cuatro pastillas (`status-segments.tsx`), panel Progreso solo
  con pase abierto (nota, "voy por la página X de Y" contra tu edición, selector de edición),
  sesiones, diario de pases (`pass-diary.tsx`, con delta "▲ +1★ vs. anterior" contra el pase
  anterior) y "Quitar de mi biblioteca" al pie. Al marcar Leído/Vista se abre la **hoja de cierre
  de pase** (`close-pass-sheet.tsx`, diálogo modal nativo `<dialog>`): fecha de fin, estrellas,
  reseña e interruptor "visible para la comunidad"; "Ahora no" no descarta nada (el pase ya quedó
  cerrado por el cambio de estado), solo deja la nota pendiente de completar después desde el
  diario.
- **Fuera de alcance de esta spec** (documentado en el propio diseño, candidatas a specs
  propias): sagas múltiples con selector, editor de ficha oficial del moderador, reparto y
  plataformas, filtro de reseñas por edición, y la limpieza final de `library_entries.rating`/
  `notes` y de las columnas de edición duplicadas en `books`/`movies`.
  - **Hecho (2026-07-14, ver §7.38)**: el editor de ficha oficial del moderador (colaborador+) ya
    está construido. Las demás candidatas (sagas múltiples con selector, reparto/plataformas,
    filtro de reseñas por edición, limpieza de columnas duplicadas) siguen sin abordarse.
- **Verificado**: checklist manual en
  `docs/superpowers/plans/2026-07-14-registro-pases-ediciones-manual-test.md` (el proyecto no usa
  E2E automático, ver `docs/TESTING.md`); consultas de control contra dev confirmando que la media
  de comunidad no se mueve tras la migración salvo en el caso esperado documentado arriba.

### 7.38 Ediciones en la ficha y editor de ficha oficial — *hecho*
Continúa §7.37 (donde nacieron `book_editions`/`movie_versions`, pero solo se registraba UNA
edición por libro —la del ISBN elegido al añadir— y la ficha seguía pintando datos de tirada como
si fueran de la obra). Tres problemas del mismo origen, resueltos en tres fases entregables por
separado. Diseño completo en
`docs/superpowers/specs/2026-07-14-ediciones-ficha-y-editor-design.md`.

- [x] **Fase A — la ficha muestra la edición que estás mirando.** El panel de metadatos deja de
  pintar editorial/ISBN/páginas/idioma de `books`/`movies` como si fueran de la obra; se queda con
  autoría, año de primera publicación y géneros (ver también §7.1, corregido). La tira de
  ediciones (`src/components/detail/edition-strip.tsx`) pasa a ser clicable: pulsar una tarjeta
  pinta sus propios datos —editorial, año de la tirada, idioma, páginas, ISBN, portada propia si
  la tiene— en el panel bajo la sinopsis (`EditionsSection`/`EditionDetails`,
  `src/components/detail/edition-details.tsx`), en el mismo hueco visual que antes ocupaba
  `MetadataSidebar`; "volver a la obra" restaura el panel de la obra.
  - **Mirar no es adoptar**: dos ids deliberadamente distintos en `EditionStrip`/`EditionDetails` —
    `viewingId` (qué se está mirando ahora mismo en el panel, cambia libremente) y
    `selectedEditionId` (la edición del PASE abierto, marcada con ✓ y "La tuya" en la tira).
    Curiosear otras ediciones nunca toca el registro personal; adoptar una es un gesto aparte, en
    el Registro.
  - **Elegir tu edición se pregunta en dos momentos**, siempre con salida "No lo sé": al pulsar
    "Seguir" (si el libro/película tiene más de una edición, `FollowButton` en
    `src/components/detail/log-panel.tsx`) y, si no se contestó entonces, en el panel Progreso al
    empezar a leer (`ProgressBlock`, mismo componente). La respuesta —incluida "No lo sé"— se
    recuerda en `localStorage` por `passId`, no por ítem (`src/lib/passes/edition-asked.ts`): una
    relectura abre un pase nuevo y la pregunta vuelve a aparecer para ese pase.
  - **Decisión: la edición vive en el PASE, no en la entrada de biblioteca.** No existe
    `library_entries.preferred_edition_id`. "Seguir" siempre crea la entrada con estado `planned`
    (nunca abre un pase de una), así que si eliges edición al pulsar "Seguir" pero el alta queda en
    Pendiente, la elección **se descarta sin más** — no hay pase todavía donde guardarla, y se
    vuelve a preguntar cuando de verdad se empiece a leer y se abra uno. Alternativa descartada:
    guardar la elección en la entrada "por si acaso" habría resucitado exactamente la duplicidad de
    "dónde vive la edición" que §7.37 vino a eliminar. Ver el comentario de
    `addExistingItemToLibrary` en `src/lib/library/add-existing-item.ts`.
  - **Deuda heredada sin cerrar** (ya anotada al planificar, no un descubrimiento de última hora):
    `library-item-card.tsx` y `search-result-card.tsx` siguen pintando `publisher`/`pageCount` de
    `books` en las tarjetas de "Mi biblioteca" y de resultado de búsqueda, como si fueran de la
    obra — fuera del alcance de esta fase, que solo tocó la ficha de detalle (ver §7.1).
- [x] **Fase B — traer las ediciones reales de OpenLibrary** (migraciones
  `20260714_editions_sync.sql`, `20260714_editions_sync_rls.sql`). Al **abrir la ficha** de un
  libro, y solo con **sesión iniciada**, se piden sus ediciones a
  `https://openlibrary.org/works/<WORK_KEY>/editions.json` y se registran vía la RPC
  `register_book_edition` que ya existía (§7.37) — mismo cache-as-you-go que ya enriquece autores.
  - **Columnas nuevas**: `books.openlibrary_work_key` (antes se guardaba a medias en
    `books.google_books_id`, una columna cuyo nombre miente desde que el proyecto migró de Google
    Books a OpenLibrary) y `books.editions_synced_at`. Backfill de las 80 filas de prod que ya
    tenían la work key en la columna vieja; el resto la resuelve `resolveWorkKey()` por ISBN la
    primera vez que se abre su ficha.
  - **La marca de sincronización se pone incluso si no se importa nada**: una obra oscura sin
    ediciones en OpenLibrary, o sin work key resoluble, se marca `editions_synced_at` igual — una
    obra sin ediciones no puede pagar una llamada externa en cada visita a su ficha. Si algún día
    OpenLibrary la cataloga, no hay forma automática de enterarse; se acepta ese caso raro a cambio
    de no repetir la llamada en la inmensa mayoría de obras que nunca tendrán ediciones ahí. Un
    colaborador puede forzar la resincronización desde el editor (`resyncEditions`, Fase C).
  - **Solo con sesión** (`src/app/libro/[id]/page.tsx`): un visitante anónimo no puede escribir ni
    la RPC (exige `auth.uid()`) ni la marca de sincronización (el grant es de `authenticated`) —
    sin este guardia, cada visita anónima a una ficha sin sincronizar pagaría hasta cinco llamadas
    a OpenLibrary y veinte RPC para tirarlo todo a la basura, una y otra vez.
  - **El filtro que decide si el selector sirve de algo** (`src/lib/catalog/openlibrary-editions.ts`,
    función pura `pickEditions`, testeada): descarta lo que no tiene **ISBN válido** (mismo dígito
    de control que `register_book_edition`), deduplica por ISBN, descarta una **lista negra de
    editoriales de impresión bajo demanda** (Independently Published, CreateSpace, Lulu,
    BiblioBazaar, Nabu Press, Kessinger, Books on Demand...) —reimpresiones automáticas sin curar,
    casi siempre de dominio público, que en los clásicos inundan las primeras páginas de resultados
    desplazando a las ediciones reales—, prioriza **español e inglés**, y corta en **20** por obra
    (de más reciente a más antigua, con más peso a las que traen portada y páginas/editorial
    conocidas). Sin el tope y la lista negra, El Quijote mostraba solo 20 tiradas POD en inglés
    casi idénticas; con el filtro, 20 ediciones españolas reales (Planeta, Vicens Vives, Susaeta,
    Siruela...). Es la parte que decide si el selector de edición es útil o inservible, y se probó
    con obras reales, no con un caso de laboratorio.
  - **Paginación en paralelo solo si hace falta**: la primera página de `editions.json` ya trae el
    total real de ediciones de la obra; si son 100 o menos (la inmensa mayoría de libros) no se pide
    nada más. Solo para obras muy reeditadas se piden hasta 4 páginas adicionales (5 en total, 500
    ediciones), todas EN PARALELO (`Promise.allSettled`) para no multiplicar por 5 el tiempo de la
    primera visita a la ficha, tolerando que alguna falle sin dejar la ficha sin ediciones.
  - **Errores nunca bloquean el render**: `fetchWorkEditions`/`resolveWorkKey` no lanzan nunca —un
    fallo de red, un timeout (5s) o una respuesta inesperada se tratan como "esta llamada no aportó
    nada", nunca como excepción que tumbe la ficha.
  - **Bug de RLS encontrado y corregido**: `books` tenía RLS activado pero **sin ninguna política de
    `UPDATE`** (el `GRANT` de columna de `20260714_editions_sync.sql` no basta sin una `POLICY` —
    Postgres filtra la fila a actualizar a cero silenciosamente, sin lanzar error). El síntoma:
    `editions_synced_at` se quedaba en `null` para siempre y cada visita a la ficha repetía la
    llamada a OpenLibrary, justo lo que esta fase quería evitar. De paso se cerró un grant heredado
    más amplio de lo previsto (`books` tenía `UPDATE` concedido en TODAS sus columnas a `anon` y
    `authenticated`, un hueco que nunca recibió el revoke+grant acotado por columnas que sí
    aplicaron `movies`/`series` — `books` no existía todavía en esa migración). Corregido en
    `20260714_editions_sync_rls.sql`: `revoke update` general + `grant` acotado a las dos columnas
    + política `using(true) with check(true)` (mismo criterio de permisividad que el resto del
    catálogo compartido).
- [x] **Fase C — editor de ficha oficial** (migraciones `20260714_covers_bucket.sql`,
  `20260714_edition_delete_guard.sql`, `20260714_catalog_edit_grants.sql`;
  `src/components/detail/catalog-editor.tsx`). Colaborador+ (mismo nivel que crear ediciones o
  asignar sagas, §7.35) puede, en las **tres** fichas: corregir título, autoría/dirección/creación,
  sinopsis, géneros y año; subir una portada nueva; crear, **editar y borrar** ediciones/versiones
  (antes solo se podían crear); asignar sagas (absorbe y jubila `saga-assign-form.tsx`, ver §7.34);
  y volver a pedir las ediciones a OpenLibrary (`resyncEditions`, pone `editions_synced_at` a
  `null` y deja que la sincronización de la Fase B actúe como si fuera la primera visita). Entra
  desde un botón "Editar ficha" en la pestaña Info (solo colaborador+), que conmuta la ficha a
  formulario en la misma página (patrón `ClubForm`) con barra fija de Guardar/Cancelar.
  - **Decisión: la restricción de colaborador+ va en un TRIGGER, no (solo) en una policy RLS.**
    Una política RLS filtra **filas**, no columnas. `books`/`movies`/`series` ya tenían una política
    `UPDATE` permisiva (`using(true)`) para que cualquier `authenticated` pudiera seguir escribiendo
    sus columnas de sincronización de siempre (`openlibrary_work_key`, `duration_minutes`,
    backfill de temporadas/episodios...). Si el `GRANT` de columna se ampliara con
    título/sinopsis/géneros/año/portada bajo ESA misma política, cualquier autenticado —no solo
    colaborador+— podría reescribirlos vía REST directo, porque las políticas permisivas se
    combinan con OR y ninguna sabe qué columnas trae el `UPDATE` concreto. Por eso la restricción
    de rol para estos campos va en `enforce_catalog_edit_collaborator_only()` (trigger
    `BEFORE UPDATE`, mismo patrón que `enforce_people_enrich_only`): compara `OLD`/`NEW` columna a
    columna y solo lanza si alguna de las protegidas cambió y el actor no es colaborador+ (o
    `auth.uid()` es `null`, contexto service_role/SQL ya privilegiado).
  - **Decisión: borrar una edición en uso se IMPIDE, no se reasigna a la primaria.** Trigger
    `block_edition_delete_if_used` (`BEFORE DELETE` en `book_editions`/`movie_versions`): cuenta los
    pases (`diary_entries.edition_id`) que apuntan a la fila y lanza `edition_in_use` si hay
    alguno. `edition_id` es polimórfico (apunta a una tabla u otra según el tipo de ítem), así que
    no admite clave ajena con `on delete restrict` — la protección tiene que ir en un trigger, que
    además cubre cualquier vía de borrado futura, no solo la de hoy. Reasignar en silencio a la
    edición primaria se descartó explícitamente: falsearía el progreso de alguien que no ha pedido
    nada ("voy por la página 240 de 662" se convertiría en "de 880" sin que su dueño se entere). El
    editor explica cuántos pases usan la edición (`deleteEdition` en `src/lib/catalog/edit-actions.ts`,
    error `inUse`) y dejar que el colaborador decida, no la aplicación.
  - **Portada**: subida real al bucket nuevo `covers` de Supabase Storage (público de lectura),
    replicando el patrón del bucket de avatares con una diferencia que importa: en avatares la
    puerta es la *carpeta* (cada usuario escribe en la suya); en portadas la puerta es el *rol*
    (colaborador+), porque la portada es del catálogo compartido, no de nadie. Validación de tipo
    (`jpeg`/`png`/`webp`) y tamaño (2 MB) en cliente (feedback inmediato) y en servidor (la que
    manda de verdad); un fichero que la excede da un error legible y revierte la preview optimista
    en vez de dejar el overlay de "subiendo…" colgado (bug real encontrado y corregido: una promesa
    rechazada —red caída, timeout, el `bodySizeLimit` de `next.config.ts`— dejaba
    `coverUploading` en `true` para siempre sin el `try/catch` que ahora lo envuelve).
  - **Sin historial ni deshacer**: con colaborador+ el riesgo es asumible (gente de confianza,
    `created_by` deja rastro en las ediciones); si algún día se abre la edición a cualquier
    usuario, un historial de cambios pasa a ser el primer requisito, no un extra.
  - **CRÍTICO encontrado y corregido durante la construcción**: pasar el contenido ya renderizado
    de la ficha como `children` de `CatalogEditor` funcionaba, pero un intento intermedio de
    pasarlo como función (para que `EditFichaButton` pudiera insertarse "donde tocara") reventaba
    las **tres** fichas con 500 en cada visita, incluso para un visitante anónimo (`Functions are
    not valid as a child of Client Components` — una función no se puede serializar a través de la
    frontera servidor→cliente). Corregido con un contexto de React
    (`CatalogEditorContext`/`EditFichaButton`) que deja al servidor seguir componiendo solo
    `ReactNode`s, verificado con las tres rutas devolviendo 200 tras el arreglo.
- **Fases entregables por separado**: tras la A, la ficha ya no miente y las ediciones se pueden
  explorar; tras la B, hay ediciones de verdad que explorar; la C abre el catálogo a colaboradores.
  Se aplicó y se pudo verificar cada una antes de seguir con la siguiente.
- **Migraciones aplicadas en dev, prod pendiente**: `20260714_editions_sync.sql`,
  `20260714_editions_sync_rls.sql`, `20260714_covers_bucket.sql`, `20260714_edition_delete_guard.sql`,
  `20260714_catalog_edit_grants.sql`.
- **Verificado**: checklist manual en
  `docs/superpowers/plans/2026-07-14-ediciones-ficha-y-editor-manual-test.md` (el proyecto no usa
  E2E automático, ver `docs/TESTING.md`).

### 7.39 Búsqueda e hidratación de libros: la escalera de tres peldaños — *hecho*

La API de OpenLibrary da **obra + ediciones** y la interfaz muestra **obra + ediciones** (§7.38),
pero en medio había una capa que lo aplanaba todo a "un libro" y lo cacheaba mal. Rehecha para que
cada dato entre por la puerta que le corresponde. Spec:
`docs/superpowers/specs/2026-07-14-busqueda-e-hidratacion-de-libros-design.md`.

**Lo que estaba roto** (diagnóstico, con datos de producción a 14/07/2026: 10 libros cacheados,
ninguno en la biblioteca de nadie, 5 sin sinopsis y 6 sin portada):
- `search.json` devuelve **obras** (`/works/OL…W`), pero se mapeaban como si fueran una edición:
  `isbn` era el primero de una lista de cientos, `publisher` el primero de muchos y `pageCount` la
  **mediana** de páginas — un número que no es el de ningún libro real. Después `group-editions.ts`
  reagrupaba por título+autor: deduplicaba a mano lo que la API ya entrega deduplicado.
- La **sinopsis no llegaba nunca**: se pedía `description` en el parámetro `fields` de `search.json`,
  que no la devuelve. Vive en `/works/<key>.json`, que no se llamaba jamás.
- Los **géneros** eran el volcado crudo de `subject` (cientos de etiquetas: "Protected DAISY",
  "award:nebula_award=novel"), y eso es lo que se pintaba como `GenreTag`.
- Todo eso se **horneaba en la BD** al buscar, y como un hit local por título cortocircuitaba la API
  para siempre, el registro sucio no volvía a curarse nunca.

**Peldaño 1 — la tarjeta (`src/lib/catalog/openlibrary/work-search.ts`)**: se piden solo los campos
que la tarjeta muestra (`key,title,author_name,cover_i,first_publish_year,edition_count`). Un doc es
una obra, `editionCount` es el `edition_count` real de OpenLibrary, y `group-editions.ts` /
`title-match.ts`-para-agrupar desaparecen. **La búsqueda ya no escribe en la base de datos**: los
resultados de la API viajan sin `catalogId` y se fusionan con el catálogo local por
`openlibrary_work_key` (`merge-results.ts`). Una búsqueda por texto **siempre** llama a la API:
cortocircuitarla escondía obras ("dune" no enseñaba "Dune Messiah").
- **Único atajo: el ISBN**, que no es una búsqueda sino un *lookup* de una tirada concreta (el
  escáner de §7.3). Si está en el catálogo, no se llama a la API; si no,
  `openlibrary/isbn-lookup.ts` resuelve la obra a partir de la edición y anota `matchedIsbn`.
- **Revierte el trade-off de §7.32** (ver más abajo): aquel diseño "local gana si hay algo" ahorraba
  llamadas a costa de congelar el catálogo sucio y de no descubrir nada nuevo.

**Peldaño 2 — la ficha (`src/lib/catalog/hydrate-book.ts`)**: la fila de `books` nace al **abrir la
ficha o al añadir el libro**, nunca antes, y nace hidratada desde `/works/<key>.json` (sinopsis,
géneros, portada). Guard: `books.hydrated_at`, hermano de `editions_synced_at`. Nunca bloquea el
render (`after()`, mismo patrón que §7.38); si OpenLibrary falla, `hydrated_at` se queda a null y se
reintenta en la siguiente visita. Los libros viejos, cacheados sucios, **se curan solos** la primera
vez que alguien los abre.
- Escribe vía la RPC `hydrate_book` (`security definer`), que **solo rellena huecos**: `synopsis`,
  `genres` y `cover_url` son columnas curadas (solo colaborador+, §7.38), y hidratar es rellenar un
  hueco, no curar. Un visitante autenticado completa una obra vacía sin poder pisar jamás lo que un
  colaborador escribió a mano en el editor de ficha.
- Si la obra no trae `description`, se cae a la de una de sus ediciones (una llamada extra, y solo en
  ese caso).

**Géneros: vocabulario canónico** (`src/lib/catalog/genres.ts`). Tabla cerrada en español, del mismo
estilo que los géneros de TMDB, con un mapeo `subject → género` y tope de 5; lo que no mapea se
descarta. Dos niveles de coincidencia, y cada uno existe por un falso positivo **encontrado en datos
reales**, no en un test sintético:
- **Prefijo de palabra** para la ficción: con `includes` a secas, el subject `thoughtcrime` de *1984*
  casaba con "crime" y el libro salía etiquetado como novela negra.
- **Coincidencia exacta** para la no ficción, que es la que se contamina con temas: "Psychological
  fiction" y "loss (psychology)" no hacen de *El nombre del viento* un libro de Psicología, ni
  "voyages and travels" uno de Viajes, ni "History and criticism" (crítica literaria) uno de Historia.
- Resultado con datos reales: Dune → Ciencia ficción, Fantasía. 1984 → Ciencia ficción, Clásicos,
  Política, Distopía. El nombre del viento → Fantasía, Juvenil, Aventura, Misterio.

**Esquema** (`20260715_book_hydration.sql`, aplicada en dev, prod pendiente): `books.hydrated_at`,
la función `hydrate_book`, y `drop column books.google_books_id` — la columna legacy que guardaba la
work key de OpenLibrary bajo un nombre que mentía (§7.38 ya había copiado su contenido a
`openlibrary_work_key`). `google-books.ts` era código muerto y se borra.

**Cierra la deuda de §7.1**: `search-result-card.tsx` ya no pinta `publisher`/`pageCount`. Quedaría
`library-item-card.tsx`, que sigue pintándolos desde `books`.

**Alcance**: solo libros. Películas y series (TMDB) mantienen su comportamiento; solo heredan la
misma fusión local + API por id.

## 8. Decisiones de arquitectura (evaluadas antes de construir más)

Estas no son features — son decisiones de forma que, si se toman tarde (después de que ya haya datos o UI construida encima), cuestan un refactor. La mayoría ya se resolvió (8-A, 8-B, 8-C) o se confirmó el enfoque (8-D, 8-E) al revisar este backlog; quedan abiertas la normalización de géneros (nota dentro de 8-B) y 8-F (PWA-only vs. nativo), que es una decisión de producto, no técnica.

### 8-A. ¿"Pausado" es un estado explícito o inferido? — *decidido*
**Decidido**: `paused` es un **estado explícito** en `media_status` (enum) — migración barata (`ALTER TYPE ... ADD VALUE`), evita heurísticas de inactividad frágiles, y evita re-modelar el filtro de estados (`LibraryFilters`, `ProgressPanel`, `PublicItemCard`) dos veces.
**Añadido**: aunque el estado es manual, cuando exista 7.14 (`progress_sessions`) se puede usar esa señal para **sugerir** el cambio, no para aplicarlo solo — p. ej. "no registras avance en *Fahrenheit 451* desde hace 45 días, ¿lo marcamos como pausado?" como una notificación más dentro de 7.17, no un job que cambie el estado por su cuenta. Mantiene la separación clara: el usuario decide el estado, el sistema solo detecta la señal y avisa.

### 8-B. Relaciones entre ítems de catálogo (adaptaciones, mismo universo, recomendaciones) — *decidido*
Hoy `books`, `movies` y `series` no tienen ninguna relación entre sí a nivel de datos. **Decidido**: si se aborda 7.21 o 7.19, usar una tabla genérica de relaciones (`item_type_a/item_id_a`, `item_type_b/item_id_b`, `relation_type`) en vez de columnas ad-hoc por tipo (`adaptation_of_book_id` en `movies`, etc.) — mismo espíritu que unificar `library_entries`: un mecanismo, no uno por combinación de tipos.
- **Alcance ampliado**: no solo "adaptación de", también relaciones de **mismo universo/franquicia** (secuela, spin-off, misma saga) — el `relation_type` debe ser un enum abierto a esto desde el diseño, no solo `adaptation_of`.
- **Curación manual, no automática**: las relaciones se crean/editan por el usuario o la comunidad, no se infieren automáticamente de las APIs (que no las dan de forma fiable). Contribución editable con cola de revisión, igual que se apuntaba en 7.21.
- **Matiz tras 7.34**: la **misma saga** ya NO se modela con esta tabla par-a-par, sino con `sagas`/`saga_items` (agrupación 1→N con vista propia, ver 7.34) — se decidió así porque el objetivo era una vista de saga. 8-B queda para relaciones **entre tipos distintos** (adaptación libro↔película/serie), que sigue sin construirse.

**Relacionado — normalización de géneros**: `books.genres`, `movies.genres` y `series.genres` existen en el esquema pero **hoy no se rellenan desde ningún sitio**. Sigue como decisión pendiente (no resuelta en esta ronda): definir taxonomía antes de empezar a poblarlos, solo urge si se aborda 7.8 o 7.19.

**Relacionado — normalización de géneros**: `books.genres`, `movies.genres` y `series.genres` existen en el esquema pero **hoy no se rellenan desde ningún sitio** (ni Google Books ni TMDB los capturan todavía en el código). Es el momento barato de decidir la taxonomía (¿guardar el género tal cual da cada API y normalizar en lectura, o normalizar al guardar contra un catálogo cerrado propio?) — antes de que empiece a haber datos reales con vocabularios distintos que habría que migrar después. Solo urge si se empieza a poblar `genres` (p. ej. al abordar 7.8) o si 7.19 se vuelve prioridad real.

### 8-C. Separar Obra / Ejemplar / Progreso — *decidido*
`position` nació como "el único detalle que varía por tipo" para *progreso*, pero en 7.1 ya se le coló `format` (encuadernación), que no es progreso sino metadato del ejemplar — el campo empieza a mezclar responsabilidades bajo un nombre que ya no describe bien su contenido.

**Decidido**: separar el modelo conceptualmente en tres capas, no dos:
- **Obra** (`books`/`movies`/`series`, ya existe): metadato compartido de la obra en sí — título, autor/director, sinopsis, editorial, nº de páginas...
- **Ejemplar**: metadato de *tu copia concreta* — encuadernación (7.1, hoy mal ubicado en `position`), método de adquisición y precio (7.29), y cualquier otro dato "de esta copia" que surja después. Vive en un campo JSONB propio en `library_entries` — **`copy_details`** — separado de `position`.
- **Progreso**: punto actual (`position`: página / temporada+episodio, sin cambios), historial de pases (`diary_entries`, ya existe) y futuras sesiones diarias (`progress_sessions`, 7.14).

**Migración cuando se retome 7.1/7.29**: mover `format` de `position` a `copy_details` — trivial ahora (poca o ninguna fila real con ese campo todavía), mucho más cara cuanto más se tarde en decidirlo. No se ejecuta esta migración todavía (no hay una tarea activa que la necesite hoy); queda documentada para hacerse en cuanto se toque 7.1 (ampliación) o 7.29.

**Actualizado (2026-07-14, ver §7.37)**: la pregunta de `format` se resolvió distinto de lo previsto aquí — no migró a `copy_details`, quedó **sustituido** por la edición del pase (`book_editions`/`movie_versions`): "tapa dura" o "bolsillo" son ahora dos ediciones distintas de la misma obra, cada una con su propia paginación, no un atributo suelto del ejemplar. `position.format` se conserva solo para leer datos antiguos, sin escritura nueva. `copy_details` sigue sin construirse y sigue siendo la vía correcta para 7.29 (adquisición/precio), que no tiene relación con ediciones.

### 8-D. Infraestructura de notificaciones (compartida por 7.17 y futuras) — *enfoque confirmado*
El proyecto no tiene hoy ningún mecanismo de: trabajos programados (cron/queue), envío de email, ni push notifications. 7.17 (recordatorios de pausa/estrenos) es la primera feature que lo necesita, pero EPIC-05 (clubs) también lo pediría más adelante. Antes de construir 7.17: decidir una vez la pieza compartida en vez de resolverla feature a feature.
- **Dato a favor de Web Push**: ya existe un service worker registrado (`public/sw.js`, para el cache offline de la PWA) — añadir Web Push (con claves VAPID) es una extensión natural de algo que ya está en su sitio, en vez de infraestructura nueva desde cero.
- **Matiz importante (ver 8-F)**: Web Push **no funciona en iOS para usuarios en la UE** (Apple lo desactivó por cumplimiento de la DMA, marzo 2024) — la app se abre como pestaña normal de Safari, sin push. Esto no invalida Web Push como base para Android/desktop, pero significa que "Web Push cubre notificaciones" no es cierto para todos los usuarios; si la fiabilidad en iOS+UE importa, la única vía es push nativo (APNs) dentro de un wrapper (Capacitor, 8-F), no algo que se resuelva solo con más código web.
- Para jobs programados, Supabase soporta `pg_cron` de forma nativa (sin servicio externo) — evaluarlo primero antes de introducir un runner de colas aparte.
- No comprometer esta decisión hasta que 7.17 sea la tarea activa; no construir infraestructura de notificaciones "por si acaso".
- **Actualización (2026-07-11, EPIC-05)**: el Bloque D del epic social (`docs/requirements/social-epic.md`, tabla `notifications` + `NotificationBell`) ya está **construido y verificado en dev+prod** como notificaciones **in-app puras** (leídas al cargar, campana con contador de no leídas) — confirma en la práctica que el **núcleo** de EPIC-05 (grafo social, clubes, feed) **no depende** de esta decisión de push ni de 7.31 (Capacitor). Ver SD-5 en el documento del epic y la fila correspondiente en §9. La entrega **push** sobre esa misma tabla sigue como mejora futura explícitamente diferida (E5.D4), no bloqueante para el resto del epic.

### 8-E. Spoiler-safe: utilidad compartida, no cuatro implementaciones distintas — *enfoque confirmado*
7.20 (clubs), 7.21 (comparador), 7.24 (notas ancladas) y 7.30 (modo sin spoilers) necesitan las cuatro alguna forma de "ocultar contenido hasta que el progreso/estado del usuario lo permita". Cuando se aborde la primera de las cuatro, construirla como una utilidad genérica (componente/helper reutilizable, no lógica ad-hoc dentro de esa feature) para que las siguientes tres la reutilicen en vez de reinventarla.
- **Enganche EPIC-05 (2026-07-11)**: el primer consumidor real de esta utilidad será **E5.H1b** — el chat por checkpoint de la lectura/visionado conjunto (`docs/requirements/social-epic.md`, Bloque H1, SD-7), gateado por un helper `SECURITY DEFINER` `has_reached_checkpoint()`. Cuando se aborde ese bloque, construir ahí la utilidad spoiler-safe genérica para que 7.20/7.21/7.24/7.30 la reutilicen después. **Bloque H1 aún no está construido** (los bloques completados hasta ahora son A y D, ver §9); este es solo el punto de enganche registrado, no una implementación.

### 8-F. ¿Sigue siendo PWA-only la decisión correcta? — *decidido: adoptar Capacitor*

Investigación (julio 2026) sobre el estado real de las tres cosas que "ir nativo" resolvería, para no decidir a ciegas:

**Hallazgo 1 — el widget de pantalla de inicio sigue sin ser alcanzable desde la web, en ninguna plataforma.** Ni Android ni iOS exponen una API web para esto hoy; solo existe una propuesta experimental de Microsoft Edge (PWA-driven widgets), limitada a Windows. No ha cambiado desde que se registró la decisión original — si se quiere el widget, no hay atajo: requiere código nativo (Swift/Kotlin) sí o sí, independientemente de qué se decida en los otros dos puntos.

**Hallazgo 2 — envolver *esta* app concreta en un wrapper nativo (Capacitor) es más barato de lo que parecía.** Capacitor soporta apuntar el wrapper a una URL remota (config `server.url`) en vez de empaquetar assets estáticos — es decir, el wrapper nativo carga la app Next.js *desplegada* tal cual, con SSR y Server Actions funcionando exactamente igual que hoy. No es una reescritura: es un shell nativo delgado alrededor de lo que ya existe, aditivo, sin tocar el código actual.

**Hallazgo 3 — el motivo real para no esperar: Web Push está roto en iOS para usuarios en la UE.** Desde marzo 2024, por la DMA europea, Apple desactivó el modo standalone y las notificaciones push para PWAs instaladas en la Unión Europea — la PWA se abre como pestaña normal de Safari, sin push, sin importar lo que construyamos en 8-D. Como el desarrollo y previsiblemente buena parte de los usuarios están en España, esto **invalida el plan de 8-D (Web Push) para ese segmento en iOS específicamente** — no es un matiz menor, es una limitación de plataforma fuera de nuestro control. Android no tiene esta restricción.

**Conclusión — son tres decisiones, no una:**
1. ¿Presencia en tiendas de apps + acceso a plugins nativos (cámara para 7.3, etc.)? → **Barato** vía Capacitor `server.url`, aditivo, sin abandonar la base actual.
2. ¿Push fiable en iOS? → Solo se consigue con push nativo (APNs) dentro de un wrapper — Web Push (8-D) seguirá sin funcionar en iOS+UE decidamos lo que decidamos sobre el resto.
3. ¿Widget de pantalla de inicio? → Requiere código nativo real, coste aparte, no depende de las otras dos.

**Decidido (2026-07-08)**: adoptar Capacitor **antes** de construir 7.17 (notificaciones), precisamente porque Web Push no cubre iOS+UE de todas formas — no tiene sentido construir la infraestructura de 8-D asumiendo una cobertura que no existe. El widget de pantalla de inicio (punto 3) **no** se compromete todavía — sigue siendo código nativo aparte, a valorar solo si se llega a esa idea concreta.

**Restricción de entorno a tener en cuenta**: compilar el proyecto **iOS** de Capacitor requiere Xcode, que solo corre en macOS — no es posible desde un entorno Windows. La parte **Android** sí es viable en Windows (Android Studio + JDK). El trabajo de configuración de Capacitor (paquetes, `capacitor.config.ts`, scaffolding) es multiplataforma; compilar y probar en un dispositivo/emulador iOS necesitará una Mac o un runner de CI en la nube (p. ej. Codemagic, GitHub Actions con runner macOS) en algún momento.

### 8-G. Diario vs. sesiones, y "gestión en la ficha / tarjetas de solo lectura" — *decidido (construido con la base de 7.14)*
Dos decisiones de forma tomadas al construir la base de 7.14, registradas porque cambian la responsabilidad de tablas y pantallas ya existentes:

- **`diary_entries` y `progress_sessions` son hermanas, no rivales**: `diary_entries` se queda **tal cual** (pases completos: relectura/re-visionado con rating + reseña); `progress_sessions` es la tabla **nueva** para el progreso *incremental* diario (posición alcanzada + minutos a mano + nota/cita). No se fusionan ni se sustituye una por otra — son dos ejes distintos ("terminé una vuelta entera" vs. "hoy avancé hasta aquí"), y `library_entries.position` sigue siendo solo el punto actual. Alcance: sesiones solo para libros y series (ver 7.14).

- **La gestión vive en la ficha del ítem; las tarjetas del perfil son solo vista**: las páginas de detalle (`/libro|pelicula|serie/[id]`) pasan a ser el **hub de gestión** (nuevo `src/components/item-manage-panel.tsx`: Seguir / estado / editar progreso / revisionados / sesiones / Dejar de seguir), y "no seguido" = ausencia de fila en `library_entries` (Seguir / Dejar de seguir; los 4 estados no cambian). Las tarjetas de `/u/[username]` se adelgazan a **vista + acciones rápidas** (portada/enlace, título, metadatos, barra de progreso, recuento de relecturas, badge de estado también para el dueño, fijar/desfijar favorito) — se les quita el select de estado, "Quitar", `ProgressPanel` y `DiaryPanel`. Consecuencia estructural: las server actions compartidas salen de la ruta de perfil a `src/lib/library/manage-actions.ts` (firma `(entryId, itemType, itemId, ...)`, revalidando ficha + perfil + home) y a `src/lib/diary/actions.ts`, y `ProgressPanel`/`DiaryPanel` a `src/components/`; `src/app/u/[username]/actions.ts` queda solo con `updateProfileVisibility` + `toggleFavorite`. Se eliminó `ItemLibraryButton` (reemplazado por el panel de gestión).

  - **El dashboard de estadísticas es privado / solo del dueño**: las cuatro pantallas de estadísticas de 7.14 (tira semanal, calendario mensual, rachas, stats anuales) se muestran en la página principal privada del usuario (home) y **no** se muestran en el perfil público — son seguimiento personal, no vitrina. Los objetivos diario/anual son un único valor global por usuario en `profiles` (`daily_goal_minutes`, `annual_goal_items`), no una tabla de settings aparte. El recap anual compartible tipo "Wrapped" sigue siendo una idea distinta y aparte (7.15).
  - **Superseded (2026-07-14, ver §7.37)**: `item-manage-panel.tsx`/`progress-panel.tsx`/`diary-panel.tsx` (los tres nombrados arriba) fueron jubilados y sustituidos por `src/components/detail/log-panel.tsx` al construir el registro de pases y ediciones — la pestaña Registro pasa a ser un único componente que orquesta estado, progreso del pase abierto, sesiones y diario de pases, en vez de tres paneles separados.

### 8-H. RBAC: dónde se aplica el permiso (RLS vs. capa de app) — *decidido (construido en §7.35)*
Los flujos **automáticos** (búsqueda→catálogo, auto-enriquecimiento de §7.34) y los **manuales**
(añadir ítem, sagas) escriben en las **mismas** tablas compartidas, y la RLS no puede distinguir
"auto" de "manual" del mismo usuario autenticado. **Decidido**: mantener la RLS de esas tablas
**permisiva** (INSERT para autenticado, como estaba) y aplicar el gateo de **colaborador** en la
**capa de aplicación** (server actions que respaldan las UIs manuales) + ocultando la UI. Lo que sí
se blinda a nivel de datos es el **`role`** en `profiles`: trigger anti-escalada + políticas RLS de
admin.
- **Trade-off**: un usuario técnico podría insertar en el catálogo saltándose la UI (bajo riesgo
  para este proyecto; el catálogo es compartido y poco sensible). El **endurecimiento duro** =
  enrutar los flujos automáticos por un cliente **service_role** y bloquear la RLS de escritura a
  colaborador+ — queda anotado como **mejora futura**, no se construye ahora (decisión "menos
  disruptivo": el usuario normal debe seguir pudiendo añadir a su biblioteca lo que encuentra).

## 9. Decisiones registradas

| Fecha | Decisión | Motivo |
|-------|----------|--------|
| 2026-07-07 | Stack: Next.js 16 (App Router) + TypeScript + Tailwind, Supabase (Postgres+Auth), PWA (no apps nativas) | Simplicidad, un solo codebase, sin gestionar backend propio |
| 2026-07-07 | Metadata en tablas separadas por tipo; **progreso unificado** en `library_entries` con `position` JSONB | Minimizar la deuda al añadir nuevos hobbies (norte del proyecto): añadir un tipo no obliga a replicar tabla de progreso + RLS + query + UI |
| 2026-07-07 | `username` modificable (no fijo), con unicidad garantizada | Flexibilidad para el usuario; el coste de validar unicidad en cada cambio es bajo |
| 2026-07-07 | Perfiles públicos legibles también por visitantes sin cuenta | Coherente con la idea de "ver bibliotecas de otros" sin obligar a registrarse para mirar |
| 2026-07-07 | "Añadir manualmente" un ítem es must del MVP | Desacopla la app de que la API externa tenga o no el título; coste bajo al estar el esquema listo |
| 2026-07-07 | Diario de pases (`diary_entries`) desde el MVP, separado del estado del ítem | Soporta relecturas/re-visionados (estilo Letterboxd); modelarlo después sobre datos reales sería una migración dolorosa |
| 2026-07-07 | i18n cableado desde el inicio (idioma inicial: español) | Evita el refactor tedioso de extraer textos hardcodeados más adelante para soportar otros idiomas |
| 2026-07-07 | Catálogo compartido entre usuarios, progreso privado por usuario | Evita duplicar metadatos al buscar el mismo libro/película varias veces |
| 2026-07-07 | Perfiles públicos por defecto, con opción de hacerlos privados | Habilita la función social mínima (ver bibliotecas de otros) sin construir todo el sistema social completo |
| 2026-07-07 | Offline MVP = cache de solo lectura, no offline-first completo | Reduce complejidad de sincronización manteniendo el beneficio principal de una PWA instalable |
| 2026-07-08 | MVP cerrado como **v1.0**; §6 completo al 100% | Todas las funcionalidades comprometidas en §4 están construidas y verificadas; ver §10 |
| 2026-07-08 | Adoptar **Capacitor** (wrapper nativo vía `server.url`) antes de construir 7.17; se abandona el PWA-only estricto de la decisión anterior | Investigación confirmó que Web Push no funciona en iOS+UE (bloqueo de Apple por la DMA, no arreglable en web) — no tiene sentido construir 8-D asumiendo una cobertura que no existe. El widget de pantalla de inicio sigue sin comprometerse (requiere código nativo aparte) |
| 2026-07-09 | Nueva tabla `progress_sessions` (hermana de `diary_entries`) para el progreso incremental diario; la gestión del ítem se mueve a la ficha `/libro\|pelicula\|serie/[id]` y las tarjetas de perfil quedan de solo lectura | Base de 7.14 (rachas/estadísticas): sin ella no se podía reconstruir la actividad día a día; separar "pase completo" de "avance diario" evita sobrecargar `diary_entries`/`position`. Ver §8-G |
| 2026-07-09 | Dashboard de estadísticas **privado** en la página principal del usuario (home) — ruta `/estadisticas` eliminada. (tira semanal, calendario mensual, rachas, stats anuales) + objetivos configurables en `profiles` (`daily_goal_minutes`, `annual_goal_items`) | Cierra 7.14 al completo: las cuatro piezas de estadísticas sobre `progress_sessions`/`diary_entries`; privado por ser seguimiento personal, no vitrina del perfil público. Ver §8-G |
| 2026-07-09 | Modelo `people`/`credits` (personas de catálogo + créditos polimórficos) y **tabla `sagas` dedicada** (`sagas`/`saga_items`), no la tabla par-a-par de 8-B, para sagas | 7.34: fichas de persona (autores vía Open Library, reparto/equipo vía TMDB) y sagas con vista propia. Se eligió tabla dedicada porque el objetivo era una *vista de saga* (1→N, ordenada); 8-B queda para relaciones entre tipos distintos. Enriquecimiento perezoso (cache-as-you-go, §7.32) para no reescribir la búsqueda |
| 2026-07-09 | **RBAC** con `profiles.role` (`user`<`collaborator`<`admin`), helpers `SECURITY DEFINER` en RLS y trigger anti-escalada; gateo de colaborador en la **capa de app** (RLS de tablas compartidas permisiva) | 7.35: colaborador contribuye info manual (ítems, sagas), admin gestiona roles vía `/admin`. La RLS no puede separar escritura auto vs. manual en tablas compartidas → gateo en server actions; el `role` sí se blinda en BD (trigger + RLS admin). Endurecimiento vía service_role, futuro. Ver §8-H |
| 2026-07-09 | Importar biblioteca (7.7) ampliado a **tres** fuentes (Goodreads, Letterboxd `diary.csv`, Bookmory `.xlsx`) en vez de solo las dos originales; entry point en `/u/[username]` ("Importar biblioteca", dueño), no en el header global; conversión de rating `rating*2` uniforme a la escala 1-10; resolución manual de filas sin match gateada a `collaborator+` (import de filas que sí matchean, abierto a cualquier autenticado) | Bookmory se añadió a petición explícita del usuario durante la construcción (fuera del plan aprobado); el entry point se redirigió al perfil también a petición explícita en revisión de plan. De paso, verificando contra Open Library/TMDB reales, se corrigieron dos bugs de matching que afectan también al flujo de búsqueda existente: `isSameTitle` (`src/lib/catalog/title-match.ts`) ganó una guarda de ratio de longitud (≥0.65) para no aceptar contención de substring entre títulos de longitud muy distinta, y el matching de año de película/serie (`src/lib/import/match-row.ts`) dejó de aceptar candidatos sin año como automáticamente compatibles salvo que el CSV tampoco tenga año |
| 2026-07-10 | Backfill perezoso de `movies.duration_minutes` y `series.total_episodes`/`total_seasons` (`src/lib/queue/backfill-queue-sizes.ts`, tope 10 ítems/carga, disparado desde `/cola`), extendiendo `ScreenDetails` con `runtimeMinutes`/`numberOfEpisodes`/`numberOfSeasons` sobre la llamada a TMDB ya existente | Construyendo 7.22 se descubrió que ningún código había rellenado nunca estos campos, pese a que 7.8 ya los mostraba defensivamente — el endpoint de detalles de TMDB que ya se llama para créditos/saga (`getMovieDetails`/`getSeriesDetails`) ya traía estos datos, solo faltaba extraerlos. Es una corrección permanente del catálogo compartido, con valor más allá de la cola: cualquier ítem abierto después también se beneficia |
| 2026-07-10 | Nueva política RLS `UPDATE` permisiva (`USING (true) WITH CHECK (true)`) en `movies` y `series`; `books` se dejó deliberadamente sin ella | Verificando el backfill de 7.22 en el navegador se descubrió que `movies`/`series` nunca tuvieron política de `UPDATE` (solo `INSERT`/`SELECT`) — cualquier `UPDATE` desde la app afectaba a 0 filas en silencio, sin error. Gap preexistente: nada antes de esta feature necesitaba actualizar una fila de catálogo tras insertarla. Confirmado con el usuario antes de aplicar por ser RLS con implicación de seguridad; misma permisividad que el `INSERT` ya existente, al ser catálogo compartido no sensible |
| 2026-07-11 | **EPIC-05 Bloque A** (grafo social: seguir usuarios) construido y verificado en **dev+prod** — tabla `follows` (`status pending/accepted`, enum `follow_status`, auto-accept en perfiles públicos / pendiente-hasta-aceptar en privados) y helper `SECURITY DEFINER` `can_view_profile(target_user_id)` que generaliza la RLS de contenido de perfil de "público u propio" a "público u propio o seguidor aceptado", recableado en las políticas `SELECT` de `profiles`, `library_entries`, `diary_entries`, `progress_sessions` y `episode_watches`. Vista `profile_identities` expone solo columnas de identidad (username/display_name/avatar/bio, nunca goals ni rol) de cualquier perfil, incluidos los privados | SD-2 de `docs/requirements/social-epic.md`: encapsular el `OR` de visibilidad en un único helper anti-recursión (mismo patrón que `has_min_role()`, §8-H) en vez de repetirlo en cada política de cada tabla de contenido — la decisión más transversal del epic, tomada antes de construir feed o clubes. Q1 (perfiles privados) resuelta como stub de identidad "estilo Instagram" con botón "Solicitar seguir", no un 404 duro. RLS verificada con batería de impersonación (8 casos) y flujo E2E en navegador antes de aplicar a prod |
| 2026-07-11 | **EPIC-05 Bloque D** (notificaciones in-app) construido y verificado en **dev+prod** — tabla `notifications` (`type` enum `follow_request`/`new_follower`/`follow_accepted`, RLS solo-destinatario lee/marca, solo-actor inserta, CHECK `user_id <> actor_id`), dominio `src/lib/social/notifications.ts`/`notification-actions.ts`, componente `NotificationBell` en el header | SD-5 de `docs/requirements/social-epic.md`: el núcleo social arranca con notificaciones **in-app** (leídas al cargar la app), sin depender de push, `pg_cron` ni de 7.31 (Capacitor) — la entrega push sobre la misma tabla queda como continuación explícitamente diferida (E5.D4), no bloqueante. Ver también la actualización de §8-D. Ciclo de los 3 tipos de notificación verificado en navegador antes de aplicar a prod |
| 2026-07-11 | **EPIC-05 Bloque B** (reacciones y comentarios en reseñas) construido y verificado en **dev+prod** — tablas polimórficas `reactions` (`kind` por defecto `like`, UNIQUE `(target_type, target_id, user_id, kind)` para que el toggle de "me gusta" sea idempotente) y `comments` (hilo plano, sin anidación ni edición) sobre un nuevo enum `target_kind` con solo `diary_entry`/`episode_watch` (deliberadamente sin pre-declarar valores futuros como `club_post` — YAGNI), helper `SECURITY DEFINER` `can_view_target(target_type, target_id)` que resuelve el dueño del target y delega en `can_view_profile()` (Bloque A, mismo patrón anti-recursión que `is_club_member()`); `notification_type` (Bloque D) extendido con `review_liked`/`review_commented`; `item-detail-tabs.tsx` gana un parámetro `?tab=` de propósito general para deep-linking a una pestaña concreta | SD-3 de `docs/requirements/social-epic.md`: reacciones/comentarios como dos tablas polimórficas genéricas (patrón `credits`/`library_entries`), sin promover la reseña a una tabla propia — "el diario sigue siendo la reseña". Alcance explícitamente acotado: sin edición de comentarios (crear+borrar, tono "Reddit-lite"), sin borrado por el dueño del contenido en este MVP (solo tu propia fila; moderación diferida a E5.J), sin realtime (server actions + `revalidatePath`, mismo patrón que A/D). Auto-notificación bloqueada explícitamente (reaccionar/comentar tu propia reseña no notifica). RLS verificada con batería de impersonación (8 casos: extraño/seguidor-aceptado/pending sobre privado, anon, insert-spoofing, delete-solo-propio) y flujo E2E en navegador con dos usuarios reales antes de aplicar a prod |
| 2026-07-12 | **EPIC-05 Bloque C** (feed de actividad personal) construido y verificado en **dev** (sin cambios de prod pendientes de aplicar, ver nota de despliegue más abajo) — **sin migración**: `src/lib/social/feed.ts` agrega on-read las cuatro tablas fuente ya existentes (`library_entries`, `progress_sessions`, `diary_entries`, `episode_watches`) filtradas a los seguidos aceptados del viewer, normalizando a un único `FeedEvent` con verbo "el más específico gana" (reseñó > valoró > verbo suelo — floor `finished`/`watchedEpisode`), aplicado simétricamente a `diary_entries` y `episode_watches`; paginación por cursor fusionando las cuatro fuentes. Home gana pestaña "Siguiendo" (`HomeTabs`, mismo mecanismo `?tab=` de Bloque B) con **fetching condicional por pestaña** (solo corren las 5 queries del panel o las 4 del feed, nunca ambas); `FeedCard` reutiliza `ReviewInteractions` de Bloque B en cualquier evento con target real (diary/episode). `src/lib/social/feed-actions.ts`'s `loadMoreFeed` es la **primera server action del proyecto que devuelve datos al cliente** (toda acción previa devolvía `Promise<void>`) — excepción deliberada por ser paginación abierta, a diferencia de las listas acotadas/precargadas de comentarios de Bloque B | SD-1 de `docs/requirements/social-epic.md`: feed on-read puro, cero tablas/RLS nuevas, apoyado enteramente en la RLS ya verificada de `can_view_profile`/`can_view_target` (Bloques A/B). Filtros (tipo de ítem, "solo reseñas") decididos **server-side vía query params** (`FeedFilters`, mismo patrón `<Link>` de `library-filters.tsx`/7.12) — desviación del boceto cliente-side original de `social-epic.md`, decidida durante la planificación de implementación para no introducir un segundo patrón de filtrado. La revisión final de rama completa encontró dos bugs de integración (filtros no actualizaban la lista visible; reacciones/comentarios inline no se reflejaban sin recargar — misma causa raíz: `FeedList` sembraba su estado una sola vez desde props y nunca lo re-derivaba), corregidos en el commit `34f2b9a` (`FeedList` remonta vía `key` al cambiar de filtro; `revalidatePath("/")` añadido a `revalidateItemPages()`; estado de `FeedList` recompuesto como `initialEvents` fresco + `extraEvents` acumulados). Verificación manual en navegador ejecutada por el usuario (checklist en `docs/superpowers/plans/2026-07-11-epic05-bloque-c-manual-test.md`, que sustituyó la verificación automática con subagente/navegador tras decisión explícita del usuario de cambiar a testing manual — ver también la nueva preferencia registrada en memoria) — confirmado funcional, incluidos ambos bugs corregidos |
| 2026-07-12 | **EPIC-05 E5.D4** (notificaciones push, Web Push) construido y verificado en **dev** (migración aplicada también a **prod**, claves VAPID pendientes de configurar en Vercel antes de despliegue real) — nueva tabla `push_subscriptions` (`channel` enum, hoy solo `'web'`; `credentials jsonb` específico de canal; UNIQUE de expresión `(user_id, channel, credentials->>'endpoint')` vía índice aparte, no constraint de tabla; RLS self-only, **sin política UPDATE** — resuscribirse es delete+insert a nivel app), `src/lib/push/send-push.ts` (`sendPushToUser` vía paquete `web-push`, limpia suscripciones expiradas en 404/410), `src/lib/push/subscription-actions.ts` (`subscribeToPush`/`unsubscribeFromPush`), `notify()` extendido con `deliverPush()` best-effort que reutiliza el mismo copy i18n de la campana in-app vía la constante exportada `NOTIFICATION_TYPE_KEY` (antes duplicada localmente en `notification-bell.tsx`), `PushToggle` en la nueva página `/cuenta` (primer punto de entrada general de ajustes de cuenta — antes solo existía `/cuenta/contrasena`, alcanzable solo desde el flujo de recuperación de contraseña) y listeners `push`/`notificationclick` añadidos de forma puramente aditiva a `public/sw.js` | Cierra E5.D4 de `docs/requirements/social-epic.md` (dependía de §8-D + 7.31): diseño channel-agnóstico decidido explícitamente ("diseñar para ambos ahora, implementar Web Push primero") para que un futuro canal nativo (`ios_native`, necesario para iOS+UE por el bloqueo de Apple/DMA a Web Push, vía Capacitor/APNs cuando 7.31 esté desplegable) sea un `ALTER TYPE ADD VALUE` + una forma distinta de `credentials`, sin rediseñar la tabla. Las 5 notificaciones existentes obtienen push de forma uniforme, sin opt-out por tipo en este MVP. Opt-in siempre explícito vía toggle en `/cuenta`, nunca un prompt de permiso automático/contextual. Claves VAPID generadas una vez y entregadas directamente en chat al usuario — nunca escritas a fichero ni commiteadas. Verificación manual en navegador ejecutada por el usuario (checklist en `docs/superpowers/plans/2026-07-12-push-notifications-manual-test.md`), per convención de testing manual ya registrada en `docs/TESTING.md` |
| 2026-07-12 | **EPIC-05 Bloque E** (clubes: creación, membresía y roles) construido, migración aplicada a **dev + prod**, verificación manual en navegador pendiente — tablas `clubs`/`club_members` (enums `club_visibility`, `club_member_status` con solo `invited`/`active`, y `club_role` declarado en **orden ascendente de autoridad** `('member','moderator','owner')`, mismo gotcha que `user_role` de §7.35: Postgres compara enums por orden de declaración, así que el primero declarado debe ser el de menor autoridad para que `>=`/`>` funcionen); cambios de rol (`create_club`, `set_club_member_role`, `transfer_club_ownership`) implementados como funciones `SECURITY DEFINER` en vez de `UPDATE`s de cliente gateados por RLS, para que un `role` nunca pueda colarse por una política pensada solo para transiciones de `status` más simples; trigger `reassign_club_ownership` (`AFTER DELETE` en `club_members`) como red de seguridad a nivel de BD que reasigna la propiedad al miembro activo más antiguo (o borra el club si no queda nadie) **independientemente de la vía** por la que desaparezca la fila del owner — no depende de que un futuro feature de borrado de cuenta (que hoy no existe) recuerde gestionarlo | Cierra E5.E1–E5.E4 de `docs/requirements/social-epic.md` (SD-4): corrección de diseño a mitad de implementación — el boceto original de `joinClub` incluía un autoservicio "solicitar unirse" (`status='pending'`) a clubes privados, pero la propia batería de impersonación RLS de la Task 1 (subagent-driven-development) descubrió que era **circularmente imposible**: la fila de un club privado es invisible a no-miembros (SD-4), así que un no-miembro no podría ni comprobar que el club existe para solicitar unirse. Resuelto eliminando `pending` del todo — unirse a un privado es solo por invitación de un moderator+, nunca por solicitud propia. La implementación de la Task 1 (el trabajo más profundo de RLS/triggers del proyecto hasta la fecha) pasó por 6 rondas de bugs reales encontrados por su propia batería y por dos revisores independientes: recursión estructural 42P17 entre las políticas de `clubs`/`club_members` (resuelto con el helper `club_member_row_exists()`, mismo patrón anti-recursión que `can_view_profile()`/`is_club_member()`); el gate de Postgres "una fila debe pasar SELECT antes de que UPDATE/DELETE puedan tocarla" bloqueando que un invitado viera o aceptara su propia invitación; una escalada de privilegio vía `club_members accept invite` (`WITH CHECK` solo validaba `status`, no `role`, así que un invitado podía colar `role='owner'` en el mismo UPDATE que acepta su invitación); un conflicto `BEFORE DELETE`/cascade al borrar el último miembro de un club (resuelto pasando el trigger a `AFTER DELETE`); y una regresión de ese mismo fix — la rama "promocionar al siguiente owner" del trigger empezó a fallar porque la fila del owner saliente ya no existía cuando se revalidaba su autoridad, resuelto con un guard `pg_trigger_depth() > 1` que reconoce la reasignación interna de confianza sin re-verificarla. Verificación manual en navegador pendiente de ejecutar por el usuario (checklist en `docs/superpowers/plans/2026-07-12-epic05-bloque-e-clubs-manual-test.md`); código y RLS ya verificados vía la batería de 19 checks y tres rondas de revisión de subagente. Feed del club (Bloque F) explícitamente fuera de alcance |
| 2026-07-13 | **EPIC-05 Bloque F** (feed de club: posts, compartir actividad, encuestas) construido, migración aplicada a **dev + prod**, verificación manual en navegador pendiente — tablas `club_posts`/`club_poll_options`/`club_poll_votes`; `target_kind` (Bloque B) ampliado con `club_post`/`comment` y CHECK `comments_no_nesting` que hace la anidación de comentarios irrepresentable en el esquema (necesario para que la nueva rama recursiva de `can_view_target()` termine de forma demostrable); helper `SECURITY DEFINER` **nuevo y angosto** `is_visible_via_club_share()` añadido como un `OR` extra a las políticas `SELECT` ya existentes de `diary_entries`/`episode_watches` (Bloque A) — deliberadamente **no** integrado en `can_view_profile()`, que es un helper transversal usado por todo el contenido de perfil desde Bloque A y ya verificado, para no arriesgarlo por esta feature concreta; política `SELECT` de `club_poll_votes` que hace cumplir "resultados de encuesta ocultos hasta que votas" a nivel de RLS (tu propio voto siempre visible, los de los demás solo si ya votaste o la encuesta cerró) en vez de solo a nivel de aplicación, para que no pueda saltarse consultando la tabla directamente vía PostgREST; `resolveReviewHrefs()` (Bloque D) renombrado y unificado a `resolveTargetHrefs()`, plegando el caso especial de `target_type='club'` (antes duplicado por separado en `deliverPush()` y `listNotifications()`) en una sola función compartida que ahora también resuelve `club_post`/`comment` | Cierra E5.F1–E5.F3 de `docs/requirements/social-epic.md` (dep: E, B, D): **ampliación de alcance decidida en brainstorming, no en el backlog original** — el "me gusta" en comentarios pasa a estar disponible en toda la app (reseñas y posts de club), no solo en clubes, porque comparte el mismo `target_kind` polimórfico que las reseñas y no tenía sentido que un comentario fuera "gustable" solo en un contexto. `activity_share` comparte cualquier `FeedEvent` reciente propio (Bloque C: diario, episodios, altas de biblioteca), no solo reseñas, guardando una **referencia viva** (`{sourceTable, rowId}`, mismo vocabulario que `FeedEvent.id`) en vez de un snapshot — re-derivada en cada lectura vía un resolver de una sola fila (`src/lib/social/shared-activity.ts`), con degradación elegante ("ya no disponible") si la fila origen se borra. Compartir a un club **anula la privacidad de perfil normal para los compañeros de ese club** — decisión explícita de sesión: compartir es una elección de audiencia deliberada que prevalece sobre la visibilidad de seguidor/perfil, solo dentro de ese club, nunca más allá. Encuestas de elección única con cierre obligatorio, incluidas desde el inicio pese a la interrogación del backlog original. Notificación a todos los miembros activos en post nuevo, sin preferencia de silenciar-club (E5.J, todavía no construido, queda explícitamente diferido — se acepta el ruido temporal). El implementador de la Task 1 encontró y corrigió dos bugs Postgres reales más allá del SQL dado en el plan, ambos mecánicos y sin ambigüedad de producto: un `commit;` a mitad de migración (Postgres exige que un valor nuevo de enum esté confirmado antes de poder referenciarse como literal, error 55P04, y el CHECK/`can_view_target()` lo hacían inmediatamente); y un nuevo helper `has_voted_in_club_poll()` rompiendo una recursión estructural (42P17) en la política `SELECT` de `club_poll_votes`, que se auto-referenciaba vía una subquery inline — mismo patrón que `club_member_row_exists()` de Bloque E. Batería de 20 checks (incluyendo fuga entre clubes y "resultados ocultos hasta votar") y revisión independiente sin hallazgos Critical/Important. Verificación manual en navegador pendiente de ejecutar por el usuario (checklist en `docs/superpowers/plans/2026-07-12-epic05-bloque-f-club-feed-manual-test.md`). Motor genérico de actividades de club (Bloque G) explícitamente fuera de alcance |
| 2026-07-13 | **EPIC-05 Bloque G** (motor genérico de actividades de club) construido, migración aplicada a **dev + prod**, verificación manual en navegador pendiente — tablas `club_activities`/`club_activity_participants`/`club_activity_items`/`club_activity_opinions`, enums `activity_kind` (abierto: `buddy_read`/`tierlist`/`list_challenge`/`criteria_challenge`, ampliable después vía `ALTER TYPE ADD VALUE`) y `activity_status` (`proposed`/`active`/`finished`/`archived`); transiciones de estado como tres RPCs `SECURITY DEFINER` (`activate_club_activity`/`finish_club_activity`/`archive_club_activity`), nunca `UPDATE`s de cliente — `club_activities` no tiene política `UPDATE` en absoluto; helper `SECURITY DEFINER` `is_activity_participant()` gatea escritura del pool de ítems y lectura+escritura de opiniones | Cierra E5.G1–E5.G3 de `docs/requirements/social-epic.md` (SD-8, dep: E, D): decisión de sesión de **exponer el ciclo de vida completo ya en este bloque** (`proposed → active → finished`, o `proposed`/`active → archived`) en vez de diferirlo a Bloque H — mismo orden de construcción por capas ya usado para clubes antes del feed de club (Bloque E antes de F): construir primero el motor genérico completo, después los tipos concretos que lo consumen. `archiveActivity` generaliza deliberadamente "rechazar una propuesta" y "cancelar una activa" en una sola RPC, moderator+, alcanzable desde `proposed` o `active` — evita una cuarta RPC redundante para una distinción que el usuario final no necesita ver como dos acciones distintas. Las opiniones (`club_activity_opinions`) son **visibles solo para participantes** de la actividad, no basta con ser miembro del club — confirma literalmente la lectura de **SD-8**, aplicado a nivel de RLS (política `SELECT` que exige `is_activity_participant()`, no solo ocultado en la UI) para que no pueda saltarse consultando la tabla directamente vía PostgREST, mismo patrón que "resultados ocultos hasta que votas" de Bloque F. `config jsonb` y el comportamiento específico por `kind` quedan **explícitamente diferidos a Bloque H** — ninguna función de este bloque lee ni escribe esa columna. Batería de 20 checks de impersonación RLS/RPC (incluyendo el caso de mayor riesgo del bloque: un moderator+ miembro del club pero no participante de la actividad no puede ver las opiniones de otro participante hasta unirse él mismo) y revisión independiente de cada task sin hallazgos Critical; un hallazgo Important (tres nuevos manejadores de mutación —enviar opinión, quitar ítem, añadir ítem vía el picker— no mostraban error visible al usuario si la acción fallaba, inconsistente con el patrón `run()` ya establecido en el mismo componente) corregido y re-revisado antes de cerrar la task. Verificación manual en navegador pendiente de ejecutar por el usuario (checklist en `docs/superpowers/plans/2026-07-13-epic05-bloque-g-club-activities-manual-test.md`) |
| 2026-07-14 | **Registro de pases y ediciones** (§7.37) construido, migraciones aplicadas en **dev** (prod pendiente) — `diary_entries` se redefine como el **pase** (una lectura/visionado; `finished_on` nullable = pase abierto), único dueño de nota y reseña, con `is_public`/`edition_id` nuevos; dos tablas de catálogo nuevas `book_editions`/`movie_versions` colgando de la obra (nunca de series); `progress_sessions` pasa a colgar del pase (`pass_id`), no directamente de la entrada; cronómetro persistente en `/sesion/[entryId]` (instante de arranque en `localStorage`, no un contador corriendo); la comunidad agrega desde el **último pase cerrado no abandonado** de cada usuario, no desde `library_entries.rating` (huérfana a propósito junto con `.notes`) | Cerraba el registro fragmentado (nota/reseña repartidas entre `library_entries.rating`, `diary_entries.rating` y hasta tres campos de texto) y habilitaba el caso motivador: dos pases de la misma obra contra ediciones distintas (versión teatral vs. extendida de una película, tapa dura vs. bolsillo de un libro), cada uno con su propia nota. Se mantuvo el nombre físico `diary_entries` — renombrarla habría obligado a tocar RLS, feed, notificaciones e interacciones de reseña sin ganar nada funcional — y se dejaron `library_entries.rating`/`.notes` en la BD sin uso, para poder revertir sin pérdida; su limpieza queda diferida a una spec propia. Dos invariantes se garantizaron en BD, no solo en la app, tras encontrar dos carreras reales en revisión de código: un doble clic en "Visto" insertaba dos pases (cerrado extendiendo el índice único a pases ya cerrados el mismo día, no solo al abierto) y un pase podía apuntar a la edición de otra obra (cerrado con un trigger, `check_pass_edition`). Una revisión posterior encontró además una fuga de privacidad (reseñas con `is_public = false` se mostraban igualmente en Comunidad/feed/perfil por falta de filtro) y un contador de relecturas que sumaba pases todavía abiertos; ambos corregidos. **Riesgo residual asumido** en `register_book_edition` (función `SECURITY DEFINER` con validación real de dígito de control de ISBN, sin cola de revisión): un usuario autenticado puede adjuntar una edición inventada con ISBN de checksum válido a un libro ajeno — firmado en `created_by`, reversible, no es escalada de privilegios. Ver `docs/superpowers/specs/2026-07-14-registro-pases-ediciones-design.md` y el checklist manual en `docs/superpowers/plans/2026-07-14-registro-pases-ediciones-manual-test.md` |
| 2026-07-14 | **Ediciones en la ficha y editor de ficha oficial** (§7.38) construido en tres fases, migraciones aplicadas en **dev** (prod pendiente) — panel de metadatos deja de pintar editorial/ISBN/páginas/idioma de `books`/`movies` como si fueran de la obra (Fase A); ediciones reales importadas de OpenLibrary al abrir la ficha, con tope de 20 por obra y lista negra de editoriales de impresión bajo demanda (Fase B); editor de ficha oficial para colaborador+ con portada, ediciones editables/borrables y sagas (Fase C, absorbe y borra `saga-assign-form.tsx`) | La restricción de "solo colaborador+ edita la ficha" se implementó como **trigger** (`enforce_catalog_edit_collaborator_only`), no como policy RLS adicional, porque una policy filtra filas y no columnas: con el grant de columna ampliado bajo la policy `UPDATE` permisiva ya existente (necesaria para que cualquier autenticado siga escribiendo columnas de sincronización), cualquier autenticado habría podido reescribir título/sinopsis vía REST directo. Borrar una edición en uso se **impide** (trigger `block_edition_delete_if_used`) en vez de reasignarla a la primaria: reasignar en silencio falsearía el progreso de quien no ha pedido nada. La edición elegida al seguir un libro vive en el **pase**, no en la entrada (no hay `library_entries.preferred_edition_id`): como "seguir" siempre crea la entrada en Pendiente, la elección se descarta si no hay pase abierto donde guardarla, y se repregunta al empezar a leer. Bug real encontrado y corregido en Fase B: `books` tenía RLS activado sin ninguna policy de `UPDATE` (el grant de columna de `editions_synced_at` no bastaba), así que la marca de sincronización se filtraba a cero filas en silencio y cada visita repetía la llamada a OpenLibrary. Ver `docs/superpowers/specs/2026-07-14-ediciones-ficha-y-editor-design.md` y el checklist manual en `docs/superpowers/plans/2026-07-14-ediciones-ficha-y-editor-manual-test.md` |
| 2026-07-19 | **Sagas v2, fase 1 de 4** (§7.4/§7.34) construida y **verificada en navegador**, migraciones aplicadas en **dev y prod** (actualización 2026-07-19: las 6 migraciones se desplegaron a prod al mergear el PR #87; `schema-baseline.sql` ya las anexa) — `sagas` gana `parent_saga_id` (subsagas = **sagas anidadas reales**, no grupos ligeros) con trigger anti-ciclos, y `accent_color`; `saga_items` pasa de "un ítem = una sola saga" a **multi-membresía** con `is_primary` (índice único parcial); ficha `/saga/[id]` reconstruida con hero+tabs (progreso segmentado por subsaga, botón «Seguir esta saga», chip «Parte de {padre}»). Tablas `saga_nodes`/`saga_edges` (grafo relacional, no JSONB) y `saga_follows` creadas con RLS pero vacías/sin UI hasta las fases 2-4. `assignItemToSaga` deja de borrar membresía previa (upsert + `is_primary`); `populateTmdbCollection` pasa a diff no destructivo (`planCollectionSync`) para no pisar membresías manuales ni `is_primary` | Ver `docs/superpowers/specs/2026-07-19-sagas-v2-design.md`. Decisiones reales de diseño: la subsaga de un nodo del grafo (fases 2-3) se **derivará** de `saga_items` en vez de guardarse por separado, para que Info y grafo nunca discrepen (una sola fuente de verdad); seguir una saga es **solo follow explícito** (`saga_follows`), sin inclusión implícita por tener ítems propios en ella — mismo criterio de acción deliberada que `follows` de EPIC-05 Bloque A; el grafo de lectura será relacional (`saga_nodes`/`saga_edges`) renderizado con React Flow, no un blob JSONB. Fases 2-4 (viewer del grafo, editor collaborator+, pestaña Sagas de Mi Biblioteca) quedan pendientes |
| 2026-07-19 | **Sagas v2, fase 2 de 4** (§7.4/§7.34) construida y **verificada** (QA navegador 8/8 sobre un grafo sembrado en dev, 10 nodos/7 aristas; e2e nuevos `sagas-v2-mapa.spec.ts` 4/4) — viewer del grafo de lectura: pestaña «Mapa de lectura» en `/saga/[id]` (condicional a que la saga tenga nodos), timeline vertical ramificado en móvil derivado de `saga_nodes`/`saga_edges` (`deriveTimeline`), toggle Lectura\|Publicación (`?orden=`), grafo embebido en PC + ruta `/saga/[id]/mapa` a pantalla completa con **React Flow** (`@xyflow/react` v12, dependencia nueva); de paso, perf de `getSagaDetail` pulido (una sola resolución de miembros, un solo `auth.getUser()`, deuda de fase 1) | Ver `docs/superpowers/specs/2026-07-19-sagas-v2-design.md` §2.4-§2.5. Decisiones reales: el canvas del grafo se fija a **modo oscuro** con independencia del tema de la app, por legibilidad de las aristas coloreadas por subsaga (sólida-color / discontinua-ámbar / punteada-beige); el timeline móvil se **deriva determinísticamente** del grafo en cada render en vez de persistirse aparte, confirmando la previsión ya anotada en fase 1 de que grafo e Info nunca discrepen. Deuda asumida a propósito para fase 3: navegación de nodos solo con puntero (`elementsSelectable=false` limita el soporte de teclado de React Flow, documentado en código). Fases 3 (editor collaborator+, `saveSagaGraph`) y 4 (pestaña Sagas de Mi Biblioteca) siguen pendientes; el grafo solo se puebla hoy por SQL |

## 10. Historial de versiones

### v1.0 — 2026-07-08 — MVP completo
Todas las funcionalidades de §4 implementadas y verificadas manualmente (navegador + limpieza de datos de prueba):
- Autenticación (registro, login, onboarding de `username`).
- Añadir ítems: búsqueda (Google Books + TMDB, con modo mock para desarrollo) **y** añadido manual (`/buscar/manual`).
- Gestión de la colección: estado, rating, progreso (`position` tipado por tipo de ítem), notas, diario de pases.
- Perfil público `/u/[username]` con toggle de visibilidad.
- PWA instalable con cache de solo lectura offline.
- i18n cableado desde el inicio (español).
- Estética visual con grids de portadas.

A partir de aquí, el desarrollo continúa sobre el backlog de tareas pendientes en §7.
