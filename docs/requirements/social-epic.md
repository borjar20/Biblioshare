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
- [ ] **E5.C1** Dominio `src/lib/social/feed.ts` (SD-1, on-read): unir actividad reciente
  de los seguidos aceptados desde las cuatro tablas fuente, normalizar a un tipo
  `FeedEvent` (verbo: terminó / valoró / reseñó / avanzó / marcó episodio / añadió a
  biblioteca), ordenar por fecha, paginar con cursor por `created_at`.
- [ ] **E5.C2** UI: pestaña/ruta de feed (p. ej. el home gana una pestaña "Siguiendo"
  junto al dashboard de estadísticas privado ya existente). Tarjeta por tipo de evento,
  reutilizando portadas y enlaces a ficha; reacciones/comentarios inline (Bloque B).
- [ ] **E5.C3** Filtro por tipo de ítem y por tipo de evento (reutiliza el patrón de
  filtros de 7.12). "Solo reseñas" es una vista natural (feed de reseñas de tu gente).

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
- [ ] **E5.D4** *(futuro, dep §8-D + 7.31)* Entrega push encima de la misma tabla — **no**
  en el alcance del núcleo del epic; documentado como continuación.

### Bloque E — Clubes: creación, membresía y roles  ·  *esfuerzo L*  ·  *dep: A, D*
- [ ] **E5.E1** Migración `clubs` (`slug` único, `name`, `description`, `cover_url`,
  `visibility` enum, `owner_id`, `created_at`) + `club_members` (SD-4, con `role`/`status`)
  + enums `club_role`/`club_member_status`. Helpers `SECURITY DEFINER` `is_club_member`,
  `club_role`, `has_min_club_role`. RLS de `clubs`: la **fila del club** (metadatos de
  descubrimiento) es legible por cualquiera si `visibility=public`, y solo por miembros si
  `private`; **todo el contenido del club es solo-miembros en ambos casos** (SD-4).
- [ ] **E5.E2** Dominio `src/lib/clubs/`: `createClub`, `updateClub`, `joinClub`
  (público→active / privado→pending), `leaveClub`, `approveMember`/`removeMember`,
  `setMemberRole`, `getClub`, `listMyClubs`, `discoverPublicClubs`.
- [ ] **E5.E3** UI: ruta `/club/[slug]` (cabecera, descripción, miembros, botón
  unirse/solicitar/salir), `/clubes` (mis clubes + descubrir públicos), formulario de
  creación/edición (solo owner/mod). Storage de portada reutilizando el bucket de avatares
  (`20260710_avatars_storage.sql`) o uno análogo. i18n `club.*`.
- [ ] **E5.E4** Gestión de miembros: aprobar solicitudes, promover a moderador, expulsar
  (gateado con `has_min_club_role`).

### Bloque F — Feed del club  ·  *esfuerzo M-L*  ·  *dep: E, B, D*
- [ ] **E5.F1** Migración `club_posts(id, club_id, author_id, kind, body, ref jsonb,
  created_at)` — `kind ∈ {text, activity_share, poll?}`; `ref` apunta a un ítem/actividad
  compartida (polimórfico). RLS con `is_club_member()`.
- [ ] **E5.F2** Dominio `src/lib/clubs/posts.ts`: crear post de texto, **compartir una
  actividad propia** al club (envuelve un `diary_entry`/ítem en un post
  `activity_share`), listar el feed paginado, borrar (autor o mod).
- [ ] **E5.F3** UI: feed en `/club/[slug]`, composer (texto + adjuntar ítem de tu
  biblioteca), tarjetas de post con reacciones/comentarios (Bloque B, targets
  `club_post`/`comment`). Notificación a miembros en post nuevo (con preferencia para
  silenciar el club, ver E5.J).

### Bloque G — Actividades de club: motor genérico  ·  *esfuerzo L*  ·  *dep: E, D; base de todos los tipos (SD-8)*
Los tres ejemplos del usuario (lectura conjunta, tierlist, reto por lista) son **tipos**
sobre este motor común — construirlo una vez.
- [ ] **E5.G1** Migración del núcleo `club_activities` + sub-tablas compartidas
  (`club_activity_participants`, `club_activity_items`, `club_activity_opinions`) + enum
  `activity_kind` + enum `activity_status`, según **SD-8**. Helper `SECURITY DEFINER`
  `is_activity_participant(activity_id)`. RLS de todo con `is_club_member()` /
  `is_activity_participant()`.
- [ ] **E5.G2** Dominio `src/lib/clubs/activities/`: `proposeActivity`, `activateActivity`
  (gateado `moderator+`), `finishActivity`, `joinActivity`/`leaveActivity` (participación
  opt-in), `getActivity`, `listClubActivities`. Registro por `kind` (dispatcher) para que
  cada tipo aporte su config/estado sin tocar el núcleo.
- [ ] **E5.G3** UI: sección "Actividades" en `/club/[slug]` (lista con estado y tipo),
  ruta `/club/[slug]/actividad/[id]`, flujo de proponer → (mod) activar, botón unirse a la
  actividad. Composer que elige `kind`. i18n `activity.*`.

### Bloque H — Tipos de actividad  ·  *esfuerzo L-XL*  ·  *dep: G*
Cada tipo se enchufa en el motor de G aportando su config y su UI; se pueden construir de
forma incremental (uno por uno).

**H1 — Lectura/visionado conjunto (`buddy_read`) con hitos + chat por checkpoint** *(ejemplo 1; era 7.20; dep: SD-7, §8-E)*
- [ ] **E5.H1a** Actividad ligada a **un ítem** (`club_activity_items` con una fila) con
  **checkpoints** marcables: migración `club_activity_checkpoints(activity_id, label,
  position jsonb, order)` (ej. `{"page":200}`, `{"season":1,"episode":12}`) +
  `club_activity_checkpoint_reads(checkpoint_id, user_id, reached_at)` — la fila = "ya
  llegué aquí" (marca manual explícita, no inferida, como pidió el usuario; opcionalmente
  se puede autosugerir desde `library_entries.position`).
- [ ] **E5.H1b** **Chat por checkpoint gateado por progreso**: un hilo de discusión por
  checkpoint que **solo ven los participantes que ya lo han alcanzado** — "comentar cosas
  hasta ese punto" sin spoilers de más allá. Implementado con `comments` (SD-3) sobre
  target `activity_checkpoint`, con RLS apoyada en el helper `has_reached_checkpoint()`
  (SD-7). Es el **primer consumidor** de la utilidad spoiler-safe genérica de §8-E.
- [ ] **E5.H1c** UI: lista de checkpoints con estado (alcanzado/bloqueado), botón "Ya
  llegué aquí", y el chat desbloqueándose por checkpoint. *(Realtime en vivo vía Supabase
  Realtime = mejora posterior; MVP recarga el hilo.)*

**H2 — Tierlist (`tierlist`)** *(ejemplo 2)*
- [ ] **E5.H2a** Pool de ítems a ordenar en `club_activity_items`; tiers definidos en
  `config` (`{"tiers":["S","A","B","C","D"]}`). Migración `club_activity_placements(
  activity_id, user_id, item_type, item_id, tier, order)` — la colocación **de cada
  participante**. UNIQUE `(activity_id, user_id, item_type, item_id)`.
- [ ] **E5.H2b** Dominio: guardar/mover una colocación; **tierlist agregada del club**
  (consenso: tier medio de cada ítem entre participantes) calculada al vuelo.
- [ ] **E5.H2c** UI: tablero de tiers con drag & drop (reutiliza `@dnd-kit`, ya en el
  proyecto por 7.22) para la propia; conmutador "mi tierlist / consenso del club".

**H3 — Reto por lista de ítems (`list_challenge`)** *(ejemplo 3)*
- [ ] **E5.H3a** Lista **específica** de ítems en `club_activity_items` (curada por quien
  propone / `moderator+`). Progreso = ¿cada participante ha completado cada ítem? — derivado
  al vuelo de `library_entries`/`diary_entries` (status `completed`), **sin** columna de
  progreso nueva.
- [ ] **E5.H3b** **Avance del club** (cuántos ítems de la lista ha completado el club /
  cada miembro) + **opinión por ítem de cada participante** vía `club_activity_opinions`
  (rating + comentario local a la actividad, ejemplo 3). Distinto de la reseña de diario.
- [ ] **E5.H3c** UI: rejilla lista × participantes (quién lleva qué), barra de avance del
  club, y las opiniones por ítem. Notificación al completar un ítem de la lista.

**H4 — Reto por criterio comparativo (`criteria_challenge`)** *(el "reto comparativo" original; reutiliza `challenges`)*
- [ ] **E5.H4a** Reto con **criterio** (no lista fija): tipo+conteo+filtro, misma forma que
  `challenges` §7.10 pero a nivel de club — guardado en `config`. Progreso **por miembro**
  contando al vuelo `diary_entries` que casan criterio+fechas (reutiliza el motor de
  conteo de `challenges`), produciendo una **clasificación** (leaderboard).
- [ ] **E5.H4b** UI: barra propia + tabla comparativa ordenada (avatar, progreso, %);
  badge al completar; notificación de hitos ("te han adelantado", "reto por terminar").
- [ ] **E5.H4c** *(idea)* Modo **cooperativo** (`config.mode = cooperative`): meta colectiva
  sumada entre miembros ("entre todos, 100 pelis este verano") — mismo tipo, otro `mode`.

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
| `club_activity_placements` | H2 | solo `tierlist` |
| *(reto por lista/criterio)* | H3/H4 | **sin tablas nuevas**: pool en `club_activity_items` + progreso derivado de `library_entries`/`diary_entries` |
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
- **Q8 — Ítems fuera de tu biblioteca en una actividad** — *resuelta (2026-07-11)*: al
  unirte a una actividad de un ítem que **no** tienes en tu biblioteca, se **añade
  automáticamente como `planned`**. Así H1/H3 derivan el progreso de `library_entries`/
  `diary_entries` de forma uniforme para todos los participantes.
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
