# Biblioshare — qué existe hoy

> **[Canónico · verificado contra código el 2026-08-19]**
>
> Mapa de features construidas, por dominio, con su ruta principal y estado de entrega.
> Novedades activas en producción desde el 2026-10-06 (PR #1424); delta de calidad
> verificado en código y esquema local/dev/producción el 2026-10-07; código en PR #1452
> y publicación/enriquecimiento seguidos en #1451.
> Este doc dice **qué hay**; cómo está organizado lo dice `docs/ARQUITECTURA.md`,
> el esquema `docs/requirements/data-model.md`, y lo pendiente
> `docs/requirements/backlog.md` + las issues del repo. El producto y su porqué:
> `docs/requirements/vision.md`.

Biblioshare es una app social para compartir lo que lees, ves y vives, y con quién:
catálogo compartido
entre todos los usuarios, progreso y biblioteca privados por usuario, capa social de
seguimiento/clubes. Web Next.js 16 (App Router, Cache Components) + Supabase
(Postgres/RLS/Storage/Auth) + PWA + wrapper Android con Capacitor. UI en español
con i18n (`next-intl`) desde el inicio.

## Experiencias — esquema aplicado; integración y despliegue en PR #1323 y #1293

**[Delta funcional verificado 2026-10-02; UX de álbum verificada 2026-10-03;
esquema aplicado y verificado en producción el 2026-10-03 a las 10:04 UTC]**
Desde la navegación principal se abre `/experiencias`: planes y recuerdos que pueden crecer
de una salida a una escapada con varios momentos. El archivo se presenta como
un álbum con portadas por actividad, fotos y acompañantes; las invitaciones
preceden a los filtros. La creación pide actividad, nombre y estado, con lugar y
fechas opcionales plegables. Añadir, editar y ordenar momentos sucede desde el
propio recuerdo. La galería amplía cada foto y reúne allí sus acciones y permisos.
Aceptar la invitación da acceso al grupo; cada persona confirma su presencia,
elige su favorito y consiente por separado mostrar identidad e imágenes.
El creador decide la audiencia desde Compartir; publicar en el feed requiere otra
acción explícita. Puede quitar esa publicación única conservando el recuerdo.
La pestaña Experiencias aparece en perfiles propios y visitantes,
según los permisos actuales. Incluye denuncia y moderación administrativa.
El filtro de acompañantes recorre todo el historial accesible. Al perder acceso,
las participaciones propias se pueden retirar desde el hub y las fotos propias
se reconocen con una vista previa exclusiva del autor antes de eliminarlas.
Captura manual; catálogos externos, fusionar recuerdos y filtro entre hobbies
quedan en #1293. Evidencia funcional: `docs/testing/2026-10-02-experiencias.md`;
UX y regresión: `docs/testing/2026-10-03-experiencias-album.md`.
La [evidencia de release](testing/2026-10-03-experiencias-release.md) distingue
el esquema y la publicación del código; el estado de integración, despliegue y
comprobaciones posteriores se sigue en [PR #1323](https://github.com/borjar20/Biblioshare/pull/1323)
y [#1293](https://github.com/borjar20/Biblioshare/issues/1293).

## Navegación — delta local/dev 2026-10-03; entrega en PR #1323

La barra principal tiene Inicio, Biblioteca, Experiencias, Comunidad y Buscar.
El avatar abre el perfil directamente en todos los tamaños; el menú «Más» reúne
Partidas, Mascota y Ajustes. En móvil la barra principal está abajo y desde 768 px
está en la cabecera. El perfil propio conserva Actividad y Experiencias; el
visitante añade Biblioteca, siempre con los permisos actuales.

Biblioteca muestra accesos a Cuaderno (`/notas`), Retos y objetivos
(`/coleccion/rincon`) y Estadísticas (`/estadisticas`). El Rincón conserva retos
activos/archivados, objetivo diario, Memorizar y sorteo. Comunidad (`/comunidad`)
reúne Clubes y Personas; `/clubes` sigue funcionando. Los enlaces propios antiguos
de Estadísticas/Panel y Rincón redirigen a sus nuevas superficies, conservando
los filtros compatibles. No cambia el esquema ni la privacidad de los datos.

## Novedades — calidad de datos y acceso público a anuncios

`/novedades` reúne películas, series, temporadas, libros y primeras traducciones
al castellano. Se accede desde Buscar y desde «Sale esta semana» en Inicio.
«Explorar» es público; «Lo que esperas» usa los pases y las sagas de la persona
autenticada. Una obra agrupa lanzamientos de cine, digital o editoriales con su
mercado, fuente y precisión de fecha; los anuncios sin día exacto se muestran sin
inventarlo. España e internacional tienen identidades y elecciones de avisos propias.

«Añadir a Pendiente» conserva cualquier pase existente y no activa avisos.
«Avisarme» se elige por lanzamiento y se retira por separado. La campana recibe
recordatorios de día exacto, confirmaciones, cambios y cancelaciones con deduplicación;
la aceptación del aviso acredita persistencia en la campana, sin acreditar recepción
de Web Push o Android. `/admin/novedades` permite introducir, revisar, publicar,
corregir y cancelar libros, también sin ISBN, conservando la biblioteca del administrador.

La sincronización diaria de TMDB y la revisión editorial semanal muestran la última
comprobación efectiva. La primera versión se desplegó en PR #1424; esquema, rutas y job
horario se verificaron en producción el 2026-10-06. Evidencia de entrega:
`docs/testing/2026-10-06-novedades-release.md`. La curación editorial inicial sigue en #1423.

El delta de calidad (#1451, código en PR #1452 y esquema aplicado en producción el 2026-10-07) intenta completar sinopsis
y portada oficiales antes de clasificar. Explorar reserva las obras con portada y sinopsis
para el listado principal; las restantes mantienen fecha, fuente y acciones en «Anuncios
con información limitada». La sinopsis inglesa se etiqueta. Inicio selecciona sólo obras
completas antes de limitar a tres. Los datos conocidos sobreviven a un fallo opcional;
completarlos mueve la obra al listado principal en la siguiente consulta. Lo que esperas
conserva las elecciones personales. Título y portada abren catálogo cuando existe y,
en caso contrario, el detalle público del anuncio sin crear catálogo ni pases (#1449).
Verificación y seguimiento de publicación/enriquecimiento: `docs/testing/2026-10-07-novedades-quality.md`.
El rediseño visual acordado se sigue por separado en #1450.

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
  #737 conserva el borrador ante un pase
  sustituido y pregunta si se continúa el pase original o se reinicia en uno
  nuevo; en el segundo caso vuelve a la ficha sin mostrar un 404 transitorio.
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
  de colocación («léelo antes de X»), tándems (intercalado por hueco). Una ventana
  dentro de bloque mantiene visualmente el tramo posterior como continuación del
  mismo grupo, con idéntico acento y la marca «(cont.)» (#696).
- **Mapa de universo** (`/saga/[id]/mapa`): grafo DERIVADO (React Flow) con
  timeline móvil separada; seguir sagas (`saga_follows`).
- **Curación** por colaboradores: editor de secuencia, sync TMDB acotado por RPC.

## Social

- **Perfiles** (`/u/[username]`): públicos por defecto (modelo Instagram),
  privados con solicitud; pestañas propias Actividad / Experiencias y Biblioteca
  adicional para visitantes; pins.
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
- **Moderación**: bloqueos bidireccionales (`user_blocks`) y reportes
  (`content_reports`). Ampliación #1183: BD aplicada y verificada en dev y producción
  el 2026-09-15; aplicación pendiente de despliegue desde la PR #1184:
  `/admin/reportes`, `/admin/contenido`, `/admin/clubes` y `/admin/historial`,
  con retirada/restauración/borrado definitivo y evidencia administrativa.
  El audio de esta versión se entrega por rutas con autorización por petición;
  sustituye las URLs firmadas descritas arriba.
- **Notificaciones**: in-app (`notifications`, campana) + push unificado Web
  (VAPID) y Android (FCM) con preferencias opt-out por canal×categoría;
  planificador `pg_cron`+`pg_net` (recordatorios de eventos).
- **Notas en el margen** (#1380; esquema en dev y producción desde el 2026-10-05; código en la PR): una nota anclada a un
  punto de una obra (página/proporción en libros, episodio en series, «al terminar» en películas)
  que se abre a quien te sigue cuando llega a ese punto, o al instante si ya lo había pasado. Para
  seguidores o dedicada a una persona; hilo privado por lector en `/margen/[id]` con comentarios y
  reacciones; la sección de la ficha y la revelación viven en «Mi registro» (`?tab=log`); el Cuaderno
  (`/notas`) filtra con `margen=encontradas|mias`. Solo las dedicadas avisan (push `social`).
  Se puede denunciar desde el hilo; las acciones de admin sobre ella están pendientes (#1384).
- **Celebraciones** (`user_celebrations`) con animación. El protocolo #1334 separa ganar→reservar→mostrar→confirmar para recuperar entregas canceladas; esquema activo en dev y producción, verificado el 2026-10-04 a las 20:16:22 UTC, con legacy compatible de cero filas. La entrega del consumidor y sus controles se siguen en PR #1364; el corte de esquema y G4 local no acreditan presentación remota.

## Clubes

- **Clubes** (`/comunidad`, enlace antiguo `/clubes`, `/club/[slug]`): visibilidad pública/privada con
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

## Mascota — interfaz RPG (código verificado el 2026-09-09; entrega contrastada el 2026-10-03)

`/mascota` reúne Campamento, Personaje, Diario, Madriguera y Combate con
escenarios de bosque pixel y un tema verde común a claro y oscuro. El retorno
«Biblioshare» conserva la última ubicación de la app. Entrenamiento y aventuras
se pausan al salir y recuperan su intento guardado en el dispositivo. Personaje
lleva atributos y equipo —compara copias y permite equiparlas—; Diario conserva
todas las misiones y logros. El campamento cabe en la ventana, sin scroll.
Publicada el 2026-09-09 mediante [PR #1146](https://github.com/borjar20/Biblioshare/pull/1146).
La aceptación de uso real (#1165) y la jugable de R4b (#1123) siguen pendientes.
Contrato y evidencia en `superpowers/specs/2026-09-09-mascota-rpg-ui-design.md`.

## Lo que NO existe (para no buscarlo)

Etiquetas privadas, modo «en pausa», método de adquisición del ejemplar, diario
emocional, OCR de citas, recomendador, tabla de adaptaciones/relaciones entre
obras, listas colaborativas, seguir editoriales, retos personalizables, comparar
bibliotecas, offline-first con escritura, IGDB
(videojuegos), app iOS. Estado y prioridades: `docs/requirements/backlog.md`.

## Crónicas visuales — activas en producción 2026-10-07

Última semana, mes y año en `/wrap/[kind]`, aviso/entrada en Inicio y fila en Estadísticas. Stories adaptativas, narradora pixel, imagen1080×1920 y resumen publicable en el feed bajo privacidad del perfil. Código, navegador, esquema y primer barrido productivo verificados; integradas en [PR #1436](https://github.com/borjar20/Biblioshare/pull/1436), con activación cerrada en [#1433](https://github.com/borjar20/Biblioshare/issues/1433). [Spec](superpowers/specs/2026-10-06-wrap-ups-design.md) y [evidencia](testing/2026-10-06-wrap-ups.md).
