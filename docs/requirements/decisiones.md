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
