# Inicio — Feed agrupado e interactivo + ancho PC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar el feed del Inicio por actor/día, hacer cada ítem reaccionable (incl. `added`/`progressed`) con alta rápida a biblioteca, y ensanchar la vista PC con una sidebar consolidada.

**Architecture:** El feed sigue siendo fan-out on-read (`getFeed`). Se añaden dos `target_kind` (`pass`, `progress_session`) para que altas y sesiones sean targets reales de `reactions`/`comments` (RLS vía `can_view_target`). La agrupación es una función pura post-página (solo presentación; la paginación no la ve). El alta rápida reusa `applyTransition`. La sidebar reusa datos ya pedidos + `getSocialSuggestions`.

**Tech Stack:** Next.js (App Router, RSC + Server Actions), Supabase (Postgres + RLS), next-intl, Vitest, Playwright, Tailwind.

## Global Constraints

- **Node v22 para tests.** El shell abre Node v20 y rompe Vitest. Forzar v22: `fnm use 22` (o `fnm exec --using=22 <cmd>`) antes de `npm run test`/`test:e2e`. (memoria `biblioshare-node-env`)
- **Migraciones: dev primero (`supabase-dev`), prod al final (`supabase-prod`).** Verificar contra objetos reales (`pg_enum`, `pg_proc`), NO contra `list_migrations` (AGENTS.md).
- **`alter type … add value` no es usable en la misma transacción que lo referencia.** Enum y `can_view_target` van en **migraciones separadas**.
- **Estado vivo del usuario = `passes`.** Nunca `library_entries` (congelada) ni `diary_entries` (renombrada a `passes`). (AGENTS.md)
- **Un solo `next dev` en el puerto 3000.** Matar el viejo antes de arrancar. `test:e2e` reutiliza el dev server existente. (AGENTS.md)
- **Definición de «hecho»:** al tocar esquema → `data-model.md`; decisión de forma → `decisiones.md` (append); feature cerrada → `backlog.md`; pendientes → issues. (AGENTS.md)
- **Copy en español**, claves i18n en `messages/*.json` para todos los locales (vía agente `i18n-keeper`).

---

## Estructura de ficheros

**Crear:**
- `supabase/migrations/<ts>_feed_targets_enum.sql` — enum `target_kind` += `pass`, `progress_session`.
- `supabase/migrations/<ts>_feed_targets_can_view.sql` — `can_view_target` con 2 ramas nuevas.
- `src/lib/social/group-feed-entries.ts` — función pura de agrupación.
- `src/lib/social/group-feed-entries.test.ts` — tests unitarios.
- `src/lib/library/quick-add-actions.ts` — `quickAddToLibrary`, `quickAddManyToLibrary`.
- `src/components/social/feed-group-card.tsx` — tarjeta agrupada.
- `src/components/library/quick-add-button.tsx` — botón "+" cliente.
- `src/components/stats/who-to-follow-card.tsx` — bloque sidebar "A quién seguir".
- `src/lib/social/get-who-to-follow.ts` — wrapper que excluye ya-seguidos.
- `e2e/inicio-feed-agrupado.spec.ts` — e2e.

**Modificar:**
- `src/lib/social/interactions.ts` — `TargetType` += `"pass" | "progress_session"`.
- `src/lib/social/interaction-actions.ts` — entradas en los dos `Record` de notificación + `resolveTargetOwner`.
- `src/lib/social/feed.ts` — fijar `interactionTarget` en `added`/`progressed`; batch de interacciones para tipos nuevos; nueva variante `FeedEntry` + agrupar al final.
- `src/components/social/feed-list.tsx` — despachar la variante `person-group`.
- `src/components/social/feed-card.tsx` — botón quick-add en tarjetas `added`.
- `src/app/(home)/page.tsx` — contenedor `1200px`, columna `328px`.
- `src/components/stats/stats-rail.tsx` — consolidar "Tu 2026" + añadir "A quién seguir".
- `messages/*.json` — claves nuevas.

---

## Task 1: Migración — enum `target_kind` gana `pass` y `progress_session`

**Files:**
- Create: `supabase/migrations/<ts>_feed_targets_enum.sql`

**Interfaces:**
- Produce: valores de enum `'pass'`, `'progress_session'` en `public.target_kind`, disponibles para Task 2 y para `reactions`/`comments`.

- [ ] **Step 1: Escribir la migración**

Contenido del fichero (usar timestamp real, formato `YYYYMMDDHHMMSS`):

```sql
-- target_kind (feed agrupado 2026-07-29) gana dos valores: las altas (passes) y
-- las sesiones de progreso (progress_sessions) se vuelven targets reales de
-- reactions/comments, para poder reaccionar/comentar la actividad del feed que
-- hoy no lo permite (added/progressed). En su PROPIA migración: can_view_target
-- referencia estos literales y no pueden usarse en la misma transacción que los
-- crea (mismo idiom que club_post/comment en el baseline).
alter type public.target_kind add value if not exists 'pass';
alter type public.target_kind add value if not exists 'progress_session';
```

- [ ] **Step 2: Aplicar en dev**

Aplicar vía `mcp__supabase-dev__apply_migration` con `name: "feed_targets_enum"` y el SQL de arriba.

- [ ] **Step 3: Verificar contra el objeto real (no el ledger)**

`mcp__supabase-dev__execute_sql`:

```sql
select enumlabel from pg_enum
where enumtypid = 'public.target_kind'::regtype
order by enumsortorder;
```
Esperado: la lista incluye `pass` y `progress_session`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/*_feed_targets_enum.sql
git commit -m "feat(db): target_kind gana pass y progress_session (feed reaccionable)"
```

---

## Task 2: Migración — `can_view_target` resuelve `pass` y `progress_session`

**Files:**
- Create: `supabase/migrations/<ts>_feed_targets_can_view.sql`

**Interfaces:**
- Consume: los valores de enum de Task 1.
- Produce: RLS de `reactions`/`comments` (que ya delega en `can_view_target`) acepta los dos tipos nuevos, resolviendo visibilidad por `can_view_profile` del dueño.

- [ ] **Step 1: Escribir la migración**

`can_view_target` se redefine ENTERA (las 5 ramas existentes verbatim del baseline + 2 nuevas). Copiar la versión vigente y añadir las ramas:

```sql
-- can_view_target gana dos ramas: pass y progress_session (feed agrupado
-- 2026-07-29). Ambas delegan en can_view_profile del dueño, igual que
-- diary_entry/episode_watch. progress_sessions tiene user_id propio, así que no
-- necesita join al pase. Las 5 ramas previas se preservan verbatim.
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
    when 'pass' then exists (
      select 1 from public.passes p where p.id = p_target_id and public.can_view_profile(p.user_id)
    )
    when 'progress_session' then exists (
      select 1 from public.progress_sessions s where s.id = p_target_id and public.can_view_profile(s.user_id)
    )
  end;
$$;
```

> Antes de escribir el fichero: leer `supabase/schema-baseline.sql` alrededor de la última definición de `can_view_target` (~línea 2465) y confirmar que las 5 ramas siguen idénticas — si el baseline ha cambiado, copiar las ramas actuales, no las de este plan.

- [ ] **Step 2: Aplicar en dev**

`mcp__supabase-dev__apply_migration`, `name: "feed_targets_can_view"`.

- [ ] **Step 3: Verificar visibilidad**

`mcp__supabase-dev__execute_sql` — comprobar que la función existe con la nueva forma:

```sql
select pg_get_functiondef('public.can_view_target(public.target_kind, uuid)'::regprocedure) like '%progress_session%' as ok;
```
Esperado: `ok = true`.

- [ ] **Step 4: Advisors (seguridad)**

`mcp__supabase-dev__get_advisors` con `type: "security"`. Esperado: sin nuevos hallazgos sobre `can_view_target`/`reactions`/`comments`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_feed_targets_can_view.sql
git commit -m "feat(db): can_view_target resuelve pass y progress_session"
```

---

## Task 3: `TargetType` amplía la unión y `getFeed` fija `interactionTarget`

**Files:**
- Modify: `src/lib/social/interactions.ts:12`
- Modify: `src/lib/social/interaction-actions.ts:57-71`
- Modify: `src/lib/social/feed.ts` (bloques `added` ~441-469 y `progressed` ~478-501)

**Interfaces:**
- Consume: tipos `pass`/`progress_session` de Tasks 1-2.
- Produce: `TargetType = "diary_entry" | "episode_watch" | "club_post" | "activity_checkpoint" | "club_activity" | "pass" | "progress_session"`. Eventos `added` con `interactionTarget = { targetType: "pass", targetId: <passId> }`; `progressed` con `{ targetType: "progress_session", targetId: <sessionId> }`.

- [ ] **Step 1: Ampliar `TargetType`**

En `src/lib/social/interactions.ts`:

```ts
export type TargetType = "diary_entry" | "episode_watch" | "club_post" | "activity_checkpoint" | "club_activity" | "pass" | "progress_session";
```

- [ ] **Step 2: Compilar para ver los errores de exhaustividad**

Run: `fnm exec --using=22 npx tsc --noEmit`
Esperado: FALLA en `interaction-actions.ts` — los `Record<ReactableTargetType, …>` y `Record<TargetType, …>` no cubren los tipos nuevos.

- [ ] **Step 3: Completar los mapas de notificación**

En `src/lib/social/interaction-actions.ts`, añadir a `LIKE_NOTIFICATION_TYPE` y `COMMENT_NOTIFICATION_TYPE`:

```ts
  // Reaccionar/comentar una actividad del feed (alta o sesión) NO notifica en
  // este MVP — no hay tipo de notificación para ello (como activity_checkpoint).
  // → issue "notificaciones para reacciones en added/progressed".
  pass: null,
  progress_session: null,
```

`resolveTargetOwner` NO necesita cambio: con `notificationType === null` el flujo corta antes de resolver dueño. (Dejar el `if (targetType === "diary_entry" || …)` como está.)

- [ ] **Step 4: Fijar `interactionTarget` en `added`**

En `src/lib/social/feed.ts`, en el `events.push({…})` del bucle `for (const r of addedRows)`, cambiar:

```ts
      interactionTarget: null,
```
por
```ts
      interactionTarget: { targetType: "pass", targetId: r.id },
```

- [ ] **Step 5: Fijar `interactionTarget` en `progressed`**

En el `events.push({…})` del bucle `for (const r of progressedRows)`, cambiar `interactionTarget: null` por:

```ts
      interactionTarget: { targetType: "progress_session", targetId: r.id },
```

- [ ] **Step 6: Ampliar el tipo de `interactionTarget` en `FeedEvent`**

En `src/lib/social/feed.ts`, el campo `interactionTarget` (~línea 54). Sustituir el tipo por:

```ts
  interactionTarget: { targetType: "diary_entry" | "episode_watch" | "pass" | "progress_session"; targetId: string } | null;
```

- [ ] **Step 7: Ampliar el batch de interacciones de `getFeed`**

En `getFeed` (~líneas 611-633), el batch solo recoge `diary_entry` y `episode_watch`. Añadir `pass` y `progress_session`:

```ts
  const passTargetIds = personEvents
    .filter((e) => e.interactionTarget?.targetType === "pass")
    .map((e) => e.interactionTarget!.targetId);
  const sessionTargetIds = personEvents
    .filter((e) => e.interactionTarget?.targetType === "progress_session")
    .map((e) => e.interactionTarget!.targetId);
  const [diarySummaries, episodeSummaries, passSummaries, sessionSummaries] = await Promise.all([
    getInteractionSummary(supabase, "diary_entry", diaryTargetIds),
    getInteractionSummary(supabase, "episode_watch", episodeTargetIds),
    getInteractionSummary(supabase, "pass", passTargetIds),
    getInteractionSummary(supabase, "progress_session", sessionTargetIds),
  ]);
  for (const e of personEvents) {
    if (!e.interactionTarget) continue;
    const summaries =
      e.interactionTarget.targetType === "diary_entry" ? diarySummaries
      : e.interactionTarget.targetType === "episode_watch" ? episodeSummaries
      : e.interactionTarget.targetType === "pass" ? passSummaries
      : sessionSummaries;
    const s = summaries.get(e.interactionTarget.targetId);
    if (s) {
      e.reactionCount = s.reactionCount;
      e.viewerReacted = s.viewerReacted;
      e.commentCount = s.commentCount;
      e.comments = s.comments;
    }
  }
```

- [ ] **Step 8: Verificar compilación**

Run: `fnm exec --using=22 npx tsc --noEmit`
Esperado: PASS (sin errores).

- [ ] **Step 9: Commit**

```bash
git add src/lib/social/interactions.ts src/lib/social/interaction-actions.ts src/lib/social/feed.ts
git commit -m "feat(feed): added y progressed son targets de reaccion/comentario"
```

---

## Task 4: Función pura de agrupación + tests

**Files:**
- Create: `src/lib/social/group-feed-entries.ts`
- Test: `src/lib/social/group-feed-entries.test.ts`

**Interfaces:**
- Consume: `FeedEntry` (variantes `person`/`club` actuales) de `feed.ts`.
- Produce: `export function groupPersonEntries(entries: FeedEntry[]): FeedEntry[]` y la variante nueva `PersonGroupEntry`. Colapsa `added` (por actor+día) y `progressed` (por actor+obra+día) cuando hay ≥2; el resto pasa sin tocar. Orden por `eventDate` desc (fecha del ítem más reciente del grupo).

- [ ] **Step 1: Escribir el test que falla**

`src/lib/social/group-feed-entries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupPersonEntries } from "./group-feed-entries";
import type { FeedEntry, FeedEvent } from "./feed";

function ev(partial: Partial<FeedEvent> & Pick<FeedEvent, "id" | "verb" | "actorId" | "eventDate">): FeedEvent {
  return {
    actorUsername: "u", actorDisplayName: null, actorAvatarUrl: null,
    itemType: "book", itemId: partial.itemId ?? "i1", itemTitle: "T", itemCoverUrl: null,
    itemSubtitle: null, entryStatus: null, rating: null, reviewExcerpt: null,
    episode: null, progress: null, interactionTarget: null,
    reactionCount: 0, viewerReacted: false, commentCount: 0, comments: [],
    ...partial,
  } as FeedEvent;
}
function person(e: FeedEvent): FeedEntry {
  return { source: "person", id: e.id, eventDate: e.eventDate, event: e };
}

describe("groupPersonEntries", () => {
  it("agrupa 3 altas del mismo actor y día en un person-group", () => {
    const entries = [
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-07-29T09:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-07-29T10:00:00+00:00", itemId: "b2" })),
      person(ev({ id: "diary_entries_added:c", verb: "added", actorId: "x", eventDate: "2026-07-29T17:00:00+00:00", itemId: "b3" })),
    ];
    const out = groupPersonEntries(entries);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
    if (out[0].source === "person-group") {
      expect(out[0].verb).toBe("added");
      expect(out[0].items).toHaveLength(3);
      expect(out[0].eventDate).toBe("2026-07-29T17:00:00+00:00"); // el más reciente
    }
  });

  it("no agrupa altas de días distintos", () => {
    const entries = [
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-07-29T09:00:00+00:00" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-07-28T09:00:00+00:00" })),
    ];
    expect(groupPersonEntries(entries)).toHaveLength(2);
    expect(groupPersonEntries(entries).every((e) => e.source === "person")).toBe(true);
  });

  it("no agrupa una sola alta (queda como person)", () => {
    const entries = [person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-07-29" }))];
    const out = groupPersonEntries(entries);
    expect(out[0].source).toBe("person");
  });

  it("agrupa progressed por actor+obra+día, no mezcla obras", () => {
    const entries = [
      person(ev({ id: "progress_sessions:a", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
      person(ev({ id: "progress_sessions:b", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
      person(ev({ id: "progress_sessions:c", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b2" })),
    ];
    const out = groupPersonEntries(entries);
    // b1 (2 sesiones) → grupo; b2 (1) → person
    expect(out.filter((e) => e.source === "person-group")).toHaveLength(1);
    expect(out.filter((e) => e.source === "person")).toHaveLength(1);
  });

  it("no agrupa verbos no agrupables (finished/reviewed)", () => {
    const entries = [
      person(ev({ id: "diary_entries:a", verb: "finished", actorId: "x", eventDate: "2026-07-29" })),
      person(ev({ id: "diary_entries:b", verb: "reviewed", actorId: "x", eventDate: "2026-07-29" })),
    ];
    expect(groupPersonEntries(entries).every((e) => e.source === "person")).toBe(true);
  });

  it("deja pasar las entradas de club sin tocar", () => {
    const club = { source: "club" as const, id: "club:z", eventDate: "2026-07-29", event: {} as never };
    expect(groupPersonEntries([club])).toEqual([club]);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `fnm exec --using=22 npx vitest run src/lib/social/group-feed-entries.test.ts`
Esperado: FALLA con "groupPersonEntries is not a function" / módulo no encontrado.

- [ ] **Step 3: Implementar la función**

`src/lib/social/group-feed-entries.ts`:

```ts
import type { FeedEntry, FeedEvent, FeedVerb } from "./feed";

// Variante de presentación: N eventos del mismo actor colapsados en una tarjeta.
// NO es una entidad con fila propia — solo agrupa para pintar. La reacción de
// cada ítem vive en su propia fila real (ver spec D1/D2).
export type PersonGroupEntry = {
  source: "person-group";
  id: string;
  eventDate: string; // la del ítem más reciente
  verb: Extract<FeedVerb, "added" | "progressed">;
  actor: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  items: FeedEvent[];
};

// Solo estos dos verbos se agrupan; el resto (finished/rated/reviewed/
// watchedEpisode) y las entradas de club pasan intactos.
const GROUPABLE: ReadonlySet<FeedVerb> = new Set(["added", "progressed"]);

function day(iso: string): string {
  return iso.slice(0, 10);
}

// added → por actor+día; progressed → por actor+obra+día (una sesión distinta
// del mismo libro el mismo día cae junta, pero días distintos no).
function groupKey(e: FeedEvent): string {
  if (e.verb === "added") return `added:${e.actorId}:${day(e.eventDate)}`;
  return `progressed:${e.actorId}:${e.itemType}:${e.itemId}:${day(e.eventDate)}`;
}

export function groupPersonEntries(entries: FeedEntry[]): FeedEntry[] {
  const buckets = new Map<string, FeedEvent[]>();
  const passthrough: FeedEntry[] = [];

  for (const entry of entries) {
    if (entry.source !== "person" || !GROUPABLE.has(entry.event.verb)) {
      passthrough.push(entry);
      continue;
    }
    const key = groupKey(entry.event);
    const list = buckets.get(key);
    if (list) list.push(entry.event);
    else buckets.set(key, [entry.event]);
  }

  const result: FeedEntry[] = [...passthrough];
  for (const [key, items] of buckets) {
    if (items.length === 1) {
      const e = items[0];
      result.push({ source: "person", id: e.id, eventDate: e.eventDate, event: e });
      continue;
    }
    // Orden interno: más reciente primero (mismo criterio que el feed).
    items.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.id < b.id ? 1 : -1));
    const newest = items[0];
    result.push({
      source: "person-group",
      id: `group:${key}`,
      eventDate: newest.eventDate,
      verb: newest.verb as PersonGroupEntry["verb"],
      actor: {
        id: newest.actorId,
        username: newest.actorUsername,
        displayName: newest.actorDisplayName,
        avatarUrl: newest.actorAvatarUrl,
      },
      items,
    });
  }

  // Reordenar todo por fecha desc (el bucketing rompió el orden original).
  result.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : a.id < b.id ? 1 : -1));
  return result;
}
```

- [ ] **Step 4: Añadir `person-group` al tipo `FeedEntry`**

En `src/lib/social/feed.ts`, importar y ampliar la unión:

```ts
import type { PersonGroupEntry } from "./group-feed-entries";

export type FeedEntry =
  | { source: "person"; id: string; eventDate: string; event: FeedEvent }
  | PersonGroupEntry
  | { source: "club"; id: string; eventDate: string; event: ClubFeedEvent };
```

- [ ] **Step 5: Ejecutar los tests**

Run: `fnm exec --using=22 npx vitest run src/lib/social/group-feed-entries.test.ts`
Esperado: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/group-feed-entries.ts src/lib/social/group-feed-entries.test.ts src/lib/social/feed.ts
git commit -m "feat(feed): agrupacion pura de altas y sesiones por actor/dia"
```

---

## Task 5: Aplicar la agrupación en `getFeed` y pintar la tarjeta de grupo

**Files:**
- Modify: `src/lib/social/feed.ts` (final de `getFeed`, ~líneas 635-640)
- Modify: `src/components/social/feed-list.tsx:78-84`
- Create: `src/components/social/feed-group-card.tsx`

**Interfaces:**
- Consume: `groupPersonEntries` (Task 4), `PersonGroupEntry`, `FeedCard`/`ReviewInteractions` existentes.
- Produce: `getFeed` devuelve `events` ya agrupados (sin alterar `nextCursor`, que se calcula del último evento RAW). `FeedList` pinta `FeedGroupCard` para `source === "person-group"`.

- [ ] **Step 1: Agrupar al final de `getFeed`, después de calcular el cursor**

En `src/lib/social/feed.ts`, el bloque final actual:

```ts
  const last = page[page.length - 1];
  const nextCursor = allExhausted || !last
    ? null
    : `${last.eventDate}${CURSOR_SEPARATOR}${last.id}`;

  return { events: page, nextCursor };
```
se convierte en (el cursor SIGUE saliendo del `page` sin agrupar — la agrupación no toca la paginación):

```ts
  const last = page[page.length - 1];
  const nextCursor = allExhausted || !last
    ? null
    : `${last.eventDate}${CURSOR_SEPARATOR}${last.id}`;

  // La agrupación es solo de presentación y se aplica DESPUÉS de fijar el
  // cursor: nextCursor apunta a un evento real de `page`, no a un grupo
  // sintético. Un grupo partido en el borde de página reaparece como grupo
  // propio en la siguiente tanda (limitación conocida → issue).
  return { events: groupPersonEntries(page), nextCursor };
```
Añadir el import: `import { groupPersonEntries } from "./group-feed-entries";`

- [ ] **Step 2: Escribir `FeedGroupCard`**

`src/components/social/feed-group-card.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { timeAgo } from "@/lib/relative-time";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { QuickAddButton } from "@/components/library/quick-add-button";
import { quickAddManyToLibrary } from "@/lib/library/quick-add-actions";
import { itemHref } from "@/lib/catalog/item-href";

// Tarjeta de un grupo del feed (altas o sesiones del mismo actor/día). Cada
// ítem lleva SU propia reacción/comentario (target real: pass/progress_session)
// — la tarjeta solo agrupa para pintar (spec D2).
export function FeedGroupCard({
  entry,
  viewerLoggedIn,
}: {
  entry: PersonGroupEntry;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const tTime = useTranslations("time");
  const actorName = entry.actor.displayName || entry.actor.username;

  const headline =
    entry.verb === "added"
      ? t("grouped.addedCount", { count: entry.items.length })
      : t("grouped.progressedIn", { title: entry.items[0].itemTitle });

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={actorName} avatarUrl={entry.actor.avatarUrl} size={34} />
        <p className="min-w-0 text-sm leading-snug text-foreground">
          <Link href={`/u/${entry.actor.username}`} className="font-semibold hover:underline">
            {actorName}
          </Link>{" "}
          <span className="text-muted-foreground">{headline}</span>
        </p>
        <span
          suppressHydrationWarning
          className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground"
        >
          {timeAgo(entry.eventDate, tTime)}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {entry.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <Link
                href={itemHref(item.itemType, item.itemId)}
                className="relative h-[78px] w-[52px] shrink-0 overflow-hidden rounded bg-surface-muted shadow-cover"
              >
                {item.itemCoverUrl && (
                  <Image src={item.itemCoverUrl} alt={item.itemTitle} fill sizes="52px" className="object-cover" />
                )}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  href={itemHref(item.itemType, item.itemId)}
                  className="font-serif text-sm leading-tight font-semibold text-foreground hover:underline"
                >
                  {item.itemTitle}
                </Link>
                {item.itemSubtitle && (
                  <span className="font-serif text-[11px] italic text-muted-foreground">{item.itemSubtitle}</span>
                )}
                {entry.verb === "added" && (
                  <QuickAddButton itemType={item.itemType} itemId={item.itemId} />
                )}
              </div>
            </div>
            {item.interactionTarget && (
              <ReviewInteractions
                targetType={item.interactionTarget.targetType}
                targetId={item.interactionTarget.targetId}
                reactionCount={item.reactionCount}
                viewerReacted={item.viewerReacted}
                commentCount={item.commentCount}
                comments={item.comments}
                viewerLoggedIn={viewerLoggedIn}
              />
            )}
          </div>
        ))}
      </div>

      {entry.verb === "added" && (
        <form
          action={async () => {
            await quickAddManyToLibrary(entry.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId })));
          }}
        >
          <button
            type="submit"
            className="w-full rounded-lg border border-border py-2 text-[12.5px] font-semibold text-accent hover:bg-surface-muted"
          >
            {t("grouped.saveAllToQueue", { count: entry.items.length })}
          </button>
        </form>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Despachar la variante en `FeedList`**

En `src/components/social/feed-list.tsx`, importar `FeedGroupCard` y ampliar el `map`:

```tsx
      {events.map((entry) =>
        entry.source === "club" ? (
          <ClubFeedCard key={entry.id} event={entry.event} />
        ) : entry.source === "person-group" ? (
          <FeedGroupCard key={entry.id} entry={entry} viewerLoggedIn={viewerLoggedIn} />
        ) : (
          <FeedCard key={entry.id} event={entry.event} viewerLoggedIn={viewerLoggedIn} />
        ),
      )}
```

- [ ] **Step 4: Compilar**

Run: `fnm exec --using=22 npx tsc --noEmit`
Esperado: PASS. (Si falla por `quickAddManyToLibrary`/`QuickAddButton` inexistentes, hacer Task 6 primero y volver — pero el orden natural es implementar Task 6 antes del Step 2 de aquí. Ver nota.)

> **Nota de orden:** `FeedGroupCard` importa de Task 6. Ejecutar **Task 6 antes que los Steps 2-4 de esta tarea**, o dejar el `import`/uso comentado hasta que Task 6 exista. El Step 1 (agrupación en `getFeed`) es independiente y puede ir ya.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/feed.ts src/components/social/feed-list.tsx src/components/social/feed-group-card.tsx
git commit -m "feat(feed): tarjeta de grupo con reaccion por item y guardar-los-N"
```

---

## Task 6: Alta rápida a biblioteca (acciones + botón)

**Files:**
- Create: `src/lib/library/quick-add-actions.ts`
- Create: `src/components/library/quick-add-button.tsx`
- Modify: `src/components/social/feed-card.tsx` (añadir botón en `added`)

**Interfaces:**
- Consume: `applyTransition` (`src/lib/passes/apply-transition.ts`), `ItemType`.
- Produce: `quickAddToLibrary(itemType: ItemType, itemId: string): Promise<void>` y `quickAddManyToLibrary(items: { itemType: ItemType; itemId: string }[]): Promise<void>`. Componente `QuickAddButton({ itemType, itemId })`.

- [ ] **Step 1: Escribir las acciones**

`src/lib/library/quick-add-actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyTransition } from "@/lib/passes/apply-transition";
import type { ItemType } from "@/lib/catalog/types";

// Alta rápida desde el feed: mete la obra en la cola (planned) reusando la
// máquina de estados. Idempotente — si ya hay pase activo, applyTransition es
// no-op; si devuelve askResume (re-alta tras cerrar un pase), se trata como
// éxito silencioso (la obra ya tiene historia; el usuario decide en su ficha).
export async function quickAddToLibrary(itemType: ItemType, itemId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await applyTransition(supabase, user.id, itemType, itemId, "planned");
  revalidatePath("/");
}

// "Guardar los N en mi cola": UNA sola acción (un round-trip), transiciones en
// paralelo, un único revalidate al final — elegido sobre el bucle cliente por
// rendimiento (spec D4).
export async function quickAddManyToLibrary(
  items: { itemType: ItemType; itemId: string }[],
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await Promise.all(
    items.map((i) => applyTransition(supabase, user.id, i.itemType, i.itemId, "planned")),
  );
  revalidatePath("/");
}
```

- [ ] **Step 2: Escribir `QuickAddButton`**

`src/components/library/quick-add-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon, CheckIcon } from "@/components/ui/icons";
import { quickAddToLibrary } from "@/lib/library/quick-add-actions";
import type { ItemType } from "@/lib/catalog/types";

// Botón "+" de alta rápida (feed). Optimista: al pulsar marca "en tu biblioteca"
// y revierte si la acción falla. Idempotente en el servidor.
export function QuickAddButton({ itemType, itemId }: { itemType: ItemType; itemId: string }) {
  const t = useTranslations("feed");
  const [added, setAdded] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (added) {
    return (
      <span className="inline-flex items-center gap-1.5 self-start font-mono text-[11px] text-muted-foreground">
        <CheckIcon className="h-3.5 w-3.5" /> {t("alreadyInLibrary")}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          setAdded(true);
          try {
            await quickAddToLibrary(itemType, itemId);
          } catch {
            setAdded(false);
          }
        })
      }
      className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-surface-muted disabled:opacity-50"
    >
      <PlusIcon className="h-3.5 w-3.5" /> {t("quickAdd")}
    </button>
  );
}
```

> Antes de escribir: confirmar que `PlusIcon` y `CheckIcon` existen en `src/components/ui/icons`. Si no, usar los iconos equivalentes ya exportados (grep `Icon` en ese fichero) — NO inventar SVG nuevos.

- [ ] **Step 3: Añadir el botón a `FeedCard` en tarjetas `added`**

En `src/components/social/feed-card.tsx`, dentro del `<div className="flex min-w-0 flex-1 flex-col gap-2">`, tras el bloque de estado (`event.verb === "added" && event.entryStatus`), añadir:

```tsx
          {event.verb === "added" && (
            <QuickAddButton itemType={event.itemType} itemId={event.itemId} />
          )}
```
E importar: `import { QuickAddButton } from "@/components/library/quick-add-button";`

- [ ] **Step 4: Compilar**

Run: `fnm exec --using=22 npx tsc --noEmit`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/quick-add-actions.ts src/components/library/quick-add-button.tsx src/components/social/feed-card.tsx
git commit -m "feat(feed): alta rapida a la cola desde tarjetas de alta"
```

---

## Task 7: Ancho PC + sidebar "Tu 2026" consolidada

**Files:**
- Modify: `src/app/(home)/page.tsx:68,94`
- Modify: `src/components/stats/stats-rail.tsx`

**Interfaces:**
- Consume: `WeeklyStrip`, `StreakCard`, `BookGoalCard`, `GoalRows` (existentes, sin cambiar sus props).
- Produce: contenedor a `1200px`, columna derecha a `328px`; `StatsRail` con tres tarjetas visuales ("Esta semana", "Tu 2026", "A quién seguir" — esta última en Task 8).

- [ ] **Step 1: Ensanchar el contenedor y la columna**

En `src/app/(home)/page.tsx`:
- Línea del contenedor raíz: `lg:max-w-[1080px]` → `lg:max-w-[1200px]`.
- Línea del grid de sección: `lg:grid-cols-[minmax(0,1fr)_312px]` → `lg:grid-cols-[minmax(0,1fr)_328px]`.

- [ ] **Step 2: Consolidar "Tu 2026" en `StatsRail`**

En `src/components/stats/stats-rail.tsx`, sustituir el bloque de tarjetas actuales (las tres `<div className="rounded-card …">` de streak/book-goal/goal-rows) por dos tarjetas: "Esta semana" (igual) y una sola "Tu 2026" que envuelve los tres sub-componentes bajo un encabezado, reusándolos (DRY — no reescribir su lógica):

```tsx
      <div className="rounded-card border border-border bg-surface shadow-card p-4">
        <p className="mb-3 font-serif text-[15px] font-semibold">{tRail("year2026")}</p>
        <div className="flex flex-col gap-3">
          <BookGoalCard completed={annual.byType.book} goal={annualGoals.book} />
          <GoalRows annual={annual} annualGoals={annualGoals} />
          <div className="border-t border-border pt-3">
            <StreakCard streaks={streaks} />
          </div>
        </div>
      </div>
```

Añadir `const tRail = await getTranslations("statsRail");` (o el namespace que uses en Task 9) y el import de `getTranslations`. Si `BookGoalCard`/`GoalRows`/`StreakCard` traen su propio borde/padding de tarjeta, quitar solo esa envoltura duplicada (revisar cada componente; NO tocar su lógica de datos).

> **Cuidado:** leer los tres componentes antes de envolverlos — si alguno ya asume ser una tarjeta completa (con su título), ajustar para que dentro de "Tu 2026" no salgan títulos redundantes. Es trabajo de composición visual; verificar en el navegador (Task 10).

- [ ] **Step 3: Compilar**

Run: `fnm exec --using=22 npx tsc --noEmit`
Esperado: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(home\)/page.tsx src/components/stats/stats-rail.tsx
git commit -m "feat(inicio): ancho PC a 1200px y bloque Tu 2026 consolidado"
```

---

## Task 8: Sidebar "A quién seguir"

**Files:**
- Create: `src/lib/social/get-who-to-follow.ts`
- Create: `src/components/stats/who-to-follow-card.tsx`
- Modify: `src/components/stats/stats-rail.tsx` (añadir la tarjeta)

**Interfaces:**
- Consume: `getSocialSuggestions` (`src/lib/onboarding/get-social-suggestions.ts`), `followUser` (`src/lib/social/actions.ts`), `UserAvatar`.
- Produce: `getWhoToFollow(supabase, userId): Promise<PersonSuggestion[]>` (excluye ya-seguidos y pendientes); `WhoToFollowCard`.

- [ ] **Step 1: Wrapper que excluye ya-seguidos**

`src/lib/social/get-who-to-follow.ts`:

```ts
import type { createClient } from "@/lib/supabase/server";
import { getSocialSuggestions, type PersonSuggestion } from "@/lib/onboarding/get-social-suggestions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Sugerencias para la sidebar del Inicio. Reusa getSocialSuggestions (perfiles
// públicos) pero descarta a quien ya sigues o tienes solicitado — en onboarding
// no hacía falta (no seguías a nadie), aquí sí.
export async function getWhoToFollow(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PersonSuggestion[]> {
  const [{ profiles }, following] = await Promise.all([
    getSocialSuggestions(supabase, userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
  ]);
  const excluded = new Set((following.data ?? []).map((f) => f.followee_id));
  return profiles.filter((p) => !excluded.has(p.userId));
}
```

- [ ] **Step 2: Tarjeta**

`src/components/stats/who-to-follow-card.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserAvatar } from "@/components/social/user-avatar";
import { followUser } from "@/lib/social/actions";
import type { PersonSuggestion } from "@/lib/onboarding/get-social-suggestions";

// "A quién seguir" (sidebar PC). Se degrada a null si no hay sugerencias.
export async function WhoToFollowCard({ suggestions }: { suggestions: PersonSuggestion[] }) {
  if (suggestions.length === 0) return null;
  const t = await getTranslations("whoToFollow");
  const shown = suggestions.slice(0, 3);

  return (
    <div className="rounded-card border border-border bg-surface shadow-card p-4">
      <p className="mb-3 font-serif text-[15px] font-semibold">{t("title")}</p>
      <div className="flex flex-col gap-3">
        {shown.map((p) => (
          <div key={p.userId} className="flex items-center gap-2.5">
            <Link href={`/u/${p.username}`}>
              <UserAvatar name={p.displayName || p.username} avatarUrl={p.avatarUrl} size={34} />
            </Link>
            <Link href={`/u/${p.username}`} className="min-w-0 flex-1 text-sm font-medium hover:underline">
              {p.displayName || p.username}
            </Link>
            <form action={followUser.bind(null, p.userId)}>
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1 font-mono text-[10px] tracking-[0.06em] uppercase text-accent hover:bg-surface-muted"
              >
                {t("follow")}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
```

> `followUser` tiene firma `(targetUserId: string) => Promise<void>`; `.bind(null, id)` la convierte en la server action sin argumentos que espera `form action`. Confirmar que ese patrón ya se usa en el repo (grep `.bind(null,` en componentes de perfil); si el repo usa otro patrón para acciones con argumento, seguir ese.

- [ ] **Step 3: Añadir a `StatsRail`**

En `src/components/stats/stats-rail.tsx`: importar `getWhoToFollow` y `WhoToFollowCard`, añadir a `Promise.all` `getWhoToFollow(supabase, userId)`, y renderizar `<WhoToFollowCard suggestions={whoToFollow} />` como tercera tarjeta.

- [ ] **Step 4: Compilar**

Run: `fnm exec --using=22 npx tsc --noEmit`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/get-who-to-follow.ts src/components/stats/who-to-follow-card.tsx src/components/stats/stats-rail.tsx
git commit -m "feat(inicio): bloque A quien seguir en la sidebar"
```

---

## Task 9: Claves i18n

**Files:**
- Modify: `messages/*.json` (todos los locales)

**Interfaces:**
- Produce: claves `feed.grouped.addedCount`, `feed.grouped.progressedIn`, `feed.grouped.saveAllToQueue`, `feed.quickAdd`, `feed.alreadyInLibrary`, `statsRail.year2026`, `whoToFollow.title`, `whoToFollow.follow`.

- [ ] **Step 1: Añadir las claves (agente `i18n-keeper`)**

Delegar en el agente `i18n-keeper` con esta lista y sus textos ES (y placeholders para el resto de locales, a rellenar según su convención):

| Clave | ES |
|---|---|
| `feed.grouped.addedCount` | `añadió {count, plural, one {# libro} other {# libros}}` |
| `feed.grouped.progressedIn` | `avanzó en {title}` |
| `feed.grouped.saveAllToQueue` | `＋ Guardar {count, plural, one {el libro} other {los # libros}} en mi cola` |
| `feed.quickAdd` | `Añadir` |
| `feed.alreadyInLibrary` | `En tu biblioteca` |
| `statsRail.year2026` | `Tu 2026` |
| `whoToFollow.title` | `A quién seguir` |
| `whoToFollow.follow` | `Seguir` |

> Ajustar el namespace (`statsRail` vs el que ya use `StatsRail`) a lo que exista. `i18n-keeper` valida que cada clave se use en código y que estén en todos los locales.

- [ ] **Step 2: Verificar tipos i18n + build**

Run: `fnm exec --using=22 npx tsc --noEmit`
Esperado: PASS (sin claves faltantes si el proyecto tipa los mensajes).

- [ ] **Step 3: Commit**

```bash
git add messages/
git commit -m "i18n: claves del feed agrupado y sidebar del Inicio"
```

---

## Task 10: Verificación e2e, QA y cierre documental

**Files:**
- Create: `e2e/inicio-feed-agrupado.spec.ts`
- Modify: `docs/requirements/data-model.md`, `docs/requirements/decisiones.md`, `docs/requirements/backlog.md`

- [ ] **Step 1: Aplicar las migraciones en PROD**

Con todo verde en dev: aplicar Task 1 y Task 2 en `supabase-prod` (`mcp__supabase-prod__apply_migration`, mismos nombres/SQL). Verificar con el `select … from pg_enum` y el `pg_get_functiondef … like '%progress_session%'` contra prod. **Irreversible en la práctica: confirmar antes de ejecutar.**

- [ ] **Step 2: e2e — render de grupo + quick-add + sugerencia**

Escribir `e2e/inicio-feed-agrupado.spec.ts` siguiendo el patrón de los specs existentes en `e2e/` (revisar uno para el helper de login/seed). Casos:
1. Un actor con ≥2 altas el mismo día se pinta como UNA tarjeta con N portadas y el botón "Guardar los N".
2. El botón "Añadir" de una portada mueve la obra a tu colección (`planned`).
3. La sidebar PC (viewport ≥1024) muestra "Tu 2026" y, si hay perfiles públicos no seguidos, "A quién seguir" con botón Seguir.

Run: `fnm exec --using=22 npm run test:e2e -- inicio-feed-agrupado`
Esperado: PASS. (Reutiliza el dev server en :3000; no arrancar otro.)

- [ ] **Step 3: QA end-to-end (agente `qa-verifier`)**

Delegar en `qa-verifier` la verificación en navegador real de la vista PC (ancho 1200, sidebar consolidada, tarjeta agrupada con reacción por ítem funcionando) y móvil (una columna, tarjeta agrupada apilada). Ver `docs/TESTING.md`.

- [ ] **Step 4: Cierre documental (Definición de «hecho»)**

- `docs/requirements/data-model.md`: `target_kind` (+`pass`, +`progress_session`), nueva forma de `can_view_target`, fecha de verificación actualizada. (Delegar en `backlog-scribe` la parte de backlog, o hacerlo a mano.)
- `docs/requirements/decisiones.md` (append, no reescribir): reacción **por ítem** en grupos del feed (spec D2); agrupación solo-display por actor/día (D1); guardar-los-N como acción batch (D4).
- `docs/requirements/backlog.md`: marcar la casilla del rediseño del Inicio (feed agrupado/interactivo + ancho PC).
- Si algún flujo end-to-end del feed cambió en `docs/architecture/graph.json`, regenerarlo (ver `docs/architecture/README.md`).

- [ ] **Step 5: Abrir issues**

Crear con `mcp__github__create_issue`:
1. **Grupo partido en el borde de página.** Un grupo cuyo N-ésimo ítem cae en la tanda siguiente aparece como grupo separado. Repro: actor con >`pageSize`(20) altas el mismo día; hacer scroll/"Cargar más". Acota: solo afecta al borde de paginación; dentro de una tanda agrupa bien. Arreglo futuro: agrupar antes de cortar y paginar por grupo.
2. **Sin notificación al reaccionar/comentar `added`/`progressed`.** Hoy `LIKE/COMMENT_NOTIFICATION_TYPE` mapean `pass`/`progress_session` a `null`. Falta un tipo de notificación (p. ej. `activity_liked`) para cerrar el bucle social. Acota: la reacción SÍ se guarda y se ve; solo el dueño no se entera.

- [ ] **Step 6: Commit del cierre documental**

```bash
git add docs/
git commit -m "docs(inicio): data-model, decisiones y backlog del feed agrupado"
```

---

## Self-Review (autor del plan)

- **Cobertura de spec:** D1 agrupación → Task 4/5. D2 social por ítem → Task 1-3, 5. D3 migración → Task 1-2. D4 quick-add batch → Task 6. D5 ancho + sidebar → Task 7-8. i18n → Task 9. Cierre doc + issues → Task 10. ✅
- **Placeholders:** sin TBD/TODO; todo el código va inline. Las tres "notas de cuidado" (iconos, `.bind`, envoltura de cards) son verificaciones contra el repo real, no placeholders — instruyen qué confirmar y qué NO inventar.
- **Consistencia de tipos:** `groupPersonEntries`/`PersonGroupEntry` consistentes entre Task 4 y 5; `quickAddToLibrary`/`quickAddManyToLibrary` entre Task 6 y 5; `getWhoToFollow`/`PersonSuggestion` entre Task 8. `TargetType` ampliado en Task 3 y usado por `ReviewInteractions`/`interaction-actions` sin renombres.
- **Orden:** Task 6 debe ir antes de los Steps 2-4 de Task 5 (dependencia de import) — anotado en Task 5.
