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
UI de progreso. Ver §8 (decisiones) para el razonamiento.

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

### 7.1 Metadatos de libro más ricos
- [ ] Añadir editorial, nº de páginas y encuadernación/formato a la ficha de libro.
  - Editorial y nº de páginas (ya existe `total_pages`) son propiedades de la *obra* → tabla `books` (catálogo compartido).
  - La **encuadernación es propiedad de *tu ejemplar***, no de la obra: dos usuarios pueden tener el mismo libro en formatos distintos. Debe vivir por usuario (en `library_entries`, p. ej. dentro de `position` o un campo nuevo), **no** en `books`.

### 7.2 Búsqueda de libros por ISBN
- [ ] Permitir buscar un libro por **ISBN** además de por título. Google Books lo soporta nativamente con `q=isbn:...`.
  - UX propuesta: **autodetectar** cuando la query tiene forma de ISBN (10 o 13 dígitos, tolerando guiones/espacios y la `X` final del ISBN-10) y enrutarla como `isbn:` — sin modo aparte; si no, buscar por título como ahora.
  - Aprovechar para **capturar el ISBN en el catálogo** (`books.isbn`, hoy sin rellenar) leyendo `industryIdentifiers` de la respuesta — enlaza con 7.1.
  - Añadir un ISBN a los datos mock para poder probarlo con `MOCK_EXTERNAL_APIS=true`.

### 7.3 Escanear código de barras para añadir por ISBN
- [ ] En móvil (PWA con cámara), escanear el código de barras (ISBN) de la contraportada de un libro físico y añadirlo directamente, sin teclear nada.
  - Técnicamente: API web `BarcodeDetector` para leer el código + reutilizar la búsqueda por ISBN de 7.2 con el valor leído.
  - **Riesgo a investigar**: soporte de `BarcodeDetector` es desigual entre navegadores (bien en Chrome/Edge Android, históricamente ausente/parcial en Safari/iOS) — habría que validar cobertura real o prever una librería JS de fallback (p. ej. basada en `getUserMedia` + decodificación en JS) antes de comprometerlo.

### 7.4 Sagas y colecciones (gestionadas por separado)
- [ ] Agrupar libros que pertenecen a una **saga/serie literaria** (p. ej. una trilogía) y a **colecciones**, gestionadas por separado.
  - **Distinción a definir**: una *saga* es metadato intrínseco de la obra (compartido, idealmente viene de la fuente de datos) vs. una *colección/lista* es una agrupación **curada por el usuario** (privada). Probablemente son dos features distintas: saga en catálogo, colección por usuario.
  - Cuidado con el nombre: "series" ya significa "series de TV" en el modelo actual; usar **"saga"** para libros evita la colisión.

### 7.5 Etiquetas + estadísticas por etiqueta
- [ ] Etiquetas libres por usuario sobre sus ítems.
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

### 7.8 Páginas de detalle por ítem (`/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`)
- [ ] Página propia por libro/película/serie con la ficha completa (sinopsis, autor/director/creador, géneros, año, páginas/duración/temporadas) y el botón de añadir a biblioteca — hoy nada de eso se muestra en ningún sitio.
  - **Ya tenemos los datos**: `books`, `movies` y `series` ya guardan `synopsis`, `genres`, `director`/`creator`, `duration_minutes`, `total_pages`, `total_seasons`/`total_episodes` — se rellenan al buscar pero ninguna pantalla los renderiza hoy. Esta página es principalmente UI, no requiere migración.
  - El catálogo es compartido, así que el ítem solo existe en `books`/`movies`/`series` (y por tanto la página solo es accesible) una vez alguien lo ha añadido al menos una vez vía búsqueda — coherente con el diseño actual.
  - Los resultados de búsqueda (`SearchResultCard`) y las tarjetas de biblioteca/perfil (`CoverCard`, ya construido pero sin usar) enlazarían aquí.
  - A definir: convención de ruta (`/libro/[id]` por tipo vs. `/item/[type]/[id]` unificado) y si se muestra el estado/progreso del usuario actual cuando ya está en su biblioteca.

### 7.9 Favoritos fijados + imagen para compartir el perfil
- [ ] Fijar hasta N ítems favoritos arriba del perfil público (estilo Letterboxd).
  - Requiere un cambio pequeño de esquema (marcar N filas de `library_entries` como destacadas, p. ej. un campo `pinned_order`), mismo RLS que ya existe.
- [ ] Generar una **imagen Open Graph** del perfil para cuando se comparte el link.
  - Casi gratis: ya se genera contenido con `next/og` para los iconos PWA (`src/app/icon.tsx`, `src/lib/app-icon.tsx`) — mismo patrón aplicado a `app/u/[username]/opengraph-image.tsx`.

### 7.10 Retos de lectura/visionado anuales
- [ ] Objetivo tipo "50 libros en 2026" con barra de progreso, calculado sobre `diary_entries`/`library_entries` que ya se registran.

### 7.11 Estantería "Ahora mismo"
- [ ] Acceso rápido a los ítems en estado `in_progress`, mostrando la página/episodio actual (`position`, ya modelado). Pensado como atajo al bucle de uso diario, posiblemente en el home.

### 7.12 Buscar y ordenar dentro de tu propia biblioteca
- [ ] Buscar por texto y ordenar por rating/fecha/título en "Mi biblioteca" (hoy solo filtra por tipo/estado) — se nota en cuanto la biblioteca crece.

### 7.13 Recuento de relecturas visible
- [ ] Mostrar en la tarjeta de cada ítem "leído/visto N veces", contando `diary_entries` — dato que ya se registra, falta solo mostrarlo.

### 7.14 Sesiones de progreso diarias (base de rachas, calendario y estadísticas)
Referencia: capturas de un competidor mostrando 4 pantallas — estadísticas diarias, calendario mensual de lectura, rachas, y estadísticas anuales.

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
- [ ] Guardar citas/frases favoritas de un libro.
- [ ] Sistema de seguidores + feed de actividad.
- [ ] Estadísticas y gráficos de hábitos generales (ítems por tipo/estado, actividad del diario por mes).
- [ ] Offline-first completo (edición sin conexión + sincronización posterior).
- [ ] Listas curadas y colecciones temáticas (ver 7.4).
- [ ] Integración con más fuentes (videojuegos vía IGDB, música, etc.) — encaja con la idea original de "biblioteca de tus hobbies".

## 8. Decisiones registradas

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
| 2026-07-08 | MVP cerrado como **v1.0**; §6 completo al 100% | Todas las funcionalidades comprometidas en §4 están construidas y verificadas; ver §9 |

## 9. Historial de versiones

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
