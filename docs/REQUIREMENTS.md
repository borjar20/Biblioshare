# Biblioshare — Requisitos y alcance

Última actualización: 2026-07-11

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
- **Semántica del rating** (aclaración): `library_entries.rating` es la **nota actual** del ítem (la que se muestra en el perfil y en los agregados de comunidad); `diary_entries.rating` (§3.3) es la nota **de cada pase concreto**, que puede variar entre relecturas. Al registrar un pase se puede poner una nota distinta sin alterar la nota actual; son campos independientes a propósito.
- RLS: el dueño ve/edita sus filas; cualquiera (incl. anónimo) puede **leer** las filas de un perfil público. Escritura solo el dueño.
- Trade-off aceptado: los detalles finos de `position` no se validan a nivel de BD (viven en JSONB), a cambio de eliminar la deuda de replicar toda la vertical por cada tipo nuevo.

### 3.3 Diario de pases (relecturas / re-visionados) — *creado*
Tabla `diary_entries` (muchas filas por `library_entry`):
- `library_entry_id` → FK al ítem de la estantería (borrado en cascada).
- `started_on`, `finished_on` (fecha del pase), `rating` (de ese pase), `review` (reseña de ese pase).
- Permite registrar leer/ver el mismo ítem varias veces con sus propias fechas y valoraciones (estilo diario de Letterboxd).
- Separación clave: `library_entries` = **estado actual** del ítem; `diary_entries` = **historial de pases**. Añadir el diario después con datos reales habría sido una migración dolorosa, por eso se modela desde el MVP.
- RLS: mismo modelo que `library_entries` (dueño escribe; lectura pública si el perfil lo es).

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
- [x] Encuadernación/formato (bolsillo, tapa blanda, tapa dura) — editable desde "Editar progreso" en "Mi biblioteca".
  - Es propiedad de **tu ejemplar**, no de la obra: vive en `library_entries.position` (tipado en `src/lib/library/position.ts`), no en `books` — consistente con cómo `position` ya modela lo que varía por usuario y por tipo.

### 7.2 Búsqueda de libros por ISBN — *hecho*
- [x] Buscar un libro por **ISBN** además de por título: autodetección en `src/lib/catalog/isbn.ts` (10 o 13 dígitos, tolerando guiones/espacios y la `X` final del ISBN-10), enrutada como `q=isbn:...` en Google Books.
- [x] ISBN capturado en el catálogo (`books.isbn`) leyendo `industryIdentifiers` de la respuesta, y también disponible en "añadir manualmente" con su propia validación.
- [x] Datos mock actualizados (`MOCK_EXTERNAL_APIS=true` soporta búsqueda por ISBN también).
- [x] **Búsqueda inversa para datos incompletos**: un hit directo por ISBN a veces viene sin portada o sin sinopsis (ediciones "delgadas" de Google Books). `src/lib/catalog/google-books.ts` detecta esto (`isIncomplete`: falta `coverUrl` o `synopsis`) y hace una segunda búsqueda por título+autor, rellenando solo los campos que faltaban — conserva el ISBN/identidad del hit original, no lo sustituye por otra edición. Verificado en producción con datos reales (Google Books devuelve intermitentemente `503`, manejado como "sin resultados" en vez de error).

### 7.3 Escanear código de barras para añadir por ISBN — *hecho (versión nativa)*
- [x] Botón de cámara en la búsqueda de libros (`src/app/buscar/barcode-scanner.tsx`), visible **solo dentro del wrapper nativo de Capacitor** (`Capacitor.isNativePlatform()`) — nunca en la PWA web, porque no hay una vía web fiable de escaneo (ver 8-F). Usa `@capacitor-mlkit/barcode-scanning` (`scan()`, formatos `Ean13`/`Ean8`) y navega a `/buscar?type=book&q=<isbn>`, reutilizando la autodetección de ISBN de 7.2 sin cambios.
  - Reemplaza la primera versión (web, `BarcodeDetector`) construida antes de decidir adoptar Capacitor (8-F) — se descartó por completo en vez de mantenerla como fallback, ya que la cobertura de `BarcodeDetector` era el motivo original para considerar ir nativo.
  - **Sigue pendiente**: verificar con cámara real en un dispositivo — este sandbox no tiene Android SDK/emulador instalado (ver §7.31/`docs/TESTING.md`). Solo se ha podido comprobar que el botón no aparece en web (comportamiento esperado) y que `tsc`/`eslint` pasan.

### 7.4 Sagas y colecciones (gestionadas por separado) — *saga: hecho; colección: pendiente*
- [x] **Sagas** implementadas en 7.34: tabla `sagas` + `saga_items` (catálogo compartido), autopobladas para cine desde TMDB `belongs_to_collection` y asignables a mano para libros, con vista propia `/saga/[id]`. Ver 7.34 para el detalle.
  - Se optó por una **tabla `sagas` dedicada** (agrupación 1→N con vista propia) en vez de reutilizar la tabla genérica par-a-par de 8-B, precisamente porque el objetivo pedido era una *vista de saga* (agrupar+ordenar sobre relaciones par-a-par es más costoso de consultar). 8-B sigue vigente para relaciones *entre tipos distintos* (adaptación libro↔película), que es un caso diferente.
  - "series" ya significa "series de TV"; se usa **"saga"** para la agrupación, evitando la colisión.
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

### 7.28 Random picker ("no sé qué ver/leer")
- [ ] Botón que elige al azar un ítem de tu lista de pendientes, con filtros opcionales (ej. "tengo 2 horas" usando `duration_minutes`/`total_pages`/ritmo personal de 7.22).
  - Idea barata y autocontenida: no requiere esquema nuevo, solo una query aleatoria sobre `library_entries` con status `planned` filtrada por los metadatos que ya existen (o existirán tras 7.8/7.1).

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

### 7.32 Búsqueda "local primero" con persistencia automática al catálogo — *hecho*
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
| 7.28 Random picker | S | 7.1/7.8 (metadatos) | Barato y autocontenido, pero aplazado a propósito para el final — decisión explícita, no por dependencias |

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
- **Verificado en navegador con datos reales** (limpiados después): Matrix → reparto con fotos (Keanu Reeves como Neo, etc.), dirección/guion Wachowski enlazados, chip "Matrix - Colección", y `/saga` con las 4 películas en orden cronológico (1999→2021); El Quijote → autor Cervantes enlazado a su ficha con bio/foto de Open Library y "Su obra"; asignación manual de saga a un libro con su posición. Segunda visita no vuelve a llamar a la API (créditos/saga ya en BD).
- **Resuelto al construir**: el primer render de una ficha dispara enriquecimientos **concurrentes** (varias inserciones a la vez) → el alta de personas maneja el `23505` de carrera re-seleccionando; el orden de una colección TMDB se garantiza reconstruyendo `saga_items` (borrar+reinsertar) en cada visita de la saga, porque `upsert` sobre el índice único no actualizaba la posición de filas ya existentes.
- **A mejorar a futuro — bio de autor en español**: Open Library solo ofrece la biografía de autor **en inglés** (a diferencia de TMDB, que sí se resuelve en `es-ES` para personas de cine/series). Para tener bios de autor en español habría que añadir **Wikidata/Wikipedia** como fuente adicional (resolver el autor por nombre → QID de Wikidata → extracto de Wikipedia en español), como capa de enriquecimiento sobre la ficha ligera. No bloqueante; queda como mejora.

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
  ocultando la UI (enlace "Añádelo manualmente" en `/buscar`, `SagaAssignForm` en la ficha de libro),
  además de guardar la página `/buscar/manual`. Capa de dominio: `src/lib/auth/roles.ts`
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
