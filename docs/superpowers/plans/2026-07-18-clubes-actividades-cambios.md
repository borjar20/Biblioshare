# Cambios de actividades de club — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el detalle de actividad de club: barra de acciones unificada, chat general que sustituye las opiniones por ítem, retirada de la lista genérica de ítems, y vista previa para no-participantes.

**Architecture:** Todo el cambio funcional vive en `components/clubs/activity-detail.tsx` y `lib/clubs/activities/core.ts`. El chat general reutiliza el sistema de interacciones/comentarios existente con un **target nuevo `club_activity`** (una migración: valor de enum + una rama en `can_view_target`), en vez de una tabla propia — igual que el chat de hito reutiliza `activity_checkpoint`. La tabla `club_activity_opinions` se deja **muerta (sin DROP)**.

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase (Postgres + RLS), next-intl, Tailwind, Playwright (e2e) + Vitest.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-07-18-clubes-actividades-cambios-design.md`. Sección del plan: `docs/redesign/plan-04-clubes.md` §6.
- **No unit-TDD para UI:** este proyecto verifica con `tsc --noEmit` + `eslint` + Playwright e2e + comprobación en navegador (ver `docs/TESTING.md`). Cada tarea termina con esas comprobaciones, no con un test unitario primero (salvo la migración, que se verifica con SQL).
- **Node 22** para Playwright/Vitest: `fnm use` antes de `npx playwright test`.
- **Migraciones:** aplicar primero a DEV (Management API), verificar, y solo al cierre a PROD (`mcp__supabase__apply_migration`) + actualizar `schema-baseline.sql`. MCP de Supabase está fijado a PROD; para DEV usar la Management API (ver [[supabase-environments]]).
- **Enum de Postgres:** un valor de enum recién añadido no puede usarse en la misma transacción; el idiom del repo es `alter type … add value 'x';` seguido de `commit;` antes de recrear la función que lo usa (ver `20260713_activity_checkpoints.sql`).
- **Copy en español**, claves i18n en `messages/es.json` (único locale).
- **La lectura con hitos (`buddy_read`) NO recibe chat general** — conserva sus chats por hito.
- Trabajar en el worktree `plan-04-replan` (rama `worktree-plan-04-replan`); commits pequeños; NO push a main.

---

### Task 1: Migración — target de interacciones `club_activity`

Habilita comentar/reaccionar sobre una actividad (el chat general), gateado a participantes. Sin tabla nueva: reutiliza `comments`/`reactions`, cuyas políticas ya delegan en `can_view_target(target_type, target_id)`.

**Files:**
- Create: `supabase/migrations/20260718_activity_chat_target.sql`

**Interfaces:**
- Produces: el `target_kind` gana el valor `'club_activity'`; `can_view_target('club_activity', <activity_id>)` = `is_activity_participant(<activity_id>)`. Consumido por las tareas 2 y 5.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260718_activity_chat_target.sql`:

```sql
-- Chat general de actividad (cambios de actividades, 2026-07-18): las actividades
-- se vuelven comentables/reaccionables reutilizando el sistema de interacciones
-- (Bloque B/F), con un target nuevo. Gateado a participantes -- espejo de
-- 'activity_checkpoint' pero por actividad entera, sin el spoiler-guard por hito.
-- La lectura con hitos NO usa este chat (conserva sus chats por checkpoint); el
-- gateo aquí es solo is_activity_participant, sin has_reached_checkpoint.

alter type public.target_kind add value 'club_activity';

-- Postgres (55P04): el valor nuevo debe estar COMMITted antes de usarse como
-- literal en can_view_target() de abajo. Mismo idiom que 20260713_activity_checkpoints.sql.
commit;

-- can_view_target() gana una rama. Las 5 ramas existentes se preservan VERBATIM
-- (misma definición que 20260713_activity_checkpoints.sql) -- solo se añade 'club_activity'.
create or replace function public.can_view_target(p_target_type public.target_kind, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case p_target_type
    when 'diary_entry' then exists (
      select 1 from public.diary_entries d where d.id = p_target_id and public.can_view_profile(d.user_id)
    )
    when 'episode_watch' then exists (
      select 1 from public.episode_watches e where e.id = p_target_id and public.can_view_profile(e.user_id)
    )
    when 'club_post' then exists (
      select 1 from public.club_posts cp where cp.id = p_target_id and public.is_club_member(cp.club_id)
    )
    when 'comment' then exists (
      select 1 from public.comments c where c.id = p_target_id
        and public.can_view_target(c.target_type, c.target_id)
    )
    when 'activity_checkpoint' then exists (
      select 1 from public.club_activity_checkpoints cc
      where cc.id = p_target_id
        and public.is_activity_participant(cc.activity_id)
        and public.has_reached_checkpoint(cc.id)
    )
    when 'club_activity' then public.is_activity_participant(p_target_id)
  end;
$$;
```

- [ ] **Step 2: Aplicar a DEV y verificar el enum**

Aplicar el fichero a DEV vía Management API (dos statements: el `alter type … commit;` y el `create or replace function …` por separado si el runner no acepta `commit` embebido; si `execute_sql` los admite juntos, mejor). Luego:

Run (DEV, Management API `POST /v1/projects/{ref}/database/query`):
```sql
select unnest(enum_range(null::public.target_kind))::text as v;
```
Expected: la lista incluye `club_activity`.

- [ ] **Step 3: Verificar el gating por participante**

Con un `activity_id` real de DEV y dos usuarios (uno participante, otro no), comprobar `can_view_target`:
```sql
select public.can_view_target('club_activity', '<activity_id>'::uuid);
```
Expected: ejecutado como participante → `true`; como no-participante → `false` (ver [[supabase-environments]] para simular el rol; o comprobar la lógica: la función es `is_activity_participant(p_target_id)`, que ya se usa en producción para el chat de hito).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260718_activity_chat_target.sql
git commit -m "feat(clubes): target de interacciones club_activity para el chat de actividad"
```

---

### Task 2: Chat general de actividad (datos + componente)

Añade el chat general al detalle para reto de lista / tierlist / genérico (NO buddy_read).

**Files:**
- Modify: `src/lib/social/interactions.ts:12` (TargetType)
- Modify: `src/lib/clubs/activities/core.ts` (ActivityDetail gana `chat`; getActivity lo rellena)
- Create: `src/components/clubs/activity-chat.tsx`
- Modify: `src/components/clubs/activity-detail.tsx` (montar el chat)
- Modify: `messages/es.json` (título del chat)

**Interfaces:**
- Consumes: Task 1 (`can_view_target('club_activity', …)`); `getInteractionSummary(supabase, "club_activity", [id])`; `ReviewInteractions` (existente).
- Produces: `ActivityDetail.chat: InteractionSummary`; `<ActivityChat activityId summary viewerLoggedIn />`.

- [ ] **Step 1: Añadir el target al tipo**

`src/lib/social/interactions.ts:12` — añadir `"club_activity"`:
```ts
export type TargetType = "diary_entry" | "episode_watch" | "club_post" | "activity_checkpoint" | "club_activity";
```

- [ ] **Step 2: `ActivityDetail` gana `chat` y getActivity lo rellena**

En `src/lib/clubs/activities/core.ts`:
- Importar el helper si no está: `import { getInteractionSummary, type InteractionSummary } from "@/lib/social/interactions";`
- En el tipo `ActivityDetail`, añadir el campo (junto a `participants`):
```ts
  /** Chat general de la actividad (vacío/oculto en buddy_read). RLS lo filtra a participantes. */
  chat: InteractionSummary;
```
- En `getActivity(...)`, tras obtener la actividad, añadir la lectura del summary (una sola clave):
```ts
  const chatSummary = await getInteractionSummary(supabase, "club_activity", [activityId]);
  const chat = chatSummary.get(activityId) ?? {
    reactionCount: 0,
    viewerReacted: false,
    commentCount: 0,
    comments: [],
  };
```
- Añadir `chat` al objeto que devuelve `getActivity` (junto a `opinions` — que se retira en la Task 3; de momento conviven).

- [ ] **Step 3: Componente `ActivityChat`**

`src/components/clubs/activity-chat.tsx` (espejo fino de `checkpoint-chat.tsx`):
```tsx
"use client";

import { ReviewInteractions } from "@/components/social/review-interactions";
import type { InteractionSummary } from "@/lib/social/interactions";

// Chat general de una actividad (reto de lista / tierlist / genérico). Wrapper
// fino sobre ReviewInteractions con el target 'club_activity': la RLS
// (can_view_target = is_activity_participant) ya filtra a participantes, así que
// un summary vacío significa "no participas / aún no hay mensajes".
export function ActivityChat({
  activityId,
  summary,
  viewerLoggedIn,
}: {
  activityId: string;
  summary: InteractionSummary;
  viewerLoggedIn: boolean;
}) {
  return (
    <ReviewInteractions
      targetType="club_activity"
      targetId={activityId}
      reactionCount={summary.reactionCount}
      viewerReacted={summary.viewerReacted}
      commentCount={summary.commentCount}
      comments={summary.comments}
      viewerLoggedIn={viewerLoggedIn}
      showTargetReaction={false}
    />
  );
}
```

- [ ] **Step 4: Montar el chat en el detalle (solo tipos no-lectura, solo participantes)**

En `activity-detail.tsx`, tras el `DetailExtension` (el tablero), añadir el chat para participantes de tipos sin hitos:
```tsx
{activity.kind !== "buddy_read" && isParticipant && (
  <section className="flex flex-col gap-2">
    <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
      {t("activityChat")}
    </h2>
    <ActivityChat activityId={activity.id} summary={activity.chat} viewerLoggedIn />
  </section>
)}
```
Import: `import { ActivityChat } from "./activity-chat";`

- [ ] **Step 5: i18n**

En `messages/es.json`, namespace `activity`, añadir:
```json
"activityChat": "Chat de la actividad",
```

- [ ] **Step 6: Verificar**

Run:
```bash
npx tsc --noEmit && npx eslint src/lib/social/interactions.ts src/lib/clubs/activities/core.ts src/components/clubs/activity-chat.tsx src/components/clubs/activity-detail.tsx
```
Expected: sin errores.

Navegador (dev): en una actividad de reto de lista siendo participante, escribir un mensaje en el chat → aparece; como no-participante, el chat no se muestra (o va vacío). En una lectura con hitos, el chat general NO aparece.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/clubs/activities/core.ts src/components/clubs/activity-chat.tsx src/components/clubs/activity-detail.tsx messages/es.json
git commit -m "feat(clubes): chat general de actividad (reto de lista/tierlist/genérico)"
```

---

### Task 3: Retirar opiniones por ítem + lista genérica de ítems

**Files:**
- Modify: `src/lib/clubs/activities/core.ts` (quitar `ActivityOpinion`, `opinions`, `addOpinion`, y su fetch en getActivity)
- Delete: `src/components/clubs/activity-item-list.tsx`
- Modify: `src/components/clubs/activity-detail.tsx` (quitar la sección de la lista de ítems)
- Modify: `src/components/clubs/tierlist/tierlist-item.tsx` (verificar enlace a ficha)

**Interfaces:**
- Produces: `ActivityDetail` ya sin `opinions`; no existe `addOpinion` ni `ActivityItemList`.

- [ ] **Step 1: Comprobar consumidores de opiniones**

Run:
```bash
grep -rn "addOpinion\|\.opinions\|ActivityOpinion\|activity-item-list\|ActivityItemList\|opinionsLocked\|opinionsToggle" src e2e
```
Expected: los usos están en `core.ts`, `activity-item-list.tsx`, `activity-detail.tsx` (y claves i18n `opinion*`). Anotar cualquier e2e que los toque para actualizarlo en el Step 5.

- [ ] **Step 2: Quitar de `core.ts`**

En `src/lib/clubs/activities/core.ts`, eliminar:
- El tipo `ActivityOpinion` (≈línea 52).
- El campo `opinions: ActivityOpinion[]` de `ActivityDetail` (≈línea 73).
- La función `addOpinion(...)` completa (≈línea 205).
- El bloque que consulta `club_activity_opinions` y mapea `opinions` en getActivity (≈líneas 355–396) y la propiedad `opinions` del objeto devuelto (≈línea 413).

**No** borrar la tabla `club_activity_opinions` (queda muerta).

- [ ] **Step 3: Borrar la lista y su render**

```bash
git rm src/components/clubs/activity-item-list.tsx
```
En `activity-detail.tsx`, eliminar el import de `ActivityItemList` y toda la sección `{kindDefinition.usesItemPool && ( … <ActivityItemList/> … )}` (la que lleva el heading `itemPool` + el enlace «Editar»). El acceso a «Modificar actividad» pasa a la barra de acciones (Task 4); de momento, dejar el toggle `setEditing(true)` disponible aunque sin botón (la Task 4 le pone el botón).

- [ ] **Step 4: Verificar enlace a ficha en tierlist**

Leer `src/components/clubs/tierlist/tierlist-item.tsx`. Si la portada no es un `<Link href={itemHref(item.itemType, item.itemId)}>`, envolverla en uno (la rejilla del reto de lista ya enlaza; el detalle ya no tiene otra vía a la ficha).

- [ ] **Step 5: Limpiar i18n y e2e**

- Quitar las claves huérfanas del namespace `activity` en `messages/es.json`: `opinionsLocked`, `opinionsToggle`, `opinionRating`, `opinionCommentPlaceholder`, `opinionSubmit`, `opinionError` (verificar con grep que ya no se usan antes de borrar).
- Si el Step 1 encontró un e2e que opina por ítem, actualizarlo o retirarlo.

- [ ] **Step 6: Verificar**

Run:
```bash
grep -rn "addOpinion\|ActivityItemList\|\.opinions" src   # debe salir vacío
npx tsc --noEmit && npx eslint src/lib/clubs/activities/core.ts src/components/clubs/activity-detail.tsx
```
Expected: grep vacío; tsc/eslint sin errores.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(clubes): fuera opiniones por ítem y lista genérica (el tablero es la lista)"
```

---

### Task 4: Barra de acciones (frame A)

Consolida Salir + grupo ◈ MOD (Modificar/Finalizar/Archivar/+Activar) en una barra bajo los participantes.

**Files:**
- Modify: `src/components/clubs/activity-detail.tsx`
- Modify: `messages/es.json` (`modTag`, `modify`)

**Interfaces:**
- Consumes: server actions existentes `leaveActivity`, `activateActivity`, `finishActivity`, `archiveActivity` (sin cambios); `setEditing` local.

- [ ] **Step 1: Quitar el botón de participación de la fila de participantes**

En `activity-detail.tsx`, en la fila de participantes, eliminar el bloque `status === "active" && !isParticipant` (unirse) y `isParticipant` (salir). La fila queda solo avatares + «N participan». (El unirse se rehace en la Task 5; el salir baja a la barra.)

- [ ] **Step 2: Añadir la barra de acciones**

Justo debajo de la fila de participantes, para participantes (y con el grupo MOD para moderadores), añadir:
```tsx
{isParticipant && (
  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
    <Button
      type="button"
      variant="secondary"
      className="px-3.5 py-2 text-xs"
      disabled={isPending}
      onClick={() => run(() => leaveActivity(activity.id))}
    >
      {t("leave")}
    </Button>

    {isModerator && (status === "proposed" || status === "active") && (
      <div className="ml-auto flex items-center gap-2 border-l border-border pl-3">
        <span className="font-mono text-[8.5px] tracking-wide text-foreground-faint uppercase">
          ◈ {t("modTag")}
        </span>
        {status === "proposed" && (
          <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs" disabled={isPending}
            onClick={() => run(() => activateActivity(activity.id))}>
            {t("activate")}
          </Button>
        )}
        <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs"
          onClick={() => setEditing(true)}>
          {t("modify")}
        </Button>
        {status === "active" && (
          <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs" disabled={isPending}
            onClick={() => run(() => finishActivity(activity.id))}>
            {t("finish")}
          </Button>
        )}
        <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs" disabled={isPending}
          onClick={() => run(() => archiveActivity(activity.id))}>
          {t("archive")}
        </Button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Quitar los controles ahora duplicados**

Eliminar de `activity-detail.tsx` el bloque `isModerator && (status === "proposed" || status === "active")` de moderación en `flex-wrap` (Activar/Finalizar/Archivar sueltos) y el bloque `!isModerator && isCreator && status === "active"` (Finalizar del creador) **si** el creador es participante — el «Salir + MOD» de la barra ya cubre a mod; para el **creador no-mod** conservar un botón «Finalizar» aparte en la barra (añadir una rama `!isModerator && isCreator && status === "active"` que renderice solo el botón Finalizar dentro de la barra).

- [ ] **Step 4: i18n**

En `messages/es.json`, namespace `activity`:
```json
"modTag": "Mod",
"modify": "Modificar",
```
(`leave`, `activate`, `finish`, `archive` ya existen.)

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint src/components/clubs/activity-detail.tsx`
Expected: sin errores.

Navegador: como **miembro participante** ver solo «Salir»; como **moderador** ver «Salir» + grupo ◈ MOD (Modificar/Finalizar/Archivar; +Activar si la actividad está propuesta); «Modificar» abre el panel de curación del pool; como **creador no-mod** ver «Salir» + «Finalizar».

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/activity-detail.tsx messages/es.json
git commit -m "feat(clubes): barra de acciones de actividad (Salir + grupo MOD)"
```

---

### Task 5: Vista previa sin unirse (frame B)

No-participante: estructura en solo lectura + chat/progreso bloqueados + barra inferior fija «Unirme».

**Files:**
- Modify: `src/components/clubs/activity-detail.tsx`
- Modify: `messages/es.json` (`joinCta`, `joinTeaserTitle`, `joinTeaserBody`, `previewLeaveHint`)

**Interfaces:**
- Consumes: `joinActivity(activity.id)` (existente).

- [ ] **Step 1: Rama de no-participante**

En `activity-detail.tsx`, cuando `status === "active" && !isParticipant` (y no editando), renderizar la vista previa en vez del detalle normal: misma cabecera (topbar + kchip + h1 + descripción) + fila de participantes, luego el `DetailExtension` (tablero) tal cual (es de solo lectura para no-participantes por RLS), y **en lugar del chat**, un teaser bloqueado:
```tsx
<div className="relative overflow-hidden rounded-card border border-dashed border-border">
  <div className="pointer-events-none p-4 opacity-50 blur-[3px]" aria-hidden>
    {/* pista visual: un par de líneas de chat de ejemplo o el heading del chat */}
    <p className="font-mono text-[9.5px] tracking-wide text-green uppercase">◎ {t("activityChat")}</p>
  </div>
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/55 px-6 text-center">
    <span aria-hidden className="text-lg">◎</span>
    <p className="font-serif text-[15px] font-semibold text-foreground">{t("joinTeaserTitle")}</p>
    <p className="text-[11.5px] leading-relaxed text-muted-foreground">{t("joinTeaserBody")}</p>
  </div>
</div>
```

- [ ] **Step 2: Barra inferior fija «Unirme»**

Al final de la rama de no-participante, una barra fija (dentro del contenedor de la página, `sticky bottom-0` o `fixed`):
```tsx
<div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8"
     style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
  <div className="flex-1">
    {activity.startsOn && (
      <p className="font-serif text-[13px] font-semibold text-foreground">
        {t("startsOnLabel", { date: /* formatear activity.startsOn */ })}
      </p>
    )}
    <p className="text-[10.5px] text-muted-foreground">{t("previewLeaveHint")}</p>
  </div>
  <Button type="button" variant="primary" className="px-5 py-3" disabled={isPending}
    onClick={() => run(() => joinActivity(activity.id))}>
    {t("joinCta")}
  </Button>
</div>
```
Reutilizar el `formatDue`/split de fecha que ya usa el proyecto (no `new Date()` sobre un `date` de Postgres — ver `club-summary.tsx`).

- [ ] **Step 3: Quitar el `joinDisclosure` viejo**

El párrafo `status === "active" && !isParticipant && activity.items.length > 0` (joinDisclosure) queda cubierto por el teaser; retirarlo o moverlo al teaser.

- [ ] **Step 4: i18n**

```json
"joinCta": "Unirme",
"joinTeaserTitle": "Únete para ver y participar",
"joinTeaserBody": "Podrás marcar tu progreso y comentar con el resto.",
"previewLeaveHint": "Puedes salir cuando quieras",
"startsOnLabel": "Empieza el {date}"
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npx eslint src/components/clubs/activity-detail.tsx`
Expected: sin errores.

Navegador: abrir (como no-participante) una actividad activa de cada tipo → se ve la estructura, el chat aparece bloqueado tras el teaser, y la barra inferior con «Unirme» une de verdad (tras unirse, aparece la barra de acciones de la Task 4 y el chat). Claro y oscuro.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubs/activity-detail.tsx messages/es.json
git commit -m "feat(clubes): vista previa de actividad sin unirse (frame B)"
```

---

### Task 6: Verificación de cierre + migración a prod

**Files:**
- Modify: `supabase/schema-baseline.sql` (anexar la migración `club_activity`)

- [ ] **Step 1: Suite e2e**

```bash
fnm use && npx playwright test
```
Expected: verde (mismos flaky preexistentes conocidos, ver [[e2e-contra-build-de-produccion]]). Si algún spec de clubes rojo por el cambio de acciones (p. ej. un locator del botón «Unirse»/«Salir» viejo), actualizarlo al nuevo emplazamiento (barra de acciones / barra inferior).

- [ ] **Step 2: Verificación en navegador (checklist del spec)**

Recorrer el checklist de «Verificación de cierre» del spec (barra por rol; ítems sin lista genérica; chat en no-lectura y no en lectura; vista previa; RLS del chat). Claro y oscuro.

- [ ] **Step 3: Migración a PROD**

Con e2e y navegador OK: aplicar `20260718_activity_chat_target.sql` a PROD vía `mcp__supabase__apply_migration`. Verificar el enum y `can_view_target` en prod (SELECT como en Task 1 Steps 2–3). Confirmar advisors sin nuevos hallazgos.

- [ ] **Step 4: Actualizar el baseline**

Anexar la migración a `supabase/schema-baseline.sql` en el orden de aplicación real (ver [[fidelidad-paper]] sobre el baseline). Commit:
```bash
git add supabase/schema-baseline.sql
git commit -m "chore(db): schema-baseline al día — target club_activity"
```

- [ ] **Step 5: Actualizar el doc del plan 04**

Marcar la §6 de `plan-04-clubes.md` como hecha (o anotar lo pendiente). Commit.

## Self-Review

**Spec coverage:** A (barra) → Task 4; B (vista previa) → Task 5; item list removal → Task 3; chat general → Tasks 1+2; migración → Tasks 1+6; no-DROP de opiniones → Task 3 (explícito). Todas las secciones del spec tienen tarea.

**Placeholder scan:** el único hueco intencional es «formatear `activity.startsOn`» (Task 5 Step 2), resuelto remitiendo al `formatDue` existente de `club-summary.tsx` — no es un TODO abierto, es reutilizar código citado.

**Type consistency:** `TargetType += "club_activity"` (Task 2 Step 1) casa con el target usado en `ActivityChat` (Step 3) y en la migración (Task 1). `ActivityDetail.chat: InteractionSummary` (Task 2 Step 2) casa con la prop `summary` de `ActivityChat`. `is_activity_participant(p_target_id)` casa con la firma existente usada por la rama `activity_checkpoint`.
