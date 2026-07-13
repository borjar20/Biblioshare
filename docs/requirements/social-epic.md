# EPIC-05 — Social (seguir, clubes, feed y retos comparativos)

> Backlog **independiente** para la capa social de Biblioshare. Autocontenido, pero
> se apoya en decisiones ya tomadas en [REQUIREMENTS.md](../REQUIREMENTS.md): §8-D
> (infra de notificaciones — ya menciona explícitamente *"EPIC-05 (clubs)"*), §8-E
> (utilidad spoiler-safe compartida), §7.35/§8-H (patrón RBAC + `SECURITY DEFINER` en
> RLS), y las ideas semilla 7.15 (seguidores+feed), 7.20 (clubes anti-spoiler) y 7.26
> (listas colaborativas), que este documento **absorbe y desarrolla**.
>
> Última actualización: 2026-07-11. Formato checklist para seguimiento — `[x]` solo
> cuando se implementa y se verifica de verdad (misma disciplina que §7). Los IDs son
> `E5.x` para no colisionar con la numeración §7 del backlog principal.
>
> **Candidatas, no compromisos.** No hay fecha ni orden firme salvo la fase sugerida en §6.

---

## 1. Visión y alcance

Convertir Biblioshare de un tracker personal con perfiles públicos (hoy) en una **red
social ligera alrededor del consumo cultural**: seguir a otras personas, ver su
actividad en un feed, reaccionar y comentar sus reseñas, y agruparse en **clubes**
(públicos o privados) con feed propio, lecturas/visionados conjuntos y **retos donde
comparas tu progreso con el del resto de miembros**.

**Principio rector** (heredado de la "columna vertebral compartida", §3 de REQUIREMENTS):
no reinventar. La actividad social ya está latente en tablas que existen
(`diary_entries`, `progress_sessions`, `episode_watches`, `library_entries`); lo social
es sobre todo **grafo (quién ve a quién) + agregación + interacción (reacción/comentario)**,
no un modelo de contenido nuevo. Reutilizar los patrones ya establecidos: polimorfismo
`item_type`+`item_id`, RLS con helpers `SECURITY DEFINER`, migraciones low-ceremony,
i18n desde el primer componente.

**No objetivos de este epic** (para acotar): mensajería privada 1:1 (DMs), muros de
comentarios tipo red social generalista, algoritmo de recomendación de a quién seguir
(más allá de "descubrir por búsqueda"), y monetización. Se pueden revisitar, pero no
forman parte del alcance planificado aquí.

---

## 2. Qué ya existe (baseline — no re-construir)

- **Reseñas por ítem**: `diary_entries.review` (por pase) y `episode_watches.review`
  (por episodio, §3.5). Agregadas por ficha en `src/lib/community/get-community.ts`
  (media, distribución de estrellas, últimas N reseñas con autor de `profiles`). La RLS
  ya filtra a perfiles públicos + propios, así que **la reseña como contenido ya está**;
  lo que falta encima es interacción social (reaccionar/comentar) y distribución (feed).
- **Perfiles públicos/privados**: `profiles.is_public` gobierna la visibilidad. La RLS de
  contenido de perfil hoy es *"público u propio"* — el grafo social añade un tercer caso
  (*"o soy seguidor aceptado"*), ver **SD-2**.
- **Retos personales**: tabla `challenges` (§7.10, migración `20260710_challenges.sql`) —
  reto con nombre, ventana temporal y criterio, progreso contado al vuelo sobre
  `diary_entries`. Es **individual**; los retos de club (**E5.G**) son la versión
  **comparativa** y reutilizan el mismo motor de conteo.
- **RBAC + patrón RLS sin recursión**: `user_role`, `profiles.role`, helpers
  `SECURITY DEFINER` `current_user_role()` / `has_min_role()` (§7.35). Los clubes
  reutilizan **exactamente este patrón** con un helper `is_club_member()` (**SD-4**).
- **Infra de notificaciones**: **no existe** (§8-D) — pero ver **SD-5**: lo social
  arranca con notificaciones **in-app** (tabla leída al cargar), que **no** dependen de
  push/cron/Capacitor. Push es una mejora posterior, no un bloqueante de este epic.

---

## 3. Decisiones de arquitectura a tomar antes de construir

Igual que §8 de REQUIREMENTS: decisiones de *forma* que, tomadas tarde, cuestan un
refactor. Propuesta razonada; confirmar antes de la primera migración de cada bloque.

### SD-1 — Feed de actividad: *fan-out-on-read*, no tabla materializada
Dos enfoques clásicos: (a) **on-read** — al pintar el feed, consultar la actividad
reciente de la gente que sigues directamente desde las tablas fuente; (b) **on-write** —
mantener una tabla `feed_items` materializada por seguidor, escrita en cada evento.

**Propuesta: (a) on-read para el MVP.** A la escala del proyecto (decenas–cientos de
seguidos) es una query con `IN (lista de seguidos)` sobre `diary_entries` +
`progress_sessions` + `episode_watches` + `library_entries` (altas nuevas), unidas y
ordenadas por fecha — mismo espíritu que `get-community.ts` y coherente con la filosofía
"renumerar en O(N) es más simple" de 7.22. **Cero tablas nuevas** para el feed personal.
- **Camino de escalada documentado**: si el feed on-read se vuelve caro (muchos seguidos
  × mucha actividad), introducir una tabla denormalizada `activity_events`
  (`actor_id`, `verb`, `item_type`, `item_id`, `payload jsonb`, `created_at`) escrita por
  trigger o por la capa de dominio, y virar a on-write. No construirla "por si acaso".
- **Matiz de privacidad**: la query se apoya en la RLS de las tablas fuente, que tras
  **SD-2** ya devuelve "público u propio **o seguidor aceptado**" — el feed no necesita
  lógica de visibilidad propia.

### SD-2 — Grafo de seguidores y el helper `can_view_profile()`
Tabla `follows(follower_id, followee_id, status, created_at)` con
`status ∈ {pending, accepted}`. Seguir a un perfil **público** inserta `accepted`
directo; a un perfil **privado**, inserta `pending` y requiere que el dueño acepte
(patrón "solicitud de seguimiento").
- **Generalizar la visibilidad**: hoy la RLS de contenido de perfil es
  `is_public OR owner`. Con seguidores pasa a `is_public OR owner OR (soy seguidor
  aceptado)`. Para no repetir ese `OR` (con subconsulta a `follows`) en cada política de
  cada tabla de contenido, encapsularlo en un helper **`SECURITY DEFINER`**
  `can_view_profile(target_user_id uuid) returns boolean` — mismo patrón anti-recursión
  que `has_min_role()`. **Todas** las políticas de `SELECT` de contenido de perfil
  (`library_entries`, `diary_entries`, `progress_sessions`, `episode_watches`) migran a
  usar este helper. Es la decisión más transversal del epic: tomarla **antes** de escribir
  cualquier feature de feed.
- **Contadores**: seguidores/seguidos se cuentan al vuelo (`count(*)` sobre `follows`) en
  el MVP; desnormalizar a columnas en `profiles` solo si se vuelve caro.

### SD-3 — Reacciones y comentarios: polimórficos, sin mover las reseñas
Las reseñas seguirán viviendo donde están (`diary_entries.review`,
`episode_watches.review`) — **no** se promueven a una tabla `reviews` propia (evita una
migración de datos dolorosa y mantiene "el diario es la reseña"). La interacción se añade
con **dos tablas polimórficas** (patrón `credits`/`library_entries`):
- `reactions(target_type, target_id, user_id, kind, created_at)` — `target_type ∈
  {diary_entry, episode_watch, club_post, comment}`, `kind` empieza con un único valor
  (`like`) y queda abierto a más. UNIQUE `(target_type, target_id, user_id, kind)`.
- `comments(id, target_type, target_id, author_id, body, created_at)` — hilos planos en el
  MVP (sin anidación; `parent_id` nullable queda reservado por si se quiere después).
- **RLS**: puedes reaccionar/comentar sobre un target que **puedes ver** — la política se
  apoya en `can_view_profile()` (SD-2) para targets de perfil y en `is_club_member()`
  (SD-4) para targets de club. Borras/editas lo tuyo; el dueño del contenido y los mods de
  club pueden borrar (moderación, **E5.J**).

### SD-4 — Clubes: RLS con `is_club_member()` `SECURITY DEFINER` + roles
Réplica del patrón RBAC (§7.35/§8-H) a nivel de club:
- `club_members(club_id, user_id, role, status, joined_at)` con
  `role ∈ {owner, moderator, member}` (enum, orden = jerarquía, como `user_role`) y
  `status ∈ {pending, active}` (para clubes privados con aprobación).
- Helpers **`SECURITY DEFINER`** (bypass de RLS para evitar recursión, como
  `current_user_role`): `is_club_member(club_id)`, `club_role(club_id)`,
  `has_min_club_role(club_id, min)`. Toda la RLS de contenido de club los usa.
- **Visibilidad del club**: `clubs.visibility ∈ {public, private}`. La diferencia
  público/privado gobierna **quién descubre el club y cómo se une** (público = aparece en
  descubrimiento y cualquiera se une directo; privado = solo por invitación/solicitud
  aprobada), **no** quién ve el contenido. **Decidido (2026-07-11): el contenido de todo
  club — feed, retos, lecturas conjuntas, comentarios — es SIEMPRE solo para miembros
  `active`, sea el club público o privado.** Lo único legible por un no-miembro (incl.
  anónimo) de un club público son sus **metadatos de descubrimiento** (nombre, descripción,
  portada, nº de miembros) para poder decidir unirse. Consecuencia de RLS: toda política de
  `SELECT` de contenido de club se apoya en `is_club_member()` sin ramas por `visibility`;
  `visibility` solo condiciona el `SELECT` de la fila de `clubs` y el flujo de `joinClub`.
- **Unirse**: público → `INSERT` propio con `status=active` (RLS lo permite). Privado →
  `INSERT` `status=pending`; un `moderator+` lo pasa a `active` (o hay invitación directa).

### SD-5 — Notificaciones in-app primero, push después (desacoplar de §8-D)
Lo social genera muchos eventos notificables (nuevo seguidor, solicitud de seguimiento,
reacción/comentario a tu reseña, nuevo post en tu club, avance en un reto). **Decisión
clave: no bloquear el epic con push.** MVP = tabla `notifications(user_id, type,
actor_id, target_type, target_id, read_at, created_at)` que se **lee al cargar la app**
(campana con contador de no leídas). Esto **no** necesita `pg_cron`, ni Web Push, ni
Capacitor (7.31) — es puro read. La entrega **push** (§8-D) se conecta encima como
mejora, cuando exista esa infra, reutilizando la misma tabla como fuente. Registrar en
§9 de REQUIREMENTS que EPIC-05 ya **no** depende de 7.31/7.17 para su núcleo.

### SD-6 — Seguridad y moderación desde el diseño, no como parche
Cualquier feature social necesita: **bloquear/silenciar** usuarios
(`user_blocks(blocker_id, blocked_id)`), **reportar** contenido
(`reports(target_type, target_id, reporter_id, reason, status)`), y capacidad de
**moderación** (borrado por dueño de contenido, por mods de club, por admin global del
§7.35). El bloqueo debe cortar visibilidad **en ambos sentidos** — se integra en
`can_view_profile()` (SD-2) para que un bloqueo oculte la actividad mutuamente. Tratarlo
como un bloque de primera clase (**E5.J**), no opcional: es más barato incorporarlo al
modelo de visibilidad desde el principio que retrofitearlo.

### SD-7 — Hitos anti-spoiler = primer consumidor de la utilidad de §8-E
Las **lecturas conjuntas con checkpoints** (actividad `buddy_read`, E5.H1, era 7.20) son
el primer caso real de "ocultar contenido según el progreso del usuario". Cuando se
aborde, construir la utilidad **genérica** spoiler-safe que pide §8-E (helper/componente
reutilizable que compara la posición alcanzada del lector con el checkpoint del hilo), no
lógica ad-hoc — para que 7.21/7.24/7.30 la reutilicen después. El "chat por checkpoint"
del ejemplo del usuario se gatea con un helper `SECURITY DEFINER`
`has_reached_checkpoint(checkpoint_id)` (mismo patrón anti-recursión que el resto).

### SD-8 — "Actividades de club" como columna vertebral enchufable
**La decisión estructural más importante del contenido de club.** Lecturas/visionados
conjuntos, tierlists y retos (por lista o por criterio) parecen features distintas, pero
comparten la misma forma: las propone alguien, tienen un **ciclo de vida**
(propuesta → activa → finalizada), una **participación opt-in**, y una **superficie de
discusión**; solo difieren en su configuración y estado propios de cada tipo. En vez de
una tabla por feature (`club_reads`, `club_challenges`, `tierlists`…), **una sola
`club_activities(kind, config jsonb, status, …)`** + sub-tablas **compartidas** + extensión
por tipo solo donde de verdad hace falta — exactamente el mismo movimiento que unificó el
progreso en `library_entries` (§3) con `position` en JSONB.
- **Núcleo**: `club_activities(id, club_id, kind, title, description, status, config jsonb,
  created_by, starts_on, ends_on, created_at)`. `kind ∈ {buddy_read, tierlist,
  list_challenge, criteria_challenge}` (enum abierto — `poll`, `cooperative_challenge`… se
  añaden como valores nuevos, no como tablas nuevas). `config` guarda lo específico del
  tipo (tiers de la tierlist, criterio+conteo del reto, `mode competitive/cooperative`) —
  no se consulta en SQL, se interpreta en la capa de app, igual que `challenges.criteria`.
- **Ciclo de vida / "proponer"**: cualquier miembro crea una actividad en `proposed`; un
  `moderator+` la pasa a `active` (opción futura: activación por **votación** de miembros,
  reutilizando el tipo `poll`). `finished`/`archived` al cerrar. `status` gobierna qué se
  puede editar y dónde aparece.
- **Sub-tablas compartidas** (una vez, para todos los tipos):
  - `club_activity_participants(activity_id, user_id, joined_at)` — el opt-in ("ser
    partícipe de la actividad"). Gatea el acceso al chat y a comparativas.
  - `club_activity_items(activity_id, item_type, item_id, order)` — el **pool de ítems**
    que referencia una actividad (la lista del reto, los ítems a ordenar en la tierlist; un
    `buddy_read` es un pool de un solo ítem). Polimórfico como `library_entries`.
  - `club_activity_opinions(activity_id, user_id, item_type, item_id, rating, comment,
    created_at)` — opinión **en el contexto de la actividad** por ítem (ejemplo 3). Distinta
    de la reseña de diario: es local a la actividad, no toca `diary_entries`.
- **Extensión por tipo, solo donde hace falta**: `club_activity_checkpoints` +
  `club_activity_checkpoint_reads` (solo `buddy_read`); `club_activity_placements` (solo
  `tierlist`). El resto de tipos se resuelve con las sub-tablas compartidas + `config`.
- **Toda la RLS** de estas tablas se apoya en `is_club_member()`/`is_activity_participant()`
  (SD-4) — nada de contenido de actividad se ve fuera del club (Q3 resuelta).

---

## 4. Backlog por bloques

Cada bloque agrupa tareas cohesionadas. Esfuerzo: **S** < **M** < **L** < **XL**.

### Bloque A — Grafo social: seguir usuarios  ·  *esfuerzo M*  ·  *base de todo el epic*
> **Estado (2026-07-11): completo, dev + prod.** Migraciones
> `20260711_social_follows.sql` + `20260711_profile_identities.sql` aplicadas a **dev y
> prod**; RLS verificada con batería de impersonación (8 casos: extraño/seguidor-aceptado/
> pending sobre privado, anon, invariantes de auto-accept); flujos E2E verificados en
> navegador (seguir público→auto-accept, privado→solicitar→pending, bandeja de
> solicitudes→aceptar). `schema-baseline.sql` y `database.types.ts` actualizados. E5.A5 ya
> cubierto por `/usuarios` (existente antes del epic) — no hace falta ruta nueva.
- [x] **E5.A1** Migración `follows` (SD-2): `follower_id`, `followee_id` (FKs a
  `auth.users`, cascada), `status` (enum `follow_status`), `created_at`. PK/UNIQUE
  `(follower_id, followee_id)`, CHECK `follower_id <> followee_id`. RLS: las dos partes ven
  la relación (incl. pending); las aceptadas de un perfil público, cualquiera. **INSERT
  blindado**: el status debe respetar la regla de auto-accept (nadie se auto-inserta como
  seguidor *aceptado* de un perfil privado) — verificado que la RLS lo rechaza.
- [x] **E5.A2** Helpers `SECURITY DEFINER` `can_view_profile(target)` (owner|público|seguidor
  aceptado) y `profile_is_public(target)`; **recableadas las 4 políticas `SELECT`** de
  `library_entries`, `diary_entries`, `progress_sessions`, `episode_watches` y **también la
  de `profiles`** (para que un seguidor aceptado de un perfil privado lea su perfil). Vista
  `profile_identities` (identidad de cualquier perfil, nunca objetivos/rol) para el stub.
  (Bloqueo de SD-6 se integrará aquí en E5.J.)
- [x] **E5.A3** Dominio `src/lib/social/follows.ts` + `actions.ts`: `followUser` (auto-accept
  público / pending privado, vía RPC `profile_is_public`), `unfollowUser`,
  `acceptFollowRequest`/`rejectFollowRequest`, `getFollowers`/`getFollowing`/
  `getPendingRequests`, `getFollowState`, `getFollowCounts`.
- [x] **E5.A4** UI: `FollowButton` (Seguir/Solicitar seguir/Siguiendo/Solicitado) +
  contadores seguidores/seguidos con listas (`/u/[username]/seguidores|siguiendo`) + bandeja
  de solicitudes (`FollowRequests`/`RequestActions`) + stub de perfil privado
  (`PrivateProfileStub`) en `profile-header.tsx`/`page.tsx`. i18n `social.*`.
- [x] **E5.A5** Descubrimiento: ya cubierto por `/usuarios` + `search-profiles.ts`
  (preexistente al epic). Sin motor de "a quién seguir" (fuera de alcance) — no hace falta
  trabajo adicional.

### Bloque B — Reacciones y comentarios en reseñas  ·  *esfuerzo M*  ·  *dep: A*
> **Estado (2026-07-11): completo, dev + prod.** Migración
> `20260711_review_interactions.sql` (tablas `reactions`/`comments`, enum `target_kind`,
> helper `can_view_target()`) aplicada a **dev y prod**; RLS verificada con batería de
> impersonación (8 casos: extraño/seguidor-aceptado/pending sobre privado, anon,
> insert-spoofing, delete-solo-propio). Flujo E2E completo verificado en navegador con dos
> usuarios reales (like toggle + persistencia, comentar/borrar, ciclo de notificación
> `review_liked`/`review_commented`, deep link `?tab=community` aterrizando en la pestaña
> correcta, vista de solo-lectura para no logueados). `schema-baseline.sql` y
> `database.types.ts` actualizados. Sin edición de comentarios ni borrado por el dueño del
> contenido en este MVP (decisiones explícitas del diseño, ver
> `docs/superpowers/specs/2026-07-11-epic05-bloque-b-reactions-comments-design.md`).
- [x] **E5.B1** Migración `reactions` + `comments` polimórficas (SD-3), con RLS apoyada en
  un nuevo helper `can_view_target()` que delega en `can_view_profile()`.
- [x] **E5.B2** Dominio: `src/lib/social/interactions.ts` (lectura batch,
  `getInteractionSummary`) + `src/lib/social/interaction-actions.ts` (`toggleReaction`
  idempotente sobre el UNIQUE, alta/borrado de comentario). *(Nombres reales difieren del
  boceto original `reactions.ts`/`comments.ts` — unificados en un par lectura/escritura
  porque todo call site necesita ambos tipos de interacción a la vez, decisión tomada en el
  diseño.)*
- [x] **E5.B3** UI: `ReviewInteractions` (fila de "me gusta" + hilo de comentarios
  colapsable) bajo cada reseña en el panel de comunidad de la ficha (`get-community.ts` y
  `get-episode-reviews.ts` ganan los conteos y el estado del viewer) y en las reseñas por
  episodio (§7.36). `item-detail-tabs.tsx` gana un parámetro `?tab=` para deep-linking.
- [x] **E5.B4** Enganche a notificaciones (E5.D): reaccionar/comentar la reseña de otro
  genera notificación al autor (`review_liked`/`review_commented`), con guarda de
  auto-notificación y enlace profundo a la reseña vía `itemHref(...)?tab=community`.

### Bloque C — Feed de actividad personal  ·  *esfuerzo M-L*  ·  *dep: A (y B para interacción)*
> **Estado (2026-07-12): completo, verificado en dev.** Sin migración (SD-1, on-read
> puro sobre las cuatro tablas fuente ya existentes, RLS reutilizada de
> `can_view_profile`/`can_view_target`, cero tabla nueva). `tsc`/`eslint` limpios y cada
> tarea pasó su revisión de código (spec + calidad). La revisión final de rama completa
> encontró dos bugs de integración (los filtros no actualizaban la lista visible; las
> reacciones/comentarios inline no se reflejaban sin recargar — ambos con la misma causa
> raíz en `FeedList`), corregidos en el commit `34f2b9a`. **Verificación manual en
> navegador ejecutada por el usuario** siguiendo
> `docs/superpowers/plans/2026-07-11-epic05-bloque-c-manual-test.md` (checklist que
> sustituyó la verificación automática con subagente/navegador tras decisión explícita del
> usuario de cambiar a testing manual) — confirmado funcional, incluidos ambos bugs
> corregidos. Decisión de implementación: filtros server-side vía query params (no
> cliente-side como sugería el boceto original), para seguir el patrón ya establecido por
> `library-filters.tsx` (7.12).
- [x] **E5.C1** Dominio `src/lib/social/feed.ts` (SD-1, on-read): une actividad reciente de
  los seguidos aceptados desde las cuatro tablas fuente, normaliza a `FeedEvent` (verbo:
  terminó / valoró / reseñó / avanzó / marcó episodio / añadió a biblioteca — "el más
  específico gana": reseñó > valoró > verbo suelo, simétrico en `diary_entries` y
  `episode_watches`), ordena por fecha, pagina con cursor.
- [x] **E5.C2** UI: el home gana una pestaña "Siguiendo" (`HomeTabs`, mismo mecanismo
  `?tab=` que `item-detail-tabs.tsx` de Bloque B) junto al dashboard ya existente —
  fetching condicional por pestaña, no ambos datasets a la vez. `FeedCard` por tipo de
  evento, reutilizando portadas y enlaces a ficha; `ReviewInteractions` de Bloque B inline
  en cualquier evento con origen en `diary_entries`/`episode_watches` (no solo los
  "reseñó" — cualquiera de sus tres verbos tiene un target real). `FeedList` acumula
  páginas vía "Cargar más".
- [x] **E5.C3** Filtro por tipo de ítem y toggle "Solo reseñas" — **server-side vía query
  params** (`FeedFilters`, mismo patrón `<Link>` de `library-filters.tsx`/7.12; decisión
  revisada durante la planificación de implementación, difiere del boceto cliente-side
  original del backlog).

### Bloque D — Notificaciones in-app  ·  *esfuerzo M*  ·  *transversal, dep: A*
> **Estado (2026-07-11): completo, dev + prod.** Migración `20260711_notifications.sql`
> aplicada a **dev y prod**; RLS verificada (destinatario ve/marca las suyas, actor no puede
> spoofear, self-notify bloqueado por CHECK). Ciclo completo de los 3 tipos verificado en
> navegador (`new_follower` al seguir perfil público, `follow_request` al solicitar sobre
> privado, `follow_accepted` al aceptar desde la bandeja) — campana, contador y texto por
> tipo correctos en ambos usuarios. `schema-baseline.sql` y `database.types.ts` actualizados.
- [x] **E5.D1** Migración `notifications` (SD-5): `user_id`, `type`, `actor_id`,
  `target_type`/`target_id`, `read_at`, `created_at`; índices `(user_id, created_at desc)` y
  parcial `(user_id) where read_at is null`. RLS: solo el destinatario ve/marca las suyas.
- [x] **E5.D2** Dominio `src/lib/social/notifications.ts`: `notify(...)` (llamado desde
  `src/lib/social/actions.ts` en follow/accept), `getUnreadCount`, `listNotifications`;
  `notification-actions.ts` con `markAllNotificationsRead`.
- [x] **E5.D3** UI: `NotificationBell` en el header con contador de no leídas y panel con
  enlace al actor. i18n `notifications.*`. *(Enlace profundo al target concreto queda para
  cuando existan targets no-follow en Bloque B/F — hoy las 3 notificaciones apuntan al
  perfil del actor, que ya es el destino correcto.)*
- [x] **E5.D4** *(2026-07-12, dev — Web Push)* Entrega push encima de la misma tabla
  `notifications`, canal Web Push únicamente. Tabla `push_subscriptions` channel-agnóstica
  (`channel` enum + `credentials jsonb`), lista para un futuro canal nativo (`ios_native` vía
  Capacitor/APNs, cuando 7.31 llegue a un estado desplegable) sin rediseño. `notify()` extendido
  con `deliverPush()` best-effort, reutiliza el mismo copy i18n que la campana in-app vía
  `NOTIFICATION_TYPE_KEY` exportado. Opt-in explícito en `/cuenta` (`PushToggle`), nunca prompt
  automático. Service worker (`public/sw.js`) con listeners `push`/`notificationclick`,
  puramente aditivos sobre la cache offline existente. RLS verificada (self-only, sin política
  UPDATE — resuscripción es delete+insert a nivel app). Verificado en dev vía checklist manual
  (`docs/superpowers/plans/2026-07-12-push-notifications-manual-test.md`), per convención
  `docs/TESTING.md`. Migración aplicada a prod; claves VAPID pendientes de configurar en Vercel
  antes de que esto llegue a producción real. Push nativo (APNs) sigue explícitamente fuera de
  alcance.

### Bloque E — Clubes: creación, membresía y roles  ·  *esfuerzo L*  ·  *dep: A, D*
> **Estado (2026-07-12): código completo, migración aplicada a dev + prod; verificación
> manual en navegador pendiente de ejecutar.** Diseño corregido a mitad de implementación: unirse a un club privado es
> **solo por invitación** (sin autoservicio "solicitar unirse") — la fila de un club privado
> es enteramente invisible a no-miembros (SD-4), así que un no-miembro no podría ni comprobar
> que el club existe para solicitar unirse; `club_member_status` se quedó en solo
> `invited`/`active` (sin `pending`), y `approveMember` no existe. Batería de impersonación
> RLS (19 checks) sobre `clubs`/`club_members`, con 6 rondas de fixes reales encontrados
> durante su propia implementación: recursión estructural 42P17 entre políticas de `clubs`/
> `club_members` (resuelto con el helper `club_member_row_exists()`), el gate
> SELECT-antes-de-UPDATE de Postgres bloqueando que un invitado viera/aceptara su propia
> invitación, una escalada de privilegio vía `club_members accept invite` (un invitado podía
> colar `role='owner'` en el mismo UPDATE que acepta), un conflicto BEFORE DELETE/cascade al
> borrar el último miembro de un club, y una regresión de ese mismo fix (el guard
> `pg_trigger_depth() > 1` en `enforce_club_owner_change_authorized()`) que rompía la
> promoción normal de un nuevo owner. Checklist de verificación manual escrito y listo
> (`docs/superpowers/plans/2026-07-12-epic05-bloque-e-clubs-manual-test.md`), per convención
> `docs/TESTING.md`, pendiente de que el usuario lo ejecute en navegador con dos cuentas
> reales antes de dar el bloque por verificado end-to-end. Feed del club (Bloque F)
> explícitamente fuera de alcance de este bloque.
- [x] **E5.E1** Migración `clubs` (`slug` único, `name`, `description`, `cover_url`,
  `visibility` enum, `owner_id`, `created_at`) + `club_members` (SD-4, con `role`/`status`)
  + enums `club_role`/`club_member_status`. Helpers `SECURITY DEFINER` `is_club_member`,
  `club_role`, `has_min_club_role`. RLS de `clubs`: la **fila del club** (metadatos de
  descubrimiento) es legible por cualquiera si `visibility=public`, y solo por miembros si
  `private`; **todo el contenido del club es solo-miembros en ambos casos** (SD-4).
- [x] **E5.E2** Dominio `src/lib/clubs/`: `createClub`, `updateClub`, `joinClub` (solo clubes
  públicos, activo inmediato), `leaveClub` (bloquea al owner con otros miembros activos hasta
  que transfiera), `inviteMember`/`acceptInvite`/`declineInvite` (invitación directa,
  moderator+), `removeMember`, `setMemberRole`/`transferOwnership` (RPCs `SECURITY DEFINER`,
  nunca UPDATE de cliente), `getClub`, `listMyClubs`, `discoverPublicClubs`, `listMembers`,
  `resolveUsername`.
- [x] **E5.E3** UI: ruta `/club/[slug]` (cabecera con portada/descripción, botón según estado
  del viewer: unirse/aceptar-rechazar invitación/salir, edición in-line para moderator+),
  `/clubes` (mis clubes + descubrir públicos + crear in-line). Storage de portada
  reutilizando el bucket de avatares (`20260710_avatars_storage.sql`), helper compartido
  `toSquareWebp` extraído de `avatar-upload.tsx`. i18n `club.*`.
- [x] **E5.E4** Gestión de miembros (`ManageMembers`, moderator+): invitar por username,
  promover/degradar moderador (owner-only), transferir propiedad (owner-only), expulsar
  (gateado con `has_min_club_role`, un moderator no puede expulsar a otro moderator ni al
  owner). Sin "aprobar solicitudes" — no existe ese flujo (ver nota de diseño arriba).

### Bloque F — Feed del club  ·  *esfuerzo M-L*  ·  *dep: E, B, D*
> **Estado (2026-07-13): código completo, migración aplicada a dev + prod; verificación
> manual en navegador pendiente de ejecutar.** `kind` incluye las tres variantes desde el
> inicio (`text`/`activity_share`/`poll`, sin diferir la encuesta pese a la interrogación
> original del backlog). `activity_share` reutiliza el modelo `FeedEvent` unificado de
> Bloque C (no solo reseñas) — el post guarda una **referencia viva**
> (`{sourceTable, rowId}`, mismo vocabulario que `FeedEvent.id`), re-derivada en cada
> lectura vía un resolver de una sola fila (`src/lib/social/shared-activity.ts`), nunca un
> snapshot; si la fila origen se borra, el post muestra un estado "ya no disponible" en vez
> de romperse. Compartir a un club **anula la privacidad de perfil normal para los
> compañeros de ese club** — un nuevo helper angosto, `is_visible_via_club_share()`, se
> añade como un `OR` extra a las políticas `SELECT` ya existentes de `diary_entries`/
> `episode_watches` (Bloque A), sin tocar `can_view_profile()` (deliberado, para no
> arriesgar el helper transversal ya verificado desde Bloque A). Encuestas de elección
> única, con cierre obligatorio revalidado server-side (RPC + RLS, no solo UI), y
> **resultados ocultos hasta que votas** aplicado a nivel de RLS (tu propio voto siempre
> visible; los de los demás solo si ya votaste o la encuesta cerró) — así no se puede
> saltar el ocultamiento consultando la tabla directamente vía PostgREST. **Ampliación de
> alcance decidida en brainstorming, no en el backlog original**: el "me gusta" en
> comentarios pasa a estar disponible en toda la app (reseñas y posts de club), no solo en
> clubes, al reutilizar el mismo `target_kind` polimórfico de Bloque B. `resolveReviewHrefs`
> se renombró/unificó a `resolveTargetHrefs`, plegando el caso especial de `club` (antes
> duplicado en `deliverPush()` y `listNotifications()`) en una sola función compartida.
> Verificación manual en navegador pendiente de ejecutar por el usuario (checklist en
> `docs/superpowers/plans/2026-07-12-epic05-bloque-f-club-feed-manual-test.md`), per
> convención `docs/TESTING.md`. Motor genérico de actividades de club (Bloque G)
> explícitamente fuera de alcance de este bloque.
- [x] **E5.F1** Migración `club_posts(id, club_id, author_id, kind, body, ref jsonb,
  poll_ends_at, created_at)` + `club_poll_options`/`club_poll_votes` — `kind ∈ {text,
  activity_share, poll}`; `ref` apunta a un ítem/actividad compartida (polimórfico). RLS
  con `is_club_member()`/`has_min_club_role()`. `target_kind` (Bloque B) ampliado con
  `club_post`/`comment`; CHECK `comments_no_nesting` hace la anidación de comentarios
  irrepresentable en el esquema (protege la rama recursiva de `can_view_target()`).
- [x] **E5.F2** Dominio `src/lib/clubs/posts.ts`: crear post de texto, **compartir una
  actividad propia** al club (cualquier `FeedEvent` reciente, no solo reseñas), crear
  encuesta, votar, listar el feed paginado, borrar (autor o mod).
- [x] **E5.F3** UI: feed en `/club/[slug]`, composer (texto / compartir actividad / crear
  encuesta), tarjetas de post con reacciones/comentarios (Bloque B, targets
  `club_post`/`comment`, con like en comentarios ahora también en reseñas). Notificación a
  todos los miembros activos en post nuevo (sin preferencia de silenciar-club — E5.J queda
  explícitamente diferido, se acepta el ruido temporal). Paridad completa de notificaciones
  para like/comentario en post de club y like en comentario (4 tipos nuevos de
  `notification_type`).

### Bloque G — Actividades de club: motor genérico  ·  *esfuerzo L*  ·  *dep: E, D; base de todos los tipos (SD-8)*
Los tres ejemplos del usuario (lectura conjunta, tierlist, reto por lista) son **tipos**
sobre este motor común — construirlo una vez.
> **Estado (2026-07-13): código completo, migración aplicada a dev + prod; verificación
> manual en navegador pendiente de ejecutar.** El ciclo de vida completo
> (`proposed → active → finished`, o `proposed`/`active → archived`) se expone ya en este
> bloque en vez de diferirse a Bloque H — mismo orden de construcción por capas ya usado
> para clubes antes del feed de club (Bloque E antes de F). `archiveActivity` generaliza
> "rechazar una propuesta" y "cancelar una activa" en una sola RPC, alcanzable desde
> `proposed` o `active`. Las opiniones (`club_activity_opinions`) son **visibles solo para
> participantes** de la actividad, no basta con ser miembro del club — confirma la lectura
> de **SD-8**, aplicado a nivel de RLS (no solo ocultado en la UI) igual que el patrón de
> resultados-ocultos-hasta-que-votas de Bloque F. `config jsonb` y el comportamiento
> específico por `kind` quedan **explícitamente diferidos a Bloque H** — este bloque no lo
> lee ni lo escribe en ningún punto de su propio código.
- [x] **E5.G1** Migración del núcleo `club_activities` + sub-tablas compartidas
  (`club_activity_participants`, `club_activity_items`, `club_activity_opinions`) + enum
  `activity_kind` + enum `activity_status`, según **SD-8**. Helper `SECURITY DEFINER`
  `is_activity_participant(activity_id)`. RLS de todo con `is_club_member()` /
  `is_activity_participant()`.
- [x] **E5.G2** Dominio `src/lib/clubs/activities/`: `proposeActivity`, `activateActivity`
  (gateado `moderator+`), `finishActivity`, `joinActivity`/`leaveActivity` (participación
  opt-in), `getActivity`, `listClubActivities`. Registro por `kind` (dispatcher) para que
  cada tipo aporte su config/estado sin tocar el núcleo.
- [x] **E5.G3** UI: sección "Actividades" en `/club/[slug]` (lista con estado y tipo),
  ruta `/club/[slug]/actividad/[id]`, flujo de proponer → (mod) activar, botón unirse a la
  actividad. Composer que elige `kind`. i18n `activity.*`.

### Bloque H — Tipos de actividad  ·  *esfuerzo L-XL*  ·  *dep: G*
Cada tipo se enchufa en el motor de G aportando su config y su UI; se pueden construir de
forma incremental (uno por uno).

> **BLOQUE COMPLETO (2026-07-13)**: los cuatro tipos construidos (H1 `buddy_read`, H3
> `list_challenge`, H4 `criteria_challenge`, H2 `tierlist`), en el orden H1 → H3 → H4 → H2.
> El **registro por `kind`** que se construyó en H1 (y que el backlog de G daba por hecho sin
> que existiera) demostró ser la abstracción correcta: al llegar H2, enchufar un tipo nuevo fue
> **un solo fichero** — `activity-detail.tsx` y `activity-composer.tsx` no se tocaron. Fue
> creciendo con lo que cada tipo pedía de verdad: `itemCuration` (H3), `ConfigFields` y
> `usesItemPool` (H4).
>
> **Dos patrones transversales que salieron de aquí y conviene recordar**:
> 1. **"La RPC *es* la política de lectura"** (H3, reutilizado en H4): cualquier tablero
>    comparativo entre participantes **no** puede leerse con el cliente normal — la RLS de
>    `diary_entries`/`library_entries` pasa por `can_view_profile()`, así que un participante con
>    perfil privado sale vacío **sin avisar**. La solución es una función `SECURITY DEFINER` que
>    reimplementa la autorización (`is_activity_participant`), materializando **Q5** en la BD.
>    H2 es el único tipo que **no** lo necesita, por tener tabla propia.
> 2. **Un trigger solo puede rechazar, nunca relajar** (H3): el gate de curación tuvo que ser una
>    reescritura de política RLS, no un trigger — y de paso arregló un bug latente de Bloque G
>    (quien proponía una actividad no podía curar su propio pool hasta que se la activaran).

**H1 — Lectura/visionado conjunto (`buddy_read`) con hitos + chat por checkpoint** *(ejemplo 1; era 7.20; dep: SD-7, §8-E)*
> **Estado (2026-07-13): código completo, migración aplicada a dev + prod; verificación
> manual en navegador pendiente de ejecutar.** Al construir el primer tipo real sobre el
> motor de G se confirmó que el "registro por kind (dispatcher)" que el backlog de G daba
> por hecho (E5.G2) **no existía en el código** — este bloque lo construye de raíz
> (`src/lib/clubs/activities/kinds/`, `ActivityKindDefinition` con `allowedItemTypes`/
> `maxItems`/`DetailExtension`), con `buddy_read` como primera implementación real y stubs
> mínimos para `tierlist`/`list_challenge`/`criteria_challenge` para que H2/H3/H4 se
> enchufen ahí sin tocar el núcleo. Decisiones de diseño cerradas en brainstorming: los
> checkpoints se definen **solo tras activar**, por moderator+ (no por quien propone), y
> son editables mientras la actividad esté `active`; el marcado es **híbrido**
  (`autosugerido` comparando `library_entries.position` del participante contra la
  posición objetivo + **confirmación manual explícita**, revalidada en servidor por la RPC
  `confirm_checkpoint`); confirmar el checkpoint N **autoconfirma** 1..N-1 en cascada;
  `buddy_read` queda restringido a ítems **libro/serie** (nunca película) y a
  **exactamente un ítem** por actividad (trigger `enforce_buddy_read_item_rules` sobre
  `club_activity_items`, sin afectar a otros kinds); la **lista** de checkpoints es visible
  a todo el club (ayuda a decidir si unirse) pero el **chat** de cada uno solo a
  participantes que lo alcanzaron; el progreso individual (`club_activity_checkpoint_reads`)
  es visible **entre todos los participantes** (tablero de grupo) más un indicador agregado
  de **"hito colectivo seguro"** (mínimo del último checkpoint confirmado entre
  participantes, calculado en la capa de app); y **sin notificaciones nuevas** por
  comentario en el chat de checkpoint en este MVP. Batería de impersonación RLS (21 casos:
  visibilidad de checkpoints por rol, escritura moderator+/solo-activa, spoofing de
  `created_by`, escritura directa bloqueada en `checkpoint_reads` fuera de la RPC, cascada
  de confirmación, rechazo por no-alcanzado, tablero de progreso entre participantes,
  gateo de chat por checkpoint individual, y el trigger de restricción de ítems) verificada
  contra dev, todos los casos correctos. `schema-baseline.sql` y `database.types.ts`
  actualizados. Checklist de verificación manual escrito
  (`docs/superpowers/plans/2026-07-13-epic05-bloque-h1-buddy-read-manual-test.md`), per
  convención `docs/TESTING.md`, pendiente de que el usuario lo ejecute en navegador con
  varias cuentas reales antes de dar el bloque por verificado end-to-end. H2/H3/H4
  explícitamente fuera de alcance de este bloque (siguen los stubs del registro).
- [x] **E5.H1a** Actividad ligada a **un ítem** (`club_activity_items` con una fila) con
  **checkpoints** marcables: migración `club_activity_checkpoints(activity_id, label,
  position jsonb, order)` (ej. `{"page":200}`, `{"season":1,"episode":12}`) +
  `club_activity_checkpoint_reads(checkpoint_id, user_id, reached_at)` — la fila = "ya
  llegué aquí" (marca manual explícita, no inferida, como pidió el usuario; opcionalmente
  se puede autosugerir desde `library_entries.position`). *(Implementado el híbrido
  autosugerido+confirmación descrito arriba, ampliando la nota original del backlog.)*
- [x] **E5.H1b** **Chat por checkpoint gateado por progreso**: un hilo de discusión por
  checkpoint que **solo ven los participantes que ya lo han alcanzado** — "comentar cosas
  hasta ese punto" sin spoilers de más allá. Implementado con `comments` (SD-3) sobre
  target `activity_checkpoint`, con RLS apoyada en el helper `has_reached_checkpoint()`
  (SD-7). Es el **primer consumidor** de la utilidad spoiler-safe genérica de §8-E.
- [x] **E5.H1c** UI: lista de checkpoints con estado (alcanzado/bloqueado), botón "Ya
  llegué aquí", y el chat desbloqueándose por checkpoint. *(Realtime en vivo vía Supabase
  Realtime = mejora posterior; MVP recarga el hilo.)*

**H2 — Tierlist (`tierlist`)** *(ejemplo 2)*
> **Estado (2026-07-13): código completo, migración aplicada a dev + prod; verificación manual
> en navegador pendiente de ejecutar.** Cuarto y último tipo: **cierra el Bloque H**.
>
> **Única tabla nueva del Bloque H** (`club_activity_placements`) — y precisamente por eso, el
> **único tipo sin ninguna función `SECURITY DEFINER`**. H3 y H4 la necesitaron porque leían
> `diary_entries`/`library_entries`, cuya RLS pasa por `can_view_profile()` (un participante de
> perfil privado habría salido vacío para sus compañeros). Aquí la colocación vive en tabla
> propia, así que basta acotar su RLS con `is_activity_participant()`: el patrón exacto de
> `club_activity_opinions` (Bloque G).
>
> **Segundo consumidor de `config`** (los tiers viven ahí, tras el criterio de H4), reutilizando
> la RPC `update_activity_config` **sin cambios** — buena validación de que el `ConfigFields` del
> registro era la abstracción correcta. Y **primer tipo con mutaciones** en su capa de dominio:
> H3 y H4 eran de solo lectura porque su progreso es derivado; aquí la colocación *es* el dato.
>
> **El gate de curación se extiende a `tierlist`** (`itemCuration: "curators"`): el pool es el
> enunciado de la tierlist, y si crece a mitad, las tierlists ya hechas quedan incompletas. Eso
> obligó a **reescribir la política RLS kind-scoped** que dejó H3 — de ahí que la batería incluya
> una regresión de H3 (y otra de Q8: unirse a una tierlist sigue sin tocar la biblioteca).
>
> Batería de impersonación RLS (14 casos) verificada contra dev, incluido el caso de riesgo del
> bloque (colar el `user_id` de otro en una colocación → denegado). Advisors: **cero hallazgos**
> (este bloque no añade funciones). `schema-baseline.sql` y `database.types.ts` actualizados.
> Checklist manual en `docs/superpowers/plans/2026-07-13-epic05-bloque-h2-tierlist-manual-test.md`,
> per convención `docs/TESTING.md`, pendiente de ejecutar por el usuario.
- [x] **E5.H2a** Pool de ítems a ordenar en `club_activity_items` (**curado solo por el creador +
  `moderator+`**, como el reto por lista); tiers definidos en `config`
  (`{"tiers":["S","A","B","C","D"]}`), editables al proponer y **congelados al activar**.
  Migración `club_activity_placements(activity_id, user_id, item_type, item_id, tier, position)` —
  la colocación **de cada participante**. La PK compuesta `(activity_id, user_id, item_type,
  item_id)` *es* la unicidad que pedía este punto.
- [x] **E5.H2b** Dominio: guardar/mover/quitar una colocación (`setPlacement`/`clearPlacement`).
  **La tierlist agregada de consenso queda FUERA DE ALCANCE por decisión de diseño**, no
  pendiente: promediar los tiers **aplana justo el desacuerdo**, que es el punto de una tierlist —
  un ítem que unos aman y otros odian acabaría en un tier tibio que no representa a nadie. La
  gracia es que cada cual haga la suya, la comparta y se discuta. Las colocaciones están todas
  guardadas, así que si algún día se echa en falta es un cálculo al vuelo.
- [x] **E5.H2c** UI: tablero de tiers con **drag & drop** (`@dnd-kit`, ya en el proyecto por
  7.22) **y botones de tier** por ítem — estos últimos no son un plan B: en móvil son la vía
  principal (arrastrar entre contenedores compite con el scroll) y el camino accesible por
  teclado. Conmutador **"mi tierlist / la de cada participante"** (no de consenso), con las
  ajenas en solo lectura. Del precedente de la cola se reutilizó el `id` fijo del `DndContext`
  (el contador incremental por defecto rompe la hidratación) y el patrón optimista con rollback.

**H3 — Reto por lista de ítems (`list_challenge`)** *(ejemplo 3)*
> **Estado (2026-07-13): código completo, migración aplicada a dev + prod; verificación
> manual en navegador pendiente de ejecutar.** Segundo tipo real sobre el registro por `kind`
> de H1. **Cero tablas nuevas** (confirma SD-8 y la fila de §5): la lista vive en
> `club_activity_items`, las opiniones por ítem ya estaban completas desde Bloque G
> (`club_activity_opinions` + `ActivityOpinions` — **E5.H3b no necesitó código nuevo**), y el
> progreso es **100% derivado**, sin persistirse. Lo genuinamente nuevo: el tablero de
> progreso, el gate de curación, y por fin **Q8** (ver abajo).
>
> **Decisión que supersede el texto original de E5.H3a**: el progreso NO se deriva del status
> `completed` de `library_entries` sino de un **pase de diario terminado dentro de la ventana
> del reto** (`coalesce(starts_on, created_at)` … `coalesce(ends_on, hoy)` — ambas columnas son
> nullable, de ahí el coalesce). Consecuencia querida por el usuario: quien ya se leyó el libro
> el año pasado **no** obtiene un tick gratis, registra una **relectura** durante el reto; su
> biblioteca nunca se muta (el status sigue `completed`, solo suma un pase más). Es el mismo
> mecanismo que el motor de `challenges` (§7.10), expresado en SQL porque debe correr
> cross-user.
>
> **Hallazgo (bug latente de Bloque G, arreglado aquí)**: la política INSERT de
> `club_activity_items` exigía `is_activity_participant()`, y solo se puede uno unir a una
> actividad ya `active` — es decir, **quien proponía una actividad no podía curar su propia
> lista** hasta que un moderador se la activara y él se uniera. El gate de curación
> (creador + `moderator+`, acotado a `list_challenge`) **sustituye** esa condición en vez de
> añadirse a ella, lo que además arregla el agujero: se cura ya en `proposed`. Por eso es una
> reescritura de política RLS y **no** un trigger (un trigger solo puede rechazar lo que la RLS
> ya dejó pasar, nunca relajar — deliberadamente distinto del idiom de H1).
>
> **Consecuencia de privacidad**: el progreso no se puede leer con el cliente normal — la RLS
> de `diary_entries`/`library_entries` pasa por `can_view_profile()`, así que un participante
> con **perfil privado** sería invisible al resto y su fila del tablero saldría vacía (falso
> negativo silencioso). La RPC `get_list_challenge_progress` es `SECURITY DEFINER` y **es la
> política de lectura del tablero**, materializando en BD la promesa de **Q5**.
>
> Sin notificaciones al completar un ítem (diferido: una lista de 20 ítems × 5 participantes
> serían hasta 100 notificaciones; misma decisión que el chat de checkpoint de H1) — ningún
> valor nuevo en `notification_type`. Batería de impersonación RLS (29 casos) verificada contra
> dev. `schema-baseline.sql` y `database.types.ts` actualizados. Checklist de verificación
> manual en `docs/superpowers/plans/2026-07-13-epic05-bloque-h3-list-challenge-manual-test.md`,
> per convención `docs/TESTING.md`, pendiente de ejecutar por el usuario.
- [x] **E5.H3a** Lista **específica** de ítems en `club_activity_items`, **curada solo por
  quien propone + `moderator+`** (gate en RLS, acotado a `kind='list_challenge'`; el resto de
  kinds mantiene el comportamiento genérico de G). Progreso = ¿cada participante ha completado
  cada ítem? — derivado al vuelo de **`diary_entries` con `finished_on` dentro de la ventana
  del reto** (*no* del status `completed`, ver nota de estado arriba), **sin** columna ni tabla
  de progreso nueva.
- [x] **E5.H3b** **Avance del club** (barra propia + barra del club sobre el total de celdas
  ítems × participantes) + **opinión por ítem de cada participante** vía
  `club_activity_opinions` — *esto último ya estaba completo desde Bloque G, no hizo falta
  código nuevo*.
- [x] **E5.H3c** UI: rejilla lista × participantes (filas = ítems, columnas = participantes;
  scroll horizontal contenido, primera columna sticky), barras de avance, y las opiniones por
  ítem. *(Notificación al completar un ítem: **diferida**, ver nota de estado.)*

**H4 — Reto por criterio comparativo (`criteria_challenge`)** *(el "reto comparativo" original; reutiliza `challenges`)*
> **Estado (2026-07-13): código completo, migración aplicada a dev + prod; verificación
> manual en navegador pendiente de ejecutar.** El "reto comparativo" que dio origen al epic, y
> **primer consumidor real de `config jsonb`** — el campo que SD-8 reservó en Bloque G y que ni
> H1 ni H3 llegaron a tocar. **Cero tablas nuevas** (como H3): el progreso es 100% derivado de
> `diary_entries`.
>
> **Un solo motor de conteo**: `countForChallenge` (§7.10, `src/lib/challenges/match.ts`) se
> reutiliza **sin duplicarse** — un `criteria_challenge` es literalmente un reto personal
> evaluado sobre varias personas, así que se construye un `Challenge` sintético desde `config`
> + la ventana y se llama al matcher ya testeado. Para que eso fuera posible, la RPC
> `get_activity_diary_passes` es **deliberadamente tonta**: solo **lee** los pases crudos de
> los participantes, no cuenta. `loadGenres`/`loadSagaIds` se extrajeron de
> `get-challenge-progress.ts` a `load-catalog-facets.ts` para compartirlos (DRY).
>
> **Privacidad (mismo patrón que H3)**: esa RPC es `SECURITY DEFINER` porque la RLS de
> `diary_entries`/`library_entries` pasa por `can_view_profile()` — sin ella, un participante
> con **perfil privado** saldría en 0 en el leaderboard sin avisar. **La RPC *es* la política
> de lectura del tablero**, materializando Q5.
>
> **El criterio se congela al activar**: editable por creador + `moderator+` solo mientras la
> actividad esté en `proposed`. Como Bloque G **no dejó ninguna política UPDATE de cliente**
> sobre `club_activities` (las transiciones son RPC-only), esto exigió una RPC nueva
> (`update_activity_config`), no un UPDATE gateado por RLS.
>
> **El registro de kinds gana dos extensiones**: `ConfigFields` (campos del criterio en el
> composer — el hueco que SD-8 anticipaba) y `usesItemPool` (H4 no tiene pool, y sin ítems
> tampoco hay opiniones por ítem que mostrar). `list_challenge_window` se renombró a
> `activity_window` (ya no es específica de un kind; H3 la sigue usando). Se construyó además
> un **`SagaPicker` reutilizable**: no existía ningún selector de sagas, y el reto personal
> podrá usarlo cuando quiera exponer el filtro de saga que su motor ya soporta.
>
> Batería de impersonación RLS (13 casos) verificada contra dev, incluida la **regresión de H3**
> tras el renombre. `schema-baseline.sql` y `database.types.ts` actualizados. Checklist manual
> en `docs/superpowers/plans/2026-07-13-epic05-bloque-h4-criteria-challenge-manual-test.md`,
> per convención `docs/TESTING.md`, pendiente de ejecutar por el usuario. **Con H4 cerrado, del
> Bloque H solo queda H2 (tierlist).**
- [x] **E5.H4a** Reto con **criterio** (no lista fija): modo+tipo+meta+género+saga, misma forma
  que `challenges` §7.10 más el modo — guardado en `config`. Progreso **por miembro** contando
  al vuelo los pases de `diary_entries` que casan criterio+ventana (**reutiliza literalmente el
  motor de conteo de `challenges`**, sin duplicarlo), produciendo una **clasificación**
  (leaderboard).
- [x] **E5.H4b** UI: barra propia + tabla comparativa ordenada (posición, nombre, barra, X/N,
  %), con la fila del viewer destacada. *(**Notificaciones diferidas**, y no solo por alcance:
  **"te han adelantado" no tiene un momento en el que dispararse** — el progreso es derivado, se
  recalcula al leer, así que no existe ningún evento de escritura que diga "X superó a Y".
  Implementarlo exigiría persistir un snapshot del ranking o un cron, lo que contradice
  frontalmente el principio de progreso 100% derivado sobre el que se apoyan H3 y H4. Se difiere
  en coherencia con H1 y H3, que también difirieron las suyas. Sin valores nuevos en
  `notification_type`.)*
- [x] **E5.H4c** Modo **cooperativo** (`config.mode = cooperative`): meta colectiva sumada entre
  participantes — una sola barra (`Σ / meta`), sin posiciones ni porcentajes, porque no es un
  ranking. Mismo conteo por participante, distinta agregación.

### Bloque I — Listas colaborativas de club  ·  *esfuerzo M*  ·  *dep: E; absorbe 7.26*
> Una lista colaborativa es esencialmente una actividad ligera sin progreso ni comparación;
> puede modelarse como un `kind` más del motor de G (`list`) reutilizando
> `club_activity_items`, en vez de una tabla aparte. Evaluar esa vía antes de crear
> `club_lists` propias.
- [ ] **E5.I1** Listas editables por varios miembros (ej. "maratón de Halloween del club").
  Requiere el modelo de permisos del club (E5), que 7.26 daba por inexistente — aquí ya lo
  hay. Construir **primero** la versión de un solo dueño (7.4/7.15) si aún no existe, luego
  el salto a colaborativa dentro del club (permisos `member+` para añadir/quitar).

### Bloque J — Seguridad, moderación y privacidad  ·  *esfuerzo M*  ·  *transversal, SD-6*
- [ ] **E5.J1** Migración `user_blocks` + integración en `can_view_profile()` (corte de
  visibilidad bidireccional).
- [ ] **E5.J2** Migración `reports` + cola de revisión en `/admin` (reutiliza RBAC §7.35:
  `admin` gestiona reportes globales; `moderator` de club, los de su club).
- [ ] **E5.J3** Silenciar/abandonar notificaciones por club y por tipo (preferencias del
  usuario) — cierra el bucle con E5.D/E5.F.
- [ ] **E5.J4** Borrado por moderación (autor / mod de club / admin) sobre `club_posts`,
  `comments`, y ocultar reseñas reportadas.

### Bloque K — Ideas extra (candidatas, sin desarrollar)
- [ ] **E5.K1** **Recomendar un ítem a alguien** que sigues ("te recomiendo *X*") — llega
  como notificación; ligero, alto valor social.
- [ ] **E5.K2** **Comparar bibliotecas** entre dos perfiles (solape de ítems, gustos en
  común) — absorbe la idea 7.15 "comparar bibliotecas"; social-lite, buen gancho para
  seguir a alguien.
- [ ] **E5.K3** **Menciones `@usuario`** en reseñas, comentarios y posts de club (genera
  notificación).
- [ ] **E5.K4** **Eventos de club** (discusión programada / fecha límite de la lectura
  conjunta) — se apoya en la infra de recordatorios de §8-D cuando exista.
- [ ] **E5.K5** **Estados de club** ("estamos leyendo *X*", encuestas para elegir la
  próxima lectura) — encuesta como `club_posts.kind = poll`.
- [ ] **E5.K6** **Perfil social enriquecido**: "amigos en común", "también sigue a", badges
  de actividad social. Solo con masa crítica real.
- [ ] **E5.K7** **Feed público del club** embebible / OG image del club (reutiliza el patrón
  de `opengraph-image.tsx` de 7.9) para compartir el club fuera de la app.

---

## 5. Tablas y helpers nuevos (resumen)

| Objeto | Bloque | Notas |
|---|---|---|
| `follows` | A | grafo, `status pending/accepted` |
| `can_view_profile()` (SD-2) | A | `SECURITY DEFINER`, migra las RLS de contenido de perfil |
| `reactions` (polimórfica) | B | `like` inicial, `kind` abierto |
| `comments` (polimórfica) | B | hilos planos, `parent_id` reservado |
| `notifications` | D | in-app; push encima después (§8-D) |
| `clubs` | E | `visibility public/private` |
| `club_members` | E | `role owner/mod/member`, `status pending/active` |
| `is_club_member()` / `club_role()` / `has_min_club_role()` | E | `SECURITY DEFINER`, patrón §7.35 |
| `club_posts` | F | feed; `kind text/activity_share/poll` |
| `club_activities` (+ `_participants`, `_items`, `_opinions`) | G | **motor genérico** (SD-8), `kind` enchufable |
| `is_activity_participant()` / `has_reached_checkpoint()` | G/H | `SECURITY DEFINER`, gatean chat y comparativas |
| `club_activity_checkpoints` / `_checkpoint_reads` | H1 | solo `buddy_read`; chat anti-spoiler §8-E/SD-7 |
| `club_activity_placements` | H2 | solo `tierlist`. **Única tabla nueva del Bloque H**, y por eso el único tipo **sin `SECURITY DEFINER`**: al no leer contenido de perfil, le basta una RLS acotada con `is_activity_participant()` (participante ve todas, cada cual escribe la suya) |
| *(reto por lista/criterio)* | H3/H4 | **sin tablas nuevas** (confirmado en H3): pool en `club_activity_items` + progreso derivado de **`diary_entries` dentro de la ventana del reto** (no del status de `library_entries`) |
| `autoadd_library_on_activity_join` / `_item` (Q8) | H3 | triggers `SECURITY DEFINER`: auto-añaden los ítems del pool a la biblioteca como `planned`, nunca pisan una fila existente; no actúan en `tierlist` |
| `activity_window()` / `get_list_challenge_progress()` | H3 | ventana `coalesce` (renombrada en H4: ya no es específica de un kind); la RPC de progreso es `SECURITY DEFINER` y **es** la política de lectura del tablero (perfiles privados visibles a sus compañeros de actividad, Q5) |
| `get_activity_diary_passes()` / `update_activity_config()` | H4 | la primera **solo lee** (los pases crudos de los participantes) para que el conteo se quede en `countForChallenge`, y es `SECURITY DEFINER` por el mismo motivo de privacidad; la segunda escribe `config` (creador o `moderator+`, solo en `proposed` — el criterio se congela al activar), y es RPC porque G no dejó política UPDATE de cliente sobre `club_activities` |
| `user_blocks` / `reports` | J | seguridad/moderación |

---

## 6. Fase sugerida (orden de ejecución)

No vinculante. Optimiza dependencias y entrega valor pronto sin bloquear en push/Capacitor.

1. **Fase 1 — Grafo + interacción** (Bloques A, B, D-in-app): seguir usuarios, reacciones y
   comentarios en reseñas, notificaciones in-app. Es la base transversal; valor inmediato
   sin nada de clubes. **SD-2 (can_view_profile) es el primer paso crítico.**
2. **Fase 2 — Feed personal** (Bloque C): con A ya construido, es sobre todo agregación.
3. **Fase 3 — Clubes núcleo** (Bloques E, F): CRUD de club, membresía, roles, feed de club.
4. **Fase 4 — Actividades de club** (Bloques G, H): primero el **motor genérico** (G, SD-8),
   luego los tipos (H) de forma incremental. Orden sugerido dentro de H por valor/coste:
   **H4** reto por criterio (barato, reutiliza `challenges`) → **H3** reto por lista →
   **H1** lectura conjunta con chat anti-spoiler (el más rico) → **H2** tierlist.
5. **Fase 5 — Profundidad** (Bloques I, K a demanda): listas colaborativas (posible `kind`
   del motor de G) y extras.
6. **Transversal continuo — Seguridad/moderación** (Bloque J): E5.J1 (bloqueo) debe entrar
   **con la Fase 1** (integra en `can_view_profile`); el resto acompaña a cada fase.

---

## 7. Preguntas abiertas / riesgos

- **Q1 — Solicitud de seguimiento en perfiles privados** — *resuelta (2026-07-11)*:
  **sí, con aprobación, modelo Instagram**. Un perfil privado es alcanzable como **stub de
  identidad** (username, display_name, avatar, bio) con botón "Solicitar seguir"; su
  **contenido** (biblioteca, diario, stats) queda oculto hasta aceptar. Solo se expone
  identidad — **nunca** objetivos (goals) ni rol. Implementado con la vista
  `profile_identities` (bypassa la RLS de `profiles`, solo columnas de identidad), sin
  cambiar la RLS de la fila completa ni reubicar los goals.
- **Q2 — Feed on-read vs. escala**: validar el coste real de la query de feed con datos de
  volumen antes de descartar `activity_events` (SD-1). Riesgo bajo a la escala actual.
- **Q3 — Visibilidad del contenido de un club público** — *resuelta (2026-07-11)*:
  **solo miembros**. El contenido de todo club (feed, retos, lecturas, comentarios) es
  siempre solo para miembros `active`; `visibility` solo cambia el descubrimiento y el modo
  de unirse, no el acceso al contenido. Ver SD-4.
- **Q4 — Participación en actividades** — *resuelta (2026-07-11)*: **opt-in explícito**. El
  usuario se une a la actividad él mismo (`club_activity_participants`, SD-8); no participa
  automáticamente por ser miembro del club. Necesario para el chat por checkpoint y las
  comparativas.
- **Q5 — Comparar progreso sin filtrar privacidad** — *resuelta (2026-07-11)*: al unirse a
  una actividad **salta un aviso** de que tu progreso se compartirá con los participantes;
  aceptar y unirse = consentir compartir ese progreso dentro de la actividad, aunque tu
  perfil sea privado fuera. El aviso es requisito de UX al construir el flujo de unirse.
- **Q7 — "Chat" del checkpoint: hilo o tiempo real** — *resuelta (2026-07-11)*: **hilo de
  comentarios estilo Reddit**, no chat en vivo. Se modela con `comments` (SD-3) gateado por
  progreso; Realtime queda descartado para este alcance (no es el objetivo).
- **Q8 — Ítems fuera de tu biblioteca en una actividad** — *resuelta (2026-07-11),
  **implementada (2026-07-13, Bloque H3)***: al unirte a una actividad, los ítems de su pool
  que **no** tengas en tu biblioteca se **añaden automáticamente como `planned`**; y si el pool
  crece después (un curador añade un ítem a mitad de reto), se hace **backfill** a los
  participantes que ya estaban. Implementado con dos triggers `SECURITY DEFINER`
  (`autoadd_library_on_activity_join` / `autoadd_library_on_activity_item`, migración
  `20260713_list_challenge.sql`) y no en la capa de app, porque el backfill escribe filas de
  `library_entries` **de otros usuarios** y su RLS es self-only. **Invariante:
  `on conflict (user_id, item_type, item_id) do nothing`** — si ya tienes el ítem en cualquier
  estado (incluido `completed`, con su valoración) la fila queda **intacta**; es un
  *insert-if-missing* puro, garantizado por el UNIQUE, no por lógica de app. Salir de una
  actividad **no borra nada** (no destructivo). **`tierlist` queda excluida** (decisión del
  usuario, 2026-07-13): ordenar ítems que ya conoces no es una lista de pendientes y no debe
  ensuciar la biblioteca.
- **Q6 — Moderación mínima viable**: ¿basta con borrado por dueño/mod/admin + bloqueo para
  el lanzamiento, dejando la cola de `reports` para después? Propuesta: sí, pero con el
  esquema de `reports` ya migrado para no retrofitear.

---

## 8. Enganches a registrar en REQUIREMENTS.md cuando arranque el epic

- **§8-D**: anotar que el **núcleo** de EPIC-05 usa notificaciones in-app y **no** depende
  de 7.31 (Capacitor) ni de la infra push; push queda como continuación (E5.D4).
- **§8-E**: E5.H1b (chat por checkpoint de la lectura conjunta) es el **primer consumidor**
  de la utilidad spoiler-safe; construirla genérica ahí.
- **§9 (tabla de decisiones)**: registrar SD-1 (feed on-read), SD-2 (`can_view_profile`
  generaliza la visibilidad de perfil), SD-4 (`is_club_member` replica el patrón RBAC),
  SD-5 (in-app antes que push) y **SD-8 (actividades de club como columna vertebral
  enchufable: un `club_activities` con `kind`, no una tabla por feature)** en cuanto se
  tomen de verdad.
- **backlog-pending.md**: marcar 7.15 (seguidores+feed), 7.20 (clubes anti-spoiler) y 7.26
  (listas colaborativas) como **absorbidas por EPIC-05**, con puntero a este documento.
