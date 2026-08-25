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
