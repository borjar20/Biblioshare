# Decisiones vigentes — Biblioshare

> **[Canónico · consolidado el 2026-08-19 · append-only a partir de aquí]**
> El log histórico completo — cada entrada fechada con su porqué extenso, las cadenas de reemplazo y las
> decisiones derogadas — está congelado en `docs/superpowers/decisiones-historicas-2026-08.md`. Este doc
> contiene solo las decisiones VIGENTES que condicionan el desarrollo; las nuevas se siguen añadiendo
> **al final, con fecha**, sin reescribir las anteriores.

## Modelo de datos y catálogo

- **Catálogo compartido, progreso privado** (2026-07-07). Los metadatos son de todos; el estado y el
  progreso, de cada usuario. Evita duplicar catálogo.
- **Metadata por tipo + columna vertebral polimórfica** (2026-07-07). `books`/`movies`/`series` separadas;
  progreso unificado con `position` jsonb: añadir un tipo no obliga a replicar tabla + RLS + query + UI.
- **Tres capas Obra → Ejemplar (edición) → Pase** (8-C; §7.37, 2026-07-14). El pase (`passes`) es el único
  dueño de nota y reseña y fija su edición (`book_editions`/`movie_versions`); `library_entries` queda
  CONGELADA (`rating`/`.notes` huérfanas); la comunidad agrega desde el último pase cerrado no abandonado.
- **Relecturas = pases** (2026-07-07). Un re-visionado crea otro pase; `finished_on` nullable = pase abierto.
- **`paused` será estado explícito del enum, no inferido** (8-A, pendiente): nada de heurísticas de
  inactividad; el sistema sugiere, el usuario decide.
- **Relaciones entre tipos distintos → tabla genérica futura** (8-B): `item_a`/`item_b`/`relation_type`
  (enum abierto), curación manual con cola. La *misma saga* NO va ahí: vive en `sagas`/`saga_items`.
- **`people`/`credits` polimórficos + tabla `sagas` dedicada** (2026-07-09), con enriquecimiento perezoso
  cache-as-you-go.
- **Normalización de géneros: enfoque A** (2026-07-30). Vocabulario canónico en código (`genre-vocab.ts`);
  se guarda la label, no el slug; TMDB mapea por id. Navegación `/genero/[slug]` con índice GIN.
- **La identidad de un autor es su clave de Open Library, no su nombre** (2026-08-13). La clave sale de la
  obra; grafías no latinas a `aliases`; sin obra resoluble no se escribe crédito.
- **Prohibido borrar obra con pases y reapuntar comentarios** (triggers, 2026-08-04): `passes` es
  polimórfico sin FK y cascadear destruiría datos de usuario; el target de un comentario solo se copia al
  INSERT y no hay sync en UPDATE.
- **`posts` = capa social canónica, tabla FINA 1:1 con su `interaction_target`** (2026-08-09), e
  **`interaction_targets` como registro canónico de toda interacción** (2026-08-02): FK reales con cascade,
  `href`/audiencia/capacidades resueltos una vez. `diary_entry` y `pass` siguen siendo targets DISTINTOS.

## Roles, RLS y seguridad

- **RBAC en capa de app + `role` blindado en BD** (8-H). RLS permisiva en catálogo compartido; gateo de
  colaborador en server actions + UI; `profiles.role` con trigger anti-escalada y RLS de admin.
- **Perfiles públicos por defecto y legibles por anónimos** (2026-07-07); el privado es un stub de
  identidad con «Solicitar seguir», no un 404 (2026-07-11).
- **`can_view_profile` (SECURITY DEFINER) es el eje único de visibilidad** (2026-07-11): «público, propio o
  seguidor aceptado», encapsulado una vez; `can_view_target` delega en él.
- **Transiciones de rol de club SOLO por RPC SECURITY DEFINER** (2026-07-12), nunca `UPDATE`s de cliente.
- **El gate de rol/permiso va PRIMERO en toda RPC SECURITY DEFINER** (2026-08-06, #129/#278): comprobar
  existencia antes del permiso es un oráculo sobre lo que la RLS de SELECT protege → `forbidden` genérico.
- **Bloqueos bidireccionales; writer de notificaciones con `service_role`; reportes con snapshot**
  (2026-07-30). Bloquear borra follows/avisos y desbloquear no restaura; el cliente no inserta
  notificaciones; `content_reports` deriva snapshot en servidor y sobrevive al borrado del target.
- **Portadas oficiales por allowlist de hosts** (2026-08-02): `https:` + host ∈ {image.tmdb.org,
  covers.openlibrary.org} ANTES de tocar BD — la URL llega del cliente y es manipulable.
- **Errores de dominio como resultado `{ok:false, reason}`, nunca throw** (2026-08-03): Next redacta los
  mensajes de `Error` de server actions en producción.
- **Fijar comentarios = solo el dueño del target, vía RPC `pin_comment`** (2026-08-07); moderar (borrar)
  sigue siendo de admin/moderador.
- **Menciones `@usuario`: texto crudo sin tabla sidecar, gate de entregabilidad en capa de app**
  (2026-07-30). Editar no re-notifica — salvo menciones NUEVAS, por diff (2026-08-14, #317).

## Caché y reactividad

- **Regla #437: solo se cachea lo idéntico para TODO el mundo** (2026-08-05). Un `use cache` sobre RLS es
  fuga entre cuentas, invisible en dev. Cliente SIN sesión (`createPublicClient`) + args escalares.
  Aplicación canónica: `getRatingSummary` — media de perfiles públicos, sin el voto del que mira.
- **Cache Components activado** (2026-08-05) — condiciona todo build: valores inestables rompen el
  prerender, `instant=false` en rutas, y `cookies()`/`headers()` bajo `use cache` pasa `next build` y
  revienta en `next start` → e2e contra build de producción.
- **Toda server action nombra explícitamente en `revalidatePath` la ruta que el usuario tiene delante**
  (2026-07-29): lo global solo cubre el refresco diferido al re-navegar.
- **La sesión y el perfil propio se leen UNA vez por petición** (patrón DAL, 2026-07-29/2026-08-05):
  `getCurrentUser`/`getOwnProfile` con `cache()` por `userId` — memoizar por el cliente no deduplica.
- **Todo fallback de `<Suspense>` por encima de contenido reserva su alto** (2026-07-29): `fallback={null}`
  prohibido ahí (CLS 0,47 medido); el skeleton copia la ESTRUCTURA real.
- **Fichas de catálogo: 404 blando (200 + `not-found`) a cambio de shell estático** (2026-08-05). Trampa
  #514: toda ruta gateada por sesión/BD da 200 bajo PPR — verificar por CONTENIDO, no por status.

## Sagas

- **El progreso es PERTENENCIA, no orden; `placement` y `optional` son ejes ortogonales** (2026-07-25, la
  más citada). Denominador = obras no `optional` del subárbol (`progress.ts`); `main-order.ts` solo ordena.
- **El mapa es una VISTA derivada de la curación, nunca tabla editable** (2026-07-27): una segunda fuente
  de verdad es deriva futura por construcción.
- **Ventanas: máximo UNA por entrada y DOS anclas (`after`/`before`); la ventana pertenece a la OBRA** y
  vive bajo la saga dueña de la membresía, con baja explícita por sujetos (2026-07-27/28).
- **«Antes de» manda** al colocar un sujeto libre (regla única, `place-by-window.ts`, 2026-07-28); **un
  ancla rota se olvida**, no se conserva marcada (2026-07-27, decisión de producto).
- **La curación manual gana sobre el sync de TMDB** (2026-07-26): `sync_tmdb_saga_items` hace `DO NOTHING`
  sobre filas existentes.
- **La hidratación TMDB de `saga_items` va por RPC SECURITY DEFINER acotada** (#169, 2026-07-22); el
  INSERT directo queda cerrado a collaborator+, sin usar `service_role` para lo que dispara un lector.
- **Los itinerarios `lectura`/`publicacion` se SINTETIZAN en código; slugs reservados por CHECK**
  (2026-07-22). `renameRoute` nunca toca el slug (URLs y adopciones viven por slug).
- **Los metadatos de un tándem viven por HUECO** (`saga_tandems`, PK `(saga_id, position)`, 2026-07-28);
  la pertenencia es el empate de `position`, única fuente de verdad.
- **El rol narrativo vive en `saga_items.role`** (2026-07-23): puramente semántico, no toca el denominador;
  vocabulario en UNA lista (`roles.ts`) atada por test al enum.
- **`assignItemToSaga` no escribe `position`** (#188, 2026-07-26): el hueco es competencia exclusiva del
  editor de secuencia — se eliminó el segundo escritor.
- **Tercer valor `anclado` en `saga_placement`** (2026-08-15): colocación relativa OBLIGATORIA (exige
  ventana), distinta de `libre`; comparten `esColocable`. Migración en dev; **prod pendiente**.
- **Una columna nueva de una tabla que ya viaja en un payload `jsonb` nunca justifica un argumento nuevo
  del RPC** (2026-07-28, `motivo` en `p_windows`): evita el baile de sobrecargas.

## Clubes y actividades

- **Motor genérico de actividades (SD-8)** (2026-07-13): un tipo nuevo = valor de `activity_kind` +
  `config` jsonb; transiciones por RPC SECURITY DEFINER sin policy UPDATE; opiniones solo-participantes
  a nivel de RLS.
- **`club_rounds` es tabla propia — excepción REGISTRADA a SD-8** (2026-08-03): una ronda no se propone,
  no tiene ciclo de vida ni opt-in y es recurrente (52/año) — como `kind` inundaría lista y calendario.
- **Semana y turno se calculan en SQL, en `Europe/Madrid`; el cliente nunca envía el periodo** (2026-08-03).
- **Eventos: discriminador `event_type` + `config` jsonb opaco por subtipo** (2026-08-09) — ni columnas por
  campo (#375: un grant olvidado rompe la escritura entera) ni tablas satélite. «Todo el día» vive en
  `config.allDay`, no se deriva de medianoche.
- **«En curso»/«finalizado» se DERIVAN del reloj, no se guardan** (2026-08-04): solo se persiste lo
  declarado (`programado|cancelado|pospuesto`); `deriveEventState` se calcula una vez en servidor.
- **Recordatorios: campo en la fila de seguimiento recalculado por triggers; el barrido reclama atómico**
  (`update … returning skip locked`) con compensación (2026-08-04). Se apagan cuando el evento EMPIEZA.
- **Encuentro conserva hora OPCIONAL con default 19:00 `Europe/Madrid`** (2026-08-09, decisión del dueño).
  OJO: el delta de cabecera de `data-model.md` decía lo contrario y estaba MAL — manda esta entrada.
- **El creador que no modera pierde el control de la cabecera al activarse la actividad** (2026-08-12);
  mientras es `proposed` sigue siendo suya: lo activo es un compromiso del club y lo arbitra la moderación.
- **`activity_share` guarda referencia VIVA (`{sourceTable, rowId}`), no snapshot** (2026-07-13), con
  degradación elegante. Compartir a un club anula la privacidad de perfil para los compañeros de ESE club.
- **Los hitos de lectura conjunta son AUTODECLARADOS** (2026-08-05): sin comparación de páginas (cada
  edición pagina distinto); la página es pista opcional. Desmarcar el N arrastra N..último: el progreso es
  siempre un tramo continuo (2026-08-13).

## Social y notificaciones

- **El feed de Inicio lee `posts`, ordena por fecha de PUBLICACIÓN (`posts.created_at`) y el cursor es un
  keyset trivial `(created_at, id)`** (2026-08-09). Deroga TODA la maquinaria de orden multi-fuente
  anterior. Cada post es una tarjeta; añadir a biblioteca no publica (el import no inunda); la visibilidad
  de un post es la del perfil.
- **Los avisos de seguidores nacen de `createPost`** (§5.3, 2026-08-13): el aviso nace CON el post, lleva
  su `interaction_target` sin fallback a la ficha; se acepta no avisar de lo no publicado.
- **`notifications` es la fuente de verdad in-app** (2026-07-11); el push es transporte secundario
  best-effort sobre esa tabla (dispatcher unificado, `push_devices`, opt-out, 2026-08-05). `actor_id` es
  nullable: un aviso del sistema no tiene actor (2026-08-04).
- **`notifyMany` es idempotente con `dedupe_key`** (`${clave}:${userId}`, upsert `ignoreDuplicates`,
  2026-08-06): un fan-out repetido no reinserta ni re-empuja.
- **Los hitos se publican en la server action de la FICHA, nunca dentro de `applyTransition`** (2026-08-09):
  la transición corre también en import/quick-add. Idempotencia por índice único
  `posts(source_kind, source_id, kind)`; preferencias opt-out en `post_preferences`.
- **La nota privada nunca sale** (2026-07-21/30): `progress_sessions.note` no se sirve; solo viaja la fila
  de `notes` con `is_public = true`. El test mira el HTML con payload RSC, no lo pintado.
- **Reacciones multi-emoji app-wide** (2026-08-07): `ReactionBar` en todo target reaccionable, agregación
  por `kind` — nunca dos sistemas de reacción en el mismo hilo.

## Nativo (Capacitor/Android)

- **Capacitor como wrapper** (8-F, 2026-07-08): shell delgado con `server.url`; se abandonó PWA-only
  porque Web Push no cubre iOS+UE (DMA).
- **Arquitectura híbrida** (2026-08-06): lo que corre con la app cerrada habla con Supabase DIRECTAMENTE
  desde nativo; la lógica compartida vive en Postgres (RPC + RLS), nunca duplicada en Kotlin. Sesión
  nativa independiente por magic-link (compartir el refresh token del WebView revoca la familia entera).
- **Widgets por PULL: RPC `get_widget_snapshot` + WorkManager periódico** (2026-08-06) — deroga el empuje
  desde el WebView, cuyo andamiaje se borró. El «hoy» del widget es `Europe/Madrid`.
- **El repintado del widget en background va por `compose()` + `updateAppWidget` directo** (2026-08-06):
  `update()/updateAll()` de Glance encolan workers que One UI difiere con la app cerrada.
- **La sesión de lectura nativa usa un foreground service `specialUse`** (2026-08-08); «Terminar» reusa el
  handoff `/sesion/:passId` → `addSession`, nunca una escritura nativa que duplique medio backend.
- **El gesto «atrás» es un callback nativo mínimo en `MainActivity`** (`webView.canGoBack()`, 2026-08-09),
  sin `@capacitor/app`: el historial del WebView ya incluye las entradas de `pushState`.
- **La keystore de release vive FUERA del repo** (2026-07-29); sin `keystore.properties` el build DEGRADA
  a APK sin firmar en vez de romper.

## UI estructural

- **`layout.ts`: cuatro anchos + UN raíl (340 px); el ancho y la escalera de columnas se deciden SIEMPRE
  juntos** (2026-08-03) — las breakpoints miran el viewport, no el contenedor. Las tres subpestañas de Mi
  Biblioteca comparten `SHELL_GRID` (2026-08-14).
- **Un solo DOM responsive** (2026-07-21): nunca duplicar controles por breakpoint (rompe locators e2e);
  `ActivityLayout` de tres ranuras — orden del DOM = orden móvil, un grid recoloca en `lg`.
- **Todo `<dialog>` condiciona su `display` de autor a `[open]`** (2026-07-22). `<dialog>` nativo +
  `showModal()` es el patrón de capas del repo (Escape, foco e `inert` gratis).
- **El modal de registrar sesión va por ruta interceptada `@modal`** (2026-07-20) con salida
  `replace(exitHref)` gobernada por pathname, sin depender del historial (2026-08-05). Patrón a reutilizar
  en cualquier hoja con varios puntos de entrada.
- **Consistencia visual por capas CSS** (2026-08-04): titulares serif en `@layer base`, foco global
  `:focus-visible` sin capa (gana a los `outline-none`), radios de Tailwind reapuntados a la escala Paper
  en `@theme` en vez de tocar 270 llamadas.
- **La paleta de tipos NO se repinta pese a fallar daltonismo** (2026-08-04): son identidad; lo que se
  garantiza es que el color nunca sea el único canal (glifos de forma, desglose en tabla).
- **RatingDots se tiñe con el color del TIPO de obra** (2026-08-09, deroga el «oro fijo»); `formatDots` es
  el único módulo que convierte 1–10 → 5 estrellas (medios puntos).
- **Los tokens de evento llevan test de contraste** (2026-08-11): dos umbrales (3:1 gráfico, 4.5:1 texto
  sobre tinte) sobre los TRES bloques de tema; exclusiones con nombre e issue, nunca en silencio.
- **`null` = sin datos ≠ `0` = cero medido en todos los paneles** (2026-08-04): un mes futuro es `null`,
  no entra en totales ni medias; «vacío» se DERIVA, nunca se declara.
- **La HOME se compone en TRES áreas responsive** (personal · feed · stats) con `grid-template-areas`
  (2026-08-10); `/post/[id]` sigue el patrón (OBRA · CONVERSACIÓN · SOCIAL).
- **i18n desde el inicio** (2026-07-07); **los mensajes de cliente viajan POR RUTA con `<RouteMessages>`**
  (#444, 2026-08-05): los providers anidados REEMPLAZAN, no mergean — cada ruta declara BASE + los suyos,
  y el subconjunto se MIDE con script.
- **Reglas de tiempo** (2026-08-06): el «hoy» pintado es el del SERVIDOR (viaja como prop); fechas
  relativas con `<TimeAgo>` autorefrescante anclando date-only a medianoche LOCAL; `session_date` rechaza
  el futuro.
- **Imágenes: loader custom `cdn-loader.ts`** (2026-07-22) — pide el tamaño al CDN de origen y SOLO baja,
  nunca sube; sin optimizador de Vercel (cuota Hobby agotada).

## Datos y despliegue

- **Dev primero, prod después; verificar contra los objetos reales (`pg_proc`/`pg_class`), nunca contra
  `list_migrations`** (desde 2026-07-21). Los cuerpos se comparan NORMALIZADOS (sin comentarios, espacios
  colapsados).
- **Migración antes del merge, `drop` el último, despliegue en medio — SALVO backfills que PROMUEVEN datos
  que el código viejo lee: ahí el código va ANTES** (2026-08-09). «Migración primero» solo vale para
  adiciones inertes.
- **Un e2e que escribe siembra y limpia su precondición por REST, antes y después** (2026-07-29); de un
  dato externo se comprueba la FORMA, nunca el valor.
- **Los seeds SQL son idempotentes por CLAVE NATURAL, no por id** (2026-08-06): las filas ya sembradas en
  otro entorno tienen otro id.
- **Backfills: AÑADIR es seguro, QUITAR exige certeza** (2026-08-13): borrar solo con conjunto no vacío +
  resolución completa (un timeout no es un descarte) + dato verificado; el dry-run previsualiza las altas.
- **`pg_temp` en el `search_path` de todo SECURITY DEFINER, por BARRIDO auto-verificado sobre `pg_proc`**
  (#130, 2026-07-29), nunca lista a mano. OJO: el barrido quedó desatendido — la auditoría 2026-08
  encontró 15 funciones nuevas sin él.
- **El planificador es `pg_cron` + `pg_net` → ruta de la app con secreto** (2026-08-04): minutos de
  granularidad en plan gratuito, reutiliza las notificaciones; Vercel Cron (Hobby: 1/día) descartado.
- **`planned_on`/`started_on` son hitos forward-only; NO hay tabla `pass_events`** (2026-08-03, YAGNI —
  tampoco reconstruiría el pasado). El historial importado nace con esos hitos a NULL.
- **Importar queda en dos fuentes CSV (Goodreads, Letterboxd)** (2026-07-20). El matcher compara los tres
  títulos (es/original/inglés) y **los empates los rompe el usuario** (`ambiguous` con candidatos), nunca
  el primer candidato a ciegas (2026-08-03).

## Producto

- **Onboarding en 3 pasos** (intereses → títulos/importar → gente) con gate `onboarded_at` (2026-07-20):
  «tiene perfil» ≠ «está onboardeado»; los intereses se persisten Y se consumen.
- **Offline = caché de solo lectura**, no offline-first (2026-07-07).
- **Películas: Pendiente/Vista manuales (2026-07-30) + `dropped`** (2026-08-14, sin reabrir «En curso»).
  **`in_progress` es estado de SISTEMA («Para ver») que escribe el sorteo** (2026-08-12); «Marcar Vista»
  encadena la hoja de puntuar en la ficha.
- **El motivo de abandono es siempre privado** (2026-08-14): enmascarado DENTRO de la vista
  (`case when user_id = auth.uid()`), sin grant — la RLS de `passes` es visibilidad de perfil, no de dueño.
- **Spoiler-safe será una utilidad compartida, no cuatro implementaciones** (8-E, pendiente): la primera
  feature que lo necesite lo construye genérico; primer consumidor previsto, el chat por checkpoint.
- **Las vistas de identidad son legibles por anónimos = modelo Instagram** (2026-07-11): perfil privado
  como stub con «Solicitar seguir». Decisión de producto **a reconfirmar** (auditoría 2026-08, S2-18).

---

## 2026-08-19 — Consolidación documental (auditoría 2026-08)

Se decide mantener la estructura documental existente en español (README como índice
de gobernanza) en lugar de la propuesta genérica PROJECT/ARCHITECTURE/…: renombrar
rompía decenas de referencias cruzadas sin ganar nada. Nuevos canónicos: docs/PROYECTO.md
(qué existe), docs/SEGURIDAD.md (modelo de permisos y excepciones), docs/UI-GUIA.md
(patrones de UI derivados de las fases 3-4 de la auditoría). decisiones.md se consolida
a decisiones vigentes (este fichero); el log completo queda congelado en
docs/superpowers/decisiones-historicas-2026-08.md. backlog.md pasa a contener solo
trabajo pendiente: el backlog operativo son las issues (regla de AGENTS.md).

---

## 2026-08-19 — Cierre de los P0 de seguridad: dos correcciones al diagnóstico de la auditoría

Al cerrar los P0 #689/#690 (auditoría 2026-08) se descubrió que **los dos fixes que
proponían los issues eran erróneos para este esquema**. Se registran aquí porque el
diagnóstico equivocado sobrevive en el repo y manda al siguiente en dirección contraria.

**1. `pass_reviews` NO lleva `security_invoker`, y no es un descuido.** El issue #690 pedía
`alter view ... set (security_invoker = true)`. Rompe la app: `passes` no concede `SELECT`
sobre `review`/`dropped_reason`/`dropped_reason_note` a NADIE, y la vista existe justo para
ser la única lectura enmascarada de esas columnas. Con `security_invoker` la vista lee con
los privilegios del que consulta y da «permission denied for table passes» (comprobado en
dev). Hacerla funcionar exigiría conceder `SELECT` sobre `review`, o sea exponer por REST lo
que la vista oculta. **La barrera correcta es que la vista sea de SOLO LECTURA**: lo que
abría el P0 no era la semántica de definer sino los grants de escritura que Supabase concede
por defecto a toda relación nueva (#691). Queda como excepción con nombre en `SEGURIDAD.md`
y como superficie 7 de `DRIFT-CHECK.md`, porque cada `drop view`+`create view` los restaura.

**2. En `profiles` el segundo cinturón es un TRIGGER, no un grant por columna.** El issue
#689 pedía `revoke insert (role) on public.profiles from authenticated`. Sobre esta tabla es
un no-op silencioso: `profiles` tiene grants de TABLA, y en PostgreSQL revocar un privilegio
de columna no revoca el de tabla que lo cubre. Convertirla a grants finos es justo la maniobra
que ya tumbó producción dos veces (regla #375). Se añade en su lugar
`enforce_role_insert_user_only` (BEFORE INSERT), hermano del `enforce_role_change_admin_only`
que ya existía para UPDATE: cubre todo camino de escritura, no depende de la policy y no
puede romper la escritura de otras columnas.

**Regla operativa que deja esto:** una migración aplicada a las bases sin fichero en el repo
es deuda que se cobra sola. Las dos que cerraban estos P0 (`20260861`, `20260862`) llevaban
cinco días vivas en dev y prod sin fichero; sin la auditoría, la primera recreación de la
vista habría reabierto el P0 sin que nada chillara.

---

## 2026-08-18/19 — Catálogo server-authoritative (#674): shell por RPC, hidratación fill-only y flag `app.hydrating`

Cierra el envenenamiento del catálogo global: `authenticated` podía insertar `movies`/`series`/
`books` directo con cualquier `title`/`synopsis`/`director` — dato COMPARTIDO, visible por
cualquier usuario y por anónimos en obras públicas. El modelo pasa a dos pasos: **alta**
(`register_catalog_item`/`register_catalog_items_bulk`, `SECURITY DEFINER`, shell con SOLO el
id externo) e **hidratación** (`hydrate_movie`/`hydrate_series`/`hydrate_screens_bulk`,
hermanas de `hydrate_book`, disparadas en `after()` al abrir la ficha, re-obteniendo los
canónicos del proveedor por id), con el INSERT directo revocado al final. Detalle de esquema
en `data-model.md` §2.1.

Siete desviaciones/hallazgos frente al spec original, verificadas contra la base real y no
contra el spec en abstracto:

1. **`title` pasa a NULLABLE** en las tres tablas. El spec decía "canónicos NULL" pero `title`
   era `NOT NULL`: una shell vacía lo habría violado.
2. **Sin `created_by`.** El spec lo pedía en la shell; esa columna no existe en
   `movies`/`series`/`books` y no aporta a cerrar #674 — la garantía es que la shell tiene el
   id externo correcto, no quién la creó. Si hiciera falta auditoría, es otra feature.
3. **Revocar el INSERT es `drop policy` + `revoke insert` de tabla**, no un ajuste de grants
   por columna: el INSERT no colgaba de grants finos (a diferencia del UPDATE, superficie 6 de
   DRIFT-CHECK), solo de las tres policies `with check(true)` y del privilegio de tabla.
4. **Fetchers de hidratación dedicados** (`getMovieForHydration`/`getSeriesForHydration`) en
   vez de reutilizar `getMovieAsSearchResult`, que no trae `director`/`duration_minutes` y no
   tenía equivalente para series. Una sola llamada con `append_to_response=credits`.
5. **La más importante: hidratación FILL-ONLY pura, NO "autoritativa-si-no-hidratada"** (§3c
   del spec). Con alta = shell vacía por RPC + INSERT revocado, **nunca existe un valor
   envenenado que la primera hidratación tenga que pisar**, y el trigger de curación impediría
   de todos modos que una hidratación de rol `user` pisara un valor ya curado. La rama
   "autoritativa" habría sido código muerto que además abría una ventana rara.
6. **Bug preexistente destapado y arreglado ([#699](https://github.com/borjar20/Biblioshare/issues/699)):**
   `enforce_catalog_edit_collaborator_only` dispara también en `null → valor` y evalúa el rol
   de quien invoca — que en `hydrate_book` es el visitante. Consecuencia: **toda hidratación
   automática de libros llevaba bloqueada en producción para el rol `user`** (la mayoría) desde
   que existe `hydrate_book`, y no se detectó porque en dev se prueba con cuentas admin.
   Arreglo: flag transaction-scoped `app.hydrating` que solo activan las RPC definer.
7. **Efecto colateral de regenerar tipos desde dev, ajeno a #674**: los argumentos RPC de
   club-events perdieron `| null` en su firma generada (codegen over-strict sobre parámetros
   opcionales), parcheados con casts type-only sin tocar el runtime. Registrado como
   [#701](https://github.com/borjar20/Biblioshare/issues/701) para no perder por qué existen.

**Decisión de despliegue (2026-08-19), que es la parte que no se puede improvisar:** las
migraciones NO van todas juntas con el merge. `a`…`e` son aditivas y el código viejo funciona
con ellas, así que se aplican a prod ANTES; `f` —la revocación del INSERT— se aplica DESPUÉS
de que el deploy del código nuevo esté en verde. Al revés deja una ventana en la que
producción no puede dar de alta ninguna obra: el código desplegado inserta directo y el
privilegio ya no está. Es el mismo razonamiento que en `20260856`/`20260857` (avisos de
seguimiento, 2026-08-13) y en `20260858` (motivo de abandono): la migración va delante o
detrás del deploy según qué dirección se autocure, nunca "a la vez" por comodidad.

**Nota de integración:** la rama salió antes de que `main` absorbiera la auditoría 2026-08. Al
fusionar se aceptó el borrado de `recent-reviews.ts` y de `resolveWorks`/`getPerson` (código
muerto verificado por la auditoría, sin llamadores) que la rama solo tocaba para tolerar
`title` NULL.

## 2026-08-19 — Barrida de los P1 abiertos: cuatro decisiones que no son obvias

Cerrados en una pasada #691, #678, #676, #675, #654, #643, #609, #584, #582 y #514. La mayoría
son mecánicos; estas cuatro no, y por eso se registran.

1. **Cuando el hecho a validar vive FUERA de la base, la validación no puede vivir dentro
   (#675).** La tentación era añadir a `link_tmdb_saga_item` una comprobación de que la película
   pertenece a la colección. No se puede: esa pertenencia solo la conoce TMDB, y cualquier
   columna que la guardara la rellenaría el mismo camino fill-only llamable por el cliente que
   se quiere validar — el atacante se adelanta, escribe la pertenencia falsa y la comprobación
   le da la razón. La única salida es que la llamada la haga quien SÍ habló con TMDB: el
   servidor, con `service_role`. Se acepta a sabiendas que esto ensancha el uso de
   `service_role` más allá de lo que decía el comentario de `service-role.ts` («nada que un
   usuario autenticado pueda pedir directamente»): el criterio real no es *quién dispara* la
   operación, es *de dónde salen sus argumentos*.
2. **Contra un fan-out controlable por el usuario, la capa que importa es la del llamador
   (#676).** Se pusieron cuatro (revoke del grant, CHECK de rango, concurrencia acotada, techo
   de temporadas), pero la que de verdad cierra el agujero es la quinta: **dejar de creerse la
   columna compartida y preguntarle a TMDB cuántas temporadas hay**. Las otras acotan el daño;
   esta le quita al usuario el mando. El coste —una llamada más, cacheada 24 h, solo en la
   primera visita— es ruido frente a eso.
3. **`credits` se cascadea; `passes` se bloquea (#609).** Mismo problema (referencia polimórfica
   sin FK), decisión opuesta a propósito. El discriminante no es la tabla: es **si la fila
   contiene algo del usuario que no se pueda reconstruir**. Un pase guarda nota, reseña y
   fechas; un crédito es un hecho del proveedor que se rehidrata solo. Queda escrito porque las
   otras once tablas polimórficas (#708) hay que decidirlas una a una con este mismo criterio,
   y la tentación será copiar la última que se hizo.
4. **El 200 de PPR en `notFound()` NO se arregla: se documenta (#514).** Se midió contra un
   build de producción y el cuerpo servido es el del 404 (sin título del evento, sin heading,
   `<title>` genérico, con `noindex`): no hay fuga, la hipótesis P0 queda descartada. Y el
   status es **comportamiento documentado de Cache Components** — «the response has already
   begun streaming as a 200, and the status can't change once streaming has started […] run
   that check in `proxy` instead» (doc de `not-found` en `node_modules/next/dist/docs`).
   Llevarlo a `proxy` costaría un viaje a la base en CADA petición de la ruta para ganar un
   código de estado que ya está mitigado por el `noindex`. **No se hace.** De paso, dos
   diagnósticos de la issue quedan corregidos: `instant = false` nunca fue un opt-out de PPR
   (es validación de navegación), y `dynamic = 'force-dynamic'` tampoco lo sería («Not needed.
   All pages are dynamic by default»).

**Y una que se decidió NO hacer:** el `database.types.ts` de `main` ya está sincronizado con dev
(#654). Se comprobó regenerando desde dev y comparando byte a byte: idéntico, y `next build`
sale en verde. El drift que describía la issue lo cerró #674 al arreglar `core.ts` y
`event-follow-actions.ts`; el diagnóstico «hay que auditar el drift acumulado» ya no aplica.

---

## 2026-08-20 — Barrida de las acciones 3-5 del roadmap: seis decisiones que no son obvias

Ejecución de las acciones 3 (importador), 4 (serie) y 5 (triviales de móvil) del roadmap P1 de
`docs/audit/AUDIT-2026-08.md`, más el barrido de `pg_temp` de la acción 2.

1. **Un `completed` importado sin fecha se cierra con la fecha de IMPORTACIÓN, no se degrada a
   `planned` (#714).** Un CSV de Goodreads con *Exclusive Shelf = read* y *Date Read* vacía traía
   un pase cerrado sin `finished_on`, que la app entera —que define «pase abierto» como
   `finished_on IS NULL`— leía como lectura en curso. Había que elegir qué dato sacrificar: el
   estado que el usuario afirmó («lo leí») o el día exacto, que no consta en ninguna parte.
   **Manda el estado.** La fecha inventada NO entra en el diario como relectura: `diaryDates`
   sigue conteniendo solo fechas reales del CSV, y el relleno solo cierra el pase activo.

2. **El panel de comunidad de una serie mezcla las dos fuentes de reseña, y el discriminante deja
   de ser la presencia del prop (#713).** Antes elegía rama con `episodeReviews !== undefined`, y
   como la ficha pasaba siempre el array —aunque viniera vacío— la rama de reseñas de pase era
   código muerto: lo que el usuario escribía al cerrar el pase de una serie se guardaba y no
   aparecía nunca. Se normalizan ambas listas a la misma forma y se ordenan por fecha; el chip
   («S3E2 · título» vs. etiqueta de edición) es lo que las distingue a la vista. La lección que
   se queda: **usar `undefined` como discriminante de rama convierte cualquier `?? []` de más en
   una desaparición silenciosa de datos.**

3. **El progreso de serie en tarjetas cuenta `episode_watches`, no `position.episode` (#715).**
   La posición va numerada POR TEMPORADA y `totalEpisodes` es de la serie entera, así que T3E2 de
   una serie de 60 salía como «2/60». Se añade `watchedEpisodes` a `LibraryItem`, batched en una
   consulta por lote. **No se cambia `position` a numeración absoluta**, que era la solución
   aparentemente obvia: esa posición la escriben y leen el auto-cierre, el reanudar y las
   sesiones, y la numeración por temporada es la que enseña la pestaña de episodios.

4. **El auto-cierre exige delta positivo Y pase abierto (#716).** `reachedEnd` solo dice «el
   episodio más avanzado de este pase es el último del catálogo», y eso **sigue siendo cierto
   después de cerrar**: por eso desmarcar un episodio intermedio, o puntuar el final ya visto,
   volvía a disparar `completed` — incluso sobre un pase `dropped`, que resucitaba con
   `finished_on` = hoy. Dos guardas: `markEpisodeWatched` devuelve si creó fila (delta real), y
   el nuevo helper `isAutoCloseable` prohíbe cerrar lo que ya está `dropped` o `completed`. La
   segunda guarda se aplica también al auto-cierre de `addSession`, donde podía pisar un
   `dropped` elegido por el usuario en la misma hoja.

5. **Los controles del mapa de universo suben a la esquina superior derecha, no «por encima de la
   leyenda» (#722).** El informe proponía anclarlos sobre la leyenda; se descarta porque la
   altura de la leyenda depende del contenido del grafo y cualquier offset fijo vuelve a romperse
   con otro grafo. La esquina superior derecha está libre siempre y solo hay que bajar del
   header. De paso los botones pasan de 26px (default de React Flow) a 40px.

6. **El auto-zoom de iOS se arregla con una regla global de 16px, no componente a componente
   (#724).** El disparador es el valor calculado de `font-size`, no la clase: mientras el arreglo
   viva en `ui/input.tsx`, cualquier campo nuevo que nazca con `text-sm` vuelve a traer el bug. Se
   excluyen checkbox/radio/range (ahí la `font-size` no dispara zoom y sí altera el dibujo).
   `user-scalable=no` queda descartado: mata el zoom de accesibilidad para todos.

**Y tres que se decidieron NO hacer (todavía):**

- **El CHECK `finished_on >= started_on` no entra** con el de estado⟺fechas. Prod tiene **167 de
  407 pases (41 %)** con la fecha de inicio posterior a la de fin —`started_on` = el día de una
  importación, `finished_on` = la fecha real de lectura—, así que ponerlo exige reescribir datos
  reales del usuario. Medido y abierto como issue #729 con las dos salidas posibles.
- **El índice único «un pase por obra y día» (#720) se queda pendiente** de decidir si se borran
  los 12 pases duplicados de dev (ruido de una sesión de pruebas del 2026-07-15, cada uno con
  sesión y post colgando). El CHECK de #719 sí entra, porque sale en verde en las dos bases.
- **S2-05 (revoke de INSERT en `credits`/`people`/`series_episodes`) no es un revoke, es un
  rewire** (#725). Esas tres tablas las escribe hoy el **cliente de la petición**
  (`ensureSeriesEpisodes`, `enrich-item`, `find-or-create-person`), así que revocar sin mover
  antes las escrituras a RPC `SECURITY DEFINER` deja al usuario normal sin hidratar episodios ni
  reparto — el modo de fallo exacto de #699, invisible si se prueba con una cuenta admin.

**Corrección de diagnóstico (S2-19, #726):** las funciones `SECURITY DEFINER` que desvían de la
plantilla eran **11, no 15**. Las otras 4 llevan `search_path = ""`, que es MÁS estricto que
`public, pg_temp` (cualifican cada nombre a mano); pasarlas a la plantilla las empeoraría.

---

## 2026-08-20 (tarde) — Dos correcciones al cerrar la barrida

1. **Una variante arbitraria de Tailwind NO sirve para apuntar a una clase con guiones
   bajos.** `[&_.react-flow__controls-button]:h-10` compila a
   `.react-flow controls-button`: dentro de un valor arbitrario, Tailwind traduce cada `_`
   a un ESPACIO (es su forma de escribir combinadores). La regla se emite y no pinta nada,
   así que el arreglo de tamaño de #722 estuvo un rato dado por hecho **estando roto** —
   la parte de posición sí funcionaba porque va en un `style` inline. Se lleva a
   `globals.css` como CSS plano en vez de escapar los guiones (`\_\_`): la trampa está en
   la sintaxis de Tailwind, no en el CSS. **No se ve leyendo el código, solo el CSS
   servido**; salió comprobando el bundle de producción tras el deploy.

2. **Verificar un despliegue mirando el estado de GitHub no basta.** El check de Vercel
   dio «success» un minuto después del merge y el alias seguía sirviendo un bundle sin una
   de las reglas nuevas (y con `x-vercel-cache: HIT` de por medio). La comprobación que sí
   vale es buscar en el CSS/HTML servido un marcador que **solo exista en el cambio nuevo**
   — aquí, el selector de los controles del mapa y la regla de 16px de #724.

---

## 2026-08-20 (noche) — Alta de libros: el P0 y lo que había debajo (#730, #682, #735)

1. **El índice único de `openlibrary_work_key` va SIN predicado.** El que había era parcial
   (`where openlibrary_work_key is not null`) y encima no era único. Con un único *parcial*,
   cada `on conflict (openlibrary_work_key)` tendría que repetir el `where` para que Postgres
   infiera el árbitro, y ese detalle se olvida la próxima vez. En un índice único los NULL no
   chocan entre sí, así que los libros de alta manual (sin work key) siguen pudiendo ser
   muchos: el parcial no compraba nada que el único no dé.

2. **La fusión de duplicados va DENTRO de la migración, y es cobarde a propósito.** Repunta y
   borra solo lo que puede hacer sin destruir datos de nadie; si mover las filas del perdedor
   al ganador chocara con un único de una tabla de usuario (dos pases activos, la misma obra
   dos veces en una colección), **aborta con el detalle** en vez de decidir qué fila de un
   usuario sobrevive. Gana la fila con más rastro de usuario, no la más completa: en prod la
   ganadora era además la más rica, pero el criterio se escribió al revés a propósito y se
   probó en dev con un duplicado sembrado en el que la fila con el pase era la más pobre y la
   más vieja. Un dato de catálogo se vuelve a bajar de OpenLibrary; un pase, no.

3. **El arreglo de «Sin título» va en la MISMA PR que el P0, y no en una aparte.** La regla del
   repo dice no encadenar a la PR en curso un fallo descubierto de refilón, y aquí se hace la
   excepción **explícita**: no son dos diagnósticos, son las dos mitades de «dar de alta un
   libro nuevo desde /buscar». Arreglar solo el 42P10 habría entregado la función visiblemente
   rota — libros que se crean y se quedan en «Sin título» para siempre, porque `hydrated_at` ya
   está puesto y nadie reintenta. Se abre igualmente su issue (#735) para que quede el registro.

4. **El segundo defecto no era visible mientras existiera el primero.** Un fallo que aborta
   antes tapa a los que vienen después: mientras el alta reventaba con 42P10, no había libro
   nuevo que mirar. Por eso el e2e nuevo cubre el camino entero (alta **y** ficha con datos
   reales), no solo que el `insert` no lance.

5. **Un e2e que abre una ficha ya existente no prueba el alta.** El test nuevo **borra la fila
   y vuelve a abrirla**: que salga un id DISTINTO es la única evidencia de que el `insert` se
   ejecutó. Sin ese borrado pasaría en verde desde la segunda corrida sin tocar la rama rota —
   que es justo por qué el spec de #674, que sí existía, no pilló nada: probaba películas, y el
   defecto vivía en el único tipo sin cobertura.

6. **`create or replace` con una firma distinta NO reemplaza: crea una sobrecarga.** Al ampliar
   `hydrate_book` hay un `drop function` explícito antes. Con las dos versiones vivas, PostgREST
   no sabría a cuál llamar.

---

## 2026-08-20 (noche) — Grants residuales y fechas invertidas (#727, #729)

1. **Se revoca TRUNCATE/TRIGGER/REFERENCES en bloque; DELETE no.** TRUNCATE es la única de las
   cuatro que **no pasa por la RLS**: por cualquier camino que ejecute SQL con `anon` o
   `authenticated`, vacía la tabla entera sin que ninguna policy diga nada. TRIGGER y REFERENCES
   se van con ella porque el cliente no hace DDL. **DELETE se queda**: en muchas tablas borrar
   por RLS es el camino legítimo (contenido propio del usuario) y un `revoke` de golpe rompería
   justo eso — ahí el cinturón es la policy, no el grant.

2. **Se mide y NO se arregla que `anon` conserve INSERT en 45 tablas y UPDATE en 43.** Es el
   mismo residuo de default privileges, pero lo contiene la RLS (anon no tiene policies de
   escritura) y tocarlo en bloque es de otro tamaño. Queda anotado en `data-model.md` §8 y vive
   en #710. Escribirlo importa: sin la medida, el `revoke` de arriba se lee como «los grants de
   anon ya están limpios», y no lo están.

3. **Las 167 fechas invertidas de prod se resuelven poniendo `started_on` a NULL, y eso no
   destruye nada — está medido, no supuesto.** Los 167 pases tenían `started_on` **exactamente
   igual** a `created_at::date` (167 de 167). O sea que la fecha no decía «cuándo empezó a
   leer», decía «cuándo se dio de alta la obra», y eso sigue estando en `created_at`. Se
   descartó la alternativa (`started_on = finished_on`, «lectura de un día») porque inventa una
   duración que nadie ha afirmado.

4. **La app NO rechaza cerrar con una fecha anterior al inicio: pone `started_on` a NULL.**
   Cerrar hoy una obra leída hace años es el camino normal, no un error del usuario — y
   `started_on` no lo escribe nadie a mano, lo pone la máquina. Devolverle un error al usuario
   por un dato que él no ha tocado sería culparle de lo nuestro.

5. **Antes de escribir una columna, mirar su grant.** `passes` tiene grants POR COLUMNA; se
   comprobó que `started_on` está en la lista de `authenticated` antes de añadir la escritura.
   Es la trampa del issue #375, y ya ha costado dos veces: compila, pasa el typecheck, pasa los
   unitarios y revienta en producción.

6. **NO se pone el índice único «un pase por obra y día» que pedía F1-011/#720.** Se escribió
   la migración, con una guarda que aborta si un grupo duplicado tiene nota o reseña en vez de
   decidir por el usuario — y **la guarda saltó en dev**. Mirando por qué, el diagnóstico se
   cae: las 14 filas duplicadas de dev no son una carrera entre importaciones, son cierres
   sucesivos **con minutos de diferencia** (17:56, 18:05, 18:11…) de una tarde probando el hub
   de pases. O sea, el caso legítimo que el índice prohibiría: **releer algo y volver a
   cerrarlo el mismo día**, que es justo lo que hace el e2e `pase-hub` en una sola corrida.

   Y fallaría **en silencio**: `apply-transition.ts:49` se traga el 23505 y devuelve
   `closed: true` sin haber escrito nada, así que la UI encadenaría su hoja de cierre con el
   pase todavía en curso. Tragarse ese error es correcto para «doble clic o dos pestañas»
   —donde el estado final es el que el usuario quería— y no lo es aquí.

   El problema original sigue en pie (`commit-row.ts` es un read-then-write sin nada detrás),
   pero el arreglo tiene que ser un **candado por importación**, no un invariante global. Un
   índice único solo sería viable si se pudiera distinguir «pase histórico importado» de «pase
   cerrado a mano», y hoy no hay columna que lo diga.

   La lección, que es la que vale para la próxima: **la guarda defensiva de una migración no
   es burocracia — es lo que convierte un borrado silencioso en un diagnóstico.** Si la
   migración hubiera borrado «los duplicados» sin preguntar, se habría llevado por delante la
   evidencia y habría dejado el índice puesto rompiendo un camino real.

---

## 2026-08-20 (noche) — Cerrar el catálogo de personas, créditos y episodios (#725)

1. **Service_role, no una RPC nueva.** El patrón del repo para esto es «RPC `SECURITY DEFINER`
   + cliente service_role + sin EXECUTE para `authenticated`» (sagas TMDB, #675). Aquí se usa
   solo la mitad del patrón —cliente service_role escribiendo directo— porque **una RPC no
   compraría nada**: no lleva lógica que proteger (son inserts planos) y, si tuviera EXECUTE
   para `authenticated`, movería el agujero en vez de cerrarlo (cualquiera podría llamarla con
   filas inventadas). Lo que cierra el agujero es que la clave no sale del servidor.

2. **El criterio para decidir si algo puede escribir con service_role: ¿de dónde sale el
   dato?** Aquí, de TMDB y Open Library, por un id que el servidor ya tenía. Ni un campo viene
   del cliente. Ese es el mismo argumento que justificó el service_role de las sagas, y es la
   línea que hay que exigir la próxima vez — no «es cómodo».

3. **Se revoca también el UPDATE de `people`, que la issue no pedía.** Sus grants por columna
   (`bio`, `photo_url`, fechas…) existían para el enriquecimiento desde TMDB; movida esa
   escritura a service_role, dejarlos puestos habría sido dejar el trabajo a medias: cualquier
   autenticado podía seguir rellenando la biografía vacía de cualquier persona. El trigger
   fill-only se queda como red, aunque ya no haya policy que lo alcance.

4. **El anónimo pasa a hidratar, y es deliberado.** Antes su escritura moría con 42501 y la
   ficha se quedaba a medias hasta que pasara alguien con sesión. Que la hidratación dependiera
   de quién mira era el bug, no la protección: el catálogo es compartido. Sigue acotado por los
   guards que ya existían, así que es una vez por ficha, no por visita.

   **Corrección medida en producción, para no dejar la afirmación más ancha de lo que es:** la
   filmografía de una ficha de persona (`hydratePersonCredits`) sigue sin hidratarse para el
   anónimo. No por estos grants — porque antes de tocar `credits` pasa por
   `register_catalog_items_bulk` para dar de alta las obras, y esa RPC exige `auth.uid()`. Lo
   que sí se comprobó escribiendo desde una visita anónima real a `/persona/<id>` en prod fue
   la bio y la foto. Conviene distinguirlo: si alguien lee «el anónimo ya hidrata» y ve la
   filmografía vacía, va a buscar el fallo en el sitio equivocado.

5. **El orden de despliegue es parte del arreglo, no un detalle de operaciones.** Aplicar la
   migración antes del deploy no rompe ninguna página —las cinco escrituras son best-effort—
   pero rompe **en silencio**: episodios que no se escriben nunca, reparto que no aparece. Es
   el modo de fallo de #699 y no se ve probando con una cuenta admin. Por eso el orden está
   escrito en la cabecera de la migración y no solo en la PR, que es lo que nadie relee.

---

## 2026-08-20 (noche) — El historial de git NO se purga (#728)

**Decisión tomada: los dos backups con PII de #677 se quedan en la historia de git.** Es un
límite asumido a sabiendas, no un olvido — y por eso está escrito aquí, que era la condición
para poder cerrar #728.

Los ficheros son `backups/prod-2026-07-14-antes-de-reiniciar.json` y
`backups/prod-2026-07-26-saga-nodes-edges.json`. Ya están **destrackeados** y `.gitignore` cubre
`backups/`, así que no se puede añadir otro por descuido. Lo que queda es que siguen siendo
recuperables de cualquier clon.

**Lo que acota el riesgo:** el repositorio es **privado**. El daño exige que alguien con acceso
vaya a buscarlo a la historia.

**Lo que costaba purgarlo:** `git filter-repo`/BFG reescribe todos los SHA, lo que obliga a
coordinar todos los clones y worktrees vivos, a hacer **force-push a `main`** —que las reglas
del repo prohíben por defecto— y a invalidar las referencias a commits viejos que haya en issues
y PRs cerradas. Se decidió que ese coste no compensa mientras el repo siga siendo privado.

⚠️ **Lo que reabre esta decisión:** si el repositorio pasara a ser **público** alguna vez, la
purga vuelve a la mesa y hay que hacerla **antes** de abrirlo, no después. Ese es el disparador
concreto; sin él, esto se queda como está.

---

## 2026-08-20 (noche) — Sesión y cambio de estado son la MISMA lectura (#717)

**La pregunta era de producto y la respuesta la da el usuario:** al registrar una sesión y
cambiar el estado en el mismo gesto, ¿la sesión es de la lectura vieja o de la nueva? **De la
misma lectura que el cambio de estado.** Si alguien dice «he leído hasta la página 42 y lo estoy
releyendo», lo leído es de la relectura.

De ahí sale todo lo demás, que es mecánico:

1. **La transición se adelanta.** Corría al final, después de escribir la sesión, el cursor y
   los episodios; ahora corre antes de tocar nada y su `passId` manda sobre todas esas
   escrituras. `applyTransition` ya devolvía el pase vigente — `addSession` lo estaba tirando.

2. **Las notas se buscan por el pase VIEJO y se repuntan al nuevo.** Se escribieron mientras la
   hoja estaba abierta, así que llevan el `pass_id` de entonces; filtrar por el nuevo no
   encontraría ninguna. Sin repuntarlas, la nota se queda en el pase archivado mientras su
   sesión cuelga del vivo — la misma partición que este arreglo viene a cerrar.

3. **Si el pase es nuevo, el cursor parte de `{}`, no de la posición del viejo.** Una relectura
   empieza a cero (Regla 5); arrastrarle la página anterior la haría nacer por la mitad. Se
   pierde el `format` de la copia, que era de aquella lectura y no de esta.

4. **Se acepta a sabiendas el orden menos malo ante un fallo:** si la inserción de la sesión
   fallara justo después de la transición, el estado ya habría cambiado. Al revés —escribir
   primero y repuntar después— un fallo parte la sesión y el pase en dos, que es exactamente el
   bug de origen. Entre «el estado cambió y la sesión no se guardó» (visible, y el usuario
   reintenta) y «quedan colgando de pases distintos» (invisible), se elige lo visible.

**Lo que NO arregla esto:** `dropped` + «Leyendo» sigue devolviendo `askResume` y no hace nada
sin avisar. Es #737 y va aparte, porque es un no-op mudo y no un problema de a qué pase van las
escrituras.

## 2026-08-20 (noche) — Acción 6 del roadmap: puntuar a dedo y la regla de 44px (F4-010/013/015)

1. **La hit-area de sistema es un pseudo-elemento, no padding + margen negativo.** La propuesta
   de la auditoría era `p-3 -m-3`; se descarta porque sí mueve el flujo cuando el control vive
   en un `flex` con `gap` (el `gap` se mide desde la caja de margen, así que el vecino se
   acerca). `tap-44` centra un `::after` transparente de 44px sobre el control: la caja de
   layout no cambia y ninguna maqueta se mueve. El precio es que no sirve con `overflow-hidden`
   ni sobre un control ya `absolute`/`fixed` — está escrito en el propio CSS.

2. **Solo bajo `(pointer: coarse)`.** Con ratón la precisión ya alcanza y un área de 44px
   alrededor de un icono de 24 le robaría clics al vecino de al lado. Es la regla 4 de
   UI-GUIA («capacidad, no ancho») aplicada a sí misma.

3. **La regla se pone DENTRO de `ActionMenu`, no en sus cinco consumidores.** Los cinco dibujan
   su disparador entre 24 y 34px con `triggerClassName` propio; si la clase la tuviera que
   pedir cada sitio, el sexto nacería otra vez pequeño.

4. **Puntuar en táctil pasa a ser un ARRASTRE, no una diana.** Las dos salidas que ofrecía la
   auditoría no son equivalentes: ensanchar la hit-area a 22px por mitad obliga a 220px de fila
   para cinco dots de 10px (34px de `gap`), que es otro dibujo y otra maqueta. El arrastre
   mantiene el dibujo y resuelve el problema real, que no era el tamaño sino la ausencia de
   feedback: con la nota grande visible mientras el dedo no se levanta, un target de 3,5px se
   corrige antes de soltar. Se aplica lo que enseña el globo, no lo que caiga debajo del dedo.

5. **El arrastre es solo para dedo y lápiz; el ratón no se toca.** `pointerType === "mouse"`
   sale por arriba del handler, así que el hover y el clic sobre las mitades siguen intactos —
   y con ellos los e2e que pulsan «10/10» y el camino de teclado, que sigue siendo el de los
   diez `<button>` reales.

6. **`touch-action: pan-y`, nunca `none`.** El eje vertical se lo queda el scroll de la página:
   empezar a bajar con el dedo sobre la fila de dots no puede secuestrar el gesto. Es el mismo
   error que F4-012 documentó en la tierlist, y no se repite aquí.

7. **El reparto de la nota es lineal sobre TODO el ancho de la fila**, en diez tramos iguales,
   ignorando los `gap` entre dots. Es monótono y continuo (lo que pide un arrastre) y el
   desfase máximo contra el dot dibujado son 2-3px. Vive en `lib/rating/dots`
   (`ratingFromFraction`) para poder probarlo sin navegador.

**Cobertura:** la aritmética, en unitarios; el ÁREA y el gesto, en
`e2e/movil-areas-tactiles.spec.ts` con emulación de dispositivo (`isMobile` es lo que pone el
navegador en `pointer: coarse`) y eventos de dedo por CDP — `page.touchscreen` solo da toques, y
un `dispatchEvent` sintético no vale porque `setPointerCapture` necesita un puntero activo de
verdad. El spec no guarda nada: se queda en el formulario de edición del diario, así que no toca
la BD compartida.

**Referencia obsoleta de la auditoría:** F4-015 cita `catalog-editor.tsx:723` (✕ de 20×20). Ese
fichero ya no existe — se lo llevó la limpieza de código muerto de la fase 5.

## 2026-08-20 (tarde) — Acción 7 del roadmap: el sistema mínimo de UI (F3-006/011/012/014/015)

Los cinco hallazgos van juntos porque son el mismo problema visto desde cinco sitios: **no había
sistema**. Cada pantalla decidía por su cuenta de qué color es un botón, dónde vive un borrado,
qué se enseña cuando una lista está vacía y cómo se llama cada cosa.

1. **El CTA principal es naranja SIEMPRE, aunque la obra sea una serie.** Lo pintaba
   `MEDIA_ACCENT[itemType].bg`, así que «Marcar episodio» era el único botón morado de la app
   mientras el MISMO gesto, desde la pestaña Episodios, salía naranja. La regla que queda: el
   color de tipo es del **contenido** (barras de progreso, chips, marcas del calendario); el
   color de un botón es de su **rol**. Lo que sí cambia por tipo es el verbo, y esos verbos están
   ahora escritos en el glosario, no repartidos por cuatro componentes.

2. **Cinco variantes de `Button` y ninguna más**, con `danger` como cuarta de la jerarquía
   (`primary` / `secondary` / `ghost` / `danger`) más `green`, que se queda porque en Paper el
   verde es *lo social* (unirse, aprobar, aceptar) y no un quinto nivel de énfasis.
   `danger` es rojo SÓLIDO y solo sale cuando el borrado es el asunto de la pantalla — el botón
   que remata una hoja de confirmación. Un `variant="danger"` por fila sería exactamente el
   patrón que la decisión 3 viene a quitar.

3. **Lo destructivo se va detrás del «···», y pregunta solo cuando arrastra otros datos.**
   Movidos a `ActionMenu` con `danger: true`: borrar un pase, borrar una sesión, borrar una nota,
   borrar una edición, borrar un post de club, borrar un reto. Preguntan (con `confirm()`, que es
   lo que el repo ya usaba en cinco sitios: no se trae un `<dialog>` nuevo para esto) los que se
   llevan algo por delante — pase, edición, nota, quitar de la biblioteca, subir de rol.
   **NO pregunta borrar una sesión suelta**: se vuelve a registrar en diez segundos, y confirmar
   todo enseña a decir que sí sin leer. Lo reversible (archivar un reto, que tiene «Reactivar»)
   se queda a la vista.

4. **Dos excepciones registradas a propósito.** (a) «Quitar de mi biblioteca» sigue siendo un
   enlace rojo visible al final del panel de Registro: no está sembrado por fila, es la acción
   única de un panel de gestión al que se entra a propósito, y esconderla la haría inencontrable
   sin reducir el misclick. Lo que le faltaba era la pregunta —borra TODOS los pases de la obra—
   y ya la tiene, en sus dos puertas (panel de Registro y menú del hero). (b) «Editar» se queda
   en línea junto al «···» en el diario y en los retos: es neutro, es lo que se hace a diario, y
   esconderlo penalizaría el caso frecuente para proteger el raro.

5. **El rol de admin pregunta solo al SUBIR.** `/admin` cambiaba el rol al soltar el select y
   avisaba en la descripción de que «los cambios son inmediatos», que es un aviso *después* del
   hecho. Ahora `user → collaborator → admin` compara rango y pregunta; bajar no pregunta,
   porque es reversible y no reparte permisos sobre el catálogo común.

6. **`EmptyState` gana una talla `panel`, y esa es la razón de que nadie lo usara.** El
   componente existía desde la fase de Estados, pero con `py-16` y un titular serif de 20px no
   cabe dentro de una sección — así que las listas embebidas (clubes de «Descubrir», agenda del
   mes, búsqueda sin consulta) seguían resolviendo su vacío con un `<p>` gris suelto. La
   anatomía no cambia entre tallas: glifo, qué pasa, y una salida; si no hay salida honesta que
   ofrecer se omite, pero se ha pensado. La agenda del mes es justo ese caso: quien mira puede
   no ser miembro de ningún club ese mes, y «crea un evento» sería una salida falsa.

7. **Una colección vacía dibuja su abanico con tres huecos punteados**, no 168px de blanco. El
   `covers.map` no tenía sobre qué iterar y la tarjeta parecía *a medio cargar*, no vacía — que
   es peor que fea: hace desconfiar de que la app haya terminado de responder. Los huecos son
   decorativos (`aria-hidden`): lo que un lector de pantalla necesita ya lo dice el «0 títulos».

8. **La tarjeta de club entera es el enlace y el botón «Abrir» desaparece.** Repetía en un
   control lo que ya hacía el bloque que lo contenía. Técnica: `after:inset-0` sobre el `<Link>`
   del cuerpo, y `relative z-10` en lo que SÍ es otra acción (unirse, solicitar, ver invitación)
   para que no se lo coma la capa estirada.

9. **«Biblioteca» y «Cuaderno» son los términos canónicos** (decisión del dueño del repo).
   «Colección» queda SOLO para las agrupaciones que crea el usuario, que era el choque de verdad:
   la nav decía «Colección» para toda la biblioteca y dentro había una pestaña «Colecciones» con
   otro significado, a un clic de distancia. **La URL `/coleccion` NO cambia**: rompería enlaces
   compartidos y las rutas guardadas de la PWA. Deuda consciente, anotada en el glosario.
   El vocabulario entero vive ahora en `docs/UI-GLOSARIO.md`, y se consulta *antes* de escribir
   copy — si un concepto no está, se añade allí primero.

**Cobertura:** los cambios son de forma, no de lógica, así que lo que los protege son los e2e que
ya recorrían esos flujos, adaptados al gesto nuevo (abrir el «···» y aceptar el diálogo):
`pase-hub` (borrar pase), `happy-path` (borrar reto), `borrado-rapido-ediciones` (borrar edición).
`ActionMenu` gana `triggerTestId` y `testId` por item para que un spec pueda seguir agarrándose al
control que sustituye al que había — `delete-edition` sigue existiendo, ahora sobre el `menuitem`.

**Lo que NO entra:** F3-013 (unificar `WorkCard`) y F3-009 (cuatro patrones de navegación
secundaria) son refactores de componente con su propio alcance, no parte de este sistema mínimo.
Y «Sin sinopsis disponible.» se queda como está: es la ausencia de un CAMPO dentro de un panel
lleno, no una lista vacía; meterle un `EmptyState` con glifo sería ruido.

## 2026-08-21 — Acción 8 del roadmap: IA de navegación y página de Ajustes (F3-010/F4-007/F1-025)

El diagnóstico de la auditoría era que **26 de 41 rutas colgaban solo de enlaces contextuales**:
la nav tenía cuatro entradas y la app ocho áreas, así que lo que no cabía no estaba en ninguna
parte. `/cuenta/contrasena` tenía **cero enlaces en `src/`** —solo se llegaba por el correo de
recuperación, de modo que un usuario con sesión no podía cambiar su contraseña desde dentro de la
app—, `/importar` vivía dentro de la hoja modal de «Editar perfil», y `/notas`, `/estadisticas` y
`/sagas` colgaban de enlaces de segundo nivel.

1. **La regla de reparto de la IA: si es TUYO cuelga de «Tú»; si es del catálogo, de Buscar.**
   Es lo que decide dónde va cada cosa sin discutirlo pantalla a pantalla. Cuaderno, Estadísticas
   y Ajustes son tuyos; **Sagas no**, aunque estuviera igual de enterrada — una saga es del
   catálogo común, así que su sitio es Buscar, que es donde se descubre. La lista de «Tú» vive en
   `nav-items.ts` junto a la principal (`youItems`), no dentro de un componente: se sirve en dos
   sitios y tenía que haber uno solo que tocar.

2. **La barra principal NO se toca.** La propuesta de la auditoría era rehacer las cinco entradas
   (Inicio · Biblioteca · Descubrir · Clubes · Tú). Se descarta: «Descubrir» sería un término
   nuevo estrenado tres días después de cerrar el glosario, y renombrar «Perfil» a «Tú» cambia la
   etiqueta más aprendida de la app para arreglar un problema que es de SEGUNDO nivel. El agujero
   no era que las cinco entradas estuvieran mal elegidas: era que no había nada colgando de ellas.

3. **Los ajustes son una PÁGINA (`/ajustes`), no una hoja modal.** Una pantalla de configuración
   se marca, se comparte y se vuelve a ella con el botón atrás; un `<dialog>` no hace ninguna de
   las tres. Además había DOS hojas que se repartían lo que es configurar —«Editar perfil», que
   escondía Importar/Exportar, y el engranaje, con visibilidad, avisos, admin y salir— y ninguna
   de las dos tenía sitio para la contraseña. El engranaje del perfil pasa a ser un `<Link>`.

4. **Criterio de reparto entre el perfil y los ajustes: el perfil es lo que otros ven de ti; los
   ajustes son lo que tú decides sobre tu cuenta.** Por eso «Editar perfil» sigue existiendo en el
   perfil (editar tu nombre en su contexto), pero **Importar/Exportar se van**: mover tu
   biblioteca entera en CSV no es un rasgo de tu perfil público, y esconderlo tras «Editar perfil»
   era exactamente por lo que nadie encontraba el importador.

5. **El correo se enseña y no se edita.** Cambiarlo es un flujo de verificación por partida doble
   que hoy no existe; enseñarlo cuesta cero y responde la pregunta «¿con qué cuenta entré?», que
   es una de las dos que traen a esta página.

6. **Un camino por viewport, no dos.** En `sm+` la lista de «Tú» es el menú del avatar de la
   topbar; en móvil no hay avatar ahí, así que la misma lista se despliega como fila de accesos en
   tu propio perfil (`YouRow`, `sm:hidden`). No se enseñan las dos a la vez a propósito: repetir
   los mismos cuatro destinos dos dedos más abajo no es descubribilidad, es ruido. Lo que faltaba
   era que en cada viewport hubiera UNO, no que hubiera dos.

7. **El menú del avatar no reutiliza `ActionMenu`.** Sus items son `<button onSelect>` y estos son
   **navegación**: un destino tiene que abrirse en pestaña nueva con ctrl+clic o con el botón
   central, y un botón que llama a `router.push()` no hace ninguna de las dos. Se copia su
   mecánica accesible (`aria-haspopup`, Escape, puntero fuera) sobre `<Link role="menuitem">`. Y
   se cierra al cambiar de `pathname`: con Cache Components la navegación soft no desmonta el
   componente y el menú se quedaría abierto sobre la página nueva (#448).

8. **El enlace a Sagas pasa a tener forma de destino.** Era mono de 11px, gris y en versalitas:
   se leía como un rótulo de sección, no como un sitio al que ir — y era lo único que separaba una
   feature entera del olvido.

9. **`/cuenta/contrasena` deja de ser un formulario suelto.** Título con `PageHeader` (el `<h1>`
   en sans de 20px que traía el formulario iba contra la regla de titulares en serif) y vuelta a
   Ajustes. Quien llega desde el correo de recuperación también tiene sesión, así que el enlace le
   sirve igual.

10. **F1-024 estaba caducada y no se implementa: se registra.** La auditoría decía que «desde un
    libro no se puede llegar a la ficha de su autor» y que «el autor es texto plano
    (`libro:433`)». Es falso hoy y ya lo era cuando se escribió: el autor enlaza a
    `/persona/[id]` desde el **2026-08-13** (commit `2ed0dc8f`, vía `links` de
    `metadata-sidebar.tsx`), seis días antes de la auditoría, y hay un e2e dedicado
    (`e2e/libro-autor-enlace.spec.ts`). Lo único cierto del hallazgo es que la ficha de libro no
    monta `CreditsSection` — y **no debe montarlo**: para libros el único rol de crew que se
    escribe es `author` (`enrich-item.ts:216`; Open Library marca autor e ilustrador con el mismo
    `/type/author_role` y no se pueden distinguir), así que la sección sería una fila de avatares
    con las mismas personas que ya enlaza el panel de metadatos. Acta, no trabajo pendiente
    (issue #748).

**Cobertura:** `e2e/ia-navegacion.spec.ts`, cinco casos. Los asertos **navegan con clics desde el
perfil**, nunca con `page.goto()` al destino, porque el fallo que se arregla es el más silencioso
que hay: `/cuenta/contrasena` respondía 200 sin tener un solo enlace que llevara a ella, así que
ningún test de «la ruta funciona» lo habría pillado. Se comprueba además que los items del menú
son `<a href>` y no botones, y que los accesos móviles miden ≥44px de alto.

**Lo que NO entra:** el contenedor estándar de página utilitaria (F3-002, P3) — `/importar`,
`/admin` y la ficha de saga siguen cada una con su propio ancho y su propia cabecera; `/ajustes`
estrena un patrón de tarjeta-por-sección que puede servirles de base cuando se aborde. Y la URL
`/coleccion` sigue sin cambiar, por lo mismo que se anotó el 2026-08-20.

## 2026-08-21 (tarde) — Acción 9 del roadmap: pasada de revalidación (F1-014/023/027/030)

Los cuatro hallazgos eran del mismo tipo: **la reactividad revalidaba lo que no era.** De más en la
campana, de menos en el alta rápida, y de nada en dos etiquetas que se declaraban y no invalidaba
nadie. Ninguno se nota HOY, y ese es justo el problema: lo tapa el refresco-al-navegar temporal de
Next, que sus propios docs dan por transitorio.

1. **La campana no revalida NADA, y no se sustituye por un tag.** `markAllNotificationsRead` hacía
   `revalidatePath("/", "layout")` —la revalidación más cara que existe: purga la Client Cache
   entera— en cada apertura del desplegable, que es la acción más frecuente de la app, para
   refrescar un número de dos dígitos. La auditoría proponía «un tag propio del contador»; se
   descarta y se quita a secas. Motivo: **el contador no está cacheado en ninguna parte**.
   `getUnreadCount` es una consulta viva dentro del `<Suspense>` dinámico de `SessionChrome`, así
   que cualquier render posterior ya lee la BD; y entre medias el badge tampoco se queda rancio
   porque la campana lo baja a 0 en el cliente y el Header vive en el layout raíz, que no se
   desmonta al navegar. Un tag habría sido peor que inútil: un contador de no leídas depende de
   `auth.uid()`, y cachearlo bajo etiqueta compartida es servirle a un usuario el contador de otro
   (regla #437). **Para un dato por-usuario, lo correcto es no cachearlo.**

2. **`revalidateSagaMembership` recibe TODOS los miembros, no el ítem tocado.** Es el punto entero
   de F1-023(b): la ficha de cada obra canta «nº X de Y» y la Y es el total de la saga, así que dar
   de alta una obra cambia el rótulo de todas las demás. Se paga una consulta extra por mutación
   (`listSagaMemberRefs`) y es barato: son acciones de colaborador, no de usuario.

3. **Y se invalida también al RENOMBRAR y al BORRAR la saga, que la auditoría no listaba.** El
   nombre viaja dentro de `getItemSagas` (la chip «Parte de X»), así que renombrar dejaba el nombre
   viejo en todas las fichas; borrarla dejaba la chip de una saga que ya no existe. Mismo agujero,
   distinta puerta. Igual con `saveSequence`: escribe `position`, que es la X del «nº X de Y».

4. **Dos primitivas de etiqueta, distinguidas por quién llama: `revalidate*` vs `expire*`.**
   `updateTag` **solo es legal dentro de una server action**; el enriquecimiento perezoso corre
   durante el RENDER de la ficha, no en una acción. Así que la curación de sagas usa `updateTag`
   (espera al dato fresco: el que acaba de curar recarga y tiene que ver su cambio) y el
   enriquecimiento usa `revalidateTag` desde `after()` (basta con marcar caducado: quien enriquece
   no es el dueño del dato, es un visitante que ha rellenado catálogo compartido). Confundirlas no
   da error de compilación: **revienta en runtime y solo en el camino que las ejecuta.**
   `revalidateTag` en Next 16 exige un segundo argumento con el perfil de caducidad; sin
   `{ expire: 0 }` la entrada seguiría viva su `cacheLife` completo, o sea no caducaría nada.

5. **El enriquecimiento DEVUELVE lo que hay que invalidar en vez de invalidarlo.**
   `ensureItemEnriched` pasa a devolver `EnrichmentEffects` (`wroteCredits`, `sagaMembers`) y es la
   ficha quien agenda el `after()`. No es rodeo: las APIs de revalidación no son legales durante un
   render, y meter el `after()` dentro de la función habría obligado a mockear `next/server` en sus
   ocho tests unitarios. Además el agujero real que arregla no es el enriquecido que funciona —ese
   escribe ANTES de que la misma petición lea, así que cachea bien— sino **el que falla**: si Open
   Library no contesta, la visita cachea créditos VACÍOS durante días y la siguiente, que sí
   consigue escribirlos, los sigue leyendo vacíos.

6. **`getCurrentUserRole` pierde el parámetro `supabase` en vez de ignorarlo.** Lo pasaban 35
   llamadas y con él hacía `auth.getUser()`, que es un viaje de red de ~240 ms, no una lectura
   local — la ficha de película lo llamaba dos veces por render y pagaba los dos. Se podría haber
   dejado el parámetro muerto en la firma; no se hace porque mientras esté ahí seguirá leyéndose
   como «el rol depende del cliente que le pases», y no depende: depende de la cookie de la
   petición.

7. **`getClub` se memoiza con `cache()` detrás de un envoltorio async.** Se ejecutaba DOS veces
   enteras por petición en `/club/[slug]` —lo llaman `generateMetadata` y el cuerpo, cada uno por
   su lado—, hasta cuatro viajes cada una. `clubs.ts` es `"use server"` y ahí solo se pueden
   exportar funciones async, así que la parte memoizada es una constante privada y lo exportado es
   una función de verdad. Mismo patrón que `getCurrentUserRole` y `getOwnProfile`.

8. **`interactions.ts` se parte en dos, y no era opcional.** Contenía el vocabulario (tipos,
   `REACTION_KINDS`, `emptyReactions`) que importan tres componentes de CLIENTE **y** el lector que
   toca BD. Solo compilaba porque su única referencia al servidor era un `import type`, que
   desaparece al transpilar; en cuanto necesitó un import de VALOR, el build cayó con «This module
   cannot be imported from a Client Component» por cinco caminos. El lector se muda a
   `get-interaction-summary.ts` con `server-only`. **Un fichero que mezcla vocabulario compartido y
   acceso a BD es una bomba con la mecha en el próximo import.**

9. **La regla del módulo central pasa de comentario a test.** `revalidate.ts` decía desde el primer
   día que «toda server action revalida a través de estos helpers»; la auditoría encontró nueve
   llamadas sueltas en seis ficheros. Ahora `revalidate-guard.test.ts` recorre `src/` y falla con
   el nombre del fichero infractor. Se bloquea `revalidatePath` y **no** `updateTag`/`revalidateTag`
   a propósito: las etiquetas se declaran en el mismo fichero que las lee (`cacheTag` junto a su
   `use cache`), así que quien las invalida tiene el contrato delante; una ruta se revalida a
   ciegas desde cualquier sitio y nadie ve la lista completa de las que hacían falta.

10. **`revalidateAppChrome()` existe para que la bomba tenga nombre.** Queda un solo uso legítimo
    de `revalidatePath("/", "layout")` —terminar el onboarding, que estrena las barras de
    navegación y pasa una vez en la vida de una cuenta— y vive en el módulo con nombre propio, para
    que usarla sea una decisión y no un descuido.

**Cobertura:** ocho casos nuevos en `revalidate.test.ts` más el guard. Los asertos miran
EXACTAMENTE qué rutas y qué etiquetas, no «se llamó a algo», porque los cuatro bugs eran de alcance.
Uno comprueba que `expireSagaMembership` usa `revalidateTag` y **nunca** `updateTag`: es la
distinción del punto 4 y es la que cuesta un error de runtime.

**Verificado contra `next start`, no contra `next dev`** — y menos mal, porque es lo único que
destapó el bug de la issue #751 (la hidratación perezosa de las fichas lleva sin correr en
producción: usa el cliente de la petición dentro de un `after()`). Que ese error apareciera UNA vez
en toda la suite, con el `after()` nuevo de esta acción corriendo en cada render sin fallar, es lo
que separó un fallo del vecino de un fallo propio.

**Lo que NO entra:** el resto de F1-028 (la convención única de dónde viven las server actions).
`interactions.ts` se parte porque el build lo exigía, no como primer paso de ese refactor; `lib/clubs`
sigue marcando módulos de dominio enteros como `"use server"`. Y quedan ~129 `auth.getUser()` en
server actions: ahí es un viaje por mutación y no por render, que es otro coste y otra decisión.

---

## 2026-08-21 (noche) — #751: la hidratación perezosa de las fichas vuelve a correr

Las tres fichas (`/libro`, `/pelicula`, `/serie`) curan la fila del catálogo en `after()` cuando
llega sin hidratar. **Llevaban semanas sin curar ni una sola fila en producción.** Escala del
problema medida antes de tocar nada:

| | dev | prod |
|---|---|---|
| `books` sin `hydrated_at` | 380 / 423 | 10 / 193 |
| `movies` | 568 / 571 | **862 / 1086** |
| `series` | 75 / 82 | 105 / 170 |

1. **El cliente de la petición no cruza a un `after()`, y eso no es evidente leyendo el código.**
   `createClient()` resuelve `await cookies()` al construirse, pero le pasa al cliente un adaptador
   cuyo `getAll()` corre en CADA consulta. Pasarlo por closure a un callback de `after()` es, en
   diferido, llamar a `cookies()` dentro del callback — prohibido en Server Components. Nadie
   escribió `cookies()` ahí: se coló dentro de una variable.

2. **`createServiceRoleClient()` era la salida obvia y NO vale.** Se probó primero y se descartó
   con evidencia, no por criterio: la RPC contesta `P0001 authentication required`. `hydrate_book`,
   `hydrate_movie` y `hydrate_series` empiezan con `if auth.uid() is null then raise`, que es parte
   del blindaje del catálogo (#674). `service_role` tiene los grants —EXECUTE en las tres y UPDATE
   en `books`, verificado contra `pg_proc`/`pg_class`— pero no tiene `auth.uid()`. **Pasa el guard
   de permisos y choca con el de sesión**, que es peor que fallar antes: parece que funciona.

3. **La vía es `createTokenClient(token)`, con el token leído durante el render.** Es literalmente
   lo que manda la doc de `after` («read request data before `after` […] and pass the values in»).
   RLS sigue aplicando con la identidad del usuario y `auth.uid()` devuelve su id: **el arreglo no
   cuesta ni un grant, ni relaja ni un guard.** Ese era el requisito, no un detalle — un arreglo de
   reactividad que abriera el catálogo a escritura sin sesión habría deshecho #674.

4. **`getAccessToken()` se memoiza por petición, aunque no haga red.** `getSession()` decodifica la
   cookie y no llama al servidor de auth (a diferencia de `getUser()`), así que no se memoiza por
   coste de red sino para no construir un cliente extra: la ficha ya pide la sesión en el mismo
   `Promise.all`. Devuelve SOLO el token, nunca el `user` de la sesión — ese no lo ha verificado el
   servidor de auth, y para eso está `getCurrentUser()`.

5. **El guard del `after()` se limita a Server Components a propósito.** La doc de Next prohíbe las
   request APIs dentro de `after` en páginas, layouts y `generateMetadata`, y en Route Handlers
   enseña el caso contrario como ejemplo VÁLIDO. De las Server Actions no dice nada. Un guard que
   prohibiera ahí se estaría inventando una regla, así que `src/app/buscar/actions.ts` —que tiene
   la misma forma, en una server action— queda fuera y se abre como sospecha (#753), no como bug.

6. **El e2e deja de conformarse con «la ficha sigue viva».** Ese aserto es exactamente el motivo de
   que el bug durase semanas: no distingue «se hidrató» de «se tragó el error». Ahora el test
   devuelve la fila a `hydrated_at = null` por REST, reabre la ficha y comprueba **la columna**. Se
   mira la columna y no la sinopsis porque si la work key no resuelve, `markHydrated` marca igual la
   fila y no habría sinopsis que ver — pero la hidratación sí corrió.

**Verificación:** contra `next start`, que es la única pasada que ve el fallo. Antes del arreglo el
test nuevo falla («la hidratación en after() no llegó a escribir hydrated_at») y el log trae
`hydrate_book rpc failed`; después, 7/7 en verde y **cero** fallos de RPC en el log.

**Corrección al diagnóstico de #751:** la issue atribuía la línea `⨯ … used cookies() inside
after()` del log a `ensureBookHydrated`. **No era suya** — los errores de esa función los captura su
propio `try/catch` y salen como `ensureBookHydrated failed`. La traza apunta a `NotesSection`, que
también llama a `createClient()`. La conclusión de fondo (la hidratación no corría) era correcta y
está arreglada; el ⨯ residual persiste tras el arreglo y se rastrea aparte (#754).

**Lo que NO entra:** el ⨯ de `NotesSection`, la sospecha de `buscar/actions.ts` y el desborde de 17px
de la barra de filtros del cuaderno a 390 px, que también salió al verificar. Tres diagnósticos
distintos, tres issues: #754, #753 y #755.

---

## 2026-08-21 (noche) — #750: los dos specs de club que llevaban un mes rojos

`club-reactivity.spec.ts` y `social-optimista.spec.ts` fallaban por timeout en dev y en producción
desde que la UI cambió debajo. Ninguno de los dos protegía ya nada: agotaban los 60 s buscando
controles que dejaron de existir.

1. **Los dos arreglos son de selector, y la propiedad que protegen sigue intacta.** El feed de club
   resiembra su primera página desde las props del servidor, así que un post nuevo sale sin
   `page.reload()`; ese aserto llegaba en verde y el timeout ocurría después. Lo que caducó fue
   dónde se pulsa: «Borrar» se fue tras el «···» (F3-012, `3061b6f0`) y «Me gusta» se agrupó dentro
   del desplegable de «Reaccionar» (`7f9c3f69`).

2. **La limpieza pasa a ser por PREFIJO, no por el cuerpo exacto de la pasada.** Es lo que convirtió
   dos tests rojos en basura acumulada: cada corrida borraba lo suyo, se caía antes de llegar, y el
   post quedaba. Se encontraron doce posts huérfanos en el club de pruebas. Con `body=like.<prefijo>%`
   una corrida se lleva también lo que dejaron las anteriores — mismo criterio que el `globalSetup`
   de sagas, que reimpone la línea base en vez de fiarse de la pasada previa. Tras el arreglo, cero
   huérfanos en dev.

3. **El desplegable de reacciones se cierra pulsando su propia capa, no un punto al azar.** Mientras
   está abierto hay un `<button aria-hidden>` a pantalla completa (así se cierra sin `useEffect`),
   y **intercepta cualquier otro clic**: pulsar «Reaccionar» otra vez, o en una esquina, no cierra
   nada y el siguiente paso se queda esperando. El helper `cerrarPicker()` pulsa esa capa y espera a
   que el trigger vuelva a `aria-expanded="false"`.

4. **La tarjeta se ancla por `div.shadow-card`, no por `div`.** El locator viejo filtraba `div` por
   texto, lo que casa también con los contenedores del feed: resolvía a doce menús a la vez. Ver
   `TRAMPAS.md` §25 — el patrón viejo solo funcionaba porque «Borrar» salía en una sola tarjeta.

**Lo que NO entra:** el desborde de 17 px del cuaderno a 390 px (#755), que salió en la misma
verificación pero es un fallo de la pantalla, no del test: ahí el aserto mide bien y lo que está mal
es la UI.

---

## 2026-08-21 · El muro de estadísticas deja de ser tipografía (fase A del rediseño gráfico)

**El problema no era la variedad de gráficos: era que 18 de ~33 paneles no dibujaban nada.**
Once `kpi` y siete `ranking` —tres de ellos seguidos en la misma sección— hacían que más de
la mitad de la pantalla fuera texto. Cambiar el tipo de gráfico habría cambiado el interior
de las tarjetas sin tocar eso.

**El anillo era el único gráfico que peleaba con nuestra propia regla.** El principio 3 de
`docs/design/paneles-estadisticos.md` prohíbe que un dato exija medir una altura, un área o
un ángulo — y un sector de donut es exactamente eso. Había tres. Se sustituyen por `waffle`,
cuyas celdas se **cuentan**. No escribe dentro (cien cifras no caben): su dato exacto vive en
la leyenda, que ya viajaba a la cara, y eso es lo que le permite estar en `SELF_DESCRIBING`.
`donut` se queda en `PanelViz` sin consumidor, como referencia del arco.

**El selector de faceta que se propuso NO se hizo.** La spec quería colapsar los tres rankings
de nota (géneros, autores, directores) en un panel con selector. Choca con el principio 9 del
propio doc —«Los filtros van en una fila, arriba, para todo el muro. Nunca un filtro dentro de
una tarjeta»— y con `src/lib/stats/filter.ts`. Se arregla por forma (pasan a `lollipop`) y por
orden (dejan de ir seguidos), con un test que lo fija. Queda issue de deuda: si algún día se
hace, `faceta` tendría que ser un filtro GLOBAL, y eso es una excepción deliberada que se
decide antes de escribirla, no después.

**El `bullet` cambió de consumidor respecto a la spec.** Iba a «Récords», que no encaja: dos
de sus cuatro entradas son texto, la mejor racha YA es la marca, y su única comparación
posible —el récord del periodo contra el de siempre— no existe con «Todo» puesto, que es el
periodo por defecto. En la vista por defecto no habría dibujado ni una marca. Se lleva a
«Rachas», donde «racha actual contra tu mejor racha» sí es valor-contra-referencia y vale en
todo periodo.

**Consecuencia de forma que hay que recordar:** el bullet compara cada fila con SU marca, no
con las otras filas, así que **una sola fila ya es un bullet completo**. La regla heredada de
dataviz «una sola barra ⇒ `kpi`» no le aplica, y cuando se implemente la degradación
automática de `viz` (fase B) su mínimo tiene que ser 1, no 2.

**El ancho se reserva para lo que no cabe.** `PanelSpec.hero` marca el panel que preside su
sección y ocupa las tres columnas con `column-span: all` — que es lo que permite una tarjeta
ancha sin volver a `grid`, descartada en su día por igualar el alto de cada fila. Solo lo
lleva el calendario anual: 53 semanas en un tercio de tarjeta son celdas de 6 px. «Evolución
de la pila» se barajó y se descartó, porque doce puntos de línea sí caben y ser héroe obliga a
ir primero, lo que rompería el orden que promete la descripción de su sección.

**Y un tope que solo se vio mirando la pantalla:** el waffle es una rejilla cuadrada, así que
crecía con la columna y una tarjeta de 340 px de ancho se llevaba 340 de alto — dos veces y
media lo que medía el anillo. Con tope de 220 px las celdas quedan en ~19 y la página baja de
4834 a 4607 px de alto. Ningún test lo habría visto.

## 2026-08-24 — El muro de estadísticas, fase B: la forma la elige el dato, y el vacío tiene tres niveles

**`spec.viz` deja de ser lo que se pinta.** Es lo que el panel PIDE; lo que se dibuja es
`derived.viz`, que `derive()` decide según cuántos puntos MEDIDOS haya. Con menos de cuatro no
hay curva, con menos de tres no hay reparto, con menos de dos no hay comparación: el panel
degrada a `kpi` y conserva su cifra en vez de dibujar una recta entre dos números con ejes,
rejilla y leyenda ocupando lo que un año entero.

Los umbrales están solo en 2, 3 y 4, y **nunca por estética**. Si la forma cambiara por gusto,
el panel se vería distinto cada visita y se perdería la comparación entre visitas, que es para
lo que existe un muro de estadísticas. `bullet` y `gauge` no degradan nunca —comparan contra
una referencia propia, no contra otros puntos—, ni `kpi`, `ranking` y `table`, que ya son su
forma mínima.

**El invariante que hunde la fase si se rompe: `StatPanel` no lee `spec.viz` ni una sola vez.**
Cinco sitios decidían texto, tabla, `aria-hidden` y lista de enlaces; uno que se quedara atrás
da un panel que dice tener tabla y no la tiene, **y el typecheck no lo caza** porque ambos
campos son `PanelViz`. Se afirma con un test que **lee el fichero** y busca la cadena. Por eso
el motivo de la degradación viaja en `derived.degradedFrom` en vez de calcularse comparando en
el componente: comparar exigiría leer `spec.viz` y dejaría la guardia sin poder ser absoluta.

**Dos correcciones al plan, encontradas al ejecutarlo:**

- **Un panel degradado CONSERVA la tabla**, contra la regla «`kpi` no lleva tabla». Sin dibujo
  y con un indicador fabricado que solo trae el total, la tabla era lo único que dejaba los
  puntos en el DOM: el plan los habría hecho desaparecer.
- **La leyenda del waffle no traía sus cifras.** La fase A lo dio por hecho —`SELF_DESCRIBING`
  obliga a que el dato exacto esté en alguna parte, y para el waffle ese sitio es la leyenda—
  pero el flag que las pinta seguía siendo `viz === "donut"`. Los tres waffles llevaban desde
  la fase A sin su dato exacto en ningún sitio. Corregido aquí.

**El vacío deja de ser un estado y pasa a ser tres**, distinguidos por quién puede arreglarlo:
estructural (no puede tener datos con ningún periodo, se pliega a una línea), por filtro (no
hay datos AQUÍ, y el aquí lo elegiste tú: tarjeta atenuada con la cifra de fuera y su salida)
y degradado (hay datos, pero pocos para esa forma: la cifra, con la frase de por qué).

**El criterio del nivel 1 es lo delicado.** «No puede tener datos NUNCA» no se decide con una
cifra que el selector de periodo acaba de recortar; se decide con `byYear`, la única señal del
muro que ignora a la vez el periodo y el filtro de tipo. Y como `byYear` cuenta obras
TERMINADAS, solo vale para paneles que también midan lo terminado: **`series-formato` queda
fuera a propósito**, porque mide episodios vistos y quien lleva media temporada de tres series
tiene datos y cero series terminadas. Plegarlo por ahí habría escondido un panel lleno.

**Y el nivel 2 no ofrece salida si la salida no lleva a ningún dato.** `elsewhere` trae la
cifra de fuera **y** el enlace, juntos y nunca por separado; devuelve nada con «Todo» puesto
(no hay ningún fuera al que ir) y sin histórico (el destino está igual de vacío). La salida
conserva el filtro de tipo: mandar a «todo» a quien acaba de elegir «libros» le deshace dos
filtros cuando solo le sobraba uno. Y la cifra de fuera **no se inventa pidiendo otra
consulta** — solo la declaran los dos paneles que ya la tienen a mano, porque convertir el
vacío en el caso más caro de la página es lo contrario de lo que busca este nivel.

**Sin `use cache` en toda la fase**, como en la A: no se ha tocado ningún getter ni añadido
ninguna consulta. Regla #437.

## 2026-08-24 — El muro de estadísticas, fase C: cinco preguntas que el esquema ya sabía contestar

Ninguna de las cinco necesita una columna nueva. Todas salen de datos que llevan meses en
producción y que ningún getter miraba.

**«Cómo cambia tu nota al releer» es la que llevaba más tiempo esperando.** El esquema está
diseñado para eso desde el principio —el pase es dueño de la nota, así que cada relectura tiene la
suya— y lo único que se sacaba de ahí era un contador (`records.rereads`). Compara el PRIMER pase
con el ÚLTIMO, nunca con el del medio: la pregunta es qué te parece ahora frente a la primera vez,
no el recorrido. Y **ignora el selector de periodo a propósito**, porque una relectura son dos
pases separados por años y recortarlos a la ventana elegida dejaría fuera justo el primero, que es
la mitad de la comparación.

**Los dos paneles de abandono solo pueden vivir en el muro privado, y no es una decisión de
producto sino del esquema.** `passes.dropped_reason` es siempre privado, con independencia de
`is_public`: la tabla **no concede `SELECT`** sobre esa columna a nadie, porque su RLS de SELECT es
de visibilidad de PERFIL (`can_view_profile`), no de dueño — un grant ahí filtraría el motivo a
cualquiera que pueda ver el perfil. La única vía de lectura es la vista `pass_reviews`,
`SECURITY DEFINER` y enmascarada por `d.user_id = auth.uid()`. Un `select("dropped_reason")` sobre
`passes` falla con «permission denied», y **es correcto que falle**. Hay un test que lee
`stats-tab.tsx` y afirma que ninguno de los dos paneles se ha colado en la pestaña pública, porque
esto no lo caza ningún tipo.

**El punto de no retorno no se afirma con menos de cinco abandonos medibles.** Es un MÁXIMO, y un
máximo sobre dos o tres muestras se mueve entero con el siguiente dato: «nunca has abandonado por
encima del 26 %» con dos abandonos es ruido presentado como hallazgo. Cuando falta, la barra se
queda sin marca en vez de inventarse un límite.

**El bullet estrena `PanelSpec.targetName`.** «Tu marca» describe un récord que se persigue, y eso
es exactamente lo que la racha es y lo que el punto de no retorno **no** es. Sin el campo, el
nombre accesible de «Dónde abandonas» habría dicho «tu marca 44 %» sobre algo que nadie persigue.

**Las anotaciones se normalizan por cada cien páginas y no por obra**, que es toda la diferencia:
sin normalizar, «las obras que más te hacen escribir» sería un ranking de libros largos. Doce notas
en un tocho de mil páginas es menos escritura que cuatro en uno de cien. Cita y nota se cuentan
aparte porque son dos gestos distintos —copiar lo que dice el libro y decir lo tuyo— y mezclarlos
hace que un lector de citas y otro de comentarios se vean iguales.

**«Velocidad real» divide por tiempo, no por días**, y esa es la corrección: `computePagesPerDay`
divide por días distintos, así que mezcla una sesión de tres horas con una de diez minutos.
Contesta a «cuánto avanzas al día», que es constancia; la nueva contesta a «a qué velocidad lees»,
que es ritmo. Las dos se quedan, porque son dos preguntas.

**Y la decisión de forma que hay que recordar de esa tarea: la PRIMERA sesión de un pase solo fija
el cursor, nunca cuenta como avance.** Es lo que separa una medida de velocidad de una inflada:
quien empieza a registrar por la página 300 no ha leído 300 páginas en esa sesión. El plan de la
fase pedía lo contrario (contar desde cero) y se corrigió al implementarlo — una métrica de
velocidad que infla es peor que no tenerla. El «avance positivo por pase» pasó a un helper
compartido con `computePagesPerDay` en vez de copiarse, para que las dos no puedan divergir.

**Todas las cifras que dejan algo fuera dicen cuánto.** Relecturas sin nota en los dos extremos,
abandonos sin motivo (el campo nació el 2026-08-14 sin backfill), abandonos sin páginas en ficha,
anotaciones de obras sin talla, sesiones sin duración. Son cinco denominadores, y sin ellos los
cinco paneles parecerían hablar de todo.

**Sin `use cache` en ninguno de los cuatro getters nuevos**, y no es olvido: los cuatro dependen de
`auth.uid()` vía RLS, y los de abandono además leen una vista enmascarada por dueño. Cachear
cualquiera de ellos es una fuga de datos entre cuentas invisible en desarrollo. Regla #437.

**Rendimiento medido, no supuesto.** El muro pasa de 17 a 21 consultas en un solo `Promise.all`,
así que su reloj es el de la consulta más lenta. Medido sobre siete cargas del muro completo:
`getFormatStats` es la más lenta en las siete (695–865 ms) y el total va siempre 3–5 ms por encima
de ella. Los cuatro getters nuevos entran en 458–742 ms, todos por debajo. El techo no se mueve.

## 2026-08-24 — El desplegable de @menciones elige lado, y por eso el arreglo no es «abrirlo hacia arriba»

**El desplegable se coloca midiendo el hueco, no por una regla fija.** Se abre hacia abajo salvo
que abajo no quepa y arriba haya más sitio; el `max-height` se recorta al hueco elegido, así que la
caja no puede salirse por ningún borde. La alternativa barata —voltearlo siempre hacia arriba, que
es lo que arreglaba el caso que se reportó— cambia un bug por otro: los composers que están a media
página (la reseña del sheet de cierre, el cuaderno de la ficha, el composer de club) tienen encima
la etiqueta y el contenido del formulario, y en pantallas cortas la lista se habría salido por
arriba. Por eso el e2e comprueba los **dos** bordes, no solo el de abajo.

**La causa raíz no era el ancho, y eso importa para el siguiente que lo lea.** El `<ul>` iba
`absolute` **sin ancla vertical** (ni `top` ni `bottom`), así que se quedaba en su posición
estática: justo debajo del campo. En escritorio eso se ve; en móvil el composer del hilo es `fixed
inset-x-0 bottom-0`, de modo que la lista nacía pegada al borde inferior de la pantalla. Medido a
360x740 en `/post/[id]`: caja en `y=734` con 202px de alto, o sea 196 de sus 202px fuera. El
`docScrollWidth` era 360 — por los lados no desbordaba nada. Aun así la lista lleva ahora
`max-w-full` junto al `w-56`, porque un ancho fijo sin tope en un contenedor estrecho es el
siguiente bug esperando (el patrón bueno ya estaba en `notification-bell.tsx`).

**Se mide justo antes de montar la lista, no en un efecto posterior.** La colocación se calcula en
el mismo callback que trae los candidatos, así que el primer pintado ya sale en su sitio y no hay
salto visible. El ancla es el propio campo, tomado del evento `onInput`: ningún caller tiene que
pasar una ref, y el arreglo entra una sola vez en el hook compartido para los seis composers que lo
usan (hilo de post, reseña de ficha, chat de club, post de club, sheet de cierre, cuaderno).

**Límite asumido:** la colocación se decide al abrir y no se recalcula si el viewport cambia con la
lista ya abierta (teclado del móvil, rotación, scroll). Se corrige sola en cuanto se sigue
escribiendo, porque cada búsqueda vuelve a medir. Queda en la issue #765.

**Y esto no se cubre con un unitario:** lo que distingue «se ve» de «está pintada fuera» es la caja,
y sin motor de layout no hay caja que medir. El test vive en
`e2e/menciones-desplegable-movil.spec.ts`.

## 2026-08-24 — El editor de un comentario ocupa su fila entera, y los botones bajan debajo

**En `compact`, el campo va solo en su fila y "Cancelar"/"Guardar" en una fila propia debajo.**
Antes los tres compartían una fila flex, que es el patrón razonable en escritorio y el que hunde el
móvil: los botones y el contador tienen ancho fijo, así que se lo comen del campo, y lo que sobra
depende de cuánto haya sangrado el hilo. Medido a 360x740 en `/post/[id]`, editando un comentario a
profundidad 1: el campo salía a **152px contra los 262px del comentario que estaba editando** —el
58%—, con **35px de alto**, una sola línea (`rows={1}`). Con el campo en su fila: 262px de ancho
(el 100%) y 92px de alto.

**El contador reserva alto, no ancho.** El `pr-12` que le dejaba sitio a `0/2000` costaba ~48px de
línea de texto; ahora se le da `pb-5` y el texto usa el ancho entero. En el modo no-`compact` se
queda el `pr-12`, porque ahí el composer ya es de ancho completo (`fixed inset-x-0 bottom-0` en
móvil) y quitarlo no compraría nada.

**El arreglo entra en `CommentComposer`, no en el hilo.** El síntoma se reportó editando en un
hilo, pero `compact` lo comparten tres sitios —editar un comentario del hilo, responder inline y
editar un mensaje del chat de club—, así que arreglarlo en `post-thread.tsx` habría dejado los
otros dos rotos igual. En el chat de club se quitó además el `max-w-[85%]` de la burbuja **solo
mientras se edita**: recortaba el campo por debajo del ancho del mensaje que estabas corrigiendo.

**La aserción del e2e compara contra el propio comentario, no contra un número de píxeles.** El
ancho útil depende de la profundidad del hilo, del avatar y del móvil de referencia; fijar «≥200px»
habría envejecido mal y no diría gran cosa. La regla estable es que **el campo tiene que ser tan
ancho como el texto que edita** (>0,9). Vive en `e2e/composer-compact-movil.spec.ts`, y se comprobó
que falla contra el código anterior (0,58) antes de darlo por bueno.

**Límite conocido:** el textarea sigue en `text-xs` (12px) y Safari iOS hace zoom al enfocar
cualquier campo de menos de 16px. No se toca aquí porque cambiaría el tamaño de fuente de los
campos de todo el proyecto; queda en la issue #768.

## 2026-08-24 — Ocultar abandonados: el filtro es opt-in por sitio de llamada

`getLibraryItems` la llaman diez sitios y solo cuatro son «vistas propias». El export CSV, el
selector de obras de clubes, los buscadores de añadir a colección y los bloques de «hoy» comparten
esa función; hacer que ocultara por defecto habría vaciado filas del respaldo del usuario sin que
nada lo delate. Por eso `hideDropped` es un filtro que hay que pedir, y las vistas propias usan un
envoltorio aparte (`getLibraryView`) que además devuelve cuántas ocultó.

Corolario que conviene no deshacer en un refactor: **el Resumen de la biblioteca
(`CollectionSummary`) no filtra.** Su barra apilada por estado es el único sitio de la app donde se
ve que existen obras abandonadas; ocultar ahí dejaría al usuario sin saber que las tiene.

Spec: `docs/superpowers/specs/2026-08-24-ocultar-abandonados-biblioteca-design.md`.

## 2026-08-24 — Acta: el auto-añadir a la biblioteca al unirse a una actividad de club se ELIMINA (#782, F1-003)

**Decisión: se borran los dos triggers y no se reimplementa.** No es «arreglarlo más tarde»: es que
la feature no se quiere. Si alguien lee un mockup viejo de EPIC-05 y ve prometido «al unirte a una
actividad, sus obras aparecen en tu biblioteca», que sepa que se decidió a propósito que no.

Lo que había: `autoadd_library_on_activity_join` (AFTER INSERT en `club_activity_participants`) y
`autoadd_library_on_activity_item` (AFTER INSERT en `club_activity_items`), ambos de
`20260713_list_challenge.sql`, insertando filas `planned` en `library_entries`.

**Llevaban desde el hub de pases sin hacer nada visible.** `library_entries` está congelada y la app
no la lee en ningún sitio — las 31 menciones que quedan en `src/` son comentarios explicando
justamente eso. Así que el único efecto real era acumular filas huérfanas: 153 en producción, de 3
usuarios, con la última escritura el 2026-08-18.

**Por qué eliminar y no reimplementar contra `passes`.** La alternativa era que el trigger creara un
pase `planned` por la vía canónica. Suena a una línea y no lo es: `passes` tiene máquina de estados
e invariantes propias (estado ⟺ fechas, un solo pase abierto por obra), así que hay que decidir qué
pasa cuando el usuario ya tiene un pase de esa obra, abierto o cerrado — y decidirlo para un trigger
cross-user que se dispara sin que el dueño del pase esté mirando. Ese diseño cuesta más que lo que
vale una feature que nadie ha echado de menos en 153 filas. Si algún día se quiere, se construye de
cero desde la acción de unirse, no desde un trigger.

**Y hay una razón que pesa más que el coste: el escritor vivo era el cebo.** Van cuatro episodios
del mismo bug —PR #96, #470, #674 y este— y en todos algo seguía apuntando a la tabla muerta.
Mientras exista un `insert into library_entries` en la base, el quinto episodio es cuestión de
tiempo. Verificado tras la migración `20260876`: **cero funciones escriben en la tabla**, en dev y
en prod, comprobado contra `pg_proc` y no contra el ledger de migraciones.

**Las 153 filas de prod se dan por perdidas.** No se migran a `passes`. Son estados `planned` que
ningún usuario llegó a ver nunca, así que «recuperarlas» no sería restaurar nada: sería inventarle a
tres personas una biblioteca que no eligieron. Se quedan donde están como registro histórico.

**Extra que salió al verificar: `anon` tenía `INSERT/UPDATE/DELETE` sobre la tabla congelada** y
`authenticated` solo `SELECT` — al revés de lo que uno esperaría. **No era una fuga**: la RLS está
activa y no existe ni una policy de escritura para `anon`, así que el grant no llegaba a nada. Pero
un grant sin policy es una mina cargada: basta que alguien añada una permisiva algún día para
convertirlo en escritura anónima. Se revoca en la misma migración, ahora que quitar el último
escritor lo deja obviamente inútil. `SELECT` se queda, que ese sí tiene policy
(`library entries select visible`).

**Lo que NO se toca: `validate_club_post_ref`.** Acepta `'library_entries'` como `sourceTable`, pero
no escribe. Es otro diagnóstico y meterlo aquí habría mezclado dos.

**Dónde vive la guarda.** En `e2e/club-actividad-pc.spec.ts`, que ya sembraba un participante y un
ítem con rol admin —o sea, los dos caminos exactos que disparaban los triggers—. Antes tenía una
limpieza en el `finally` para borrar la fila que el trigger le metía a la cuenta compartida
`devtest`; esa limpieza se convierte en su contraria: se cuenta antes y se afirma que el número no
cambia. Se compara el **delta** y no el valor absoluto porque `devtest` es compartida y puede
arrastrar filas históricas de esa obra; lo que no puede es ganar filas nuevas por unirse.

## 2026-08-24 — Reacciones con cualquier emoji

- **El emoji va en `reactions.kind`, no en una tabla de catálogo.** Una tabla de emojis
  permitidos con FK sería más "correcta" en el papel y añade un JOIN a cada lectura de
  reacciones a cambio de nada: el catálogo no se edita en runtime, se regenera con un
  script. La integridad la dan el CHECK de forma y la lista blanca en la acción.
- **Varias reacciones por persona, con tope de 6.** Teams permite una sola; aquí ya se
  podían varias y quitarlo obligaba a migrar datos eligiendo cuál sobrevive. Se conserva el
  comportamiento y se pone tope en trigger, porque emoji libre sin tope deja que una
  persona cuelgue decenas de píldoras de un mensaje.
- **La validación es lista blanca contra el catálogo, no `\p{RGI_Emoji}`.** El regex acepta
  secuencias ZWJ que no sabemos nombrar; entonces la reacción no tendría `aria-label` y en
  algunos móviles se pinta como varios monigotes. Con lista blanca, todo lo guardado se
  puede pintar y nombrar.
- **No se añadió `jsdom` para testear el `ReactionBar`.** La rama
  `fase-c-estadisticas-nuevas` ya introduce el runner de `.test.tsx`; duplicarlo aquí
  costaba un conflicto de `package.json` y lockfile. La lógica se extrajo a
  `reaction-display.ts` (puro, testeado) y el DOM lo cubre Playwright.

## 2026-08-25 — Notificaciones con contexto

- **La notificación guarda una foto de lo ocurrido, en vez de resolverlo al leer.** Resolver al
  leer daría siempre el dato fresco, pero los objetos son polimórficos (reseña, post, comentario,
  actividad, ronda…) y la campana se pinta en cada carga: serían varias consultas por tanda. Se
  guarda al escribir, como ya se hacía con el `href`. El precio, aceptado: si luego editan el
  comentario, la notificación conserva lo de entonces — que para un aviso histórico es lo
  correcto.
- **Una columna `jsonb` y no tres columnas sueltas.** Los campos son opcionales y distintos según
  el tipo, y así solo hay **un `grant` que revisar** en una tabla con permisos por columna. La
  forma la valida TypeScript en el único sitio que la escribe.
- **El extracto de un spoiler no se guarda siquiera.** Taparlo en la interfaz habría dejado el
  texto en la base de datos, y de ahí al push —donde no hay «pulsa para revelar»— y a cualquier
  lector futuro. Lo que no se guarda no se filtra.
- **Reacciones y comentarios no nombran la obra.** `interaction_targets` no guarda ningún título,
  así que hacerlo exigiría una consulta polimórfica por notificación. Se prefiere la copia algo
  menos rica a pagar eso en cada aviso. Queda como issue #797.
- **Regenerar `database.types.ts` no estaba en el plan y hacía falta igualmente.** Añadir
  `notifications.context` sin regenerar los tipos deja los `select`/`insert` que la referencian
  sin tipar en el sitio donde `tsc` los comprueba: compila igual (el cliente de Supabase cae a
  `any` para columnas que no reconoce) pero pierde la única red que detectaría un nombre de
  columna mal escrito antes de producción. El guion de cualquier tarea que añada una columna
  debe incluir este paso; queda también como issue de proceso, #798.

## 2026-08-25 — Los dos e2e sociales en rojo (#787, #788)

- **Los dos specs afirmaban un producto que ya no existe; se corrigen los TESTS, no la app.**
  Ninguno de los dos fallos era una regresión: `thoughts.spec.ts` esperaba el hilo interactivo
  desplegable dentro de la tarjeta del feed, y `social-interaction-targets.spec.ts` esperaba que
  un pase sin post apareciera en el feed. Lo primero lo cambió posts Spec 2b a propósito (la
  tarjeta se ojea, `/post/[id]` conversa) y lo segundo lo decidió #558 (el feed lee `posts`; los
  targets `pass`/`progress_session` sin post promovido quedan invisibles, aceptado para v1).
  Un test que codifica el producto viejo no protege nada: solo hace ruido rojo que enseña a
  ignorar la suite.
- **#558 se queda como está: no se migran los targets huérfanos para arreglar un test.** La
  alternativa era promover a post los `pass`/`progress_session` con interacción huérfana, que es
  una decisión de producto sobre datos de producción — no algo que se cuela para poner un e2e en
  verde. Su opción por defecto («dejarlas») sigue vigente.
- **Precio asumido: se pierde la única cobertura del target `pass` y del aviso
  `activity_commented`.** Hoy ninguna superficie de la app monta un target `pass` (comprobado:
  `resolveInteractionTargets` solo lo tiene en la unión de tipos), así que el e2e cubría una
  ruta que el usuario no puede recorrer. La cadena que sí importa —quien sigue a alguien ve su
  hito en el feed, entra al hilo, comenta y el autor recibe el aviso— se conserva, ahora sobre
  el target `post`.
- **Las aserciones de la campana pasan a afirmar el EXTRACTO, no la copia genérica.** Desde
  «notificaciones con contexto» (#799) un aviso de comentario con un solo actor pinta la
  variante enriquecida («{name} en tu publicación: «…»»), así que `/comentó tu actividad/` y
  `/comentó tu punto de control/` habrían quedado obsoletas en cuanto el test volviera a
  llegar hasta ahí. Afirmar el extracto ata además el aviso a ESE comentario y no a cualquier
  otro del mismo tipo.
- **Las otras seis rojas que salieron al verificar NO se encadenan a este arreglo.** Son la
  misma familia (specs que codifican un producto ya cambiado) pero tres causas distintas, y
  mezclarlas en una PR la hace irrevisable: quedan como **#802** (copia de la campana de #799,
  `posts.spec.ts` ×3), **#801** («Me gusta» renombrado a «corazón rojo», `social-optimista` y
  `social-safety:159`) y **#803** (reportar/borrar detrás del «···» por F3-012,
  `social-safety:92`). Las tres verificadas por ejecución contra un `next dev` limpio, no por
  lectura de código.
- **Trampa que costó una hora y conviene no repetir:** un `next dev` cuyo proceso padre se mata
  sigue escuchando en el 3000 y sirviendo 200, pero sus Server Actions revientan (`write EPIPE`,
  `Jest worker … exceeding retry limit`). Con ese servidor, los tests de aviso fallan ANTES —en
  el `expect.poll` de la fila de `notifications`— con «el aviso post_commented debe persistir»,
  que parece un bug de producto grave y no lo es. **Un e2e rojo contra un dev tocado no es
  evidencia de nada**: hay que relevantar el servidor y repetir.

## 2026-08-25 — Los seis e2e sociales caducados (#801, #802, #803)

- **Segundo pase sobre la misma familia, y otra vez el arreglo es del test.** Los seis tests que
  salieron rojos al verificar #787/#788 tenían tres causas distintas y ninguna era un bug: la
  copia de la campana cambió con #799, «Me gusta» dejó de existir como nombre accesible al entrar
  el catálogo de emoji libre, y reportar/borrar se fueron detrás del «···» con F3-012. Verificado
  por ejecución contra un `next dev` limpio: **11 de 11 en verde** en `posts.spec.ts`,
  `social-optimista.spec.ts` y `social-safety.spec.ts` (2,3 min).
- **El nombre accesible de un emoji se IMPORTA, no se copia.** Es la decisión que importa de este
  pase, porque va contra la causa: `social-optimista.spec.ts` ya se arregló una vez por esto
  mismo (#750, `7f9c3f69`) y volvió a caducar al cambio siguiente. Los specs ahora importan
  `QUICK_REACTION_NAMES` de `src/lib/social/reaction-constants.ts`; renombrar un emoji rompe el
  typecheck en el mismo commit, no la suite tres semanas después. El precio —un `import` de `src/`
  dentro de `e2e/`— ya lo pagaba `club-calendario.spec.ts`, así que no estrena nada.
- **La campana se afirma por el EXTRACTO, no por la copia genérica.** Misma decisión que en
  #787/#788, extendida a `posts.spec.ts`: con un solo actor y contexto guardado gana la variante
  enriquecida (`postCommentedExcerpt`), y el extracto ata además el aviso a ESE comentario. La
  excepción es el aviso de sesión compartida: su `subject` es el título del pase fixture, que el
  test no conoce, así que se afirma el tramo común a las dos variantes (`compartió una sesión de`).
- **Al abrir un desplegable antes de cortar el tráfico, el corte solo alcanza a lo que se quiere
  probar.** En «un fallo de Server Action se anuncia y revierte», abrir el `ReactionBar` es puro
  cliente; la ruta se aborta DESPUÉS de abrirlo, así que lo único que falla es el toggle de la
  reacción y el test sigue probando lo suyo (que el error se anuncia y el estado revierte).
- **`Reaccionar` deja de ser único dentro de una tarjeta en cuanto el hilo se expande.** Cada
  comentario trae su propia barra, así que los localizadores de tarjeta llevan `.first()` (el del
  POST va primero en el DOM, `ReviewInteractions` lo pinta antes del hilo). Sin eso el modo
  estricto de Playwright revienta al recargar con comentarios ya visibles.
- **El `page.once("dialog")` se arma antes del ÍTEM, no antes de abrir el menú.** El `confirm()`
  nativo de borrar sigue existiendo tras F3-012; lo dispara `confirmDelete`, que corre al pulsar
  la opción del desplegable. Armarlo antes de abrir el «···» deja el handler consumido a destiempo.
- **La copia muerta `social.like` («Me gusta») se BORRA de `messages/es.json`.** No la leía nadie
  (`grep` de `t("like")` en `src/` no devuelve nada) y era justo el rastro que hacía creer que el
  botón seguía existiendo. Una cadena de interfaz que nombra un control retirado no es inocua:
  es la pista falsa que el siguiente que lea el spec va a seguir.

## 2026-08-25 — El barrido del rastro desechable de los e2e (#800)

- **El diagnóstico de la #800 era incompleto y conviene decirlo.** La issue culpaba al `finally`
  que no corre cuando un test muere por timeout. Esa causa existe, pero **no es la que más filas
  deja**: los `deleteUser` de los specs hacen `fetch(...)` sin mirar `res.ok`, y cinco tablas
  (`club_posts.author_id`, `clubs.owner_id`, `club_activities.created_by`,
  `club_activity_checkpoints.created_by`, `club_activity_items.added_by`) referencian `auth.users`
  con **ON DELETE NO ACTION**. El borrado rebota, el test pasa en verde y el usuario se queda.
  Medido: de los 62 usuarios `@example.com` de `dev`, los 15 `reporta*` de `social-safety.spec.ts`
  —todos con un `club_post`— llevaban desde el 2026-07-30 pese a que ese spec termina bien.
- **Se barre ANTES de la suite, no se le pide a cada spec que limpie mejor.** Mismo patrón que
  `restoreQaSeed` (#215): reimponer el punto de partida en vez de confiar en que la pasada anterior
  se portara bien. Tocar los ~19 helpers `deleteUser` habría sido más código y seguiría sin cubrir
  el caso del timeout. Queda como issue #806 hacerlo BIEN también dentro de la pasada.
- **La marca de «desechable» para usuarios es el dominio `@example.com`, no el prefijo del nombre.**
  Los 19 `createUser` de la suite firman `<username>@example.com` y ninguna cuenta real usa ese
  dominio (la de `devtest` es de Gmail). El regex de prefijos que proponía la #800
  (`^(it|postauth|postcom)`) encontraba **6** usuarios; el dominio encuentra los **62** que había.
  La cuenta de `TEST_USER_EMAIL` se excluye explícitamente, pase lo que pase.
- **El barrido NO lanza; la semilla SÍ.** Son cosas distintas: correr sobre una semilla desviada
  hace que los tests mientan (#215), así que eso tumba la suite. Que una fila desechable se resista
  es suciedad: se avisa por consola y se sigue. Tumbar la suite entera por eso sería cambiar un
  problema de limpieza por uno peor.
- **Se borran también las referencias polimórficas al catálogo (`posts.anchor_id`,
  `passes.item_id`, `pass_reviews.item_id`, `collection_items.item_id`).** No tienen FK, así que
  nada las arrastra: borrar solo el libro dejaría el post huérfano en el feed de `devtest` — que es
  justo lo que compite con las aserciones que usan `.first()`/`.last()` sobre el feed.
- **Guarda de seguridad reutilizada, no inventada:** el barrido llama a `assertQaUniverse()` antes
  de tocar nada. Escribe con la SERVICE KEY y borra usuarios; si `.env.local` apunta a otro
  proyecto, aborta. Es la misma línea que el repo ya aceptaba para la semilla QA.
- **Trampa de PostgREST que devuelve 200 y cero filas:** entrecomillar el patrón de `like` (el
  reflejo, porque `[E2E]*` empieza por corchete) hace que busque las comillas DENTRO del texto.
  No da error: da éxito vacío, que parece «no había nada que barrer». Sin comillas salen 22/21/5/5,
  los mismos números que el `SELECT` de la issue. Cualquier filtro de barrido se comprueba contra
  un `SELECT` conocido antes de dejarle borrar.
- **Límite asumido:** solo se reconoce el catálogo con prefijo `E2E`/`[E2E]`. Varios specs titulan
  sin prefijo («Estreno dos …», «en curso …») y eso no se puede distinguir de un dato real por el
  título. Ampliar el patrón a ciegas es la clase de limpieza que un día se lleva algo que no debía.
  Queda como issue #807: que los specs nuevos usen el prefijo, no que el barrido adivine.

## 2026-08-25 (tarde) — Los sueltos de seguridad del bloque P2 de la auditoría (S2-08, S2-14, #681, #683)

- **La CSP nace PARCIAL a propósito, y esa es la decisión.** No declara `default-src`,
  `script-src` ni `style-src`: una CSP estricta de scripts exige un `nonce` por petición, y el
  nonce obliga a render dinámico —lo dice el propio doc de Next— que es exactamente lo que
  `cacheComponents` no puede dar (el shell estático se prerenderiza en build, cuando ese nonce
  todavía no existe). Poner `default-src 'self'` sin `script-src` sería peor que no poner nada:
  `script-src` heredaría de él y bloquearía los inline de Next, tirando la app entera. Lo que se
  cierra sin nonce se cierra ya (`frame-ancestors 'none'`, `base-uri`, `object-src`,
  `form-action`); el `script-src` con nonce queda como issue atada a la fase de Cache Components.
- **`upgrade-insecure-requests` se omite**: en `next dev` sobre `http://localhost:3000` haría que
  el navegador intentara subir a HTTPS los recursos propios. HSTS ya cubre el transporte donde
  importa, que es producción.
- **`Permissions-Policy` NO lista `camera`.** El escáner de códigos de barras es el plugin nativo
  de Capacitor y no se ha podido verificar en dispositivo que la política del documento no le
  afecte. No se restringe lo que no se puede probar; un `camera=()` a ciegas es la clase de
  cabecera que rompe una feature de móvil que nadie prueba en el navegador.
- **El arreglo de S2-14 gatea la TRANSICIÓN, no la columna.** El informe proponía «añadir esas
  columnas al trigger o revocarles el UPDATE», y las dos cosas rompen la app: `hydrated_at`,
  `editions_synced_at` y `openlibrary_work_key` las escribe la hidratación perezosa con el cliente
  de la petición de un usuario cualquiera, así que cerrarlas a colaborador reproduce **#699** —la
  hidratación muere con 42501 en silencio y las fichas se quedan sin sinopsis en prod, invisible en
  dev porque allí se prueba con cuentas admin. Lo que se prohíbe es reescribir o borrar un valor ya
  puesto; `null → valor` sigue abierto porque es lo único que hacen los cuatro escritores legítimos.
  Verificado en dev por los dos lados: el `PATCH` que repunta la work key y los dos que ponen las
  fechas a null salen bloqueados, y la secuencia completa de hidratación de un libro y una película
  recién creados pasa igual que antes.
- **Carrera conocida y aceptada:** dos pestañas abriendo a la vez una ficha recién creada — la
  segunda encuentra la columna ya escrita y su UPDATE muere con la excepción del trigger. Los
  cuatro escritores ignoran ese error a propósito desde antes (son best-effort), así que lo único
  que se pierde es un atajo que la primera pestaña ya había ganado.
- **La neutralización de fórmulas del CSV no toca los números.** `String(n)` no puede producir una
  fórmula —un `-5` es un número negativo para la hoja de cálculo, no una expresión— y prefijar un
  apóstrofo a la columna de notas o de relecturas la volvería texto para quien luego quiera
  sumarla. El prefijo defensivo se aplica solo a las celdas de TEXTO que empiezan por
  `= + - @`, tabulador o retorno de carro, que son las que Excel/Sheets/LibreOffice evalúan.
- **El tope de #683 se pone aunque por la vía normal sea inalcanzable.** Las filas sin match salen
  de un parseo ya capado a 3.000, así que ningún usuario puede llegar al guard; pero
  `saveUnmatchedBatch` es un **Server Action**, invocable a mano con el lote que se quiera. El
  criterio del repo ya era ese en `commitImportBatch` (mismo tope, misma razón).
- **Las cabeceras se defienden con un e2e, no con una revisión de `next.config.ts`.** Una
  regresión aquí no se ve en pantalla y el bloque convive con imágenes y Cache Components en el
  mismo fichero. `e2e/cabeceras-seguridad.spec.ts` afirma la propiedad sobre la respuesta real y no
  pide login, así que sigue verde sin cuenta de pruebas.

## 2026-08-25 (noche) — Los tres rojos crónicos de `main` (#731, #744, #805): los tres diagnósticos estaban mal

Los tres llevaban semanas en la suite y **ninguno era lo que decía su issue**. Lo que se lleva de
aquí, antes que cualquier detalle: **un rojo que sobrevive a varias sesiones deja de leerse como un
fallo y pasa a leerse como ruido**, y entonces tapa al siguiente. Los tres se cierran corrigiendo el
diagnóstico, que es lo que pide AGENTS.md.

- **#731 — dos diagnósticos falsos encadenados, y la causa era que la tarjeta no existe.** El
  primero («el feed filtra los `episode_watches` sin `pass_id`») ya se sabía falso: el feed lee
  `posts`. El segundo, el del `fixme` («los posts con `created_at` atrasado no llegan al feed»), es
  un **síntoma con causa sana**: Inicio pide los `pageSize + 1` = 21 posts más recientes de
  devtest ∪ seguidos y recorta antes de agrupar, así que sembrar con fechas atrasadas 1-3 días
  compite con la actividad real de `dev` —36 posts más nuevos que 2 días el día de la medición— y
  pierde. **Al arreglar la siembra (minutos en vez de días) aparecen cuatro tarjetas, no una
  agrupada: `group-feed-entries.ts` no lo llama nadie desde la migración a `posts`.** El spec
  afirmaba un producto retirado. Se borra; el agrupado vuelve con #555 y el módulo muerto queda en
  #814.
- **Regla para los e2e del feed, que es lo reutilizable:** en la cuenta compartida **no se siembra
  con fechas atrasadas**. La primera página del feed es un ranking contra la actividad real de
  `devtest`, o sea contra algo que cambia cada semana; un test que depende de eso no falla por lo
  que dice que prueba. Fechas de ahora, separadas por minutos.
- **#744 — el comando de repro ERA el bug.** `pase-hub.spec.ts` entero sale 8/8. «Regla 2» vive en
  un `describe.serial` y hereda `bookId` de «Regla 1»; correrla con `-g` deja fuera a su
  predecesora, el test navega a `/libro/?tab=log` y el fallo sale 20 s después como «no encuentro el
  botón Leyendo» — un síntoma que no nombra la causa, y que costó cuatro corridas y una acusación al
  producto. **El arreglo es la guarda `requiereLaRegla1()`**, no un cambio de producto: falla en
  124 ms diciendo exactamente qué pasa. Una dependencia entre tests que solo vive en un comentario
  del `describe` es una trampa; si es real, que la imponga un assert.
- **#805 — se borra el spec del splash.** El overlay se retiró en #446 y `src/components/splash` no
  existe. El test que MÁS razón tenía para irse era el que estaba en verde: afirmaba `toBeHidden()`
  sobre un elemento inexistente, o sea que pasaba sin probar nada.
- **F1-017 («migraciones fantasma») se declara CADUCADO, no pendiente.** Comprobadas una a una las
  88 funciones de `pg_proc` de dev contra `supabase/`: ninguna sin definición en el repo. Los cinco
  RPC que la fase 5 daba por perdidos se rescataron con el juego de #674; las tres que no están en
  `migrations/` viven en `schema-baseline.sql`. La comprobación cubre **funciones**, no policies ni
  grants — se dice el límite para que nadie lea de aquí más de lo que se midió.

## 2026-08-25 (noche, 2) — El landmark `<main>` vive en el armazón, no en cada página (#816)

- **Un `<main>` en `AppShell`, y ninguno en las páginas.** El hallazgo F4-023 era «faltan 15 de 17
  `<main>`», y la lectura fácil es «pon el que falta en cada página». Se hace al revés: el landmark
  sube al armazón —que ya envuelve `{children}` en un `<div>`— y los **cuatro** `<main>` de página
  (estadísticas ×2, género, notas) bajan a `<div>`. Las razones son dos y la segunda es la que
  manda: (1) arregla las 17 rutas de una vez, y (2) **la siguiente ruta que se cree lo tiene sin que
  nadie se acuerde.** Un requisito de a11y que hay que repetir en cada página nuevo es un requisito
  que se pierde — la prueba es que se perdió 15 veces.
- **O uno o el otro, nunca los dos.** Dos `<main>` anidados son otra violación de axe
  (`landmark-one-main`), así que el cambio no se puede partir en dos PR: subir el landmark y quitar
  los cuatro de página es un solo movimiento.
- **El skip-link no lleva dependencia nueva, y el test tampoco.** El anillo de foco ya lo pone la
  regla global `:focus-visible` de `globals.css`, así que el enlace solo declara `sr-only
  focus:not-sr-only`. Y la verificación **no añade axe al repo**: las dos reglas que importan se
  escriben como aserciones normales —«exactamente un `<main>` con `id="contenido"`» cubre a la vez
  el caso de cero landmarks y el de dos anidados, y el orden de tabulación se comprueba con un `Tab`
  desde la carga—. Meter una dependencia de auditoría para tres asserts habría sido pagar mucho por
  poco.
- **`getTranslations` en el armazón NO saca las rutas del prerender.** Era el riesgo real del
  cambio: `AppShell` está escrito a propósito para no esperar a nada (#435), y el skip-link necesita
  su cadena traducida. Medido contra el build de producción antes y después —`prerender-manifest`,
  **50 rutas prerenderizadas las dos veces, ninguna perdida**—; la configuración de next-intl de
  este repo no toca `cookies()` ni `headers()`, y por eso sale gratis. Si algún día el locale pasa a
  depender de la petición, esto deja de ser cierto y el skip-link tendría que ser cliente.
- **Lo que queda fuera, dicho a propósito:** `_global-error` se sirve sin `<main>` porque no pasa
  por el layout raíz (es el default de Next, el repo no tiene `global-error.tsx`). No es ninguna de
  las 17 rutas de la auditoría y no se toca.

## 2026-08-25 (noche, 3) — Contraste: uno de los dos tokens no se arregla con un valor (#815)

- **El hallazgo F4-022 eran dos tokens con DOS arreglos distintos, no uno repetido.** La auditoría
  proponía «oscurecer `--muted-foreground` y reclasificar los usos de `--foreground-faint`» como si
  fueran dos versiones del mismo retoque. Medidos, no lo son.
- **`--muted-foreground`: cambia el valor, y solo en claro.** De `#877e70` (3,41:1 sobre
  `--background`) a **`#6b6255`** — 5,11:1 sobre `--background`, 5,90 sobre `--surface`, 4,71 sobre
  `--surface-muted`, 4,21 sobre `--surface-3`. Con 836 usos, esa línea sola es la mayor parte del
  hallazgo. **En oscuro NO se toca**: medido, `#a99e8c` ya daba de 4,61 a 6,53 y pasa AA en los tres
  fondos. La issue daba el modo oscuro por «sin medir»; queda medido.
- **`--foreground-faint`: NO se puede arreglar subiendo el valor, y esto es lo nuevo.** Sobre papel
  (`#f3ece1`), cualquier color que alcance 4,5:1 cae en **L\* 42**, que es exactamente donde queda
  `--muted-foreground` (L\* 42,0 contra 42,6). O sea: el color «arreglado» es indistinguible de
  muted, y el peldaño que justifica que el token exista desaparece. **Un sistema de cuatro pesos de
  texto sobre papel no cabe entero por encima de AA.** Así que el arreglo no es retocarlo: es
  **sacarlo del texto**.
- **Regla mecánica en vez de juicio caso a caso.** Los 59 `text-foreground-faint` pasan a
  `text-muted-foreground`; los 3 `bg-foreground-faint` se quedan. Se eligió la regla por la forma,
  no por «esto informa y esto decora», porque esa clasificación es opinión y no sobrevive al
  siguiente que edite el fichero. Los tres supervivientes son dots `aria-hidden` con el estado
  escrito al lado, así que WCAG 1.4.11 no les aplica y no hace falta subirles nada.
- **Lo que esto le cuesta al diseño, dicho claro:** la app pierde un peldaño de gris. Los rótulos
  mono de 9-11 px (fechas, captions, ejes de gráfica, subtítulos) pasan de L\* 65 a L\* 42 y se ven
  bastante más oscuros. Es un cambio visible en toda la app y es el precio de AA — si algún día se
  quiere recuperar la jerarquía perdida, hay que hacerlo **sin color** (tamaño, peso, mayúsculas),
  no reinventando un gris claro.
- **Los números viven en un test, no en un comentario.** `src/app/contraste-tokens.test.ts` lee
  `globals.css` y comprueba los ratios en los **tres** bloques de tema (`:root`, `.dark` y el
  `@media prefers-color-scheme`, que es el defecto de quien no toca el interruptor), y falla si
  reaparece un `text-foreground-faint`. Duplicar los valores a mano en la doc es justo lo que dejó
  pasar el fallo original de `mark-accent`.

## 2026-08-25 (noche, 4) — Los párrafos son del autor: dónde se preserva un salto y dónde se recorta

- **Tres fallos distintos con el mismo síntoma.** «Escribo dos párrafos y sale un ladrillo» tenía
  tres causas independientes, y por eso se arreglan en tres sitios: (a) `RichTextView` pintaba una
  línea por `<span class="block">`, y una línea VACÍA no genera caja de línea — altura 0, párrafos
  pegados; (b) las reseñas (`MentionText`) no llevaban `whitespace-pre-line`, así que el HTML
  colapsaba TODOS sus saltos a un espacio; (c) `/post/[id]` reusaba el extracto de 200 caracteres
  del feed. Ninguno se ve arreglando otro.
- **`whitespace-pre-line`, no `pre-wrap`, para prosa de textarea.** Preserva los saltos (todos,
  también los seguidos) y sigue colapsando espacios y tabuladores. Es lo que se quiere con texto
  pegado desde otro sitio: se respeta la intención del autor sin heredar su sangría.
- **La clase vive en el componente de texto, no en cada llamador.** `RichTextView` se lleva
  `whitespace-pre-line break-words` dentro. La versión anterior dependía de que cada tarjeta se
  acordara, y tres se habían olvidado del `break-words` (una URL larga desbordaba). `MentionText`
  sigue siendo un primitivo inline y lo pone el llamador: se usa dentro de `<p>` con estilos
  propios y meterle una caja de bloque cambiaría el layout de quien lo use en línea.
- **El extracto es una decisión del FEED, no del dato.** `resolvePostDrafts` gana un `fullBody`:
  el feed y los mini-cards de contexto siguen recortando a 200 caracteres; `getPostEvent`
  (`/post/[id]`) sirve el texto entero. Antes la ruta propia del post —el sitio al que lleva
  «leer más» de facto— cortaba igual que el feed, y como **ninguna tarjeta tiene un «ver más»**,
  una reseña larga no se podía leer entera en ningún sitio de la app.
- **El «ver más» en la tarjeta del feed queda fuera a propósito** (issue aparte): es diseño, no
  arreglo, y el corte deja de ser un callejón sin salida en cuanto la ruta del post sirve el texto
  completo.
- **La cobertura tiene que medir GEOMETRÍA.** `e2e/texto-multilinea.spec.ts` mide con un `Range`
  dónde cae el segundo párrafo respecto al primero: con la línea en blanco pintada cae dos líneas
  más abajo, sin ella una. El texto es idéntico en los dos casos, así que sin motor de layout no
  hay nada que aseverar — un unitario no puede distinguirlos.

## 2026-08-25 (noche, 5) — El hito social lo publica la máquina, no cada llamador (#824)

- **Anula la regla anterior**, escrita en `autopost.ts` y en `manage-actions.ts`: «Autopost de hito:
  SOLO aquí (gesto deliberado del usuario en la ficha). NUNCA dentro de `applyTransition`, que corre
  también en import/quick-add/bulk». Se sustituye por: **la máquina publica por defecto y quien no
  deba publicar pide `silent`**.
- **El motivo de la regla vieja no existía.** Verificado: la importación **no pasa por la máquina** —
  `src/lib/import/commit-row.ts` inserta en `passes` con `status:'completed'` directamente, y
  `applyTransition` no aparece en `src/lib/import/`. Y quick-add, alta y «seguir» solo piden
  `planned`, para el que `milestoneFor` devuelve `null`: son inertes por construcción, no por la
  regla. O sea, protegía de una inundación que no podía ocurrir.
- **Lo que sí causaba: tres caminos mudos.** Un pase llega a `completed` por cuatro sitios, y solo
  uno publicaba. Se olvidaban el auto-cierre por última página (`sessions/actions.ts`), el Select de
  estado de la propia hoja de sesión, y el último episodio de una serie (`series/episode-actions.ts`).
  Sin post no hay tarjeta: **la reseña escrita a continuación no llegaba al feed de nadie**. Como una
  película solo se cierra desde la ficha, el fallo se leía como «las reseñas de libros no salen».
- **Por qué la máquina y no parchear los tres.** «Todo cambio de estado pasa por la máquina» ya era
  invariante del proyecto, así que `applyTransition` es el único punto por el que pasan todos los
  caminos — incluido el que se añada mañana. Parchear llamadores conserva la forma del fallo:
  se pasó de 1 camino a 4 y se olvidaron 3.
- **El defecto de la bandera es la mitad de la decisión, y va al revés de lo cómodo.** Publica salvo
  que se pida `silent`. Si fuera opt-in, un llamador olvidado **callaría en silencio** — que es
  exactamente cómo se perdieron tres caminos durante meses. Al revés, un llamador olvidado publica de
  más: se ve, se nota y se corrige. Hoy el radio de eso es cero (los administrativos solo piden
  `planned`), y aun así se marcan `silent` explícitos en alta, quick-add unitario y quick-add en
  bloque para que la intención esté escrita en la llamada.
- **No cambia cuándo publica el camino que ya funcionaba**: la condición sigue siendo
  `outcome.kind === "done"`, la misma que aplicaba `updateStatus`. Este cambio añade caminos, no
  reglas. Y `askResume` (que no escribe nada) sigue sin publicar: un hito de algo que no ha pasado
  sería mentira.
- **La cobertura es una tabla, no un caso.** `apply-transition.test.ts` fija el contrato del ejecutor
  (publica por defecto, calla con `silent`, no publica en `askResume`) y los tests de cada llamador
  fijan que no silencian lo que es un gesto del usuario. Es lo único que impide que el quinto camino
  vuelva a caerse por el mismo agujero.

## 2026-08-26 — Los avances no son material de descubrimiento

- **El raíl social de `/post/[id]` deja de proponer AVANCES** (`posts.kind = 'progressed'`), en sus
  dos bloques: «Más de {usuario}» y «Más sobre la obra».
- **Por qué.** Un avance es un latido de lectura, no una pieza de conversación: quien lee a ratos
  genera decenas sobre la MISMA obra. Y el ranking de `related_posts_by_author` premia justamente
  «misma obra» (+2), así que los avances del propio autor sobre el ítem que ya estás mirando
  copaban el bloque — un módulo de descubrimiento que solo descubría más de lo mismo.
- **Dónde vive el filtro, y por qué en dos sitios.** «Más de {usuario}» sale de una RPC, así que va
  en SQL (`20260879_related_posts_by_author_sin_avances.sql`, `create or replace` con
  `and p.kind <> 'progressed'`): si se filtrara en TS, el `limit` de la función contaría candidatos
  que luego se tiran. «Más sobre la obra» es una consulta directa a `posts` y lleva su `.neq`.
  Además `getPostContext` filtra los drafts en TS como segundo cinturón, porque el ledger de
  migraciones NO prueba qué función corre el entorno al que apunta la app.
- **Lo que NO se tocó.** Los avances siguen apareciendo en el feed y en el perfil; esto solo cambia
  el raíl de recomendación. Tampoco se tocaron los `watched` (episodios), que sí son una unidad de
  conversación aunque también se repitan sobre un mismo ítem — si algún día molestan, será otra
  decisión, no un descuido de esta.
- **Cobertura.** `e2e/post-layout.spec.ts` siembra los dos avances en la posición MÁS favorable
  (misma obra que el post visto, los más recientes) y exige que no salgan, con un pensamiento de un
  tercero como control positivo para que el test no pase por tener el raíl vacío.
## 2026-08-26 — El alta manual de catálogo vuelve por RPC (cabo suelto de #674)

- **El arreglo NO fue devolver el `grant insert` sobre `books`/`movies`/`series`.** Era el
  cambio de una línea y deshacía la pieza central de #674: el INSERT directo es justo lo que
  permitía a cualquier `authenticated` escribir `title`/`synopsis`/`director` inventados en un
  catálogo que ven todos. Se paga una migración más y una RPC nueva
  (`register_manual_catalog_item`) para que la única forma de que nazca una obra siga siendo una
  función `SECURITY DEFINER` que valida.
- **Y tampoco fue reutilizar `register_catalog_item`.** Esa RPC nace shells a partir de un id
  externo, y el alta manual no tiene ninguno: forzarla habría significado inventar un
  `openlibrary_work_key` falso o admitir canónicos en la puerta de alta automática, que es
  exactamente lo que #674 cerró. Son dos altas con contratos distintos y se quedan como dos
  funciones distintas.
- **El rol se comprueba en la base de datos, no solo en la server action.** Hasta hoy
  «colaborador+» vivía en dos sitios de JS (el guard de `page.tsx` y el `hasMinRole()` de la
  acción) y en ninguno de la base. Con el insert directo eso era discutible; con una RPC
  `SECURITY DEFINER` —que escribe como owner y por tanto **se salta RLS**— deja de serlo: si la
  única barrera fuera JS, cualquiera con sesión podría llamar a la RPC por REST y crear obras.
  El check de JS se conserva, pero para dar un error legible, no para proteger.
- **El error de la base deja de tragarse en silencio.** `if (error) return { error: "generic" }`
  sin un `console.error` es lo que hizo que esta regresión sobreviviera meses: producción
  llevaba el 42501 en cada intento y no había ni una línea de log. La regla que sale de aquí:
  un error de base que se traduce a un mensaje genérico se registra ANTES de traducirlo.
- **`revoke ... from public` no cierra a `anon`, y el escape se arregla solo en la función
  nueva.** Supabase concede `execute` a `anon`/`authenticated` por `ALTER DEFAULT PRIVILEGES` al
  crear la función: es un grant explícito por rol, así que revocar a `PUBLIC` lo deja intacto.
  `register_catalog_item`/`_bulk` arrastran ese cabo suelto y `anon` conserva `execute` sobre
  ellas en los dos entornos. Aquí se corrige solo la función nueva y lo demás se va a la issue
  #831: es inofensivo hoy (las tres cortan por `auth.uid() is null`) y meterlo en este cambio
  mezclaría dos diagnósticos en un diff que ya toca esquema en producción.
- **La cobertura era el agujero de verdad, no el permiso.** #674 se desplegó con verificación
  manual de sus propios caminos y con un e2e (`catalogo-server-authoritative.spec.ts`) que cubre
  el alta por búsqueda; `/buscar/manual` no tenía ningún test, así que nada se puso rojo. El
  arreglo incluye `e2e/alta-manual.spec.ts`, y se comprobó que **falla** con la RPC revocada
  antes de darlo por bueno.

## 2026-08-26 (2) — La etiqueta del tier manda sobre el layout de la fila

Reportado mirando la app en móvil: en una tierlist con niveles con nombre («Perezón histórico»,
«Ni fu ni fa (como dirían los entendidos)») se leía media palabra. Y, aparte, a 34×51 px no se
distinguía una portada de otra.

- **La columna de color de 44 px era una suposición sobre el contenido, no un dibujo.** El mockup
  Paper enseña una tierlist S/A/B/C/D, y de ahí salió un ancho fijo con `font-serif text-xl`. Pero
  la etiqueta es un campo LIBRE del asistente (`TierlistFields`), así que el ancho fijo solo era
  correcto para el ejemplo del mockup. Medido a 360 px, «Perezón histórico» pedía 67 px y «Ni fu ni
  fa…» 81 px en una caja de 44: el `overflow-hidden` de la fila hacía el resto.
- **La decisión es del TABLERO, no de la fila** (`layoutForTiers`, en `tierlist-types.ts`). Si
  alguna etiqueta pasa de tres caracteres, TODAS las filas pasan a banda de color superior y las
  portadas debajo; si ninguna lo pasa, todas conservan la columna del mockup. Mezclar los dos
  dibujos en el mismo tablero se lee como un fallo de maquetación, no como una decisión — por eso
  no se decide etiqueta a etiqueta.
- **Vive en el módulo plano y no en el componente** para poder probarla sin montar dnd-kit en el
  entorno `node` de vitest (`tierlist-layout.test.ts`).
- **Las portadas suben a 44×66 y la seleccionada CRECE (×1,6 ≈ 70×106).** Agrandar la miniatura a
  secas obliga a elegir entre ver la portada y ver el tablero; el zoom sobre la que ya hay que
  tocar para colocarla no cuesta ni un control nuevo ni ancho de pantalla. En tableros ajenos
  (solo lectura, sin selección) el mismo zoom va en `hover`/`focus-visible`.
- **Crece con la propiedad nativa `scale`, no con `transform`.** dnd-kit escribe `transform` en el
  `style` en línea durante el arrastre y machacaría cualquier escala puesta ahí. Consecuencia que
  hay que respetar: la portada se dibuja FUERA de su caja, así que ninguna fila del tablero puede
  llevar `overflow-hidden` — el redondeado de la columna/banda de color se declara en el propio
  hijo (`rounded-l-[9px]` / `rounded-t-[9px]`).
- **La cobertura mide rectángulos, no texto** (`e2e/club-tierlist-movil.spec.ts`, 360 px). Se
  comprobó que **falla** contra el código anterior («se sale de su fila» para las dos etiquetas
  largas) antes de darlo por bueno. Cubre también el camino contrario: con S/A/B la columna de
  44 px tiene que seguir ahí.

## 2026-08-26 (3) — La retícula de la tierlist es un índice; la hoja es donde se ve la obra

Continuación de la entrada anterior, con el tablero ya arreglado a 360 px. Dos peticiones que
resultaron ser la misma decisión.

- **Agrandar la miniatura no era la respuesta.** «A 44×66 aún cuesta reconocer la portada» y
  «quiero poder ampliarla» empujan en la misma dirección, pero subir el tamaño de la retícula
  obliga a elegir entre ver la obra y ver el tablero: a 360 px cada 10 px de portada son una
  columna menos. La retícula pasa a 56×84 y se queda ahí — es un ÍNDICE, no un escaparate — y
  tocar una portada abre una hoja donde la obra se ve grande (46vh), con su tipo y su título
  escritos. Reconocer una obra deja de depender de la resolución de una miniatura.
- **Los botones de tier se mudan a la hoja.** Vivían en una fila al pie del tablero: obligaba a
  mirar arriba (qué seleccioné) y tocar abajo (dónde va), y con la portada diminuta ni siquiera se
  sabía lo primero. Ahora el nivel se elige junto a la portada que se está colocando, y elegirlo
  cierra la hoja. La fila del pie desaparece; queda solo el rótulo «Toca una portada para
  colocarla», que es lo único que aportaba cuando no había nada seleccionado.
- **El nivel actual se marca con `aria-pressed`, no deshabilitándolo.** Deshabilitar el nivel donde
  ya está el ítem le quita al lector la única pista de dónde estaba si se equivoca de destino.
- **Cerrar la hoja deselecciona, y volver a tocar la portada también.** «Seleccionado» ya no es un
  estado que sobreviva a la interacción: o colocas, o cierras. Antes una portada se quedaba marcada
  indefinidamente sin decir para qué.
- **En tableros ajenos es la misma hoja sin botones.** El gesto significa lo mismo en los dos
  tableros y no te saca de la actividad sin querer; el salto a la ficha sigue ahí como enlace
  explícito dentro de la hoja.
- **El guardia de navegación de la hoja compara la RUTA, no un booleano.** El patrón copiado de
  `sheet-shell.tsx` (`if (!navGuard.current) { navGuard.current = true; return; }`) hacía que la
  hoja no llegara a verse nunca en `next dev`: el efecto se invoca dos veces con las mismas
  dependencias (StrictMode) y la segunda pasada encontraba el guardia puesto y cerraba la hoja
  recién abierta. Y `showModal()` se llama solo si el `<dialog>` no está ya abierto, que es el
  idioma del resto del repo. Lo mismo puede afectar al editor de sagas: issue #839.

## 2026-08-26 (4) — La columna del tier vuelve, con dos anchos; la retícula pasa a grid fluido

Rectifica la entrada (2) de hoy. La banda superior resolvía el recorte pero cambiaba el dibujo del
mockup por otro, y no convencía. Dos cambios, uno por cada mitad del problema.

- **La columna de color vuelve, con DOS anchos** (`tierColumnWidth`): 44px con el serif del mockup
  para S/A/B/C/D, y 84px con rótulo mono pequeño y envuelto en cuanto un nivel tiene nombre. El
  error original no era la columna: era que su ancho fuera **uno solo** para un campo de texto
  libre. La banda queda descartada.
- **El ancho lo decide el TABLERO, no la fila.** Con el ancho por fila, las portadas de cada tier
  arrancarían en una vertical distinta y la retícula dejaría de leerse como una tabla. Es la misma
  razón por la que la decisión anterior también era por tablero, aunque el resultado sea otro.
- **Las portadas pasan de `flex-wrap` con ancho fijo a un grid de columnas fluidas**
  (`repeat(auto-fill, minmax(48px, 1fr))` + `aspect-[2/3]`). Con el flex, el sobrante de cada línea
  se quedaba a la derecha como hueco muerto — que es lo que se veía y lo que se pidió arreglar.
  Ahora las que caben se reparten el ancho exacto.
- **Coste aceptado y medido:** con la columna ancha, en la fila de un tier caben 4 portadas de
  52×78 a 360px; en la bandeja «sin clasificar», que no tiene columna, caben 5 de 57×86. La misma
  portada se dibuja un 10% más pequeña dentro de un tier que en la bandeja. Es el precio de
  recuperar la columna: esos 84px salen del ancho de las portadas, y no hay forma de tener las dos
  cosas a 360px.
- **El rótulo de cuatro líneas puede dejar huérfano el último trozo** (el ")" de "…los
  entendidos)"). `text-wrap: balance` NO lo arregla aquí — probado: la caja es un flex container y
  el reparto no llega al texto del `<span>`. Se deja así: se lee, que era el requisito.

## 2026-08-26 (5) — Los tiers van pegados: son una tabla, no tres tarjetas

Cambio de forma sobre la entrada (4). Cada fila era una tarjeta con su borde, su redondeo y 8px de
aire hasta la siguiente; las tres columnas de color quedaban como tres bloques sueltos en vez de
como la escala continua que es una tierlist.

- **El borde y el redondeo suben al contenedor del tablero**, y cada fila solo pone su línea de
  separación (`border-b`, que la última no gasta). Así entre tier y tier hay UNA línea, no dos
  bordes pegados, y las columnas de color forman una sola franja continua.
- **El `overflow-hidden` vuelve, pero al contenedor**, que es lo que recorta las esquinas
  redondeadas de las columnas de color de la primera y la última fila. Es seguro justamente porque
  la etiqueta ya no depende de él: con la columna de 84px el rótulo cabe envuelto, y el e2e mide
  que no se sale ni de su caja ni de su fila.
- **El realce de «soltando aquí» pasa de borde a `outline`.** El borde ahora lo comparten dos
  filas, así que cambiarle el color a una se lo cambiaba a su vecina; un `outline` no ocupa sitio
  ni desplaza nada.

## 2026-08-26 — Notas de voz como comentarios

- **Nota de voz = comentario (3 columnas), no tabla nueva.** `audio_path`/`audio_duration_ms`/
  `audio_peaks` en `comments`, con CHECK texto-XOR-audio. Todo el aparato social se hereda
  gratis: hilos, spoiler, fijado, reacciones, notificaciones, RLS de bloqueos, `report_comment`.
  Construir una tabla `voice_notes` aparte habría duplicado ese aparato entero solo para
  distinguir un tipo de cuerpo.
- **Bucket privado + URL firmada de 1 h, primer uso de `createSignedUrls` en el repo.** Sin
  policies sobre `storage.objects` — ni SELECT ni INSERT para `anon`/`authenticated`, solo
  service-role. La reproducción respeta bloqueos y privacidad exactamente igual que el
  comentario que la contiene, porque solo se llega al audio firmando su URL al renderizar el
  hilo, nunca por acceso directo al objeto.
- **Los frenos (3 por hilo, no consecutivo, 20/día) viven en la server action, no en un
  trigger** — a diferencia del tope de reacciones, que sí vive en trigger. La diferencia es que
  `addVoiceComment` es la ÚNICA vía de escritura de una nota de voz (no hay upsert directo desde
  cliente contra `comments` con audio), y los frenos consultan agregados por usuario
  (`count`/`gte created_at`) que un trigger de fila no puede mirar sin una consulta extra por
  INSERT; hacerlo en la action evita esa vuelta y mantiene la lógica junto a la validación de
  tamaño/duración/mime que de todos modos vive ahí.
- **Audio inmutable: sin `grant update` en las 3 columnas de audio.** Una nota de voz publicada
  no se edita (el MVP no edita audio, spec §9); igual que `passes.dropped_reason*`, un hueco de
  UPDATE es intencionado y queda documentado en DRIFT-CHECK superficie 6, no un olvido.
- **Path de Storage `<user_id>/<uuid>.<ext>`, desviación deliberada de la spec** (que pedía
  `<comment_id>.<ext>`): el `id` del comentario no existe hasta el INSERT y la secuencia manda
  subir el objeto ANTES (validar → subir → insertar; si el insert falla, se borra el objeto).
  Un `uuid` fresco da la misma garantía de no-colisión sin depender de un id que aún no existe.

## 2026-08-26 (6) — El SW solo guarda documentos que el servidor no marque como personales (#680)

**Contexto.** El service worker (v3) guardaba en Cache Storage el HTML de TODA navegación con
éxito como salvavidas offline, también las autenticadas, y nada lo purgaba al cerrar sesión. En
un dispositivo compartido y sin red, otra persona podía recibir el HTML privado de la cuenta
anterior (issue #680).

**Decisión, en dos cinturones:**

1. **La cabecera del servidor decide qué documento es cacheable, no una lista de rutas.**
   `swCacheableDocument(ok, cacheControl)`: solo se guarda un documento con éxito cuyo
   `Cache-Control` no lleve `no-store` ni `private`. Next sirve toda página dinámica (las que
   leen sesión) con `no-store`, así que esa cabecera ES la línea entre «HTML igual para todos»
   y «HTML de una cuenta». Consecuencia medida contra el build de producción: **hoy ningún
   documento entra en caché** (el layout raíz lee sesión y hasta `/login` sale `no-store`), y
   la navegación offline degrada a la página `/offline` genérica (pre-sembrada en `install`,
   que no mira cabeceras). Es el comportamiento que pedía la issue, y si mañana una ruta pasa a
   ser de verdad estática-cacheable, se cachea sola sin tocar el SW.
2. **El logout purga el caché entero y re-siembra `/offline`.** `logout-button` manda
   `postMessage({type:"purge-caches"})` fire-and-forget (el SW sobrevive a la navegación del
   logout); el SW borra `CACHE_NAME` y vuelve a añadir `/offline`. No se distingue documentos
   de estáticos: los estáticos con hash se re-cachean solos al siguiente uso.

**Además:** bump a `biblioshare-v4` para que `activate` tire las copias privadas que ya están
en disco de usuarios reales (mismo mecanismo que el v2→v3 de 2026-07-16), y evict de la copia
vieja de una URL cuando su respuesta fresca llega marcada personal. Cubierto por
`sw-strategy.test.ts` (5 casos nuevos sobre el fichero real en vm) y el e2e opt-in
`e2e/sw-privado.spec.ts` (build de producción: nada autenticado en caché + purga tras logout).

## 2026-08-26 (7) — El barrido de `instant = false` termina en 18 opt-outs deliberados (#476)

**Contexto.** El codemod de la Fase 4 (#448) puso `export const instant = false` en los 57
segmentos para dejar el build en verde al activar `cacheComponents`. El barrido de #476 (lotes
1–4, PRs #858/#859/#860/#861) lo retiró de las 42 rutas con tráfico, priorizadas por el
baseline: cada una quedó con boundary (`loading.tsx` o página síncrona + `<Suspense>`) y
esqueleto que reserva alturas. `/notas`, `/sagas` y `/login` pasaron de `ƒ Dynamic` a
`◐ Partial Prerender`.

**Decisiones que fija esto:**

1. **La validación de shell estático queda activa para toda la app** desde que el layout raíz
   perdió su `false` (lote 1): un `false` en la raíz la apagaba ENTERA (doc `instant.md`,
   «Disabling static shell validation»). Toda ruta nueva sin opt-out propio debe producir shell
   no vacío o su build falla — es la red que el codemod había desconectado.
2. **Las 17 pantallas de gestión/editores conservan el opt-out a propósito** (acta #862):
   admin, ajustes, cuenta, importar, onboarding, sagas/nueva, buscar/manual, editores de saga y
   la ruta interceptada del modal de sesión. No es deuda: es lo que planificó la Fase 5.
3. **`instant = false` no es un opt-out de PPR** (medido en #514): retirarlo de rutas con
   `notFound()` no cambia la semántica del 404 en producción (ya era blando). La única
   excepción operativa es `/genero/[slug]`, cuyo e2e asevera 404 duro: queda con opt-out hasta
   que #468 decida (anotado en #857).
4. **Regla nueva para e2e**: con la metadata streameada, Next pinta el `<title>` dentro del
   `<body>` — los `getByText` laxos que casen el título de la página rompen por strict mode
   (arreglado `navegacion-anonima:27` con `exact: true`).

## 2026-08-27 (1) — El CTA del pase vive en las DOS caras de la ficha, y un primario por vista deja de ser aspiración

**Contexto.** La crítica de diseño de Inicio, Colección y la ficha (snapshots en
`.impeccable/critique/`) midió lo mismo en las tres: a 390 px, la app no tiene acción primaria
donde `PRODUCT.md` dice que se juega el producto. En la ficha, con pase abierto, había **cero
elementos con fondo de acento y caja visible** en las tres pestañas — el raíl que llevaba el CTA
es `hidden lg:block`. La asimetría era la mala: la obra que NO tienes sí pintaba su terracota
(«Seguir»); la que estás leyendo, no. En Colección, la pantalla que se llama «Mi Biblioteca» no
ofrecía ninguna forma de añadir nada en cuanto tenías una obra. Y en el arranque en frío de
Inicio se pintaban TRES primarios naranjas a la vez, ante quien no tiene ni idea de por dónde
empezar.

**Decisiones que fija esto:**

1. **El CTA del pase es de las dos caras, no del raíl.** `HeroStatusOrFollow` acepta
   `ctaHref`/`ctaLabel` y, con pase activo, pinta la píldora de estado **y** el CTA. Los valores
   son los mismos que ya recibía `ItemRailActions` en las tres rutas, así que no hay dos fuentes
   de verdad: si cambia el destino, cambia en la página y las dos caras lo heredan. La forma sí
   difiere a propósito — píldora en el hero (comparte hueco con «Seguir» y con la píldora de
   estado, y lo que se pulsa es píldora), caja de 10 px en el raíl, que es su lenguaje.
2. **Un primario por vista se aplica al ARRANQUE EN FRÍO, no solo al estado cálido.** El único
   naranja del Inicio vacío es el de la columna personal: fijar una meta o seguir gente no valen
   de nada sin obras que contar. `stats-welcome` y el vacío de `feed-list` bajan a `secondary`.
   Mismo criterio en Colección: la alta va en primario en la cabecera y el botón del estado vacío
   de la rejilla baja a `secondary`, porque es la misma acción 200 px más arriba.
3. **La acción de alta de la biblioteca vive en la cabecera de página**, no solo dentro del
   estado vacío: en las tres pestañas y sin depender del scroll (la rejilla mide 23.062 px en
   móvil). Término del glosario: «Añadir obra», no «ítem».
4. **Los glifos Unicode no hacen de iconos.** El `+` del CTA del raíl pasa a `PlusIcon` del set
   propio. Un carácter de texto ni hereda el trazo de 1.8 ni renderiza igual entre plataformas.

**Lo que NO decide esto.** Inicio sigue sin primario en estado **cálido** (la tarjeta destacada
ofrece «Sesión» y «Registrar», ninguno en acento). Cuál de los dos merece el naranja —o si la
respuesta correcta a «¿Qué has disfrutado hoy?» es un tercer botón— es una decisión de producto
que no se cuela en un arreglo de consistencia. Queda como issue.

## 2026-08-27 (2) — El 100 % se reserva para el final alcanzado, y un pase que llega al final tiene salida

**Contexto.** Segunda incidencia P1 de la crítica de Inicio. La tarjeta destacada decía
«Pág. 668 / 669», «100 %» y «En curso» a la vez, y sus dos únicas acciones eran «Sesión» y
«Registrar». `Math.round((668/669)*100)` da **100**: un pase al que le quedaba una página se
anunciaba como completo. La interfaz preguntaba «¿Qué has disfrutado hoy?» y **no tenía botón
para la respuesta más probable** —«lo he terminado»—; mientras tanto, el feed de al lado mostraba
el mismo título como FINALIZADO. La pantalla se contradecía a sí misma en el mismo golpe de
vista, en el instante de mayor atención, y quien lo veía no podía saber si su registro se guardó.

**Decisiones que fija esto:**

1. **Un porcentaje de progreso nunca redondea hacia arriba hasta 100.** El 100 se RESERVA para
   `current >= total`; por debajo se trunca a 99 como mucho, y no baja de 1 habiendo empezado.
   La regla no es nueva —ya la aplicaban `libraryPercent` (`derive-person-works.ts`) y
   `deriveWorkProgress` (`people/work-progress.ts`)—; lo que faltaba era un sitio único donde
   vivir. Ahora es `passPercent`, en `src/lib/library/progress.ts`, al lado de `getProgress`.
   Lo usan el destacado de Inicio y su mini, el raíl de libro y serie, la barra del pase de la
   ficha y los dos generadores de eventos de feed. **Trunca en vez de redondear en todo el
   tramo**: el cursor no debe adelantar al lector en ningún punto, no solo al final.
2. **Un pase que llega a su final y sigue abierto tiene salida desde donde se está mirando.**
   `TodayActions` pinta «Marcar terminada» cuando el progreso está completo, con la misma máquina
   que la ficha (`updateStatus` → hoja de puntuar/reseñar en la ficha vía `?cerrar=<passId>`,
   igual que ya hacían `MarkSeen` y `work-status-control`). No se encadena la hoja *dentro* de la
   tarjeta porque al completar la obra deja de ser `in_progress` y la revalidación la saca del
   foco: el modal se desmontaría en el acto.
3. **La salida se come el hueco de la acción por tipo, no se suma a ella.** Con «Marcar
   terminada» en pantalla desaparecen el cronómetro (un libro en su última página no necesita
   reloj) y «marcar episodio» (no queda ninguno): dos botones de 174 px a 390, no tres
   apretados. Con el cronómetro **en marcha** no aparece — primero se registra la sesión en
   vuelo, que es la que cerrará el pase sola por el auto-cierre.

**Por qué queda ese estado si existe el auto-cierre.** `saveSession` cierra el pase cuando la
sesión alcanza `maxPosition`, que es el total de TU edición. Un pase puede quedarse en su última
página sin que salte: si la posición se puso a mano desde Progreso, o si el total de la obra no
es el de la edición del pase. La salida manual es la red para esos casos, no un duplicado del
auto-cierre.

**Media crítica era falsa, y conviene dejarlo escrito.** El informe leía el feed diciendo
«terminó The Final Empire · FINALIZADO» junto a un destacado «En curso» y lo daba por una
contradicción de datos. No lo es: hay **dos pases** de esa obra (uno `completed` del 15/7 y otro
abierto desde esa misma tarde), el post del feed es del primero y la tarjeta lo dice —«2.ª
LECTURA»— en su primera línea. Verificado en `passes` de dev. Lo único roto era el número. Se
anota para que nadie salga a cazar un bug de estado que no existe.

**Lo que NO decide esto.** Sigue sin tocarse el resto de porcentajes de la app —metas, encuestas
de club, avance de sagas y de retos—, que cuentan ítems terminados y no la posición dentro de una
obra: ahí el 100 sí es cierto cuando el contador lo dice.

## 2026-08-27 (3) — Los tres números de Colección dejan de contradecirse

**Contexto.** Tercera tanda de P1 de la crítica de diseño, todas en `/coleccion` y todas de la
misma familia: cifras que no cuadran con lo que la pantalla enseña. Medido en la cuenta de dev
(138 pases activos: 127 películas, 9 libros, 2 series; 22 colecciones con 2 títulos dentro).

**Decisiones que fija esto:**

1. **Un filtro que el usuario no ha puesto se dice en voz alta y con su salida.**
   `resolveEffectiveType` aplica el interés único declarado en el onboarding (issue #313), así que
   una cuenta con `interests = {book}` entraba viendo **9 obras de 138** —el 93 % escondido— y la
   única señal era el «1» de la píldora de Filtros. Ahora la barra pinta un chip **fuera** del
   desplegable —«● Solo Libros ×», enlace a `?type=todos`— con `aria-label` propio. Dentro del
   desplegable no vale: ahí sigue siendo invisible hasta abrirlo, que es justo el problema.
   La regla general: **el `?type=` que puso el usuario se ve en el desplegable; el que puso la app
   se ve en la barra.**
2. **«Limpiar» tiene que limpiar también lo que no se ve.** `clearHref` emitía la AUSENCIA de
   `type`, y la ausencia es «arranque por defecto», que vuelve a aplicar el preferido: pulsar
   Limpiar dejaba el filtro puesto. Con tipo bloqueado emite el centinela `type=todos`.
3. **Cero resultados solo significa «vacía» si no hay nada filtrando.** Buscar algo inexistente
   devolvía «Tu biblioteca está vacía», «Aún no has añadido nada» y «Buscar algo» —tres líneas
   falsas a la vez sobre 138 obras—, y el botón mandaba al catálogo común cuando lo que había que
   hacer era quitar el filtro. `LibraryGrid` recibe `clearHref: string | null`: con filtros
   puestos dice «Nada que enseñar aquí» y ofrece «Ver toda la biblioteca».
4. **La cabecera de Colecciones cuenta lo que hay DENTRO, no la biblioteca entera.** Decía «22
   colecciones · 138 títulos» sobre una rejilla que sumaba 2, con «136 títulos sin organizar» al
   pie de la misma pestaña: tres cifras incompatibles. Ahora es «22 colecciones · 2 títulos
   dentro», y **2 + 136 = 138** cierra a ojo. Se cuentan títulos DISTINTOS (`countDistinctItems`),
   no filas: el mismo libro en tres colecciones es un título dentro, y contar filas volvería a
   romper la resta.

**Lo que NO decide esto.** Sigue abierto **cuándo debe dejar de aplicarse el lock del onboarding**.
Hoy se aplica siempre que haya exactamente un interés declarado, sin mirar qué hay en la
biblioteca; con 129 obras de otros tipos dentro, el interés declarado hace meses ya no describe a
este usuario. El chip lo hace visible y quitable, pero **no se recuerda**: volver a `/coleccion`
lo reaplica. Poner una preferencia persistente —o un umbral por el que el lock caduque— es una
decisión de producto con esquema detrás, y va como issue. Tampoco se toca la longitud de la
página (23.062 px a 390 sin paginar ni `sticky` en los filtros): es el cuarto P1 de esa crítica y
es otro frente.

## 2026-08-27 (4) — El suelo AA declarado se aplica: roles, foco y la tinta que se componía por debajo

**Contexto.** Cuarto frente de la crítica de las tres vistas. `PRODUCT.md` declara **WCAG 2.1 AA
como suelo**, y las tres vistas lo incumplían en sitios concretos y medibles. Se midió con un
escáner propio que resuelve el color en un canvas: el primer intento parseaba `getComputedStyle`
a mano y daba ratios inventados, porque **Tailwind v4 emite `oklab(...)` para `/70` y para
`color-mix`** y esos números no son RGB. Media docena de «fallos» de la primera pasada eran del
escáner, no de la app.

**Decisiones que fija esto:**

1. **Las pestañas de la ficha son un `tablist` de verdad, flechas incluidas.** Eran cuatro
   `<button>` pelados —sin `role`, sin `aria-selected`, con el subrayado de la activa marcado
   `aria-hidden`—: para un lector de pantalla no había pestañas ni una activa. Y el patrón no se
   puede dejar a medias: `role="tab"` **anuncia** navegación por flechas, así que sin ←/→/Inicio/
   Fin y sin `tabIndex` móvil se prometería un teclado que no existe.
2. **Una interacción que reordena la pantalla mueve el foco y lo dice.** Destacar una obra en
   Inicio desmontaba el botón pulsado y remontaba el destacado: el foco caía a `<body>` y la
   página no tenía **ni un** `aria-live`. Ahora el foco va al destacado (`tabIndex={-1}`) y un
   `role="status"` anuncia «{título}, ahora en el destacado». El foco solo se mueve tras un clic
   del usuario —un `ref` guarda esa distinción— para no robarlo en el primer render.
3. **Lo que navega lleva `aria-current="page"`; lo que despliega, `aria-expanded`.** Subpestañas
   de Colección, chips del feed y los cinco grupos del desplegable de filtros marcaban la opción
   activa **solo por color**. Y el panel de filtros decía `role="menu"` con hijos que no son
   `menuitem`: eso mete al lector en modo aplicación esperando flechas entre opciones, cuando lo
   único que funciona ahí es el Tab. Es un **desplegable**, y ahora lo declara. De paso, el foco
   entra en el panel al abrirlo, Escape lo devuelve al disparador, y **salir el foco del conjunto
   lo cierra** — que es lo que arregla el Shift+Tab que se iba detrás de la hoja opaca en móvil.
4. **La Tinta Fantasma se aplica también a la composición, no solo al token.** El repo ya
   legislaba el contraste y tiene test, pero **el test mira el token y la pantalla pinta el
   resultado**. Tres formas de romperlo, las tres retiradas: `opacity-60` en los recuentos de
   género (2,55:1), `text-muted-foreground/70` en la hoja de ediciones (3,08:1) y `opacity-80`
   sobre la tarjeta de un pase viejo (3,23:1). La regla operativa: **se atenúa el papel, nunca la
   tinta** — el pase viejo pasa de `opacity-80` a `bg-surface-muted/50`, misma jerarquía y el
   contraste SUBE.
5. **La triada de medio tiene par de tinta.** `--type-book/movie/series` son colores de GRÁFICO
   (3:1: barras, puntos, filos, lomos del logo) y como texto se quedaban en 3,64:1 sobre su
   propio tinte. No se oscurecen enteros —los comparte media app—, así que va un par oscuro solo
   para texto: `--type-*-ink`, al que apunta `MEDIA_ACCENT.text`. **Mismo patrón que
   `--accent-ink` y `--gold-ink`, que ya estaban ahí por la misma razón.** Calibrados contra los
   quince fondos sobre los que llegan a pintarse, con margen: un tinte sobre otro tinte ya había
   tirado de 4,5 a 4,47 en el historial de pases.
6. **El chip activo del feed no se rellena.** Ni `--accent` (3,8:1) ni `--accent-ink` (4,27:1)
   llegan sobre el tinte del propio acento. Se quita el relleno y la tinta cae sobre superficie
   limpia (4,88:1) — que además es lo que decía la maqueta desde el principio: «se tiñe de accent
   en texto y borde **en vez de rellenarse**».
7. **Encabezados sin saltos.** `pass-diary` y `episode-list` pasan de `h3` a `h2`: el único nivel
   por encima es el `h1` del título de la obra, y el índice de encabezados es cómo se mueve por
   la página quien no la ve (1.3.1).

**Lo que NO decide esto, y los números para quien lo recoja.**

- **El cuarteto de estado no tiene par de tinta y lo necesita.** Medido sobre sus fondos reales:
  `--status-planned` **1,75:1**, `--status-in-progress` **2,14:1**, `--status-completed`
  **3,77:1**, `--status-dropped` **3,78:1** — y `text-status-dropped` es el rojo de **todos** los
  errores de formulario. No se arregla oscureciendo los tokens: harían falta k≈0,42 y k≈0,36, que
  cambian la identidad del estado (el oro «en curso» dejaría de ser oro). Pide pares `-ink` y una
  revisión de los 128 `text-status-*` del repo, uno por uno. Va como issue.
- **El tamaño de diana no es del suelo declarado.** Los 32 px de la tarjeta de biblioteca no
  incumplen WCAG 2.1 AA (el 44 es 2.5.5, que es **AAA**; el mínimo AA de WCAG 2.2 son 24 px). Se
  les pone `tap-44` igualmente porque es convención del repo, y el `gap` sube de 6 a 12 px: con 6
  las dos áreas de 44 se solapaban y la de arriba le robaba pulsaciones a su vecina, que es justo
  contra lo que avisa el comentario de `tap-44` en `globals.css`.
- **El wordmark se queda a 4,31:1.** «Biblio**share**» es nombre de marca, y 1.4.3 exime
  explícitamente logotipos y nombres de marca. No es deuda: es la excepción.

## 2026-08-27 (5) — La rejilla de Colección se pagina; el cuarteto de estado, corregido

**Contexto.** Cuarto P1 de la crítica de diseño: `/coleccion?tab=todo` pintaba la biblioteca
**entera** en una sola página. Medido a 390px con 138 obras: **23.066 px de alto — 27,3
pantallas — y 4.492 nodos de DOM**. La barra de filtros vive arriba y no era `sticky`, así que
quien llegaba al final la tenía a 22.000 px de scroll.

1. **Se pagina por URL (`?n=`), no con scroll infinito.** Mismo mecanismo que el índice de sagas,
   que ya lo resolvió así: el enlace es real, la posición es compartible y «Atrás» vuelve a la
   misma cantidad de obras. El scroll infinito no da ninguna de las tres y además deja sin final
   a la página. `LibraryGrid` ya declaraba un prop `limit` — **nunca se le pasaba nada**; ahora
   sí.
2. **La página es de 24, no de 12 como en sagas.** La celda es una PORTADA, mucho más baja que
   una tarjeta de saga: 24 son 12 filas en móvil y 3 en la escalera más ancha
   (`2xl:grid-cols-8`), y divide exacto en 2, 3, 4, 6 y 8 columnas — todas las paradas de
   `COVER_GRID_COLS` menos `lg`.
3. **`getLibraryView` devuelve `total`.** Con tope, `items.length` no puede contestar ni «¿queda
   algo?» ni el «N de M» del pie. Se cuenta **después** de ocultar abandonados y **antes** de
   recortar: contarlo antes haría que el pie prometiera obras que la rejilla no va a pintar
   nunca — esas ya las cuenta `hiddenDropped`, aparte.
4. **La mecánica de «Cargar más» sube a `components/ui/load-more.tsx`.** Entre el pie de sagas y
   el de Colección lo único que cambiaba era el dibujo de las filas fantasma; el resto —`scroll:
   false` para no perder el sitio, `useTransition` para poder pintar el pendiente fuera del
   `<Link>`, y el paso limpio del clic con modificador— es la parte razonada, y duplicarla habría
   duplicado justo eso. `SagaLoadMore` queda como envoltorio con su esqueleto.
5. **La barra de filtros se pega a partir de `sm`, NO en móvil, y es una decisión con número.**
   Apilada mide **81 px**, que sobre los 59 de la topbar serían 140 px —el **17 %** de una
   pantalla de 844— de cromo permanente. En una sola fila mide 63 px y el coste es asumible. En
   móvil el alcance lo arregla la paginación, que dejó la página en **5,7 pantallas**: el
   problema de alcance era una CONSECUENCIA de las 27, no una causa aparte.
6. **El «N de M» se queda cuando ya no falta nada.** Es la señal de que la rejilla se acabó; sin
   él, el último lote parecía cortado a mitad.

**Corrección a la entrada (4).** Las cifras del cuarteto de estado que dejó apuntadas aquella
entrada estaban medidas sobre fondos de chip, no sobre los fondos donde cada token pinta de
verdad, y **el recuento inducía a error**. Medido correctamente (issue #892): de los 129
`text-status-*` del repo, **122 son `text-status-dropped`** — el rojo de error de formulario,
sobre `--surface`— y dan **5,38:1 en claro y 5,10:1 en oscuro**: están bien y no hay que
tocarlos. Quedan **7 usos de texto**. El grueso del problema no es texto: es el **punto** de la
rejilla, que con `dotOnly` es el único portador visual del estado y se queda en **2,00:1**
(`planned`) y **2,50:1** (`in-progress`) contra su anillo en tema claro — por debajo del 3:1 de
**WCAG 1.4.11**, que es AA. El trabajo es más pequeño de lo que decía la entrada (4) y un trozo
es un incumplimiento más serio.

- **La fusión de obras aborta ANTES de escribir, no a mitad.** Todo conflicto de dato de usuario
  —incluido «un pase usa la edición del perdedor que habría que borrar por ISBN duplicado»— se
  decide en una guarda previa que solo lee. Antes ese caso concreto salía como un `P0001
  edition_in_use` crudo lanzado por un trigger desde dentro del `delete`, con un mensaje que no
  nombraba ni la tabla ni la fusión, y **después** de haber apagado ya las primarias del
  perdedor. Que un `raise` deshaga la transacción no lo hace equivalente: el llamador es un
  barrido que fusiona en lote y necesita saber qué par saltarse *y por qué*, con la tabla
  nombrada, no un código de error de tres palabras.
- **Las referencias polimórficas a libro se enumeran contra el esquema, nunca copiando una lista
  previa.** `20260887` copió la de `20260870` (que es lo que el plan mandaba) y se dejó 4 de 17:
  `posts.anchor_id`, los dos extremos `after_`/`before_` de `saga_placement_windows` y
  `club_activities.spawned_from_item_id`. Como esas referencias **no tienen FK**, nada lo
  detecta: el post desaparece del feed en silencio. El método bueno —barrer `pg_attribute` ×
  `pg_type` buscando columnas de enums que contengan la etiqueta `'book'`, más las `*_type` de
  texto y las jsonb— queda escrito en la cabecera de `20260888` con las candidatas descartadas
  una a una, para que la próxima persona no tenga que decidir en qué lista fiarse.
- **La referencia por JSONB (`club_activities.config->'item'`) se deja fuera de la fusión a
  propósito.** Repuntar una columna tipada falla en voz alta si el nombre cambia; un `jsonb_set`
  colgado de un `->>'itemType'` de texto libre se queda mudo, que es justo el fallo silencioso
  que motivó todo esto. Hoy es latente (cero eventos de club sobre libros en producción). El
  arreglo preferido no es tocar el JSONB sino mover el ítem a columnas tipadas — issue #875.

- **`books.google.com` entra en la allowlist de portadas oficiales** (2026-08-27, task 7 del plan
  de edición de obra). La entrada de 2026-08-02 más arriba enumera el conjunto de entonces
  (`image.tmdb.org`, `covers.openlibrary.org`); a partir de hoy son tres. El motivo es que Google
  Books es el enriquecedor de portada cuando Open Library no la da, y sus `imageLinks` se sirven
  desde ese host — verificado con una llamada real, no supuesto.
  **El matiz que hay que aceptar por escrito:** la allowlist es por HOST, no por ruta. Así que
  desde hoy un colaborador puede fijar en `cover_url` del catálogo COMPARTIDO cualquier URL bajo
  `https://books.google.com/…`, no solo las de `/books/content`. Se acepta con el mismo criterio
  que los dos hosts que ya estaban —dominio de Google, sin contenido subido por usuarios— pero se
  registra aquí porque amplía la superficie de confianza y no debe colarse en la lectura de la
  entrada vieja, que ya no enumera la lista completa. Cubierto en `official-covers.test.ts`
  (host exacto, http rechazado, `.evil.com`/`@evil.com`, y el caso de ruta libre).

- **La hidratación de una obra llama a `hydrate_book` con `service_role`, y solo a ella** (2026-08-27,
  task 9 del plan de edición de obra, cierra #871). La RPC pasó de fill-only a fill-or-upgrade y con
  el bypass `app.hydrating` cualquier usuario autenticado podría haber reescrito el catálogo
  COMPARTIDO, así que perdió el `execute` de `authenticated` (precedente #725). `ensureBookHydrated`
  construye por su cuenta el cliente de service_role **solo para esa llamada**: las lecturas y los
  `update` de columnas técnicas (`openlibrary_work_key`, `google_books_volume_id`) siguen yendo con
  el cliente del llamante, que es quien tiene la identidad del usuario y a quien le aplica RLS. Es
  deliberado que el privilegio se acote a una línea y no se derrame por la función entera.
  **El modo de fallo que esto cierra vale más que la regla:** el `42501` que devolvía el cliente de
  la petición se lo tragaba el `console.error` de la propia función —que nunca lanza, por contrato—,
  así que la hidratación no corría y ninguna ficha daba error. Medido en dev antes del arreglo:
  `permission denied for function hydrate_book`. Es la tercera vez que un fallo de escritura se
  esconde detrás de ese contrato (#699, #751, #871): cuando `ensureBookHydrated` deje de hidratar,
  mirar primero el rol del cliente.
- **La comparación de nombres de autoría es `isSameTitle`, partiendo por comas** (2026-08-27, misma
  task). No se escribe un helper propio con contención bidireccional sobre el normalizado: esa forma
  exacta se propuso dos veces en este plan y falla en los dos extremos — sin cota, «Ana» casa con
  «Susana Fortes»; con cadena vacía, un autor «—» casa con cualquiera y desactiva la verificación
  entera. `isSameTitle` ya trae la cota del 65% y el rechazo del normalizado vacío. El corte por
  comas es lo único que se añade encima, para que «Brandon Sanderson, Rafael Marín» (autor +
  traductor) siga casando con «Brandon Sanderson». Verificado contra Inventaire real: de las 20
  entidades que devuelve la búsqueda «The Name of the Wind», solo Q1195989 pasa la verificación.

- **Google Books se pide en cuanto la sinopsis no está en español, y su resultado se etiqueta con el
  idioma REAL del volumen** (2026-08-27, revisión de la task 9 del plan de edición de obra; cierra
  #886 y el hallazgo I3). Son dos decisiones que van juntas y en este orden, porque la segunda hace
  segura a la primera.

  **1. El umbral.** El gate de Google Books era `langRank(current.lang) <= 1` y el de
  `needsRepresentationReview` es `> 0`: en medio caía justo la sinopsis inglesa, que es el caso
  COMÚN (`synopsisLang` etiqueta `en` toda sinopsis de Open Library, y OL sí suele traer
  descripción). De las dos salidas que planteaba #886 se elige la primera —bajar el gate de GB a
  «solo se salta si YA es español»— y no la segunda —dar por buena la sinopsis inglesa—, porque la
  spec §4 contrata a Google Books precisamente para ese campo («OL casi nunca tiene sinopsis en
  español; GB con `langRestrict=es` es el proveedor realista»). Con el umbral viejo, la
  reevaluación de cada 30 días era un **no-op demostrable**: se marcaba la obra mejorable, se
  gastaban ~10 peticiones externas por libro y mes, y por construcción no podía cambiar nada.
  El coste asumido es una llamada a Google Books por obra con sinopsis inglesa, dentro del tope de
  `MAX_GOOGLE_BOOKS_CALLS`. **El umbral sigue apareciendo en dos sitios** (aquí y en
  `needsRepresentationReview`) y por eso ambos comentarios se citan mutuamente: si uno se mueve, el
  otro también.

  **2. La etiqueta.** `langRestrict=es` es una **pista, no una garantía** — Google Books cuela
  volúmenes en otro idioma. Se etiqueta con `volume.language`, que `mapVolume` ya extraía y aquí se
  ignoraba, y solo se cae al idioma pedido cuando el volumen no declara ninguno. Se elige
  ETIQUETAR y no DESCARTAR el volumen: uno inglés sigue sirviendo para rellenar un hueco vacío, y
  con su idioma declarado honestamente la RPC sabe que se puede mejorar más adelante.
  **Por qué esto no es cosmético:** el rango 0 (español) es un estado TERMINAL, porque la RPC solo
  acepta mejora ESTRICTA. Medido en dev sobre una fila con una sinopsis inglesa marcada `es`: ni
  una sinopsis española posterior ni una inglesa honesta la reemplazan — el valor queda congelado
  para siempre y `needsRepresentationReview` deja además de marcarlo mejorable. Es el modo de
  congelación de #730 por una puerta nueva, y aflojar el gate del punto 1 sin esto lo habría
  activado. Encima se añade una guarda de mejora estricta también en TypeScript: un volumen inglés
  no sustituye una sinopsis inglesa de OL, porque la RPC lo rechazaría igual y de paso se perdería
  la procedencia mejor.

- **El QID cuenta como hueco en `needsRepresentationReview`** (2026-08-27, misma revisión, hallazgo
  I4). `books.wikidata_id` es el ancla de identidad inter-idioma y **no vive en `repr_meta`**, así
  que el barrido de campos del predicado no lo veía. Hasta ahora una obra sin QID se reintentaba
  **de casualidad**: la sinopsis, etiquetada `en`, siempre quedaba mejorable. En cuanto Google
  Books empieza a llenar sinopsis españolas (decisión de arriba), esa casualidad desaparece y un
  libro todo-ES sin QID no se reconsideraría jamás. Y «sin QID» no es un caso raro: Inventaire
  expiró en 2 de las 4 ejecuciones reales medidas. El cooldown de 30 días sigue aplicando, así que
  el coste es acotado; la palanca para reducir esas expiraciones es el timeout por llamada de la
  issue #889, no este predicado.

- **Los campos del `SearchResult` que llegan a la hidratación de un ítem recién creado van a `null`**
  (2026-08-27, misma revisión, hallazgo C1, refuerza #674). `openCatalogItem` y `addToLibrary` son
  **server actions**: su `SearchResult` lo deserializa el servidor de lo que manda el NAVEGADOR, así
  que ninguno de sus campos es un dato del proveedor — son entrada de usuario con forma de resultado
  de búsqueda. Es exactamente por eso que `findOrCreateCatalogItem` se queda solo con
  `p_external_id`, y el dispatcher de hidratación se había saltado esa regla pasando `title` y
  `author`. Los dos llegaban a escritura sobre el catálogo COMPARTIDO: `author` acaba en `p_author`,
  que es fill-only y por tanto acepta SIEMPRE en una fila recién nacida; `title` es la consulta que
  va a Inventaire, de donde sale el QID, y un QID equivocado FUSIONA dos obras. Con `hydrated_at`
  ya marcado, el curador no reintenta: la basura sería permanente hasta curación manual. No se
  pierde nada, porque ahí se conoce el `openlibrary_work_key` y `fetchWork` da título y autor de
  verdad. **La regla general, para no rediscutirla:** un valor solo entra en el catálogo compartido
  si su origen es un proveedor al que llamó el servidor; si pasó por el cliente, se descarta aunque
  «venga de la búsqueda».

- **Sin `volume.language` declarado, Google Books se etiqueta `other`, nunca el idioma pedido**
  (2026-08-27, tercera revisión de la Task 9, hallazgo I-1). El fallback `wanted` (siempre `"es"` en
  el único punto de llamada) reabría exactamente la congelación que el punto anterior («la etiqueta
  es el idioma real, no el pedido») vino a cerrar: un volumen sin idioma declarado —que `mapVolume`
  deja con relativa frecuencia— quedaba sellado `es` = rango 0 = TERMINAL, y una sinopsis
  potencialmente inglesa no se corregía nunca. `toReprLang(null)` ya caía a `"other"` (rango 2, el
  que NO pisa nada) — bastaba con no bypasear esa función a mano en el call site. Regla general: en
  un estado terminal, ante la duda se falla hacia el lado recuperable.

- **El shell de libro para un ítem recién creado se construye en `hydrate-book.ts`, no en
  `buscar/actions.ts`** (2026-08-27, misma revisión, hallazgo I-2). El invariante de C1 (título y
  autor a `null`, nunca el dato del navegador) no tenía test porque `actions.ts` es `"use server"`,
  donde cualquier export nuevo se convierte en un endpoint público — premisa correcta, pero la
  conclusión de dejarlo sin guarda no se seguía: bastaba con extraer el constructor
  (`bookShellFromSearchResult(itemId, result): HydratableBook`) a un fichero que SÍ admite exports
  normales. `actions.ts` pasó a llamar `ensureBookHydrated(supabase,
  bookShellFromSearchResult(itemId, result))`. Se descartó la alternativa (guarda por texto de
  fuente, al estilo `after-guard.test.ts` de la #751) porque aquí SÍ hay una refactorización barata
  disponible; esa alternativa se reserva para invariantes que de verdad no admiten extracción.


- **La regla de escritura de la representación se extrae a `repr_should_write`, implementación
  ÚNICA** (2026-08-27, Task 9bis, migración `20260890`). Vivía inline dentro de `hydrate_book`
  (`20260884`) y funcionaba; lo que la hizo insostenible fue la SEGUNDA escritora. Con
  `hydrate_books_bulk` habría dos copias de la misma regla, y esa regla tiene bordes que ya
  costaron un hallazgo cada uno —la entrada de `repr_meta` malformada se trata como PROTEGIDA y
  no como desconocida, el empate de rango NO pisa, y el orden entre esas dos comprobaciones
  importa—, así que las dos copias se desincronizarían en el primer arreglo y el que quedase
  atrás sería el que escribe 87 filas de golpe. Se extrajo **sin cambiar ni un caso**: la regla
  se verificó contra 270 combinaciones sin una sola divergencia con la v4 inline. Se descartó
  dejarla como texto duplicado con un comentario «mantener en sync»: eso es exactamente lo que
  no se cumple. Corolario para quien toque la política de idioma: **se toca en `repr_should_write`
  y en ningún otro sitio.**

- **`hydrate_books_bulk` deja `hydrated_at` en NULL a propósito** (2026-08-27, Task 9bis). El
  lote de bibliografía de autor solo sabe título, autor, año y portada: no trae sinopsis,
  géneros, páginas ni QID. La opción «natural» —marcar la obra como hidratada, igual que hace
  `hydrate_book`— es justo la que reproduce el modo de fallo de #730: el curador no reintenta lo
  que ya está marcado hidratado, así que la obra se quedaría a medias PARA SIEMPRE, y con el
  cooldown de `needsRepresentationReview` (`REVIEW_COOLDOWN_DAYS = 30`) ni siquiera se
  reconsideraría antes de un mes. Dejándolo NULL, la ficha hace su trabajo completo en la primera
  visita, y como todo es fill-or-upgrade **mejora** lo que el lote escribió en vez de chocar con
  ello. Esto solo es seguro porque existe `repr_meta`: con la `hydrate_book` anterior, hidratar
  en lote habría congelado un título posiblemente inglés sin forma de corregirlo. Consecuencia
  asumida: `hydrated_at is null` sigue siendo el marcador de «sin procesar», y una fila tocada
  por el lote se cuenta como no procesada — que es lo correcto, porque le falta más de la mitad.

- **El backfill de shells de libro pasa de token de usuario a `service_role`** (2026-08-27, Task
  9bis, `scripts/backfill-book-shells.ts`). El brief original decía «token de usuario, como la
  ficha (#751)». Ya no es posible ni deseable: `hydrate_books_bulk` **no acepta `auth.uid()`** —
  no tiene el guard de sesión, tiene el del GUC `role`, y con `authenticated` lanza. Y no es un
  detalle de permisos que se pudiera revertir: la RPC es de `service_role` porque el trigger
  `trg_stamp_books_repr_manual` distingue curación de automatismo por la presencia de sesión, así
  que un escritor MASIVO corriendo con el cliente de la petición marcaría `source:'manual'` el
  catálogo ENTERO, en silencio y sin vuelta atrás para todo automatismo posterior. **Regla
  general que sale de aquí: todo escritor masivo de `books` va con `service_role`; es requisito,
  no preferencia.** El script exige por tanto `SUPABASE_SERVICE_ROLE_KEY`, y su guard de entorno
  se comprueba ANTES de construir el cliente (si no, `createClient` lanza `supabaseUrl is
  required` en el import y el mensaje en castellano no llega a verse nunca).

- **Muere el sync masivo de ediciones al abrir la ficha** (2026-08-27, Task 10,
  `src/lib/editions/sync-editions.ts` BORRADO). `ensureBookEditions` traía hasta 20 ediciones de
  OpenLibrary y las registraba en `book_editions` en la primera visita sin sesión de nadie
  detrás — era justo el origen del ruido de ediciones que motivó el spec de representación
  (§1, `docs/superpowers/specs/2026-08-26-obra-edicion-representacion-design.md`): tiradas que
  nadie había identificado, coladas en la tabla compartida solo porque alguien miró la ficha. Con
  las candidatas de representación resolviéndose EN VIVO (`fetchRepresentationCandidates`, ya
  implementado antes de esta tarea) el automatismo ya no tenía trabajo que hacer: lo único que
  puede dar de alta una edición real es quien la identificó de verdad (picker, ISBN escaneado, alta
  de colaborador). `loadBookEditions` queda como lectura pura, sin `supabase` ni `canSync` en la
  firma — se simplificó la firma en vez de dejar un parámetro fantasma, tal y como pedía el propio
  brief de la tarea. La acción de colaborador `resyncEditions` se renombra a
  `reevaluateRepresentation`: ya no reintenta el sync, pone `hydrated_at = null` y relanza
  `ensureBookHydrated`, que es quien de verdad decide qué mejorar. La columna
  `books.editions_synced_at` se queda en el esquema (se dropea en la fase destructiva, Task 16);
  el código de aplicación deja de leerla y escribirla, y solo sobrevive en el tipo generado de
  Supabase hasta que esa columna desaparezca de verdad.

- **La precedencia de páginas del progreso baja a DOS peldaños; la «edición primaria» muere como
  criterio** (2026-08-27, Task 12 del plan de edición de obra). Hasta hoy había tres niveles
  —edición del pase → `book_editions.is_primary` → `books.total_pages`— y la primaria **nunca fue
  una decisión de nadie**: la marcaba un trigger sobre la PRIMERA fila que entrara, que con el
  sync masivo vivo (muerto en la Task 10) era literalmente la primera de hasta 500 filas bajadas
  de OpenLibrary. Ahora que una edición solo existe si alguien identificó su tirada, la
  precedencia correcta es la que el usuario dijo: **su edición manda; sin ella, las páginas
  orientativas de la obra**. Regla única en `pagesForPass` (`src/lib/editions/edition-label.ts`),
  aplicada por los SIETE consumidores que la tenían copiada y por el snapshot SQL del widget
  (`20260892_widget_snapshot_two_level.sql`).
  **Dos cambios de comportamiento que se deciden a propósito, no se cuelan:**
  1. **`pickEditionPages` pierde su cuarto peldaño** («cualquier edición con páginas»), que era
     deliberado: el sorteo solo alimenta los tramos ‹2 h / 2–5 h / +5 h, donde una tirada
     aproximada era mejor que «sin estimar». Se cambia igualmente porque convertía a esa función
     en el ÚNICO consumidor con precedencia propia: el mismo libro salía con 736 páginas en el
     sorteo y 684 en la barra de progreso, y **un consumidor rezagado no falla, da otro número**.
     Se prefiere un número coherente en toda la app a uno más optimista solo en un sitio.
  2. **Un libro sin edición identificada y sin `books.total_pages` vuelve a «sin estimar»**
     aunque tenga ediciones hermanas con páginas. Es el precio del punto 1 y es el
     comportamiento correcto bajo la regla nueva.
  **El tipo `Edition` pierde `isPrimary`** y `getEditions` deja de ordenar por `is_primary`: las
  tiras y el picker ya no destacan ninguna como «principal», que es lo que se quería. **La
  columna `book_editions.is_primary`, sus triggers y su índice NO se tocan aquí**: eso es la fase
  destructiva (Task 16) y borrar la columna sin borrar antes los triggers rompe CUALQUIER
  inserción de edición (issue #877).
  **El helper se llama `pagesForPass` pero su campo es `totalUnits`, no `totalPages`**: `Edition`
  es el tipo compartido con las versiones de película (allí son minutos) y con las series (allí
  son episodios), y duplicar la regla por medio era peor que el nombre imperfecto.
  **De regalo se borra `src/lib/passes/edition-choice.ts`**: código muerto verificado — nadie
  escribía esa clave de localStorage, así que el efecto de `log-panel.tsx` que la leía no aplicó
  jamás una edición a ningún pase.

- **Corrección de alcance de «La precedencia de páginas del progreso baja a DOS peldaños; la
  «edición primaria» muere como criterio»** (2026-08-27, revisión de la Task 12). La entrada
  anterior decía que un libro sin edición identificada y sin `books.total_pages` vuelve a «sin
  estimar» **«en el sorteo»**. El alcance real es mayor: `pickEditionPages` tiene DOS
  llamadores, no uno — el segundo es `get-library-items.ts:252`, que alimenta el porcentaje de
  progreso de **portada y de Colección**. Esos ítems no pasan a «sin estimar» (ese estado es
  propio del sorteo): **pierden directamente la barra de progreso**, y eso no estaba escrito
  en ninguna parte.

  Medido contra prod (`vmutcradmodhiltuohys`, solo lectura, 2026-08-27): pases de libro con
  `edition_id` null, `books.total_pages` null y al menos una edición hermana CON páginas — la
  población que el peldaño eliminado rescataba:

  | estado | pierden el número | total pases del estado |
  |---|---|---|
  | `planned` | 29 | 41 (71% cae fuera de los tramos ‹2h / 2–5h / +5h del sorteo) |
  | `in_progress` | 1 | 4 |
  | `completed` | 38 | 60 |
  | **total** | **68** | **105** |

  La decisión de fondo sigue en pie —un número coherente en toda la app vale más que uno
  optimista solo en un sitio—, pero 68 de 105 no se despachaba con una frase sin cifra.
  **Mitigación que ya existe y que la entrada original no citaba:** `hydrate_book`
  (`src/lib/catalog/hydrate-book.ts:288`) estampa `books.total_pages` desde la mediana de
  páginas (`pagesMedian`) cuando la fila lo tiene a null, así que esto se autocura libro a
  libro conforme se visitan las fichas — no es una regresión permanente, es una que se cierra
  sola con tráfico. Consultas, alcance completo y propuesta de backfill puntual al desplegar:
  issue #902 (relacionada con #900 y #901).

- **El picker de edición consulta candidatas de OpenLibrary EN VIVO y solo persiste la elegida**
  (2026-08-27, Task 13, rama `feat/obra-edicion-representacion`). Es la cara visible del modelo
  que estrenó la Task 10: `book_editions` ya no se llena sola al abrir la ficha, así que el
  usuario necesitaba una vía para decir cuál es SU tirada sin que el catálogo volviera a
  engordar. El selector queda en tres bloques y **el orden es la decisión**: (1) las ediciones ya
  persistidas del libro, con las de pases anteriores destacadas arriba —comportamiento que ya
  existía y se conserva—; (2) el CTA «Escanea o teclea el ISBN», que va ANTES que las candidatas
  porque es el único camino EXACTO (el código de barras identifica el ejemplar que se tiene en la
  mano; todo lo demás es aproximar entre tiradas parecidas); (3) «Más ediciones (OpenLibrary)».

  Cuatro cosas que se decidieron a propósito y conviene no deshacer sin leer esto:

  - **El bloque 3 carga al DESPLEGARLO, no al abrir el selector** (`<details onToggle>`, una sola
    vez por montaje). Cargarlo siempre convertiría cada apertura del panel de progreso en una
    llamada a OpenLibrary, y la mayoría de las veces el usuario elige en el bloque 1 sin bajar.
  - **`fetchEditionCandidates` no escribe NADA**; la escritura la dispara `chooseEditionCandidate`
    con un clic explícito. Y excluye de las candidatas los ISBN ya persistidos del libro
    (normalizados con `normalizeIsbn` en los dos lados, porque `createEdition` guarda lo que
    teclea el colaborador, guiones incluidos): sin eso la misma edición saldría dos veces, en dos
    bloques distintos. El escaneo pide `30 + persistidas` para que el tope de 30 se aplique
    DESPUÉS de excluir, y no acabe enseñando menos justo en los libros con más ediciones
    identificadas.
  - **El presupuesto de páginas es el interactivo, no el del sync**: `fetchLiveWorkEditions`
    (nuevo, en `src/lib/catalog/openlibrary/editions.ts`) escanea con `MAX_REPRESENTATION_PAGES`
    (2 páginas, 200 ediciones) como `fetchRepresentationCandidates`, no con las 5 de
    `fetchWorkEditions`. Filtro, dedup y orden ES→EN→resto son los de `pickEditions`, sin una
    segunda lista negra que mantener.
  - **El `NULL` de `register_book_edition` NO es un fallo.** La RPC es idempotente (`on conflict
    do nothing`) y devuelve `NULL` cuando otro usuario ya identificó esa misma tirada. Tratarlo
    como error dejaría al usuario sin poder elegir precisamente la edición más común del libro:
    se resuelve re-seleccionando por el índice único `(book_id, isbn)` y se sigue. Un `error` de
    la RPC, en cambio, sí corta — y NO cae en ese rescate, o un rechazo del servidor se
    convertiría en un éxito silencioso.

  **Desviación del plan escrito, deliberada:** las claves i18n nuevas van al namespace `editions`
  (`editions.scanCta`, `editions.moreFromOpenLibrary`, `editions.candidateHint`…), no a un
  `editionPicker.*` propio: `EditionPicker` ya hace `useTranslations("editions")` y abrir un
  segundo namespace para el mismo componente solo repartía sus cadenas en dos sitios.

- **El umbral que decidía si se pregunta «¿qué edición estás leyendo?» baja de «más de una» a
  «siempre, en libros»** (2026-08-27, Task 13). Encontrado revisando el copy de la propia Task 13,
  y sin arreglarlo la tarea entera no se veía en pantalla. `log-panel.tsx` montaba el
  `EditionPicker` con `editions.length > 1`. Ese umbral era correcto cuando abrir la ficha
  sincronizaba cientos de ediciones desde OpenLibrary: con una sola no había nada que elegir. Con
  el sync muerto (Task 10) `book_editions` solo tiene lo que alguien identificó, así que **0 o 1
  ediciones es el caso NORMAL de un libro recién añadido** — y es justo donde hacen falta el
  escaneo del ISBN y las candidatas en vivo. El bloque nuevo de la Task 13 vive dentro de ese
  `if`, así que con el umbral viejo no se pintaba jamás en los libros que más lo necesitan.

  La regla se extrae a `src/components/detail/edition-question.ts` (`shouldAskForEdition`), pura y
  con test, mismo patrón que `tab-visibility.ts`: era una condición de cuatro términos escondida
  en medio de un componente cliente de 900 líneas, que es exactamente por lo que se pudrió sin que
  nadie lo notara. **Las películas se quedan en `> 1`**: `movie_versions` no tiene ISBN que
  escanear ni obra en OpenLibrary de la que sacar candidatas, así que con menos de dos versiones
  la pregunta sigue sin tener respuesta posible. Las series, nunca (su unidad son los episodios).

  Consecuencia asumida: ahora se pregunta la edición en **todo** pase de libro sin ella, no solo
  en los libros con catálogo gordo. Es el precio de que la pregunta exista; «No lo sé» se sigue
  recordando por `passId`, así que quien no quiera contestar lo dice una vez por pase.

- **`editions.allEditions` deja de ser «Todas las ediciones» y pasa a «Ediciones de la ficha»**
  (2026-08-27, Task 13). Otra promesa vieja del sync masivo: cuando la ficha bajaba el catálogo
  entero de OpenLibrary, «todas» era cierto. Hoy es una lista de lo identificado — y con el bloque
  «Más ediciones (OpenLibrary)» justo debajo, la pantalla se contradecía a sí misma. El número que
  va al lado del título es `editions.length`, el total de la ficha, que es exactamente lo que el
  título nuevo nombra.

- **Del navegador a la RPC del catálogo comunitario solo viaja el ISBN: el servidor RE-DERIVA la
  candidata** (2026-08-27, revisión de la Task 13). `chooseEditionCandidate` recibía el objeto
  `EditionCandidate` entero desde el cliente y solo revalidaba el `isbn`; `publisher`, `coverUrl`,
  `label`, `year` y `pages` iban tal cual a `register_book_edition`, que es `SECURITY DEFINER` y
  solo exige `auth.uid() is not null`. Es decir: **cualquier usuario autenticado podía crear una
  fila en `book_editions` de cualquier libro con editorial y portada arbitrarias**, y el
  `publisher` se le pinta hoy a toda la comunidad (`formatEditionDetails`). Antes de este selector,
  meter metadatos a mano exigía `collaborator+` (`createEdition`) — era un ensanchamiento de
  privilegio, no un detalle de validación.

  Se arregla por la vía buena y no por la barata: **la firma acepta solo el ISBN** y el servidor
  vuelve a pedirle a OpenLibrary las ediciones de la obra (`fetchLiveWorkEditions`) y casa por ISBN
  normalizado. Si no aparece, `{ok:false, reason:"unknownCandidate"}` y no se escribe nada. La
  alternativa barata —dejar viajar los metadatos y solo exigir que `coverUrl` empiece por
  `https://covers.openlibrary.org/` y capar `publisher`— se descartó: sigue dejando al cliente
  elegir *qué* editorial se le enseña a la comunidad, y una lista blanca de prefijos envejece peor
  que una re-derivación.

  **Coste asumido, medido a ojo y a propósito:** una llamada extra a OpenLibrary por elección.
  Es una acción iniciada por el usuario y poco frecuente (solo al elegir una candidata, no al
  listarlas), contra cerrar un agujero de escritura en el catálogo compartido. El tope de escaneo
  de la re-derivación es 200 (`MAX_DERIVATION_SCAN`), a propósito mucho mayor que las 30
  candidatas que se enseñan: tiene que ser un **superconjunto** de lo que el picker pudo pintar,
  porque aquel escanea con holgura (30 + las ya persistidas) y la re-derivación no excluye nada.

  Es el patrón que más veces ha mordido en este plan (#674 y dos recaídas en la misma rama): datos
  del cliente llegando al catálogo compartido. **Y no se puede confiar en que lo sanee la RPC**:
  verificado contra `pg_proc` en dev, `sane_int` se aplica solo a `p_year` y `p_pages`;
  `p_publisher` y `p_cover_url` entran crudos. El comentario del código que afirmaba lo contrario
  se corrigió en el mismo cambio — era justo el tipo de falsedad que hace que el siguiente lector
  no mire.

- **El fallo de CARGAR candidatas no se cuenta con el mensaje de GUARDAR** (2026-08-27, revisión de
  la Task 13). El `catch` de `loadCandidates` reutilizaba `candidateErrors.generic` («No se pudo
  guardar la edición.») cuando nunca se había intentado guardar nada, y como esa misma rama deja
  `candidates` en `[]`, la pantalla afirmaba a la vez «No hay más ediciones que ofrecerte para esta
  obra» — una afirmación que tampoco consta, porque la lista no llegó. Dos frases, una falsa y otra
  contradiciéndola. Ahora hay una clave propia (`editions.candidatesFailed`) y una bandera
  `candidatesFailed` que **suprime el estado vacío**: el vacío solo se afirma cuando la lista llegó
  de verdad. Regla general: un estado vacío es una afirmación sobre el mundo, y tras un error no
  sabemos nada del mundo.

- **El ISBN de una fila importada identifica la tirada de TODOS los pases que nacen de esa fila, no
  solo del activo** (2026-08-27, Task 14). `findOrCreateCatalogItem` recibía `userId` en el resto del
  catálogo pero no desde `match-row.ts`, así que `ensureBookEdition` salía por la puerta de atrás
  (`register_book_edition` exige `auth.uid()`) y ningún ISBN de un CSV llegaba nunca a
  `book_editions` — se perdía entero, aunque el usuario hubiera catalogado deliberadamente ESE
  ejemplar. Se arregla propagando `userId` desde `commitImportRow` (viene de `auth.getUser()` en
  `src/app/importar/actions.ts`, nunca del cliente) hasta `matchBook`, y anotando en `ImportMatch`
  el `matchedIsbn` cuando la fila casó por ISBN (local o vía `lookupIsbn`) para que
  `commit-row.ts` resuelva `book_editions.id` por `(book_id, isbn)` — la RPC es idempotente y no
  devuelve el id en el camino "ya existía", mismo patrón que `chooseEditionCandidate`.

  **Decisión no dictada literalmente por el plan**: el `edition_id` resuelto se escribe tanto en el
  pase activo como en cada pase histórico (relectura) que nace de la MISMA fila del CSV, no solo en
  el activo. Un CSV con varias fechas de relectura describe la MISMA tirada en la mano del usuario
  para todas ellas — no hay ninguna señal en el CSV de que cambiara de edición entre lecturas — así
  que negarle el dato a los históricos habría sido una pérdida de información arbitraria, no una
  cautela.

  **Degradación explícita, verificada por test**: un ISBN con dígito de control inválido en el CSV
  no rompe la fila. `register_book_edition` lanza `invalid isbn13`/`invalid isbn10` dentro de la
  RPC, pero `ensureBookEdition` (find-or-create.ts) ya se tragaba ese error de antes de esta tarea;
  lo nuevo es que `resolveEditionId` simplemente no encuentra fila que resolver y cae a `null` — el
  pase se crea igual, sin edición, que es el mismo estado legítimo que una fila sin ISBN.

- **La reconciliación de identidad Wikidata exige título Y autor, y el ganador de la fusión es el de
  más rastro de usuario** (2026-08-27, Task 15). `scripts/reconcile-wikidata.ts` asigna a cada obra
  su QID vía Inventaire y fusiona las que colisionan con `merge_book_into`. Dos decisiones que no
  venían dictadas así:

  **1. La corroboración de título es OBLIGATORIA, no un desempate.** El pseudocódigo del plan se
  quedaba con «la primera entidad cuyo autor case», y la primera implementación lo suavizó (el
  título solo desempataba si había varias candidatas del mismo autor). El barrido en seco contra dev
  lo desmintió: de 13 fusiones propuestas, **dos eran obras distintas del mismo autor** — «Shadows
  Beneath» (`/works/OL31714961W`, la antología de *Writing Excuses*) se iba a fundir con «Shadows of
  Self» (`/works/OL17349393W`), y «Das Rad der Zeit 34. Der Traum des Wolfs» (*La Rueda del Tiempo*)
  con «Words of Radiance». Un 15% de fusiones erróneas no lo compensa ningún match ganado: manda la
  regla del spec §6 («ante la duda, no fusionar; un duplicado que sobrevive es recuperable, una
  fusión errónea destruye»). **Coste asumido**: un duplicado cuyo título no case con ningún label de
  la entidad —el caso «La Biblioteca de Medianoche» / «La biblioteca de la medianoche», que
  `isSameTitle` no casa ni por igualdad ni por contención— sobrevive al barrido. Es el lado bueno
  por el que fallar.

  **2. Gana la fila con más rastro de usuario, con un desempate más que el que pedía el plan.** El
  plan decía «más pases, y a igualdad la más antigua». Se intercala un segundo criterio —el resto
  del rastro: `posts`, `notes`, `collection_items`, `library_entries`, `saga_items`— porque con dos
  filas a cero pases la antigüedad es una moneda al aire y la fila que lleva la **reseña** del
  usuario puede ser perfectamente la nueva. Sin rastro de ningún tipo por ninguna parte, queda
  exactamente el criterio del plan. Es el razonamiento de la migración `20260870`: un dato de
  catálogo se vuelve a bajar de OpenLibrary; un pase, no. Y el ganador se elige **cerrando el grupo
  primero**, no según quién reclame el QID antes: en el pseudocódigo del plan el orden de escaneo
  decidía qué pases había que repuntar.

  **Nota operativa que no es un detalle**: Inventaire corta con `429` y `retry-after: 1800` sobre las
  ~200 peticiones (~65 libros a 3 peticiones cada uno) y no lo documenta. `searchInventaireEntities`
  es dependencia blanda y degrada a `[]`, así que un `429` es **indistinguible de «no está en
  Wikidata»** desde dentro del cliente. El script lo compensa por fuera: sondeo previo con `fetch`
  pelado, cortafuegos por racha de vacíos, `--apply` bloqueado si el barrido se cortó, y `--max=N`
  para barrer en tandas (los 397 libros de dev necesitan ~6 ventanas de media hora).

## 2026-08-28 — El barrido QID compara títulos por CONJUNTO DE PALABRAS, con un comparador local

Revisión del barrido de reconciliación (Task 15). La corroboración de título se apoyaba en
`isSameTitle` (`src/lib/catalog/title-match.ts`), que acepta la **contención** cuando el más corto
mide ≥65 % del más largo. Contra las filas reales de dev eso no era un límite: era un **falso
positivo que borraba filas**. Un marcador de volumen o de parte pegado al título base cae dentro de
la cota, así que el trozo casaba con la obra completa y `planReconciliation` proponía
`merge_book_into` — las seis filas `Words of Radiance%` producían **cinco fusiones**, y como
comparten `created_at` y tienen cero pases, el desempate por `id` dejaba viva «Part Two» y mataba la
fila de la **obra completa**.

Lo decisivo del diagnóstico no es el fallo, es que **saltara o no era cuestión de suerte de
longitudes, no de datos**: `Oathbringer Part Two` / `Oathbringer` da 0.55 y se salvaba por poco,
mientras que `The Stormlight Archive 1` / `The Stormlight Archive` da 0.92 y borraba la fila. Un
criterio que decide qué se borra no puede depender de cuánto mida el título base.

**Decisión: comparación por conjunto de palabras normalizadas** (igualdad exacta de conjuntos), en
un `titleMatchesLabel` **local a `src/lib/catalog/wikidata-reconcile.ts`**. Medido sobre los 16
casos conocidos: tokenSet 16/16; `isSameTitle` fallaba 8 (7 falsos positivos + 1 falso negativo).

**Por qué local y no en `title-match.ts`**, que era la tentación obvia: ese `isSameTitle` lo
comparten `wikidata-collapse.ts` y el matching de TMDB, y **allí la tolerancia al subtítulo es lo
que se quiere** — equivocarse esconde una tarjeta, que es recuperable, no borra una fila. La
asimetría de consecuencias justifica dos comparadores distintos con el mismo nombre conceptual. Se
reutiliza solo `normalizeTitle` (la normalización), no la comparación.

**De propina recupera el falso negativo** que motivaba el spec: «La Biblioteca de Medianoche» contra
el label «La biblioteca de la medianoche». Y con el diagnóstico correcto, que antes se daba por otro:
el `la` extra va **en medio**, así que la contención falla y **el umbral del 65 % ni se llega a
consultar** (el ratio, 0.90, es irrelevante).

**Coste asumido y declarado**: se pierden los subtítulos legítimos («Elantris: edición aniversario»
ya no resuelve el QID de «Elantris»). Falla del lado seguro — produce un `sin-match`, que no escribe
nada y deja vivo un duplicado recuperable. Queda en #913.

**Corolario que NO se arregla aquí**: `hydrate-book.ts`, que es quien **escribe** `books.wikidata_id`,
sigue eligiendo la entidad **solo por autor**, sin corroborar el título — la misma regla que ya
produjo dos fusiones erróneas. Vive como #914 (P1), porque siembra el dato con el que un barrido
posterior borra la obra equivocada.

**El rastro de usuario cuenta 16 de las 17 referencias que repunta `merge_book_into`**, no 6. No era
pérdida de datos (se repuntan igual), pero una obra que solo llevara la opinión de un club puntuaba
cero y **perdía contra una vacía**. La decimoséptima, `credits`, se deja fuera **a propósito**: es
metadato de catálogo que escribe la hidratación, no rastro de persona, y contarlo invertiría el
criterio justo en el caso que importa —una fila hidratada dos veces le ganaría a la fila donde
alguien escribió una nota a mano—.

## 2026-08-28 (2) — Quien ESCRIBE el QID usa la misma caja que el barrido: `resolveQid` (#914)

**Contexto.** La entrada anterior dejó el corolario abierto: el barrido de reconciliación ya exigía
autor + título + QID no ambiguo, pero `hydrate-book.ts` —que es quien **escribe**
`books.wikidata_id`— seguía con la regla vieja, «la primera entidad cuyo autor case», sin corroborar
el título. Era la más laxa de las dos, y la que persiste el dato.

**Por qué era P1 y no cosmético.** El QID es identidad, y no se queda quieto: `wikidata-collapse.ts`
lo respeta **por encima** del match de título de hoy, y `scripts/reconcile-wikidata.ts` agrupa por él
y termina en `merge_book_into`, que **borra filas de `books`**. La hidratación estaba sembrando el
dato con el que un barrido posterior destruiría la obra correcta. El error viajaba de un sitio donde
solo ensucia a otro donde borra. La RPC no protege de esto: `wikidata_id` es `null → valor` y se
traga la colisión, o sea que ampara del QID *duplicado*, nunca del *equivocado*.

**Decisión: reusar `resolveQid`, no escribir una tercera variante.** Es la tentación evidente
—«aquí solo hace falta añadir una comparación de título»— y este plan ya ha caído dos veces en ella
con la comparación de nombres: hay **dos** `authorMatches` exportados en `src/lib/catalog/` con la
misma intención y firmas distintas (`representation.ts` toma dos cadenas; `wikidata-reconcile.ts`
toma `(author, entity)` y parte la lista por comas), y esa ambigüedad es justo lo que hizo que la
línea mala se leyera como correcta durante toda una revisión. La regla que decide identidad vive en
un sitio, con sus 16 casos medidos, y los dos lados —el que escribe y el que borra— la comparten.

**Orden, que no es indiferente:** primero el QID y de ahí la entidad, no al revés. `entity` se sigue
usando para `labels.es` / `labels.en` en `pickField`, y esos labels solo valen si vienen de la
entidad que de verdad identifica a la obra; quedarse con la primera entidad y mirar luego su QID
dejaría el título de otra obra en la fila.

**Coste asumido y declarado**: la regla nueva es más estricta, así que hay obras que dejan de
recibir QID donde antes recibían uno (equivocado). Es el lado correcto por el que fallar —«ante la
duda, no fusionar»— y **no es terminal**: `needsRepresentationReview` ya trata la ausencia de QID
como hueco reevaluable (`!wikidataId` entra en `improvable`), así que se reintenta pasado el
cooldown de 30 días. En dev el coste medido es **cero**: 0 de 397 filas tienen `wikidata_id`
asignado hoy (44 hidratadas, todas sin QID), coherente con el 429 de Inventaire de #911.

## 2026-08-28 (3) — Cierre del plan obra/edición/representación: las dos políticas que lo gobiernan

Las entradas de arriba (2026-08-27 y 2026-08-28) recogen tarea a tarea lo que se decidió mientras
se construía. Esta cierra la pieza dejando escritas las **dos reglas de nivel de política** de las
que cuelga todo lo demás, porque están repartidas entre quince entradas de detalle y ninguna las
enuncia entera.

**1. La representación de una obra se elige por RANGO DE IDIOMA, y solo mejora hacia arriba.**
`es (0) < en (1) < other (2) < unknown (3)`. Un campo se escribe si el candidato tiene rango
**estrictamente mejor** que lo que hay, y la procedencia de cada campo viaja en `books.repr_meta`
(`{lang, source}` por `title`/`cover`/`synopsis`/`pages`). Es lo que convierte la hidratación de
*fill-only* en *fill-or-upgrade*: un título español PISA a uno inglés, y nada más pisa nada.

La alternativa que se descartó era la obvia —«el primero que llegue gana, como hasta ahora»— y se
descartó porque el catálogo lo llena OpenLibrary, donde el work superviviente de un par traducido
es casi siempre el INGLÉS (gana el de más ediciones). Con la regla vieja, un lector español acababa
con «Words of Radiance» en su biblioteca para siempre: no había ningún camino por el que el título
español pudiera entrar después.

El precio, y hay que decirlo: **la regla solo es segura porque `source:'manual'` es intocable**, y
esa marca la pone un trigger, no las actions. Los dos Critical de la revisión de la Task 2 salieron
exactamente de ahí — se autorizó el *upgrade* con el argumento «es fill-only, no pisa nada», que
era la premisa que el propio cambio rompía. De ahí las dos consecuencias que no son negociables: la
curación se estampa sola (`trg_stamp_books_repr_manual`) y **las RPC de hidratación de libros son
solo de `service_role`**, porque el trigger distingue curación de automatismo por `auth.uid()` y un
escritor masivo con el cliente de la petición marcaría `manual` el catálogo entero, en silencio y
sin vuelta atrás.

**2. Toda fusión de obras es COBARDE: ante la duda, no se fusiona.**
Vale para `merge_book_into`, para el colapso por QID en búsqueda y para el barrido de
reconciliación. La condición no es «se parecen»: es **QID coincidente Y autoría verificada**, y
cualquier fallo de la verificación —incluido no poder verificar— cuenta como «no fusionar».
`hydrate_book`, ante un QID ya ocupado por otra fila, lo deja **sin asignar** en vez de fusionar por
su cuenta.

El asimétrico está elegido a propósito: **un duplicado que sobrevive es un fastidio visible que
alguien reporta; una fusión equivocada mezcla los pases de dos obras distintas y no hay quien la
deshaga.** El coste asumido es que quedan duplicados vivos (los que no casan por título con ningún
label — #913) y que un QID puede quedarse sin asignar; ambos son reevaluables pasado el cooldown de
30 días, ninguno es terminal.

**Lo que este cierre NO decide, y conviene no leer de más:** nada de esto está en producción. La
fase destructiva (Task 16) no se ejecutó y ninguna migración de la rama está aplicada en prod, así
que ahí siguen vivas `book_editions.is_primary`, `books.isbn` y la hidratación vieja. El despliegue
es #900, y su orden —dev primero, verificar contra objetos reales, luego prod— no cambia.

- **`google_books_volume_id` lo escribe `service_role`, no el cliente de la petición** (2026-08-28,
  condición de merge C1 de la rama obra/edición/representación). **Corrige por escrito la entrada
  del 2026-08-27 de más arriba** («la hidratación llama a `hydrate_book` con `service_role`»), que
  cerraba diciendo que los `update` de columnas técnicas —y nombraba `openlibrary_work_key` **y
  `google_books_volume_id`**— «siguen yendo con el cliente del llamante». De las dos, solo
  `openlibrary_work_key` tiene grant de `authenticated`. `google_books_volume_id` **nunca lo tuvo**:
  nace sin él en `20260882`, a propósito.
  **Lo que de verdad pasaba:** ese update devolvía `42501 permission denied for table books` en
  TODAS las llamadas, y el `await` no destructuraba `error`, así que no dejaba ni una línea de log.
  Sondeado en dev dentro de `begin; … rollback;`: como `authenticated`, `42501`; como `service_role`,
  `OK` y la columna con valor. Y el efecto acumulado era medible sin sondear nada: **397 filas en
  `books`, 397 con la columna a null.**
  **Por qué no se arregla concediendo el grant, que era la otra salida:** esa columna es el único
  ancla entre una obra nacida en OpenLibrary y su volumen de Google Books. Vacía, un ISBN que OL no
  conoce y que no esté en `book_editions` no encuentra la obra existente y
  `register_catalog_item_by_volume` **acuña una obra duplicada** — justo lo que esta rama existe
  para eliminar. Concederlo abriría además a cualquier autenticado un identificador del catálogo
  COMPARTIDO con índice único. El privilegio se acota, como en #871, a las escrituras del catálogo
  compartido: la RPC `hydrate_book` y este sello. `openlibrary_work_key` sigue con el cliente del
  llamante, que es quien lleva la identidad y a quien le aplica RLS.
  **La regla general que deja, y que vale más que el arreglo:** «la transición es null→valor» es un
  argumento sobre el **trigger**, no sobre los **grants**. Son dos puertas distintas y una columna
  puede fallar la primera. Cuando `docs/DRIFT-CHECK.md` justifica un hueco de grants nombrando a
  quién escribe la columna, esa frase es una afirmación sobre el CÓDIGO: la superficie 6 compara
  números, no escritores, y por eso no cazó esto.

- **Un `SearchResult` sin work key no propaga su `matchedIsbn` al shell de hidratación** (2026-08-28,
  condición de merge C2 de la misma rama). El predicado del camino GB-only vive ahora UNA sola vez,
  en `isVolumeOnlyResult` (`src/lib/catalog/types.ts`), y lo leen los dos sitios que dependían de él
  por separado: `findOrCreateCatalogItem`, para elegir la RPC de alta, y `bookShellFromSearchResult`,
  para NO propagar el ISBN.
  **El fallo que cierra es una contradicción interna de la rama, no un bug heredado:** una tarea
  documentó que `isbn: result.matchedIsbn` era seguro porque la rama que lo lee es «inalcanzable
  mientras `externalId` no venga vacío», y OTRA tarea de la MISMA rama introdujo el alta GB-only,
  que devuelve `externalId: ""` **por construcción**. Con la precondición falsa, el navegador
  controlaba a la vez `googleVolumeId` (que elige la FILA) y `matchedIsbn` (que elige la OBRA), sin
  que el servidor cruzase los dos: work key ajena estampada ⇒ título, autor, portada, sinopsis,
  géneros y **QID** re-derivados de otra obra ⇒ el barrido agrupa por QID y llama a
  `merge_book_into`, que BORRA filas. Clase #674.
  **Dos mitades, a propósito.** La del shell depende de que el llamante nos pase un shell honesto;
  la otra no: el `update` de la work key lleva `.is("openlibrary_work_key", null)`, así que la
  condición la evalúa la BASE sobre la fila real. Hace falta porque
  `enforce_catalog_edit_collaborator_only` solo protege esa columna cuando
  `old.openlibrary_work_key is not null` — verificado contra la definición real de la función en
  dev, no supuesto.
  **Y lo que se corrige además del código es el COMENTARIO.** #674 se ha reabierto dos veces, y las
  dos porque un comentario declaraba el problema imposible; un comentario que afirma una
  precondición que el código vecino ya viola es peor que no tener comentario, porque el siguiente
  revisor deja de mirar. Cubierto por mutación: neutralizar el predicado, quitar el filtro `.is` o
  volver a propagar el `matchedIsbn` tumban tests distintos.


## 2026-08-28 (4) — La purga de ediciones históricas se descarta: se hará a mano (#928)

**No habrá migración de purga.** El plan de obra/edición proponía borrar en la fase destructiva las
ediciones que el sync masivo dejó, conservando las referenciadas por un pase y las de `created_by`
con rol colaborador/admin. **Ese criterio no medía lo que creía medir**, y medirlo contra producción
lo desmontó: de 372 ediciones, habría borrado 58 y **conservado las ~300 del sync**, porque
`register_book_edition` firma `created_by` con el `auth.uid()` de quien estuviera navegando y la
cuenta del dueño es admin — cada edición que el automatismo creó mientras él miraba fichas quedó
indistinguible de una curada por él.

**No existe señal en la tabla que separe lo curado de lo importado.** Ni `created_by` (los dos
caminos dejan un id de usuario) ni `label`, cuyos valores son nombres de editorial reales
(`Bolsillo`, `DEBOLS!LLO`, `Minotauro`, `Gigamesh Omnium`): metadatos correctos que resulta que
llegaron en masa. Es la misma carencia que obligó a inventar `repr_meta.source = 'manual'` para la
curación de campos, y aquí no se resolvió: se asumió.

**Se descarta también la alternativa agresiva** (borrar todo lo no referenciado por un pase, que
dejaba 14 filas de 372): tira metadatos correctos de ediciones que alguien podría querer, y con el
sync masivo ya muerto **el ruido deja de crecer solo**. La urgencia era detener la hemorragia, no
vaciar la tabla. La limpieza se hará a mano, caso por caso, sin prisa.

**Consecuencia operativa**: el esquema `backup_obra_edicion_20260826` (#866) no se borra mientras
quede limpieza manual pendiente — es la red de esa limpieza, no solo la del despliegue.

## 2026-08-28 (5) — La búsqueda deja de enseñar el contador de ediciones; la ficha recién nacida se refresca sola

**Fuera el badge «N ediciones» de las tarjetas de búsqueda.** El número era el `edition_count` de
OpenLibrary — todas las tiradas que OL conoce de la obra —, no las ediciones identificadas del
catálogo propio, y con el modelo de ediciones vivo esa cifra miente al usuario. Se quitó del tipo
`SearchResult` entero (tarjeta, enriquecimiento en `mergeByExternalId`, desempate de
`collapseByWikidata` — ahora gana el local y, sin local, el primero visto por relevancia). **El
campo `edition_count` SÍ se sigue pidiendo a OL** (`work-search.ts`): la regla 6 del normalizador lo
usa para elegir el doc superviviente al desduplicar. Quitarlo de ahí sería un cambio de
comportamiento del normalizador, no limpieza.

**La ficha sin hidratar se refresca sola (isla `HydrationWatch`).** Diagnóstico: una obra recién
creada navegaba a su ficha con la fila vacía (el presupuesto de 1200 ms de `openCatalogItem` casi
nunca alcanza a la cadena de fuentes) y NADA la refrescaba al terminar el `after()` — la ficha vacía
quedaba hasta recarga manual. La isla sonda `books.hydrated_at` (RLS `USING (true)`, delays
crecientes, ~46 s de ventana) y hace UN `router.refresh()` cuando la marca aparece; se rinde en
silencio si la hidratación falló (la cura la visita siguiente, como siempre). Solo se monta con
sesión y con `hydrated_at` null. Verificado e2e contra APIs reales (`hidratacion-auto-refresh.spec.ts`):
sondeo visible en red, refresh RSC sin recarga, fila hidratada detrás.

**Y la cadena de hidratación pierde dos rondas seriales.** `fetchRepresentationCandidates` solo
necesita la work key: corre en paralelo con `fetchWork`. El autor y la sinopsis de respaldo
(`fetchFirstEditionDescription`) entran en el `Promise.all` de Inventaire. De hasta 6 rondas de red
a 4; Google Books queda serial porque su gate depende de los campos ya resueltos. Seguro porque
ningún fetcher rechaza (degradan a null): la promesa adelantada no deja rechazos huérfanos si el
work falla y se retorna temprano.

## 2026-08-29 — El dominio `play` es una excepción explícita a `inv-passes-hub` (#931)

**`play` no deriva su estado de `passes`.** La regla «cualquier estado del usuario se deriva de
`passes`» (invariante `inv-passes-hub`) no aplica al nuevo dominio `play` (Partidas / BiblioPlay):
en las Fases 0–3 es local-first sin backend, y cuando tenga backend (Fase 5) su fuente de verdad
serán sus propias tablas, no `passes`. Decidido a propósito en la spec
`docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md`, para que un futuro agente que
encuentre `play` sin pases lo lea como la excepción registrada aquí, no como un bug.

## 2026-08-29 (2) — Play tiene identidad visual de subapp (#931)

**Matiza el «no crear estética gaming independiente» de la issue #931.** BiblioPlay parte del
fundamento Paper (tokens, modo claro/oscuro) pero con acento cromático propio, más movimiento y una
escala de instrumento: debe expresar «estás jugando» por sí misma, no leer como una ficha más del
catálogo. Detalle en `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md`.

## 2026-08-29 (3) — `/partidas*` es accesible sin sesión desde Fase 1 (#931)

**No hace falta cuenta para jugar.** La partida se identifica por identidad (`uid` de sesión o
`anon`) y dispositivo, con clave de localStorage aislada por identidad para no filtrar la partida
entre cuentas del mismo dispositivo — misma clase de fuga que el arreglo #680 del service worker.
Decidido en `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md`.

## 2026-08-29 (4) — Los selectores de Commander viven en `commander/selectors.ts`, no en `core/` (#931)

**Desviación del árbol de la spec.** `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md`
§2 dibujaba `core/selectors.ts`, pero `describeEvent`, `finalRanking` y `lossConditions` dependen de
`CommanderState` (vidas, veneno, daño de comandante) y el `core/` tiene que quedarse neutro, sin
conceptos de Magic — es la misma regla que ya separa `commander/types.ts` de `core/types.ts`. Viven
en `src/lib/play/commander/selectors.ts`; `core/` no gana un fichero con ese nombre.

## 2026-08-29 (5) — El store re-deriva por replay completo en cada cambio, no memoiza incrementalmente (#931)

**Revierte a propósito una frase explícita de la spec** («El store memoiza incrementalmente»,
§2). `src/lib/play/core/store.ts` llama a `replay(committed, pending)` entero tras cada tap,
sellado o undo, en vez de aplicar solo el evento entrante sobre el estado ya derivado. Razón:
YAGNI — una partida son unos pocos cientos de eventos, el replay completo es imperceptible en un
`life_changed` o un `commander_damage`, y la ruta incremental es una optimización que se añade el
día que un profiler la pida, no antes. No se pierde la garantía que la spec perseguía: el gate de
Fase 2 (`docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md` §8, «Reconstrucción») sigue
fijando que aplicación incremental ≡ re-reduce completo desde `game_started`.

## 2026-08-29 (6) — La consola de la partida: banda en vertical, flotante en horizontal (#931)

**Fase 1a, canvas de diseño.** La franja de deshacer / turno / crono / menú tiene DOS tratamientos
según la orientación, y no es un capricho estético sino aritmética de píxeles:

- **Vertical**: banda a todo el ancho entre las dos filas. Se probaron una cápsula centrada y una
  versión sin banda: recuperaban 10 y 14 px repartidos entre dos filas. No compensa.
- **Horizontal**: la banda son **68 px, el 17 % del alto**, y salen enteros del número de vidas
  (58 px en vez de 70). Ahí la consola sale del hueco horizontal y va flotando en el centro sobre
  paneles a pantalla completa, con 5 px de junta de fieltro.

Dos invariantes que hay que respetar al implementarla, las dos aprendidas descartando alternativas:

1. **El hueco de la consola flotante se RESERVA, no se supone.** Las cuatro cabeceras llevan padding
   lateral fijo. La variante que confiaba en que bajo la consola no hubiera nada se cae en cuanto
   hay un nombre largo o una insignia de monarca.
2. **Deshacer nunca pierde la etiqueta de QUÉ deshace.** Puede perder la palabra «Deshacer» (la
   flecha ya lo dice) pero no el «Ana −1»: sin eso hay que pulsar y mirar, que son dos acciones
   donde había una. El texto completo va en el `aria-label`.

El crono se deriva de `startedAt` — ni evento ni campo nuevos — y **vive aislado en su propio
componente**: un reloj dentro del componente que escucha el store repinta el tablero entero cada
segundo durante horas y con wake lock puesto.

Lo descartado y su medida, en la issue `tipo:acta` correspondiente y en el apéndice del canvas.

## 2026-08-29 (7) — La herramienta es Magic; Commander es un modo (#931)

**Deroga en este punto a `docs/superpowers/specs/2026-08-29-play-fases-0-2-design.md`**
(§2, §3, §5, §6), que quedó congelada antes de la fase 1a de diseño. Donde la spec
diga `commander`, manda esto.

`ToolId` pasa de `"commander"` a **`"mtg"`** y `src/lib/play/commander/` a
`src/lib/play/mtg/`. El `ToolId` identifica el JUEGO; lo que varía entre modos vive
en `mtg/modes.ts`:

| | vidas | daño cmd | umbral cmd | veneno | jugadores | comandantes |
|---|---|---|---|---|---|---|
| `commander` | 40 | sí | 21 | 10 | 2–6 | 1–2 |
| `duel` | 20 | **no** | — | 10 | 2 | 1 |

`setup.mode` viaja en `game_started`. `rules.ts` lee de la tabla en vez de tener 21 y
10 a pelo; el reducer saca de ahí los límites y **rechaza `commander_damage` en un
modo que no lo lleva** — configuración, no `if` sueltos.

**Añadir un modo es una fila mientras las reglas quepan en esa forma.** El día que un
modo necesite algo que no expresa —**Dos cabezas comparte vidas por EQUIPO**— deja de
ser configuración y pasa a ser motor. La señal es tener que inventar un campo que
ningún otro modo usa: no se fuerza en la tabla.

## 2026-08-29 (8) — El daño de comandante se cuenta por comandante, no por jugador (#931)

**Corrección de reglas, no preferencia.** Con partner, indexar `commanderDamage` por
jugador suma los dos comandantes contra el mismo umbral de 21 y **mata a alguien que
en la mesa seguiría vivo**. En Magic son 21 de CADA comandante por separado.

- `commander_damage.source` es un **id de comandante**, no un participantId.
- El participante lleva `commanders: MtgCommander[]` (1..`maxCommanders`), cada uno
  con **id propio**: el nombre es texto libre, se puede editar y dos jugadores pueden
  llevar el mismo comandante, así que no sirve de clave.
- Se materializa **siempre al menos uno**, aunque nadie escriba nada. Si no existiera,
  el daño no tendría a qué atribuirse y el reducer necesitaría un caso especial para
  los asientos sin rellenar. Dos entradas cubren partner, background y companion sin
  inventar tres conceptos.
- Los ids de comandante son únicos en toda la mesa: dos iguales mezclarían dos
  contadores y el umbral dejaría de significar nada. Validado en `initialMtgState`.
- Un comandante no puede hacerse daño a su propio dueño.

`commanderDamageBreakdown(state, playerId)` da el desglose que pinta el panel: una
fila por comandante con daño > 0, en orden de asiento. **Ni la suma ni solo el
máximo** — sumar es falso, y enseñar solo el peor esconde a los que se acercan.

`cardBackground` entra en el participante como **referencia** (id de tinte, y en el
futuro una URL), nunca bytes: un data-URI acabaría en el log de eventos y en el
snapshot de `localStorage` (issue #942).

## 2026-08-30 — El tablero se come el marco, y eso obliga a declarar el prerender (#931)

**Mecanismo, no estilo.** `/partida/activa` es la unica pantalla de Biblioshare sin topbar ni barra
de cinco: la mesa ocupa el dispositivo entero, y ese corte es lo que separa «configurar» de «jugar».
Lo decide `isFullscreenRoute(pathname)` (`src/components/nav/fullscreen-routes.ts`) y lo aplica un
componente cliente, `ChromeGate`, que envuelve las dos piezas de sesion del armazon —`Header` es de
servidor y no puede mirar la ruta por su cuenta—. La comprobacion vive **tambien** dentro de
`BottomNav`: el gate quita el arbol desde el armazon, y la copia deja el componente correcto aunque
alguien lo monte por su lado. Ojo con el prefijo: `/partidas` (los hubs) comparte las ocho primeras
letras con `/partida` y un `startsWith` a secas dejaria los hubs sin navegacion (hay test).

**Consecuencia que no se veia venir:** `/partidas` es la primera ruta del repo cuyo armazon llega a
prerenderarse de verdad, y ahi el chequeo de expiracion del token de Supabase —un `Date.now()` dentro
de `getCurrentUser`— aborta la ruta con «unstable value `Date.now()` while prerendering». Por eso
`app-shell.tsx` llama a `await connection()` antes de leer la sesion: declara ese subarbol como de
peticion. **No saca a nadie del shell estatico** —topbar y barra inferior ya viven bajo su
`<Suspense>` justo para eso (#435)— y no se ve en `/clubes` ni en `/buscar` porque esas paginas
son dinamicas enteras.

Regla que se deriva, y que costara tiempo a quien la ignore: **con Cache Components, leer la sesion o
`searchParams` en el cuerpo de una pagina saca la ruta entera del prerender.** El `?modo=` del hub
de Magic lo lee la ISLA con `useSearchParams`, no la pagina, por lo mismo.

## 2026-08-30 (2) — Dos cosas del canvas de la fase 1a que la implementacion movio de sitio (#931)

**Ambas por el mismo motivo: el contrato de eventos no las expresa.**

1. **El fondo de la tarjeta se elige en la CONFIGURACION, no en la hoja del jugador.** El canvas lo
   ponia en la hoja, pero `cardBackground` viaja dentro de `game_started` y no hay evento que
   cambie los datos de un participante con la partida empezada (issue #943). En la hoja solo podia
   salir apagado, y un control apagado que nadie sabe por que lo esta es peor que no tenerlo. Sigue
   siendo una REFERENCIA (`seat-1`..`seat-6`), nunca bytes: un data-URI acabaria en el log de
   eventos y en el snapshot de `localStorage` (#942). El panel lo pinta debajo de todo, para que la
   barra del asiento —que es del sistema, no del jugador— no desaparezca nunca.
2. **El resumen final NO celebra todavia.** `CelebrationEvent` es una union cerrada de cuatro
   eventos y sus tres alcances (`day`, `milestone`, `ever`) **deduplican**: respaldan una
   restriccion UNIQUE por usuario y clave. Ganar una partida se celebra TODAS las veces, asi que no
   cabe sin un alcance nuevo o una via solo-cliente. Es una decision del sistema de celebraciones, no
   un detalle de esa pantalla.

**Y una regla de UI que salio de un bug real:** las mitades tactiles de ±1 estan posicionadas, y en CSS
un elemento posicionado pinta por ENCIMA de los que estan en flujo aunque vayan antes en el DOM. Por eso
la botonera de veneno y comandante lleva `relative`: sin ella, tocar «veneno» sumaba vida.

## 2026-08-30 (3) — Revisión UX de la fase 1: jugar es lo primario, configurar es lo opcional (#931)

Una revisión de producto sobre la fase 1 recién construida dejó tres decisiones de forma:

1. **«Jugar ya» es el camino primario y la configuración es opcional DE VERDAD.** El hub de Magic
   arranca la partida él mismo (modo + cuántos sois, dos toques hasta el tablero); la pantalla de
   configuración pasa a ser el camino secundario y se reordena: «Empezar» arriba siempre activo, y
   nombres/mazos/comandantes plegados en un `<details>` cuyo resumen enseña la mesa. Antes el botón
   quedaba bajo cuatro tarjetas de campos y la pantalla entera se leía como un formulario
   obligatorio que había que dejar en blanco. En revancha la mesa abre desplegada: a esa pantalla
   se viene justo a repasar quién sigue sentado.

2. **El acceso a Partidas va por shortcuts, no por la navegación pública.** Decisión explícita del
   usuario: shortcut en el manifest de la PWA (mantener pulsado el icono → «Nueva partida») y su
   equivalente nativo para la APK de Capacitor (issue aparte, plugin de app shortcuts). La entrada
   del menú «Tú» se queda como está y la barra de cinco no se toca. Consecuencia asumida: el
   anónimo que navega la web sigue sin ver Partidas en ninguna navegación — llega por URL o por
   shortcut.

3. **El vacío de los hubs en escritorio se llena con contenido real, no con promesas.** «Tu mesa
   habitual» (la última mesa de `table-memory`, jugable en un toque con el turno rotado — la
   convención de revancha) y «Cómo funciona» en tres pasos. La plantilla del hub gana una columna
   `aside` en `lg` donde el historial (fase 7) encajará sin recolocar nada. Sigue vigente la regla
   de no pintar secciones que no existen: sin mesa recordada, la tarjeta no sale.

**Y un agujero que la revisión encontró:** el tablero se come el chrome entero y no tenía salida que
CONSERVARA la partida — en PWA/APK instalada (sin botón atrás en iOS) solo se podía descartar. La
hoja de la partida gana «Salir de la mesa · se queda guardada».

## 2026-08-30 (4) — Lo que enseñó la primera partida real en un móvil (#931)

Tres arreglos que salieron de jugar de verdad, no de los e2e (que corren en viewport de móvil
pero no son un pulgar ni una mesa):

1. **El color del asiento tiñe el panel POR DEFECTO.** El setup enseñaba el swatch del asiento
   como elegido (`?? seat-N`), pero el borrador solo lo guardaba si lo TOCABAS: con «Jugar ya» o
   sin tocar nada, `cardBackground` llegaba `undefined` y la mesa salía monocroma. El fallback
   vive en el PANEL (no en `toSetup`): así repara también las partidas ya guardadas.

2. **El reparto de la mesa se elige por presets VISIBLES, no alternando dos atributos.** «Girar»
   y «repartir» por separado obligaban a ciclar a ciegas. Ahora la hoja de la partida enseña
   miniaturas del tablero real —salen de `resolveLayout`, el mismo módulo que pinta la mesa, así
   que no pueden mentir— agrupadas en «móvil de pie» / «móvil tumbado», con los asientos en su
   color. Elegir una fija orientación y familia a la vez; «Automático» sigue siendo el primero.

3. **Los textos no pueden quedar en «Juga…».** En un móvil estrecho, la consola cedía el nombre
   del turno al hueco del deshacer aunque no hubiera nada que deshacer (ahora, sin nada que
   deshacer, queda solo la flecha) y las filas del overlay de daño truncaban el nombre a favor de
   los botones (ahora son dos líneas: el nombre manda en la suya, y los botones suben a 44 px,
   que además les tocaba por `tap-44`).

## 2026-08-30 (5) — El selector manda sobre la orientación; el sensor del móvil, no (#931)

Pregunta directa del usuario: ¿se puede bloquear el giro de pantalla y que sea el selector de
presets quien gire la mesa? Respuesta: sí, y sin pedir permisos — **contra-rotación por CSS del
escenario entero**, no `screen.orientation.lock()` (que solo existe en fullscreen y en iOS no
existe en absoluto). Si el preset pide una orientación y el viewport tiene la otra, el tablero se
gira 90°; si el SO ya rotó la pantalla, no se gira dos veces. Funciona igual en pestaña, PWA y APK.

La regla fina: **«Automático» sigue al viewport y no gira nunca** — sin esa excepción, un
escritorio apaisado saldría de canto por el default `portrait` de las preferencias. De regalo,
auto en pantalla ancha ahora reparte tumbado (consola flotante) en vez de suponer un móvil de pie.

Las hojas (`<dialog>` en el top layer) quedan fuera del transform del ancestro por cómo funciona el
top layer: salen derechas para quien coge el móvil. El overlay de daño sí gira con su panel — mira
a quien está sentado ahí.

## 2026-08-30 (6) — Segunda ronda sobre partida real: geometría sin medidas y contadores de esquina (#931)

1. **A 0° y 180° el panel NO se mide: va en flujo con `h-full w-full`.** `rotate(180deg)` deja la
   caja idéntica, así que solo los laterales (±90) necesitan la caja medida e intercambiada. La
   versión que centraba TODAS las rotaciones con la medida del ResizeObserver se descuadraba en
   móvil real (barra de color y botonera desplazadas o cortadas) cuando la barra del navegador
   aparecía o se escondía y la medida llegaba un frame tarde. Regla: la medida solo puede decidir
   cosas que toleren un frame de retraso (el tamaño del número, sí; la geometría, no).

2. **Los contadores son chips de esquina, no medias filas.** Veneno y daño de comandante ocupaban
   el ancho entero del panel siendo situacionales. Ahora: ancho al contenido, 44 px de alto (son
   el objetivo del pulgar; `tap-44` no sirve dentro del overflow del panel), y a cero solo el
   icono atenuado. El racimo es el sitio donde entrarán los contadores genéricos (energía,
   experiencia, tesoros…) cuando el motor los tenga — diseño acordado sobre la app de referencia
   del usuario: chip solo cuando el contador existe, picker en la hoja del jugador (issue #953).

## 2026-08-30 (7) — En el daño de comandante, el número ES el control (#931)

Tercera ronda sobre partida real. Las filas del overlay (nombre + contador + botones +1/+5) eran
tan altas que con la mesa llena había que desplazarse. Ahora es una rejilla de celdas compactas —
TODOS los rivales a la vez— y la celda entera es el control: **tocar suma 1** (la ráfaga sigue
fundiendo toques en un evento) y **mantener pulsado revela las mitades de −/+**, la misma anatomía
que las vidas del panel.

La pulsación larga rompe a sabiendas la regla de «un toque, no una pulsación larga» (comentario en
player-panel sobre abrir la hoja): aquí es aceptable porque NO es la única vía — el camino sin
puntero es tocar (+1, botón accesible) y deshacer desde la consola, y una vez reveladas las mitades
son botones de verdad, enfocables. El umbral letal sale de `modeConfig`, no de un 21 escrito.

## 2026-08-30 (8) — El daño del PROPIO comandante vale, y la rejilla nunca se desplaza (#931)

Dos arreglos más de la misma partida real:

1. **El reducer prohibía el daño de un comandante a su propio dueño, y era una regla inventada**
   (había hasta un test defendiéndola). Los 21 cuentan el daño de combate de UN comandante dé
   igual quién lo controle: te lo roban, una pelea, una redirección. Se quita la validación, el
   desglose (`commanderDamageBreakdown`) incluye al propio, y en la rejilla del overlay el
   comandante propio va AL FINAL marcado «tuyo» — posible, pero fuera de donde caen los pulgares.
   Lección: una validación de reglas de juego se contrasta con las reglas, no con la intuición.

2. **La rejilla del daño usa `auto-rows-fr`**: las filas se reparten el alto disponible, quepan 2
   o 5, y el desplazamiento desaparece por construcción — la altura fija por celda (64 px) seguía
   desbordando los paneles cortos del reparto tumbado.

## 2026-08-30 (9) — La consola flotante se retira: banda con fila propia en TODAS las orientaciones

La decisión 2026-08-29 (6) puso la consola FLOTANDO en el centro cuando la mesa va
tumbada, para no gastar 68 px de alto. En la partida real del 2026-08-30 se vio el
fallo estructural: tumbada, TODAS las cabeceras pegan sus nombres a la franja
central — exactamente donde flota la consola (z-20) — y los nombres quedaban
intocables: sus hojas eran inaccesibles. Ninguna reserva de padding lo arregla
(la consola mide ~300 px; el px-9 reservaba 36).

Resolución: la consola es SIEMPRE banda con fila `auto` en la rejilla, en las tres
familias y las dos orientaciones — con fila propia no puede tapar nada, por
construcción. Se compacta (py-1, menú 32 px) para que el coste tumbada sea mínimo:
el número de vidas baja de 78 a ~76 px, medido con `lifeFontSize`. El px-9 de las
cabeceras que reservaba el hueco se recupera (px-2.5). `ConsoleMode` desaparece
del módulo de layout.

En la misma pasada, afordancia de las hojas (feedback de la misma partida: «los
botones no parecen accionables, están todos mezclados»): las filas de acción van
en grupos `SheetGroup` — caja con borde, separadores `divide-y` entre filas y
chevron `›` en cada una. Las acciones que acaban la partida (finalizar, descartar;
gana/eliminado en la hoja de jugador) van en su propia caja, separadas de los
ajustes.

## 2026-08-30 (10) — El store de Play hidrata asíncrono: loading no es «no hay partida»

Fase 3 de #931 mueve la partida activa de `localStorage` (síncrono) a IndexedDB
(asíncrono, `src/lib/play/core/db.ts`). Eso cambia el contrato que la UI recibe del
store: `getSnapshot()` ya no puede devolver directamente `game: ActiveGame | null`
porque en el primer render no se sabe todavía si hay partida — IndexedDB no se lee
antes de pintar. `PlayStoreSnapshot` (`src/lib/play/core/store.ts`) queda como:

```ts
type PlayStoreSnapshot =
  | { status: "loading"; game: null }
  | { status: "ready"; game: ActiveGame | null };
```

`status: "loading"` y `status: "ready", game: null` NO son el mismo estado y la UI
no puede tratarlos igual. `GameScreen` (`src/components/play/game-screen.tsx`)
pinta fieltro vacío sin mensaje mientras hidrata, y solo enseña el vacío de «no hay
ninguna partida en curso» (`play.empty.noActiveGame`) una vez `status === "ready"`
confirma que no hay nada que recuperar. Tratar `loading` como «no hay partida»
sería el parpadeo que la spec de fase 3 prohíbe: un frame de vacío-con-salida (o
peor, una redirección) antes de que la lectura a IndexedDB complete, en CADA
recarga de `/partida/activa` — el camino más común de esta pantalla.

**El CAS por `rev` (`writeActive` en `db.ts`) es la única defensa contra pestañas
concurrentes.** Sin backend ni locks reales, dos pestañas de la misma partida
(la sesión sobrevive a cerrar una pestaña, no solo a recargar) pueden escribir
casi a la vez; `rev` es un contador monótono por registro y la escritura ocurre
DENTRO de la transacción de IndexedDB — si el registro en BD ya tiene un `rev`
igual o mayor, la escritura entrante pierde y no pisa el estado más nuevo. No hay
merge: gana la escritura cuyo `rev` de partida es más alto, tal cual ya lo
observa el mirror por `BroadcastChannel` entre pestañas.

`parseSnapshot` (antes separaba parseo de forma y replay de semántica en dos
pasadas) ahora se apoya en `parseLog`, que valida forma, sella la ráfaga
`pending` y hace UN solo `replay`, devolviendo `{ log, state }` juntos en una
pasada (cierra #936). Evita el caso en que una forma válida pero una semántica
inconsistente (evento que el reducer rechaza) se detectara tarde, en un segundo
paso separado del parseo.

## 2026-08-30 (11) — La cola de escrituras de Play solo ejecuta lo que sigue vigente

Una tarea encolada en `writeChain` (src/lib/play/core/store.ts, `persistCurrent`) se
serializa al encolarse pero se ejecuta más tarde; entre medias puede haber pasado un
commit local posterior o una adopción por CAS/espejo. Decisión: **la tarea comprueba al
ejecutarse que el estado que serializó sigue siendo el vigente** (`snapshot !== current`
→ se salta). Consecuencias deliberadas:

- Una escritura intermedia superada por un commit local posterior NO se ejecuta: la
  siguiente lleva el log completo (superset), así que la BD alcanza el estado actual
  antes y la ventana de crash se estrecha.
- Tras perder un CAS y adoptar el registro ganador, las escrituras rancias que quedaban
  en cola NO resucitan en la BD un estado que la memoria ya no muestra. Invariante que
  se gana: **la BD nunca contradice la memoria local**.
- Coste asumido: una escritura intermedia saltada ya no detecta su conflicto entre
  pestañas; lo detecta la final. Sigue dentro del sobre «winner takes all» documentado
  en los tests del espejo.

Verificado en la re-review final de fase 3: toda mutación de `rev`/`snapshot` o bien
encola su propia persistencia de reemplazo detrás de la tarea saltada (misma FIFO), o
es una adopción tras la cual la BD ya coincide — no existe camino que invalide una
tarea sin dejar reemplazo. Origen: review final de la rama de fase 3 (PR #957/#958).

## 2026-08-30 (12) — Puntuación por rondas: target informativo y presets que solo prefijan

Fase 4 de #931 añade la segunda herramienta de Play. Tres decisiones de forma, más el
resultado del gate «¿cuánto tocó del core?» que la fase llevaba como condición de éxito.

**El límite (`ScoreTarget`, `src/lib/play/score/types.ts`) es informativo, no un fin de
partida.** `scoreReducer` (`src/lib/play/score/reducer.ts`) no conoce el target: nunca
fuerza `status: "finished"` al alcanzarlo. Quien decide que se ha llegado es el selector
`limitReached` (`src/lib/play/score/selectors.ts`), y la única consecuencia es que
`ScoreBoard` (`src/components/play/score/score-board.tsx`) muestra una banda con un botón
«Finalizar» — no bloqueante: se puede seguir apuntando rondas con la banda visible, tal
como cubre el tercer test de `e2e/partidas-puntuacion.spec.ts`. La semántica funciona en
ambas direcciones porque `target.kind === "points"` compara con `>=` sobre los totales
sin mirar `direction`: con `"highest"` llegar te da la victoria (UNO a 500); con
`"lowest"` llegar te condena y gana quien menos tiene (golf, dominó). Es la misma lectura
que ya dejó el comentario de `ScoreTarget` en `types.ts`, confirmada aquí por el test.

**Los presets (`ScorePresetId` en `score-preset-chooser.tsx`) son prefill puro, nunca
modos.** A diferencia de mtg (donde el modo decide vidas iniciales y si aplican los 21 de
comandante, algo que el motor sí valida), «Libre», «A N rondas» y «A X puntos» solo
deciden qué número trae precargado el formulario de configuración
(`SCORE_PRESET_PREFILL`) y el target de «Jugar ya». `ScoreSetupForm` deja cambiar ese
número o desactivar el límite sin que el motor rechace nada: hay una sola herramienta de
puntuación, no tres. El tercer test del spec lo ejercita end-to-end: preset «A X puntos»
(prefill 100) se reconfigura a 20 en el formulario y el motor arranca con exactamente ese
valor.

**Una ronda entera es un evento, no una celda.** `round_scored` da de alta una ronda con
una puntuación por asiento; `round_edited` la sustituye entera (`reducer.ts`, caso
`round_edited`). En la UI, tocar CUALQUIER celda de la columna de una ronda abre la misma
hoja con los valores de esa ronda completa (`ScoreBoard`, `setSheetRound(index)` no
depende de qué asiento se tocó) — no hay edición por celda suelta. La consecuencia
gratuita es que deshacer una edición es deshacer LA RONDA: como el store reconstruye el
estado por replay del log (`undoLast` en `core/log.ts`) y no por reversión manual de
campos, quitar el evento `round_edited` basta para que la ronda vuelva a sus valores
anteriores sin lógica de deshacer específica de puntuación. Verificado en el primer test
del spec (editar la ronda 2, deshacer, comprobar que el total vuelve al de antes).

**Resultado del gate del core.** La condición de éxito de la fase era que añadir una
segunda herramienta NO obligara a tocar el motor genérico (`src/lib/play/core/`), solo
los registros. Verificado con `git diff main...HEAD --stat -- src/lib/play/core`: el
único cambio de las nueve fases-tarea es

```
src/lib/play/core/types.ts | 2 +-
1 file changed, 1 insertion(+), 1 deletion(-)
```

— la línea `export type ToolId = "mtg" | "score";`. Nada de `store.ts`, `log.ts`,
`db.ts` ni `game-screen.tsx` cambió: la pantalla instrumento compartida y la persistencia
resolvieron la herramienta nueva enteramente a través de los dos registros
(`src/lib/play/tools.ts` de dominio y `src/components/play/tool-views.tsx` de UI), tal
como preveía la spec de fase 4. Es la confirmación práctica de que la frontera
core/herramienta trazada en fases 0-3 aguanta una segunda herramienta con reglas propias
(target informativo, sin turno, sin asientos rotables) sin ensancharse.

## 2026-08-30 — Los shells de Play se cachean en el SW aunque Next los marque personales

**El problema.** Play es local-first a propósito (la partida vive en IndexedDB, funciona en
modo avión), pero sus pantallas no: `/partidas*` y `/partida/activa` llevan un boundary de
sesión (`connection()` + `getCurrentUser` para la clave de identidad del store), Next las
sirve con `Cache-Control: private, no-store`, y `swCacheableDocument` (#680) rechazaba
guardarlas — sin red, el SW servía `/offline` y el dominio sobrevivía al avión pero sus
pantallas no. Aplica igual a la PWA y al APK (mismo SW en el WebView remoto).

**La decisión.** Excepción quirúrgica en `public/sw.js` (v5): un documento cuya ruta pasa
`swOfflineShellRoute` (`/^\/partida(s)?(\/|$)/`) se guarda como salvavidas aunque venga
marcado `no-store`, y no se borra del caché por un error transitorio del servidor. NO
reabre #680 porque (a) lo único por-usuario en ese HTML es el id de identidad serializado
hacia las islas — el estado de juego se hidrata de IndexedDB en el cliente —, y (b) el
purge de logout ya tira `CACHE_NAME` entero, así que la copia muere con la sesión, igual
que el resto de documentos. Los payloads RSC siguen sin tocarse: verificado que offline
Next degrada la navegación cliente a navegación completa y esa sí la sirve el caché.
Verificación con Playwright contra build de producción (tablero con su partida tras
recarga offline, hub, setups; `/coleccion` sigue cayendo a `/offline`; el purge deja solo
`/offline`). No se añade e2e permanente: exigiría build de producción como `sw-rsc.spec.ts`
(opt-in `SW_E2E=1`) y el guardado en Cache Storage es asíncrono respecto a la navegación —
demasiado flaky para el harness normal.

## 2026-08-31 — Play fase 5: espejo local como fuente del historial
- La UI de «Guardadas» lee SOLO IndexedDB; un sincronizador de fondo (push/pull)
  la iguala a `play_games`. El servidor manda sobre lo synced; un pending local
  jamás es pisado por el pull.
- Una tabla JSONB (log íntegro en `events`) en vez de eventos por filas: las
  filas por evento solo pagan cuando llegue el multiplayer (fase 9).
- Adopción de partidas anon: banner explícito al entrar, nunca automática.

## 2026-08-31 — Play fase 6: jugadores habituales
- Habituales solo con sesión: anon monta mesa con invitados, sin espejo anon ni adopción.
- El log y el summary embeben COPIA del nombre: renombrar/borrar un habitual no reescribe
  partidas guardadas. Las stats futuras agregan por playerId.
- planSync y el ejecutor de espejo son genéricos y los comparten guardadas y jugadores:
  un fix de reconciliación se hace UNA vez.
- Editar el nombre de un asiento asignado degrada a invitado; el habitual se renombra solo
  desde gestión (regla visible, sin renombrados por accidente).

## 2026-08-31 — Play: etiqueta de juego en puntuación
- La etiqueta viaja en el LOG (gameName en setup + evento game_labeled, aceptado también
  en finished): nunca edición a mano del summary guardado — el summary siempre se deriva.
- Chips de juegos anteriores derivados del historial local; sin entidad «juego» ni sync.
- Agrupación case-insensitive de stats: decisión diferida a la fase de estadísticas.

## 2026-08-31 — Randomizer como acompañante fuera del slot de partida

- El «Aleatorio» usa el estilo de motor de Play (eventos + reducer puro; el azar
  se resuelve al despachar y el resultado viaja en el payload) pero NO entra en
  ToolId/playTools: el slot `active` es único por identidad y el randomizer se
  usa durante otra partida — entrar al registro la pisaría.
- Persistencia en store IDB propio `companion` (DB v4) con el mismo CAS que
  `active`; sin Supabase ni historial (una tirada no es una partida).
- El log se compacta al pasar 200 eventos re-basando el estado y conservando los
  últimos 20 (el feed enseña 20; deshacer más allá no tiene caso de uso).

## Aleatorio visual: la animación es teatro hacia un resultado ya emitido (2026-08-31)

Los escenarios animados del Aleatorio (cubo 3D, moneda, ruleta, bolsa) se montan
como capa de presentación pura: el azar se resuelve y se emite ANTES de animar,
y la animación coreografía hacia ese resultado (crash-safe; el feed va por
delante del teatro ~1 s, asumido). Se descartó emitir al terminar la animación
(estado «pending» nuevo en el motor, tiradas perdibles al cerrar) y las librerías
de animación (+30 kB para lo que CSS 3D ya hace). El azar visual de relleno vive
en los componentes, jamás en el reducer. Spec:
docs/superpowers/specs/2026-08-31-play-randomizer-visual-design.md

## Aleatorio: coins_flipped conserva a coin_flipped, y el feed lee feedRow (2026-08-31)

Las monedas múltiples entraron como evento NUEVO `coins_flipped` {count, results[]}
(una tirada = una entrada de feed y un deshacer) en vez de ensanchar el payload
de `coin_flipped`: los logs persistidos en IDB deben re-jugar, así que el evento
viejo se conserva válido en el reducer para siempre aunque la UI ya no lo emita.
Misma iteración: `describeRandomEvent` y el namespace i18n `play.random.log`
murieron a favor del selector `feedRow` (etiqueta/valor/desglose estructurados)
— una sola fuente para el feed visual; el switch se dejó exhaustivo sin default
para que un evento nuevo rompa la compilación y no pinte una fila en blanco.
Specs: 2026-08-31-play-random-multi-design.md y
2026-08-31-play-random-hierarchy-design.md.

## Reloj de partida: el tiempo se deriva de timestamps, nunca de un contador vivo (2026-09-01)

El segundo acompañante (reloj de ajedrez + cuenta atrás) guarda en el log los TOQUES
(turn_passed, pausa…) con su timestamp, y el reducer «liquida» el tiempo transcurrido
entre eventos; el tick de pantalla es solo UI (`remainingAt(state, now)`). Cerrar la app
a mitad de turno no pierde tiempo. Se descartó el contador con setInterval + persist
periódico (pierde el intervalo final y rompe el patrón de companions). Consecuencias
asumidas: un reloj del sistema hacia atrás se CLAVA al `lastEventAt` vigente al emitir
(el replay de logs guardados sí lanza ante `at` no monotónico — registro corrupto se
descarta), y la monotonía es parte del contrato del log. De paso, el hook del Aleatorio
se generalizó a `useCompanionStore` (core) con la clave vieja intacta; el reloj usa
`{identity}:clock` en el mismo almacén `companion`. Spec:
docs/superpowers/specs/2026-09-01-play-clock-design.md.

## Recursos: reconciliación por nombre y clamp en vez de rechazo (2026-09-01)

El gestor de recursos guarda el invariante de `values` (una entrada por def compartida y
una por def×jugador) RECONCILIANDO en cada evento que cambia jugadores o defs: quien
permanece conserva su valor, lo nuevo nace al inicial, lo que desaparece se borra. Renombrar
= quitar y crear (pierde el valor, asumido y en spec). Y `adjusted` CLAMPA el resultado a
−9999..9999 en vez de lanzar: un ajuste de mesa nunca muere en silencio por pasarse — la
excepción deliberada a la regla «payload inválido lanza» de los companions (combinación
inexistente o delta 0 sí lanzan). El gesto de mantener acumula en LOCAL y emite un único
evento al soltar: un gesto = un deshacer, y el log no se llena de ±1. Spec:
docs/superpowers/specs/2026-09-01-play-resources-design.md.

## Turnos: la ronda sube al envolver POSICIONES, no al contar vueltas (2026-09-01)

El tracker de turnos decide el cambio de ronda con una regla puramente posicional: con
dirección 1 la ronda sube cuando el índice nuevo (entre vivos) es ≤ que el viejo; con
dirección −1, simétrico. Ventajas: determinista bajo eliminados y cambios de dirección,
gratis en el replay, y sin estado extra («quién abrió la ronda» se descartó porque el
starter puede caer eliminado). Consecuencias asumidas: retroceder hacia el asiento 0 no
completa vuelta, y dos envolturas consecutivas son IMPOSIBLES (cada envoltura aterriza en
el mínimo vivo y el siguiente avance siempre sube) — un salto suma como mucho una ronda.
Eliminar al activo avanza ANTES de marcarlo (con su ronda si envuelve). La spec §4 se
enmendó al descubrirlo en review: prometía testear «skip que envuelve dos veces», caso
inalcanzable. Spec: docs/superpowers/specs/2026-09-01-play-turns-design.md.

## El selector de jugadores es UNO solo, y la mesa de puntuación son fichas (2026-09-01)

Elegir jugadores se hacía de cinco maneras distintas: fichas de asiento copiadas y pegadas
en Reloj, Recursos y Turnos; input + botón «Añadir» + lista de chips en Aleatorio; y un
contador 2-8 con tarjetas de campos plegadas tras «En la mesa» en Puntuación. El selector
vive ahora en `SeatToken` (átomo: círculo de 44px con su rótulo) y `SeatPicker` (fichas de
color que quitan, habituales atenuados que sientan, ficha «+» que despliega el único
input), y los cuatro acompañantes lo comparten. Triplicado tenía un coste real: el rótulo
del «+» («Añadir jugador», dos palabras en una columna de 56px sin `text-center`) se partía
en dos líneas pegadas a la izquierda, descolgado del círculo, y había que arreglarlo tres
veces; el cuarto acompañante ni siquiera tenía fichas.

Puntuación NO puede usar `SeatPicker` —sus asientos llevan identidad (`playerId`/`userId`)
y admiten nombre vacío—, así que compone `SeatToken` con su propia lógica: el número de
fichas ES el número de jugadores (adiós al contador 2-8), un asiento sin nombre enseña su
número y sigue valiendo «Jugador N» (empezar sin escribir nada, decisión de 2026-08-30, se
conserva), tocar una ficha abre el panel de ESE asiento (nombre + `RegularPicker` +
«Quitar asiento») y tocar un habitual lo sienta en el primer asiento libre en vez de añadir
uno —añadir dejaría a los cuatro anónimos del prefill colgando junto al recién llegado—.
Con add/remove por el medio el id de asiento ya no puede derivarse del índice (`p3`
duplicado): `nextSeatId` toma el primer libre. MTG se queda como estaba: sus asientos
llevan mazo, uno o dos comandantes y fondo de tarjeta, y eso no cabe en una ficha.

## Las fichas de habitual no se cortan en silencio (2026-09-01)

El selector enseñaba los seis primeros habituales y callaba el resto — con más de seis, la
fila no coincidía con la lista de «Tus jugadores», que es lo que reportó el usuario. Y el
orden venía de `getAll` sobre la clave primaria (un UUID), o sea arbitrario: cuáles eran
«los seis» cambiaba sin criterio. Tres cambios: `usePlayers` ordena alfabéticamente en la
ÚNICA fuente, así que la hoja del hub, los chips del setup y las fichas enseñan a la misma
gente en el mismo orden; lo que no cabe en la primera tanda se ofrece en una ficha «+N» que
despliega el resto (`visibleRegulars`, pura y testeada); y escribiendo en el «+» de los
acompañantes se filtra por prefijo SIN tope, que con veinte habituales es más rápido que
recorrer la fila y de paso evita crear un invitado duplicado de alguien que ya es habitual.

Consecuencia en la mesa de puntuación: con las fichas arriba, los chips de `RegularPicker`
bajo el campo repetían a la misma gente. Ahí los chips pasan a salir solo AL ESCRIBIR
(`suggestOnEmpty={false}`); en mtg siguen saliendo con el campo vacío, porque allí no hay
fichas y los chips son lo único que hace descubribles a los habituales (spec fase 6 §6).

## La ficha de asiento se toca para abrir, nunca para quitar (2026-09-01)

En los acompañantes tocar una ficha quitaba al jugador y en puntuación la abría: la misma forma con dos
acciones opuestas, y la primera sin deshacer. Se unifica en `SeatRow`: tocar selecciona y abre el panel;
quitar vive dentro. Los acompañantes no renombran (identifican por nombre; renombrar sería quitar+añadir).

## Los recursos llevan glifo propio y se ajustan con `resource_updated` (2026-09-01)

Los iconos eran emoji del sistema: `🪙`/`🪨` son Emoji 13 y salían en blanco en Windows 10 y Android < 11,
además de contravenir DESIGN.md. Diez glifos SVG en `resource-icons.tsx`; el id viaja en el campo `emoji`
(≤ 8 chars, reducer intacto) y los eventos viejos siguen pintando su texto. Los presets crean de un toque
(inicial 0, jugadores) y el panel de la ficha emite `resource_updated`, que solo toca la definición: los
valores ya ajustados se conservan; los que seguían en el inicial viejo pasan al nuevo, para que configurar
después de crear deje a todos en el inicial.

## Sin `type=number`, `select` ni `checkbox` en BiblioPlay (2026-09-01)

Tras la critique visual (25/40): la hoja de ronda va con chips ±5/±10/±20 y −/+ con mantener, el límite
de puntuación es Libre/Rondas/Puntos con `TargetStepper` (paso 1 rondas, 5 puntos) en hub y config, la
config de MTG son fichas con panel + chips de vidas + fichas de quién empieza, el equipo de Aleatorio se
elige con chips 2..N-1 y la bolsa se rellena tras un «+». Única excepción: las caras del `d?` del
Aleatorio, ya tras su chip.

## El número del stepper no lleva aria-live en setups ni hubs (2026-09-01)

El e2e del tablero (`/partida/activa`) cuenta exactamente una live region. Con Cache Components el DOM de
la ruta anterior queda congelado y oculto (`display:none`) tras `router.push`, así que un `aria-live` en
una pantalla de setup o de hub se suma a esa cuenta aunque esté invisible (issue #1003). Los steppers
llevan `aria-label` en sus botones y en el número visible, sin `aria-live`.

## 2026-09-02 — Mascota RPG: todo lo derivable se deriva

Cierre de la fase 1 (spec `docs/superpowers/specs/2026-09-02-mascota-rpg-design.md`). Los tres porqués
que fijan el contrato:

- **Derivado vs libro mayor.** XP, atributos, nivel y etapa se calculan cada vez a partir de las tablas
  que ya existen (`progress_sessions`, `passes`, `notes`, posts de club…); no hay una tabla de XP que
  sumar. Consecuencia directa: los usuarios con historial no empiezan de cero, rebalancear pesos es
  cambiar `balance.ts` y no hay ganchos nuevos que mantener en cada escritura del dominio — la lección
  de #459 con las celebraciones, donde los ganchos se olvidan.
- **Rig por partes vs frames.** Se compararon tres formas de animar el companion: cuerpo rígido (barato
  pero muerto), frames por capa (sprite sheet clásico, coste = clases × capas × animaciones × frames, y
  la IA falla manteniendo coherencia entre frames) y rig por partes. Gana el rig porque una animación se
  define una vez (`transform` + `transform-origin` sobre cada pieza) y vale para las seis clases.
- **Humor sin castigo.** La mascota es un espejo, no una máquina de culpa: nunca pierde nivel ni
  atributos por inactividad. Lo único que baja sin uso es el humor (capa cara + animación idle), y
  vuelve al entrar. No hay bocadillos espontáneos ni avisos de «te echo de menos» — el humor se ve, no
  se anuncia.

**Calibración contra prod (solo lectura, 9 perfiles reales, Task 10).** Con la fórmula aproximada de la
spec (minutos/10 + terminados×10 + notas×3 + posts×3 + días activos×2, activos ≈ nº de sesiones) el
usuario más activo de prod rondaba 1 600 XP estimados. El divisor de referencia de la spec (50, nivel 10
= 4 050 XP) lo dejaba en nivel 6; ni siquiera el ejemplo de la propia spec (25, nivel 10 = 2 025 XP)
llegaba (nivel 9). Se baja `BALANCE.level.divisor` a **15** (nivel 10 = 1 215 XP): el usuario más activo
queda en nivel 11 (adulta) con margen, y como el resto de fuentes de XP de la spec (valoraciones, votos,
rachas, sagas completadas…) no entran en esta estimación aproximada, el XP real solo puede ser mayor —
el margen es conservador, no ajustado al límite. Detalle de la tabla y el cálculo en el informe de
Task 10 (`.superpowers/sdd/task-10-report.md`).

## 2026-09-02 — Mascota: «Qué la sube» enseña totales, no los últimos siete días (acta)

La spec (`docs/superpowers/specs/2026-09-02-mascota-rpg-design.md` §7) pedía que la sección «Qué la
sube» mostrara, por atributo, lo aportado en los últimos siete días. La fase 1 enseña totales de
siempre: `PetCounts` (`src/lib/pet/counts.ts`) no lleva ventana temporal, y `getPetCounts` ya hace
~12 `select` por página; una franja de siete días exige una segunda pasada filtrada por fecha sobre
las mismas tablas, coste que no compensaba para el cierre de fase 1. El objetivo de la sección — que
la mascota no parezca arbitraria — lo cubren los totales junto con el fichero de balance
(`balance.ts`, calibrado contra prod): el usuario ve de dónde sale cada punto, aunque no acotado a la
semana. Se registra como issue #1022 para que nadie lea la spec y dé la ventana de siete días por
implementada.

## 2026-09-02 — Mascota: el historial volcado es una dote con tope, no actividad

**Problema.** `deriveAttributes` contaba todo pase `completed` como obra terminada (INT ×10), y
lo mismo con las valoraciones de pase (SAB), las obras y autores nuevos (DES) y los géneros (INT).
Quien llega de Goodreads/Letterboxd o vuelca a mano lo que leyó hace años entra con cientos de pases
de golpe. En prod (2026-09-02) dos de los cuatro usuarios con pases tenían ~148 terminados y el 95 %
eran retroactivos o nacidos en un día de ráfaga: INT ~1 500 frente a decenas en el resto, `suggestClass`
proponía wizard a todo el mundo y la calibración del divisor (entrada anterior) se había hecho sobre
ese XP inflado. La mascota debe crecer con lo que haces EN la app, no con lo que ya habías leído.

**Decisión.** `splitPassHistory` (`src/lib/pet/counts.ts`, pura, con tests) separa cada pase en
*vivido* u *historial* sin columna nueva —`passes` no marca el origen y añadir una columna no
arreglaría las filas ya existentes—. Es historial si cumple cualquiera de:

- `finished_on` anterior al día LOCAL de `created_at` (se registró hoy una lectura pasada);
- `created_at` a medianoche UTC exacta (solo el importador inserta sin hora, al fechar relecturas
  pasadas con `historicalCreatedAt`; en prod hoy no hay ninguna, pero el camino existe);
- su día de alta tiene `BALANCE.history.burstMin` (10) pases o más: un volcado. Tapa el hueco del
  importador, que cierra con la fecha del import los CSV sin *Date Read* y por eso no parecen
  retroactivos. Diez es holgado frente a las ráfagas reales (138-143) y no pilla a quien apila cinco
  libros una tarde.

Lo vivido pesa como antes. El historial solo entra como **dote con tope**: `INT.perHistoricalPass`
2 × hasta 50 terminados (máx. 100 INT) y `DES.perHistoricalWork` 1 × hasta 50 obras distintas (máx.
50 DES). Reconoce que leíste sin decidir la clase. Valoraciones, autores y géneros del historial no
suman. Excepción: para dar por completada una saga vale cualquier pase terminado, también histórico,
porque seguir la saga ya es un acto en la app y el número de sagas está acotado.

**Efectos colaterales.** Desaparece `DES.perImportedRow`/`importedRowCap`: contaba
`pending_import_rows` resueltas, que en prod eran cero para todo el mundo (el importador normal no
pasa por ahí); la dote de obras del historial lo sustituye con los mismos números. Como el nivel se
deriva y este cambio lo BAJA, `getPetSnapshot` ahora también guarda `last_level`/`last_stage` cuando
descienden —sin celebración—, para que la siguiente subida real se celebre y no quede tapada por un
nivel guardado más alto.

**Recalibración.** Con la fórmula aproximada nueva el usuario más activo de prod ronda 1 300 XP con
bonus de clase (nivel 10 con divisor 15: adulta, justo); los otros dos con historial volcado quedan
en ~7 y ~4. El divisor se queda en 15: la entrada anterior lo justificaba con 1 600 XP inflados, esta
lo sostiene con actividad real. Si la spec (§3, congelada) o `balance.ts` discrepan, manda esta
entrada y el código.

**Ampliación (rama `feat/mascota-rpg`, fase 2).** La primera versión de esto dejaba un agujero: CON
seguía saliendo de `getStreaks()`, que cuenta como día activo CUALQUIER `finished_on`, también el de
un pase histórico. Quien volcaba 148 lecturas con sus fechas entraba con ~148 días activos, la mejor
racha de otra app y, con ella, los logros `streak_30`/`streak_100` desbloqueados sin haber abierto
la app dos días seguidos. Desde este commit, los **días activos, la mejor racha y los hitos de racha
de la mascota** salen de `petActiveDays(sessionRows, livedPasses)` (`src/lib/pet/counts.ts`, pura,
con test): días de `progress_sessions.session_date` ∪ `finished_on` de los pases **vividos**. Es la
misma regla que el resto de la entrada —el historial es dote, no actividad— aplicada al último sitio
donde no lo era. `getStreaks()` **no se toca**: sigue siendo la racha global del panel de perfil, que
sí quiere reconocer todo lo que terminaste. Que las dos cifras puedan diferir es deliberado: miden
cosas distintas y solo la de la mascota decide XP.

## 2026-09-03 — Mascota fase 2: misiones con asignación guardada, progreso derivado; logros sin tabla

Spec `docs/superpowers/specs/2026-09-02-mascota-misiones-logros-design.md`. Se guarda SOLO qué tres
misiones tocaron hoy (`pet_daily_missions`): derivarlas haría que mutaran a mediodía al cambiar de
clase o subir un atributo. Progreso (`missions/progress.ts`), XP (`missionXp` en `PetCounts`) y
logros (`achievements.ts`) se derivan; el rastro de un logro es la celebración
`pet_achievement:<id>`, cuya `first_triggered_at` es la fecha de la galería. Celebraciones ganan un
scope `key` (clave libre) porque ni `day` ni `milestone` distinguen «misión 2 del 3 de septiembre».

**XP de misión = la orgánica de la acción, duplicada** (`missionXp()` en `templates.ts` lee los pesos
de `BALANCE`; no hay tabla de premios aparte): bonus, no motor. **Las duras solo se asignan si son
alcanzables hoy** (libro ≥ 70 %, serie con ≤ 2 episodios, terminado en 7 días sin reseña) y cuentan
sobre la obra asignada. Máximo una dura al día, siempre en el hueco de azar.

**Desviación de la spec**: la tabla lleva `item_title` congelado al asignar, para pintar «Termina
*Dune*» sin consultar el catálogo en cada visita ni perder el título si la obra se fusiona.

**Límite conocido, registrado como issue:** la XP de una misión que se completa en la misma lectura de
`/mascota` no entra en la barra hasta la siguiente visita (los contadores se leen antes de sellar
`completed_at`). Se corrige en la revisión final de la rama re-derivando tras el sync.

**Límite asumido**: todo se detecta al abrir `/mascota` (#1020). Las misiones de ayer sin completar
se evalúan también; a los dos días caducan.

**Migración en dev y, desde el mismo día, en prod.** La intención era dejarla solo en dev hasta mergear,
pero la preview de Vercel de la PR corre contra Supabase prod y `/mascota` reventaba con la tabla
ausente. Como es aditiva pura (tabla nueva, sin tocar nada que use `main`), el usuario autorizó
aplicarla en prod antes del merge; verificada `12 | 9 | 1 | 0 | 3 | true`, igual que dev.


## 2026-09-02 — Mascota: logros por familias con escalera abierta e insignias

Spec `docs/superpowers/specs/2026-09-02-mascota-logros-niveles-design.md`. Los logros planos de la
fase 2 pasan a **familias** (`ACHIEVEMENT_FAMILIES`) con una **escalera** en `BALANCE.achievements`:
primeros niveles a mano y después `+then` por nivel, sin tope (`stage` es la única cerrada). Nivel =
función pura del valor; el rastro sigue siendo `pet_achievement:<familia>:<tier>`, una fila por nivel.
La vitrina enseña, por familia, la última insignia conseguida y la siguiente por conseguir.

**Insignias**: una PNG 32×32 por familia (`public/pet/badges/`, `scripts/pet-badges.mjs`, manifiesto
con test), el nivel se pinta con número y marco que cicla bronce/plata/oro/leyenda. Se descartó a
propósito arte por nivel: N familias de arte IA, no N × niveles. El codificador PNG pasa a
`scripts/lib/png.mjs`, compartido con los sprites.

**Subir varios niveles de golpe** gana todos los intermedios sellados (con fecha) y anima solo el más
alto de la familia. **Migración de datos** `20260904_pet_achievement_tiers.sql` renombra las claves
planas; los primeros pasos de cada escalera se eligieron para que casen con los umbrales viejos y no
se pierda ninguna fecha. Aplicada en dev el 2026-09-02; prod: aplicada y verificada el mismo día (2
filas renombradas, selladas), en versión idempotente (borra la clave vieja si la nueva ya existe)
porque la preview de Vercel corre contra prod.


## 2026-09-02 — Mascota: tanda de deuda tras el merge de la fase 2 (#1023, #1036, #1037, #1041, #1042)

Rama `fix/mascota-deuda`, tras mergear #1027. Cinco decisiones pequeñas, todas en la línea «espejo,
no máquina de culpa» y «todo lo derivable se deriva»:

- **El historial volcado tampoco es "última actividad"** (#1041). `lastActivityISO` (humor y salida
  de la bellota) se calcula sobre los pases VIVIDOS, la misma regla que los días activos y la racha.
  Un import con *Date Read* vacío ya no pone la ardilla contenta el día del import.
- **La compañera se lee con un RPC** (`get_companion_state()`, `20260905`): una consulta por página en
  vez de cinco (#1023). Replica en SQL las reglas de `splitPassHistory` y el `burstMin`; el precio es
  mantener dos copias de la regla, y se acepta porque la alternativa era leer todos los pases del
  usuario en cada página. **El día se agrupa en la zona que pasa la app** (`p_tz` = la del proceso de
  Node, la misma que `toISODate()`), NO en Europe/Madrid fijo como `get_widget_snapshot`: la revisión
  midió 7 pases de prod que caían en días distintos según la zona (cerrados a las 23:5x UTC) y la
  compañera habría salido triste o en bellota con `/mascota` contenta. Aplicada en dev y en prod el
  mismo día (aditiva: función nueva que `main` aún no llama), verificada contra `pg_proc`.
- **`finish_pass` compara en la escala de cada tipo** (#1036): `finishRemaining` devuelve «cuánto
  queda» normalizado (libro: páginas que faltan sobre el tramo elegible; serie: episodios sobre el
  tope) y gana la de MENOS resto. Antes un `ratio` compartido descartaba la serie con 0 de 2 vistos y
  hacía ganar a un libro al 95 % sobre una serie a un episodio del final.
- **La elegibilidad de misiones es perezosa** (#1037): solo la paga el primer render del día. Los
  libros se leen una sola vez por visita (unión de vividos y abiertos) y ediciones, series y el título
  de la candidata a reseña salen en un único `Promise.all`.
- **`last_level` nace con el nivel real** (#1042): `hatchPet` deriva el nivel al eclosionar, así la
  primera visita de alguien con historial no celebra una subida de golpe; si contar falla, no eclosiona
  (antes que guardar un 1 que celebraría la subida igual). `last_stage` sigue naciendo en `acorn`: la
  salida de la bellota (primera actividad tras eclosionar) se celebra UNA vez, aterrice en `young` o
  directamente en `adult` si el nivel ya lo es. Es la única celebración de primera visita que queda.


## 2026-09-03 — Mascota fase 3: avisos push por racha y humor (#1014)

Rama `feat/mascota-push`, spec `docs/superpowers/specs/2026-09-02-mascota-avisos-push-design.md`.
El criterio de siempre: **espejo, no máquina de culpa**. Un aviso de la mascota es una nota corta
que muere con la pantalla — no se acumula, no se repite, no escala.

- **Alcance: racha en peligro + humor, nada más.** Fuera «tienes misiones sin hacer» (se solapa con
  la racha y es ruido) y «has subido de nivel» (#1020: exigiría derivar el XP de TODOS los usuarios
  cada noche). Cada descarte queda como issue.
- **Hora fija, 20:00 Europe/Madrid.** Configurable por usuario es fase futura, no fase 3.
- **El humor solo avisa en la TRANSICIÓN**: a los 2 días (`mood_sleepy`) y a los 4 (`mood_sad`), y
  nunca más. A los 3, a los 5 y a los 10 no hay regla. Repetir el aviso cada N días se descartó a
  propósito: eso es exactamente la máquina de culpa.
- **La racha avisa desde 3 días** (`BALANCE.nudges.streakMin`). Por debajo no hay nada que perder.
- **Categoría propia «Mascota»** (`notification_preferences.category_pet`, quinto interruptor de
  ajustes) en vez de colarlo en `progress`: quien quiere los avisos de la mascota puede no querer
  los de progreso, y al revés. **Y compañera oculta = silencio**: esconderla ya es la respuesta a
  «no me hables de esto», así que no hace falta apagar además la categoría. Bajo el interruptor lo
  dice la propia UI (`push.categoryPetHint`).
- **Solo push, sin fila en la campana.** Un aviso caducado no debe seguir ahí mañana. Por eso los
  tres `PetNudgeType` **no** entran en el enum `notification_type` de la BD ni en
  `NOTIFICATION_CATEGORY`: nunca se inserta en `notifications`. El `type` viaja en el `data` del
  push solo como etiqueta; lo que se usa es la ruta (`/mascota`).
- **Claim en SQL, envío en Node**, calcado de los recordatorios de club: `claim_pet_nudges(p_day)`
  decide e inserta en `pet_nudges` con `on conflict (user_id, day) do nothing` devolviendo solo lo
  nuevo, y `/api/cron/pet-nudges` envía. El `unique (user_id, day)` es lo que garantiza «un push al
  día», sin lógica en Node. **La ruta no calcula ningún día**: corre en Vercel en UTC y `todayISO()`
  usa la zona de Node, así que el día lo pone el `default` de la función.
- **`pet_nudges` NO es un registro de entregas.** Una fila = «el claim decidió avisar hoy». Si el
  envío falla después del claim, **no se reintenta ese día**: un aviso de racha a las 23:00 por un
  reintento es peor que ninguno.
- **El cron corre cada hora y la función mira el reloj.** pg_cron programa en UTC; un `0 19 * * *`
  se desplazaría solo con el cambio de hora. `dispatch_pet_nudges()` sale sin hacer nada salvo que
  sean las 20 en Europe/Madrid. Reutiliza los secretos de Vault que ya existen (`app_base_url`,
  `cron_secret`): **no hay secretos nuevos**. En dev no están, así que allí la función avisa con
  `raise warning` y no despacha — es lo esperado, no un fallo.
- **`claim_pet_nudges` vive en `public`, no en `private`**, aunque solo la ejecute `service_role`:
  PostgREST solo expone `public` y `admin.rpc()` no llega a otro esquema. Mismo motivo por el que
  `claim_due_event_reminders` está donde está. `private.pet_lived_activity_days(uuid)` sí queda en
  `private`, porque recibe un `user_id` arbitrario.

**Divergencia de zona horaria, aceptada a sabiendas (hallazgo de la revisión).** El claim agrupa los
días en **Europe/Madrid fijo** — el barrido es un evento del reloj de Madrid, como
`get_widget_snapshot` — mientras que `get_companion_state(p_tz)` agrupa en la zona del servidor de
la app (UTC en prod), por la decisión del 2026-09-02. Una acción entre las 22:00 y las 24:00 UTC
puede caer en días distintos en los dos sitios: la pantalla de la mascota puede mostrarla contenta
mientras sale un `mood_sleepy`, o al revés. **Se acepta para esta fase**: el arreglo de verdad no es
elegir una zona en el claim, sino tomar una decisión de zona horaria para toda la app (issue **#1051**,
zona horaria de la app: Node en UTC frente a SQL en Europe/Madrid). Queda anotado en el comentario de
`private.pet_lived_activity_days` y en §8bis.4 del modelo de datos.

**Detalle de la revisión ya corregido:** el «último día vivido» se calcula con
`max(day) filter (where day <= p_day)`. Sin ese filtro, un `finished_on` futuro (un dedazo en la
fecha) dejaba `last_day` por delante de hoy para siempre y **silenciaba todos los avisos de ese
usuario** sin que nada lo delatara.

**Segunda copia de la regla de historial en SQL.** `private.pet_lived_activity_days` repite lo que
ya está en `splitPassHistory` (TS) y en `get_companion_state()` (SQL): tres copias de «qué cuenta
como actividad vivida». Se asume en esta fase — la alternativa era refactorizar `get_companion_state`
(que tiene `p_tz` y corre con la sesión) en mitad de la fase — y queda como issue de unificación
(**#1049**).

**Estado de despliegue.** `20260906_pet_nudges.sql` **aplicada y verificada en dev el 2026-09-03**
(`1 | true | 1 | 0 | false | true | 1`: columna, RLS, 1 política, 0 INSERT para `authenticated`,
`authenticated` sin execute, `service_role` con execute, job `pet-nudges` presente; más 11 casos
sembrados del claim). **Prod: pendiente**, se aplica tras mergear la rama. A diferencia de las fases
1 y 2, aquí no corre prisa por la preview de Vercel: la migración es aditiva y el único llamador es
un cron que en prod todavía no existe.

**Prod (2026-09-03, tras la revisión final):** migración `20260906_pet_nudges.sql` aplicada en prod
antes del merge de #1054 y verificada con la misma consulta que dev (`1 | true | 1 | 0 | false | true
| 1`, `secrets = 2`, `pet_nudges` vacía). El job `pet-nudges` queda activo desde ese momento; la
ruta existe en prod con el deploy del merge.

## 2026-09-03 — Mascota: PixelLab es la herramienta por defecto para los sprites (#1021)

**Decisión.** Todo el arte pixel de la mascota (y de BiblioPlay) se genera con **PixelLab** vía
MCP, con suscripción Tier 2 (5 000 generaciones/mes). Lo usa el agente `pet-artist`
(`.claude/agents/pet-artist.md`); el pipeline y el brief por pieza están en
`docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`; los scripts de apoyo
(aplanar, trocear, extraer capa, recomponer, hoja de contacto) en `scripts/pet-pixellab/`.

**Por qué.** Prueba del 2026-09-03 con el trial (28 generaciones): img2img sobre la ardilla
procedural aplanada, a fuerza 150, da sprites muy por encima del procedural y respeta composición y
pivotes; trocear ese plano con las máscaras del procedural devuelve piezas del rig que encajan; y
un híbrido (ardilla IA + prenda procedural, fuerza 200) pule las capas de clase sin mover la
ardilla. Lo que no funciona quedó anotado en la spec para no repetirlo (piezas aisladas,
instrucciones a fuerza ≥ 250, diferencia píxel a píxel).

**Consecuencia.** El procedural (`scripts/pet-sprites.mjs`) no muere: es el esqueleto que fija
posición y máscaras y el `init_image` de cada generación. El arte IA sustituye PNG **con los mismos
nombres**; `manifest.test.ts` sigue siendo la red. Cada tanda anota generaciones gastadas.

## 2026-09-03 — Mascota: el rig por partes muere; sprites de personaje PixelLab

**Decisión.** `<PetSprite>` pinta sprite sheets de un personaje PixelLab (3 personajes base por
etapa, 18 estados de clase, 8 rotaciones y 4 animaciones sur cada uno) en vez de componer piezas
con `transform`. El humor es la animación que se reproduce, no una capa de cara. Spec:
`2026-09-03-mascota-sprites-personaje-design.md`.

**Por qué.** La fase 1 eligió rig porque la IA no daba coherencia entre frames y las capas hacían
barata cada animación. Con la suscripción a PixelLab, `create_character` v3 da 8 rotaciones
coherentes por 1-2 generaciones y `create_character_state` la clase en las 8 direcciones sin
capas. Y el producto quiere que la mascota pasee (issue #1057) y pelee (#1015): un rig frontal
no rota.

**Consecuencia.** Se borran piezas, caras, capas de clase y sus scripts. La celda del sheet es la
unidad de dibujo (52 px para un personaje de 40): la compañera crece de 40 a 52 px a 1×. Añadir
una dirección o animación no exige regenerar la base: ids en `scripts/pet-pixellab/characters.json`.

## 2026-09-03 — Mascota: la celda del sheet es 52 o 56 px según el estado

**Hecho.** PixelLab no exporta una celda uniforme de 52×52 como asumía la spec de sprites de
personaje: según el estado exporta 52 **o** 56 px. Datos reales (`src/lib/pet/sheets.gen.ts`,
orden de `PET_CLASSES` — barbarian, fighter, wizard, cleric, bard, ranger): `young`
52/56/56/52/52/52; `adult` 52/56/56/52/56/52; `veteran` las 6 a 56×56. El componente ya lee
`entry.cell` (nunca un literal), así que cada sprite se pinta bien por sí solo.

**Consecuencia.** `class-picker` (y cualquier sitio que muestre dos sprites a la vez, o un cambio
de clase/evolución) mezcla celdas de 52 y 56 px: a 2× eso es 104 px frente a 112 px, ~8 % de
diferencia de tamaño perceptible entre un sprite y otro aunque `scale` sea el mismo.

**Aceptado por ahora, con seguimiento.** No se corrige en esta pasada — issue #1059, con dos
arreglos sugeridos: caja fija `MAX_CELL × scale` con el sprite centrado, o normalizar la celda al
exportar en `fetch-character.mjs`.
