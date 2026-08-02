# Social Fase 1 — Núcleo de interacción: `interaction_targets`

> **[Histórico · congelado el 2026-07-30]** Diseño aprobado para ejecutar después de la Fase 0. Describe la migración del modelo de interacciones; el estado actual y el esquema desplegado siguen mandando en `docs/requirements/`.

## Objetivo

Reemplazar las referencias polimórficas sin integridad de comentarios y reacciones por un
target canónico con ID propio. El target centraliza identidad, dueño, audiencia, visibilidad,
URL y tipos de notificación; las interacciones pasan a tener FK y cascadas reales. Todos los
targets comentables cierran el bucle de notificación y la campana agrupa cualquier reacción
equivalente.

Este diseño parte de la Fase 0 ya desplegada y verificada contra los objetos reales de dev y
producción. No usa `docs/requirements/social-epic.md` como fuente de requisitos.

## Alcance

Incluye:

- Crear `public.interaction_targets` con un UUID canónico por target.
- Migrar solo comentarios y reacciones cuyo target fuente exista y sea válido.
- Referenciar el target canónico desde comentarios, reacciones y notificaciones sociales.
- Sustituir la limpieza polimórfica de comentarios/reacciones/notificaciones por FK y cascadas
  desde el target.
- Centralizar dueño, audiencia, URL, visibilidad y tipo de aviso en el contrato del target.
- Completar las notificaciones de todos los targets comentables.
- Agrupar en la campana toda reacción del mismo tipo sobre el mismo target canónico.

No incluye respuestas anidadas, una paleta de reacciones, una bandeja de moderación ni
preferencias de notificaciones.

## Modelo

### `interaction_targets`

La tabla es una proyección materializada de los objetos que admiten interacción. Sus filas se
crean, sincronizan y borran exclusivamente desde triggers de las tablas fuente; ni `anon` ni
`authenticated` reciben permisos de escritura.

Campos conceptuales:

| Campo | Significado |
|---|---|
| `id uuid primary key` | Identidad que consumen comentarios, reacciones y notificaciones sociales. |
| `kind target_kind` + `source_id uuid` | Identidad de origen, única como pareja. |
| `owner_id uuid` | Destinatario potencial de las notificaciones y dueño para bloques/moderación. |
| `audience_kind` + `audience_id` | Perfil, miembros de club, participantes de actividad o quienes alcanzaron un checkpoint. |
| `href text` | Destino canónico para la campana y push. |
| `commentable`, `reactable` | Capacidades del target. |
| `comment_notification_type`, `reaction_notification_type` | Tipos de aviso, nulos solo cuando la capacidad correspondiente no existe. |

`(kind, source_id)` es único. `diary_entry` y `pass` permanecen separados aunque ambos salgan
de `passes`: uno es la conversación de la reseña/cierre y el otro la del alta en el feed.

La visibilidad no se guarda como booleano. Las políticas consultan la audiencia vigente, la
privacidad del contenido, la membresía/participación y el bloqueo bidireccional al leer o
escribir. Así, ningún cambio de privacidad deja una fila de target obsoleta.

### Referencias y cascada

- `comments.interaction_target_id` y `reactions.interaction_target_id` son `not null` y FK a
  `interaction_targets(id) on delete cascade` al finalizar el rollout.
- `notifications.interaction_target_id` es nullable: se rellena para avisos sociales de una
  interacción; los avisos de invitación, club y evento que no son interacción conservan sus
  referencias heredadas.
- Un comentario genera su propio target `kind = 'comment'`, necesario para reaccionar a él;
  su comentario padre sigue apuntando al target sobre el que conversa.
- Al desaparecer una fila fuente, el trigger elimina sus targets y las FK eliminan comentarios,
  reacciones y avisos asociados. Los `content_reports` no reciben FK de cascada: el mecanismo
  existente conserva su snapshot y marca el reporte como actuado.

## Sincronización de fuentes

Triggers de inserción/actualización/borrado mantienen los targets de:

- `passes`: `diary_entry` y `pass`.
- `episode_watches`, `club_posts`, `progress_sessions`, `club_activities` y
  `club_activity_checkpoints`.
- `comments`: target `comment`, con audiencia y URL heredadas del padre.

Los triggers recalculan el dueño, audiencia, capacidades, URL y tipos de notificación. Los
cambios que afecten la ruta, como un slug de club, refrescan los targets dependientes. La
construcción de URL no queda repartida entre `interaction-actions.ts` y `notifications.ts`.

## Notificaciones

Las acciones reciben un ID canónico y leen del target el dueño y el tipo de aviso. Mantienen el
carácter best-effort y el filtro de bloqueo de Fase 0. Si una mención ya notificó al dueño del
contenido, se suprime el aviso genérico de comentario como hoy.

| Target | Reacción | Comentario |
|---|---|---|
| `diary_entry`, `episode_watch` | `review_liked` | `review_commented` |
| `club_post` | `club_post_liked` | `club_post_commented` |
| `comment` | `comment_liked` | — |
| `pass`, `progress_session`, `club_activity` | `activity_liked` | `activity_commented` |
| `activity_checkpoint` | — | `checkpoint_commented` |

La agrupación de la campana identifica una reacción por
`(notification.type, notification.interaction_target_id)`. No existe una excepción para
`review_liked`: se agrupan reseñas, posts, comentarios y actividades de la misma manera. Dos
targets distintos nunca se fusionan aunque compartan tabla fuente.

## Rollout compatible

1. Migración aditiva: tabla, grants mínimos, RLS, triggers, backfill y columnas nullable de
   target canónico.
2. El backfill inserta únicamente pares `(kind, source_id)` cuya fila fuente exista. Cuenta y
   registra los descartes antes de eliminar residuos inválidos.
3. Despliegue de aplicación: DTOs, lecturas y acciones usan `interaction_target_id`.
4. Migración de contrato: rellena pendientes, hace obligatorias las FK de comentarios y
   reacciones, y elimina los pares polimórficos heredados de esas dos tablas.
5. Los triggers de Fase 0 que limpian comentarios/reacciones/notificaciones se sustituyen por
   el borrado del target; los triggers de evidencia de reportes se preservan.

No se elimina ninguna columna heredada hasta que el bundle que la escribe ya no pueda estar
activo. Dev se migra y verifica antes de producción.

## Seguridad

`interaction_targets` habilita RLS y expone solamente `select` a los roles que necesite el
cliente. Sus escrituras quedan en triggers y funciones privadas. Las políticas de
`comments`/`reactions` delegan la audiencia al target, con checks de bloqueos bidireccionales
y de capacidad. Cada migración declara grants explícitos junto con sus políticas.

## Verificación

- SQL transaccional: backfill válido, conteos de descarte, FK, cascadas para cada fuente y
  supervivencia de reportes.
- Matriz RLS: perfil público/privado, club, participante, checkpoint alcanzado, propio y
  bloqueo en ambos sentidos.
- Unitarias: resolución de DTOs, acciones por ID canónico y agrupación de cada familia de
  reacción.
- E2E focalizado: comentario y reacción con aviso/deep-link para todos los targets
  comentables, incluida actividad de feed y checkpoint.
- Advisors de seguridad/rendimiento y `docs/DRIFT-CHECK.md` tras aplicar en dev; repetir
  consultas de objetos reales y smoke tests en producción antes de actualizar el baseline.

## Decisiones

- Se elige ID canónico frente a FK compuesta: evita que el polimorfismo reaparezca en acciones,
  URLs y agrupación de notificaciones.
- La URL se materializa y sincroniza; la visibilidad permanece dinámica para no congelar
  privacidad, membresías ni bloqueos.
- La equivalencia de reacciones es exactamente mismo tipo de aviso y mismo target canónico.
- Los targets de `passes` no se fusionan entre `diary_entry` y `pass`.
