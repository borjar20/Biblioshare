# Biblioshare — Requisitos y alcance

Última actualización: 2026-07-08

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

### 7.4 Sagas y colecciones (gestionadas por separado)
- [ ] Agrupar libros que pertenecen a una **saga/serie literaria** (p. ej. una trilogía) y a **colecciones**, gestionadas por separado.
  - **Distinción a definir**: una *saga* es metadato intrínseco de la obra (compartido, idealmente viene de la fuente de datos) vs. una *colección/lista* es una agrupación **curada por el usuario** (privada). Probablemente son dos features distintas: saga en catálogo, colección por usuario.
  - Cuidado con el nombre: "series" ya significa "series de TV" en el modelo actual; usar **"saga"** para libros evita la colisión.
  - **Reutiliza 8-B**: una saga es, en el fondo, una relación libro↔libro de "mismo universo" — la tabla genérica de relaciones decidida en 8-B (ampliada explícitamente a "mismo universo", no solo adaptaciones) puede modelar esto sin un mecanismo aparte. Evaluar antes de construir una tabla `sagas` dedicada.

### 7.5 Etiquetas privadas + estadísticas por etiqueta
- [ ] Etiquetas libres y **privadas** por usuario sobre sus ítems (ej. "para regalar", "recomendado por mamá", "confort") — no son públicas ni compartidas entre usuarios, a diferencia del catálogo.
- [ ] Panel de estadísticas agrupadas por etiqueta (depende de lo anterior).

### 7.6 Seguir editoriales y ver sus novedades
- [ ] Seguir editoriales y recibir sus **novedades / próximos lanzamientos**.
  - Depende de capturar la **editorial** en el catálogo (7.1).
  - **Riesgo técnico a investigar**: las APIs actuales (Google Books) no exponen un feed fiable de "novedades por editorial" — evaluar la fuente de datos antes de comprometerlo.

### 7.7 Importar biblioteca desde Goodreads / Letterboxd (CSV)
- [ ] Subir el CSV exportado de Goodreads o Letterboxd e importar de golpe libros/películas ya leídos/vistos, con su rating y fecha.
  - **Por qué importa**: resuelve el arranque en frío — una biblioteca vacía desanima a un usuario nuevo; poder traer su historial de años en un paso es la palanca de adopción más grande que se puede construir aquí.
  - Reutiliza el flujo `findOrCreateCatalogItem` ya existente (`src/app/buscar/actions.ts`) para cada fila.
  - Encaja con datos que ya modelamos: columnas de Goodreads como *Publisher*/*Binding*/*ISBN* alimentan 7.1/7.2; "Date Read" repetido (relecturas) mapea directo a `diary_entries`.
  - A definir: qué pasa si una fila no matchea nada en la API (fallback a `/buscar/manual`) y cómo se reporta al usuario qué filas se importaron/fallaron.
- **Trakt es un caso aparte, no un CSV más**: Trakt.tv (series/películas) no exporta CSV, tiene una API REST con OAuth y sincronización continua (no un volcado de una vez). Es una integración de otra naturaleza — mantenerla como idea independiente en vez de meterla en esta tarea; solo abordarla si algún día interesa sync continuo, no solo import inicial.

### 7.8 Páginas de detalle por ítem (`/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`) — *hecho*
- [x] Página propia por libro/película/serie: portada grande, título, metadatos condicionales (autor/director/creador + año, editorial+páginas / duración / temporadas+episodios, ISBN, géneros), sinopsis, y botón de añadir a biblioteca que ya reconoce si el ítem está en la tuya (`ItemLibraryButton`, `addExistingItemToLibrary` — inserta directo en `library_entries` sin pasar por `findOrCreateCatalogItem`, porque el ítem ya tiene fila de catálogo).
  - Convención de ruta decidida: tres carpetas por tipo (`/libro`, `/pelicula`, `/serie`), no una ruta unificada `/item/[type]/[id]` — consistente con el resto de rutas en español del proyecto (`/buscar`, `/biblioteca`). Helper `itemHref(itemType, id)` en `src/lib/catalog/item-href.ts` centraliza la construcción de la URL.
  - `LibraryItemCard` y `PublicItemCard` ahora enlazan la portada+título a la ficha; se añadió `itemId` a `LibraryItem` (antes solo tenía `entryId`) para poder construir el enlace.
  - `not-found.tsx` propio por ruta para IDs inexistentes (probado con un UUID inventado).
  - Los resultados de búsqueda (`SearchResultCard`) **no** enlazan aquí todavía — un resultado de búsqueda aún no tiene fila de catálogo hasta que se añade, así que no hay id al que enlazar en ese punto del flujo.

### 7.9 Perfil público personalizable: favoritos fijados, estanterías y OG image
- [ ] Fijar hasta N ítems favoritos arriba del perfil público (estilo Letterboxd).
  - Requiere un cambio pequeño de esquema (marcar N filas de `library_entries` como destacadas, p. ej. un campo `pinned_order`), mismo RLS que ya existe.
- [ ] **Ampliación**: no solo "favoritos", sino varias **estanterías/vitrinas nombradas** por el usuario (p. ej. "Mis pósters", "Lo mejor de 2026") — mismo mecanismo de `pinned_order` pero con una etiqueta de grupo en vez de una sola lista fija. Empezar por la versión simple (una sola fila de favoritos) y solo ampliar a estanterías múltiples si hay demanda real; evita construir de más de entrada.
- [ ] Generar una **imagen Open Graph** del perfil para cuando se comparte el link.
  - Casi gratis: ya se genera contenido con `next/og` para los iconos PWA (`src/app/icon.tsx`, `src/lib/app-icon.tsx`) — mismo patrón aplicado a `app/u/[username]/opengraph-image.tsx`.

### 7.10 Retos de lectura/visionado anuales
- [ ] Objetivo tipo "50 libros en 2026" con barra de progreso, calculado sobre `diary_entries`/`library_entries` que ya se registran.

### 7.11 Estantería "Ahora mismo"
- [ ] Acceso rápido a los ítems en estado `in_progress`, mostrando la página/episodio actual (`position`, ya modelado). Pensado como atajo al bucle de uso diario, posiblemente en el home.

### 7.12 Buscar y ordenar dentro de tu propia biblioteca
- [ ] Buscar por texto y ordenar por rating/fecha/título en "Mi biblioteca" (hoy solo filtra por tipo/estado) — se nota en cuanto la biblioteca crece.

### 7.13 Recuento de relecturas visible y comparativa entre pases
- [ ] Mostrar en la tarjeta de cada ítem "leído/visto N veces", contando `diary_entries` — dato que ya se registra, falta solo mostrarlo.
- [ ] En el panel de diario, mostrar la **comparativa entre pases** ("en 2020 le diste 3★, ahora 5★") — mismo dato (`diary_entries.rating` por fecha), solo falta la UI que los liste ordenados y resalte el cambio.

### 7.14 Sesiones de progreso diarias (base de rachas, calendario y estadísticas)
Referencia: capturas de un competidor mostrando 4 pantallas — estadísticas diarias, calendario mensual de lectura, rachas, y estadísticas anuales. Esta es la idea de "modo racha (streaks)" — ya cubierta aquí en detalle, no se duplica en otra sección.

- [ ] Modelar `progress_sessions` (base fundacional): `library_entry_id`, `date`, delta de progreso (páginas leídas / episodios avanzados ese día), opcionalmente minutos dedicados.
  - **Gap de modelo real, no solo de UI**: hoy no existe forma de saber "¿qué avancé el martes?". `library_entries.position` solo guarda el punto *actual* (sin historial), y `diary_entries` solo registra el *pase completo* (fecha inicio/fin de una relectura entera). Ninguno de los dos permite reconstruir actividad día a día.
- [ ] Estadísticas diarias: tira de días de la semana con indicador de actividad + objetivo diario configurable (ej. "30 min") con progreso circular, y detalle del día (páginas leídas, minutos, páginas/minuto).
  - Implica añadir un objetivo diario a `profiles` o una tabla de settings, y decidir si el tiempo se **introduce a mano** (como parece en la captura, "Has leído 5 min") o con un cronómetro en la app — la primera es mucho más barata.
- [ ] Calendario mensual: grid de días del mes con la portada del ítem en los días que tuvo actividad — lectura directa de `progress_sessions` agrupada por día.
- [ ] Rachas: racha actual y mejor racha (días consecutivos con al menos una sesión de progreso en cualquier ítem), con su propio calendario de resaltado. Cálculo derivado, no necesita tabla propia más allá de la sesión diaria.
- [ ] Estadísticas anuales: gráfico de barras de ítems completados por mes + objetivo anual (ej. "30 libros") con progreso circular. El conteo por mes puede salir de `diary_entries.finished_on` sin necesitar `progress_sessions`.
- A definir cuando se aborde: si esto aplica solo a libros o también a películas/series (para video, "página" no tiene sentido pero "minutos vistos" o "episodios avanzados" sí); si el objetivo diario/anual es un único valor global o por tipo de ítem; UX de introducir el progreso diario (¿un botón rápido "+X páginas hoy" sobre el `ProgressPanel` ya existente, o un flujo dedicado?).

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

### 7.22 Cola priorizada con tiempo estimado
- [ ] Reordenar la lista de "pendientes" por prioridad (drag & drop) y ver cuánto tardarías en completarla al ritmo actual ("~8 meses"), con estimación por ítem individual.
  - Ya tenemos buena parte de los datos necesarios: `total_pages`/`duration_minutes`/`total_episodes` existen en el catálogo (algunos sin poblar aún, ver 7.8). Falta calcular el "ritmo personal" (páginas/día, horas/semana) a partir del historial — se puede derivar de `diary_entries` sin tabla nueva.
  - Mostrar la fórmula de cálculo al usuario (transparencia) en vez de un modelo opaco — más barato y genera más confianza.

### 7.23 Retos personalizables (ampliación de 7.10)
- [ ] Más allá del objetivo simple anual (7.10): retos con **filtros** (género, autor/director, país, etiqueta, periodo), progreso automático al registrar ítems que cumplen el filtro, retos públicos clonables por otros usuarios, y tarjeta de progreso exportable.
  - Reutilizaría el mismo motor de filtros que "Mi biblioteca" (7.12) y las etiquetas (7.5) en vez de construir uno nuevo — buen momento para diseñar ambos pensando en que un tercer consumidor (retos) también los va a necesitar.
  - Criterios como "autoras" o "nacionalidad del autor/a" no los da ninguna API — requeriría etiquetado manual/comunitario, no asumirlo como dato disponible.

### 7.24 Notas ancladas al punto de progreso
- [ ] Notas privadas mientras consumes un ítem, ancladas al capítulo/minuto/episodio actual, con vista de "línea de tiempo" al terminar (para ver cómo evolucionaron tus teorías) y opción de publicar una nota suelta como reseña con aviso de spoiler.
  - Distinto de `notes` (campo único de texto libre que ya existe en `library_entries`) y de `diary_entries.review` (una reseña por pase): esto es **una lista de notas con timestamp/punto de progreso propio** — necesitaría su propia tabla si se construye (`entry_notes`: `library_entry_id`, `progress_point` jsonb, `body`, `created_at`), no encaja en los campos actuales sin perder la ordenación.
  - Comparte con 7.20/7.21/7.30 la necesidad de una utilidad genérica de "spoiler-safe" — ver §8.

### 7.25 "¿Dónde lo veo?" (disponibilidad en streaming)
- [ ] En películas/series, mostrar en qué plataforma de streaming está disponible.
  - **Más barato de lo que parece**: TMDB (que ya integramos) expone `/movie/{id}/watch/providers` y `/tv/{id}/watch/providers` con exactamente este dato por región (es la misma fuente que JustWatch, bajo acuerdo de licencia) — no hace falta una integración nueva con JustWatch.
  - Encaja de forma natural en 7.8 (páginas de detalle por ítem) — mejor construirla ahí directamente que como feature aislada.

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
- [x] Para búsquedas por título (sin ISBN exacto), se consulta catálogo local y API externa en paralelo; los resultados de la API que no coinciden con algo que ya tenemos (por id externo o ISBN) se **insertan en el catálogo antes de devolver la respuesta** (`src/lib/catalog/find-or-create.ts`, reutilizado tanto por la búsqueda como por "añadir a biblioteca") — así, sin esperar a que el usuario añada nada, la próxima búsqueda de ese mismo título ya lo encuentra localmente. Verificado: una búsqueda repetida no crea filas duplicadas en el catálogo.
- [x] `SearchResult` gana un campo `catalogId` opcional: lo llevan tanto los resultados locales como los recién persistidos, y "añadir a biblioteca" lo usa directamente en vez de repetir el find-or-create (excepto en modo mock, donde no hay catálogo real de por medio).
- [x] Captura de `synopsis`/`genres` añadida a Google Books (`description`/`categories`) y TMDB (`overview` + `genre_ids` resueltos contra `/genre/{kind}/list`, cacheado en memoria por proceso) — antes estas columnas existían en el esquema pero ningún código las rellenaba nunca; ahora alimentan directamente las páginas de detalle (7.8).
- Verificado en producción con datos reales: búsqueda por título trae y persiste 20 libros con sinopsis/géneros; repetir la búsqueda no duplica filas; búsqueda por el ISBN ya cacheado devuelve un único resultado sin tocar la API (confirmado por tiempos de respuesta); "añadir a biblioteca" usa el `catalogId` cacheado correctamente. Datos de prueba limpiados después.

### 7.33 Resumen de priorización sugerida

No vinculante — orden propuesto combinando esfuerzo, valor y dependencias, para decidir por dónde seguir. Todo lo marcado `[x]` en las secciones de arriba queda fuera de esta tabla (ya hecho).

| Idea | Esfuerzo | Depende de | Por qué este orden |
|---|---|---|---|
| **7.31 Adoptar Capacitor** | **S-M** | **§8-F (decidido)** | **En curso — falta compilar/probar en Android real; scaffolding y 7.3/7.32 ya construidos sobre esta base** |
| 7.8 Páginas de detalle por ítem | M | — | Datos ya existen sin usar; desbloquea 7.25 y da un lugar natural a 7.9/7.27 |
| 7.25 "¿Dónde lo veo?" | S | 7.8 | Casi gratis vía TMDB, encaja directo en 7.8 |
| 7.12 Buscar/ordenar en tu biblioteca | S | — | Barato, se nota en cuanto la biblioteca crece |
| 7.13 Recuento de relecturas + comparativa | S | — | Dato ya registrado, falta solo UI |
| 7.28 Random picker | S | 7.1/7.8 (metadatos) | Autocontenido, divertido, barato |
| 7.11 Estantería "Ahora mismo" | S | — | Atajo de uso diario, sin esquema nuevo |
| 7.7 Importar CSV (Goodreads/Letterboxd) | M | 7.1/7.2/§4.2 manual | Mayor palanca de adopción de todo el backlog |
| 7.9 Favoritos/vitrina + OG image | S-M | — | Barato, mejora directa de compartibilidad del perfil |
| 7.16 Modo "en pausa" | S-M | §8-A (resuelto) | Cierra un hueco real del modelo de estados, ya sin decisión pendiente |
| 7.5 Etiquetas privadas | M | — | Base para 7.23 (retos) y estadísticas por etiqueta |
| 7.22 Cola priorizada con tiempo estimado | M | 7.1/7.8 | Usa datos que ya existirán tras 7.1/7.8 |
| 7.4 Sagas y colecciones | M | §8-B (resuelto) | Puede reutilizar la tabla de relaciones "mismo universo" en vez de mecanismo propio |
| 7.14 Sesiones de progreso diarias (rachas) | L | — | Alto valor de retención, pero requiere tabla nueva y bastante UI |
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

## 8. Decisiones de arquitectura (evaluadas antes de construir más)

Estas no son features — son decisiones de forma que, si se toman tarde (después de que ya haya datos o UI construida encima), cuestan un refactor. La mayoría ya se resolvió (8-A, 8-B, 8-C) o se confirmó el enfoque (8-D, 8-E) al revisar este backlog; quedan abiertas la normalización de géneros (nota dentro de 8-B) y 8-F (PWA-only vs. nativo), que es una decisión de producto, no técnica.

### 8-A. ¿"Pausado" es un estado explícito o inferido? — *decidido*
**Decidido**: `paused` es un **estado explícito** en `media_status` (enum) — migración barata (`ALTER TYPE ... ADD VALUE`), evita heurísticas de inactividad frágiles, y evita re-modelar el filtro de estados (`LibraryFilters`, `ProgressPanel`, `PublicItemCard`) dos veces.
**Añadido**: aunque el estado es manual, cuando exista 7.14 (`progress_sessions`) se puede usar esa señal para **sugerir** el cambio, no para aplicarlo solo — p. ej. "no registras avance en *Fahrenheit 451* desde hace 45 días, ¿lo marcamos como pausado?" como una notificación más dentro de 7.17, no un job que cambie el estado por su cuenta. Mantiene la separación clara: el usuario decide el estado, el sistema solo detecta la señal y avisa.

### 8-B. Relaciones entre ítems de catálogo (adaptaciones, mismo universo, recomendaciones) — *decidido*
Hoy `books`, `movies` y `series` no tienen ninguna relación entre sí a nivel de datos. **Decidido**: si se aborda 7.21 o 7.19, usar una tabla genérica de relaciones (`item_type_a/item_id_a`, `item_type_b/item_id_b`, `relation_type`) en vez de columnas ad-hoc por tipo (`adaptation_of_book_id` en `movies`, etc.) — mismo espíritu que unificar `library_entries`: un mecanismo, no uno por combinación de tipos.
- **Alcance ampliado**: no solo "adaptación de", también relaciones de **mismo universo/franquicia** (secuela, spin-off, misma saga) — el `relation_type` debe ser un enum abierto a esto desde el diseño, no solo `adaptation_of`.
- **Curación manual, no automática**: las relaciones se crean/editan por el usuario o la comunidad, no se infieren automáticamente de las APIs (que no las dan de forma fiable). Contribución editable con cola de revisión, igual que se apuntaba en 7.21.

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

### 8-E. Spoiler-safe: utilidad compartida, no cuatro implementaciones distintas — *enfoque confirmado*
7.20 (clubs), 7.21 (comparador), 7.24 (notas ancladas) y 7.30 (modo sin spoilers) necesitan las cuatro alguna forma de "ocultar contenido hasta que el progreso/estado del usuario lo permita". Cuando se aborde la primera de las cuatro, construirla como una utilidad genérica (componente/helper reutilizable, no lógica ad-hoc dentro de esa feature) para que las siguientes tres la reutilicen en vez de reinventarla.

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
