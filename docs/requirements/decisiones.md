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
