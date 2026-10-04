# Experiencias — reseñas por momento y ampliaciones

> **[Histórico · congelado 2026-10-04 · diseño aprobado, pendiente de implementar]**
> El propietario aprobó el diseño por secciones en conversación. El estado aplicado
> por entorno vivirá en `docs/requirements/data-model.md`; este documento fija el alcance.

Base: [diseño de Experiencias v1](2026-10-02-experiencias-design.md) (contratos que se
conservan salvo donde este documento los amplía). Seguimiento: #1293.

## 1. Objetivo y alcance

Hacer reseñables las experiencias sin convertir la reseña en requisito: guardar un
recuerdo con nombre y estado sigue produciendo una tarjeta completa.

Decisiones de producto tomadas:

1. **Cada persona reseña cada momento.** En una experiencia `single` equivale a reseñar
   la experiencia; en una `trip`, cada momento tiene sus reseñas.
2. **Una reseña contiene nota 1–10 y/o texto** (al menos uno). No hay nota propia del
   conjunto: la experiencia muestra una **media derivada**.
3. **Solo reseña quien confirmó asistencia** (`attendance_state='attended'`) a ese momento,
   en una experiencia `lived`. Reseñar no confirma asistencia por sí mismo.
4. **Visibilidad con consentimiento por reseña**, mismo patrón que las fotos: dentro del
   grupo la ven los miembros aceptados; fuera, solo si su autor la comparte.
5. **Alcance social doble:** la reseña compartida aparece en la pestaña Experiencias del
   perfil y, con una acción explícita adicional, como publicación en Actividad/feed.

Ampliaciones incluidas en la misma entrega:

- Acción rápida **«Lo vivimos»** para pasar un plan a vivido y reseñar.
- **Favorito sin estrella**: icono propio, ya que la app no usa estrellas y la nota usa dots.
- **Tipos de momento nuevos**: `food`, `festival`, `sport`, `nature`.
- **Nota en tarjetas** (hub, perfil, feed) y orden «Mejor valoradas» en el hub.

Fuera de alcance: nota global del conjunto distinta de la media, reseñas de invitados
sin cuenta, reseñas de experiencias canceladas o por vivir, catálogo de lugares/eventos.

## 2. Persistencia

Se elige una **tabla propia** frente a columnas en `experience_moment_participants`:
esa tabla ya la filtran reglas de `share_identity` y admite asistencia propuesta por el
creador; mezclar en ella texto libre y un segundo consentimiento aumenta la superficie
de fuga y obliga a grants por columna (#375). Una reseña como post directo se descarta
porque debe poder existir en privado dentro del grupo.

### 2.1 `experience_moment_reviews`

| Columna | Tipo y regla |
|---|---|
| `id` | `uuid` PK, `gen_random_uuid()` |
| `experience_id`, `moment_id`, `participant_id` | FK compuesta a `experience_moment_participants(experience_id, moment_id, participant_id)` `on delete cascade` |
| `author_id` | `uuid not null` → `auth.users`; igual a `experience_participants.user_id` del participante |
| `rating` | `smallint null`, `check (rating between 1 and 10)` |
| `body` | `text null`, recortado, `check (char_length(body) between 1 and 4000)` |
| `share_with_profile` | `boolean not null default false` |
| `created_at`, `updated_at` | `timestamptz not null default now()` |

- `check (rating is not null or body is not null)`: una reseña vacía no existe.
- `unique (moment_id, participant_id)`.
- Índices para `experience_id`, `author_id` y la FK compuesta.
- Un participante sin cuenta (`guest_name`) no puede reseñar: la RPC lo rechaza con
  `forbidden` y un trigger lo respalda.

### 2.2 Invariantes de asistencia y estado

- Insertar o actualizar una reseña exige asistencia `attended` del participante en ese
  momento y experiencia `state='lived'`. Lo comprueba la RPC y lo respalda un trigger
  `BEFORE INSERT OR UPDATE`.
- La RPC `experience_set_attendance(p_moment_id, p_state, p_drop_reviews)` borra primero la reseña cuando `p_drop_reviews=true` y después actualiza. El trigger sobre `experience_moment_participants` rechaza con `PT409` cualquier cambio desde `attended` mientras exista reseña, así que ningún otro camino la deja huérfana. No hace falta un flag de sesión.
- Cambiar la experiencia a `planned` o `cancelled` **conserva** las reseñas y las oculta:
  la RLS exige `lived`. Revertir a `lived` las recupera. No se destruye texto por un
  cambio de estado.
- Retirar a un participante borra sus filas de `experience_moment_participants` y sus
  reseñas caen en cascada. `experience_delete_moment_review` sigue existiendo para borrar
  la propia reseña estando dentro.

### 2.3 Enums (migración propia, anterior a consumidores)

- `experience_moments.kind` es `text` con `CHECK`, no un enum. Se amplía el CHECK y la lista se centraliza en `private.is_experience_kind(text)`, que usan `experience_create`, `experience_save_moment`, `get_profile_experiences` y el hub ordenado.
- `post_kind += 'experience_review'`; `post_source_kind += 'experience_review'`.
- `target_kind += 'experience_review'`.
- Tipo de notificación `experience_reviewed`.

Postgres no permite usar un valor de enum en la transacción que lo crea: esta migración
se aplica sola y antes que las siguientes.

## 3. Acceso, RPC y media

### 3.1 Grants y RLS

`REVOKE ALL` de `anon`, `authenticated` y `PUBLIC`; `GRANT SELECT` mínimo. Sin escritura
directa. Policy de lectura mediante helper en `private` (`search_path=''`, `auth.uid()`):

- Disponibilidad de moderación de experiencia, momento y reseña; sin bloqueo entre el
  que mira y el autor ni el creador.
- Experiencia `lived`.
- **Dentro del grupo** (`private.can_view_experience` como miembro aceptado o creador):
  todas las reseñas.
- **Fuera del grupo**: audiencia `profile`, `share_with_profile=true`, `share_identity=true`
  del autor en esa experiencia y perfil del autor visible para quien mira.

### 3.2 RPC (`SECURITY DEFINER`, identidad de `auth.uid()`, `EXECUTE` revocado de `PUBLIC`)

| RPC | Comportamiento |
|---|---|
| `experience_save_moment_review(p_moment_id, p_rating, p_body)` | Upsert de la reseña propia. Ambos nulos → borra (y su post). Devuelve `id` o nulo. |
| `experience_set_review_sharing(p_review_id, p_enabled)` | Solo autor. Desactivar retira su post en la misma transacción. |
| `experience_delete_moment_review(p_review_id)` | Solo autor; borra su propia reseña. |
| `experience_publish_review(p_review_id)` | Solo autor; exige `share_with_profile` y audiencia `profile`. Idempotente: devuelve el post existente. |
| `experience_unpublish_review(p_review_id)` | Solo autor; borra el post y conserva la reseña. |
| `experience_set_attendance` (existente) | Nuevo parámetro `p_drop_reviews boolean default false`. Si hay reseña y es `false` → `conflict`; si es `true` → borra reseña y post. |

Las RPC bloquean la fila de la experiencia antes de comprobar, como las existentes.

### 3.3 Media derivada

`experience_rating_summary(p_experience_ids uuid[])` → `(experience_id, moment_id null,
avg numeric(3,1), count int)` por experiencia y por momento. `SECURITY INVOKER`: la media
se calcula **sobre las reseñas que puede ver quien llama**. Sin `use cache` (regla #437):
el resultado depende de la sesión.

Cambio de comportamiento decidido explícitamente: fuera del grupo la media solo cuenta
reseñas compartidas, así que puede diferir de la que ve el grupo. Se registra en
`decisiones.md` (precedente #436).

### 3.4 Server actions

En `src/lib/experiences/review-actions.ts`, con resultados `ExperienceResult<T>`:
`saveMomentReview(momentId, {rating, body})`, `setReviewSharing(reviewId, enabled)`,
`deleteMomentReview(reviewId)`, `publishReview(reviewId)`, `unpublishReview(reviewId)`.
`setMomentAttendance` gana `dropReviews?: boolean`. Validación en `validation.ts`:
`rating` entero 1–10 o nulo; `body` recortado ≤4000 o nulo. Invalidación con
`revalidateExperiences(id)` más feed y perfil.

Tipos nuevos en `types.ts`: `ExperienceReview { id, momentId, authorId, authorName,
authorUsername, authorAvatarUrl, rating, body, shareWithProfile, isAuthor, publicationId,
createdAt, updatedAt }`; `ExperienceDetail.reviews: ExperienceReview[]`;
`ExperiencePreview.rating: { avg: number; count: number } | null`.

## 4. Capa social

### 4.1 Publicación en Actividad/feed

- Post `kind='experience_review'`, `anchor_type='experience'`, `anchor_id=experience_id`,
  `source_kind='experience_review'`, `source_id=review_id`, cuerpo nulo.
- Índice parcial único sobre `source_id` con `kind='experience_review'`.
- El post **no copia** nota ni texto: se leen en vivo de la reseña, como `finished` lee
  el pase. Borrar la reseña borra el post.
- La policy restrictiva que protege los posts `experience` se amplía a este kind y exige
  además visibilidad actual de la reseña. Retirar consentimiento, salir, cambiar audiencia,
  bloquear o moderar revoca post, reacciones, comentarios, contexto y avisos.
- La nueva ancla/kind no se ofrece en el selector de pensamientos; la base impide crearla
  desde REST como en la v1.

### 4.2 Feed

Se reutiliza `source:'experience'`. `ExperienceFeedEvent` gana `review: ExperienceFeedReview | null`,
y `ExperienceFeedCard` renderiza la variante de reseña cuando no es nulo. Así se evita
duplicar el camino de cursor, reacciones y comentarios.

### 4.3 Perfil

La pestaña Experiencias del perfil muestra en cada tarjeta la media visible y, si el dueño
del perfil tiene reseñas compartidas en esa experiencia, el extracto de la mejor valorada
(empate: la más reciente) enlazando a su momento.

### 4.4 Avisos

`experience_reviewed` en el canal `social`, con su preferencia. Destinatarios: miembros
aceptados con acceso actual, excepto el autor y bloqueos. Deduplicado por
(reseña, destinatario): editar no reenvía. Copy «X reseñó *Momento*»; el texto de la
reseña no viaja en push.

### 4.5 Moderación

`target_kind='experience_review'` reportable con acceso actual comprobado dentro del
`SECURITY DEFINER`. Retirar la reseña oculta su post. Retirar la experiencia oculta sus
reseñas. Evidencia administrativa con las mismas reglas de la v1.

## 5. UI

### 5.1 Reseñas en el detalle

- Cada momento tiene ancla `id="moment-<id>"`. Debajo de asistencia y favorito, un bloque
  **Reseñas**:
  - **Tu reseña:** con asistencia `attended` en experiencia `lived`, botón «Reseñar» que
    abre `SheetShell` con `RatingDots` interactivo, textarea (≤4000), interruptor
    «Compartir fuera del grupo» con hint de audiencia, y «Publicar en tu actividad»
    habilitado solo con el interruptor activo y audiencia `profile`. Escrita, se muestra
    en lectura con «Editar» y menú (quitar publicación, borrar).
  - **Sin asistencia confirmada:** línea explicativa con enlace a la asistencia de ese
    momento; nunca un botón desactivado sin contexto.
  - **Las de los demás:** avatar, nombre, dots, texto plegado con «Leer más», orden
    cronológico, menú «Denunciar».
- Marcar «no fui» con reseña existente abre una confirmación que explica que la reseña
  (y su publicación) se borrará; confirma con `dropReviews=true`.
- Cabecera: media visible (dots + «N reseñas»). En `trip`, cada momento muestra su media.

### 5.2 «Lo vivimos»

En una experiencia `planned`, el creador ve el botón principal «Lo vivimos»:

1. `updateExperience` pasa a `lived` con la revisión actual (conflicto → «Actualizar»).
2. Hoja con los momentos para confirmar **su** asistencia (marcados por defecto,
   desmarcables).
3. CTA «Reseñar ahora» abre la hoja de reseña del primer momento asistido.

Los demás participantes, con la experiencia ya `lived` y su asistencia sin confirmar, ven
en cada momento «¿Fuiste? Confirma y reseña».

### 5.3 Favorito

`StarIcon` → nuevo `RibbonIcon` (cinta de marcapáginas) en `icons.tsx`. Copy «Mi momento»
/ «Momento de X». No se usa `HeartIcon`, que ya significa reacción.

### 5.4 Tipos nuevos

`food`, `festival`, `sport`, `nature` con icono e ilustración SVG en
`experience-artwork.tsx`, mismo trazo que los actuales (no es pixel art; PixelLab no
aplica). Disponibles en selector de tipo y filtro del hub.

### 5.5 Tarjetas y hub

- `ExperienceCard` (hub, perfil, feed) añade dots + número de reseñas en la fila de
  estado/fecha si hay al menos una nota visible.
- Hub: selector de orden «Recientes» (actual) / «Mejor valoradas» (media visible
  descendente; sin nota al final; cursor estable por `(avg, created_at, id)`).

### 5.6 Copy y accesibilidad

Copy primero en `docs/UI-GLOSARIO.md` y después en `messages/es.json`. Objetivos táctiles
≥44 px, `RatingDots` operable por teclado, errores inline con `role="alert"`, patrón
`conflict` → «Actualizar». WCAG 2.1 AA, tokens Paper.

## 6. Migraciones y despliegue

1. `…_experience_reviews_enums.sql` (sola, en su transacción).
2. `…_experience_reviews_core.sql`: tabla, constraints, triggers, RLS, grants, RPC de
   reseña, media y parámetro de asistencia.
3. `…_experience_reviews_social.sql`: publicar/retirar, índice único, policy de posts,
   avisos y moderación.

Orden: bootstrap vacío local → `biblioshare-dev` → producción. Tras cada entorno:
manifiesto de bootstrap, `database.types.ts`, superficie 6 de `DRIFT-CHECK.md`, y
verificación contra `pg_proc`/`pg_class`/`pg_policies`, no contra el ledger.

## 7. Pruebas

**SQL con rollback** (`supabase/tests/experiences_reviews.sql`). Actores: creador,
aceptado asistente, aceptado no asistente, pendiente, retirado, tercero, anónimo,
bloqueado y admin.

- Sin `attended`, en `planned`/`cancelled` o como invitado sin cuenta: rechazo.
- Cambiar asistencia con reseña: `conflict` sin `p_drop_reviews`; con él, borra reseña y post.
- Revertir a `planned` oculta; volver a `lived` recupera.
- REST directo y joins: terceros no ven reseñas sin consentimiento ni identidades ocultas;
  la media fuera del grupo solo cuenta compartidas.
- Dos publicaciones simultáneas → un post. Retirar consentimiento revoca post, comentarios
  y avisos.
- Denuncia sin acceso rechazada; moderación oculta reseña y post.
- Cero `EXECUTE` de `PUBLIC` en funciones nuevas.

**Unitarios (Vitest):** validación, actions, mapper del feed en batch, hoja de reseña,
bloque de reseñas, «Lo vivimos», tarjeta con media y orden del hub.

**E2E (Playwright)**, contra `next build` + `next start` en 3000, un worker, fixtures de
`e2e/support/experience-fixtures.ts`:

- `experiencias-resenas.spec.ts`: «Lo vivimos» → asistencia → reseñar; otro miembro la
  ve; la media cambia; «no fui» pide confirmación y borra.
- `experiencias-resenas-social.spec.ts`: compartir y publicar; un tercero la ve en el feed
  y en el perfil; retirar consentimiento → post 404; aviso al grupo.

## 8. Documentación de cierre

`data-model.md` (con fecha de verificación), entrada final en `decisiones.md` (reseña por
momento condicionada a asistencia; media sobre reseñas visibles; tabla propia frente a
columnas), casilla en `backlog.md`, glosario, `docs/architecture/graph.json` y evidencia
en `docs/testing/`.

## 9. Issues aparte

- Cabecera del detalle: excluye al organizador cuando mira un invitado y calcula dos
  veces la lista de acompañantes (`area:social`, `tipo:bug`, `P2`).
- El momento solo muestra su primera foto (`area:social`, `tipo:deuda`, `P3`).
