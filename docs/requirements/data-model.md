# Modelo de datos

> **[Canónico · verificado contra prod el 2026-07-21; delta de eventos de club verificado el 2026-07-22; itinerarios de sagas (§7.2) verificados en dev y prod el 2026-07-22; rol narrativo de sagas (§7.3) verificado en dev y prod el 2026-07-23; colocación/opcionalidad de sagas (§7.4) verificada en dev y **en prod** el 2026-07-26; editor único de secuencia, fase 2a (§7.5) verificado en prod el 2026-07-26; ventanas de colocación, fase 2b (§7.6) — **corregido aquí, 2026-07-27**: esta cabecera llevaba "solo en dev, prod pendiente", y ya no es cierto — reverificado hoy contra `pg_proc`/`to_regclass` de PROD: `saga_placement_windows` existe y `save_saga_sequence` tiene una única firma (la de cinco argumentos), coherente con el ANEXO 2026-07-27 de `schema-baseline.sql` —; metadatos del tándem, fase 2 del timeline (§7.8), aplicados en dev **y en prod** el 2026-07-28 — incluida la retirada del envoltorio de seis argumentos: `pg_proc` devuelve UNA sola firma en los dos entornos—; motivo de la ventana, fase 3 del timeline (§7.9), aplicado en dev **y en prod** el 2026-07-28; **opcionales saltables, fase 4 del timeline (§7.10), aplicadas en dev **y en prod** el 2026-07-28 — verificadas contra `to_regclass`, `pg_policies` y `information_schema.columns`; ningún RPC cambió y `progress.ts` no se tocó**; **roles, fase 5 del timeline (§7.3), aplicados en dev **y en prod** el 2026-07-28 — las dos migraciones, la segunda DESPUÉS del despliegue a propósito (#237, cerrada); verificado contra `pg_enum`/`pg_attribute`: seis valores, sin `paralela`, sin tipo huérfano y con las 8 filas con rol intactas; ningún RPC cambió y `progress.ts` tampoco** —sin backfill: las 4 ventanas de prod siguen con `motivo IS NULL`, y `save_saga_sequence` NO cambió de firma—; fase 3 del orden unificado —mapa derivado, migración de grafos a itinerarios y retirada de
`saga_nodes`/`saga_edges`/`save_saga_graph` (§7.7)— **corregido aquí, 2026-07-27**: esta cabecera
llevaba "solo en dev, prod pendiente" para las dos primeras migraciones y daba el `DROP` por no
escrito; ya no es cierto — las tres migraciones de la fase están aplicadas y verificadas en dev y en
prod el 2026-07-27, fase cerrada, contra los objetos reales (`pg_type`, `pg_constraint`,
`pg_policies`, `pg_proc`, `to_regclass`), nunca contra `list_migrations`; **fase 4 del orden
unificado —`saga_routes.is_reading_order` (§7.2) y el borrado explícito de ventanas por lista de
sujetos (§7.6)— verificada en dev y **en prod** el 2026-07-28 contra `information_schema.columns`,
`pg_indexes` y `pg_proc`: en los dos entornos existen la columna (`boolean NO false`) y su unique
parcial `saga_routes_reading_order_key` (`(saga_id) WHERE is_reading_order`). El «sin backfill» se
comprobó en el DATO, no solo en el DDL: al migrar, prod tenía 3 itinerarios y **0 con
`is_reading_order`**, y sus 2 ventanas seguían diciendo exactamente lo mismo que antes.
**Fase 4 CERRADA el 2026-07-28**: retirada también la sobrecarga de cinco argumentos
(`20260731_drop_save_saga_sequence_v5.sql`), aplicada DESPUÉS de confirmar que el bundle nuevo
servía en producción; `pg_proc` devuelve **una sola** firma de `save_saga_sequence`, la de seis
argumentos, en dev y en prod; **tanda de seguridad del 2026-07-29 (issues #130, #176, #133)
aplicada y verificada en dev Y EN PROD** — cuatro migraciones (`20260808`…`20260811`), ninguna
toca datos: 55/55 funciones `SECURITY DEFINER` con `pg_temp` en el `search_path` en esa tanda (§8; **desactualizado, ver el detalle en §8: a 2026-08-13 son 69 funciones, 62 con `pg_temp`**),
`save_saga_route` validando el subárbol en servidor (§7.2) y las RPCs de evento con longitudes,
defaults y errores snake_case (§6). Medido contra `pg_proc` en los dos entornos, no contra
`list_migrations`: mismo digest normalizado de las cinco funciones tocadas y cero ACL con
`anon`; `target_kind` ampliado con `pass`/`progress_session` para el feed agrupado de Inicio
(§5), aplicado y verificado en dev y en prod el 2026-07-29 (migraciones
`20260812_feed_targets_enum.sql` y `20260813_feed_targets_can_view.sql`); **lectura pública
de `notes` para el feed de tarjetas por tipo (§3) — corregido aquí, 2026-07-30**: la política
aditiva `"public notes select"` (`is_public = true and public.can_view_profile(user_id)`,
migración `20260814_notes_public_select.sql`) está aplicada y verificada **SOLO EN DEV**;
prod queda pendiente del merge de `feat/feed-tarjetas-por-tipo`; **normalización de géneros
del catálogo (§2), 2026-07-30**: índices GIN `{books,movies,series}_genres_gin`
(`20260815_genres_gin_indexes.sql`) y backfill de `movies`/`series` a labels canónicas
aplicados y verificados **en DEV y en PROD** el 2026-07-30 (GIN 3/3 contra `pg_indexes`;
backfill prod: movies `Suspense`→`Thriller`, series `Action & Adventure`/`Sci-Fi & Fantasy`
divididos con dedupe+cap5; filas solo-ruido `Kids`/`Reality`/`Talk` conservadas — issue #311);
`books` no necesita backfill (las labels ya coincidían); **Social fase 1 — corregido aquí,
2026-08-02**: esta cabecera llevaba «fix del writer canónico y migración de CONTRATO SOLO EN
DEV» y «PRODUCCIÓN NO TIENE `interaction_targets` EN ABSOLUTO», y ya no es cierto — **la fase 1
ENTERA está aplicada y verificada en DEV y en PROD** (`vmutcradmodhiltuohys`) el 2026-08-02: las
siete migraciones de la cadena expansiva (`20260730212803` → `20260730213248` → `20260730214405`
→ `20260730214621` → `20260801115944` → `20260801135656` → `20260802013421`) y, DESPUÉS de que
el bundle canónico estuviera vivo, la de contrato
(`20260801224621_social_interaction_targets_contract.sql`). Verificado contra los objetos reales
—`pg_class`, `pg_proc`, `pg_constraint`, `information_schema.columns`—, nunca contra
`list_migrations`: `interaction_target_id` es `NOT NULL` en `comments` y `reactions`, el par
heredado `target_type`/`target_id` ya NO es columna de ninguna de las dos, `notifications`
conserva sus tres columnas nullable, la unicidad de reacción es `(interaction_target_id,
user_id, kind)` y `comments_no_nesting` ha desaparecido. Cero pérdida de datos en todo el
recorrido: 8 comentarios, 13 reacciones, 6 avisos y 647 targets, iguales paso a paso.
`schema-baseline.sql` **ya no está sin anexar**: lleva el «ANEXO 2026-08-02» con las ocho
migraciones en el orden en que las recibió producción; **grants de lectura anónima a los helpers de
bloqueo (EXECUTE en `users_are_blocked`/`filter_unblocked_user_ids` + SELECT en `user_blocks` para
`anon`) aplicados y verificados en dev y prod el 2026-08-02** (migración `grant_anon_read_block_helpers`;
ver «Social fase 0»); **sincronización documental de sagas (#183) el 2026-08-06**: corregidas dos contradicciones del backlog (itinerarios «solo en dev» y `queues` «sigue en pie», ambas en prod desde julio-2026), recontadas migraciones (155 ficheros) y tablas públicas (53, todas con RLS, verificado contra `pg_tables` de prod), y documentadas `saga_route_entries.note` y la tabla de columnas de `saga_items` (10); sin cambio de esquema; **Fase 2 de «Pensamiento» (§6.2), 2026-08-06 — SOLO EN DEV**: tabla `thoughts` (ancla polimórfica `book|movie|series|saga|person` sin FK, contenido autoral personal) + clase `thought` de `interaction_targets` con su trigger resolutor y dos valores nuevos de `notification_type` (`thought_commented`/`thought_liked`); verificado en dev contra objetos reales (`to_regclass`, `enum_range`, DRIFT-CHECK superficie 6 de grants por columna, advisors de seguridad sin hallazgos nuevos) — migraciones `20260834_thoughts_enum_values.sql` y `20260835_thoughts.sql`, 158 ficheros en el repo tras las dos; prod pendiente de una fase de despliegue posterior; **Fases 3-6 de «Pensamiento» (§6.2), 2026-08-07 — feed 6ª fuente, compositor, tarjeta/hilo con markdown-lite y e2e (`e2e/thoughts.spec.ts`, escrito y committeado, no ejecutable en este worktree por falta de `.env.local`/credenciales) — feature completa de extremo a extremo en dev; **migración aplicada y verificada en PROD el 2026-08-07** (`to_regclass`, `enum_range` con los 5 valores de ancla, `'thought'` en `target_kind`, `thought_commented`/`thought_liked` en `notification_type`, 3 triggers, 4 policies con RLS, grants por columna 5-INSERT/2-UPDATE idénticos a dev, `get_advisors` sin hallazgos nuevos sobre `thoughts`); el código se despliega al mergear el PR**; **los avisos de seguimiento nacen del post, no del hecho (§5.3), 2026-08-13**: `notification_type` gana `followed_started`/`followed_dropped`/`followed_thought` y `follows.notify_events` cambia de dominio a `milestone|progress|thought`; verificado en dev contra `enum_range` y `follows` reales el 2026-08-13; **las dos migraciones aplicadas y verificadas en PROD el 2026-08-13**: `20260856` (el enum, aditiva pura, verificada contra `pg_enum`) por delante, y `20260857` (la de datos) **después de desplegar el código** (merge de #629 y deploy de producción en verde) — 8 filas a `{milestone,progress,thought}`, 4 vacías intactas, cero filas con vocabulario viejo; el orden importa y está razonado en §5.3; **motivo de abandono (§3), 2026-08-14 — corregido aquí el mismo día: aplicado y verificado en DEV y en PROD**, no solo dev — `passes.dropped_reason`/`dropped_reason_note`, enmascarados por dueño en `pass_reviews`, sin `grant select` en la tabla, verificado contra `information_schema.column_privileges` de prod antes de mergear el código (la migración va delante del despliegue, no detrás, para no vaciar el diario de nadie)]**

> Parte de [Requisitos y alcance](../REQUIREMENTS.md). Sección §3.
> **Este es el documento canónico del esquema.** Verificado contra producción el
> **2026-07-30** para el delta de Social fase 0 (el resto conserva sus fechas de
> verificación específicas): 47 tablas públicas, todas con RLS activa.
> **Delta del 2026-07-30 (feed de tarjetas por tipo, §3): la política `"public notes
> select"` de `notes` está verificada solo en DEV**, contra `pg_policies` — prod queda
> pendiente del merge de `feat/feed-tarjetas-por-tipo`.
> **Delta del 2026-07-30 (normalización de géneros, §2): vocabulario canónico, índices
> GIN y backfill aplicados y verificados en DEV **y en PROD** el 2026-07-30 (PR #312).
> **Delta del 2026-07-30 (menciones `@usuario`, E5.K3, §9): valor `mentioned` del enum
> `notification_type` aplicado y verificado en DEV **y en PROD** contra `pg_enum` (sin
> tabla nueva — el texto crudo con `@usuario` es la fuente de verdad, ver
> `decisiones.md`). Al entrar esta mejora, las políticas RLS de `notifications` aún incluían
> `insert as actor` y no referenciaban `type`, por lo que `mentioned` quedó cubierto sin
> cambio específico. **Social fase 0 supersede esa puerta en dev y prod**: ya no existe ninguna
> política INSERT y `anon`/`authenticated` no tienen privilegio de inserción; el writer de
> servidor usa `service_role`. Spec:
> `docs/superpowers/specs/2026-07-30-menciones-usuario-design.md`.
> **Delta del 2026-07-30 (Social fase 0, §5/§8/§9): aplicado y verificado en DEV y PROD.**
> `user_blocks` y `content_reports` dejan ambos entornos con 47 tablas públicas, todas con RLS.
> Son siete migraciones:
> `20260730190602_social_phase0_integrity.sql`,
> `20260730190801_social_phase0_notification_compat.sql`,
> `20260730191652_social_phase0_user_blocks.sql`,
> `20260730191702_social_phase0_moderation_reports.sql`,
> `20260730191708_social_phase0_polymorphic_cleanup.sql`,
> `20260730194407_social_phase0_close_notification_inserts.sql` y
> `20260730200000_social_phase0_report_reviewer_index.sql`. Pasaron la matriz transaccional
> `supabase/tests/social_phase0_rls.sql` en prod dentro de una transacción con rollback; el
> barrido dejó 0 comentarios, 0 reacciones y 0 notificaciones huérfanos. En ambos entornos,
> INSERT sobre `notifications` queda permitido solo a
> `service_role` (`anon=false`, `authenticated=false`, 0 políticas INSERT); las cuatro RPC
> públicas nuevas son `SECURITY INVOKER`. En prod hay 66 avisos de seguridad, sin hallazgos
> atribuibles a las tablas o RPC de esta fase. El rollout aplicó integridad+compatibilidad de
> forma atómica, desplegó el bundle `8589601` y solo entonces cerró el INSERT heredado y añadió
> el índice de reviewer; [#332](https://github.com/borjar20/Biblioshare/issues/332) conserva la
> evidencia operativa.
> **Delta del 2026-08-01 (Social fase 1, §5/§8/§9): aplicado y verificado en DEV, y desde el
> 2026-08-02 también en PROD (ver el corte de producción más abajo).**
> `interaction_targets` eleva dev a 48 tablas públicas, todas con RLS; la corrección
> `20260801115944_social_interaction_targets_checkpoint_owner_fix.sql` deriva el owner de
> `activity_checkpoint` desde `club_activity_checkpoints.created_by`, repara el registro ya
> materializado y añade el índice `interaction_targets_owner_id_idx`. La matriz transaccional
> `supabase/tests/social_phase1_interaction_targets.sql` pasó completa y los advisors de seguridad
> siguen en 66, sin findings nuevos.
> **Fix del 2026-08-01 (writer canónico de notificaciones): aplicado y verificado en DEV, y en
> PROD el 2026-08-02 dentro de la cadena expansiva.**
> `20260801135656_social_interaction_targets_notification_writer_fix.sql` conserva en INSERT el
> `interaction_target_id` enviado sin par legacy por el writer confiable (`service_role`); si el
> INSERT incluye `(target_type, target_id)`, ese par sigue siendo la autoridad. En UPDATE el trigger
> nunca acepta metadatos canónicos aislados del cliente: vuelve a derivar desde el par completo o
> limpia el ID si falta alguna parte. La matriz SQL pasó completa; advisors de seguridad 66→66 y de
> rendimiento 53→53, sin delta.
> **Delta del 2026-08-01 (Social fase 1, migración de CONTRATO, §5): aplicado y verificado en DEV
> el 2026-08-01 y en PROD el 2026-08-02, la última de las ocho.**
> `20260801224621_social_interaction_targets_contract.sql` cierra el ciclo
> expand/migrate/contract: `interaction_target_id` pasa a `NOT NULL` en `comments` y
> `reactions`, la unicidad de reacción se apoya en él, desaparecen de esas dos tablas el par
> heredado `(target_type, target_id)`, sus triggers de resolución, sus índices y el CHECK
> `comments_no_nesting`, y cinco funciones `SECURITY DEFINER` pasan a resolver el padre de un
> comentario por el registro canónico. `notifications` conserva intacto su par heredado
> nullable y su trigger resolutor. La matriz `supabase/tests/social_phase1_interaction_targets.sql`
> pasó completa (`ALL ASSERTIONS PASSED`) y los advisors siguen en 66 de seguridad, sin
> hallazgos nuevos.
> **Corte de producción del 2026-08-02: la fase 1 ENTERA está aplicada y verificada en PROD.**
> Ocho migraciones contra `vmutcradmodhiltuohys`, verificadas contra objetos reales —`pg_class`,
> `pg_proc`, `pg_constraint`, `information_schema.columns`—, nunca contra `list_migrations`: el
> ledger de prod ya venía sin la fila de `social_phase0_notification_compat` pese a tener su
> efecto (`comments_body_canonical`), que es justo la trampa que advierte `AGENTS.md`. Primero la
> cadena EXPANSIVA de siete (`20260730212803` … `20260802013421`, esta última el fix de la
> audiencia de checkpoint): el backfill no borró NADA — las 21 filas de comentarios/reacciones
> tenían fuente viva y los conteos salieron idénticos (8 comentarios, 13 reacciones, 6 avisos),
> con 647 targets y cero `interaction_target_id` nulos. Después el merge del bundle canónico
> (`a4dcc0b` en `main`, despliegue de producción de Vercel correcto, el sitio responde 200) y
> **solo entonces** la migración de CONTRATO
> (`20260801224621_social_interaction_targets_contract.sql`), que borra columnas que el bundle
> anterior todavía leía. Los conteos siguieron idénticos tras ella. Prod y dev quedan en 48 tablas
> públicas, todas con RLS, y sin advisors nuevos en ninguno de los dos entornos.
> **Ojo al orden, que difiere entre entornos**: en dev el contrato se aplicó ANTES que el fix de
> la audiencia de checkpoint; en prod el fix viajó con la cadena expansiva y el contrato entró
> después. Se verificó tras aplicarlo que el contrato NO revierte el fix —
> `private.can_view_interaction_target` sigue delegando en
> `can_view_target('activity_checkpoint', …)`. El baseline replica el orden de PROD, que es el que
> reproduce producción desde cero.
> El orden de despliegue fue expansiva → backfill → bundle → contrato. `schema-baseline.sql`
> **ya está anexado** («ANEXO 2026-08-02»), en la misma pasada en que se cerró el ciclo en prod.
> Donde otro doc lo contradiga, manda este — y varios docs antiguos aún dicen
> `diary_entries`, que **ya no existe** (ver §0).
>
> **Delta del 2026-08-03 (issue #361): `passes.planned_on date` añadida y verificada en DEV y
> en PROD** (`information_schema.columns` → `date`, nullable). Migración
> `20260817_passes_planned_on.sql`. Es forward-only (la fija `planTransition` al entrar en
> `planned`); el historial importado se queda en `NULL`. Ningún RPC cambió; sin backfill. Ver §3.
>
> **Delta del 2026-08-03 (bis): la columna anterior salió SIN su grant y rompió «Seguir» en
> producción.** `passes` tiene grants **por columna**, y Postgres exige privilegio sobre toda
> columna nombrada en el INSERT/UPDATE aunque su valor sea `NULL`: al desplegar #366, el insert de
> `applyTransition` (que siempre nombra `planned_on`) empezó a dar `42501 permission denied for
> table passes` y toda alta de pase caía en el error boundary. Migración
> `20260819_grant_passes_planned_on.sql`, **aplicada y verificada en DEV y en PROD el 2026-08-03**
> (`information_schema.column_privileges` → `anon: SELECT`; `authenticated: INSERT, SELECT,
> UPDATE`, idéntico a `started_on`). Se le dieron los tres privilegios de sus hermanas, no solo
> los dos rotos, para que el SELECT no vuelva a faltar cuando `/estadisticas` lea la columna.
> **Es el MISMO fallo que `episode_runtime_minutes` un día antes** (`20260818`): columna nueva sin
> grant compila, pasa los tests y solo revienta contra la BD real (issue #375).
>
> Auditada de paso **toda** la tabla en prod: no queda ninguna otra columna con hueco. Sin
> INSERT/UPDATE para `authenticated` solo están `id`, `created_at` y `updated_at` (default y
> trigger, correcto), y `review` sigue **sin SELECT** a propósito — se lee por la vista
> `pass_reviews`, que es la que aplica la privacidad.
>
> **Delta del 2026-08-04 (avisos por persona, §5): `follows.notify_events` y los cuatro valores
> `followed_*` de `notification_type` añadidos y verificados en DEV Y EN PROD** el 2026-08-04
> (`information_schema.columns` y `pg_enum`: prod devuelve `has_column=1`, `followed_enum_values=4`). Migraciones
> `20260804000000_follow_notify_events.sql` y `20260804000001_notification_type_followed.sql`. Sin
> tabla nueva: el interruptor de aviso por persona vive en `follows.notify_events`
> (`finished|session|episode|added`), escrito por **service-role** porque la RLS de `follows` solo
> concede UPDATE al followee. Ver §5 y `decisiones.md` (2026-08-04).
> **SUPERSEDIDO por el delta del 2026-08-13 (§5.3): el dominio de `notify_events` cambió a
> `milestone|progress|thought` y el disparo se movió del hecho al post — ver más abajo.**
>
> **Delta del 2026-08-04 (barrido de P0), aplicado y verificado en DEV Y EN PROD** — ninguna
> columna ni tabla nueva, solo dos guardas: `private.enforce_comment_target_commentable` pasa a
> rechazar el reapuntado de un comentario (§5, issue #339) y nace
> `private.forbid_delete_with_passes` con sus tres triggers `BEFORE DELETE` sobre
> `books`/`movies`/`series` (§3, issue #272). Migraciones `20260820_comments_forbid_retarget.sql`
> y `20260821_catalog_delete_guard_passes.sql`. Verificado además que **no había datos ya
> derivados**: cero comentarios con audiencia/href distintos de los de su padre en los dos
> entornos, y cero pases huérfanos en prod (en dev había 4, borrados). El control preventivo de
> los grants por columna vive ahora en `docs/DRIFT-CHECK.md` §6 (issue #375), con la referencia
> de las 10 tablas con hueco intencionado — idéntica en dev y prod.

> **Delta del 2026-08-04 — seguimiento de eventos de club (§6.1) y el primer trabajo
> programado del repo (§6.2): aplicado y verificado en dev Y EN PRODUCCIÓN** el mismo día.
> Verificado contra los objetos reales de los dos entornos (`information_schema.columns`,
> `pg_constraint`, `pg_policies`, `pg_proc`, `cron.job`, `cron.job_run_details`,
> `net._http_response`), nunca contra `list_migrations`, y con 12 checks de impersonación en
> dev. Incluye un cambio en una tabla del núcleo: `notifications.actor_id` pasa a
> **nullable**. El trabajo programado está **entregando de verdad** en producción (200 desde
> el propio cron, ver §6.2).

> **Delta del 2026-08-05 — hitos de `buddy_read` autodeclarados (§6, issues #470/#471):
> aplicado y verificado en DEV y EN PROD** contra `pg_proc` (nunca contra `list_migrations`).
> `confirm_checkpoint` deja de revalidar la posición del lector: la comparaba contra
> `library_entries` (CONGELADA — tercer bug real de esa tabla) y, aunque leyera `passes`, la
> página objetivo depende de la edición de cada participante. Dos migraciones,
> `20260826_confirm_checkpoint_lee_passes.sql` y `20260827_hitos_autodeclarados.sql`; sin
> columnas nuevas ni cambios de grants (ACL de la función preservada por `create or replace`
> y verificada: `authenticated=X`, sin `anon`).
>
> **Delta del 2026-08-06 — la vista `public.pass_reviews` proyecta ahora `d.updated_at` (Bloque 3
> del triage #496, issue #345), aplicado y verificado en DEV y EN PROD** (`pg_get_viewdef`).
> `updated_at` se añadió AL FINAL (`create or replace view` solo admite columnas nuevas al final;
> el WHERE de RLS no cambió, grants a `anon, authenticated` preservados). Motivo: es la hora REAL
> del terminado —un pase se CREA al añadir la obra y el «terminado» llega después como UPDATE, así
> que `created_at` puede ir semanas por delante—. `recent-reviews.ts` y `shared-activity.ts` ya
> leían de esta vista y seguían con `created_at` porque la vista no lo exponía; ahora usan
> `updated_at` como `sortDate`, igual que `getFeed`. Trade-off asumido (mismo que el feed):
> `updated_at` lo mueve cualquier update del pase. Migración `20260833_pass_reviews_updated_at.sql`.
>
> **Delta del 2026-08-09 — tipos de evento de club (§6.3), SOLO EN DEV.** Nuevo enum
> `club_event_type` (`encuentro | lanzamiento | fecha_destacada`, migración `20260840`) y
> columna `club_activities.event_type NOT NULL DEFAULT 'encuentro'` con grant por columna
> idéntico a `modality` (migración `20260841`, verificado contra
> `information_schema.column_privileges`). `create_club_event`/`update_club_event` ganan
> `p_event_type` (solo en create) y `p_config jsonb` (migración `20260842`), y la hora de
> inicio pasa a OPCIONAL para Lanzamiento/Fecha destacada (ancla `starts_at` a 00:00 en
> `event_timezone`); **Encuentro, al contrario, pasa a EXIGIR hora** — retira el default de
> las 19:00 que aplicaba hasta hoy a todo evento sin hora (§6.3, `decisiones.md` 2026-08-09).
> Verificado contra `pg_proc`/`information_schema.column_privileges`/`to_regtype`, nunca
> contra `list_migrations`. **Producción pendiente del merge.**
>
> **Delta del 2026-08-12 (recordatorio predeterminado a una semana): aplicado y verificado
> en DEV y en PROD.** Migración `20260852_event_reminder_default_1w.sql`. Reemplaza DOS funciones
> para mover el predeterminado de 1440 a 10080: el default del parámetro de
> `follow_club_event` y el literal del auto-seguimiento del organizador dentro de
> `create_club_event` (el segundo no pasa por la primera, y es el que se olvida). **Ninguna
> tabla, columna, política ni grant cambia**, y **ninguna fila existente se toca**: quien ya
> sigue un evento conserva el offset que eligió. El conjunto de valores válidos no se amplía
> — `private.valid_event_reminder` ya aceptaba 10080. Verificado contra `pg_proc`
> (`pg_get_function_arguments` devuelve `DEFAULT 10080`, y `pg_get_functiondef` de las dos
> funciones ya no contiene ningún 1440), nunca contra `list_migrations`. **Aplicada a PROD el
> 2026-08-12** tras comprobar antes que su `create_club_event` vivo era la versión de
> `20260842` (con `p_event_type`/`p_config`) y que su cuerpo solo difería en esa constante:
> reemplazar la función sobre una prod más atrasada habría roto la creación de eventos.
> `schema-baseline.sql` —que replica PROD— pasa a 10080 en sus dos sitios. Comprobado
> además que **no se movió ninguna fila**: en prod quedan 23 seguimientos con 1440 (los que
> ya existían) y 3 con 10080. Ver `event-state.ts:DEFAULT_REMINDER_MINUTES`, que es quien
> manda en la práctica.
>
> **Delta del 2026-08-12 (progreso en lote de la pestaña Actividades, §6.4): aplicado y
> verificado en DEV y en PRODUCCIÓN.** Migración `20260853_activities_progress.sql`, nueva RPC
> `get_activities_progress(uuid[])` (`stable security definer`, gate `is_club_member`, más
> ancho que `is_activity_participant` a propósito — ver §6.4 y `decisiones.md`). Sin columnas
> ni tablas nuevas ni cambios de grants en tablas existentes. Verificado contra `pg_proc`
> (`prosecdef=true`, `provolatile='s'`, `proconfig=search_path=public`, ACL
> `authenticated/postgres/service_role` **sin `anon`**), nunca contra `list_migrations`.
>
> En producción se comprobó además con datos reales, no solo la existencia del objeto: sin
> sesión devuelve **cero filas** (el gate no deja pasar nada al rol de servicio), y con sesión
> simulada de un miembro real devuelve la actividad de SU club con números coherentes
> (`buddy_read` de 4 hitos: colectivo 2/4, del viewer 4/4, 2 participantes) mientras las de
> otro club quedan fuera — `is_club_member` da `false` para ellas y no sale su fila.
>
> El advisor de seguridad la marca con un WARN
> (`authenticated_security_definer_function_executable`), que es **intencionado y compartido
> con el resto de RPC del proyecto**: la función existe precisamente para dar a un miembro
> autenticado un agregado que la RLS no le dejaría calcular. Lo que importaba era no aparecer
> bajo `anon_security_definer_function_executable`, y no aparece.
>
> **Delta del 2026-08-12 (editar título/descripción/fechas de una actividad, §6.5): estado
> MIXTO, léase con cuidado.** Migración `supabase/migrations/20260854_update_activity_details.sql`,
> nueva RPC `update_activity_details(uuid, text, text, date, date)`, **aplicada y verificada en
> DEV y en PRODUCCIÓN** con la versión corregida (gate de rol primero, commit `eec82b0e`).
>
> Hubo un tramo en que dev tuvo la primera versión, con un fallo de seguridad: el gate de rol
> se comprobaba DESPUÉS de revelar si la fila existía y de qué `kind` era, así que alguien
> ajeno al club podía sondear uuids por el código de excepción. Era una **regresión** de lo que
> `20260831_club_activity_role_gate_first.sql` (issue #129) ya había corregido en otras cuatro
> RPC de esta misma tabla. Corregido y verificado en los dos entornos: los tres casos del
> sondeo dan `forbidden` desde el primer gate. Detalle en §6.5.

> **Delta del 2026-08-13 (desmarcar un hito, y el gate de `confirm_checkpoint`
> reordenado, §6): aplicado y verificado en DEV y en PRODUCCIÓN**, contra `pg_proc`, nunca
> contra `list_migrations`. Migración `20260855_unconfirm_checkpoint.sql`: nueva RPC
> `unconfirm_checkpoint(uuid)`, simétrica a `confirm_checkpoint` (desmarca el hito N y los
> posteriores, donde confirmar auto-confirma 1..N), gate de participante comprobado
> PRIMERO, no mira el estado de la actividad a propósito. Y `confirm_checkpoint` cambia de
> ORDEN, no de efecto: su gate de participante pasa también a ir primero (issue #129, misma
> fuga de INFO que corrigió `20260831_club_activity_role_gate_first.sql` en otras cuatro
> RPC) y su código `'not found'` se normaliza a `'not_found'`; la cascada 1..N no varía. Sin
> columnas, tablas ni cambios de grants. Las dos con `search_path = public, pg_temp`, como
> manda la plantilla. Detalle en §6.

## 0. Dos renombres que invalidan la doc antigua

**`diary_entries` se llama `passes` desde julio de 2026** (migración `pass_hub_c_rename`).
Cualquier doc, plan o spec anterior que hable de `diary_entries` se refiere a esta tabla.

**`library_entries` está CONGELADA.** Fue la tabla de progreso original, y buena parte
de la doc vieja aún la presenta así. Ya no lo es: **el estado vivo del usuario vive en
`passes`**. `library_entries` sigue existiendo porque conserva `pinned_order`
(sus columnas de cola se borraron con la retirada de colas, ver más abajo), pero **su
`status` y su `position` no se actualizan** — leerlos
da datos de hace meses. Esto ya ha causado tres bugs reales en producción (avance de sagas
al 0%, PR #96; confirmación de hitos de lectura conjunta rechazada, issue #470). Regla:
**cualquier feature que necesite el estado del usuario lo deriva de `passes`, nunca de
`library_entries`.**

## 1. La forma general

Arquitectura: **"columna vertebral compartida"**. Los metadatos, que varían mucho por tipo,
viven en tablas separadas y tipadas (`books`/`movies`/`series`); todo lo que es del usuario
es polimórfico vía `(item_type, item_id)`. Añadir un hobby nuevo = **1 tabla de metadata +
su integración de API**, reutilizando RLS, queries y UI de progreso.

`item_type` es el enum `book | movie | series`. La referencia polimórfica no tiene FK real
a catálogo (no se puede apuntar a tres tablas), así que **la integridad de `item_id` es
responsabilidad de la app**.

```mermaid
graph TB
    subgraph CAT["CATÁLOGO · compartido, SELECT abierto"]
        books[books]; movies[movies]; series[series]
        eds[book_editions]; vers[movie_versions]; eps[series_episodes]
        people[people]; credits[credits]
        books --> eds; movies --> vers; series --> eps
        people --> credits
    end

    subgraph USER["DEL USUARIO · RLS por dueño + visibilidad de perfil"]
        passes[("passes<br/>ESTADO VIVO")]
        sessions[progress_sessions]; notes[notes]; watches[episode_watches]
        libe["library_entries<br/>(congelada: solo pines)"]
        colls[collections]; ci[collection_items]
        passes --> sessions; passes --> notes; passes --> watches
        colls --> ci
    end

    subgraph SOCIAL["SOCIAL"]
        profiles[profiles]; follows[follows]
        targets[interaction_targets]
        reactions[reactions]; comments[comments]; notifs[notifications]
        blocks[user_blocks]; reports[content_reports]
        comments --> targets; reactions --> targets; notifs --> targets
    end

    subgraph CLUBS["CLUBES"]
        clubs[clubs]; cm[club_members]; cp[club_posts]
        ca[club_activities]; cai[club_activity_items]
        cap[club_activity_participants]; cach[club_activity_checkpoints]
        clubs --> cm; clubs --> cp; clubs --> ca
        ca --> cai; ca --> cap; ca --> cach
    end

    subgraph SAGAS["SAGAS"]
        sagas[sagas]; si[saga_items]
        sagas --> si
        sagas -. jerarquía .-> sagas
    end

    CAT -. "item_type + item_id" .-> USER
    CAT -.-> SAGAS
    USER --> SOCIAL
```

## 2. Catálogo (compartido entre usuarios)

`books`, `movies`, `series` — metadatos por tipo (autoría, portada, sinopsis, año, géneros).
Se rellenan **cache-as-you-go** desde APIs externas (OpenLibrary/Google Books, TMDB).
`SELECT` abierto a cualquiera, incluso anónimo — hace falta para renderizar perfiles
públicos y son metadatos no sensibles. `INSERT`/`UPDATE` autenticado.

Los `genres` de las tres tablas usan un **vocabulario canónico único** definido en código
(`src/lib/catalog/genre-vocab.ts`). Libros mapean subjects de OpenLibrary (`genres.ts`);
pelis/series mapean **ids** de TMDB (`tmdb-genres.ts`), nunca el nombre localizado. Índices
GIN `{books,movies,series}_genres_gin` sirven `genres @> ARRAY[label]` (`/genero/[slug]` y
el filtro de biblioteca). Migración `20260815_genres_gin_indexes.sql`. Verificado en dev
y en prod el 2026-07-30.

`movies.original_title` / `series.original_title` (`text`, nullable; migración
`20260802_screen_original_title.sql`, aplicada y verificada en DEV y en PROD el 2026-08-02 —
movies 354/354 y series 26/26 con valor en prod, 0 null). El `title` se cachea traducido a
**es-ES** desde TMDB (`language=es-ES`); `original_title` guarda el del idioma de rodaje. Lo
escribe `find-or-create.ts` en cada alta; las filas previas se rellenaron por un backfill
puntual que consulta TMDB por `tmdb_id` (idioma-independiente).

⚠️ **El motivo que daba esta sección era falso** (corregido el 2026-08-03): Letterboxd NO
exporta el título original, exporta el **internacional en inglés** — su catálogo es TMDB
en-US. Ese tercer título **no está en BD**: el matcher de importación
(`src/lib/import/match-row.ts`) lo pide a TMDB en cada fila (`searchMoviesForImport`), así que
la búsqueda en el catálogo LOCAL sigue sin poder casar «Spirited Away» con la fila cacheada
como «El viaje de Chihiro» — resuelve igualmente, pero gastando la llamada a TMDB. Ver
`decisiones.md` (2026-08-03).

**Columnas de TAMAÑO** (`movies.duration_minutes`, `series.total_episodes` / `total_seasons` /
`episode_runtime_minutes`): alimentan la estimación de tiempo y los tramos de duración del
sorteo. No las trae la búsqueda (TMDB solo da `runtime` en la respuesta de **detalles**), así
que las hidrata `ensureItemEnriched` al abrir la ficha, de la misma llamada que ya pedía para
los créditos. Van fuera del trigger `enforce_catalog_edit_collaborator_only` a propósito: son
de sincronización, no curadas, y las rellena cualquier `authenticated` que visite la ficha.

> **Delta del 2026-08-03 (issue #365): `grant update (episode_runtime_minutes) on series to
> authenticated`, aplicado y verificado en DEV y en PROD** (`information_schema.column_privileges`
> → las 9 columnas, ya con `episode_runtime_minutes`). Migración
> `20260818_grant_series_episode_runtime.sql`. La columna nació en `20260710` **después** del
> grant de tamaños original y se quedó fuera; como la hidratación escribe las tres en un único
> patch, el UPDATE fallaba entero en cuanto faltaba la duración de episodio. Sin cambio de
> esquema: solo el grant. En la misma issue, el punto de captura de los tamaños pasó del sorteo
> a la ficha (eran dato compartido rellenado por un backfill que solo alcanzaba pendientes del
> dueño: 1 de 354 películas y 0 de 26 series en prod). Ver `decisiones.md` (2026-08-03).

Tres tablas de "tirada concreta" cuelgan del catálogo:

| Tabla | De | Para qué |
|---|---|---|
| `book_editions` | `books` | ISBN, editorial, páginas, idioma, portada de **esa** edición. `is_primary` marca la canónica |
| `movie_versions` | `movies` | Montajes/versiones |
| `series_episodes` | `series` | Catálogo por episodio, cache-as-you-go desde TMDB |

**La escalera de hidratación** (spec de 2026-07-14) manda aquí: la búsqueda **no escribe en
BD**. Son tres peldaños — tarjeta de resultado (memoria) → ficha de obra (se crea al abrirla)
→ edición (al registrarla). Por eso la tarjeta de búsqueda no lleva editorial ni páginas:
son de una tirada, no de la obra.

`people` + `credits` guardan autoría/dirección/reparto, también polimórfico por
`(item_type, item_id)`. `credits` tiene índice **único** sobre
`(item_type, item_id, person_id, role)` (`credits_item_type_item_id_person_id_role_key`): una
persona puede tener VARIOS roles en la misma obra (actúa y dirige) pero no el mismo dos veces.
Ojo al escribir en lote: un `insert` con una sola fila ya presente falla **entero** con 23505 y
no inserta ninguna de las nuevas — por eso `hydratePersonCredits` va por `upsert` con
`ignoreDuplicates`.

⚠️ **La referencia de `credits` a la obra es POLIMÓRFICA y por tanto NO hay FK** — el mismo
agujero que tenía `passes` (issue #272), pero `credits` **se quedó fuera** del trigger
`private.forbid_delete_with_passes`. Resultado: hay filas de `credits` apuntando a obras que
ya no existen. **En dev, medido el 2026-08-12: Damien Chazelle tenía 226 créditos y CERO
resolvían contra `movies`.** El síntoma no se parece a la causa: la ficha de persona descarta
el crédito huérfano (con razón) y enseña «Aún no hay obras de esta persona en el catálogo»,
o sea que no revienta, **miente**. Cuantificar con:

```sql
select count(*) from credits c
where c.item_type='movie' and not exists (select 1 from movies m where m.id=c.item_id);
```

Prod está **sin medir**. Ver issue #609.

**`people.credits_hydrated_at`** (`timestamptz`, nullable; migración
`20260823_people_credits_hydrated_at.sql`, aplicada y **verificada en DEV y en PROD el
2026-08-12** contra `information_schema.column_privileges`). Marca que ya se trajo la obra
COMPLETA de la persona desde su API externa —`/person/{id}/combined_credits` de TMDB, o dos
pasadas de `search.json` de Open Library por `author_key` (`lang=es` y `lang=en`, normalizadas
por `normalizeAuthorWorks`)—. Con valor, la ficha de persona no vuelve a
llamar a la API: sirve `credits` y punto.

Lleva **`grant update (credits_hydrated_at) on people to authenticated`** en la misma
migración: el `UPDATE` de `authenticated` sobre `people` está acotado **por columnas**
(`bio, birth_date, death_date, photo_url, place_of_birth` antes de esto), y una columna sin su
grant rompe la escritura ENTERA de la tabla — `enrichTmdbBio` dejaría de guardar biografías,
no solo el campo nuevo. Ver issue #375 y la superficie 6 de `docs/DRIFT-CHECK.md`.

Antes de esto, «Su obra» de una ficha de persona era solo lo que `ensureItemEnriched` hubiera
escrito al abrir la ficha de **una obra concreta**: una persona con una sola película abierta
afirmaba, sin matices, que esa era toda su obra. No era un hueco, era una afirmación falsa.

> **Delta del 2026-08-13 (`people.aliases`, autores de libro por Open Library key): columna +
> grants de SELECT, INSERT y REFERENCES aplicados y verificados en DEV** contra
> `information_schema.column_privileges` (migración `20260859_people_aliases.sql`; **prod
> pendiente — es la ÚNICA migración de esta rama que falta en producción**). Spec:
> `docs/superpowers/specs/2026-08-13-autores-libro-datos-design.md`.
>
> Dos correcciones del 2026-08-14, al comprobar el estado real de prod antes de mezclar: el
> fichero se renombró de `20260853_` a `20260859_` (compartía prefijo con
> `20260853_activities_progress.sql`, que llegó por `main`), y se le añadió el **grant de
> SELECT**, que faltaba. Sin él, prod habría quedado distinto de dev —donde `aliases` sí lo
> tiene— y un futuro `select *` sobre `people`, o simplemente añadir `aliases` a
> `PERSON_COLUMNS`, habría fallado solo en producción.

| Columna | Tipo | Para qué |
|---|---|---|
| `aliases` | `text[] not null default '{}'` | Otras grafías del nombre (otros idiomas y alfabetos). El visible es `name`. Solo lo escribe el alta de autor y el backfill. |

Open Library da un nombre canónico que puede venir en otro alfabeto (`Фёдор Достоевский`) y una
lista de variantes; se enseña la forma latina y el resto se guarda aquí, que es lo que permite
reconocer "Dostoievski" y "Fyodor Dostoyevsky" como la MISMA fila en vez de crear una por idioma.
Igual que `credits_hydrated_at`, **sin grant de `UPDATE` a propósito**: la app no reescribe
personas, y el backfill que corrige nombres y alias va con `service_role`.

## 3. El pase: el hub del estado

**`passes` es la tabla central del usuario.** Una fila por *pase* — una lectura o visionado
concreto de un ítem. Releer un libro es un pase nuevo, no una edición del anterior.

Columnas que importan: `user_id`, `item_type`/`item_id`, `status` (`media_status`:
`planned|in_progress|completed|dropped`), `is_active`, `position` (jsonb), `rating`,
`review`, `is_public`, `planned_on`/`started_on`/`finished_on`, `edition_id`,
`dropped_reason`/`dropped_reason_note`, y `pinned_order` (las de cola se borraron, ver
«`queues` ya no existe»).

- **Fechas hito**: `planned_on` (entró en la pila), `started_on` (se empezó a leer/ver) y
  `finished_on` (se terminó). Las fija `planTransition` (`src/lib/passes/transitions.ts`) en
  cada cambio de estado. ⚠️ `planned_on` es **forward-only** (issue #361): el historial
  importado nace como pases cerrados que nunca pasaron por `planned`, así que ahí es `NULL`.
  Por eso «la pila» ordena por `created_at` (proxy con datos para todos) y no por `planned_on`.

- **`is_active`** distingue el pase en curso de los cerrados. Solo uno activo por ítem.
- **`dropped_reason`/`dropped_reason_note`** (migración `20260858_pass_dropped_reason.sql`,
  **aplicada y verificada en DEV y en PROD el 2026-08-14** contra
  `information_schema.columns`/`column_privileges` de los dos entornos (en
  prod: `authenticated` solo `UPDATE` en ambas columnas, sin `SELECT`, sin
  `anon` — idéntico a dev): motivo de abandono,
  enum cerrado (`no_enganchado|aburrido|no_es_momento|no_esperado|otro`) +
  nota libre solo con `otro`. **Siempre privado**, con independencia de
  `is_public` — sin `grant select` en `passes` (la RLS de SELECT de la tabla
  es de visibilidad de PERFIL, `can_view_profile`, no de dueño; un grant ahí
  se filtraría a cualquiera que vea el perfil). Se lee solo por
  `pass_reviews`, enmascarado por `d.user_id = auth.uid()` dentro de la
  vista. Solo `grant update`, necesario para `closePass`/`updatePass`. Sin
  backfill: pases `dropped` previos quedan con motivo `NULL`.
- **El pase es dueño de la nota y la reseña**, no la entrada de biblioteca: cada relectura
  puede tener su propia valoración.
- **`position` es jsonb** porque es lo único que varía por tipo: `{"page": 42}` en libros,
  `{"season": 2, "episode": 5}` en series. **No se valida en BD** — es el trade-off aceptado
  a cambio de no replicar la vertical entera por cada tipo nuevo.
- ⚠️ **`rereadCount` NO es el ordinal del pase**: cuenta los pases CERRADOS. El actual es
  +1. La primera lectura siempre sale bien, así que el fallo pasa desapercibido hasta que
  alguien relee.
- ⚠️ **La referencia al ítem es POLIMÓRFICA (`item_type` + `item_id`) y por eso NO hay FK.**
  Borrar una obra del catálogo dejaba pases colgando en silencio (issue #272: 4 filas en dev;
  prod estaba limpio). Como el síntoma no se parece a la causa —`getSorteoPool` descarta los
  pases sin obra en catálogo, así que el pool salía vacío y el e2e moría con un timeout que
  no mencionaba ni el sorteo ni los pendientes—, desde el **2026-08-04** lo cierra en la BD
  el trigger `private.forbid_delete_with_passes` (`20260821_catalog_delete_guard_passes.sql`,
  aplicado en **dev y prod**), `BEFORE DELETE` sobre `books`, `movies` y `series`: **rechaza
  el borrado** (`catalog_item_has_passes`, `23503`) si quedan pases apuntando a la obra.
  No cascadea a propósito — un pase guarda nota y reseña del usuario, ver `decisiones.md`.
  La trampa al depurar: `count(*) from passes where is_active and status='planned'` cuenta
  los huérfanos, así que parece que el usuario SÍ tiene pendientes; la cuenta que importa es
  la de pendientes **con obra en catálogo**.

Cuelgan del pase:

- **`progress_sessions`** — sesiones de lectura/visionado. `position` es el punto
  ALCANZADO. `started_at` (añadido en plan 05) permite saber la franja horaria real;
  `created_at` es cuándo se registró, que no es lo mismo. `note` (texto, legacy, tope
  2000 caracteres) ya no se escribe desde 2026-07-29 — las notas de sesión viven en
  `notes` (varias por sesión, enlazadas por `session_id`, ver abajo); la columna se
  queda con las filas históricas, sin migrar.
- **`episode_watches`** — un episodio visto. **La existencia de la fila = visto**;
  `rating`/`review` son opcionales.
- **`notes`** — notas y citas de «Memorizar». **Varias por sesión** (no hay tope):
  `SessionNotebook` (hoja de sesión) las guarda una a una según se escriben —
  `session_id` queda `null` hasta que se guarda la sesión, momento en que `addSession`
  las enlaza por id. Además de `pass_id`/`session_id` (ambas opcionales), `item_type`/
  `item_id`, `kind` (`note|quote`, con `CHECK`) y `body`: desde
  `20260721_notes_social_columns.sql` suma `meta jsonb not null default '{}'::jsonb`
  (metadata libre por tipo de nota), `is_spoiler boolean not null default false`,
  `is_public boolean not null default false` y `parent_note_id uuid null references
  notes(id) on delete set null` (cita → nota hija; borrar la cita padre no arrastra la
  hija). Índices: `idx_notes_user` (`user_id, created_at desc`, preexistente),
  `idx_notes_item` (`user_id, item_type, item_id`, para la lista de la ficha) e
  `idx_notes_parent` (parcial, `where parent_note_id is not null`). **RLS: dueño (4
  políticas) + lectura pública desde el 2026-07-30** — política aditiva `"public
  notes select"` (`is_public = true and public.can_view_profile(user_id)`, migración
  `20260814_notes_public_select.sql`, **solo en dev**, prod pendiente del merge de
  `feat/feed-tarjetas-por-tipo`): un visitante que puede ver el perfil del autor lee
  sus notas PÚBLICAS; la nota privada sigue oculta a todos menos su dueño. El feed de
  tarjetas por tipo (`getFeed`, tarjeta de avance/`progressed`) se apoya en esta
  política para servir `notes.body` (spoiler-aware) junto a `progress_sessions.position`
  (la página) y un `percent` derivado (`position / books.total_pages`) — el `note` legacy
  de `progress_sessions` (ver arriba) **nunca** se sirve, solo `notes.body` pública. Ver
  `decisiones.md`.

**Las series no tienen `progress_sessions`**: se miden en episodios. Cualquier orden por
"última sesión" las manda al final si no se contempla.

### RPC `get_widget_snapshot()` — lectura para widgets nativos (dev + prod, 2026-08-06)

Arquitectura híbrida Fase 2 (`20260806_get_widget_snapshot.sql`, epic #497): el widget
Android la llama DIRECTAMENTE por PostgREST con su sesión nativa (Fase 1) y recibe el mismo
JSON v2 que antes construía el TS y empujaba el WebView (`build-widget-snapshot.ts`) — cambia
el transporte, no el contrato. `SECURITY INVOKER` (RLS del que llama; no puede ver a otro),
`STABLE`, sin argumentos (usa `auth.uid()`), `EXECUTE` a `authenticated`. Es un **port fiel**
de `getTodayFocus` + `hydrateItems` + `getProgress` + `getWeeklyActivity` + `getStreaks`; no
cambia el esquema (solo lee). Dos trampas que el port respeta: (1) tres definiciones distintas
de "actividad" —racha/semana por pase = sesiones ∪ episodios; racha global = sesiones ∪
finales de pase; minutos de hoy = solo `duration_minutes` de libros—; (2) "hoy" en
**`Europe/Madrid`** (convención de `club_rounds`), no UTC. **En prod desde 2026-08-06**
(verificada bajo rol `authenticated` con RLS: JSON v2 correcto para un usuario real de 2 pases
en curso). **Fix 2026-08-06 (`20260806_widget_snapshot_edition_pages.sql`, dev+prod):** el total de
páginas del libro sale de la EDICIÓN del pase (`book_editions`, precedencia edición del pase →
primaria → cualquiera con total → y solo si no, `books.total_pages`), réplica en SQL del arreglo
web `e6dec32`/`pickEditionPages`; antes salía «Sin progreso» porque `books.total_pages` casi
siempre es null (la búsqueda ya no lo escribe). Riesgo vivo: como la web sigue usando el TS, widget
y dashboard podrían divergir cerca de medianoche (el server TS calcula "hoy" en UTC) — ver
`decisiones.md` e issue de reconciliación.

## 4. Organización del usuario

| Tabla | Qué |
|---|---|
| `collections` | Colecciones (v2): nombre, descripción, `visibility`, orden, `is_sorteable` |
| `collection_items` | Ítems de una colección, polimórfico + `position` |
| `challenges` | Retos con ventana y criterio. **Absorbió las metas anuales** (las 3 columnas `annual_goal_*` de `profiles` se migraron aquí y se eliminaron) |

`profiles.daily_goal_minutes` **no** se fusionó: no es un reto, es el objetivo diario.

### `queues` ya no existe (dev 2026-07-20 · prod 2026-07-21)

La tabla `queues`, las columnas `queue_id`/`queue_order` (de **`passes` y `library_entries`**)
y el RPC `reorder_queue` **se borraron** en `20260720_drop_queues.sql`. Al integrar
Colección v2, la pestaña «Colas» dejó de pintarse y quedó inalcanzable: ningún enlace
llevaba a `?tab=colas`. Lo único que seguía aportando —acotar el sorteo a un subconjunto
propio— lo hacen ahora las **colecciones marcadas `is_sorteable`**.

**Aplicada en los dos entornos.** Dev el 2026-07-20; **prod el 2026-07-21** (issue #122),
una vez confirmado que el despliegue de producción (`b491279`) ya no contenía ninguna
referencia a colas y que las 3 colas que quedaban estaban **vacías** (0 pases y 0 entradas
con `queue_id`). Con esto dev y prod vuelven a tener el mismo esquema.

⚠️ **Orden de despliegue, no negociable — la razón por la que estuvo un día a medias:** el
`DROP` va **después** de desplegar el código que deja de leer `queues`. Mientras las tres
fichas llamaban a `getQueues()` en cada carga, borrar la tabla en producción habría roto
`/libro`, `/pelicula` y `/serie` enteras. Por eso se aplicó primero solo en dev y se esperó
al despliegue. **El patrón se generaliza a cualquier `DROP`: código primero, esquema
después** — y anotar el pendiente como issue para que no se quede a medias (`AGENTS.md`).

**`collections.is_sorteable`** (`boolean not null default false`, migración
`20260720_collections_sorteable.sql`) marca qué colecciones se ofrecen en el filtro del
sorteo (§7.28). Es opt-in porque el usuario tiene ~19 colecciones y ofrecerlas todas hacía
el filtro inservible. El pool del sorteo es entonces **colección ∩ pases `planned` activos**.

## 5. Social

`profiles` (username único, `is_public`, `role`, más las dos del onboarding: **`interests`**
`item_type[]` —los tipos que declaró en el paso 1; null = sin responder, y entonces el flujo
asume los tres— y **`onboarded_at`**, que **ES el gate** de `/onboarding`: con valor, el
asistente no se vuelve a mostrar. Ojo, «tener perfil» y «estar onboardeado» son cosas distintas
desde julio de 2026, y confundirlas ya rompió el asistente una vez), `follows` (con `follow_status`
`pending|accepted` — a perfil público es aceptado directo), `reactions` y `comments`
(polimórficos vía `target_kind` **hasta la fase 1 social; desde el 2026-08-02, en dev y en prod,
apuntan ya solo a `interaction_targets` — ver más abajo**), `notifications`, `push_subscriptions`.

`target_kind` conserva el valor histórico **`diary_entry`** aunque la tabla se llame
`passes`: renombrar un valor de enum en uso habría requerido migrar datos por una etiqueta.

> **Delta del 2026-08-04 (avisos por persona): `follows.notify_events` añadida y verificada
> en DEV Y EN PROD** el 2026-08-04 (`information_schema.columns`: `text[]`, `not null`, default `'{}'::text[]`).
> Migración `20260804000000_follow_notify_events.sql`. Categorías de
> aviso (`finished|session|episode|added`) que el **follower** activó sobre el followee — campana
> apagada = array vacío. **La escribe service-role, no el follower**: la RLS de `follows` solo
> concede UPDATE al followee (evita el auto-accept en perfiles privados si se le abriera al
> follower), así que el interruptor pasa por una server action con service-role
> (`setFollowNotify`) en vez de un UPDATE directo del cliente. Sin tabla nueva. Ver
> `decisiones.md` (2026-08-04).
> **SUPERSEDIDO por el delta del 2026-08-13 (§5.3)**: el dominio pasa de
> `finished|session|episode|added` a `milestone|progress|thought`, y el aviso ya no lo dispara el
> hecho (sesión/pase/episodio) sino `createPost`. El `comment on column` de abajo es el vigente.

> **Delta del 2026-08-05 (notificaciones push unificadas Web+Android): aplicado en DEV;
> PROD pendiente del merge.** Migraciones `20260828_push_devices.sql`,
> `20260829_notification_preferences.sql`, `20260830_notifications_dedupe_key.sql`.
> - **`push_devices`** (NUEVA): dispositivos push unificados. Enum `push_platform`
>   (`web_push|fcm_android|apns_ios`). `web_push` usa `endpoint`+`p256dh`+`auth` (VAPID);
>   nativo usa `token`. CHECK `push_devices_credentials_shape` impide mezclar los dos mundos.
>   Salud por dispositivo (`enabled`, `last_success_at`, `last_error`, `last_error_at`,
>   `failure_count`) para apagar tokens muertos sin borrarlos. RLS self-only; el dispatcher
>   lee/escribe salud con service_role. **Sustituye a `push_subscriptions`** (que sigue en
>   pie, con sus filas COPIADAS a `push_devices`; su retirada es un issue aparte tras
>   verificar en prod).
> - **`notification_preferences`** (NUEVA): una fila por usuario, opt-out (sin fila = todo
>   activo). Canales `web_push_enabled`/`android_push_enabled` × categorías
>   `category_social|clubs|progress|system`. El dispatcher las cruza. RLS self-only.
> - **`notifications.dedupe_key`** (COLUMNA NUEVA, nullable): idempotencia opcional; índice
>   único parcial `where dedupe_key is not null`. Hoy la usan las reacciones. **Grants por
>   columna añadidos** (DRIFT-CHECK superficie 6, #375): `dedupe_key` concedida con el mismo
>   patrón que las demás columnas de `notifications`. Ver `decisiones.md` (2026-08-05) y
>   `docs/push-notifications-android.md`.

**Ampliado con `pass` y `progress_session`** (migraciones `20260812_feed_targets_enum.sql` y
`20260813_feed_targets_can_view.sql`, aplicadas y verificadas en dev y en prod el 2026-07-29):
el feed de Inicio agrupa los eventos `added`/`progressed` solo para PINTARLOS (por actor y por
actor+obra respectivamente, con la ventana temporal exacta en `decisiones.md` — ha cambiado ya
más de una vez, no la repitas aquí), pero cada reacción/comentario sigue
apuntando a la fila real — `passes` o `progress_sessions` — nunca a un id sintético del grupo;
de ahí que hicieran falta valores de enum nuevos en vez de reutilizar el `diary_entry` legado.
`can_view_target()` gana dos ramas con el mismo patrón que las demás: `pass` resuelve vía
`exists(select 1 from passes p where p.id = target_id and can_view_profile(p.user_id))`, y
`progress_session` vía `progress_sessions s`/`s.user_id`. Con esto, los eventos `added` (pase
nuevo) y `progressed` (sesión de progreso) del feed pasan a ser reaccionables/comentables —
antes no tenían ningún target.

**Social fase 0 (dev y prod, 2026-07-30).** `user_blocks` guarda pares dirigidos
`(blocker_id, blocked_id)`: ambos extremos pueden leer la fila, solo quien bloqueó puede
crearla o retirarla. Crear un bloqueo borra follows y notificaciones entre ambos y el gate
bidireccional se aplica a perfiles, contenido compartido a clubes, follows, comentarios,
reacciones y feed de club. Las RPC públicas `users_are_blocked(other_user_id)` y
`filter_unblocked_user_ids(candidate_ids)` son `SECURITY INVOKER`; la segunda filtra un lote
sin perder el orden de la primera aparición. Retirar el bloqueo no reconstruye follows ni
notificaciones borrados.

> **Grants a `anon` (dev y prod, 2026-08-02, migración `grant_anon_read_block_helpers`).** Con la
> navegación anónima, un visitante sin sesión llega a perfiles públicos y su feed, cuyas políticas
> SELECT `{anon,authenticated}` (passes, progress_sessions, follows) llaman a estos dos helpers.
> Como son `SECURITY INVOKER` y SQL inlinable, `anon` necesita **EXECUTE** sobre ambas funciones y
> **SELECT** sobre `user_blocks` (el privilegio de tabla se comprueba en planificación aunque el
> guard `auth.uid() is null → false/'{}'` impida tocarla en runtime). Sin ello, la lectura anónima
> lanzaba `permission denied` y devolvía 500. `user_blocks` no tiene política RLS para `anon`, así
> que el grant solo satisface el chequeo de privilegio: un anónimo nunca ve una fila.

Las notificaciones sociales se escriben desde servidor con `service_role`; el cliente ya no
puede hacer INSERT directo (`anon` y `authenticated` sin privilegio, y 0 políticas INSERT).
La migración de compatibilidad mantiene el orden de despliegue seguro hasta que
`20260730194407_social_phase0_close_notification_inserts.sql` cierra definitivamente la puerta.

`content_reports` conserva evidencia de moderación: reporter, usuario responsable derivado,
target polimórfico, razón, detalle, snapshot, estado y revisión. El cliente no decide ni
`reported_user_id` ni `snapshot`: un trigger los deriva del target real antes del INSERT.
Solo el reporter ve su reporte; admins globales y moderadores/owners del club del target
pueden verlo y resolverlo. Ser autor del target, por sí solo, no revela el reporte.
`report_comment(comment_id, reason, details)` es el punto de escritura para comentarios y
`moderatable_target_ids(target_kind, ids[])` permite resolver capacidades por lote. Al borrar
un target, los comentarios/reacciones/notificaciones asociados se eliminan, pero los reportes
se preservan como auditoría y pasan a `actioned` con `target_deleted_at`.

### Registro canónico `interaction_targets` (Social fase 1, contrato cerrado, dev y prod, 2026-08-02)

> **Estado: expand/migrate/contract COMPLETO en dev y en PRODUCCIÓN.** Las ocho migraciones están
> aplicadas en los dos entornos —dev (`tyvzpuhxfwxrnkcpzxyg`) el 2026-08-01, prod
> (`vmutcradmodhiltuohys`) el 2026-08-02— y todo lo que sigue está verificado contra objetos
> reales (`pg_class`, `pg_proc`, `pg_constraint`, `information_schema.columns`), nunca contra
> `list_migrations`. El despliegue a prod fue en el orden expansiva → backfill → bundle → contrato,
> con el merge del bundle canónico en medio; el anexo correspondiente ya está en
> `schema-baseline.sql` («ANEXO 2026-08-02»).

`interaction_targets` desacopla las interacciones de siete tablas fuente y materializa ocho tipos.
Su contrato vivo es:

| Columna | Contrato |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `kind`, `source_id` | `target_kind` + `uuid`, ambos `not null`, con `unique(kind, source_id)` |
| `owner_id` | `uuid not null references auth.users(id) on delete cascade`; índice `interaction_targets_owner_id_idx` |
| `audience_kind`, `audience_id` | `interaction_audience_kind` + `uuid`, ambos `not null`; `audience_id` es polimórfico y no tiene FK |
| `href` | `text not null`, siempre ruta interna (`href like '/%'`) |
| capacidades | `commentable`/`reactable` `not null`; cada booleano equivale exactamente a que su tipo de aviso no sea `null` |
| avisos | `comment_notification_type` y `reaction_notification_type`, ambos `notification_type` nullable |

La matriz materializada por triggers es `diary_entry`, `episode_watch`, `club_post`, `comment`,
`pass`, `progress_session`, `club_activity` y `activity_checkpoint`; `passes` emite dos targets
distintos (`diary_entry` y `pass`). Un comentario hereda audiencia y `href` del padre. En un
`activity_checkpoint`, el owner es **quien creó el checkpoint**
(`club_activity_checkpoints.created_by`), no quien creó la actividad; la migración correctiva del
2026-08-01 también repara con ese valor los targets existentes.

RLS está activa. `anon` y `authenticated` tienen exclusivamente `SELECT`; no hay concesión de
escritura de cliente. La policy de lectura delega en `can_view_interaction_target(id)`, que resuelve
dinámicamente `profile`, `club_member`, `activity_participant` o `checkpoint_reached` y aplica el
bloqueo bidireccional contra `owner_id`. Las policies de `comments` y `reactions` delegan en ese
mismo helper y exigen además `commentable`/`reactable`.

> **Corrección `20260802013421_social_interaction_targets_checkpoint_audience_fix.sql` (dev y prod, 2026-08-02).**
> La rama `checkpoint_reached` resolvía sobre `source_id` en vez de sobre `audience_id`, el único
> `case` que no leía la audiencia. Los dos valores solo coinciden en el target **propio** del
> checkpoint: un comentario hereda `audience_id` del padre pero su `source_id` es el del propio
> comentario, así que la comprobación recaía sobre un UUID de comentario y devolvía siempre falso.
> Efecto: el comentario se veía pero su target no, que es justo el estado que los loaders tratan
> como corrupción — un solo comentario en el chat de un checkpoint dejaba la página de la actividad
> en error 500 de forma permanente para todos los participantes. La rama además comprobaba solo la
> fila de lectura, sin exigir participación: salir de la actividad o ser expulsado del club no borra
> `club_activity_checkpoint_reads`, así que un ex-miembro conservaba acceso de lectura al chat.
> Ahora la rama **delega** en `public.can_view_target('activity_checkpoint', t.audience_id)`, que ya
> exigía las dos condiciones (`is_activity_participant` **y** `has_reached_checkpoint`); delegar
> evita que las dos definiciones de «puedo ver este checkpoint» vuelvan a divergir, que es lo que
> produjo el fallo. La matriz SQL cubre ahora la visibilidad del target **heredado** de un comentario
> en las cuatro audiencias, no solo la del target propio del padre.

#### Contrato tras `20260801224621_social_interaction_targets_contract.sql`

Las tres tablas de interacción tienen `interaction_target_id` con FK a `interaction_targets(id) on
delete cascade`, pero **no en las mismas condiciones**:

| Tabla | `interaction_target_id` | Par heredado `(target_type, target_id)` |
|---|---|---|
| `comments` | `not null` | **no existe**: columnas borradas |
| `reactions` | `not null` | **no existe**: columnas borradas |
| `notifications` | nullable | **se conserva**, nullable |

`notifications` mantiene el par a propósito: los avisos de club, invitación y evento nombran fuentes
que **no tienen fila en el registro canónico**, así que no hay id que poner. Conserva también su
trigger resolutor `trg_notifications_resolve_interaction_target` con el reparto de autoridad de
siempre (un INSERT del writer confiable puede traer solo el id canónico; con par legacy manda el
par; en UPDATE el par conserva la autoridad y el id se re-deriva o se limpia, de modo que el cliente
no puede inyectar metadatos canónicos divergentes).

En comentarios y reacciones, en cambio, **el id canónico es la única identidad**:

- **Unicidad de reacción**: `reactions_interaction_target_id_user_id_kind_key
  unique (interaction_target_id, user_id, kind)`, en sustitución de la que iba por el par heredado.
  El índice suelto `reactions_interaction_target_idx` se retira porque el nuevo único ya lo cubre por
  prefijo (un índice duplicado habría levantado el advisor).
- **Fuera la compatibilidad expand/migrate**: se retiran los triggers
  `trg_comments_resolve_interaction_target` y `trg_reactions_resolve_interaction_target` y las
  funciones `private.resolve_comment_interaction_target`,
  `private.resolve_reaction_interaction_target` y `private.resolve_interaction_target`. Ya nadie
  deriva el id canónico de un par que no existe. **`notifications` no pierde el suyo.**
- **Sin respuestas anidadas: de CHECK a TRIGGER.** `comments_no_nesting` desapareció con las
  columnas en las que se apoyaba. El invariante lo sostiene ahora
  `private.enforce_comment_target_commentable()` vía `trg_comments_enforce_commentable`
  (`BEFORE INSERT OR UPDATE OF interaction_target_id ON public.comments`, `FOR EACH ROW`), que
  rechaza todo comentario apuntado a un target con `commentable = false`
  (`target_not_commentable`, `23514` — el mismo `check_violation` que emitía el CHECK) y a un target
  inexistente (`invalid_interaction_target`, `23503`). Es un trigger y **no** una política RLS a
  propósito: así también ata a `service_role`, `postgres`, fixtures e2e y cualquier escritor
  `SECURITY DEFINER`, que una policy de inserción no sujeta. Y generaliza más que el CHECK: cubre
  cualquier target no comentable, no solo los de `kind = 'comment'`. Cubre el UPDATE porque
  reapuntar un comentario ya escrito al target de otro comentario anida exactamente igual que
  insertarlo así. Un `interaction_target_id` nulo lo deja pasar sin tocar, para que el `not null` de
  la columna siga hablando con su propio `23502`. El trigger es `ENABLE ALWAYS` (`tgenabled = 'A'`),
  no el `'O'` por defecto: si no, dejaría de dispararse con `session_replication_role = 'replica'`
  —`pg_restore --disable-triggers`, restauraciones y ramas de Supabase, aplicación de replicación
  lógica—, justo los caminos en los que el CHECK que sustituye **sí** se aplicaba; el invariante
  habría quedado más débil que antes sin que nada lo delatara.
  ⚠️ **Y desde el 2026-08-04 ese mismo trigger PROHÍBE reapuntar un comentario a otro padre**
  (`comment_retarget_forbidden`, `23514` — migración `20260820_comments_forbid_retarget.sql`,
  aplicada en **dev y prod**). Cubrir el UPDATE para impedir el anidamiento dejaba abierto un
  agujero peor: `private.sync_comment_interaction_target` es `AFTER INSERT` y no tiene
  equivalente en UPDATE, así que el reapuntado pasaba el control y dejaba el target del
  comentario con la **audiencia y el `href` del padre anterior** — visibilidad resuelta contra
  un público que ya no le corresponde y deep link a la página equivocada (issue #339). Se
  prohíbe en vez de sincronizar: `addComment` inserta y nunca reapunta, así que el derivado
  no puede quedar obsoleto por construcción. Verificado que ni dev ni prod tenían filas ya
  derivadas. Los UPDATE que no tocan `interaction_target_id` siguen funcionando igual.
- **El flag del que ahora depende el invariante está blindado.** Como el trigger lee
  `interaction_targets.commentable`, un `update … set commentable = true where kind = 'comment'`
  habría reabierto el anidamiento por la puerta de atrás. Lo impide el check
  `interaction_targets_comment_not_commentable` (`kind <> 'comment' or not commentable`), que compone
  con `interaction_targets_commentable_shape` para forzar además
  `comment_notification_type is null` en los targets de comentario — exactamente lo que escribe
  `private.sync_comment_interaction_target`.
- **Cinco funciones `SECURITY DEFINER` reescritas** para resolver el padre de un comentario por el
  registro canónico en vez de por las columnas borradas —plpgsql/SQL no declaran dependencia de
  columna, así que el `drop column` no habría avisado y habrían petado en runtime—:
  `private.cleanup_social_target` (deja de borrar comentarios/reacciones por el par: eso ya lo hace
  la cascada del FK; conserva el snapshot de `content_reports`, el borrado del target canónico y el
  de los avisos legacy), `private.can_moderate_comment` (**está en el camino RLS de `comments`**),
  `private.social_target_club_id`, `private.prepare_content_report` (el snapshot de un reporte de
  comentario sigue guardando `target_type`/`target_id` del padre, leídos ya del registro) y
  `public.can_view_target`. Todas mantienen firma, `security definer`, `search_path` y ACL: no se
  introdujo superficie nueva.

`trg_comments_cleanup_social_target` **se conserva**: no es redundante. `interaction_targets` no
tiene FK a las tablas fuente (`source_id` es polimórfico), así que al borrar un comentario alguien
tiene que borrar su propia fila `kind = 'comment'` — y de ahí, en cascada, sus reacciones.

Los triggers de limpieza de fuente eliminan el target canónico y sus FKs se llevan comentarios,
reacciones y avisos. `content_reports` **no** tiene FK al registro: conserva snapshot y queda
`actioned` con `target_deleted_at`, incluso cuando desaparece el target.

> **Delta del 2026-08-07 (hilos de comentarios, spoiler, fijado y edición — motor tras el «chat»
> de actividad): aplicado y verificado en DEV y en PROD**, migración
> `supabase/migrations/20260838_comments_threads_spoiler_pin_edit.sql`. `comments` gana cuatro
> columnas: `parent_id uuid null references comments(id) on delete cascade` (una respuesta; **cuelga
> del mismo `interaction_target_id` que su raíz** — el post —, nunca del target propio del padre),
> `is_spoiler boolean not null default false`, `pinned boolean not null default false` y
> `edited_at timestamptz null`. Índice `comments_parent_idx (parent_id)` y único parcial
> `comments_one_pinned_per_thread on (interaction_target_id) where pinned` (invariante
> un-fijado-por-hilo).
>
> - **Profundidad libre en datos, aplanada en UI.** El trigger `trg_comments_enforce_parent` →
>   `private.enforce_comment_parent_same_target()` exige que el `parent_id`, si lo hay, exista y
>   comparta `interaction_target_id` con el hijo (si no, `23514`) — pero no limita la profundidad:
>   una respuesta a una respuesta es válida en la base. La pantalla es la que aplana a dos niveles
>   visuales (comentario principal + respuestas), resolviendo la raíz como el ancestro con
>   `parent_id is null`. Decisión de forma en `decisiones.md` (2026-08-07).
> - **RLS**: política nueva `comments update own canonical` (solo el autor, cubre
>   body/spoiler/edición). La política de INSERT `comments insert own canonical` exige ahora además
>   `pinned = false` — nadie puede insertarse ya fijado.
> - **Grants por columna (DRIFT-CHECK superficie 6, #375).** Se revoca primero el UPDATE de tabla
>   completa a `anon`+`authenticated` (los grants por columna no estrechan uno de tabla si no se
>   quita antes) y se concede `grant update (body, is_spoiler, edited_at) to authenticated`. El
>   autor solo puede tocar esas tres columnas por UPDATE directo: `pinned`, `parent_id` y
>   `author_id` **no** son escribibles por `authenticated`.
> - **`pin_comment(p_comment_id uuid, p_pinned boolean)`** (`SECURITY DEFINER`): único camino para
>   fijar/desfijar. Gateada **SOLO al dueño del target** (`interaction_targets.owner_id`), NO a
>   moderador/admin (refinado en `20260839_pin_comment_owner_only.sql`: fijar = curación del dueño;
>   moderar/borrar sí es de admin vía `private.can_moderate_comment`, que aquí ya no se usa). Respeta
>   el un-fijado-por-hilo. `EXECUTE` solo a `authenticated`. `canPin` (capa de datos) = solo
>   `viewerOwnsTarget`.

### 5.1 `posts` — la capa social canónica (dev y **PROD**, 2026-08-09; SUPERSEDE §6.2 `thoughts`)

> Diseño en `docs/superpowers/specs/2026-08-09-posts-capa-social-design.md`. Aplicado y
> **verificado en dev Y EN PRODUCCIÓN el 2026-08-09** contra objetos reales (`to_regclass`,
> `enum_range`, grants por columna DRIFT-CHECK superficie 6 —`posts` 11/8/2, `post_preferences`
> 5/4/3—, `get_advisors(security)` sin hallazgos nuevos). Migraciones `20260843`–`20260847`.
>
> **Orden de despliegue que recibió prod (CORRIGE el orden ingenuo del plan):** el backfill muta
> los targets que el código VIEJO lee, así que **el código va ANTES del backfill**, no después
> (si no, el feed y la ficha de prod se caen en la ventana). Secuencia real: (1) enums `20260843`
> → (2) tabla+trigger+prefs `20260844`/`45` → (3) **merge + deploy del código** (feed lee `posts`)
> → (4) backfill `20260846` (in-place; comentarios/reacciones invariantes 41/33; `posts_sin_target=0`;
> 319 posts) → (5) drop de `thoughts` `20260847` (recrea `social_target_owner_id` sin la rama
> `thought` y hace `drop table`). El código vive en la rama `feat/posts-capa-social` (PR #557 + fixes
> #559/#560). Interacciones huérfanas del backfill (10, sobre `pass`/`progress_session` sin nota) →
> issue #558.
>
> **Delta del 2026-08-10 (posts Spec 2b — superficies de lectura + deep-link, SOLO EN DEV; prod
> pendiente):** dos cambios de esquema, verificados en dev contra objetos reales:
> `20260848_comment_target_anchor.sql` reescribe `private.sync_comment_interaction_target` para que
> el target `kind='comment'` lleve **`#c-<id>` en su href** (heredando la ruta del padre) + backfill
> de los existentes — así una notificación que apunte al target del comentario (una RESPUESTA a tu
> comentario, o un like) deep-linka al subhilo `/post/[id]#c-<cid>` (`listNotifications`/push leen el
> href tal cual). `20260849_notifications_dedupe_unique_index.sql` sustituye el índice único PARCIAL
> `idx_notifications_dedupe_key` (`WHERE dedupe_key IS NOT NULL`) por uno **no parcial**: PostgREST no
> puede usar un índice parcial como árbitro de `ON CONFLICT (dedupe_key)`, así que el upsert de
> `notify()`/`notifyMany()` con `dedupeKey` reventaba y la notificación dedupeada (la de respuesta,
> entre otras) NUNCA se creaba — bug preexistente destapado por el deep-link (misma semántica de
> unicidad; los NULL siguen distintos). El código de lectura (`PostThread`, feed → `PostSummary`) va
> en la rama `feat/posts-spec2-compartir`. Diferidos: 500 anon de `/post/[id]` (#561, preexistente),
> copy del aviso de respuesta (#562). Ver `decisiones.md` (2026-08-10).

Cada publicación social es una fila `posts` con `post_id` estable y **ruta propia `/post/[id]`**.
La **acción real** (`passes`/`progress_sessions`/`episode_watches`) sigue siendo la fuente de
verdad; `posts` la **referencia** y representa lo que se muestra socialmente.

`posts`: `id` (pk → ruta `/post/[id]`), `author_id` (FK `auth.users`, `on delete cascade`),
`kind` (`post_kind`: `started|finished|dropped|progressed|watched|thought`), `anchor_type`
(`post_anchor_type`: `book|movie|series|saga|person`, SIEMPRE — «no posts libres», sin FK, ancla
polimórfica como `thoughts`/`saga_items`), `anchor_id`, `source_kind` (`post_source_kind`:
`pass|progress_session|episode_watch`, null en `thought`), `source_id`, `body` (text ≤2000,
null salvo `thought` y el comentario opcional de `progressed`), `is_spoiler`, `created_at`,
`updated_at`. Índices: `unique(source_kind, source_id, kind) where source_id is not null`
(**idempotencia**: un pase puede tener `started` y `finished`, pero no dos `finished`),
`posts_author_created_idx (author_id, created_at desc, id desc)` (clave de orden del feed),
`posts_anchor_idx (anchor_type, anchor_id)`. RLS: select `can_view_profile(author_id)`, insert/
update/delete propios (delete también admin/moderador vía `can_moderate_target('post', id)`).
**Grants por columna** (#375) en la misma migración. `rated`/`reviewed` NO son `kind`: son
atributos del pase que el post `finished` MUESTRA leyendo `pass.rating`/`pass.review` en vivo.

**Enlace con `interaction_targets`**: trigger `private.sync_post_interaction_target()` (`after
insert on posts`, espejo del de `thoughts`) materializa UN target `kind='post'`,
`source_id=post.id`, audiencia `profile`/`author_id`, **`href='/post/'||id`** (la diferencia
clave con `thoughts`, que apuntaba a la ficha del ancla), `commentable=reactable=true`,
avisos `post_commented`/`post_liked`. `posts_cleanup_social_target` en delete. Rama `'post'`
añadida a `private.social_target_owner_id`. Valores de enum nuevos: `'post'` en `target_kind`,
`post_commented`/`post_liked` en `notification_type`.

`post_preferences` (una fila por usuario, **opt-out**, sin fila = defaults): `user_id` (pk →
`auth.users`), `autopost_started` (default **false**), `autopost_finished` (default **true**),
`autopost_dropped` (default **false**), `updated_at`. RLS self-only, grants por columna. La lee
`maybeAutopostMilestone`; su UI de ajustes es Spec 2.

**Backfill / absorción** (`20260846`, in-place, preserva comentarios/reacciones): por cada pase
terminado un post `finished` que **promueve** su target `diary_entry` → `post` (misma fila
`interaction_targets.id`, cambia `kind`/`source_id`/`href`); cada `thought` → post `thought`
(reusa su id, promueve el target); sesiones con **nota pública** → post `progressed`. Los targets
`pass`/`progress_session`(sin nota)/`episode_watch` **NO** se promueven ni se retiran en Spec 1
(ver `decisiones.md` 2026-08-09): `get-episode-reviews` sigue leyendo `episode_watch`, así que su
trigger se conserva; los de `passes`/`progress_sessions` crean residuo inerte, diferido a limpieza.

**Consecuencia verificada (fix incluido)**: como el backfill promovió los `diary_entry` a `post`,
la ficha (`get-community.getReviews`, community tab) resuelve ahora el hilo por el target del post
`finished` (el MISMO que ve el feed y `/post/[id]` — la conversación converge); un pase terminado
sin post se muestra sin hilo (`interactionTargetId` null), no se rompe.

**§6.2 `thoughts` queda SUPERSEDIDA**: la tabla se absorbe en `posts` y se elimina en `20260847`
(POST-merge); los valores de enum muertos (`thought` en `target_kind`, `thought_*` en
`notification_type`) se dejan inertes (recrear el tipo es caro).

### 5.2 `related_posts_by_author()` — ranking del raíl social de `/post/[id]` (dev y **PROD**, 2026-08-10)

RPC de LECTURA que alimenta el bloque «Más de {usuario}» de la columna SOCIAL de `/post/[id]`
(layout de 3 áreas OBRA · CONVERSACIÓN · SOCIAL): en vez de los posts más recientes del autor a
secas, prioriza los suyos sobre obras EMPARENTADAS con la del post actual. Firma
`related_posts_by_author(p_author_id uuid, p_anchor_type post_anchor_type, p_anchor_id uuid,
p_exclude_post_id uuid, p_limit int default 4)`, devuelve `setof posts` (para reusar
`resolvePostDrafts`, que conserva el orden). Migración `20260851_related_posts_by_author.sql`.

- **Puntuación** (deliberadamente simple, NO un recomendador): `3·misma_saga + 2·misma_obra +
  1·géneros_solapan`; orden `score DESC, created_at DESC, id DESC`. Los de score 0 quedan al final
  → el bloque muestra primero lo relacionado y RELLENA con recientes. Relaciones reusadas: `saga_items`
  (+ jerarquía `parent_saga_id` si el ancla ES una saga) y los arrays `genres` de `books/movies/series`
  (solape booleano `&&`, apoyado en los índices GIN de §2). Deuda asumida (creador/subgénero/tema y
  solape ponderado por conteo): issue abierta.
- **`SECURITY INVOKER`** a propósito: corre como quien llama, así que la RLS de `posts`
  (`can_view_profile(author_id)`) sigue filtrando la audiencia. `set search_path = ''`, todo
  cualificado con `public.`; comparaciones ancla↔`saga_items` en TEXTO (`::text`) porque
  `posts.anchor_type` es `post_anchor_type` {…,saga,person} y `saga_items.item_type` es `item_type`
  {book,movie,series}. `grant execute … to authenticated, anon` (la ruta la ve también un anónimo).
- Verificado en dev contra datos reales (gradiente 5/1/0, orden por recencia dentro del score, post
  actual excluido) + e2e `post-layout.spec.ts`. **Aplicada y verificada en PROD el 2026-08-10**
  (`pg_proc`: `prosecdef=false` → INVOKER, grants execute a `authenticated`+`anon`; smoke sobre un
  post real: 4 filas, no incluye el propio). Solo falta mergear el código (PR #570) que la consume —
  regla de despliegue de §5.1: migración primero (hecho), código después.

### 5.3 Los avisos de seguimiento nacen del post, no del hecho (dev y **PROD**, 2026-08-13)

Spec: `docs/superpowers/specs/2026-08-13-avisos-de-seguidores-desde-el-post-design.md`. Dos
migraciones, en este orden: `20260856_notification_type_followed_post_kinds.sql` y
`20260857_follows_notify_events_post_categories.sql`. Verificadas en DEV contra objetos reales
(`enum_range(null::public.notification_type)` trae los tres valores nuevos; `follows.notify_events`
en dev solo tenía filas con array vacío, así que la transformación de la tabla de abajo no tuvo
filas que mover en este entorno, pero corrió sin error contra el `where` de solapamiento).

**Estado de prod: las dos migraciones aplicadas y verificadas el 2026-08-13.**

- **`20260856` (el enum)**, aplicada por delante por ser aditiva pura. Verificada contra `pg_enum`:
  la consulta por `enumlabel like 'followed_%'` devuelve los siete (`followed_added`,
  `followed_dropped`, `followed_episode`, `followed_finished`, `followed_session`,
  `followed_started`, `followed_thought`).
- **`20260857` (la de datos)**, aplicada **después de que el código nuevo estuviera desplegado**
  (merge del PR #629 → deploy de producción de Vercel en verde → migración). Verificada leyendo la
  tabla entera: las **8** filas no vacías quedaron en `{milestone,progress,thought}` y las **4**
  vacías siguen vacías. Cero filas matchean ya el `where` de la migración (reejecutarla es no-op) y
  cero filas contienen un valor fuera de `{milestone,progress,thought}`.

> **Por qué ese orden, y no el contrario** (el análisis que decidió la secuencia; se conserva porque
> el mismo patrón reaparece en cualquier migración que cambie el DOMINIO de una columna que la UI
> escribe). Ambos órdenes dejan una ventana muda de unos minutos, pero solo uno se autocura:
>
> - **Código primero, datos después** (lo que se hizo): `notifyFollowersOfPost` filtra por
>   `.contains("notify_events", ["milestone"])` y no matchea nada hasta que corre `20260857`, así
>   que los avisos quedan mudos durante la ventana. El código nuevo lee un array viejo como `[]`,
>   pero la migración posterior lo arregla: **la ventana se cierra sola**.
> - **Datos primero, código después** (descartado): el `parseNotifyCategories` viejo lee un array ya
>   migrado (`["milestone",…]`) como `[]` porque no reconoce ese vocabulario — la campana se pinta
>   con las tres casillas SIN marcar. Si esa persona toca cualquier casilla en ese momento, el
>   formulario viejo escribe de vuelta vocabulario VIEJO sobre una fila ya migrada, y el `where` de
>   la migración solo matchea vocabulario viejo: reejecutarla **no vuelve a arreglar esa fila**. En
>   cuanto aterriza el código nuevo, esa campana queda vacía de forma permanente. Con 8 suscriptores,
>   un solo toque era un octavo de todos ellos.
>
> Queda un riesgo residual, aceptado: en la dirección elegida la campana también se pinta vacía
> durante la ventana (el `parseNotifyCategories` NUEVO tampoco reconoce el vocabulario viejo), así que
> un toggle hecho ahí dentro escribe vocabulario nuevo sobre una fila vieja y la migración posterior
> ya no la toca. Esa persona pierde las categorías que no volvió a marcar. Es **menos** grave que la
> dirección descartada, no inocuo: la fila queda en vocabulario válido y refleja lo último que esa
> persona pulsó, en vez de quedarse permanentemente vacía y sin arreglo posible. Esa asimetría es la
> que decide el orden.
>
> Comprobado después: las 8 filas salieron en `{milestone,progress,thought}`, es decir, **nadie tocó
> la campana dentro de la ventana** — ninguna quedó con un subconjunto.
>
> Foto de reversión de las 8 filas tomada antes de escribir; ya no hace falta, pero si algo se
> tuerce, el estado previo era `{finished,session,episode}` (+ `added` en 6 de las 8).

(El Paso 1 de la Task 7 del plan instruía aplicar las dos a la vez, antes del merge; el plan es
historia congelada y no se toca, pero su instrucción quedó superada por esta secuencia.)

- **`public.notification_type` gana tres valores**: `followed_started`, `followed_dropped`,
  `followed_thought` (`ALTER TYPE … ADD VALUE`, sin borrar nada). Con los tres que ya existían
  (`followed_finished`, `followed_session`, `followed_episode`) cubren uno por `post.kind`. El
  cuarto histórico, `followed_added`, **se conserva pero deja de emitirse**: hay filas vivas en
  `notifications` con ese tipo y borrar un valor de enum en uso no compensa aquí.
- **`follows.notify_events` cambia de dominio**: de `{finished, session, episode, added}` (una
  entrada por HECHO) a `{milestone, progress, thought}` (una entrada por NATURALEZA del post — ver
  §3 de la spec). La migración transforma cada fila que aún hablara el vocabulario viejo:
  `finished`→`milestone`; `session` o `episode`→`progress`; cualquier array no vacío también
  enciende `thought` (decisión deliberada del dueño, ver `decisiones.md`); `added` se pierde sin
  sustituto. Un array vacío se queda vacío. Es idempotente: una fila ya migrada no vuelve a
  matchear el `where` (que exige solapamiento con el vocabulario viejo), así que reejecutarla es
  un no-op seguro. Sin columna nueva — la superficie 6 de `docs/DRIFT-CHECK.md` (grants por
  columna) no aplica aquí; `notify_events` ya trae su grant desde
  `20260804000000_follow_notify_events.sql`.
  **Precisión sobre lo que "añade" la migración** (corregido tras la revisión final de rama del
  2026-08-13, que encontró esto infrarreportado en cuatro sitios — ver `decisiones.md`):
  `thought` es la única CATEGORÍA que se enciende de la nada, sin análogo en el vocabulario viejo.
  `milestone` y `progress` no son traducciones 1-a-1 de una categoría vieja: ENSANCHAN a `post.kind`
  que el vocabulario de cuatro categorías no podía expresar, porque `CATEGORY_FOR_POST_KIND`
  (`src/lib/social/notify-categories.ts`) agrupa varios `kind` bajo la misma categoría. Una fila que
  solo tenía `finished` sale suscrita también a `started` y `dropped` (los tres caen en
  `milestone`); una fila con `session` pero sin `episode` (o al revés) sale suscrita también al
  otro, porque los dos caen en `progress`. Medido al aplicar en prod: las 8 filas no vacías tenían
  las tres viejas (`finished`+`session`+`episode`, y 6 de ellas además `added`), así que las 8
  salieron suscritas a tres tipos de aviso nuevos (`followed_started`, `followed_dropped`,
  `followed_thought`), no a uno solo. (El comentario de cabecera de la migración decía que esas
  filas «solo tienen `finished`» — premisa falsa, corregida el 2026-08-13 al leer la tabla real; la
  conclusión de los tres tipos nuevos sí se sostiene.)
- **El disparo se mueve del hecho al post.** `notifyFollowersOfEvent`, `notifyAdded` y
  `resolvePostInteractionTargetId` (la heurística que adivinaba el post de una sesión/pase/episodio
  ya publicado) desaparecen enteros de `src/lib/social/notify-followers.ts`. El único punto de
  disparo pasa a ser `notifyFollowersOfPost`, llamado desde `createPost`
  (`src/lib/social/post-actions.ts`) — el único sitio del código que inserta en `posts`. El aviso
  siempre lleva `interaction_target_id` del post recién creado; no hay `target_type`/`target_id` ni
  fallback a la ficha del ítem porque ya no hay nada que adivinar.
- **Dos ejes separados**: `notification_type` decide el TEXTO de la campana (uno por `post.kind`);
  `NotifyCategory` (`milestone|progress|thought`, `src/lib/social/notify-categories.ts`) es solo la
  agrupación de suscripción de `follows.notify_events`. `milestone` la disparan `started`/
  `finished`/`dropped`; `progress` la disparan `progressed`/`watched`; `thought` la dispara
  `thought`.
- **Pérdidas aceptadas por el dueño** (ver `decisiones.md`, 2026-08-13): cerrar un pase sin
  publicar no avisa a nadie (autopost apagado); marcar un episodio no avisa a nadie —
  `watched` es un `post.kind` declarado que hoy no crea ningún flujo, issue
  [#626](https://github.com/borjar20/Biblioshare/issues/626); y «añadió a su biblioteca»
  desaparece del todo, sin sustituto.
- **Gap NO documentado en la spec, encontrado en la revisión final de rama**: `maybeAutopostMilestone`
  (lo único que hoy produce un `followed_*` de hito) solo se llama desde `updateStatus`
  (`src/lib/library/manage-actions.ts:18-47`, el gesto deliberado de la ficha). Pero **tres** rutas de
  `src/lib/sessions/actions.ts` escriben `passes.status` llamando a `applyTransition` DIRECTAMENTE,
  sin pasar por `updateStatus`, y por tanto nunca publican ni avisan aunque `autopost_finished` esté
  ON (el default): la primera sesión de un pase `planned` → `in_progress` (`:104`), el `<Select>` de
  estado de la hoja de sesión (`:246-247`) y el auto-cierre al alcanzar la última página/episodio
  (`:289-291`, la única de las tres que sí nombraba la spec §8.1 y esta entrada). Marcar «completado»
  desde la ficha del ítem sigue publicando y avisando bien — el gap es específico de estas tres rutas.
  Issue [#628](https://github.com/borjar20/Biblioshare/issues/628).

## 6. Clubes

`clubs` → `club_members` (rol `member|moderator|owner`, estado `invited|active|requested`),
`club_posts` (+ `club_poll_options`/`club_poll_votes`), `club_reads` (contador de novedades).

Actividades: `club_activities` (enum `activity_kind`: `buddy_read | tierlist |
list_challenge | criteria_challenge | evento`; ciclo `proposed → active → finished |
archived`) con sus satélites `club_activity_items`, `_participants`, `_opinions`,
`_placements`, `_checkpoints`, `_checkpoint_reads`.

**`config` (jsonb) es opaco a la BD**: lo interpreta la app según el `kind`. Ahí viven el
criterio del reto, los tiers de la tierlist y el `completionMode` del reto por lista.

### Hitos de `buddy_read` autodeclarados (dev y prod, 2026-08-05 — issues #470/#471)

Confirmar un hito (`confirm_checkpoint`, SECURITY DEFINER, único camino de escritura a
`club_activity_checkpoint_reads`) **ya no revalida la posición del lector**: exige ser
participante y cascada idempotente sobre los hitos anteriores, nada más. Dos migraciones
encadenadas (`20260826_confirm_checkpoint_lee_passes.sql` y
`20260827_hitos_autodeclarados.sql`):

- **#470** — la RPC original (20260713) leía `library_entries.position`, tabla CONGELADA
  desde el pase-hub: comparaba contra una posición muerta y rechazaba confirmaciones que la
  UI (que lee `passes`) daba por alcanzables. La 20260826 la pasó al pase activo… 
- **#471** — …y la 20260827 eliminó el gate entero: la página objetivo la fijaba el
  moderador según SU edición y cada participante mide en páginas de la SUYA
  (`book_editions.total_pages` varía), así que el mismo número cae en puntos distintos de
  la historia (bloqueo con ediciones compactas, spoilers con ediciones más paginadas).

`club_activity_checkpoints.position` sigue existiendo (jsonb not null) pero como **pista
visual opcional**: `{}` = hito sin pista, y la app ya no compara posiciones
(`hasReachedPosition` eliminada de `src/lib/library/position.ts`). El spoiler guard del
chat no cambia: `can_view_target('activity_checkpoint', …)` sigue exigiendo
`is_activity_participant` **y** `has_reached_checkpoint`.

### Desmarcar un hito, y el gate de `confirm_checkpoint` reordenado (DEV Y PROD, 2026-08-13)

`unconfirm_checkpoint(uuid)`, nueva RPC, SECURITY DEFINER, único camino de borrado de
`club_activity_checkpoint_reads` (la tabla no tiene política de escritura de cliente, a
propósito — `20260713_activity_checkpoints.sql`). Simétrica a `confirm_checkpoint`: donde
confirmar el hito N auto-confirma 1..N, desmarcar el hito N desmarca N..último —
`delete ... where c."order" >= v_order and r.user_id = auth.uid()`. El invariante que
sostiene la simetría: el progreso de cada participante es siempre un tramo CONTINUO desde
el principio; permitir huecos daría estados sin sentido («llegué al 5 pero no al 2») que
además no cambiarían ningún número, porque el tablero de grupo mide por el hito más alto
alcanzado. Solo borra filas del llamante (`r.user_id = auth.uid()`), nunca las de otro
participante. Idempotente: desmarcar dos veces seguidas no falla, la segunda borra cero
filas.

Gate: ser participante (`is_activity_participant`), comprobado PRIMERO — igual que las
cuatro RPC que corrigió `20260831_club_activity_role_gate_first.sql` (issue #129). **No
mira el estado de la actividad**, igual que su gemela `confirm_checkpoint`: la asimetría
sería peor que la permisividad — si puedes marcar un hito en una actividad ya finalizada,
tienes que poder desmarcarlo. Dos códigos: `forbidden` (no participante, o hito
inexistente — con `p_checkpoint_id` que no existe, `v_activity_id` es null y el gate ya da
`false`) y `not_found` (guarda defensiva, inalcanzable con el gate delante; se conserva por
coherencia con las otras cuatro).

`confirm_checkpoint` cambia de orden, no de efecto: comprobaba `not found` ANTES que el
permiso, así que un uuid de hito ajeno revelaba su existencia a quien no participa en esa
actividad — la misma fuga de INFO que #129 cerró en cuatro RPC de `club_activities`. El
gate de participante pasa a ir primero; la cascada 1..N (el cuerpo) **no cambia**. El
código de error se normaliza: `'not found'` → `'not_found'`, para que las dos gemelas
hablen igual.

Migración `20260855_unconfirm_checkpoint.sql`, **aplicada y verificada en DEV y en
PRODUCCIÓN** (2026-08-13). La misma batería en los dos entornos, sembrando dentro de un
bloque que siempre aborta para no dejar basura —comprobado después con un SELECT que no
quedaba ninguna fila—: confirmar el 5º hito crea 5 filas; desmarcar el 3º deja 2;
desmarcar dos veces no falla; los CUATRO casos de alguien ajeno al club dan `forbidden` —
incluido `confirm_checkpoint` sobre un uuid inexistente, que antes daba `not found`; y con
dos participantes, desmarcar uno deja al otro intacto (0 y 3 filas).

**Antes de reemplazar `confirm_checkpoint` se leyó su cuerpo vivo en cada entorno** y se
confirmó que era el de `20260827` en los dos: prod no iba por detrás del repo, así que el
`create or replace` solo reordenó las comprobaciones y añadió `pg_temp`, sin cambiar qué
escribe. Es la comprobación que evita dejar atrasada una función que ya había avanzado por
otra vía.

### `evento` — actividad no participativa (dev y prod, 2026-07-22)

Quinto `kind` de `club_activities`, distinto de los otros cuatro en que **nace `active`
directamente** (nunca pasa por `proposed`) y no tiene pool de ítems ni participantes: sus
filas dejan sin usar `config`, `ends_on`, `spawned_from_*` y los tres satélites
`club_activity_participants`/`_items`/`_opinions` (kind nuevo en vez de tabla nueva,
aplicando SD-8 — ver `decisiones.md`).
"Pasado" se **deriva** de `starts_on < hoy` al leer (`isPastEvent`,
`src/lib/clubs/activities/group-activities.ts`); no hay ninguna transición ni columna que
lo persista.

> **Ampliado el 2026-08-04 por el seguimiento de eventos (§6.1).** Desde entonces un evento
> usa además `starts_at`/`ends_at`/`event_timezone`/`location`/`modality`/`online_url`/
> `event_state`/`updated_at`, y **sí tiene ficha propia**, en `/club/[slug]/evento/[id]`.
> `hasDetailView` sigue siendo `false` porque describe la ruta *genérica* de actividad, que
> continúa devolviendo 404 para eventos. Lo de arriba («solo usa title, description y
> starts_on») queda como historia de la versión de 2026-07-22.

Dos RPCs `SECURITY DEFINER`, moderador+ (`has_min_club_role(club_id, 'moderator')`),
migración `supabase/migrations/20260722_club_event_rpcs.sql`:

- **`create_club_event(p_club_id, p_title, p_description default null, p_starts_on default null) returns uuid`** —
  necesaria porque la política de INSERT de `club_activities` fuerza `status = 'proposed'`,
  y un evento nace `active`.
- **`update_club_event(p_activity_id, p_title, p_description default null, p_starts_on default null)`** — el UPDATE
  que la tabla no tiene (SD-8 la dejó sin política UPDATE, transiciones solo por RPC).
  **Restringida a `kind = 'evento'` y a `status = 'active'`**: sin el filtro de `kind`, esta
  RPC (gateada solo por rol) reabriría la edición arbitraria de cualquier
  `buddy_read`/`tierlist`/`list_challenge`/`criteria_challenge` que SD-8 evitó al no crear
  la política UPDATE; el filtro de `status = 'active'` (añadido durante la implementación,
  no estaba en el diseño original) impide reescribir un evento ya archivado. Archivar
  reutiliza `archive_club_activity` sin tocarla.

**Endurecimiento del 2026-07-29 (issue #133, dev y prod, `20260810_club_event_validacion.sql`
y `20260811_spawn_linked_activity_defaults.sql`).** Cuatro huecos de la misma capa:

- **Las dos RPCs validan ahora la LONGITUD** de título (≤ 120) y descripción (≤ 2000) y
  devuelven `title_too_long`/`description_too_long`. Los números NO son nuevos: son los del
  CHECK que la tabla ya tenía desde `20260715_text_length_limits.sql`
  (`club_activities_title_len` 1..120, `club_activities_description_len` ≤ 2000). El hueco
  era que la RPC no lo comprobaba y dejaba salir un `23514` crudo que el cliente no traduce.
  **La issue daba por hipótesis que el CHECK podía no existir; existe, y en los dos entornos.**
- **`p_description` (y `p_from_item_type`/`p_from_item_id` de `spawn_linked_activity`) tienen
  `default null`.** Sin default, el generador de tipos los marcaba no-nulables aunque la
  función aceptara NULL a propósito, y cada call site necesitaba un `as string` mintiendo
  sobre el tipo. Efecto lateral asumido: Postgres exige default en todo parámetro posterior
  a uno con default, así que `p_starts_on` también lo lleva — el guard `starts_on_required`
  de la propia RPC, y la validación de cliente, cubren lo que el tipo dejó de cubrir.
- **Los errores de dominio de estas dos RPCs pasaron a snake_case** (`not_found`,
  `not_an_event`, `event_not_active`, `title_required`, `starts_on_required`), que es la
  convención que ya usaban el cliente y `spawn_linked_activity`. Ningún consumidor los
  mapeaba (la UI los captura en bloque), así que el cambio no rompió nada.
- **`finish_club_activity` rechaza `kind = 'evento'`** (`events cannot be finished`). El
  comentario de `update_club_event` afirmaba como invariante que un evento nunca pasa a
  `finished`, pero **nada lo forzaba**: la RPC solo miraba estado y rol. No era alcanzable
  desde la UI (`finishActivity` solo se llama desde la ficha de actividad, y un evento no
  tiene ficha: `hasDetailView: false`), pero sí por la puerta de atrás. Ahora el invariante
  es del esquema, no del comentario.

**Endurecimiento del 2026-08-06 (issue #129, dev y prod, `20260831_club_activity_role_gate_first.sql`).**
El gate de rol (`has_min_club_role`) se evaluaba DESPUÉS de los checks de existencia/kind/estado
en `update_club_event`, `set_club_event_state`, `finish_club_activity` y `archive_club_activity`.
Como son `SECURITY DEFINER`, cualquier `authenticated` (sin ser miembro) distinguía por el mensaje
de error si un uuid existía, si era un evento y si estaba activo — un oráculo sobre lo que la RLS de
SELECT (`club_activities select member`) protege. Ahora el rol va PRIMERO: con la fila inexistente
`has_min_club_role(null, …)` es `false` y el no-autorizado recibe `forbidden` genérico. Solo tras
pasar el gate (= eres moderador del club dueño, que ya puede ver la fila) se revela kind/estado.
`finish_club_activity` usa `coalesce(v_created_by = auth.uid(), false)` para su rama creador-O-mod
(un `null = uuid` daría NULL y dejaría pasar el gate). `create_club_event` ya comprobaba rol primero
desde `20260823`, no se tocó.

El enum se añade en `supabase/migrations/20260722_activity_kind_evento.sql`, sola en su
fichero porque Postgres prohíbe usar un valor de enum en la misma transacción que lo añade.

**Aplicadas en dev (`supabase-dev`) el 2026-07-22.** *Corregido aquí el 2026-08-04*: esta línea
decía «prod queda pendiente» y ya no era cierto — al preparar §6.1 se leyó `pg_proc` de PROD y
las dos RPC estaban allí con su firma de julio (4 argumentos). Desde el 2026-08-04 tienen en los
dos entornos la firma ampliada de 10 (ver §6.1).

### 6.1 Seguimiento de eventos: `club_event_followers` (dev y **prod**, 2026-08-04)

Un miembro **sigue** un evento para declarar interés, ver quién más lo sigue y recibir un
recordatorio antes de que empiece. Spec:
`docs/superpowers/specs/2026-08-04-club-event-following-design.md`.

**El evento gana los datos que su ficha necesita** (columnas nuevas en `club_activities`,
todas con sentido solo cuando `kind='evento'`, SD-8 intacto):

| Columna | Tipo | Nota |
|---|---|---|
| `starts_at` | `timestamptz` | El instante real. Única fuente para programar recordatorios |
| `ends_at` | `timestamptz` | Fin opcional; decide «en curso» vs «finalizado» |
| `event_timezone` | `text` NOT NULL DEFAULT `'Europe/Madrid'` | Nombre IANA, validado contra `pg_timezone_names` en la RPC |
| `location` | `text` | ≤ 200 (`club_activities_location_len`) |
| `modality` | `event_modality` | `presencial` · `online` · `hibrida` |
| `online_url` | `text` | ≤ 500 (`club_activities_online_url_len`), debe ser `http(s)://` |
| `event_state` | `club_event_state` NOT NULL DEFAULT `'programado'` | `programado` · `cancelado` · `pospuesto` |
| `updated_at` | `timestamptz` | Lo pone un trigger, nunca el cliente |

Más el CHECK `club_activities_event_window` (`ends_at >= starts_at`).

**«En curso» y «finalizado» NO se guardan**: se derivan del reloj en `deriveEventState`
(`src/lib/clubs/activities/event-state.ts`). Solo se persisten los tres estados que una
*persona declara*. Un estado guardado es un estado que hay que mantener sincronizado.

**`starts_on` se queda y lo deriva un trigger** (`private.sync_club_event_date`), no una
columna generada: `timezone(text, timestamptz)` es `STABLE`, no `IMMUTABLE`, y Postgres
rechaza una `GENERATED` que la invoque. Así **ninguna** consulta del calendario cambió.
*Backfill:* los eventos anteriores reciben `starts_at = starts_on` a las **19:00
`Europe/Madrid`** — hora inventada y asumida a la vista.

**La tabla:**

```sql
club_event_followers (
  activity_id  uuid → club_activities(id) on delete cascade,
  user_id      uuid → auth.users(id)      on delete cascade,
  followed_at            timestamptz not null default now(),
  remind_minutes_before  integer,      -- null = sin recordatorio (una elección)
  reminder_due_at        timestamptz,  -- DERIVADO por trigger
  reminded_at            timestamptz,  -- sello de entrega = la idempotencia
  primary key (activity_id, user_id)
)
```

La **PK compuesta es** la restricción única de «un usuario sigue una vez» *y* el índice de
«seguidores de este evento». Más `club_event_followers_user_idx (user_id, activity_id)` y el
índice parcial `club_event_followers_due_idx (reminder_due_at) where reminded_at is null`
para el barrido.

`reminder_due_at` es la **única desnormalización**, y está justificada: el barrido corre cada
5 min sobre todos los clubes y con el instante precalculado es una búsqueda por índice.
No puede derivar porque nadie lo escribe a mano — lo recalculan
`private.sync_event_follower_reminder` (en la fila de seguimiento) y
`private.reschedule_event_reminders` (cuando el evento cambia de fecha, zona o estado).
Un cambio de `starts_at` pone `reminded_at = null`: re-arma el aviso, incluso uno ya
entregado, porque quien recibió «mañana a las 18:00» necesita saberlo si pasa al jueves.

**Coherencia (no hay cola ni proceso de reconciliación):** el recordatorio es un *campo* de
la fila de seguimiento, mantenido en la misma transacción. No hay dos escrituras que puedan
quedar desparejadas, así que no puede existir un seguidor sin recordatorio ni al revés.

**Abandonar el club / ser expulsado: se INVALIDA, no se borra.** El barrido y las lecturas
hacen `join club_members` exigiendo `status='active'`, así que un seguimiento sin membresía
activa es inerte — en un solo sitio, sin triggers sobre la membresía. Si vuelve, su interés
sigue ahí.

**RLS y grants.** `select` para miembros activos del club del evento (mismo gate que el
calendario; **la lista de seguidores es de los miembros aunque el club sea público** —
privacidad primero, §12 del encargo). **Sin política de escritura**, a propósito: todo por
RPC. Las 8 columnas nuevas de `club_activities` llevan su `grant` por columna (issue #375;
verificado con la superficie 6 de `DRIFT-CHECK.md`, que sigue dando las mismas 10 tablas).

**RPCs** (`20260823_club_event_following_rpcs.sql`):

- `follow_club_event(p_activity_id, p_remind_minutes_before default 10080)` — `on conflict
  do update`: **idempotente y a prueba de carrera**. El default pasó de 1440 a 10080 (una
  semana) en `20260852_event_reminder_default_1w.sql`, junto con el auto-seguimiento del
  organizador dentro de `create_club_event` — son los DOS sitios que lo codifican en SQL, y
  el segundo no pasa por esta RPC. En la práctica manda `DEFAULT_REMINDER_MINUTES` (TS): la
  capa de acciones siempre envía el valor explícito.
- `unfollow_club_event(p_activity_id)` — idempotente; permitido **siempre**, incluso en un
  evento cancelado o pasado.
- `set_club_event_reminder(p_activity_id, p_remind_minutes_before)` — exige seguirlo ya
  (`not_following`).
- `set_club_event_state(p_activity_id, p_state)` — moderador+.
- `claim_due_event_reminders(p_limit, p_activity_id)` y `release_event_reminders(...)` —
  **solo `service_role`**. La primera reclama y devuelve en la MISMA sentencia (`skip
  locked`): dos barridos solapados no entregan el mismo aviso dos veces. La segunda es la
  compensación si la entrega falla.
- `create_club_event` / `update_club_event` **cambian de firma** (10 argumentos): se hizo con
  `DROP` + `CREATE`, no con overload — una llamada de 4 argumentos con las dos firmas vivas
  quedaría ambigua (42725). Con `DROP` + `CREATE` el bundle anterior sigue resolviendo por
  defaults, que es lo que hace segura la regla «migración primero, merge después».

`private.valid_event_reminder` acota el offset a `{null, 0, 15, 60, 1440, 10080}` — los
mismos seis que ofrece `REMINDER_OPTIONS` en TS, con una prueba que lo fija.

**`notifications.actor_id` pasa a NULLABLE** (`20260825_notifications_system_actor.sql`) y el
CHECK se relaja a `actor_id is null or user_id <> actor_id`. Un recordatorio lo emite el
*sistema*, no una persona. Se intentó evitarlo poniendo al organizador como actor y falló por
dos sitios: el CHECK dejaba **sin aviso justo al organizador** que sigue su propio evento
(23514), y la campana decía «Marta te avisa» cuando Marta no había hecho nada. Tres valores
nuevos de `notification_type`: `club_event_reminder`, `club_event_updated`,
`club_event_cancelled`.

**El planificador** (`20260824_club_event_reminder_scheduler.sql`) — primer trabajo programado
del repo, ver §6.2.

**Aplicado y verificado en dev** el 2026-08-04 (12 checks de impersonación: idempotencia,
extraño rechazado, privacidad de la lista, cancelar/reprogramar/evento pasado, expulsión,
reclamo atómico y compensación) **y en PRODUCCIÓN** el mismo día, comprobando allí las firmas
de las 9 RPC (una sola por nombre, sin ambigüedad), la tabla con su política e índices, el
`actor_id` nullable con su CHECK relajado, el job activo, el backfill de los 2 eventos reales
a las 19:00 `Europe/Madrid`, y la superficie 6 de `DRIFT-CHECK.md` (mismas 10 tablas de
referencia: `club_activities` NO aparece, o sea que sus 8 columnas nuevas tienen su grant).

### 6.2 El planificador: `pg_cron` + `pg_net` (dev y **prod**, 2026-08-04)

El repo **no tenía ningún trabajo programado** y la issue #394 lo dejó escrito como decisión
de plataforma pendiente, prohibiendo expresamente resolverlo «escribiendo al renderizar».

```
pg_cron (cada 5 min) → private.dispatch_event_reminders()   [SQL, lee Vault]
                     → pg_net.http_post con cabecera secreta
                     → POST /api/cron/event-reminders        [Node, en Vercel]
                     → notifyMany() + sendPushToUsers()      [lo que YA existe]
```

**Por qué no Vercel Cron:** la cuenta es Hobby, donde un cron corre una vez al día y a hora
no garantizada — incompatible con «15 minutos antes». **Por qué salta a HTTP:** firmar VAPID
es `web-push`, o sea Node; un job que solo insertara filas llenaría la campana sin enviar
ningún push. Reutiliza `notifyMany`, no duplica el sistema de notificaciones.

**Error de puntualidad, explícito:** un recordatorio se entrega entre 0 y 5 minutos DESPUÉS
de su momento teórico, nunca antes.

**Los dos secretos van en Vault, una vez por entorno** (no están en git, y sin ellos la
función avisa por `raise warning` y no despacha nada):

```sql
select vault.create_secret('https://<host-de-prod>', 'app_base_url');
select vault.create_secret('<mismo valor que CRON_SECRET en Vercel>', 'cron_secret');
```

Y `CRON_SECRET` como variable de entorno en Vercel. La ruta compara en tiempo constante y
responde **503 si la variable falta** (cerrada, no abierta) y 401 sin cabecera válida.

**Dos trampas confirmadas al ponerlo en producción, y las dos cuestan una hora si no se saben:**

1. **La URL tiene que ser el ALIAS DE PRODUCCIÓN, no el de la rama.** La protección de
   despliegue del proyecto está en `all_except_custom_domains` y no hay dominio propio, así
   que `biblioshare-git-main-*.vercel.app` devuelve **302** al muro de SSO de Vercel y la
   petición nunca llega a la ruta. `biblioshare-nine.vercel.app` sí llega. Queda anotado en la
   descripción del propio secreto `app_base_url`.
2. **Cambiar `CRON_SECRET` en Vercel exige REDEPLOY.** Mientras no se redespliega, la ruta
   sigue respondiendo 503 aunque la variable ya esté guardada.

**Verificado funcionando en producción el 2026-08-04** (issue #434, cerrada): `cron.job_run_details`
da `succeeded` cada 5 minutos en punto y `net._http_response` da **200** con
`{"claimed":…}` — incluida una respuesta cuyo `created` coincide al milisegundo con el
`end_time` de una ejecución del cron, o sea disparada por el job y no a mano. Los `claimed: 0`
de las primeras son correctos: todavía no hay eventos seguidos con recordatorio vencido.

Esto **no cierra #394** (el aviso de turno de ronda sigue por construir) pero le retira el
bloqueo: el mecanismo queda montado y §7.17 puede colgarse del mismo job.

### La ronda — latido semanal de club (dev y **prod**, 2026-08-04)

Tabla propia, **no** un `kind` de `club_activities` — a propósito y contra SD-8, con el
argumento completo en `decisiones.md` (2026-08-03) y en la spec
`docs/superpowers/specs/2026-08-03-club-rondas-design.md` §1. Migración
`supabase/migrations/20260803_club_rounds.sql`.

`club_rounds`: `id`, `club_id` (FK a `clubs`, `on delete cascade`), `period_key` (semana ISO
`IYYY-"W"IW` de `timezone('Europe/Madrid', now())`, calculada en SQL — el cliente nunca la
manda), `author_id` (FK a `auth.users`, `on delete set null`; NULL = consigna de la casa),
`prompt` (`char_length` 1..500), `item_type`/`item_id` (par polimórfico sin FK, igual que
`club_activity_items`; `num_nonnulls` fuerza los dos NULL o los dos con valor),
`created_at`. **`unique (club_id, period_key)`**: quien escribe primero define la ronda del
periodo — sin lock, lo resuelve el índice.

Cuatro valores de enum nuevos: `target_kind.club_round`,
`notification_type.club_round_proposed|club_round_commented|club_round_liked`.

RLS activa, **dos políticas, sin INSERT ni UPDATE** — la única puerta de escritura es
`ensure_club_round()` (`SECURITY DEFINER`), y una ronda es inmutable (sus respuestas
contestan a ESA pregunta):
- `club rounds select members` (`select`, `authenticated`) — solo miembros del club, con
  independencia de `clubs.visibility` (SD-4).
- `club rounds delete moderators` (`delete`, `authenticated`) — moderador+
  (`has_min_club_role`), para retirar una consigna abusiva antes de que se quede una semana
  entera arriba.

Dos triggers:
- `club_rounds_sync_interaction_target` (`after insert`) → registra el target canónico
  (`kind = 'club_round'`), owner `coalesce(author_id, clubs.owner_id)` (la casa no es un
  usuario y `owner_id` es `not null`), audiencia `club_member`, href
  `/club/{slug}?ronda={period_key}`, comentable y reaccionable.
- `club_rounds_cleanup_social_target` (`after delete`) → `private.cleanup_social_target`
  genérico: reportes, target, comentarios, reacciones y avisos.

Cuatro funciones, todas con `search_path = ''` y `revoke`/`grant` explícitos (mismo patrón
que el resto de RPC del repo):
- `private.club_now()` — la hora del servidor en `Europe/Madrid`, no UTC (con UTC la semana
  cambiaría a las 02:00 del lunes en verano). Sin costura de inyección para forzar el día en
  test — ver Pendiente más abajo.
- `private.house_prompt(club_id, period_key)` — 10 consignas fijas en SQL, índice
  determinista `hashtext(club_id || period_key)` (casteado a `bigint` antes de `abs()` para
  no desbordar en el valor más negativo de `int4`). `execute` revocado incluso a
  `authenticated`: el cliente nunca la llama directo.
- `public.get_club_round_state(club_id) returns table(period_key, day_index, holder_id,
  round_id, round_author, round_prompt, round_item_type, round_item_id, house_prompt)`
  (`SECURITY DEFINER`) — periodo y día ISO actuales, titular por rotación aritmética sobre
  miembros activos (`(semanas desde clubs.created_at) % nº miembros`), la ronda existente si
  la hay, y `house_prompt` (la consigna de la casa PENDIENTE de materializar, solo si
  `day_index >= 3` y aún no hay ronda). Puerta de membresía a mano (`is_club_member`) porque
  es `SECURITY DEFINER`.
- `public.ensure_club_round(club_id, prompt default null, item_type default null, item_id
  default null) returns uuid` (`SECURITY DEFINER`) — único camino de escritura. Con
  `prompt`: exige ser el titular si el periodo sigue libre; si ya hay ronda devuelve la
  misma solo cuando el autor coincide con quien llama, si no `round_already_open`. Sin
  `prompt`: materializa la consigna de la casa, solo desde el día 3, idempotente sin
  condición — la carrera entre dos respuestas simultáneas la resuelve el `unique`
  (`insert … on conflict do nothing` + relectura de la fila ganadora si perdimos).

**Verificado en dev (`tyvzpuhxfwxrnkcpzxyg`) el 2026-08-04** contra objetos reales
(`information_schema.columns`, `pg_policy`, `pg_trigger`, `pg_proc`, `pg_enum`), nunca
contra `list_migrations`: las 8 columnas, las 2 políticas, los 2 triggers, las 4 funciones
(`get_club_round_state` ya con las 9 columnas de salida, `house_prompt` incluida) y los 4
valores de enum, todos presentes y con la forma exacta del fichero de migración.

**Producción: APLICADA Y VERIFICADA el 2026-08-04** (`vmutcradmodhiltuohys`), en **una sola**
llamada con el fichero consolidado y **antes** de mergear el código — al revés la página de
todos los clubes habría reventado, porque `RoundBlock` llama a `get_club_round_state` en
cada render. Verificado contra objetos reales (`pg_class`, `pg_policy`, `pg_trigger`,
`pg_constraint`, `pg_enum`, `pg_proc`, `pg_proc.proacl`), **nunca contra
`list_migrations`**: tabla con RLS activa, las dos políticas (`select` de miembros y
`delete` de moderador+) y **ninguna** de `insert`/`update`, los dos triggers, las seis
restricciones, los cuatro valores de enum y las cinco funciones con `search_path` fijado —
las dos RPC públicas `security definer`, las dos de `private` no. Privilegios correctos:
`get_club_round_state` y `ensure_club_round` quedan en `{postgres, authenticated,
service_role}`, **sin `anon` ni `PUBLIC`**, y `club_now`/`house_prompt` solo en `postgres`.
Advisors de seguridad **66 → 68**: los dos nuevos son
`authenticated_security_definer_function_executable` para esas dos RPC, la misma categoría
ya aceptada para las otras 41 del proyecto; **ninguno** en la categoría `anon`, lo que
confirma que los `revoke` surtieron efecto.

El `drop function if exists` que precede a `get_club_round_state` fue un no-op en este
apply (prod no tenía la función); está ahí para el próximo cambio de columnas de salida.

Dato histórico de dev: la migración llegó allí en
**cuatro** entradas sucesivas, no tres — corregido aquí tras verificar
`supabase_migrations.schema_migrations` (el dato de partida de esta sesión decía tres):
`club_rounds` (tabla + RLS + triggers + los 4 valores de enum), `club_rounds_functions` (las
cuatro funciones, `get_club_round_state` todavía sin `house_prompt`),
`club_rounds_functions_fixes` (mismo día: corrige `ensure_club_round`, que devolvía la ronda
existente sin comprobar autoría cuando alguien proponía tarde — `round_already_open` no se
lanzaba nunca) y `club_rounds_house_prompt_column` (`drop function` + `create function` de
`get_club_round_state` para añadir la columna, obligado porque `create or replace` no puede
cambiar la lista de columnas de salida de una función `returns table`). El fichero que vive
en `supabase/migrations/20260803_club_rounds.sql` ya está consolidado en una sola pasada con
la forma FINAL: aplicarlo a prod tal cual, como fichero único, es correcto y no necesita
reproducir el `drop`+`create` — prod nunca pasó por la forma intermedia de
`get_club_round_state` que lo obligó en dev. Decisión de despliegue en `decisiones.md`
(2026-08-03).

**Pendiente, con issue:** el camino de la consigna de la casa no tiene cobertura
automática de test (depende del día real de la semana); `resolveTargetHrefs` toma
`targetType` como `string` en vez de una unión de tipos; faltan los avatares del titular y
de quién ya ha respondido. Detalle de cada una en las issues abiertas (ver `backlog.md`).

### 6.1.1 Huecos «Sin ronda» en el histórico — `list_club_round_weeks` (dev y prod, 2026-08-14)

Issue #403. `listRoundHistory` (`src/lib/clubs/rounds/history.ts`) listaba las últimas N
**rondas que existen**, no las últimas N **semanas de calendario**: una semana muerta
(nadie propuso, nadie respondió a la consigna de la casa — §2.4, sin fila hasta que alguien
la responde) desaparecía de la lista en vez de mostrar un hueco «Sin ronda» en su sitio
cronológico.

`public.list_club_round_weeks(p_club_id uuid, p_weeks int default 4) returns
table(period_key, round_id, author_id, prompt)` (`SECURITY DEFINER`, migración
`supabase/migrations/20260814_club_round_history_weeks.sql`) genera la serie de semanas ISO
**en SQL** (`generate_series` sobre `date_trunc('week', private.club_now())`, `left join`
a `club_rounds`) — nunca en TypeScript: es la misma razón por la que el periodo actual
tampoco se calcula ahí (decisión del 2026-08-03). `round_id` (y `author_id`/`prompt`) `NULL`
= esa semana no tiene ronda. Recortada a partir de la semana de nacimiento del club
(`date_trunc('week', timezone('Europe/Madrid', clubs.created_at))`, mismo cálculo que la CTE
`turno` de `get_club_round_state`) para que un club joven no enseñe huecos de semanas
anteriores a su propia creación. `SECURITY DEFINER` porque necesita llamar a
`private.club_now()` (revocada a `authenticated`); el gate de socio se pone a mano con
`is_club_member()`, igual que `get_club_round_state` — sin fila si quien llama no es socio
(silencio, no excepción; la puerta de verdad la pone la página).

`listRoundHistory` llama a esta RPC y traduce cada fila a `RoundHistoryEntry` (`prompt:
null` en los huecos); `getInteractionSummary` solo recibe los `round_id` no nulos, nunca uno
inventado para una semana sin fila real en `club_rounds`. `RoundHistory` pinta
`t("historyEmptyWeek")` («Sin ronda») en vez del prompt cuando es `null`, y omite el
recuento de respuestas en esa fila.

**Verificado en dev y prod contra objetos reales (`pg_proc`, nunca `list_migrations`)**:
función presente en `public`, `SECURITY DEFINER`, `language sql`, `search_path` fijado a
`''`; privilegios `EXECUTE` en `{postgres, authenticated, service_role}`, sin `anon` ni
`PUBLIC`. Comportamiento probado con clubes desechables (creados y borrados en la misma
sesión, sin dejar rastro): club antiguo con hueco a propósito en la semana -3 devuelve
exactamente ese patrón (`round_id` presente en -1/-2/-4, `NULL` en -3); club recién creado
(`created_at` = esta semana) devuelve **cero filas**, no huecos fantasma antes de existir;
llamar como no-socio (o sin sesión) también devuelve cero filas.

### 6.2 «Pensamiento»: tabla `thoughts` — SUPERSEDIDA y RETIRADA (dev y **prod**, 2026-08-09)

> **⚠️ HISTÓRICO.** La tabla `thoughts` se **absorbió en `posts`** (§5.1) y se **eliminó de dev y
> prod el 2026-08-09** (migración `20260847`, `to_regclass('public.thoughts')` = null en ambos).
> Un pensamiento es hoy un `posts` con `kind='thought'`. Los valores de enum muertos (`'thought'`
> en `target_kind`, `thought_commented`/`thought_liked` en `notification_type`) se dejan inertes
> (recrear el tipo es caro). Lo de abajo describe el modelo ORIGINAL, ya no vigente; se conserva
> por el *porqué*.

> Diseño completo en `docs/superpowers/specs/2026-08-06-pensamientos-post-design.md`. Esta
> sección documenta la Fase 2 (esquema); Fases 3-5 (feed como 6ª fuente, compositor
> dedicado, tarjeta/hilo con markdown-lite) y la Fase 6 (e2e + cierre documental) están
> **completas en este branch** — la feature funciona de extremo a extremo en dev. Migraciones
> `20260834_thoughts_enum_values.sql` (los tres valores de enum, en transacción propia —
> `ALTER TYPE … ADD VALUE` no puede usarse en la misma transacción que consume el valor) y
> `20260835_thoughts.sql` (tabla, trigger, RLS, grants). **Aplicada en PROD el 2026-08-07**
> y reverificada contra objetos reales: `to_regclass('public.thoughts')` no nulo,
> `enum_range(null::thought_anchor_type)` con los 5 valores, `'thought'` en `target_kind`,
> `thought_commented`/`thought_liked` en `notification_type`, 3 triggers, 4 policies con RLS
> activo, grants por columna idénticos a dev (5 con `INSERT`, 2 con `UPDATE`, 8 con `SELECT`)
> y `get_advisors(security)` sin ningún hallazgo nuevo sobre `thoughts`. El código que la usa
> se despliega al mergear el PR (migración-primero-luego-merge respetado).

Un **Pensamiento** es el primer contenido **autoral** del feed personal: hasta ahora
`getFeed` es fan-out on-read puro (toda tarjeta se deriva de una acción previa — alta de
pase, sesión, actividad de club…), y un Pensamiento existe solo porque alguien lo escribió.
Copia la forma de `club_activities`/`club_rounds`: tabla autoral que se engancha al feed y
al sistema de interacciones por la vía estándar.

`thoughts`: `id`, `user_id` (FK a `auth.users`, `on delete cascade`), `anchor_type`
(`thought_anchor_type`: `book|movie|series|saga|person`), `anchor_id` (uuid, **sin FK SQL**
— polimórfico sobre cinco tablas distintas, misma renuncia pragmática que `saga_items`; la
integridad la garantiza `createThought` resolviendo el ancla antes del insert, Fase 4),
`body` (`char_length` 1..2000), `is_spoiler` (default `false`), `created_at`, `updated_at`
(trigger `thoughts_set_updated_at` → `set_updated_at()`). Dos índices:
`thoughts_user_id_created_at_idx` (feed por autor) y `thoughts_anchor_idx (anchor_type,
anchor_id)` (para «pensamientos sobre esta entidad», superficie de lectura fuera de v1).

**`interaction_targets` gana la clase `thought`** (`target_kind`, 9→10 valores) vía el
trigger resolutor `private.sync_thought_interaction_target()` (`after insert on thoughts`,
mismo patrón que `sync_club_round_interaction_target`): `owner_id = user_id`, audiencia
`profile`/`user_id` (igual que `pass`/`progress_session` — visible a quien pueda ver el
perfil del autor, sin alcance de club), `commentable`/`reactable` = `true`, y los dos
valores nuevos de `notification_type` (`thought_commented`, `thought_liked` — nombrados
como el resto de pares `<entidad>_commented`/`<entidad>_liked`, no como el borrador inicial
de la spec). El `href` apunta a la ficha del ancla (un pensamiento no tiene página propia,
igual que `progress_session` usa la página del ítem): `/libro/`, `/pelicula/`, `/serie/`,
`/saga/` o `/persona/` + `anchor_id`. `thoughts_cleanup_social_target` (`after delete`) usa
el `private.cleanup_social_target('thought')` genérico: cascada de target, comentarios,
reacciones y avisos; `content_reports` conserva snapshot con `target_deleted_at`.

RLS: `select` con `can_view_profile(user_id)` (mismo criterio que las demás fuentes del
feed); `insert`/`update` solo el dueño (`user_id = auth.uid()`); **`delete` el dueño O un
admin global** (política `thoughts delete own or moderate` → `private.can_moderate_target(
'thought', id)`, que para un pensamiento —audiencia `profile`, sin club— resuelve a
autor+admin; se añadió la rama `'thought'` a `private.social_target_owner_id`, cerrando
#525 — migración `20260836_thoughts_delete_moderate.sql`, **aplicada en dev el 2026-08-07 y
en PROD el 2026-08-07**, verificada contra `pg_policy`/`pg_get_functiondef`). Sin política
de club porque un pensamiento no tiene una. Matriz mínima en
`supabase/tests/thoughts_rls.sql` (patrón de `social_phase1_interaction_targets.sql`):
dueña inserta/ve el suyo, un tercero sin relación de follow no lo ve (ni el target
canónico), un seguidor aceptado lo ve y puede comentarlo por la vía canónica, un no-dueño
no puede escribirlo (RLS filtra la fila, no lanza excepción) y borrarlo se lleva en cascada
el target y sus comentarios. Las cinco aserciones pasaron en dev el 2026-08-06.

**Grants por columna (#375, DRIFT-CHECK superficie 6):** `id`/`created_at`/`updated_at`
generadas (sin grant de escritura); `user_id`/`anchor_type`/`anchor_id` inmutables tras el
insert (grant de `INSERT`, no de `UPDATE`); `body`/`is_spoiler` editables. La superficie 6
corrida en dev el 2026-08-06 confirma `thoughts` con 8 columnas / 5 con `INSERT` / 2 con
`UPDATE` — el mismo patrón intencionado que `passes`/`progress_sessions`, no un hueco.

**Verificado en dev el 2026-08-06** contra objetos reales, nunca contra `list_migrations`:
`to_regclass('public.thoughts')` no nulo, `enum_range(null::thought_anchor_type)` con los
cinco valores, `'thought'` presente en `enum_range(null::target_kind)`, y `get_advisors`
(seguridad) sin ningún hallazgo nuevo sobre `thoughts`.

**Tipos TS:** `database.types.ts` regenerado y acotado a las adiciones de esta fase (el
regen completo arrastraba reformateos y drift preexistente ajeno — comentarios a mano en
RPCs de eventos de club, orden de funciones — que se descartó a propósito). Como
`NotificationType`/`TargetType` en `src/lib/social/` son uniones literales manuales, no
inferidas del esquema, ampliar el enum de la BD sin ampliarlas rompía `tsc` de inmediato
(`interaction-actions.ts`, `interaction-targets.ts`): se añadió `"thought"` a `TargetType` y
`"thought_commented"`/`"thought_liked"` a `NotificationType` (+ sus entradas obligatorias en
`NOTIFICATION_TYPE_KEY` y en `NOTIFICATION_CATEGORY` de `src/lib/push/types.ts`, categoría
`social` — mismo criterio por contenido que `review_commented`/`activity_liked`). Las
claves de copy (`thoughtCommented`/`thoughtLiked`) ya tienen cadena en `messages/es.json`
desde que la Fase 5 (tarjeta e hilo) las dispara de verdad — huérfanas solo mientras no
existía compositor ni hilo de comentarios de Pensamientos.

**Fuera de alcance v1** (documentado en la spec; issues abiertas en Fase 6 — ver
`backlog.md`): «pensamientos sobre esta entidad» en la ficha del ítem/saga/persona (el
índice `thoughts_anchor_idx` ya está listo para esa lectura); edición/borrado desde la
tarjeta más allá de lo que ya permite la RLS; una sola ancla por pensamiento en v1.

**Fase 6 (2026-08-07, SOLO EN DEV):** e2e `e2e/thoughts.spec.ts` — publicar anclado a un
libro de biblioteca con spoiler y `**negrita**`, comentar, reaccionar con 🔥 en post y
comentario, recargar y comprobar que persiste; repite el anclaje (solo el chip) con saga y
persona. Spec escrita y committeada; **no se pudo ejecutar en este entorno** (worktree sin
`.env.local`: faltan `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`TEST_USER_*`,
y `.claude/launch.json` apunta a un `dev.cmd` en `D:\` que no existe en esta máquina — el
`next dev` de Playwright arranca pero cada ruta revienta al crear el cliente de Supabase).
Queda como entregable ejecutable por quien tenga esas credenciales, no como verificación ya
hecha.

### 6.3 Tipos de evento: `club_event_type` + `config` por tipo (SOLO EN DEV, 2026-08-09)

> Diseño en `docs/superpowers/specs/2026-08-09-tipos-de-evento-design.md`. Migraciones
> `20260840_club_event_type_enum.sql`, `20260841_club_event_type_column.sql` y
> `20260842_club_event_typed_rpcs.sql`, **aplicadas y verificadas en dev**; producción
> pendiente del merge del bundle (migración primero, merge después, §10 de la spec).

Un evento (§6, `kind='evento'`) deja de ser un único formato: gana un discriminador
`event_type` y usa el `config` jsonb —ya opaco a la BD para toda actividad, §6— para los
campos propios de cada tipo, sin columnas por subtipo ni actividad nueva. Decisión de forma
en `decisiones.md` (2026-08-09).

**Enum y columna:**

| Qué | Detalle |
|---|---|
| `club_event_type` (enum) | `encuentro \| lanzamiento \| fecha_destacada`, en su propia transacción (`20260840`) — mismo motivo que `activity_kind` en 2026-07-22: Postgres prohíbe usar un valor de enum recién creado en la misma transacción que lo crea. |
| `club_activities.event_type` | `club_event_type NOT NULL DEFAULT 'encuentro'` (`20260841`). El DEFAULT hace el backfill gratis para los eventos existentes (todos eran Encuentro, lo único creable hasta hoy), **pero se aplica a la tabla entera**: un `buddy_read`/`tierlist`/`list_challenge`/`criteria_challenge` también recibe `event_type = 'encuentro'` sin que signifique nada — la app trata `eventType` como significativo SOLO cuando `kind='evento'`; el mapper de `ClubActivity` (`src/lib/clubs/activities/core.ts`) lo devuelve `null` para los demás kinds. |
| Grant | Por columna, idéntico a `modality`: `SELECT`/`INSERT`/`UPDATE`/`REFERENCES` para `anon`, `authenticated` y `service_role` (issue #375, DRIFT-CHECK superficie 6). |

**Forma de `config` por tipo** (opaca a la BD; tipada y validada en TS por
`parseEventConfig`, `src/lib/clubs/activities/event-types.ts` — tolerante a formas viejas o
corruptas para que un jsonb raro no reviente una ficha):

```jsonc
// encuentro → sin config; usa las columnas ya existentes (location/modality/online_url/…)
{}

// lanzamiento
{
  "item":        { "itemType": "book" | "movie" | "series", "itemId": "<uuid catálogo>" },
  "releaseType": "estreno_temporada",   // vocabulario por medio, event-release-types.ts
  "platform":    "netflix",             // opcional, solo movie/series
  "region":      "España",              // opcional, texto libre
  "allDay":      true
}

// fecha_destacada
{
  "relations": [
    { "kind": "item",     "itemType": "book", "itemId": "<uuid>" },
    { "kind": "activity", "activityId": "<uuid de club_activities del MISMO club>" }
  ],
  "allDay": true
}
```

`config.item` y `config.relations[].itemId` son referencias polimórficas **sin FK** al
catálogo (mismo trato que `passes`, §3): `forbid_delete_with_passes` NO las cubre, así que
borrar la obra puede dejar la referencia colgando — el display degrada con gracia (omite la
relación irresoluble), pero el ref queda muerto (issue
[#546](https://github.com/borjar20/Biblioshare/issues/546), `tipo:deuda`).

**«Todo el día» (hora opcional) y el cambio de comportamiento de Encuentro:**
`create_club_event`/`update_club_event` (`20260842`, `DROP`+`CREATE` como ya usaba la firma
de 10 argumentos — no overload, para que el bundle anterior siga resolviendo por defaults)
ganan `p_event_type` (solo en `create`; `update` lee el tipo de la fila y no lo cambia) y
`p_config jsonb`. `p_starts_time` es **opcional en todos los tipos**, pero el default sin hora
DIFIERE por tipo: en **Lanzamiento/Fecha destacada** una hora ausente hace el evento de «todo
el día» — `starts_at` se ancla a `00:00` en `p_timezone` del día `starts_on` y `config.allDay =
true` registra el hecho para el display (no se puede derivar de forma fiable de `starts_at`,
porque medianoche es una hora legítima). Los renderizadores reciben el booleano `allDay` ya
calculado por los loaders, nunca leen `config` crudo.

**Encuentro conserva el comportamiento heredado: la hora es opcional y sin ella se asume las
19:00** (`coalesce(p_starts_time, '19:00')` en `create`; en `update`, la hora vieja de la fila o
19:00). Es el mismo default que usó el backfill de §6.1 al añadir `starts_at`, y **no hay guarda
`starts_time_required`**: un Encuentro sin hora sigue siendo válido, como antes de los tipos de
evento. Encuentro nunca es «todo el día» (siempre tiene una hora, real o asumida).

**Aplicado y verificado en dev** el 2026-08-09 contra objetos reales: `pg_proc` devuelve una
sola firma por nombre de `create_club_event`/`update_club_event` (12 y 11 argumentos), la
firma de 10 argumentos anterior ya no existe, `to_regtype('public.club_event_type')` no es
nulo, y `information_schema.column_privileges` para `event_type` es idéntico al de
`modality`. **Producción pendiente del merge.**

### 6.4 Progreso en lote de la pestaña Actividades: `get_activities_progress()` (DEV Y PROD, 2026-08-12)

> Spec: `docs/superpowers/specs/2026-08-12-actividades-club-rediseno-design.md` (D3). Migración
> `20260853_activities_progress.sql`. Decisión de forma en `decisiones.md` (2026-08-12).

RPC `stable security definer` que calcula el progreso de N actividades **en una sola
consulta** — antes la pestaña Actividades no podía enseñar progreso en la lista de tarjetas
porque hubiera hecho falta una llamada por tarjeta. Firma:

```sql
get_activities_progress(p_activity_ids uuid[])
returns table (
  activity_id uuid, kind text,
  collective_done int, collective_total int,
  viewer_done int, viewer_total int,
  participants int
)
```

**Gate: `is_club_member(club_id)`** — deliberadamente MÁS ANCHO que el de
`get_list_challenge_progress` (`is_activity_participant`): la tarjeta de progreso la ve
**todo el club**, no solo quien participa, porque el número colectivo («6 de 9 han
terminado») es justo la señal que ayuda a decidir si unirse. Es el mismo criterio que ya
regía los checkpoints de `buddy_read` (visibles a todo el club, no solo a participantes). Lo
que NO se ensancha es el detalle: la función devuelve exclusivamente **contadores
agregados**, nunca quién ha completado qué, y `viewer_done`/`viewer_total` son siempre del
propio `auth.uid()` del llamante, jamás de un tercero.

Cálculo por `kind` (CTEs `buddy`/`list`/`tier` de la migración):

- **`buddy_read`**: `collective_done` replica el «hito seguro del grupo» que ya calcula
  `getActivityCheckpoints` (`checkpoints.ts:112`) — el MÍNIMO, entre participantes, del
  MÁXIMO `order` alcanzado por cada uno (+1 porque `order` es 0-based; -1/nadie llegado da
  0). Se replica esa definición exacta, no una parecida, para que no aparezcan dos números
  distintos con el mismo nombre en dos pantallas. `viewer_done` cuenta los
  `club_activity_checkpoint_reads` propios.
- **`list_challenge`**: mismo criterio de «completado» que `get_list_challenge_progress` —
  modo `window` exige `finished_on` dentro de `activity_window()`; modo `any` exige el pase
  activo y `completed`, sin mirar fechas.
- **`tierlist`**: «ha votado» = al menos una fila propia en `club_activity_placements`;
  colocar un solo ítem cuenta como haber empezado, no como haber terminado la tierlist.

**`evento` y `criteria_challenge` quedan fuera de la CTE `visibles`, a propósito**
(`kind not in ('evento', 'criteria_challenge')`): `evento` no es participativo y no tiene
progreso (§6); `criteria_challenge` sí lo tiene, pero su conteo depende del criterio
(género/saga) evaluado sobre el catálogo y **no es una consulta** — vive en
`countForChallenge` (`src/lib/challenges/match.ts`). Reescribirlo en SQL sería un segundo
motor de conteo que puede divergir del que ya usa la ficha de la actividad; la capa de app
(`getActivitiesProgress`, `src/lib/clubs/activities/progress.ts`) resuelve esas actividades
con el motor que ya existe, una llamada por actividad, acotado al grupo «En curso». Esa
misma función de app documenta en cabecera que **nada de esta cadena lleva `use cache`**:
`viewer` depende de `auth.uid()`, así que una entrada compartida serviría el progreso de un
miembro a otro (regla #437 de `AGENTS.md`).

**Aplicada y verificada en DEV y en PRODUCCIÓN el 2026-08-12** contra objetos reales
(`pg_proc`: `prosecdef=true`, `provolatile='s'`, `proconfig=search_path=public`; ACL
`authenticated/postgres/service_role`, **sin `anon`**), nunca contra `list_migrations`.

En dev, la aritmética se verificó con datos sintéticos sembrados en una transacción con
`rollback` —incluido el caso que distingue el «mínimo de los máximos» de un `max` mal puesto:
con A en el último hito y B sin leer nada, `collective_done` debe dar **0**, no el total—.

En producción se comprobó con datos reales: sin sesión devuelve **cero filas** (el gate no deja
pasar nada al rol de servicio), y con sesión simulada de un miembro real devuelve solo la
actividad de SU club, con números coherentes contra los conteos crudos (`buddy_read` de 4
hitos: colectivo 2/4, del viewer 4/4, 2 participantes). Las actividades de otro club dan
`is_club_member = false` y no devuelven fila.

El advisor de seguridad la marca con un WARN `authenticated_security_definer_function_executable`.
Es **intencionado**: la función existe justo para dar a un miembro autenticado un agregado que
la RLS no le dejaría calcular, y el WARN lo comparten las demás RPC `security definer` del
proyecto. Lo que sí importaba —no aparecer bajo `anon_security_definer_function_executable`— se
verificó y no aparece.

### 6.5 Editar título, descripción y fechas de una actividad ya creada: `update_activity_details` (DEV Y PROD, 2026-08-12)

> Spec: `docs/superpowers/specs/2026-08-12-editar-actividades-design.md`. Migración
> `supabase/migrations/20260854_update_activity_details.sql`. Issue #596. Decisiones de forma
> en `decisiones.md` (2026-08-12).

RPC `security definer`, firma:

```sql
update_activity_details(
  p_activity_id uuid, p_title text, p_description text,
  p_starts_on date, p_ends_on date
) returns void
```

Edita **`title`, `description`, `starts_on` y `ends_on`** de la cabecera de una actividad de
club. Es la primera escritura de cliente sobre esa cabecera (`club_activities` no tiene
política UPDATE, a propósito, desde `20260713_club_activities.sql:196`).

**Quién:**

- **Moderador+ del club, siempre.**
- **El creador que no modera, SOLO mientras la actividad está en `proposed`.** Mientras nadie
  la ha aprobado, la actividad es de quien la propuso; en cuanto el club la activa hay gente
  apuntada y progreso contándose, así que pasa a ser un compromiso del club y la gobierna la
  moderación — el creador que no modera deja de poder corregir hasta una errata de su propio
  título. Justificación completa en `decisiones.md` (2026-08-12).

**Hasta cuándo:** `proposed` y `active`. **`finished` y `archived` quedan CONGELADAS**
(`dates_frozen`): la ventana `starts_on..ends_on` alimenta `activity_window()`, que decide qué
lecturas cuentan en los retos, y mover esa ventana en algo ya terminado reescribiría el
historial de quién completó qué.

**Los eventos (`kind = 'evento'`) quedan fuera** (`use_update_club_event`): ya tienen
`update_club_event` (§6), que además maneja hora, zona, modalidad y enlace. Dos RPC
escribiendo los mismos campos divergirían en silencio en cuanto una de las dos se olvidara de
actualizar.

Códigos de error, en el orden en que la función los evalúa (el orden es diseño, no casualidad
— ver el fallo de seguridad más abajo):

1. `forbidden` — **el gate de rol, y va PRIMERO** (#129, ver abajo). No eres el creador ni
   moderador+ del club dueño. Con la fila inexistente, `v_club_id` y `v_created_by` son nulos,
   así que también cae aquí: quien no está autorizado recibe `forbidden` y **no aprende nada**,
   ni si el uuid existe ni de qué tipo es.
2. `not_found` — la fila no existe. **Inalcanzable hoy**, precisamente porque el gate va antes:
   se conserva como guarda defensiva, igual que en las cuatro funciones hermanas de
   `20260831`. Si algún día el gate deja de cubrir el caso nulo, esto lo recoge.
3. `forbidden` (segunda vez) — eres el creador pero NO moderador, y la actividad ya no está en
   `proposed`. Va antes que `dates_frozen` a propósito: si no, quien intente editar una
   finalizada sin permiso creería que el problema es el momento, cuando además le falta el
   permiso.
4. `use_update_club_event` — es un evento. Solo se revela **después** de autorizar.
5. `dates_frozen` — estado `finished`/`archived`.
6. `title_required` — título vacío tras `btrim`.
7. `invalid_range` — `p_ends_on < p_starts_on` (solo se rechaza la ventana INVERTIDA; una
   fecha de fin en el pasado es válida — cerrar hoy una lectura con la fecha en que de verdad
   terminó es un uso normal).

**Consecuencia para la interfaz:** quien no puede ver la fila por RLS recibe `forbidden`, NO
`not_found`. Un formulario que traduzca `not_found` como «esta actividad ya no existe» está
escribiendo un mensaje que nadie verá.

**Fallo de seguridad corregido antes de aplicar en ningún sitio real (commit `eec82b0e`):**
la primera versión del código comprobaba el permiso (código 3) DESPUÉS de revelar si la fila
existía (código 1) y de qué `kind` era (código 2). Como es `security definer`, cualquier
`authenticated` que no fuera miembro del club podía distinguir por el código de excepción
devuelto si un uuid existía y si era un evento — fuga de información, no de escritura. **Era
una REGRESIÓN de algo ya arreglado en este repo**: `20260831_club_activity_role_gate_first.sql`
(issue #129) corrigió exactamente este patrón en `update_club_event`, `set_club_event_state`,
`finish_club_activity` y `archive_club_activity`. El plan de esta RPC lo reintrodujo sin
querer. Se corrigió copiando ese mismo patrón: el gate de rol (`v_created_by <> auth.uid() and
not v_is_mod`) va PRIMERO, con `coalesce(...)` para que un creador NULL (fila inexistente) no
cuele por un `null = auth.uid()` que da NULL en vez de `false`. **Regla que queda para
cualquier RPC nueva sobre `club_activities`: el gate de rol va PRIMERO, siempre** — leer
`20260831_club_activity_role_gate_first.sql` antes de escribir la siguiente.

**Aplicada y verificada en DEV y en PRODUCCIÓN el 2026-08-12**, con la versión corregida
(gate de rol primero, commit `eec82b0e`). En prod: `prosecdef=true`,
`proconfig=search_path=public`, ACL `authenticated/postgres/service_role` **sin `anon`**,
verificado contra `pg_proc` y nunca contra `list_migrations`.

Los tres casos que motivaron el arreglo se corrieron **contra producción**, y fue la primera
ejecución real del cuerpo corregido en cualquier entorno. Los tres dan `forbidden`, y los tres
desde el **primer** gate (línea 27 de la función), que es lo que se estaba comprobando:

- extraño al club + actividad normal existente → `forbidden`
- extraño al club + actividad `evento` existente → `forbidden` (aquí estaba la fuga: antes
  daba `use_update_club_event` y le revelaba el `kind` a quien no podía ni ver la fila)
- extraño al club + uuid inexistente → `forbidden`

Si alguno diera un código distinto, la fuga seguiría. En dev se comprobó el tercero, que es el
que distingue la versión corregida de la vieja (antes daba `not_found`).

**Trampa al montar esta prueba, para quien la repita:** el primer intento usó un usuario que
resultó ser **owner** del club dueño del evento, así que recibió `use_update_club_event` — y
eso es correcto, no una fuga. Hay que asegurarse de que el usuario simulado NO tiene membresía
en el club de la actividad; en prod no había ninguno, así que se simuló la sesión con un uuid
que no pertenece a nadie (al gate le da igual quién seas: comprueba la membresía).

## 7. Sagas

`sagas` es **jerárquica** (`parent_saga_id`): las subsagas son sagas reales anidadas.
`saga_items` da la pertenencia (multi-membresía, con `is_primary`). El «Mapa de lectura» que ve el
lector se DERIVA de la curación (§7.7): las tablas `saga_nodes`/`saga_edges` y la función
`save_saga_graph` que antes lo guardaban a mano **ya no existen** — retiradas por completo en la
fase 3 (§7.7, `20260729_drop_saga_graph.sql`, aplicada a dev y a producción el 2026-07-27).

**⚠️ El progreso de una saga ya NO depende del orden — regla vigente desde el 2026-07-25/26
(fase 1 del orden unificado, §7.4).** Hasta entonces el denominador *era* el orden principal:
`createMainOrder` (`src/lib/sagas/main-order.ts`) producía una lista y `computeProgress` contaba
sobre ella. Ahora el denominador sale de la **pertenencia**: `countedKeys`
(`src/lib/sagas/progress.ts`) cuenta, deduplicadas por `item_type:item_id`, las obras del
subárbol que **no** estén marcadas `optional` (ver §7.4 para el modelo completo). `main-order.ts`
se queda solo con la **ordenación para pintar** (timeline, expansión de bloques dentro de un
itinerario) — ninguna suma cuelga ya de él.

Acoplar el denominador a la curación produjo cuatro fallos con una sola causa, que este cambio
cierra por construcción en vez de parchear uno a uno: **#91** (la regla estaba duplicada; el
hero decía 2/7 donde la card decía 2/5), **#170** (nodos huérfanos: contaban en el denominador
pero no se pintaban, así que el avance no podía llegar nunca al 100%), **#185** (`main-order.ts`
tenía dos ramas que se contradicen — con grafo, lo no numerado no cuenta; sin grafo, cuenta
todo — y la rama que esta misma sección documentaba aplicaba a 1 saga de 70) y el **0/0 de
Mundodisco** (26 nodos sin `order_no` → orden principal vacío → hero sin progreso y timeline
vacío, con miembros reales de sobra).

La exclusión de nodos huérfanos que introdujo #170 **sigue viva**, pero desde la fase 1 solo
afecta a la **presentación** (qué se pinta en el timeline/grafo), nunca al número: la asimetría
de #185 en la ORDENACIÓN (no en el cómputo) sigue sin resolver y queda abierta como issue — ya no
puede descuadrar el progreso porque el progreso no la mira.

**Columnas de `saga_items`** (verificado contra `information_schema.columns` de prod el
2026-08-06; el doc solo las tenía en prosa dispersa —`role` en §7.3, `placement` en §7.4,
`optional` en §7.10— y reconstruirlas obligaba a perseguir tres `ALTER`):

| columna | tipo | null | default | notas |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | |
| `saga_id` | `uuid` | NO | — | |
| `item_type` | `item_type` (enum) | NO | — | |
| `item_id` | `uuid` | NO | — | |
| `position` | `integer` | SÍ | — | hueco en la secuencia curada |
| `created_at` | `timestamptz` | NO | `now()` | |
| `is_primary` | `boolean` | NO | `false` | membresía principal (multi-membresía) |
| `role` | `saga_item_role` (enum) | SÍ | — | §7.3, issue #167 |
| `placement` | `saga_placement` (enum) | SÍ | — | `fijo`/`libre`, §7.4 |
| `optional` | `boolean` | NO | `false` | §7.10, opcionales saltables |

Unique vigente: `(saga_id, item_type, item_id)` (`saga_items_saga_item_key`) — el antiguo
`saga_items_item_key` sobre `(item_type, item_id)` se retiró al abrir la multi-membresía.

### 7.1 Escritura de `saga_items` (issue #169)

`saga_items` tuvo el INSERT abierto a cualquier `authenticated` **a propósito**, porque el
enriquecimiento automático de colecciones TMDB escribe con el cliente del usuario al abrir
una ficha. Desde `20260722_saga_items_rls_hardening.sql` ese camino pasa por dos funciones
`SECURITY DEFINER` **acotadas a sagas TMDB** (`source = 'tmdb'` y `tmdb_collection_id` no
nulo) y las tres operaciones de escritura exigen ya `collaborator`:

| función | qué hace |
|---|---|
| `link_tmdb_saga_item(p_saga_id, p_item_id)` | alta de una película en su colección; resuelve `is_primary` y el reintento ante carrera |
| `sync_tmdb_saga_items(p_saga_id, p_items)` | rellenado perezoso: **solo inserta lo que falte**; una fila que ya existe no se toca (ni `position` ni `placement`) — ver §7.4b |

**Aplicada en dev y en prod el 2026-07-22**, en ese orden y con el código ya desplegado
(deployment `dpl_3eLcrm…`, commit `76e1bbf`): cerrar el INSERT con el código viejo en pie
habría roto la hidratación TMDB para los usuarios sin rol. Verificado contra `pg_policies` y
`pg_proc` en ambos entornos, no contra `list_migrations` — mismo `md5` del cuerpo normalizado
en dev y prod, `prosecdef`, `search_path` y ACL correctos (sin `anon`).

**El cuerpo de `sync_tmdb_saga_items` se reemplazó — `create or replace` — en
`20260726_saga_items_placement_writers_fix.sql` (§7.4), en dos revisiones sobre el mismo fichero:
la primera (23514) hizo que el `INSERT`/`ON CONFLICT` fijara `placement='fijo'` siempre que
`position` no fuera nulo, tanto en el alta como en la actualización — pero eso todavía dejaba el
`ON CONFLICT ... DO UPDATE` pisando `position`/`placement` de cualquier fila existente sin
condición. `link_tmdb_saga_item` no tenía el mismo problema (nunca escribe `position`) y se dejó
sin tocar. **Este `create or replace` está aplicado en dev y en prod (2026-07-26)** — mismo estado pendiente que el resto de
§7.4, no un despliegue independiente: el `md5` del cuerpo normalizado YA NO coincide entre dev y
prod hasta que el orquestador aplique esta migración.

#### 7.1b La curación manual gana sobre el sync de TMDB (2026-07-26)

**Bug**: `populateTmdbCollection` (`src/lib/sagas/get-saga.ts`) se dispara al abrir la ficha de
CUALQUIER saga TMDB, para cualquier lector (no hace falta ser curador). Si una fila ya existía en
`saga_items`, tanto `planCollectionSync` (`src/lib/sagas/collection-sync.ts`, comparaba solo
`position`) como el `ON CONFLICT ... DO UPDATE` de `sync_tmdb_saga_items` la trataban como
corregible, así que una curación manual (p. ej. marcar una película como `placement='libre'` →
`position=NULL`) se revertía sin avisar en cuanto alguien visitaba la ficha. Reproducido en dev
con «Matrix - Colección»: curar Matrix 1 a `position=null, placement=libre` y abrir la ficha lo
devolvía a `position=1, placement=fijo`.

**Decisión del dueño del producto**: la curación manual gana. **Regla**: el sync SOLO rellena
huecos (altas nuevas); una fila que ya existe en `saga_items` no se toca, ni en `position` ni en
`placement`, la traiga o no `p_items`.

**Dónde se implementó (los dos escritores, por separado y con razón)**:
- **RPC `sync_tmdb_saga_items`** (`20260726_saga_items_placement_writers_fix.sql`, revisión
  2026-07-26): `ON CONFLICT ... DO NOTHING` en vez de `DO UPDATE`. Es la barrera real — función de
  BD, `SECURITY DEFINER`, y la única que protege también a un cliente desplegado con la lógica
  vieja (el arreglo surte efecto sin esperar deploy de código).
- **`planCollectionSync`** (`src/lib/sagas/collection-sync.ts`): ya no calcula `toUpdate` en
  absoluto — el tipo `CollectionSyncPlan` solo tiene `toInsert`. No tiene sentido que el cliente
  pida una corrección que la RPC va a ignorar.

**Consecuencia asumida y deliberada**: si TMDB reordena una colección más adelante, ese reorden ya
NO se propaga a las filas existentes de `saga_items` — ni siquiera a las que nunca tocó un
humano, porque no hay forma fiable de distinguir "nunca curada" de "curada a propósito". Ver
también `docs/requirements/decisiones.md`.

### 7.2 Itinerarios de lectura: `saga_routes` / `saga_route_entries` / `saga_route_choices`

Un **itinerario** es una secuencia curada (opcionalmente parcial) de obras y bloques-subsaga
dentro de una saga. Tres tablas:

- `saga_routes` — metadatos de la ruta curada (`slug`, `name`, `summary`, `position`). Los
  slugs `lectura` y `publicacion` están RESERVADOS (`saga_routes_slug_not_reserved`): esas dos
  son **sintéticas**, se calculan sobre el grafo/orden principal y no tienen fila aquí — una
  fila para ellas sería una segunda fuente de verdad que resincronizar en cada edición del
  grafo (la familia de fallo del issue #91).
  - **`is_reading_order`** (boolean, `not null default false`; fase 4, 2026-07-28) — el curador
    DESIGNA cuál de sus itinerarios ocupa el puesto y la etiqueta de «Orden de lectura» en la
    ficha; con uno designado, la ruta sintética `lectura` deja de ofrecerse. **Uno como mucho por
    saga**, y lo impone el unique parcial `saga_routes_reading_order_key` (`saga_id`
    where `is_reading_order`). La fila **NO se renombra** en BD: la etiqueta la pone
    `buildRouteList` — `saga_routes.name` no tiene unique, así que renombrarla dejaría dos chips
    con el mismo texto en cuanto alguien la desdesignara. Sin backfill a propósito: designar
    cambia la vista POR DEFECTO de esa saga y no se hace en nombre del curador.
- `saga_route_entries` — los pasos: `route_id`, `position` (único por ruta), **XOR**
  `(item_type, item_id)` / `child_saga_id` (una obra o un bloque-subsaga, nunca los dos), y
  `note` (`text` nullable, `CHECK (note is null or char_length(note) <= 200)`, la nota del paso;
  una cadena vacía `''` cuenta como sin nota, ver `count-route-entries.ts`). Columnas reales en
  prod: `id`, `route_id`, `position`, `item_type`, `item_id`, `child_saga_id`, `note`, `created_at`.
  Guardado por **full-replace atómico** vía RPC `save_saga_route(p_route_id, p_entries)`
  (`SECURITY DEFINER`, gate `collaborator+` interno) — nunca se escribe fila a fila desde el
  cliente. **Desde el 2026-07-29 (issue #176, `20260809_save_saga_route_valida_subarbol.sql`,
  dev y prod) la RPC valida también la PERTENENCIA**: calcula el subárbol de la saga en
  servidor (recursiva sobre `sagas.parent_saga_id`, partiendo de `saga_routes.saga_id` — la
  saga real de la ruta, no la que diga el cliente) y rechaza con `foreign block` un
  `child_saga_id` que no esté en él (o que sea la propia saga) y con `foreign item` una obra
  que no pertenezca a ninguna saga del subárbol. Antes esa comprobación vivía SOLO en
  `validateRouteDraft`, contra un `descendantIds` que llegaba del cliente: se validaba
  contra un dato que el atacante controla. `validateRouteDraft` sigue existiendo y sigue
  siendo optimista (da mensajes concretos en el editor sin roundtrip), pero ya no es la
  única. Verificado sobre los datos reales antes de endurecer: **cero** entradas fuera del
  subárbol en dev y en prod, así que no rompe ningún itinerario existente.
- `saga_route_choices` — preferencia del LECTOR (qué ruta ha adoptado para esa saga), por
  `slug` no por `route_id` (así una ruta borrada degrada sola al orden por defecto). RLS
  solo-dueño, **sin** gate de rol: es preferencia personal, no curación.

**`saga_route_entries_item_key` / `saga_route_entries_child_key`** (Task 9, 2026-07-22):
uniques **parciales** — `(route_id, item_type, item_id) WHERE item_id IS NOT NULL` y
`(route_id, child_saga_id) WHERE child_saga_id IS NOT NULL` — que impiden repetir la misma obra
o la misma subsaga dentro de un itinerario. Mismo patrón que protegía `saga_nodes` cuando esa tabla
aún existía (`saga_nodes_item_key` / `saga_nodes_child_key`; la tabla se retiró por completo en la
fase 3, §7.7). Sin ellos, dos pasos idénticos colisionaban en
la key de React del editor y el estado de plegado se asociaba al bloque equivocado; la Task 1
omitió este par al crear la tabla. `validateRouteDraft` (`src/lib/sagas/validate-route-draft.ts`)
ya rechaza duplicados en el borrador, así que esta garantía es la del esquema, no la única.

**Aplicadas en dev y en prod el 2026-07-22.** Las dos migraciones de itinerarios
—`20260723_saga_routes.sql` (crea `saga_routes` / `saga_route_entries` / `saga_route_choices` y la
función `save_saga_route`) y `20260723_saga_route_entries_uniques.sql` (los dos uniques parciales
de arriba)— se aplicaron a prod **antes** de mergear la rama. Verificadas contra los objetos
reales en ambos entornos (`pg_tables`, `pg_policies`, `pg_indexes`, `pg_proc`), no contra
`list_migrations`: 3 tablas, 5 políticas, 2 índices únicos parciales, y el mismo `md5` del cuerpo
normalizado de `save_saga_route` en dev y prod, con `prosecdef` correcto.

Ambas son **puramente aditivas**: crean tablas, índices y una función nuevos, sin
`ALTER`/`DROP`/`REVOKE` sobre ningún objeto existente. A diferencia del caso de #169 (§7.1), no
tenían dependencia de orden con el despliegue del código — de hecho, si el código hubiera llegado
antes, `getSagaRoutes`/`getRouteChoice` desestructuran `{ data }` e ignoran `error`, así que las
tablas ausentes habrían degradado a `[]`/`null` y la feature simplemente no habría aparecido.

### 7.3 Rol narrativo: `saga_items.role` (issue #167)

Columna nueva, **ortogonal a `position`**: `position` dice si el ítem tiene hueco fijo en el orden
principal (`NULL` = sin hueco fijo); `role` dice **qué es** dentro de esta saga concreta. Un miembro
puede tener las dos, una sola, o ninguna — son dos ejes independientes, no dos formas de decir lo
mismo.

```sql
-- Enum original (2026-07-23). AMPLIADO Y RECORTADO en la fase 5 del timeline
-- con estados, ver el bloque «Fase 5» al final de esta seccion.
create type public.saga_item_role as enum ('precuela', 'spin_off', 'relato', 'paralela');
alter table public.saga_items add column role public.saga_item_role;
```

- **Nullable, sin default, sin backfill.** `NULL` = "sin clasificar" — no "opcional" ni ningún otro
  valor implícito. Backfillear los `position IS NULL` existentes habría escrito en la BD una decisión
  editorial (qué obra es precuela/spin-off/etc.) que nadie tomó; buena parte de esos nulls son
  descuido de curación, que es literalmente la queja del issue.
- **Por saga, no por ítem**: el unique de `saga_items` sigue siendo `(saga_id, item_type, item_id)`,
  así que un libro puede ser precuela en una saga y obra principal en otra.
- **No toca el denominador del progreso** (hoy `countedKeys` en `src/lib/sagas/progress.ts`, ver
  §7.4 — en el momento de aplicar esta migración era `main-order.ts`, pero el criterio "el rol es
  puramente semántico y no debe entrar en el cómputo" no cambió al mudarse el denominador). Ver
  `decisiones.md` (issue #167) — es la familia de fallo del #91 si algún día se acoplaran.
- Hereda la RLS de `saga_items` sin trabajo adicional (SELECT público, escritura `collaborator+`,
  §7.1); las funciones `SECURITY DEFINER` de TMDB siguen insertando sin mencionar la columna y
  obtienen `NULL`.

**Aplicada en dev y en prod el 2026-07-23** (migración `20260723_saga_item_role.sql`), y anexada a
`supabase/schema-baseline.sql` en la misma pasada que la aplicación a producción — «aplicar» y
«anexar» como dos pasos separados ya desincronizó el baseline dos veces (notas de 2026-07-14 y
2026-07-17).

Verificada **contra los objetos reales, no contra `list_migrations`**: en ambos entornos la columna
sale en `pg_attribute` con tipo `saga_item_role`, `attnotnull = false` y `atthasdef = false`, y el
enum sale en `pg_enum` con los cuatro valores en el orden `precuela, spin_off, relato, paralela`. En
prod: **327 filas en `saga_items`, 0 con `role`** — el «sin backfill» comprobado en el dato, no solo
en la intención del DDL.

#### Fase 5 del timeline con estados (2026-07-28): el vocabulario se amplía y pierde `paralela`

```sql
-- 20260806_saga_item_role_ampliado.sql — aplicada en dev Y EN PROD el 2026-07-28
alter type public.saga_item_role add value if not exists 'novela_corta';
alter type public.saga_item_role add value if not exists 'companero';
alter type public.saga_item_role add value if not exists 'crossover';

-- 20260807_saga_item_role_sin_paralela.sql — aplicada SOLO EN DEV el 2026-07-28
-- (guarda `raise exception` si hubiera filas `paralela`, rename + create + alter
-- column + drop del tipo viejo)
```

**Las dos migraciones están aplicadas en dev y en PROD** (2026-07-28). La segunda entró **después**
del despliegue del bundle de la fase 5, no antes, y ese orden era el punto: retirar un valor es la
dirección peligrosa —el bundle viejo seguía ofreciendo «Paralela» en el `<select>` del editor, y
guardarlo habría reventado el cast de `save_saga_sequence` con un `22P02`—. Mismo baile que la
sobrecarga del RPC en las fases 2b y 4 (#217, #224). Issue #237, cerrada.

Verificado en prod tras aplicar, contra los objetos reales: `pg_enum` da los **seis** valores,
`saga_item_role_viejo` no existe, `saga_items.role` tiene el tipo nuevo, y las **8 filas con rol
siguen ahí** con el mismo reparto (4 `relato`, 3 `precuela`, 1 `spin_off`). Y comprobado también por
el camino real: una ficha de prod con rol curado pinta su barra de filtro y su cinta, o sea que la
lectura de la columna a través de PostgREST sobrevivió a la recreación del tipo.

- **Vocabulario del repo y de dev (6):** `precuela, novela_corta, relato, spin_off, companero,
  crossover`. El orden del enum recreado es el de LECTURA, el mismo que `src/lib/sagas/roles.ts`;
  nada ordena datos por él.
- **`principal` no existe**, y no por olvido: es exactamente lo que hoy es `role = null`, y darle un
  valor propio serían dos formas de decir lo mismo — la familia del #91 en pequeño. Por eso el filtro
  de la ficha ofrece siempre «Todos» en vez de un chip «Principal» como dibuja el mockup.
- **El `nexo` del mockup se llama aquí `crossover`**: «nexo» ya nombra el grupo de miembros directos
  del universo (`groupSagaId is null`, el punto beige de la leyenda), y usarlo como rol dejaría dos
  «nexos» distintos en la misma pantalla.
- **`companero` NO cambia el cómputo.** El mockup dice de él «sin progreso de lectura; se abre, no se
  termina», y se descarta a sabiendas: `progress.ts` sale de la fase como entró. Es una etiqueta, no
  un eje nuevo del denominador.
- **[MEDIDO 2026-07-28, antes de tocar nada]** prod: **367 filas** en `saga_items`, **8 con rol** (4
  `relato`, 3 `precuela`, 1 `spin_off`) y **0 `paralela`** — por eso la retirada no pierde dato
  curado. **`saga_items.role` es la única columna del tipo** en todo el esquema (`pg_attribute`) y
  **`save_saga_sequence/7` su único consumidor** (`pg_proc`).
- **Recrear el tipo no rompe el RPC**: es `plpgsql` con `prosqlbody is null`, o sea cuerpo **sin
  parsear**, así que el cast `(e->>'role')::public.saga_item_role` se resuelve **por nombre en
  ejecución** y no por OID. No hay que recrear la función. Verificado además ejecutando el cast con
  los valores nuevos tras la recreación.

### 7.4 Colocación y opcionalidad: `placement` / `optional` (fase 1 del orden unificado)

Fase 1 de 3 de un spec mayor —
`docs/superpowers/specs/2026-07-25-sagas-orden-unificado-design.md`— que reemplaza los tres
sistemas de orden que hoy coexisten (lista numerada, grafo, itinerarios) por uno solo. Esta fase
**no** toca esa unificación todavía: solo introduce el modelo de dos ejes nuevos y desacopla el
progreso del orden. El arreglo de `assignItemToSaga`/#188 que originalmente se planeó para la fase
2 se adelantó al review final de esta misma rama (commit `e3832ff`, ver más abajo) — lo único que
falta de esa fase es aplicar las migraciones a prod, que ya no depende de ningún arreglo de código.
Fase 2a (el editor único de secuencia, §7.5), fase 2b (`saga_placement_windows`,
la ventana de una entrada `libre`, §7.6) y fase 3 (el mapa se deriva de la curación, y
`saga_nodes`/`saga_edges`/`save_saga_graph` se retiraron por completo, §7.7) **ya están construidas
y desplegadas — la unificación del orden queda cerrada** (ver §7.7 y `backlog.md`).

**Dos ejes ORTOGONALES, y ésa es la distinción que toda la fase existe para establecer:**

| | cuenta en el progreso | no cuenta (`optional`) |
|---|---|---|
| **`fijo`** (hueco numerado) | el caso normal | un spin-off con hueco propio que no se quiere exigir |
| **`libre`** (se lee cuando quieras) | *p. ej. una novela puente que sí se cuenta* | *p. ej. un relato suelto que no se cuenta* |

`placement` dice **dónde** se lee (`fijo` = tiene hueco numerado; `libre` = en cualquier momento;
`null` = sin clasificar). `optional` dice **si cuenta** en el progreso. Una obra puede ser libre y
contar, o fija y no contar — la doc no debe volver a presentarlos como un solo eje, que es
justo la confusión que #167 dejó sin resolver del todo (`role`, §7.3, es un **tercer** eje,
ortogonal a los otros dos: qué *es* la obra).

```sql
create type public.saga_placement as enum ('fijo', 'libre');

alter table public.saga_items
  add column placement public.saga_placement,   -- nullable: null = sin clasificar
  add column optional boolean not null default false,
  add constraint saga_items_placement_position check (
    case when placement = 'fijo' then position is not null else position is null end
  );
```

**El CHECK es un `CASE`, no un `OR` de tres ramas — corregido en el review final de la rama
(2026-07-26).** La primera versión escrita era el `OR` de arriba con las tres ramas comentadas, y con
`placement IS NULL` las dos primeras ramas dan `NULL` (no `FALSE`) y la tercera `FALSE`, así que el
`OR` entero da `NULL` — un CHECK solo rechaza `FALSE`, así que colaba `(placement=NULL,
position=7)`, justo lo que "sin clasificar nunca lleva número" prohíbe. Dev llegó a tener una fila
así. El `CASE` no tiene ese agujero: un `WHEN` que no da `TRUE` (`NULL` incluido) cae al `ELSE` en
vez de propagar el `NULL`. Con esta forma sí vale `placement='fijo' ⇔ position is not null`.

Mismos tres atributos, aplicados al **bloque-subsaga entero** dentro de su padre (tapa el hueco
que deja retirar el editor de grafo en fase 3: hasta la fase 3, la colocación de una subsaga vivía
en `saga_nodes.child_saga_id`+`order_no` si el padre tenía grafo —tabla retirada por completo en
esa misma fase, §7.7—, o se deducía del menor `position` de sus miembros si no):

```sql
alter table public.sagas
  add column position_in_parent integer,
  add column placement_in_parent public.saga_placement,
  add column optional_in_parent boolean not null default false,
  add constraint sagas_placement_position check (
    case when placement_in_parent = 'fijo' then position_in_parent is not null else position_in_parent is null end
  ),
  -- Una saga raíz no está colocada en ningún sitio: sin esto, "sacar del
  -- universo" dejaría restos en las tres columnas.
  add constraint sagas_placement_needs_parent check (
    parent_saga_id is not null or
    (position_in_parent is null and placement_in_parent is null and optional_in_parent = false)
  );
```

**El progreso deja de mirar el orden** (ver también §7, arriba): el denominador sale de
`countedKeys` (`src/lib/sagas/progress.ts`) — las obras del subárbol que **no** estén marcadas
`optional`, deduplicadas por `item_type:item_id`, sin mirar `position` ni itinerarios — ni, mientras
existió, `saga_nodes` (tabla retirada por completo en la fase 3, §7.7). Un bloque
`optional_in_parent` saca a los suyos del denominador de **su padre**, pero
no del suyo propio (abrir la ficha de un spin-off `optional` y ver su propio progreso, no 0/0, es
lo que un lector espera). `libre` no afecta al progreso, solo dice dónde se lee. Lo "sin
clasificar" **cuenta** — la deuda de curación se ve, no se descuenta a escondidas.

**Backfill, medido contra el dato real de cada entorno — dev y prod NO tienen el mismo tamaño de
catálogo, y las dos filas siguientes no son comparables entre sí, cada una describe su propio
entorno:**

- **Dev** (`supabase-dev`, tras aplicar las dos migraciones, 2026-07-26): `saga_items` tiene 22
  filas — 19 pasan a `placement='fijo'` (tenían `position`), 3 quedan `null` (sin clasificar,
  0 marcadas `optional` tras el default). `sagas` tiene 14 filas, 5 con `parent_saga_id`; el
  backfill coloca 2 como `placement_in_parent='fijo'` y deja 3 en `null` — **a propósito**: son
  hijas de un padre que tenía grafo (`saga_nodes`, tabla retirada por completo en la fase 3, §7.7), y
  ahí la app no deducía el orden de `position` sino de `order_no`, así que inventar una colocación
  habría sido una curación que nadie hizo (se migró a mano en la fase 3, §7.7).
  `saga_placement_windows` (tabla de la fase 2b, para la ventana de un
  `libre`, §7.6) **no existía todavía cuando se midió esta cifra** (2026-07-26); existe en dev y en
  prod desde el 2026-07-27 (§7.6).
- **Prod, medido el 2026-07-25 antes de que existieran estas columnas** (spec, sección "Modelo de
  datos"): 342 filas de `saga_items` con `position` (→ habrían pasado a `fijo`), 9 sin `position`
  (→ `null`). **Esta cifra es informativa, no aplicada**: prod no tiene ni el enum ni las columnas
  — ver más abajo.

**Migraciones `20260725_saga_placement.sql`, `20260725_saga_placement_blocks.sql` y
`20260726_saga_items_placement_writers_fix.sql` — SOLO EN DEV, deliberadamente, hasta que el
orquestador aplique esta rama.** El motivo original era que el CHECK
`saga_items_placement_position` **rompía `assignItemToSaga`** (el formulario «Saga» de la ficha,
`manage-saga-actions.ts`), que hacía `upsert` de la membresía escribiendo `position` y lo ponía a
`null` si el campo llegaba vacío — sobre una fila `fijo` eso viola la restricción nueva. Antes esa
pérdida era silenciosa (issue #188); con el CHECK en prod pasaría a ser un `upsert` que falla duro.
**Ese arreglo ya no es trabajo de la fase 2: es el commit `e3832ff` de esta misma rama.**
`assignItemToSaga` deja de escribir `position` — el hueco pasa a ser competencia exclusiva del
editor de secuencia (`updateSagaMember`/`member-actions.ts`) — y cierra #188 eliminando el segundo
escritor en vez de parcheando el síntoma (ver `decisiones.md`, entrada 2026-07-26). El mismo commit
destapó que #188 no era el único escritor roto: la RPC `sync_tmdb_saga_items` insertaba `position`
sin `placement` (arreglada en `20260726_saga_items_placement_writers_fix.sql`, que sustituye el
cuerpo de la función sin tocar el fichero ya aplicado a prod en `20260722_saga_items_rls_hardening.sql`
— ese mismo fichero recibió una segunda revisión, el mismo día, para que dejara de pisar filas
existentes: ver §7.1b)
y `applyMembershipOps` no arrastraba `placement` al mover un ítem entre subsagas (arreglado en
`apply-membership-ops.ts`, sin migración — es solo código de aplicación). Mismo formato que ya usa
§7.1 para el caso de #169, donde el orden de despliegue también importaba: **las tres migraciones se
aplicaron a dev el 2026-07-25/26 y a prod el 2026-07-26**, en una sola pasada y en el orden
`20260725_saga_placement` → `20260725_saga_placement_blocks` →
`20260726_saga_items_placement_writers_fix`.

Verificado contra los objetos reales de prod, no contra `list_migrations`: enum `fijo|libre`; los
tres CHECK en forma `CASE`; backfill **342 `fijo` / 9 sin clasificar / 0 `libre` / 0 `optional`**;
**cero** filas violando cualquiera de los dos invariantes; y `sync_tmdb_saga_items` con
`on conflict do nothing` y su `security definer` intacto.

⚠️ **Las 12 sagas con padre de producción quedaron SIN colocar (`position_in_parent` nulo), y era
correcto**: las 12 colgaban de un padre con grafo (Cosmere, Mundodisco, Maasverse), y hasta la fase 3
la colocación ahí no se deducía de `min(position)` sino de `saga_nodes.order_no` (tabla retirada por
completo en la fase 3, §7.7). Inventarles un hueco
habría sido escribir una curación que nadie deriva. Quien mire prod y vea 12 bloques «sin
clasificar» no está viendo un backfill fallido: está viendo deuda de curación real, que es justo lo
que la feature vino a hacer visible.

**El intento de rescate (fase 2a, `20260726_rescate_colocacion_hijas.sql`, ver §7.5) no rescató
nada.** La premisa de este párrafo — que al menos algunas de las 12 tendrían `order_no` curado en
su nodo-bloque dentro del grafo de su padre — resultó falsa: de los 55 nodos que tenía entonces
`saga_nodes` en prod (tabla retirada por completo en la fase 3, §7.7), **solo uno** tenía
`child_saga_id` no nulo (el de "Trono de Cristal"), y ese tampoco tenía
`order_no`. Las otras 11 hijas no tenían ningún nodo que las representara en el grafo de su padre. El
`UPDATE` de rescate se aplicó a prod el 2026-07-26 y afectó **0 filas** — medido antes y después,
tabla idéntica. Detalle y reproducción en la issue #196. La colocación de estas 12 ya **no** espera
a la fase 3: el editor de secuencia de la fase 2a (§7.5) tiene una zona dedicada a bloques sin
clasificar, así que se curan a mano ahí, por una persona, cuando alguien decida hacerlo — no hay
fecha ni fase que las bloquee.

**El orden importa para desplegar**: el código de esta rama **lee** `placement`/`optional`, y
PostgREST no devuelve datos parciales — sin las columnas, la consulta entera falla y la capa de
datos se traga el error, así que las sagas se verían **vacías** en vez de dar error. Por eso las
migraciones van **antes** que el despliegue del código, nunca al revés.

**UI**: `/saga/[id]/editar` (`saga-members-editor.tsx` + `member-actions.ts`, acción
`updateSagaMember`) cura `placement` y `optional` por miembro, junto al `position`/`role` que ya
curaba desde #167 — un doble gate (RLS `collaborator+` de `saga_items` + comprobación en la server
action) igual que el resto de escrituras de saga. La ficha (`saga-info.tsx`) pinta una sección
**"Cuando quieras"** con las entradas `libre`, un chip **"opcional"** sobre la portada de las
entradas `optional`, y — para `collaborator+` — un aviso de deuda de curación ("N obras sin
clasificar… Clasificarlas") que enlaza a `/editar`. La sección **"Fuera del orden principal"** que
trajo la PR #189 (§7.3) **se fundió en la grid del grupo y ya no existe**: un miembro sin
clasificar (`placement === null`) se distingue ahora solo por un contorno punteado en su portada
(con equivalente accesible) y por el aviso de deuda — la sección dedicada era la tercera señal
para el mismo hecho. El chip de rol narrativo (§7.3) sobrevive, movido dentro de la celda
compartida. La colocación de un **bloque-subsaga** (`position_in_parent`/`placement_in_parent`/
`optional_in_parent`) **ya tiene UI y escritor** desde la fase 2a (§7.5): el mismo editor de
secuencia cura obras propias y bloques-subsaga a la vez, vía `save_saga_sequence`.

### 7.5 Editor único de secuencia y retirada del editor de grafo (fase 2a del orden unificado)

Fase 2a de 3 (spec `docs/superpowers/specs/2026-07-26-sagas-fase-2a-editor-secuencia-design.md`):
sustituye el formulario por fila de `/saga/[id]/editar` y el editor de grafo (`/saga/[id]/mapa/editar`,
React Flow) por **un solo editor** con tres zonas — obras propias, bloques-subsaga (hijas directas)
y "sin clasificar" — y guardado atómico. Dos cáscaras sobre **una capa de estado única**
(`useSequenceDraft`): A en escritorio (grid de zonas), B en móvil (pestañas + hoja por fila). El
gesto de "tándem" (issue #168) deja elegir un hueco compartido entre una obra y un bloque en dos
pasos, sin teclear número — el número se deriva del hueco, nunca se escribe a mano.

**RPC `save_saga_sequence(p_saga_id uuid, p_entries jsonb, p_blocks jsonb, p_removed jsonb)`**
(`SECURITY DEFINER`, gate `collaborator+` interno vía `has_min_role`, `search_path = public`,
`revoke` a `public`/`anon`) — guardado atómico de las tres piezas en una sola transacción:

- `p_entries` — upsert de las filas de `saga_items` de ESTA saga (`position`, `placement`,
  `optional`, `role`); `is_primary` se calcula con el mismo criterio que el resto de escritores
  (`link_tmdb_saga_item`, `sync_tmdb_saga_items`), nunca `false` incondicional — ver
  `decisiones.md`.
- `p_blocks` — `UPDATE` de `position_in_parent`/`placement_in_parent`/`optional_in_parent` de las
  hijas DIRECTAS (`parent_saga_id = p_saga_id`); nunca inserta ni borra, porque anidar/desanidar
  sigue siendo competencia de `editor-actions.ts`.
- `p_removed` — baja **explícita** de membresías de `saga_items`, y solo estas: a diferencia de
  `save_saga_route`/`save_saga_graph` (full-replace por `delete` + reinsert), aquí NO hay borrado
  por omisión, porque `saga_items` tiene un segundo escritor activo (`assignItemToSaga`, el
  formulario «Saga» de la ficha) y un borrador rancio del editor se habría comido, en silencio,
  cualquier alta hecha por otra persona mientras el editor estaba abierto. Ver `decisiones.md`.

**`save_saga_graph` quedó huérfana**: al retirarse el editor de grafo, dejó de tener llamador
en la app (verificado por grep sobre `src/` y `e2e/`). Siguió viva en prod como función `SECURITY
DEFINER` hasta que la fase 3 la borró junto con `saga_nodes`/`saga_edges` y `main-order.ts` (§7.7,
`20260729_drop_saga_graph.sql`, aplicada a dev y a producción el 2026-07-27) — no era trabajo de
esta fase. `apply-membership-ops.ts` queda en la
misma situación (sin llamador real, solo su propio test) — ver issue #197.

**Migraciones `20260726_save_saga_sequence.sql` y `20260726_rescate_colocacion_hijas.sql`,
aplicadas a prod el 2026-07-26, en ese orden.** Ambas son aditivas y de bajo riesgo: la primera crea
una función nueva sin tocar ningún objeto existente; la segunda es un `UPDATE` acotado que resultó
ser un no-op medido (0 filas) — ver el párrafo de arriba (§7.4) y la issue #196 para el porqué.
Verificado contra los objetos reales de prod, no contra `list_migrations`: `save_saga_sequence`
existe con `prosecdef = true`, `search_path=public` y sus cuatro argumentos (`p_saga_id, p_entries,
p_blocks, p_removed`); **cero** filas violando el invariante `placement/position` en `sagas` ni en
`saga_items`; y la tabla de las 12 sagas hijas idéntica antes y después del rescate.

**UI**: `/saga/[id]/editar` es ahora el editor de secuencia único (`SequenceEditor`,
`src/components/saga/sequence/sequence-editor.tsx`, + `src/lib/sagas/sequence-actions.ts`, acción
`saveSequence`, que llama a la RPC `save_saga_sequence`); `/saga/[id]/mapa/editar` redirige a
`/editar` (no 404: hay enlaces vivos y gente con la URL guardada). El gate sigue siendo el mismo
doble (RLS `collaborator+` de `saga_items`/`sagas` + comprobación en la server action) que el resto
de escrituras de saga.

### 7.6 Ventanas de colocación de una entrada `libre` (fase 2b del orden unificado)

Fase 2b de 3 (spec `docs/superpowers/specs/2026-07-26-sagas-fase-2b-ventanas-design.md`): «cuándo se
puede leer» una entrada `libre` (§7.4) — el caso que la motiva, en palabras del curador: «Nacidos Era
2 es opcional, A PARTIR DE Era 1, y recomendable ANTES DE Viento y Verdad». El sujeto de una ventana
puede ser una obra o un **bloque-subsaga entero** (el caso real medido en el Cosmere el 2026-07-26:
las dos únicas entradas `libre` de producción eran bloques, no obras — ver la entrada `backlog.md`
de la fase anterior).

```sql
create table public.saga_placement_windows (
  id uuid primary key default gen_random_uuid(),
  saga_id uuid not null references public.sagas(id) on delete cascade,

  -- SUJETO: la entrada cuya ventana es esta. Obra XOR bloque.
  item_type public.item_type,
  item_id uuid,
  child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «a partir de». Obra XOR bloque, opcional.
  after_item_type public.item_type,
  after_item_id uuid,
  after_child_saga_id uuid references public.sagas(id) on delete cascade,

  -- ANCLA «recomendable antes de». Misma forma, opcional.
  before_item_type public.item_type,
  before_item_id uuid,
  before_child_saga_id uuid references public.sagas(id) on delete cascade,

  created_at timestamptz not null default now()
);
```

**Una fila por entrada, dos anclas como máximo.** Cuatro CHECK, los cuatro escritos sobre
`IS [NOT] NULL`, nunca sobre un `OR` de comparaciones — la misma trampa que ya obligó a reescribir
`saga_items_placement_position` como `CASE` (§7.4, arriba): con `x IS NULL`, comparar contra `NULL` da
`NULL`, no `FALSE`, así que un `OR` de ramas así puede dar `NULL` entero y un CHECK solo rechaza
`FALSE` — la fila imposible cuela. `saga_placement_windows_subject` exige sujeto obra XOR bloque
(y una obra necesita siempre su `item_type`: `item_id` es polimórfico, sin tipo no se sabe a qué tabla
apunta); `saga_placement_windows_after`/`_before` exigen cada ancla vacía, obra, o bloque —nunca una
mezcla—; y `saga_placement_windows_needs_anchor` exige al menos una de las dos anclas (una ventana sin
ninguna es un `libre` sin ventana, y entonces no hay fila que crear).

Dos **uniques parciales por saga** —`saga_placement_windows_item_key` (`saga_id, item_type, item_id`
where `item_id is not null`) y `saga_placement_windows_child_key` (`saga_id, child_saga_id`)—, mismo
patrón que ya protege `saga_route_entries` y que protegía `saga_nodes` mientras existió (§7.2;
tabla retirada en la fase 3, §7.7). Son **por saga**, no globales:
nada impide que dos sagas hermanas del mismo subárbol tengan cada una su propia fila de ventana sobre
la MISMA obra compartida (multi-membresía) — `hydrateWindows`/`resolveWindows` (código, más abajo)
desempatan por `created_at` ascendente cuando eso ocurre, mismo criterio en el editor y en la ficha.

RLS: lectura pública (`anon`+`authenticated`), escritura `collaborator+` — forma calcada de
`saga_routes`/`saga_route_entries` (§7.2).

**`save_saga_sequence` crece a CINCO argumentos** (`p_saga_id, p_entries, p_blocks, p_removed,
p_windows`); la de cuatro (§7.5) pasa a ser un **envoltorio** de la de cinco con `p_windows='[]'`, y se
queda viva hasta que el bundle desplegado (que aún llama con cuatro) deje de usarse — ver
`decisiones.md` para el porqué de las tres migraciones y el riesgo conocido de la ventana entre ellas.
`p_windows` es **reemplazo total** de las ventanas de la saga (`delete ... where saga_id = p_saga_id`
seguido de reinsert de lo que traiga el payload), a diferencia de `p_removed` (baja explícita de
`saga_items`, §7.5) — ver `decisiones.md` para el porqué de esa asimetría deliberada.

> **Desde la fase 4 (2026-07-28) esto ya no es así.** `save_saga_sequence` crece a **SEIS**
> argumentos (`…, p_windows, p_window_subjects`) y la baja de ventanas pasa a ser **explícita, por
> lista de sujetos**: se borran exactamente los sujetos que la pantalla declara y se reinserta
> `p_windows`. El reemplazo por saga se justificaba con que «no hay un segundo escritor»; desde que
> el editor del padre puede curar la ventana de una obra de su hija hay dos pantallas escribiendo la
> misma fila, y borrar por saga se llevaría por delante lo que la otra acaba de guardar — la misma
> razón que en la fase 2a obligó a que la baja de `saga_items` fuera explícita.
>
> Y el **`saga_id` viaja EN CADA FILA** de `p_windows`, ya no lo pone el RPC: la ventana pertenece a
> la OBRA, no al contexto desde el que se cura, así que su fila vive bajo la saga **dueña de la
> membresía** (la decide `windowOwnerFor`, `src/lib/sagas/window-owners.ts`: manda `is_primary`;
> sin ninguna principal, la saga que se está curando si está entre las membresías; si tampoco, la de
> id menor). El RPC acota el alcance: solo acepta `saga_id` de `p_saga_id` o de sus **hijas
> directas**, que es lo único que su editor enseña.
>
> Migraciones: `20260730_save_saga_sequence_subjects.sql` (crea la sobrecarga de seis; la de cinco
> se quedó viva hasta que el bundle nuevo estuvo desplegado, porque añadir un parámetro no reemplaza
> la función, la sobrecarga) y `20260731_drop_save_saga_sequence_v5.sql`, que la retiró **después**
> del despliegue. **Las dos están aplicadas en dev y en prod (2026-07-28)** y hoy `pg_proc` devuelve
> UNA sola firma, la de seis argumentos: ya no queda ningún camino que borre ventanas por saga.

**Quién garantiza que solo una entrada `libre` tiene ventana** — ningún CHECK puede imponerlo, porque
cruza dos tablas (`saga_placement_windows` no sabe qué vale `saga_items.placement`/
`sagas.placement_in_parent` para su sujeto). Lo sostienen **dos piezas de código, ninguna la BD**:

1. **El RPC**, por reemplazo total: `validateSequenceDraft` (`src/lib/sagas/validate-sequence-draft.ts`,
   código `windowNotFree`) ya rechaza en el cliente un payload que intente guardar una ventana para
   una entrada que no sea `libre` en ese mismo borrador, así que `p_windows` nunca lleva, de origen,
   la ventana de una entrada `fijo`/sin clasificar. Y como el `DELETE` borra TODAS las filas de la
   saga antes de reinsertar, una entrada que **deja de ser** `libre` en este mismo guardado (se mueve
   a un hueco fijo) simplemente no aparece en `p_windows` — su fila desaparece en la MISMA transacción
   en que cambia de zona, sin ningún paso adicional.
2. **El render**, de forma defensiva y por si acaso quedara una fila huérfana (p. ej. un cambio de
   `placement` que no pasara por este RPC): `hydrateSequenceDraft`/el editor
   (`src/lib/sagas/get-saga-sequence.ts`) y `freeItemWindow`/`freeBlockWindow`
   (`src/lib/sagas/get-saga-detail.ts`) comprueban `placement`/`placement_in_parent` ELLOS MISMOS antes
   de mirar el mapa de ventanas — nunca confían en que la tabla no tenga fila para algo que ya no es
   `libre`.

**Un ancla rota no se limpia — salvo que sea una saga-ancla borrada, que se lleva la fila entera.**
Dos casos, distintos de verdad:

- **Ancla-obra, o ancla-bloque que se desanida o sale de alcance sin borrarse.** La fila de
  `saga_placement_windows` **no se toca**: al hidratar, esa ancla concreta resuelve a `null`
  (`hydrateWindows`/`resolveWindows`, título ausente en `anchorTitles` = ancla rota) y desaparece de lo
  que ve el curador/lector. Se pierde del todo en el siguiente guardado de la saga —**cualquiera**,
  aunque no toque esa fila— por el mismo reemplazo total del punto 1: el borrador que se sirve no
  incluye una ancla que no resolvió, así que `p_windows` la reemplaza por una versión sin ella (o sin
  ventana entera, si esa era su única ancla). Decisión deliberada del responsable de producto, no un
  descuido — ver `decisiones.md`.
- **Ancla-bloque que se BORRA.** `after_child_saga_id`/`before_child_saga_id` llevan `on delete
  cascade` (arriba): borrar la saga-ancla se lleva **la fila entera de `saga_placement_windows` en el
  acto**, no en el siguiente guardado — y con ella la OTRA ancla de esa misma ventana, aunque siguiera
  siendo válida y curada. Verificado en dev: fila con `after_child_saga_id` = saga A y `before_item_id`
  = una obra; al borrar A la fila pasa de 1 a 0. `after_item_id`/`before_item_id` no tienen este
  problema porque no llevan FK (son polimórficos, apuntan a `books`/`movies`/`series` según
  `item_type`): una obra-ancla borrada sigue el camino de arriba. No se ha corregido pasando esas dos
  columnas a `set null`: chocaría con el CHECK `saga_placement_windows_needs_anchor` cuando esa fuera
  la única ancla de la fila. Es un efecto del esquema, no una decisión de producto — no confundir con
  el punto anterior.

Verificado **en dev y en prod** (dev el 2026-07-27; prod reverificado el 2026-07-27 al escribir esta
subtarea, tras el ANEXO 2026-07-27 de `schema-baseline.sql`), contra los objetos reales
(`pg_constraint`, `pg_policies`, `pg_proc`, `to_regclass`), no contra `list_migrations`: los cuatro
CHECK en la forma `IS [NOT] NULL`; los dos uniques parciales; RLS con las dos policies (`select`
pública, `all` collaborator+); y en prod `save_saga_sequence` con **una sola** firma (la de cinco
argumentos, `prosecdef=true`/`search_path=public`) — el envoltorio de cuatro ya se retiró
(`20260728_drop_save_saga_sequence_v4.sql`, ver `schema-baseline.sql`). Cubierto por `e2e/sagas-ventanas.spec.ts` (dos anclas de
una `libre` se guardan y persisten tras recargar; el tope de dos anclas; y —el test que más protege,
porque es justo lo que ningún CHECK puede dar— mover una entrada con ventana a la secuencia borra su
ventana, comprobado contra la BD).

**UI**: `WindowEditor`/`AnchorPicker` (`src/components/saga/sequence/`), bajo cada fila de la zona
«Cuando quieras» del editor de secuencia; nunca se monta fuera de ahí. Las opciones de ancla salen de
`getAnchorOptions` (`src/lib/sagas/get-anchor-options.ts`), a propósito un cargador **aparte** de
`getSagaSequence` y más ancho: recorre el subárbol entero (hasta profundidad 4, mismo cinturón que
`fetchDescendants`), porque un ancla puede apuntar a una obra de un nieto. La ficha
(`saga-info.tsx`) pinta la ventana resuelta bajo la portada de cada entrada `libre` en «Cuando
quieras», con el título de cada ancla en negrita. Deuda menor conocida (rendimiento de
`getAnchorOptions` llamada dos veces por render, congelación de la lista de anclas dentro de la misma
sesión, falta de test unitario de estos dos componentes, locator e2e por XPath, estilo de la línea de
ventana sin mockup): issue #206.

### 7.7 El mapa se deriva; `saga_nodes`/`saga_edges`/`save_saga_graph` retiradas (fase 3 del orden unificado, CERRADA)

Fase 3 de 3 (spec `docs/superpowers/specs/2026-07-27-sagas-fase-3-retirada-del-grafo-design.md`):
cierra la unificación empezada en la fase 1. El «Mapa de lectura» de una saga (la vista 2D de
`@xyflow/react`, el timeline móvil y el mini-preview del CTA) deja de leerse de las tablas
`saga_nodes`/`saga_edges` — dibujadas a mano en un editor propio, ya retirado en la fase 2a — y pasa
a **derivarse** de lo que ya está curado en el resto del producto: la secuencia (`saga_items.position`,
`sagas.position_in_parent`), los bloques-subsaga y las ventanas de una entrada `libre` (§7.6).
`deriveSagaMap` (`src/lib/sagas/derive-map.ts`) produce el **mismo** tipo `SagaGraph` que antes
producía `buildSagaGraph` sobre las tablas viejas, así que la vista no cambió ni una línea de render
— solo cambió de dónde sale el dato.

**Regla de construcción del mapa derivado:**

- **Un nodo es siempre una obra individual**, nunca un bloque-subsaga: un bloque se EXPANDE en las
  obras de su subárbol (hasta profundidad 4, mismo cinturón que `fetchDescendants`). Un bloque nunca
  es un nodo del mapa.
- **La cadena (aristas `principal`) son los huecos consecutivos** de la secuencia curada: cada
  `position` distinto dentro de un bloque es un hueco, y huecos consecutivos del mismo bloque quedan
  unidos por una arista.
- **Un tándem son dos obras en el mismo hueco** (mismo `position`): comparten columna en vez de una
  seguir a la otra.
- **Las ventanas de la fase 2b (§7.6) son las aristas que CRUZAN**: un ancla `after` se traduce en
  una arista entrante de tipo `requisito`; un ancla `before`, en una arista saliente de tipo
  `opcional`. Un ancla que apunte a un bloque se resuelve a la primera/última obra de ese bloque (un
  bloque nunca es nodo, así que no puede ser origen/destino literal de una arista). Una ventana con
  un ancla rota (resuelve a `null`) simplemente no produce esa arista — misma regla que ya aplicaba la
  ficha para una ventana con ancla rota.
- **Una obra sin hueco** (`placement` `libre`, o sin clasificar — `position === null`) **es un nodo
  del mapa, pero no entra en la cadena**: no tiene `orderNo`, ninguna arista `principal` la toca, y
  eso es justo lo que activa el mecanismo de ramas/puentes que `deriveTimeline` ya tenía para un nodo
  huérfano (issue #170). Sí puede llevar una arista de ventana. Es la corrección más importante que
  dejó la revisión de la Task 1 de esta fase: el plan original no distinguía este caso, y sin él una
  obra suelta entraba en la cadena con aristas `principal` como si tuviera hueco — la ficha del
  Cosmere real enseña «Sin hueco asignado en esta lista» en **siete** obras, así que no es un caso
  raro.
- Un itinerario curado (§7.2), si lo hay, se pinta **encima** del mapa: numera los nodos que ya
  dibuja el mapa (`step`), pero nunca añade un nodo ni una arista que el mapa no tuviera — el
  itinerario no gana poder sobre el mapa, solo el mapa sobre lo que el itinerario calla.
- Las coordenadas que devuelve `deriveSagaMap` son **píxeles** (`NODE_STEP_X = 180`, `NODE_STEP_Y =
  220`, medidos contra el tamaño real de la tarjeta de portada), no índices de columna/fila: la vista
  2D pasa `x`/`y` crudos a React Flow, sin normalizar. `orderNo` en cambio se queda como índice
  lógico (0, 1, 2…), sin escalar — es lo que consume `deriveTimeline`, no una coordenada de lienzo.
  Solo `scaleNodes` (`derive-timeline.ts`) normaliza a escala relativa, y únicamente para el
  mini-preview del CTA (`map-cta.tsx`); la vista 2D no pasa por ahí.

**El curador decide si su saga enseña mapa: columna `sagas.show_map`** (`boolean not null default
false`, migración `20260728_sagas_show_map.sql`). Hasta esta fase, tener mapa significaba que alguien
lo había DIBUJADO a mano en el editor de grafo, así que su sola existencia (una fila en `saga_nodes`)
ya era la señal de que merecía enseñarse. Al derivarse de la curación, **toda** saga con miembros
tiene mapa — la señal desaparece, y el de una saga de dos títulos no aporta nada. El aviso que decía
«Orden de lectura disponible · Un moderador configuró el recorrido» **se retiró**: con el mapa
derivándose solo, ese aviso dejó de señalar ninguna intención humana. `resolveSagaGraph(showMap,
derivedGraph)` (`src/lib/sagas/get-saga-detail.ts`) aplica el interruptor **en el origen**: con
`show_map = false`, `SagaDetail.graph` es `null` y por construcción **ningún** consumidor lo enseña
— ni la pestaña Mapa, ni la ruta `/saga/[id]/mapa`, ni el CTA — sin que cada uno tenga que comprobar
el interruptor por su cuenta. El backfill de la migración enciende `show_map = true` para toda saga
que **hoy** tenga alguna fila en `saga_nodes`: las sagas que ya enseñaban mapa lo siguen enseñando;
retirarlo en silencio habría sido una pérdida, no una migración. Medido en dev tras aplicar: de 14
sagas, 1 tenía grafo dibujado a mano y esa 1 quedó con `show_map = true`. En prod, aplicada el
2026-07-27: 4 de las 85 sagas quedaron con `show_map = true`.

**Migración `20260728_migrar_grafos_a_itinerarios.sql`**: antes de poder borrar `saga_nodes`/
`saga_edges`, se rescata a `saga_routes`/`saga_route_entries` (§7.2, slug `orden-recomendado`) lo
**único** que esas tablas sabían y el modelo nuevo no — un orden fino entre obras que la curación de
hoy no expresa. Medido contra producción el 2026-07-27 (detalle completo en
`.superpowers/sdd/task-5-report.md`):

- **Cosmere** (19 pasos): sus 19 nodos ya tenían `order_no` 1..19 — se copian tal cual. El nodo sin
  `order_no` (*Arcanum Ilimitado*, un recopilatorio de relatos) queda fuera: nunca tuvo hueco en el
  orden principal, y darle uno habría sido inventar una curación que nadie hizo.
- **Mundodisco** (26 pasos): ninguno de sus 26 nodos tenía `order_no` — el orden salía solo de sus 28
  `saga_edges`. Se linealiza con `linearizeGraph` (`src/lib/sagas/linearize-graph.ts`, Kahn con
  desempate determinista: hilo que se está leyendo → nombre de hilo → posición dentro del hilo → clave
  como desempate final de un orden total).
- **Trono de Cristal y Maasverse NO se migran.** Trono de Cristal: sus 8 nodos ya tienen `order_no`, y
  coincide 1:1 con `saga_items.position` de su sub-saga curada (empate del hueco 6 incluido) —
  materializar una ruta ahí sería una segunda fuente de verdad idéntica a la que ya existe. Maasverse:
  un único nodo, sin `order_no` — no hay orden que rescatar.

**Estado de despliegue, verificado el 2026-07-27 contra los objetos/filas reales, no contra
`list_migrations`** — ver también el ANEXO 2026-07-27 de `schema-baseline.sql`:

- `20260728_sagas_show_map.sql`: aplicada a **dev y a producción**. `sagas.show_map` existe en los
  dos entornos; en prod, 4 de las 85 sagas quedaron con `show_map = true` tras el backfill.
- `20260728_migrar_grafos_a_itinerarios.sql`: aplicada a **dev y a producción** el 2026-07-27. En
  prod, `saga_routes` tiene las dos rutas `orden-recomendado` migradas (Cosmere, 19 pasos; Mundodisco,
  26 pasos), además de la `rincewind` de Mundodisco (8 pasos, curada a mano, preexistente). En dev la
  migración también está en el historial, pero sin filas resultantes: esa base de fixtures de QA no
  tiene las sagas Cosmere/Mundodisco, así que la Task 5 la verificó sembrando esos dos ids
  TEMPORALMENTE y revirtiendo la siembra al terminar (sus dos rutas/45 pasos se fueron con la
  siembra, cascada de `on delete cascade`).
- La **tercera** migración de la fase — el `DROP` de `save_saga_graph`/`saga_edges`/`saga_nodes`
  (`supabase/migrations/20260729_drop_saga_graph.sql`) — está **aplicada a dev y a producción el
  2026-07-27**, después de comprobar en producción que el mapa derivado funcionaba: borrar esas
  tablas con el bundle desplegado todavía leyéndolas habría roto la ficha entera, así que el `DROP`
  fue posterior al despliegue y a esa comprobación, nunca antes. `saga_nodes`, `saga_edges` y
  `save_saga_graph` **ya no existen** en ningún entorno — verificado con `to_regclass` (`null` para
  las dos tablas, en dev y en prod) y contra `pg_proc` (sin ninguna fila `save_saga_graph`). Los dos
  tipos enum que usaban esas tablas (`saga_edge_type`, `saga_node_level`, §9) **sí siguen
  existiendo**: el `DROP` no incluyó `DROP TYPE` y ninguna columna los usa ya (verificado contra
  `pg_attribute`) — quedan huérfanos, no borrados. La ficha del Cosmere en producción sigue
  funcionando tras el borrado: 7 bloques, sus líneas de ventana y su pestaña de mapa.

**Con esto la fase 3, y con ella la unificación del orden de sagas, queda cerrada del todo.** Ver
`docs/requirements/backlog.md` y `docs/requirements/decisiones.md` (entrada 2026-07-27, fase 3).

**UI**: `SagaMetaEditor` (`/saga/[id]/editar`) gana el checkbox del interruptor, mismo doble gate
`collaborator+` (RLS de `sagas` + comprobación en la server action `updateSagaMeta`,
`curation-actions.ts`) que el resto de escrituras de saga. Un botón «Generar desde la curación» en el
editor de secuencia crea un itinerario a partir de `createCuratedOrder` (§7.7 más abajo lo describe
como consumidor del mismo orden que el mapa) en vez de empezarlo en blanco.

**El orden principal deja de tener dos ramas.** `src/lib/sagas/main-order.ts` —que hasta esta fase
mezclaba dos criterios: si la saga tenía nodos de grafo mandaba el grafo, si no mandaba `position`, la
asimetría de la issue #185— **se borra**. Lo sustituye `src/lib/sagas/curated-order.ts`
(`createCuratedOrder`), con un único criterio para todas las sagas: la curación
(`saga_items`/`sagas.position_in_parent`/`placement_in_parent`). El comparador de bloques que antes
vivía repetido en tres sitios (ficha, orden principal, card de Mi Biblioteca) queda unificado en
`compareBlocksByPlacement` (`src/lib/sagas/group-members.ts`), consumido por los tres. Esto cierra
por construcción las issues **#204** (el fichero que arrastraba la heurística vieja desaparece) y
**#203** (la card y la ficha ya ordenan con el mismo comparador). La asimetría de **#185** en la
secuencia también desaparece con `main-order.ts`; su denominador del progreso ya lo había arreglado la
fase 1 (§7, arriba) — issue cerrada con ese matiz, no confundir las dos partes de su título.

### 7.8 Metadatos del hueco compartido: `saga_tandems` (fase 2 del timeline con estados)

Aplicada **en dev y en prod** el 2026-07-28, verificada contra los objetos reales (`to_regclass`, `pg_enum`,
`pg_policies`, `pg_constraint`, `pg_proc`), nunca `list_migrations`. Sin backfill: la tabla nació vacía en prod.

```sql
create type public.saga_tandem_mode as enum ('simultaneo', 'indistinto');

create table public.saga_tandems (
  saga_id uuid not null references public.sagas(id) on delete cascade,
  position integer not null,
  modo public.saga_tandem_mode,
  nota text,
  created_at timestamptz not null default now(),
  primary key (saga_id, position),
  constraint saga_tandems_says_something check (modo is not null or nota is not null),
  constraint saga_tandems_nota_len check (nota is null or char_length(nota) <= 200)
);
```

**Lo que esta tabla NO hace: decir quién está en el tándem.** La pertenencia sigue siendo lo que era
desde la fase 2a — el **empate de `position`** entre dos o más filas de `saga_items`— y esa es su
única fuente de verdad. Aquí solo se guarda qué CLASE de tándem es ese hueco (`modo`) y por qué
(`nota`). Descartado a sabiendas un `tandem_id` en `saga_items`: daría identidad estable a cambio de
dos fuentes sobre la pertenencia que pueden contradecirse, y ningún CHECK puede atarlas porque cruzan
filas — la familia del #91, el #185 y el #203.

**No hay FK contra `saga_items`**, y no puede haberla: la clave apunta a un hueco, que es un empate
entre N filas, no una fila. Lo que impide que la fila quede huérfana tras renumerar es que
`save_saga_sequence` es, desde la fase 2a, el **único** escritor de `position`, y reescribe la
secuencia entera y estos metadatos en la MISMA transacción.

`saga_tandems_says_something` existe porque una fila que no dice nada es ruido que sobrevive a
renumeraciones; el RPC filtra esos huecos ANTES del insert, porque el CHECK abortaría la transacción
entera y un control que el curador dejó vacío no puede tumbar el guardado de toda la secuencia.

RLS calcada de `saga_placement_windows`: lectura pública (`anon`+`authenticated`), escritura
`collaborator+`.

**`save_saga_sequence` pasa a SIETE argumentos** (`p_tandems`), con reemplazo por saga
(`delete ... where saga_id = p_saga_id` + reinsert). El reemplazo es correcto aquí y no lo era para
las ventanas: desde la fase 4 las ventanas tienen DOS pantallas escritoras (el editor del padre cura
la ventana de una obra de su hija), y por eso necesitan sujetos explícitos; un hueco pertenece a la
secuencia de UNA saga y solo el editor de esa saga lo escribe. La firma de SEIS queda viva como
envoltorio que delega con `p_tandems = '[]'`, y se retira **después** del despliegue
(`20260802_drop_save_saga_sequence_v6.sql`) — mismo baile que las fases 2b y 4.

El envoltorio **ya se retiró** (`20260802_drop_save_saga_sequence_v6.sql`, dev y prod el 2026-07-28), después de
confirmar que producción servía el bundle de siete argumentos. Mientras vivió, el riesgo era real y está medido en
dev: una llamada del bundle viejo manda `p_tandems = '[]'` y **borra** los metadatos recién guardados.

> ⚠️ **Lo que de verdad pasó en el despliegue, y conviene no repetir.** El orden correcto es migrar ANTES de
> desplegar. Aquí fue al revés: el merge desplegó el bundle de siete argumentos a las 08:29:17Z y las migraciones
> llegaron después, así que hubo una ventana en la que un guardado de secuencia en producción habría fallado con
> «function does not exist» — el error opuesto al que documenta el párrafo de arriba. No hubo pérdida de datos
> posible (el RPC es transaccional: o entra entero o no entra), pero el guardado habría rebotado.

Primer dato real: el tándem de **Trono de Cristal** (hueco 5, *Imperio de Tormentas* + *Torre del Alba*) se curó
desde la app desplegada nada más aplicar las migraciones, con `modo = 'simultaneo'` y sin nota — prueba en vivo de
que producción escribe por la firma de siete.

### 7.9 Motivo de la ventana recomendada: `saga_placement_windows.motivo` (fase 3 del timeline con estados)

Aplicada **en dev y en prod** el 2026-07-28, verificada contra los objetos reales (`pg_enum`,
`information_schema.columns`, `pg_proc`), nunca `list_migrations`. **Sin backfill**: las 4 ventanas que
ya existían en prod siguen con `motivo IS NULL`.

```sql
create type public.saga_window_reason as enum ('spoiler', 'contexto');

alter table public.saga_placement_windows
  add column motivo public.saga_window_reason;   -- NULLABLE
```

**Por qué nullable y sin backfill.** Las 4 ventanas de producción se curaron antes de que la columna
existiera, y nadie decidió su motivo. Rellenarlas «por defecto» sería poner en boca del curador una
afirmación que no hizo — el mismo criterio con que la fase 2 dejó `saga_tandems.modo` nullable, y
justo lo que la interfaz hacía mal antes de ella al afirmar «se leen a la vez» de todos los tándems.

**Sin CHECK nuevo**: `saga_placement_windows_needs_anchor` (§7.6) ya impide una fila sin ninguna
ancla, así que un motivo no puede existir sin su tramo. **Sin tocar RLS**: las policies de esta tabla
son de tabla, no de columna.

> **`save_saga_sequence` NO crece de argumentos: sigue en SIETE.** Es la diferencia con las fases 2b,
> 4 y 2, que sí pagaron el baile de la sobrecarga. `motivo` viaja como una clave más dentro de
> `p_windows`, que ya era `jsonb`, así que `create or replace` con la MISMA lista de parámetros
> reemplaza de verdad —verificado: `pg_proc` sigue devolviendo una sola firma en los dos entornos— y
> no hay envoltorio que retirar después. **Regla que queda:** una columna nueva de una tabla que ya
> viaja en un payload `jsonb` nunca justifica un argumento nuevo en el RPC.

El cast va precedido de `nullif(btrim(...), '')`: un `''::public.saga_window_reason` lanza 22P02 y
abortaría la transacción ENTERA. La interfaz manda `null`, pero el RPC no puede confiar en su único
llamante de hoy — mismo criterio que el filtrado de huecos vacíos en `p_tandems` (§7.8).

**Derivación (código, no esquema).** El motivo llega a la ficha por el mismo camino que las anclas y
no por uno nuevo: `resolveWindows` lo pone en `ResolvedWindow.reason`, `deriveSagaMap` lo cuelga del
nodo SUJETO (`SagaGraphNode.windowReason`) y `deriveTimeline` lo lee de ahí. Dos resoluciones del
mismo dato acabarían discrepando (#91/#185/#203). Solo un sujeto **obra** lo recibe: un sujeto bloque
se resuelve a la primera obra del bloque, que es una fila normal de la columna (issue #221).

`windowTrack` (`src/lib/sagas/window-track.ts`) es puro y **no toca el progreso**: LEE lo completado
con el predicado único de `completion.ts` (que gana `isStatusCompleted` sobre el estado desnudo, con
`isMemberCompleted` delegando en él), no cuenta, no divide y no aparece en ningún denominador.

### 7.10 Opcionales saltables: `saga_optional_skips` y `profiles.show_optional_readings` (fase 4 del timeline con estados)

Aplicada **en dev y en prod** el 2026-07-28, verificada contra los objetos reales (`to_regclass`,
`pg_class.relrowsecurity`, `pg_policies`, `information_schema.columns`), nunca `list_migrations`.
Sin backfill que valga: la tabla nace vacía y la columna la rellena su `default`.

```sql
create table public.saga_optional_skips (
  user_id uuid not null references auth.users (id) on delete cascade,
  saga_id uuid not null references public.sagas (id) on delete cascade,
  item_type public.item_type not null,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, saga_id, item_type, item_id)
);

alter table public.saga_optional_skips enable row level security;

create policy "saga optional skips own" on public.saga_optional_skips
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.profiles
  add column show_optional_readings boolean not null default true;
```

**Lo que esto NO hace: mover el progreso.** Saltar es solo visual — tacha y atenúa la fila. El
denominador lo sigue gobernando `countedKeys` (`src/lib/sagas/progress.ts`) desde
`saga_items.optional`, y ni la tabla ni la columna entran ahí; `progress.ts` sale de la fase
exactamente como entró. El mockup pide lo contrario en dos sitios («desaparece del cómputo», «36 %
contando solo los principales · 31 % si incluyes opcionales») y **se descarta a sabiendas**: reabrir
el denominador es la familia de fallo del #91 y el #185. Hay un e2e dedicado a ello
(`e2e/sagas-opcionales-saltables.spec.ts`, test 4) que lee el porcentaje del hero antes y después de
saltar y exige que sea idéntico.

**`saga_id` es la saga DUEÑA de la fila de `saga_items`** (`DetailMember.ownerSagaId`), no la ficha
desde la que se pulsa ni la de agrupación visual (`groupSagaId`). Los dos divergen a partir de
profundidad 2, y con cualquiera de los otros el mismo salto se vería desde una ficha y no desde otra.
Lo sostiene una sola función pura y probada, `markSkipped` (`get-saga-detail.ts`) — ningún tipo lo
impone, porque los tres candidatos son `string`.

**No hay FK contra `saga_items`**, y es deliberado: su PK es `(saga_id, item_type, item_id)` y una FK
compuesta ataría el salto al ciclo de vida de la curación, de modo que retirar un miembro y volver a
añadirlo borraría en silencio la preferencia del lector. Un salto huérfano es **inerte**:
`deriveSagaMap` solo marca nodos que existen, así que no se pinta en ninguna parte. A cambio, nadie
los limpia — abierto como issue.

**RLS solo-dueño y SIN gate de rol**, calcada de `saga_route_choices` (§7.2): es preferencia
personal, no curación. Un lector cualquiera puede saltarse una opcional en una saga que él no cura.

**`profiles.show_optional_readings` es NOT NULL con `default true`**, mismo patrón que
`daily_goal_minutes`: el estado por defecto es VER las opcionales, y con NOT NULL ningún perfil
existente queda en un `null` que cada lectura tendría que interpretar. Es preferencia **global**, no
por saga (spec §6). Sin sesión se lee `true`: esconderle obras a quien no ha elegido nada sería
decidir por él, y en silencio.

**Ningún RPC cambia.** Las tres acciones (`skipOptional`, `unskipOptional`,
`setShowOptionalReadings`, en `src/lib/sagas/optional-actions.ts`) son escrituras de una fila con RLS,
como `adoptRoute`: no hay atomicidad que defender, así que no hay función nueva ni baile de
sobrecarga.

Consumo: `getSagaDetail` carga los saltos de TODO el subárbol (`.in("saga_id", sagaIds)`, como las
ventanas y los tándems) dentro del `Promise.all` que ya existía, y la preferencia viaja en el mismo
`select` de `profiles` que ya pedía el rol del viewer — cero viajes nuevos. El filtrado lo hace
`deriveTimeline` con su opción `showOptional`, no los componentes: `items` alimenta la columna, las
ramas, los puentes y la colocación de las ventanas, y esconder en el render dejaría secciones vacías
con su cabecera y ventanas ancladas a filas invisibles. **El tramo de la ventana no se mueve** al
esconder (`windowTrack` sigue recibiendo el grafo entero): describe el orden de la SAGA, no lo que
este lector ha elegido ver. Y **los números no se recalculan**: si el hueco 1 desaparece, el 3 sigue
siendo el 3 — la misma regla que ya rige los pasos de un itinerario.

**[MEDIDO en prod, 2026-07-28]** 6 filas con `optional = true` en 5 sagas. Cuatro son `libre` (ramas)
y **dos tienen hueco fijo** (*Saga de los Huesos Verdes*, huecos 1 y 2 de 5): una opcional puede vivir
en la COLUMNA, así que tratar «opcional» como sinónimo de «rama punteada» —que es como la dibuja el
mockup— dejaría esas dos siempre visibles.

## 7.9 Celebraciones — `user_celebrations` (dev y **prod**, 2026-08-05)

Memoria de las microanimaciones ganadas por usuario, para que un hito **no se repita** entre
recargas ni entre dispositivos (localStorage no se comparte). **No es estado de progreso** —
el estado vivo sigue en `passes`; esta tabla es memoria de UI persistida.

**La tabla** `user_celebrations`: `id`, `user_id` (FK `auth.users`, `on delete cascade`),
`event_type text` (no enum: añadir un evento no debe exigir migración de tipo; el registro de
la app en `src/lib/celebrations/registry.ts` es la fuente de verdad), `event_key text`,
`payload jsonb`, `first_triggered_at`, `last_triggered_at`, `displayed_at` (NULL = ganada sin
animar todavía), `created_at`. **`unique (user_id, event_type, event_key)` ES la
deduplicación**: ganar dos veces el mismo hito no crea segunda fila. Índice parcial
`idx_user_celebrations_pending on (user_id) where displayed_at is null` para el drenado.

**RLS**: `select`/`insert`/`update` solo de las propias (`auth.uid() = user_id`) — cada quien
gana SUS celebraciones con su sesión, sin service-role. `grant select, insert, update` a
`authenticated`.

**RPC** `pull_pending_celebrations()` (`security definer`, `search_path` fijado, `revoke` de
`anon`/`public`): reclama y devuelve las no mostradas del usuario en **una** sentencia
(`update … where displayed_at is null returning …`), atómica ante dos pestañas.

Modelo **ganar → drenar**: el dominio gana (idempotente vía upsert `ignoreDuplicates`) desde
`addSession` (eventos «primera actividad», «objetivo diario», «hito de racha») y desde las
acciones de club (join/accept/post/poll/vote → «primera participación»); el cliente drena por
la RPC, anima una vez y sella `displayed_at`. Migración
`supabase/migrations/20260805_user_celebrations.sql`.

**Aplicada a prod el 2026-08-05** (misma pasada que dev): verificado contra objetos reales —
`user_celebrations` con RLS activa y 3 políticas, 3 índices, y `pull_pending_celebrations`
`security definer` con `search_path=public`, ejecutable por `authenticated` y **no** por `anon`.

**Pendiente (issues abiertas):** #459 marcar episodios desde la pestaña Episodios
(`episode-actions.ts`) y publicar/votar en club aún no disparan `checkCelebrations()` en cliente
(la celebración se gana igual y se drena en el siguiente pull/visibilidad, solo se retrasa);
#460 la preferencia vive en localStorage (no cross-device); #461 faltan los eventos
`annual_challenge_completed` y `club_activity_completed`.

## 8. Seguridad

Las 48 tablas públicas de prod y las 48 de dev tienen **RLS activa**. Patrones:

- **Catálogo**: SELECT abierto (incl. anónimo), escritura autenticada.
- **Contenido de perfil**: el dueño siempre; los demás según `can_view_profile()`.
- **Clubes**: `clubs.visibility` gobierna **descubrimiento**, nunca quién ve el contenido —
  eso lo decide `is_club_member()`.
- **`SECURITY DEFINER` deliberado** donde la función *es* la política: tableros de
  actividad (un participante de perfil privado debe ser visible a sus compañeros),
  `save_saga_sequence` (§7.5/§7.6), `save_saga_route` (§7.2), `link_tmdb_saga_item`,
  `sync_tmdb_saga_items` (§7.1), `create_club_poll`, `confirm_checkpoint`,
  `unconfirm_checkpoint`. Los advisors los marcan
  como WARN y **está aceptado**: llevan gate interno de rol. `save_saga_graph` estuvo en esta lista
  hasta la fase 3: dejó de tener llamador en la app cuando la fase 2a retiró su editor (§7.5), y una
  vez la fase 3 derivó el mapa de la curación (§7.7) tampoco quedaba ya ningún lector del grafo que la
  necesitara — se retiró con `DROP` el 2026-07-27, junto con `saga_nodes`/`saga_edges`.
- **`search_path = public, pg_temp` en TODA función `SECURITY DEFINER`** (issue #130,
  `20260808_secdef_search_path_pg_temp.sql`, dev y prod el 2026-07-29). Postgres busca el
  esquema temporal **antes** que los esquemas listados salvo que `pg_temp` aparezca
  explícitamente en la lista; con `set search_path = public` a secas, quien pueda crear una
  tabla o un tipo temporal con el nombre de algo que la función referencie sin cualificar la
  secuestra. Listarlo AL FINAL lo manda al último lugar de la búsqueda. **Estado medido en
  dev el 2026-08-13: 69 funciones `SECURITY DEFINER`, 62 con `pg_temp`.** El número de
  55/55 de 2026-07-29 quedó desactualizado por funciones nuevas de otras ramas, no por una
  regresión de esta migración. Faltan 7, todas deuda de otras ramas (ninguna de esta rama):
  `archive_club_activity`, `pin_comment`, `ensure_club_round`, `get_club_round_state`,
  `pull_pending_celebrations`, `get_activities_progress`, `update_activity_details`. Tres
  (`approve_club_join_request`, `club_is_private`, `notify_club_join_request`) conservan su
  `search_path` vacío — más estricto — y quedaron como `"", pg_temp`; la migración preserva
  el valor previo en vez de normalizar todo a `public`. Es un **barrido genérico sobre
  `pg_proc`, idempotente**: la plantilla para funciones nuevas es `set search_path = public,
  pg_temp`, pero si alguna se escapa, **el arreglo es re-ejecutar
  `20260808_secdef_search_path_pg_temp.sql`** (idempotente) para que las 7 pendientes queden
  cubiertas también.
- **Helpers privados de Social fases 0/1**: las funciones `SECURITY DEFINER` nuevas viven en el
  esquema no expuesto `private`, cualifican todas las referencias y fijan `search_path = ''`.
  Las cuatro RPC públicas de bloqueos/moderación son `SECURITY INVOKER` y usan también
  `search_path = ''`; `public.can_view_interaction_target` también es `SECURITY INVOKER` y
  delega en el helper privado de RLS. Ninguna añadió avisos al advisor de seguridad
  (66 avisos totales en prod y en dev, sin hallazgos atribuibles a esta fase).
- **Storage no valida JWT ES256**: las subidas de imagen van por service-role en server
  actions, no desde el cliente.

## 9. Enums

| Enum | Valores |
|---|---|
| `item_type` | `book \| movie \| series` |
| `media_status` | `planned \| in_progress \| completed \| dropped` |
| `user_role` | `user \| collaborator \| admin` |
| `activity_kind` | `buddy_read \| tierlist \| list_challenge \| criteria_challenge \| evento` (`evento`: 2026-07-22; sin cambios en 2026-08-04 — el seguimiento de eventos amplió las COLUMNAS de `club_activities`, no este enum) |
| `activity_status` | `proposed \| active \| finished \| archived` |
| `club_role` / `club_visibility` | `member \| moderator \| owner` / `public \| private` |
| `club_member_status` | `invited \| active \| requested` |
| `club_event_state` | `programado \| cancelado \| pospuesto` (§6.1, 2026-08-04, dev y **prod**). Solo los tres estados que una PERSONA declara: «en curso» y «finalizado» se derivan del reloj y NO se guardan |
| `event_modality` | `presencial \| online \| hibrida` (§6.1, 2026-08-04, dev y **prod**) |
| `content_report_reason` | `spam \| harassment \| spoiler \| hate \| other` (Social fase 0, dev y prod, 2026-07-30) |
| `notification_type` | `follow_request \| new_follower \| follow_accepted \| review_liked \| review_commented \| club_invite \| club_invite_accepted \| club_post \| club_post_liked \| club_post_commented \| comment_liked \| club_activity_proposed \| club_activity_activated \| club_join_request \| club_join_approved \| club_activity_spawned \| club_event_created \| mentioned \| activity_liked \| activity_commented \| checkpoint_commented \| followed_finished \| followed_session \| followed_episode \| followed_added` (`club_event_created`: 2026-07-22; `mentioned`: 2026-07-30, E5.K3, dev+prod; los tres siguientes: Social fase 1, dev y **prod** 2026-08-02; los cuatro `followed_*`: avisos por persona, 2026-08-04, migración `20260804000001_notification_type_followed.sql` — **corregido aquí el 2026-08-04**: esta tabla decía «SOLO EN DEV, prod aún no tiene estos valores» y ya no es cierto; verificado contra `pg_enum` de PROD, los cuatro están) · **`club_event_reminder \| club_event_updated \| club_event_cancelled`** (§6.1, seguimiento de eventos, 2026-08-04, `20260823_club_event_following_rpcs.sql`, dev y **prod**). `club_event_reminder` es el primer tipo que **no tiene actor**: lo emite el trabajo programado, y por eso `notifications.actor_id` pasó a nullable · `club_round_proposed \| club_round_commented \| club_round_liked` (§6, la ronda, dev y **prod** 2026-08-04) · **`thought_commented \| thought_liked`** (§6.2, Fase 2 de «Pensamiento», **SOLO EN DEV**, 2026-08-06) · **`followed_started \| followed_dropped \| followed_thought`** (§5.3, avisos de seguimiento desde el post, 2026-08-13, migración `20260856_notification_type_followed_post_kinds.sql`, **dev y PROD** — verificado contra `pg_enum` de prod el 2026-08-13: `enumlabel like 'followed_%'` devuelve los siete. La migración de datos `20260857` también está en prod desde ese día, aplicada después del despliegue del código — ver §5.3). Junto con los tres `followed_*` que ya existían cubren uno por `post.kind`; `followed_added` queda huérfano desde el mismo delta — el enum lo conserva pero `createPost` ya no lo emite |
| `interaction_audience_kind` | `profile \| club_member \| activity_participant \| checkpoint_reached` (Social fase 1, dev y **prod** 2026-08-02) |
| `follow_status` | `pending \| accepted` |
| `saga_edge_type` / `saga_node_level` | `principal \| opcional \| requisito` / `principal \| menor` (§7.7: `saga_nodes`/`saga_edges`, las tablas que los usaban, se retiraron por completo en la fase 3 — `20260729_drop_saga_graph.sql`, dev y prod, 2026-07-27. Los dos tipos enum **siguen existiendo** en `pg_type`, huérfanos: el `DROP` no incluyó `DROP TYPE` y ninguna columna los usa ya, verificado contra `pg_attribute`) |
| `saga_item_role` | `precuela \| novela_corta \| relato \| spin_off \| companero \| crossover` (§7.3, issue #167; nullable, sin default — dev y **prod** 2026-07-28, fase 5: `paralela` retirada) |
| `saga_placement` | `fijo \| libre` (§7.4, fase 1 del orden unificado; nullable en `saga_items.placement`/`sagas.placement_in_parent` — aplicado en dev y en prod el 2026-07-26) |
| `target_kind` | `diary_entry \| episode_watch \| club_post \| comment \| activity_checkpoint \| club_activity \| pass \| progress_session \| club_round` (§6, la ronda, dev y **prod** 2026-08-04 — **corregido aquí, 2026-08-06**: esta fila no lo listaba y ya estaba en los dos entornos) · **`thought`** (§6.2, Fase 2 de «Pensamiento», **SOLO EN DEV**, 2026-08-06) |
| `thought_anchor_type` | `book \| movie \| series \| saga \| person` (§6.2, Fase 2 de «Pensamiento», **SOLO EN DEV**, 2026-08-06) |

## 10. Migraciones

158 ficheros en `supabase/migrations/` (recontado con `ls supabase/migrations/*.sql | wc -l` el
2026-08-06 tras las dos de Fase 2 de «Pensamiento»; incluye los deltas que aún están solo en dev,
como `20260814_notes_public_select.sql` y `20260834_thoughts_enum_values.sql`/`20260835_thoughts.sql`).
Este número **envejece en silencio** cada vez que se añade una migración y no hay chequeo que lo
pille (`DRIFT-CHECK.md` compara objetos, no cardinalidades en prosa): recontar, no restar.
`supabase/schema-baseline.sql` es el replay ordenado para levantar un entorno limpio.

⚠️ **Aplicar a prod y actualizar `schema-baseline.sql` es UN SOLO paso, no dos.** Ese fichero
es un replay de PRODUCCIÓN, no de dev, y registra que ya se desincronizó dos veces (notas
2026-07-14 y 2026-07-17) por olvidar exactamente eso. Las dos migraciones de eventos
(`20260722_activity_kind_evento.sql`, `20260722_club_event_rpcs.sql`) se aplicaron a prod el
2026-07-22 y se anexaron al baseline en la misma pasada («ANEXO 2026-07-22»).
Por esa misma regla, las siete migraciones de Social fase 0 están aplicadas en dev y prod y
anexadas al final del baseline como «ANEXO 2026-07-30». En producción, integridad y el puente de
compatibilidad entraron atómicamente antes del bundle `8589601`; la revocación final de INSERT y
el índice de reviewer entraron después de verificar el bundle. [#332](https://github.com/borjar20/Biblioshare/issues/332)
conserva la evidencia operativa.
Las ocho de Social fase 1 están aplicadas en dev y prod y anexadas como «ANEXO 2026-08-02», en la
misma pasada en que se cerró el ciclo en producción. **El anexo va en el orden de PROD, que no es
el de dev**: allí el fix de la audiencia de checkpoint (`20260802013421`) viajó con la cadena
expansiva y la de contrato (`20260801224621`) entró la ÚLTIMA, después del bundle canónico; en dev
el contrato se había aplicado antes que el fix.

⚠️ **El orden del baseline es el de aplicación REAL en producción**
(`supabase_migrations.schema_migrations`), **no el alfabético de ficheros** — varias del
pase-hub se redataron y prod las registra en otro orden.

⚠️ **"No aparece en `list_migrations`" ≠ "no está en prod".** `20260716_list_challenge_completion_mode.sql`
está aplicada pero sin registrar en el ledger. Para comprobar si algo existe de verdad,
mirar los **objetos** (`pg_proc`, `pg_class`), no el ledger.
