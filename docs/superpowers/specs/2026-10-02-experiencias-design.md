# Experiencias — diseño técnico de la primera versión

> **[Diseño propuesto · 2026-10-02 · pendiente de revisión del plan]**
> La propuesta de producto fue presentada y el propietario pidió implementarla.
> Este documento concreta los contratos nuevos; todavía no describe código ni
> esquema aplicado. Seguimiento: [#1293](https://github.com/borjar20/Biblioshare/issues/1293).

Producto de origen: [Experiencias](2026-10-02-experiencias-producto.md).
Plan: [implementación](../plans/2026-10-02-experiencias.md).

## 1. Objetivo y alcance de entrega

Crear, consultar y compartir experiencias culturales y escapadas con momentos,
acompañantes, fotos y favoritos. La captura funciona con un nombre y un estado,
sin catálogo, imagen, acompañantes ni reseña obligatorios. Incluye experiencias
en solitario, planes sin fecha y cancelaciones explícitas.

La entrega abarca captura libre, agrupación, invitaciones, aportaciones, historial,
perfil y feed. La búsqueda de catálogos externos y el recorrido de acompañantes
entre todos los hobbies son ampliaciones rastreadas en #1293; no se simulan con
un buscador vacío ni con datos de demostración.

## 2. Base de trabajo y decisiones de arquitectura

Base observada: `origin/main` en `89d82e83`. La exploración comenzó en una rama
anterior de moderación; los documentos de esta conversación se recuperaron en
`codex/experiencias`, creada desde main sin arrastrar commits de esa rama anterior.
La PR #1184 está fusionada. Main y dev también incluyen los visionados conjuntos:
`post_kind='joint'` y `post_source_kind='joint_viewing'`. La nueva rama conserva
esos contratos; no se reemplazan funciones vivas por copias de
la rama antigua.

Se propone un dominio `experiences` propio. `passes` sigue siendo la fuente de verdad
del estado usuario↔obra de biblioteca. Un recuerdo colaborativo tiene organizador,
miembros y momentos y no se modela como un pase de cada invitado. La incorporación
del dominio se registrará como excepción explícita y limitada a la redacción general
de `inv-passes-hub`, siguiendo el precedente de Partidas; no altera las fuentes de
libros, películas, series, estadísticas o mascota.

Las alternativas de añadir un tipo de obra a todo el catálogo o reutilizar eventos
de clubes requieren estados personales o membresías que no corresponden a este
recorrido. Se reutilizan auth, identidades, bloqueos, posts, notificaciones y moderación.

## 3. Identidad y agrupación

Una experiencia tiene ID y ruta estables. Desde su creación contiene al menos un
momento con ID propio. La captura sencilla guarda ambos atómicamente, sin exigir
que el usuario conozca esa estructura.

La experiencia puede tener forma `single` o `trip`. Ampliar un concierto ya guardado
a una escapada conserva el ID de la experiencia y el del primer momento, sus fotos,
participantes y favoritos. Se cambia el título del conjunto y se añaden momentos;
no se crea otra copia del concierto. El historial enseña una tarjeta por experiencia.

La primera versión agrupa ampliando la experiencia de origen. Fusionar dos recuerdos
independientes preexistentes, con audiencias potencialmente distintas, queda en #1293
como ampliación específica: esta entrega no mueve aportaciones entre grupos.

## 4. Contratos y límites

Tipos sin dependencias de servidor, en `src/lib/experiences/types.ts`:

- `ExperienceShape = 'single' | 'trip'`.
- `ExperienceState = 'planned' | 'lived' | 'cancelled'`.
- `ExperienceAudience = 'private' | 'participants' | 'profile'`.
- `MomentKind = 'concert' | 'show' | 'exhibition' | 'museum' | 'walk' | 'other'`.
- `InvitationState = 'invited' | 'accepted' | 'declined'`.
- `AttendanceState = 'planned' | 'attended' | 'skipped'`.
- `ExperienceResult<T> = { ok: true; data: T } | { ok: false; error: ExperienceError }`.
- `ExperienceError` admite `unauthenticated`, `forbidden`, `not_found`, `invalid`,
  `conflict`, `limit`, `too_large`, `unsupported_image`, `unknown`.

`CreateExperienceInput` contiene `title`, `state:'planned'|'lived'`, `kind` y
`placeLabel?`, `startsOn?`, `endsOn?`; crea forma `single`, audiencia `private` y
primer momento. `UpdateExperienceInput` contiene los campos comunes editables
`title`, `shape`, `state`, `audience`, `startsOn`, `endsOn`. `SaveMomentInput`
contiene `id?`, `title`, `kind`, `placeLabel`, `startsOn`, `endsOn`. Los campos
opcionales se normalizan a `null` en persistencia; no admiten identidades del creador.

Valores: nombre de experiencia o momento de 1–160 caracteres recortados; lugar libre
de hasta 240; etiqueta de acompañante de 1–80; máximo 50 momentos, 30 acompañantes
incluido el creador y 40 fotos por experiencia. Fechas `YYYY-MM-DD` o `null`; cuando
hay inicio y fin, inicio ≤ fin. Los límites se validan tanto en la action como en BD.
Un momento puede tener fecha aunque el conjunto aún no tenga intervalo cerrado.

No hay descarga de URLs aportadas por usuarios ni un catálogo global de lugares.
El lugar inicial es una etiqueta manual. Carteles y fotos se suben como imágenes.

## 5. Persistencia propuesta

Seis tablas públicas, todas con RLS e índices de sus referencias:

| Tabla | Datos principales y reglas |
|---|---|
| `experiences` | `id`, `creator_id`, `title`, `shape`, `state`, `audience`, `starts_on`, `ends_on`, `cover_photo_id`, `revision`, timestamps. El creador es inmutable. `revision` protege ediciones concurrentes. |
| `experience_moments` | `id`, `experience_id`, `title`, `kind`, `place_label`, `starts_on`, `ends_on`, `position`, timestamps. Orden único por experiencia y actualizaciones transaccionales. |
| `experience_participants` | `id`, `experience_id`, `user_id` o `guest_name` —exactamente uno—, `invitation_state`, `share_identity`, timestamps. Una cuenta aparece una vez por experiencia; el creador nace aceptado. Invitados sin cuenta son etiquetas privadas. |
| `experience_moment_participants` | `experience_id`, `moment_id`, `participant_id`, `attendance_state`. FKs compuestas impiden mezclar momentos o personas de experiencias distintas. |
| `experience_favorites` | `experience_id`, `user_id`, `moment_id`. Un favorito por persona y experiencia; el momento pertenece al mismo recuerdo. |
| `experience_photos` | `id`, `experience_id`, `moment_id` opcional, `author_id`, `storage_path`, `mime_type`, `status` (`pending`/`ready`), `share_with_profile`, timestamps. Solo imágenes listas se entregan. |

Se comprueba también que portada y foto pertenecen al mismo recuerdo. Borrar un momento
quita sus favoritos; sus fotos pasan a la galería general dentro de la misma transacción.
No se permite borrar el último momento. Retirar un acompañante revoca acceso y elimina
su presencia en momentos/favoritos, pero conserva sus fotos con autoría y consentimiento
previos hasta que su autor o el organizador las quite.

El autor conserva la facultad de eliminar sus fotos después de salir, por una operación
estrecha que comprueba `author_id`; esto no le permite seguir viendo la experiencia.

Las tablas nacen con `REVOKE ALL` explícito y `GRANT SELECT` mínimo. Las mutaciones
compuestas y las transiciones pasan por RPC. No se añaden columnas a `passes` o `posts`.
Los permisos se comprueban contra objetos reales, además del manifiesto de bootstrap.

Los metadatos completos de fotos, incluidos autor y ruta de Storage, solo se leen
directamente dentro del grupo o por su propio autor. Los visitantes externos leen
`get_experience_visible_photos(uuid)`, una proyección de ID, momento y autor público
opcional; nunca recibe rutas de Storage ni IDs de autores sin consentimiento. La
entrega comprueba `experience_can_read_photo(uuid)` con la sesión y después obtiene
metadatos completos exclusivamente en servidor. Esto evita una fuga por REST que
un simple filtrado visual no resolvería.

## 6. Acceso y privacidad

Las funciones de políticas viven en `private`, con nombres cualificados y
`search_path=''`, siguiendo los helpers actuales de moderación. Usan `auth.uid()`;
no aceptan una identidad del visitante elegida por el cliente. `SECURITY DEFINER`
solo se usa para comprobar membresías sin recursión y para mutaciones transaccionales
que validan identidad y permiso antes de escribir. Se revoca `EXECUTE` de `PUBLIC`.

`private.can_view_experience(id)` exige disponibilidad de moderación y ausencia
de bloqueo con el creador. Después aplica:

- Creador: acceso a su recuerdo.
- `private`: ningún otro acceso.
- `participants`: acceso de miembros aceptados.
- `profile`: además de miembros aceptados, visitantes que puedan ver el perfil del creador.

Invitar a la primera persona cambia expresamente `private` a `participants` en la
misma operación, con copy visible antes del envío. Volver a `private` corta acceso
de todos los demás, aunque las membresías se conserven. Cambiar un perfil a privado,
bloquear o retirar contenido modifica las consultas y las imágenes sin publicar
credenciales de Storage reutilizables.

Un invitado pendiente recibe solo título, fecha y organizador mediante
`get_experience_invitations()`, una RPC con salida acotada y filtro del destinatario.
No accede a la galería, al detalle ni a aportaciones antes de aceptar. Rechazar no
es asistencia. Los bloqueados no reciben invitaciones ni sus resúmenes.

Dentro del grupo se ven acompañantes y aportaciones autorizados. Fuera del grupo:
solo cuentas con `share_identity=true` y perfil visible; nunca etiquetas de invitados.
Fotos externas requieren `share_with_profile=true` del autor. Favoritos y relaciones
de asistencia se filtran por el mismo consentimiento, para no filtrar personas
ocultas mediante IDs o joins REST. Bloquear a un autor oculta sus aportaciones.

## 7. Mutaciones y concurrencia

Las actions viven por responsabilidad en `actions.ts`, `participant-actions.ts`,
`photo-actions.ts` y `publish-actions.ts`, bajo `src/lib/experiences/`. Todas verifican
sesión, validan entradas, usan RPC con la identidad del usuario y devuelven resultados
discriminados; no dependen de mensajes de errores lanzados que Next elimina en producción.

Contratos de servidor:

- `createExperience(input: CreateExperienceInput): Promise<ExperienceResult<{id:string}>>`.
- `updateExperience(id, expectedRevision, input): Promise<ExperienceResult<{revision:number}>>`.
- `deleteExperience(id, confirmation:string): Promise<ExperienceResult<null>>`, solo
  creador, confirmación por nombre y limpieza de imágenes con respeto a evidencia.
- `saveMoment(experienceId, expectedRevision, input): Promise<ExperienceResult<{id:string;revision:number}>>`.
- `removeMoment(experienceId, expectedRevision, momentId)` y
  `reorderMoments(experienceId, expectedRevision, orderedIds)` devuelven la nueva revisión.
- `inviteParticipant(experienceId, userId)` y `addGuest(experienceId, name)` devuelven ID.
- `respondInvitation(participantId, response:'accept'|'decline')`.
- `setMomentAttendance(momentId, state:AttendanceState)` solo cambia la presencia propia;
  el creador puede proponer presencia de otros y registrar invitados sin cuenta,
  pero no sobrescribe una asistencia ya confirmada por otra cuenta.
- `setFavorite(experienceId, momentId:string|null)` y `setShareIdentity(experienceId, enabled)`.
- `removeParticipant(participantId)` acepta al creador o a la propia cuenta, salvo salir
  como creador; no hay transferencia de propiedad en esta versión.
- `uploadExperiencePhoto(experienceId, momentId:string|null, formData)` devuelve ID y URL interna.
- `setPhotoSharing(photoId, enabled)`, `setCoverPhoto(experienceId, photoId:string|null)` y `deletePhoto(photoId)`.
- `publishExperience(experienceId)` devuelve ID de post; `unpublishExperience(experienceId)` conserva el recuerdo.

Cada RPC deriva la identidad de `auth.uid()`, bloquea la fila del recuerdo antes de
comprobar límites y usa el prefijo `experience_`. Las ediciones estructurales requieren
`expectedRevision` y producen `conflict` si otro usuario ya cambió el recuerdo. Los
favoritos, respuestas y consentimientos son operaciones individuales idempotentes.
Las cuotas existentes se reutilizan; no se inventa un segundo sistema de rate limiting.

Se comparte la invalidación en `revalidateExperiences(id?)`: hub, detalle, perfiles y
feed. Los clientes reconcilian con la respuesta y los datos de servidor; no mantienen
una copia permanente independiente del recuerdo.

## 8. Imágenes

Bucket `experience-photos`, privado, sin grants de lectura/escritura directa a
`anon` o `authenticated`. Tamaño máximo 2 MiB; JPEG, PNG y WebP, comprobando MIME y
firma de archivo. El límite actual de actions es 5 MB, por lo que cabe una foto por
envío sin modificar configuración ni instalar dependencias.

El servidor reserva una fila `pending` con ruta generada por él
`<experience_id>/<author_id>/<photo_id>.<ext>`, sube con el cliente de Storage de
servidor y confirma la fila `ready`. Si falla, compensa objeto y reserva. Las reservas
antiguas pendientes son identificables para limpieza acotada; un script de mantenimiento
comprueba proyecto y antigüedad antes de borrar únicamente rutas de esas reservas.

`GET /api/experience-photos/[id]` comprueba permiso mediante la RPC booleana de sesión,
que aplica las mismas reglas RLS; solo después obtiene ruta/MIME y descarga bytes con
el cliente de servidor. Devuelve 404 sin acceso, incluso
al reutilizar una URL anteriormente válida. Un anónimo puede recibir una imagen
publicada si la RLS se lo permite. Cabeceras `private, no-store` y `nosniff`; no redirección
a URL firmada ni optimización/caché pública de estas imágenes.

Se reutiliza el patrón de `src/app/api/voice-notes/[id]/route.ts`, adaptando el permiso
anónimo al caso público. Si una imagen es evidencia administrativa, se conserva
privada y solo se entrega por una ruta administrativa con autorización por petición.

## 9. Compartir, notificaciones y moderación

Ampliaciones aditivas de enums, en una migración anterior a sus consumidores:
`post_anchor_type += 'experience'`, `post_kind += 'experience'`,
`target_kind += 'experience'` y tipos de notificación propios de invitación,
aceptación y publicación (`experience_invited`, `experience_accepted`, `followed_experience`).
No se usa un `ItemType='book'` ficticio como identidad de la experiencia.

`posts` sigue siendo la capa social. Solo el creador publica, mediante RPC que valida
audiencia `profile`. El post tiene ancla al recuerdo, fuente nula y cuerpo opcional.
Un índice parcial único por `anchor_id` y `kind='experience'` impide duplicados incluso
en peticiones simultáneas. Repetir «Compartir» devuelve el post existente. Editar fotos
o momentos no crea nuevas publicaciones.

El feed añade a `FeedEntry` una variante `source:'experience'` con `postId`, actor,
target de interacción y `ExperiencePreview`, sin campos de obra ficticios. Conserva
las claves temporales y el ID `posts:<uuid>`. Se resuelve en batch en el mapper común que utilizan
`getFeed` y `getPostEvent`, conservando cursor, reacciones y comentarios del post.
La nueva ancla no aparece en el selector de pensamientos: solo la RPC de compartir
puede producirla, y la base también impide insertarla desde REST como otro kind.

La visibilidad del post, sus targets, reacciones, comentarios, contexto, notificaciones
y `/post/[id]` exige además acceso actual al recuerdo. Una policy restrictiva protege
las ramas permisivas de autor/moderador existentes; el panel administrativo usa su
RPC separada. Cambiar audiencia, bloquear o retirar revoca también esa publicación.

Los avisos usan los canales `social` existentes, sus preferencias y copys propios.
El aviso de invitación expone solo el resumen permitido. Se filtran por destinatario;
se deduplican para la misma invitación. El título privado no viaja a seguidores ni a
push de personas sin acceso.

La moderación amplía los contratos existentes con `experience`, reportable mediante
su target canónico. Retirar el recuerdo oculta descendientes, fotos y publicaciones.
Restaurarlo no restaura posts retirados por separado. Borrar el post deja el recuerdo.
Eliminar definitivamente el recuerdo conserva la evidencia administrativa autorizada
y revoca su entrega normal; los objetos no usados como evidencia se limpian.

## 10. Navegación y diseño de UI

Rutas: `/experiencias`, `/experiencias/nueva`, `/experiencia/[id]` y
`/experiencia/[id]/editar`. El hub requiere sesión; el detalle admite visitantes
según RLS. Entrada en `youItems` con `CompassIcon` y en «Lo tuyo». Las cinco entradas
principales permanecen. El perfil añade la pestaña Experiencias para dueño y visitante,
filtrando por audiencia. Vividas requiere asistencia propia confirmada; Por vivir
incluye planes aceptados. Una invitación pendiente no aparece como experiencia propia.

El hub muestra tarjetas de imagen/portada, título, fecha y acompañantes visibles;
filtros mediante pills por Por vivir/Vividas/Canceladas, tipo y acompañante. Invitaciones
pendientes viven en un bloque propio con aceptar/rechazar. La forma `single` muestra
un único momento; `trip`, una secuencia visual. El detalle tiene contexto y acciones
en columna lateral en escritorio y hojas de edición móviles existentes.

La captura abre con nombre y Por vivir/Vivida. Lugar, fechas, foto y acompañantes son
ampliaciones opcionales. Ningún formulario pide a un creador una asistencia o favorito
ajeno. Lo destructivo vive en el menú; quitar un momento con aportaciones y eliminar
una experiencia piden confirmación. Errores inline, estados vacíos con acción, labels,
teclado y objetivos táctiles ≥44px; WCAG 2.1 AA. Se usan los tokens Paper actuales.

Todo copy nuevo se añade primero al glosario y después a `messages/es.json`. No se
introducen librerías, permisos nativos, cambios de service worker o marca visual propia.

## 11. Lecturas, caché y pruebas

Las consultas usan el cliente de sesión y RLS, sin `use cache`. Shells de páginas
síncronos con lectores bajo `<Suspense>`, incluyendo lectura de params/searchParams.
No se añade `loading.tsx` a rutas de detalle que deban responder 404 real.

Pruebas de dominio: entradas, fechas desconocidas, límites, estados, agrupación
estable y errores/concurrencia. Pruebas SQL con datos sintéticos y rollback:
creador, aceptado, pendiente, tercero, anónimo, bloqueado y admin; filas y joins directos,
cuotas, RPC, FK cruzadas, carreras y permisos de `PUBLIC`.

E2E Playwright contra `next build` + `next start`, un servidor en 3000, un worker y
tandas pequeñas: captura mínima, ampliar a escapada, respuestas/asistencia distintas,
fotos/favoritos, perfil/feed y reutilizar URL tras revocación. Semilla y limpieza por
REST antes y después, preservando cuentas persistentes. La evidencia distingue local,
dev y producción; no se declara verificado un entorno solo por el ledger de migraciones.

Las migraciones se prueban desde bootstrap vacío, después en `biblioshare-dev`. El
despliegue en producción es una operación final independiente, con el resultado ya
revisable y la verificación de dev disponible. #1293 conserva el seguimiento de release.

## 12. Fuentes y comprobaciones realizadas

Se consultaron el mapa de arquitectura y los docs canónicos, el código de feed,
anclas, acciones, navegación, perfiles, imágenes y moderación; los enums, policies,
triggers y funciones reales de dev por consulta de solo lectura; y el estado de la PR #1184.

Documentación vigente: guía local Next `01-app/01-getting-started/07-mutating-data.md`
y `06-fetching-data.md`; Context7 `/vercel/next.js` sobre autorización de actions y
`/supabase/supabase` sobre RLS de membresías; docs oficiales de
[Storage privado](https://supabase.com/docs/guides/storage/serving/downloads) y
[caché de URLs firmadas](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
El changelog de Supabase se revisó; este diseño no usa los índices o cifrados afectados
por la actualización menor de PostgreSQL ni cambia los SDK actuales.
