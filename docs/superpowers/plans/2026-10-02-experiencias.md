# Experiencias — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar Experiencias con captura libre, escapadas, acompañantes, fotos,
favoritos y publicación social, respetando la privacidad en todos sus accesos.

**Architecture:** Dominio `experiences` con seis tablas RLS y mutaciones RPC. Un
recuerdo mantiene IDs estables al crecer de salida sencilla a escapada. Posts
referencia ese recuerdo; imágenes privadas se entregan tras autorización por petición.

**Tech Stack:** Node 22.23.1, Next.js 16.3.8 (lockfile de main), React 19.2.4, TypeScript 5,
Supabase PostgreSQL 17, next-intl 4, Tailwind 4, Vitest y Playwright existentes.

**Spec:** `docs/superpowers/specs/2026-10-02-experiencias-design.md` y su
propuesta de producto `docs/superpowers/specs/2026-10-02-experiencias-producto.md`.

**Estado:** aprobado el 2026-10-02; tareas 1–5 implementadas y verificadas en local/dev; tarea 6 en revisión final.
**Seguimiento:** [#1293](https://github.com/borjar20/Biblioshare/issues/1293).
**Método recomendado:** ejecución en este chat, tarea a tarea, y revisión independiente final.

## Global Constraints

- Node 22.23.1; conservar versiones y lockfile, sin nuevas dependencias.
- `passes` sigue siendo fuente de verdad del estado usuario↔obra; registrar la excepción
  limitada del nuevo dominio antes de dar su implementación por terminada.
- Sin `use cache` para estos lectores de sesión. Hub/captura con shell síncrono y
  `<Suspense>`; detalle/edición con `instant=false` y preflight RLS en proxy para 404 real.
- Nombre 1–160 caracteres; lugar ≤240; acompañante 1–80; 50 momentos, 30 acompañantes
  incluido el creador y 40 fotos. Fechas opcionales `YYYY-MM-DD`, inicio ≤ fin.
- JPEG, PNG y WebP, máximo 2 MiB por imagen. Bucket privado, sin URL firmada entregada.
- Español, glosario primero, Paper y WCAG 2.1 AA; cero toasts y acciones destructivas en menú.
- Main incluye `joint`/`joint_viewing` y moderación #1184: conservar sus consumidores y SQL.
- Dev primero; comprobar objetos reales, grants y superficie 6 si se añade alguna columna.
- Un servidor en puerto 3000, un worker E2E, limpieza antes/después por REST y al cerrar sesión.

## Review Focus

1. Una URL de imagen copiada pierde acceso tras bloqueo o cambio de audiencia; prueba en tarea 4.
2. Una cuenta invitada ve el resumen, pero no fotos ni asistencia hasta aceptar; pruebas en tareas 1 y 3.
3. Un anónimo no deduce invitados privados mediante joins, favoritos o IDs; pruebas SQL en tareas 1 y 5.
4. Dos ediciones/publicaciones simultáneas conservan orden y un único post; pruebas en tareas 1 y 5.
5. Un creador que marca un viaje vivido no escribe asistencia de los demás; pruebas en tarea 3.

---

## Preparación de la rama

- [x] Registrar una instantánea Git de los documentos de esta conversación, sin incluir
  archivos ajenos. Crear o reutilizar `codex/experiencias` y actualizarla con `origin/main`;
  preservar las entradas de backlog/decisiones al resolver conflictos documentales.
- [x] Verificar `git status`, base, Node, puerto 3000 y worktrees. El checkout actual basta
  si no hay trabajo paralelo; no crear otro por costumbre.
- [x] Leer ambas specs y crear el ledger de ejecución del plan. Registrar las decisiones
  necesarias para ajustes sin reiniciar tareas ya terminadas.

## Tarea 1: Persistencia, privacidad y transiciones comprobables

**Files:**
- Create: `src/lib/experiences/types.ts`, `src/lib/experiences/validation.ts`,
  `src/lib/experiences/validation.test.ts`.
- Create: migraciones mediante `supabase migration new experiences_enums` y
  `supabase migration new experiences_core`; conservar los nombres que genere el CLI.
- Create: `supabase/tests/experiences_access.sql`, `supabase/tests/experiences_transitions.sql`.
- Modify: `supabase/bootstrap/manifest.json`, `supabase/schema-baseline.sql`,
  `scripts/db/verify.mjs`, `src/lib/supabase/database.types.ts`.

**Interfaces:** tipos y límites del §4; seis tablas del §5. Helpers
`private.can_view_experience(uuid)`, `private.can_contribute_experience(uuid)` y
`private.can_view_experience_photo(uuid)` derivados de `auth.uid()`.
RPC de dominio `experience_create(jsonb)`, `experience_update(uuid,bigint,jsonb)`,
`experience_save_moment(uuid,bigint,jsonb)`, `experience_remove_moment(uuid,bigint,uuid)`
y `experience_reorder_moments(uuid,bigint,uuid[])`, con respuestas del §7.

- [x] Escribir tests de validación: solo nombre/estado, intervalos inválidos, fechas nulas,
  límites exactos y UUIDs inválidos. Escribir SQL de siete actores con datos sintéticos.
- [x] Ejecutar los tests nuevos antes de implementar y guardar el fallo esperado.
- [x] Definir los tipos/validadores y crear la migración de enums aditiva, incluyendo
  invitaciones/publicación y moderación. No usar valores nuevos en su misma transacción.
- [x] Crear las seis tablas, FKs compuestas, índices y bucket privado en la migración core.
- [x] Implementar helpers RLS sin recursión; grants mínimos y revocación de `PUBLIC`.
- [x] Implementar creación/edición/orden atómicos con locks, revisiones y cuotas existentes.
- [x] Añadir pruebas que rechacen reordenación ajena, borrar último momento, FK de otro
  recuerdo, reasignación de creador y asistencia ajena. Probar visibilidad de guest rows/IDs.
- [x] Probar simultáneamente dos ediciones con la misma revisión: una gana y otra devuelve
  conflicto, sin perder momentos. Integrar verificación con el runner de DB.
- [x] Registrar migraciones en el manifiesto; ejecutar `npm run db:baseline` y
  `npm run test:db:bootstrap`. Arrancar/validar el bootstrap local desechable y los SQL nuevos.
- [x] Generar tipos contra el esquema de prueba, preservando todos los contratos de main.
- [x] Repetir unitarios y SQL: todas las comprobaciones nuevas pasan. Commit de esta tarea.

## Tarea 2: Captura libre, detalle y crecimiento a escapada

**Files:**
- Create: `src/lib/experiences/queries.ts`, `src/lib/experiences/actions.ts`,
  `src/lib/experiences/actions.test.ts`.
- Create: `src/app/experiencias/page.tsx`, `src/app/experiencias/nueva/page.tsx`,
  `src/app/experiencia/[id]/page.tsx`, `src/app/experiencia/[id]/editar/page.tsx`.
- Create: `src/components/experiences/experience-card.tsx`, `experience-form.tsx`,
  `experience-detail.tsx`, `moment-editor.tsx`, `experience-filters.tsx` en ese directorio.
- Create: `e2e/experiencias-captura.spec.ts`, `e2e/support/experience-fixtures.ts`.
- Modify: `src/lib/reactivity/revalidate.ts`, `docs/UI-GLOSARIO.md`, `messages/es.json`.

**Interfaces:** `createExperience`, `updateExperience`, `saveMoment`, `removeMoment`,
`reorderMoments` y `deleteExperience` del §7; `getExperiences(filters): Promise<ExperiencePage>`,
`getExperience(id): Promise<ExperienceDetail|null>` y `revalidateExperiences(id?)`.
`ExperiencePage` contiene `items` y `nextCursor`; tamaño 20, orden estable `(created_at,id)`.

- [x] Escribir tests de actions para falta de sesión, errores SQL normalizados, conflicto
  y revalidación. Preparar E2E de captura mínima y ampliación conservando IDs.
- [x] Ejecutar nuevos tests y confirmar el fallo esperado antes de implementar.
- [x] Implementar lectores de sesión y filtros/paginación sin caché compartida.
- [x] Implementar actions de captura/edición sobre RPC y revalidación centralizada.
- [x] Implementar borrado del recuerdo por creador, con confirmación por nombre, revocación
  de referencias sociales y conservación de la evidencia requerida por moderación.
- [x] Introducir los términos Experiencia/Escapada/Momento/Acompañante en el glosario y copy.
- [x] Construir hub, captura y detalle con primitives existentes; nombre/estado mínimos,
  filtros, Canceladas, vacíos con acción y 404 real previo al streaming del detalle.
- [x] Añadir edición/reordenación de momentos; ampliar un concierto a escapada reutiliza
  experiencia y primer momento. Eliminar con aportaciones requiere confirmación.
- [x] Verificar por E2E: plan sin fecha, experiencia en solitario, cancelación y dos momentos
  ordenados, sin texto descriptivo. Sembrar/limpiar fixtures antes y después por REST.
- [x] Ejecutar unitarios, lint de los archivos y E2E focalizados; commit de esta tarea.

## Tarea 3: Acompañantes, invitaciones, asistencia y favoritos

**Files:**
- Create: migración con `supabase migration new experiences_participation`.
- Create: `src/lib/experiences/participant-actions.ts`, `participant-actions.test.ts`,
  `src/components/experiences/experience-participants.tsx`, `experience-invitations.tsx`,
  `moment-attendance.tsx`, `moment-favorite.tsx`, `e2e/experiencias-participacion.spec.ts`.
- Modify: queries/types, manifesto/bootstrap, verificador SQL, `messages/es.json`,
  `src/lib/social/notification-types.ts`, `notification-copy.ts`, `notification-context.ts`,
  `notifications.ts` y `src/lib/push/types.ts`.

**Interfaces:** `inviteParticipant`, `addGuest`, `respondInvitation`, `setMomentAttendance`,
`setFavorite`, `setShareIdentity`, `removeParticipant` (§7). RPC
`get_experience_invitations()` devuelve solo ID de invitación/recuerdo, título, fecha
y organizador de invitaciones dirigidas al caller.

- [x] Escribir SQL/actions/E2E para pendiente/aceptado/rechazado, guest privado y favorito
  ajeno rechazado; ejecutar y observar fallos antes de añadir las mutaciones.
- [x] Implementar las RPC de participación con locks y ownership individual. Invitar cambia
  audiencia privada a participantes; nunca confirma asistencia ni favorito de otra cuenta.
- [x] Añadir resúmenes de invitación y avisos en campana/push por canal social, sin filtrar
  títulos privados a seguidores. Reenvíos no duplican el aviso de la misma invitación.
- [x] Añadir selector de cuentas respetando bloqueos, invitados con etiqueta y respuesta.
- [x] Añadir presencia por momento y favorito propio; invitar/aceptar/asistir son distintos.
- [x] E2E de tres personas: una no va al museo; el creador marca el viaje vivido y las otras
  conservan su presencia pendiente hasta confirmarla. Quitar miembro revoca su acceso.
- [x] Probar perfiles privados y consentimiento de identidad, tanto por UI como por REST.
- [x] Pasar tests de participación/notificaciones y las regresiones de visionados conjuntos;
  actualizar manifiesto y commit de esta tarea.

## Tarea 4: Galería y portadas con entrega autorizada

**Files:**
- Create: `src/lib/experiences/photo-actions.ts`, `photo-actions.test.ts`,
  `src/lib/storage/experience-photos.ts`, `experience-photo-response.ts`,
  `experience-photo-response.test.ts`, `src/app/api/experience-photos/[id]/route.ts`.
- Create: `src/components/experiences/experience-gallery.tsx`, `experience-photo-upload.tsx`,
  `scripts/experiences/cleanup-pending-photos.mjs`, `e2e/experiencias-imagenes.spec.ts`.
- Create: migración con `supabase migration new experiences_photo_mutations`.
- Modify: detalle/formulario, manifiesto/bootstrap/verificación, `messages/es.json`.

**Interfaces:** foto `pending`→`ready`; ruta generada por servidor. Actions de fotos/portada
del §7, con result discriminado. `get_experience_visible_photos(uuid)` produce metadatos
externos enmascarados; `experience_can_read_photo(uuid)` autoriza entrega sin exponer
Storage paths. `GET /api/experience-photos/[id]` valida esa RPC con sesión antes de obtener
ruta/bytes en servidor; 404 sin acceso, MIME explícito y cabeceras privadas/no-store.

- [x] Escribir tests de tamaño exacto, MIME/firma incorrectos, archivo ajeno, fallo de Storage
  y cancelación de reserva; ejecutar el fallo esperado.
- [x] Implementar reserva/subida/confirmación y compensación. El script de limpieza acepta
  proyecto dev/local explícito y solo elimina reservas pending antiguas y sus rutas.
- [x] Implementar proxy autorizado sin URL firmada ni lectura pública del bucket.
- [x] Probar REST con visitante externo: la tabla de fotos no expone rutas ni autor_id;
  la proyección pública solo devuelve identidades consentidas y visibles.
- [x] Implementar galería, portada propia y consentimiento por imagen, con autoría visible.
- [x] Probar foto ajena como portada, foto de otro recuerdo y publicar imagen sin consentimiento.
- [x] E2E: copiar URL, bloquear al visitante o volver a privado y volver a solicitar esa URL;
  devuelve 404. Verificar anónimo solo para foto expresamente publicada, y sin caché pública.
- [x] Probar que un autor saliente puede eliminar su imagen sin recuperar acceso al grupo.
- [x] Pasar tests de imágenes y regresiones de audio privado, actualizar manifiesto y commit.

## Tarea 5: Perfil, feed, publicación única y moderación

**Files:**
- Create: `src/lib/experiences/publish-actions.ts`, `publish-actions.test.ts`,
  `src/components/social/experience-feed-card.tsx`,
  `src/app/u/[username]/_tabs/experiences-tab.tsx`, `e2e/experiencias-social.spec.ts`.
- Create: migración con `supabase migration new experiences_social_visibility`.
- Modify: `src/components/nav/nav-items.ts`, `src/components/section-tabs.tsx`,
  `src/app/u/[username]/page.tsx`, `src/lib/catalog/anchor.ts`,
  `src/lib/social/post-kinds.ts`, `post-actions.ts`, `feed.ts`, `notify-categories.ts`,
  `src/components/social/feed-item.tsx`, `src/app/post/[id]/page.tsx`,
  `src/lib/social/profile-feed-buckets.ts`, `src/components/social/profile-activity-feed.tsx`,
  `src/lib/moderation/contracts.ts`, `queries.ts`, admin consumers y `messages/es.json`.
- Modify: enum/tabla de tipos generados, manifiesto/bootstrap y verificadores SQL.

**Interfaces:** post `kind='experience'`, `anchor_type='experience'`, fuente nula,
cuerpo opcional. `publishExperience` idempotente solo para creador y audiencia profile;
`unpublishExperience` elimina publicación, conserva el recuerdo. Nueva variante de feed
`source:'experience'` y `ExperiencePreview` real, sin falsear `ItemType`.
`getProfileExperiences(userId,filters)` comprueba visibilidad del perfil; Vividas exige
asistencia confirmada y Por vivir permite planes aceptados, nunca invitaciones pendientes.

- [x] Escribir tests de publicación privada/ajena prohibida, dos llamadas simultáneas con
  único post, cursor con posts de tipos mezclados y modo joint preservado; ejecutar RED.
- [x] Implementar RPC de publicación, índice parcial único y guard SQL del ancla/kind.
- [x] Añadir policy restrictiva y actualizar helpers de targets/moderación para comprobar
  acceso al recuerdo en post, comentarios, reacciones, contexto y notificaciones.
- [x] Extender mapper común de feed/detalle con batch de experiencias; añadir tarjeta y
  contexto propios. Mantener filtros existentes y el cursor; sin N+1 por tarjeta.
- [x] Añadir enlace en Tu cuenta/Lo tuyo con CompassIcon y pestaña de perfil para ambos roles.
- [x] Extender reporte/retirada/restauración/borrado administrativo de la experiencia,
  conservando evidencia privada de fotos y evitando recrear un post moderado.
- [x] E2E de feed y perfil: compartir dos veces, cambiar audiencia, perfil privado, visitante
  bloqueado, foto/identidad sin consentimiento y anónimo con joins directos a tablas hijas.
- [x] Probar retiro del padre, restauración sin restaurar un post retirado por separado y
  borrado de post sin borrar recuerdo. Verificar que las imágenes quedan revocadas.
- [x] Pasar regresiones focalizadas de posts, cursores, joint y moderación; commit de esta tarea.

## Tarea 6: Verificación integral, dev y documentación verdadera

**Files:**
- Create: `playwright.experiencias.config.ts`, `docs/testing/2026-10-02-experiencias.md`.
- Modify: `docs/requirements/data-model.md`, `backlog.md`, `decisiones.md`,
  `docs/PROYECTO.md`, `docs/SEGURIDAD.md`, `docs/architecture/graph.json`,
  `docs/ARQUITECTURA.md` y los docs de contratos que cambien efectivamente.

- [ ] Ejecutar typecheck, lint apropiado y unitarios de las tareas más sus regresiones.
- [ ] Reconstruir esquema vacío con bootstrap y comprobar enums/helpers/grants reales,
  incluidos PUBLIC y grants por columna; ejecutar superficie 6 si cambió alguna columna.
- [ ] Aplicar migraciones a `biblioshare-dev` tras comprobar la ausencia/presencia real de
  objetos, conservando las funciones adicionales de dev. Verificar RLS/RPC/media con JWTs
  de actores distintos; ejecutar advisors y corregir problemas introducidos.
- [ ] Construir producción con Node 22.23.1 y ejecutar las cinco familias E2E en tandas pequeñas,
  usando `next start` en 3000 y configuración dedicada sin limpieza global ajena.
- [ ] Revisar visualmente móvil/escritorio y accesibilidad de las pantallas nuevas; guardar
  evidencia. Ejecutar una revisión independiente de todo el cambio y resolver hallazgos.
- [ ] Sincronizar esquema/seguridad/arquitectura/glosario y registrar la decisión explícita
  del dominio; fechas de verificación precisas por entorno. Marcar solo lo realmente terminado.
- [ ] Actualizar #1293 con entregas y evidencia; registrar aparte cualquier fallo ajeno,
  con área/tipo/prioridad, y mantener ahí las ampliaciones y el release no ejecutado.
- [ ] Limpiar datos de test, reservas de fotos, servidores y recursos locales creados. Commit final.

## Contrato de terminación

Todos los recorridos del alcance funcionan y pasan pruebas de producción contra dev
o entorno local indicado. La documentación coincide con lo entregado y la rama es
revisable. No se afirma despliegue en producción sin haberlo ejecutado y comprobado.
La aplicación de migraciones y publicación de producción se presentan como operación
final concreta después de la validación; su estado permanece en #1293.

## Autorrevisión del plan

Cobertura: captura/agrupación en tarea 2; personas/favoritos en 3; imágenes en 4;
perfil/feed/moderación en 5; privacidad/esquema en 1 y verificación multiusuario en 6.
Cada riesgo de Review Focus tiene prueba asignada. El catálogo externo, la fusión de
recuerdos independientes y el filtro entre hobbies permanecen explícitamente en #1293.
Tipos y firmas se comparten desde tarea 1; las migrations tienen nombres generados por
CLI y orden por dependencia. Los commits incluyen solo archivos de su tarea.
