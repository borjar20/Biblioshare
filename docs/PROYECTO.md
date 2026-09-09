# Biblioshare — qué existe hoy

> **[Canónico · verificado contra código el 2026-08-19]**
>
> Mapa de features construidas y desplegadas, por dominio, con su ruta principal.
> Este doc dice **qué hay**; cómo está organizado lo dice `docs/ARQUITECTURA.md`,
> el esquema `docs/requirements/data-model.md`, y lo pendiente
> `docs/requirements/backlog.md` + las issues del repo. El producto y su porqué:
> `docs/requirements/vision.md`.

Biblioshare es un tracker social de libros, películas y series: catálogo compartido
entre todos los usuarios, progreso y biblioteca privados por usuario, capa social de
seguimiento/clubes. Web Next.js 16 (App Router, Cache Components) + Supabase
(Postgres/RLS/Storage/Auth) + PWA + wrapper Android con Capacitor. UI en español
con i18n (`next-intl`) desde el inicio.

## Catálogo compartido

- **Tres tipos de obra** (`books`, `movies`, `series`) con metadata por tipo y
  referencias polimórficas `(item_type, item_id)` en todo el sistema.
- **Búsqueda** (`/buscar`): escalera local→externa; Open Library para libros (incl.
  escáner de código de barras/ISBN en Android), TMDB para cine/series. Alta
  «cache-as-you-go»: la obra se materializa como shell al abrirla y se hidrata
  (sinopsis, géneros, tamaños, créditos) en la primera visita.
- **El catálogo lo escribe el servidor, no el cliente** (#674, 2026-08-19): el alta
  manda SOLO el id externo a una RPC `SECURITY DEFINER` (`register_catalog_item`) y
  los campos canónicos los rellena la hidratación fill-only desde el proveedor
  oficial. El INSERT directo está revocado — antes cualquiera podía apropiarse de un
  `tmdb_id` con metadatos falsos y servírselos a todo el mundo. Detalle:
  `data-model.md` §2.1.
- **Ediciones de libro** (`book_editions`): el pase apunta a la edición leída
  (formato/páginas/editorial); selector en ficha y editor propio.
- **Personas y créditos** (`/persona/[id]`): reparto/equipo de cine y series y
  autores de libros (identidad por clave Open Library), con ficha de persona
  (bio TMDB, timeline cronológico de obras, filmografía hidratable).
- **Géneros normalizados** (`/genero/[slug]`): vocabulario canónico + índice GIN.
- **Edición de ficha inline** para colaboradores/admin (banner «Editando la ficha
  oficial», doble barrera TS+BD), y subida de portadas oficiales.
- **Fichas de obra** (`/libro/[id]`, `/pelicula/[id]`, `/serie/[id]`): pestañas
  Información / Comunidad / Mi registro (+ Episodios en serie), rail de acciones,
  sagas de la obra, dónde verla (watch providers), versiones.

## Biblioteca personal (modelo Obra → Ejemplar → Pase)

- **Pases** (`passes`): TODA la relación usuario↔obra (estado, fechas, nota,
  reseña, posición) vive en pases; relecturas/revisionados = varios pases por obra.
  Transiciones por `planTransition`/`applyTransition` (una sola máquina de estados).
- **Sesiones de progreso** (`progress_sessions`): registro con modal de ruta
  interceptada (`/sesion/[passId]`, slot `@modal`), cronómetro nativo en Android.
- **Episodios de serie** (`episode_watches`): marcar/puntuar por episodio, rail de
  temporadas, auto-avance de posición.
- **Colección** (`/coleccion`): pestañas Todo / Colecciones / Sagas; filtros;
  colecciones/listas del usuario (`collections`, con visibilidad y sorteables) y
  «sacar un lomo» (sorteo animado de la pila).
- **Notas y citas** (`/notas`, «Cuaderno»): captura desde ficha/sesión con ancla
  (página, episodio), spoiler-flag, notas públicas o privadas.
- **Diario/estadísticas** (`/estadisticas`): muro de paneles de datos agregados
  (contrato en `docs/design/paneles-estadisticos.md`), retos (`challenges`),
  objetivo diario, heatmap, media/histograma de notas.
- **Importar/Exportar** (`/importar`, `/api/export`): CSV de Goodreads y
  Letterboxd con triaje de ambiguos (`/importar/pendientes`); export CSV propio.

## Sagas y universos

- **Sagas** (`/sagas`, `/saga/[id]`): jerarquía con subsagas y multi-membresía;
  orden unificado (progreso = pertenencia; colocación curada `position_in_parent`;
  placement fijo/libre/anclado; opcionales y saltos).
- **Itinerarios** (rutas de lectura sintetizadas con slugs reservados), ventanas
  de colocación («léelo antes de X»), tándems (intercalado por hueco).
- **Mapa de universo** (`/saga/[id]/mapa`): grafo DERIVADO (React Flow) con
  timeline móvil separada; seguir sagas (`saga_follows`).
- **Curación** por colaboradores: editor de secuencia, sync TMDB acotado por RPC.

## Social

- **Perfiles** (`/u/[username]`): públicos por defecto (modelo Instagram),
  privados con solicitud; pestañas Actividad / Biblioteca / Estadísticas; pins.
- **Follows** con solicitudes pendientes; sugerencias de a quién seguir.
- **Posts** (`posts`, `/post/[id]`): capa canónica del feed — reseñas, hitos,
  pensamientos con ancla; feed de Inicio ordenado por publicación con cursor.
- **Interacciones**: reacciones multi-emoji, comentarios con hilos y pin,
  menciones @usuario con gate de visibilidad, deep-link `#c-<id>`.
- **Notas de voz**: comentario de audio (grabadora inline con pausa/preview/cancelar,
  cap 60 s) en posts de club, reseñas y pensamientos; chip reproductor con velocidad y
  waveform, bucket privado con URL firmada; hereda hilos, reacciones, notificaciones,
  bloqueos y moderación del comentario de texto. BD migrada en dev y prod; el wrapper
  Android necesita release nueva del APK (permiso `RECORD_AUDIO`, issue #842).
- **Moderación**: bloqueos bidireccionales (`user_blocks`), reportes
  (`content_reports`) con cola de revisión.
- **Notificaciones**: in-app (`notifications`, campana) + push unificado Web
  (VAPID) y Android (FCM) con preferencias opt-out por canal×categoría;
  planificador `pg_cron`+`pg_net` (recordatorios de eventos).
- **Celebraciones** (hitos ganar→drenar, `user_celebrations`) con animación.

## Clubes

- **Clubes** (`/clubes`, `/club/[slug]`): visibilidad pública/privada con
  solicitud de entrada, roles (owner/mod/member) con transiciones solo por RPC,
  directorio de miembros, portada.
- **Feed de club**: posts, encuestas (`poll`), compartir actividad, moderación.
- **Actividades** (motor genérico SD-8): lectura conjunta (`buddy_read`) con
  hitos anti-spoiler (checkpoints + chat gateado por progreso), tierlist,
  list-challenge (modo abierto), criteria-challenge, y **eventos** (`evento`:
  encuentro / lanzamiento / fecha destacada, con seguimiento y recordatorios).
- **Rondas** (`club_rounds`): latido semanal del club (semana/turno en SQL,
  Europe/Madrid).
- **Calendario** (`/club/[slug]/calendario`; pestaña en móvil): marcas de
  eventos/actividades, agenda por día, leyenda.

## Plataforma

- **Auth**: Supabase Auth (email+password), recuperación por mail,
  `/cuenta/contrasena`; onboarding en 3 pasos con gate `onboarded_at` e import.
- **RBAC**: `profiles.role` user/collaborator/admin; `/admin` (gestión de roles);
  doble barrera app+BD en catálogo/curación (ver `docs/SEGURIDAD.md`).
- **PWA**: manifest + service worker (offline solo-lectura, network-first);
  página `/offline`.
- **Android (Capacitor)**: wrapper híbrido (lo nativo habla con Supabase);
  widgets Glance (En curso con cronómetro, Objetivo de hoy) por pull-RPC;
  push FCM; escáner de códigos; CI de release firmada a Firebase App
  Distribution. iOS: no existe todavía.
- **Observabilidad/infra**: Vercel (Speed Insights), baseline de rendimiento
  congelado (`docs/perf-baseline.md`), mapa de arquitectura derivado
  (`docs/architecture/graph.json`).

## Mascota — interfaz RPG (verificada en código el 2026-09-09)

`/mascota` reúne Campamento, Personaje, Mochila, Diario, Madriguera y Combate con
escenarios de bosque pixel y un tema verde común a claro y oscuro. El retorno
«Biblioshare» conserva la última ubicación de la app. Entrenamiento y aventuras
se pausan al salir y recuperan su intento guardado en el dispositivo. Mochila
compara copias y permite equiparlas; Diario conserva todas las misiones y logros.
Implementación local de #1165; publicación pendiente. Contrato y evidencia en
`superpowers/specs/2026-09-09-mascota-rpg-ui-design.md`.

## Lo que NO existe (para no buscarlo)

Etiquetas privadas, modo «en pausa», método de adquisición del ejemplar, diario
emocional, OCR de citas, recomendador, tabla de adaptaciones/relaciones entre
obras, listas colaborativas, seguir editoriales, retos personalizables, «Tu año
en Biblioshare», comparar bibliotecas, offline-first con escritura, IGDB
(videojuegos), app iOS. Estado y prioridades: `docs/requirements/backlog.md`.
