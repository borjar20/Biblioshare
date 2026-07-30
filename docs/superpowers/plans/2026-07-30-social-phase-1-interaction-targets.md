# Social Fase 1 — Interaction Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada objeto interactuable un ID canónico, con FK/cascadas reales, y cerrar las notificaciones y la agrupación de reacciones para toda la superficie social actual.

**Architecture:** `public.interaction_targets` materializa la identidad, dueño, audiencia, URL y tipos de aviso de cada objeto. Comentarios y reacciones apuntan a su UUID canónico; las notificaciones sociales lo referencian opcionalmente. Triggers de las tablas fuente mantienen el registro y las políticas consultan la audiencia dinámica, no un booleano de visibilidad congelado.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, next-intl, Supabase Postgres 17/RLS, Vitest, Playwright.

## Global Constraints

- Parte de `origin/main` con Social Fase 0 ya desplegada; nunca restaures `library_entries` como estado vivo.
- No uses `docs/requirements/social-epic.md` como fuente de requisitos.
- Genera cada migración mediante `supabase migration new <nombre>`; aplica y verifica primero en `biblioshare-dev`, después en producción.
- `interaction_targets` expone solo `SELECT` mínimo, tiene RLS, y ningún cliente puede escribirlo.
- Toda función `SECURITY DEFINER` fija `search_path = public, pg_temp`, valida la sesión cuando corresponda y revoca `EXECUTE` no necesario.
- Sin respuestas anidadas ni nuevas clases visuales de reacción en esta fase; `kind` continúa siendo `like`.
- `diary_entry` y `pass` son targets distintos aunque ambos procedan de `passes`.
- Un reporte conserva snapshot al borrar el target; no añadas una FK de cascada desde `content_reports`.
- La equivalencia de una reacción es exactamente `(notification.type, interaction_target_id)`.
- No modifiques ni añadas al staging los cambios de usuario en `AGENTS.md`, `CLAUDE.md` ni `.claude/skills/`.

---

### Task 1: Migración expansiva, registro canónico y matriz SQL

**Files:**
- Create: migración emitida con `supabase migration new social_interaction_targets_expand`
- Create: `supabase/tests/social_phase1_interaction_targets.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado después de aplicar en dev)

**Interfaces:**
- Produces: `public.interaction_targets(id uuid primary key, kind target_kind, source_id uuid, owner_id uuid, audience_kind interaction_audience_kind, audience_id uuid, href text, commentable boolean, reactable boolean, comment_notification_type notification_type null, reaction_notification_type notification_type null, unique(kind, source_id))`.
- Produces: `public.can_view_interaction_target(p_interaction_target_id uuid) returns boolean`.
- Produces: nullable `interaction_target_id` en `comments`, `reactions` y `notifications`.
- Produces: triggers de fuente y de compatibilidad que rellenan el ID canónico sin aceptar metadatos del cliente.

- [ ] **Step 1: Escribir la regresión SQL que debe fallar**

Parte de la cabecera transaccional de `supabase/tests/social_phase0_rls.sql`. Añade semillas para un pase, sesión, post de club, actividad, checkpoint y comentario, y estas aserciones antes de crear la migración:

```sql
select pg_temp.assert_true(
  to_regclass('public.interaction_targets') is not null,
  'la tabla interaction_targets existe'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.interaction_targets
    where kind = 'pass' and source_id = '60000000-0000-4000-8000-000000000001'
  ),
  'un pase tiene target canónico'
);
```

Incluye `pg_temp.expect_sqlstate` para un comentario/reacción que referencie un UUID de target inexistente (`23503`) y una aserción de que borrar el post elimina su target, comentario, reacción y aviso, pero conserva el reporte con `target_deleted_at` no nulo.

- [ ] **Step 2: Ejecutar la regresión y comprobar RED**

Ejecuta el script en una transacción de `biblioshare-dev`. Debe fallar porque la tabla, las FK y los triggers aún no existen. Conserva el SQLSTATE y el primer mensaje de fallo en las notas de ejecución.

- [ ] **Step 3: Analizar impacto antes de tocar helpers de seguridad**

Ejecuta GitNexus upstream impact para `can_view_target`, `social_target_owner_id`, `cleanup_social_target` y `prepare_content_report`. Si aparece riesgo HIGH o CRITICAL, informa antes de editar. Lee las definiciones reales de `pg_proc` y triggers de dev; no copies una versión antigua del baseline.

- [ ] **Step 4: Crear la migración expansiva**

Descubre la sintaxis con `supabase migration new --help`, genera `social_interaction_targets_expand` y crea:

```sql
create type public.interaction_audience_kind as enum (
  'profile', 'club_member', 'activity_participant', 'checkpoint_reached'
);

create table public.interaction_targets (
  id uuid primary key default gen_random_uuid(),
  kind public.target_kind not null,
  source_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  audience_kind public.interaction_audience_kind not null,
  audience_id uuid not null,
  href text not null check (href like '/%'),
  commentable boolean not null,
  reactable boolean not null,
  comment_notification_type public.notification_type,
  reaction_notification_type public.notification_type,
  unique (kind, source_id),
  check (commentable = (comment_notification_type is not null)),
  check (reactable = (reaction_notification_type is not null))
);

alter table public.interaction_targets enable row level security;
grant select on public.interaction_targets to anon, authenticated;
```

Implementa `private.upsert_interaction_target(...)` sin exposición pública y triggers por tabla fuente. `passes` debe emitir dos filas (`diary_entry`, `pass`); `comments` emite `comment` heredando audiencia y href del padre. Define las filas con esta matriz exacta:

| Kind | Audiencia | `commentable` / `reactable` | Avisos |
|---|---|---|---|
| `diary_entry`, `episode_watch` | `profile`, dueño | true / true | `review_commented` / `review_liked` |
| `club_post` | `club_member`, club | true / true | `club_post_commented` / `club_post_liked` |
| `comment` | hereda del padre | false / true | null / `comment_liked` |
| `pass`, `progress_session` | `profile`, dueño | true / true | `activity_commented` / `activity_liked` |
| `club_activity` | `activity_participant`, actividad | true / true | `activity_commented` / `activity_liked` |
| `activity_checkpoint` | `checkpoint_reached`, checkpoint | true / false | `checkpoint_commented` / null |

Añade al enum `notification_type` los tres valores nuevos `activity_liked`, `activity_commented`, `checkpoint_commented` antes de insertar targets que los usen. Usa `href` de comunidad para reseñas/episodios, ficha del club para posts, detalle de actividad para actividad/checkpoint y la ficha de ítem para pase/sesión. Un comentario usa el `href` del padre.

Implementa `can_view_interaction_target(id)` a partir de `audience_kind`: `can_view_profile(audience_id)`, `is_club_member(audience_id)`, `is_activity_participant(audience_id)` o `has_reached_checkpoint(source_id)`, y el gate bidireccional de Fase 0 contra `owner_id`. Crea políticas `SELECT`/`INSERT`/`DELETE` de comentarios y reacciones que deleguen en este helper y en `commentable`/`reactable`.

Añade columnas nullable y FK diferibles durante el rollout:

```sql
alter table public.comments add column interaction_target_id uuid
  references public.interaction_targets(id) on delete cascade;
alter table public.reactions add column interaction_target_id uuid
  references public.interaction_targets(id) on delete cascade;
alter table public.notifications add column interaction_target_id uuid
  references public.interaction_targets(id) on delete cascade;
```

Backfill: crea primero targets de todas las fuentes existentes, actualiza comentarios/reacciones por `(target_type, target_id)`, actualiza avisos cuyo par legacy tiene target, registra los conteos antes/después y borra solo comentarios/reacciones cuyo ID canónico siga nulo. Mantén temporalmente las columnas legacy y triggers de limpieza de Fase 0. Un trigger `before insert` rellena `interaction_target_id` desde el par legacy durante la ventana de compatibilidad; uno `after insert` de comentarios crea su target propio.

- [ ] **Step 5: Aplicar en dev y verificar GREEN**

Aplica la migración a `biblioshare-dev`, regenera `src/lib/supabase/database.types.ts`, y ejecuta `supabase/tests/social_phase1_interaction_targets.sql`. Deben pasar las FK, las cuatro audiencias, bloqueos, cascadas y supervivencia de reportes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_social_interaction_targets_expand.sql supabase/tests/social_phase1_interaction_targets.sql src/lib/supabase/database.types.ts
git commit -m "feat(social): añade registry canonico de interaction targets"
```

### Task 2: Capa de lectura y DTOs con ID canónico

**Files:**
- Create: `src/lib/social/interaction-targets.ts`
- Test: `src/lib/social/interaction-targets.test.ts`
- Modify: `src/lib/social/interactions.ts`
- Test: `src/lib/social/interactions.test.ts`

**Interfaces:**
- Produces: `InteractionTargetRef { id: string; kind: TargetType; sourceId: string }`.
- Produces: `getInteractionTargetRefs(supabase, refs): Promise<Map<string, InteractionTargetRef>>`, indexado por `${kind}:${sourceId}`.
- Extends: `InteractionSummary.interactionTargetId` y `InteractionComment.interactionTargetId`.

- [ ] **Step 1: Escribir tests RED del resolver por lote**

En `interaction-targets.test.ts`, simula filas repetidas y fuera de orden. Comprueba que la función consulta una vez, deduplica las entradas y devuelve:

```ts
expect(refs.get("pass:pass-1")).toEqual({
  id: "target-pass-1", kind: "pass", sourceId: "pass-1",
});
expect(refs.has("pass:missing")).toBe(false);
```

En `interactions.test.ts`, aporta filas de `interaction_targets`, comentarios y reacciones con `interaction_target_id`; verifica que la summary del source recibe `interactionTargetId` y que un comentario recibe el ID de su target `comment`, no el ID de su padre.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/lib/social/interaction-targets.test.ts src/lib/social/interactions.test.ts`.

Expected: FAIL porque no existe el resolver ni los DTOs canónicos.

- [ ] **Step 3: Implementar el resolver y lectura batch**

Implementa `getInteractionTargetRefs` leyendo `id, kind, source_id` de `interaction_targets` en lotes por `kind`. Mantén la API de `getInteractionSummary(supabase, kind, sourceIds)` para no multiplicar cambios de loaders; primero resuelve los refs, consulta comentarios/reacciones por `interaction_target_id` y retorna el mapa indexado por `sourceId`.

La forma mínima de las nuevas piezas es:

```ts
export type InteractionTargetRef = {
  id: string;
  kind: TargetType;
  sourceId: string;
};

export type InteractionSummary = {
  interactionTargetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
};
```

No aceptes un target ausente como si tuviera cero interacciones: el loader debe lanzar un error de integridad para un source visible sin registro.

- [ ] **Step 4: Ejecutar GREEN**

Run: `npm test -- src/lib/social/interaction-targets.test.ts src/lib/social/interactions.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interaction-targets.ts src/lib/social/interaction-targets.test.ts src/lib/social/interactions.ts src/lib/social/interactions.test.ts
git commit -m "feat(social): expone targets canonicos en la lectura"
```

### Task 3: Acciones de interacción por ID y menciones compatibles

**Files:**
- Modify: `src/lib/social/interaction-actions.ts`
- Modify: `src/lib/social/notify-mentions.ts`
- Test: `src/lib/social/interaction-actions.test.ts`
- Test: `src/lib/social/notify-mentions.test.ts`

**Interfaces:**
- Changes: `toggleReaction(interactionTargetId: string)`, `addComment(interactionTargetId: string, body: string)`.
- Consumes: `interaction_targets` y `notify(..., { interactionTargetId })` de Task 4.
- Preserves: `deleteComment(commentId)` y su autorización RLS.

- [ ] **Step 1: Escribir tests RED para acciones sin mapas por tipo**

Mockea un target canónico `pass` con `reaction_notification_type: "activity_liked"` y uno `activity_checkpoint` con `comment_notification_type: "checkpoint_commented"`. Verifica que:

```ts
await toggleReaction("target-pass");
expect(insertedReaction).toMatchObject({
  interaction_target_id: "target-pass", kind: "like",
});
expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
  interactionTargetId: "target-pass", type: "activity_liked",
}));
```

Añade el caso de autoacción sin aviso y el caso en que `notifyMentions` devuelve al dueño: el comentario conserva la mención y no duplica `activity_commented`.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/lib/social/interaction-actions.test.ts src/lib/social/notify-mentions.test.ts`.

Expected: FAIL por las firmas antiguas y los mapas `LIKE_NOTIFICATION_TYPE`/`COMMENT_NOTIFICATION_TYPE`.

- [ ] **Step 3: Implementar acciones canónicas**

Lee una sola fila de `interaction_targets` por ID y falla con `interaction_target_not_found` si no es visible. Para `toggleReaction`, selecciona/borra/inserta por `interaction_target_id, user_id, kind`; para `addComment`, inserta el ID padre y, tras el trigger, resuelve `kind='comment', source_id=<id del comentario>` para menciones.

Elimina `resolveTargetOwner`, `LIKE_NOTIFICATION_TYPE` y `COMMENT_NOTIFICATION_TYPE`. La acción usa `owner_id`, `commentable`, `reactable` y los tipos de la fila canónica. Conserva el límite de 2.000 caracteres, el redirect a login, el control de bloqueos en RLS y `revalidateInteraction()`.

Actualiza `notifyMentions` para recibir `{ interactionTargetId: string }` en lugar del par polimórfico; su comprobación de entregabilidad consulta la audiencia del target, sin volver a ramificar por `diary_entry`/`club_post`/`episode_watch`.

- [ ] **Step 4: Ejecutar GREEN**

Run: `npm test -- src/lib/social/interaction-actions.test.ts src/lib/social/notify-mentions.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interaction-actions.ts src/lib/social/notify-mentions.ts src/lib/social/interaction-actions.test.ts src/lib/social/notify-mentions.test.ts
git commit -m "refactor(social): escribe interacciones por target canonico"
```

### Task 4: Notificaciones por target y agrupación general de reacciones

**Files:**
- Modify: `src/lib/social/notification-types.ts`
- Modify: `src/lib/social/notifications.ts`
- Modify: `messages/es.json`
- Test: `src/lib/social/notifications.test.ts`

**Interfaces:**
- Extends `NotificationType` con `activity_liked`, `activity_commented`, `checkpoint_commented`.
- Extends `notify`/`notifyMany` con `interactionTargetId?: string`.
- Produces: `Notification.interactionTargetId?: string` y agrupación de reacciones por tipo + target.

- [ ] **Step 1: Escribir tests RED para URL y agrupación**

Amplía el fake de `notifications.test.ts` con `interaction_targets`. Añade tres filas `club_post_liked` sobre `target-post`, dos `comment_liked` sobre `target-comment` y una `activity_commented`. Comprueba que la campana devuelve dos grupos de reacciones con `extraActorsCount` 2 y 1, y el comentario queda individual:

```ts
expect(listed.map((n) => [n.type, n.interactionTargetId, n.extraActorsCount])).toEqual([
  ["club_post_liked", "target-post", 2],
  ["comment_liked", "target-comment", 1],
  ["activity_commented", "target-pass", undefined],
]);
```

Comprueba también que push y campana toman `/club/club-lectura` o la URL de actividad directamente de `interaction_targets.href`, sin llamar a `resolveTargetHrefs` para un target canónico.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/lib/social/notifications.test.ts`.

Expected: FAIL porque el código agrupa solo `review_liked` y solo conoce pares legacy.

- [ ] **Step 3: Implementar notificación canónica**

Conserva `targetType`/`targetId` para avisos no interactivos. Si llega `interactionTargetId`, el writer confiable inserta esa columna; `buildPushPayload` y `listNotifications` cargan `href` y `reaction_notification_type` desde la tabla canónica.

Agrupa una fila si y solo si `row.interaction_target_id` no es nulo y
`row.type === target.reaction_notification_type`; usa la clave
`${row.type}:${row.interaction_target_id}`. No codifiques nombres de tipo de reacción en `listNotifications`.

Añade las claves i18n `activityLiked`, `activityCommented` y `checkpointCommented`, junto a las variantes agrupadas de reacción que la UI ya usa cuando `extraActorsCount` es mayor que cero.

- [ ] **Step 4: Ejecutar GREEN**

Run: `npm test -- src/lib/social/notifications.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/notification-types.ts src/lib/social/notifications.ts src/lib/social/notifications.test.ts messages/es.json
git commit -m "feat(social): agrupa reacciones por target canonico"
```

### Task 5: Conectar consumidores y probar el flujo visible

**Files:**
- Modify: `src/components/social/review-interactions.tsx`
- Modify: `src/components/social/review-card.tsx`
- Modify: `src/components/social/collection-card.tsx`
- Modify: `src/components/social/progress-timeline-card.tsx`
- Modify: `src/components/social/feed-group-card.tsx`
- Modify: `src/components/clubs/club-post-card.tsx`
- Modify: `src/components/clubs/activity-chat.tsx`
- Modify: `src/components/clubs/checkpoints/checkpoint-chat.tsx`
- Modify: `src/components/detail/community-panel.tsx`
- Modify: `src/lib/social/feed.ts`
- Modify: `src/lib/series/get-episode-reviews.ts`
- Test: `src/lib/social/interaction-optimistic.test.ts`
- Test: `e2e/social-interaction-targets.spec.ts`

**Interfaces:**
- Consumes: `InteractionSummary.interactionTargetId` y `InteractionComment.interactionTargetId`.
- Changes: `ReviewInteractions({ interactionTargetId, ... })`; deja de aceptar `targetType` y `targetId`.

- [ ] **Step 1: Escribir RED de reducer y E2E**

Actualiza `interaction-optimistic.test.ts` para que el comentario optimista incluya
`interactionTargetId: "optimistic-comment-target"`; comprueba que el reducer no pierde el
campo al alternar o borrar.

Crea `e2e/social-interaction-targets.spec.ts` con dos cuentas y un club de prueba. Casos:

1. A comenta el pase de B y B ve `activity_commented` con deep-link válido.
2. A comenta un checkpoint creado por B tras alcanzarlo y B ve `checkpoint_commented`.
3. Dos reacciones de A y C al mismo post de B se muestran en una sola entrada agrupada.
4. B borra el post; la API confirma que target, comentarios, reacciones y avisos desaparecieron, mientras el reporte asociado conserva snapshot.

- [ ] **Step 2: Ejecutar RED**

Run: `npm test -- src/lib/social/interaction-optimistic.test.ts` y `npm run test:e2e -- e2e/social-interaction-targets.spec.ts` contra el único servidor de puerto 3000.

Expected: los tests fallan por props y acciones antiguas; el E2E falla al no recibir los avisos nuevos.

- [ ] **Step 3: Cambiar props y loaders sin estado duplicado**

Propaga `summary.interactionTargetId` a cada `ReviewInteractions`. Para likes de comentario usa `c.interactionTargetId`. No añadas fetch cliente: las props siguen llegando de las RSC revalidadas. El comentario optimista usa un ID local solo para render y se sustituye por la revalidación.

Actualiza los builders de feed y comunidad para conservar el ID canónico en su DTO, no para volver a derivarlo en cada tarjeta.

- [ ] **Step 4: Ejecutar GREEN**

Run: `npm test -- src/lib/social/interaction-optimistic.test.ts` y `npm run test:e2e -- e2e/social-interaction-targets.spec.ts`.

Expected: PASS, sin errores de consola ni residuos de datos de prueba.

- [ ] **Step 5: Commit**

```bash
git add src/components/social src/components/clubs src/components/detail/community-panel.tsx src/lib/social/feed.ts src/lib/series/get-episode-reviews.ts src/lib/social/interaction-optimistic.test.ts e2e/social-interaction-targets.spec.ts
git commit -m "feat(social): conecta la UI a interaction targets"
```

### Task 6: Migración de contrato, documentación y cierre de entorno

**Files:**
- Create: migración emitida con `supabase migration new social_interaction_targets_contract`
- Modify: `supabase/schema-baseline.sql` (solo después de producción)
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/backlog.md`
- Append: `docs/requirements/decisiones.md`

**Interfaces:**
- Produces: `comments.interaction_target_id` y `reactions.interaction_target_id` obligatorios y únicos con `user_id, kind` donde corresponda.
- Removes: pares polimórficos heredados y triggers de limpieza que ya sustituye la cascada, solo tras el despliegue de Task 5.

- [ ] **Step 1: Escribir comprobación SQL RED de contrato**

Amplía `supabase/tests/social_phase1_interaction_targets.sql` con:

```sql
select pg_temp.expect_sqlstate(
  $$insert into public.reactions (interaction_target_id, user_id, kind)
    values ('00000000-0000-4000-8000-00000000ffff',
      '00000000-0000-4000-8000-0000000000c3', 'like')$$,
  '23503',
  'una reacción requiere target canónico existente'
);
```

Después de aplicar el contrato, afirma que `target_type`/`target_id` ya no son columnas de `comments` ni `reactions`, y que no queda trigger de limpieza polimórfica sobre esas dos tablas.

- [ ] **Step 2: Verificar que el bundle canónico ya está desplegado**

Antes de la migración destructiva, despliega Task 5 en dev y comprueba acciones reales de comentario/reacción. En producción, aplica primero la migración expansiva y despliega el bundle; no continúes si aún existe tráfico/escritura usando las columnas legacy.

- [ ] **Step 3: Crear y aplicar la migración de contrato**

Genera `social_interaction_targets_contract`. En una transacción valida que no hay nulos:

```sql
do $$ begin
  if exists (select 1 from public.comments where interaction_target_id is null)
     or exists (select 1 from public.reactions where interaction_target_id is null) then
    raise exception 'interaction_target_backfill_incomplete';
  end if;
end $$;
```

Después, haz `not null`, reconstruye el índice único de reacciones como
`unique(interaction_target_id, user_id, kind)`, elimina las columnas legacy solo de
`comments`/`reactions` y retira los triggers de limpieza redundantes. Conserva los campos
legacy nullable de `notifications` para club, invitación y evento.

- [ ] **Step 4: Ejecutar GREEN de esquema**

Aplica en dev, ejecuta el SQL completo y consulta `pg_constraint`, `pg_trigger` y
`information_schema.columns` para probar FK, cascadas y columnas finales. Ejecuta advisors
de seguridad y rendimiento; corrige cualquier finding introducido por la tabla nueva.

- [ ] **Step 5: Actualizar documentación canónica y baseline**

Cuando dev y producción estén verificados, documenta el registro, RLS, FKs, cascadas y tipos
de aviso en `data-model.md`; marca Fase 1 en `backlog.md`; añade una decisión append-only
sobre identidad canónica y no-fusión de `diary_entry`/`pass`. Anexa las dos migraciones a
`schema-baseline.sql` solo tras confirmar producción contra objetos reales.

- [ ] **Step 6: Verificación final y commit**

Run: `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e -- e2e/social-interaction-targets.spec.ts`, advisors, y `docs/DRIFT-CHECK.md`.

Ejecuta GitNexus `detect_changes({scope: "compare", base_ref: "main"})`; confirma que solo
afecta flujos sociales, notificaciones, esquema, tests y documentación. Si GitNexus sigue sin
índice, ejecútalo/actualízalo antes de cerrar y registra el resultado.

```bash
git add supabase/migrations/*_social_interaction_targets_contract.sql supabase/tests/social_phase1_interaction_targets.sql supabase/schema-baseline.sql docs/requirements/data-model.md docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "feat(social): cierra contrato de interaction targets"
```
