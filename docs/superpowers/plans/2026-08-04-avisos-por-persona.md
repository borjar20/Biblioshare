# Avisos por persona — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder activar una campana sobre una persona que sigues y recibir notificación in-app + push de los tipos de evento que elijas (terminó / sesión / episodio / alta).

**Architecture:** Reutiliza `follows` (una columna `notify_events text[]`, sin tablas nuevas) y toda la fontanería social existente (`notifyMany()` → in-app + push + bloqueos). Cada acción que crea un evento (closePass, addSession, setEpisodeWatched, altas) llama, best-effort, a un fan-out que lee por service-role quién está suscrito a esa categoría del actor y notifica en lote. El interruptor se escribe por service-role (la RLS de `follows` no deja al follower tocar su fila).

**Tech Stack:** Next.js 16 App Router (Server Actions), Supabase (Postgres + RLS), next-intl (locale único `es`), Vitest (unidad), Playwright (e2e).

## Global Constraints

- Locale único **`es`**: solo existe `messages/es.json`. No crear `en.json`; añadir claves solo a `es.json`.
- El estado vivo del usuario vive en **`passes`**; nunca leer/escribir `library_entries`.
- Cuatro clientes Supabase: `server.ts` (RSC/actions), `service-role.ts` (salta RLS, solo server, para escrituras que la RLS no permite). Nunca importar `service-role` desde cliente.
- Migraciones: **dev primero** (`mcp__supabase-dev__apply_migration`), luego prod (`mcp__supabase-prod__apply_migration`). Un valor de enum recién añadido **no** se puede usar en la misma transacción → migración aparte de cualquier uso, y **desplegada antes** del código que lo inserta.
- Notificaciones best-effort: un fallo del aviso **nunca** revierte la acción real que lo dispara (mismo contrato que `notify()` / `notifyPublicReviewMentions`).
- Clases Tailwind enteras, nunca interpoladas.
- Al cerrar: sincronizar `data-model.md`, `backlog.md`, `decisiones.md` (Task 11).

---

### Task 1: Esquema — columna `notify_events` + valores de enum + tipos

**Files:**
- Create: `supabase/migrations/20260804000000_follow_notify_events.sql`
- Create: `supabase/migrations/20260804000001_notification_type_followed.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerado)

**Interfaces:**
- Produces: columna `public.follows.notify_events text[] not null default '{}'`; valores de enum `public.notification_type`: `followed_finished`, `followed_session`, `followed_episode`, `followed_added`.

- [ ] **Step 1: Escribir la migración de la columna**

`supabase/migrations/20260804000000_follow_notify_events.sql`:
```sql
-- Avisos por persona (EPIC-05): categorías de evento por las que el follower
-- quiere aviso in-app + push del followee. Vacío = campana apagada.
-- La escritura la hace la app por service-role (la RLS de follows solo deja al
-- followee hacer UPDATE), así que NO se añade política de UPDATE para el follower.
alter table public.follows
  add column notify_events text[] not null default '{}';

comment on column public.follows.notify_events is
  'Categorías de evento del followee por las que el follower pidió aviso (finished|session|episode|added). Vacío = sin avisos. Escrito por service-role desde setFollowNotify.';
```

- [ ] **Step 2: Escribir la migración de los valores de enum**

`supabase/migrations/20260804000001_notification_type_followed.sql`:
```sql
-- Tipos de notificación de "avisos por persona". Dirección "ampliar" (inofensiva):
-- el bundle viejo no los conoce y no rompe. Aparte de cualquier uso porque un
-- valor de enum nuevo no se puede usar en la misma transacción.
alter type public.notification_type add value if not exists 'followed_finished';
alter type public.notification_type add value if not exists 'followed_session';
alter type public.notification_type add value if not exists 'followed_episode';
alter type public.notification_type add value if not exists 'followed_added';
```

- [ ] **Step 3: Aplicar en dev**

Aplicar las dos migraciones con `mcp__supabase-dev__apply_migration` (una por llamada, en orden).
Verificar: `mcp__supabase-dev__execute_sql` con
`select column_name from information_schema.columns where table_name='follows' and column_name='notify_events';`
Expected: una fila.
`select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='notification_type' and enumlabel like 'followed_%';`
Expected: 4 filas.

- [ ] **Step 4: Regenerar tipos**

`mcp__supabase-dev__generate_typescript_types` → sobrescribir `src/lib/supabase/database.types.ts`.
Verificar que `follows.Row` incluye `notify_events: string[]` y que el enum `notification_type` lista los 4 valores nuevos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804000000_follow_notify_events.sql supabase/migrations/20260804000001_notification_type_followed.sql src/lib/supabase/database.types.ts
git commit -m "feat(avisos): esquema para avisos por persona (follows.notify_events + enum)"
```

- [ ] **Step 6: Aplicar en prod** (antes de mergear el código que usa los valores)

Aplicar las dos migraciones con `mcp__supabase-prod__apply_migration`. Verificar igual que en Step 3 contra prod.

---

### Task 2: Categorías, tipos de notificación y mapa (puro)

**Files:**
- Create: `src/lib/social/notify-categories.ts`
- Create: `src/lib/social/notify-categories.test.ts`
- Modify: `src/lib/social/notification-types.ts`

**Interfaces:**
- Consumes: `NotificationType` de `notification-types.ts`.
- Produces:
  - `NOTIFY_CATEGORIES: readonly ["finished","session","episode","added"]`
  - `type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]`
  - `CATEGORY_NOTIFICATION_TYPE: Record<NotifyCategory, NotificationType>`
  - `parseNotifyCategories(raw: unknown): NotifyCategory[]`

- [ ] **Step 1: Ampliar `notification-types.ts`**

En la unión `NotificationType` añadir (antes de `"mentioned"`):
```ts
  | "followed_finished"
  | "followed_session"
  | "followed_episode"
  | "followed_added"
```
En `NOTIFICATION_TYPE_KEY` añadir:
```ts
  followed_finished: "followedFinished",
  followed_session: "followedSession",
  followed_episode: "followedEpisode",
  followed_added: "followedAdded",
```

- [ ] **Step 2: Escribir el test (falla)**

`src/lib/social/notify-categories.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { NOTIFY_CATEGORIES, CATEGORY_NOTIFICATION_TYPE, parseNotifyCategories } from "./notify-categories";
import { NOTIFICATION_TYPE_KEY } from "./notification-types";

describe("notify-categories", () => {
  it("cada categoría mapea a un tipo de notificación con clave i18n", () => {
    for (const c of NOTIFY_CATEGORIES) {
      const type = CATEGORY_NOTIFICATION_TYPE[c];
      expect(type).toMatch(/^followed_/);
      expect(NOTIFICATION_TYPE_KEY[type]).toBeTruthy();
    }
  });
  it("parseNotifyCategories descarta lo desconocido y deduplica", () => {
    expect(parseNotifyCategories(["finished","added","finished","xx",1,null]).sort())
      .toEqual(["added","finished"]);
    expect(parseNotifyCategories("finished")).toEqual([]);
    expect(parseNotifyCategories(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 3: Verificar que falla**

Run: `npm run test -- src/lib/social/notify-categories.test.ts`
Expected: FAIL (módulo inexistente).
(Node: activar la versión pinada antes de vitest si el shell arranca en 20.9 — ver `.nvmrc`.)

- [ ] **Step 4: Implementar `notify-categories.ts`**

```ts
import type { NotificationType } from "./notification-types";

// Categorías de evento por las que se puede pedir aviso de una persona.
// Sin dependencias server-only: la importa tanto la UI (campana) como el
// fan-out del servidor.
export const NOTIFY_CATEGORIES = ["finished", "session", "episode", "added"] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const CATEGORY_NOTIFICATION_TYPE: Record<NotifyCategory, NotificationType> = {
  finished: "followed_finished",
  session: "followed_session",
  episode: "followed_episode",
  added: "followed_added",
};

const VALID = new Set<string>(NOTIFY_CATEGORIES);

// Una server action es un endpoint POST público: valida contra el set permitido,
// descarta desconocidos y deduplica. Entrada no-array → lista vacía.
export function parseNotifyCategories(raw: unknown): NotifyCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<NotifyCategory>();
  for (const v of raw) if (typeof v === "string" && VALID.has(v)) seen.add(v as NotifyCategory);
  return [...seen];
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npm run test -- src/lib/social/notify-categories.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/notify-categories.ts src/lib/social/notify-categories.test.ts src/lib/social/notification-types.ts
git commit -m "feat(avisos): categorías + tipos de notificación de avisos por persona"
```

---

### Task 3: Copys i18n

**Files:**
- Modify: `messages/es.json`

**Interfaces:**
- Produces: claves `notifications.followedFinished|followedSession|followedEpisode|followedAdded` (con `{name}`) y `social.notify*`.

- [ ] **Step 1: Añadir las claves de notificación**

En `messages/es.json`, dentro del objeto `"notifications"`, añadir (imitando el estilo de las claves hermanas, todas con `{name}`):
```json
"followedFinished": "{name} terminó una obra",
"followedSession": "{name} registró una sesión de lectura",
"followedEpisode": "{name} vio un episodio",
"followedAdded": "{name} añadió algo a su biblioteca",
```

- [ ] **Step 2: Añadir las etiquetas de la campana**

Dentro del objeto `"social"`, añadir:
```json
"notifyBellLabel": "Avisos de esta persona",
"notifyMenuTitle": "Avísame cuando…",
"notifyFinished": "Termine o reseñe una obra",
"notifySession": "Registre una sesión",
"notifyEpisode": "Vea un episodio",
"notifyAdded": "Añada algo a su biblioteca",
"notifyAddedHint": "Puede llegar en ráfagas si añade muchas obras seguidas.",
```

- [ ] **Step 3: Verificar JSON válido**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))"`
Expected: sin error.

- [ ] **Step 4: Commit**

```bash
git add messages/es.json
git commit -m "feat(avisos): copys de avisos por persona (es)"
```

---

### Task 4: Fan-out `notifyFollowersOfEvent` + `notifyAdded`

**Files:**
- Create: `src/lib/social/notify-followers.ts`

**Interfaces:**
- Consumes: `NotifyCategory`, `CATEGORY_NOTIFICATION_TYPE` (Task 2); `notifyMany`, `ReviewTargetType` (`notifications.ts`); `createServiceRoleClient`; `TransitionOutcome` (`@/lib/passes/apply-transition`, solo tipo).
- Produces:
  - `notifyFollowersOfEvent(supabase, actorId: string, category: NotifyCategory, target: { targetType: ReviewTargetType; targetId: string }): Promise<void>`
  - `notifyAdded(supabase, actorId: string, outcome: TransitionOutcome): Promise<void>`

- [ ] **Step 1: Implementar el fan-out**

`src/lib/social/notify-followers.ts`:
```ts
import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { TransitionOutcome } from "@/lib/passes/apply-transition";
import { notifyMany, type ReviewTargetType } from "./notifications";
import { CATEGORY_NOTIFICATION_TYPE, type NotifyCategory } from "./notify-categories";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Avisa a los seguidores ACEPTADOS de `actorId` que activaron esta categoría en
// su campana. Best-effort: mismo contrato que notify() — nunca lanza; un fallo
// aquí no debe romper la acción real (cerrar pase, registrar sesión…).
// Lee follows por service-role: es un camino de servidor de confianza y así
// notify_events (preferencia privada del follower) no se expone por RLS al actor.
export async function notifyFollowersOfEvent(
  supabase: SupabaseServerClient,
  actorId: string,
  category: NotifyCategory,
  target: { targetType: ReviewTargetType; targetId: string },
): Promise<void> {
  try {
    const writer = createServiceRoleClient();
    const { data, error } = await writer
      .from("follows")
      .select("follower_id")
      .eq("followee_id", actorId)
      .eq("status", "accepted")
      .contains("notify_events", [category]);
    if (error) throw error;
    const userIds = (data ?? []).map((r) => r.follower_id);
    if (userIds.length === 0) return;
    await notifyMany(supabase, {
      userIds,
      actorId,
      type: CATEGORY_NOTIFICATION_TYPE[category],
      targetType: target.targetType,
      targetId: target.targetId,
    });
  } catch (err) {
    console.error("notifyFollowersOfEvent failed", err);
  }
}

// Azúcar para el enganche de "added": solo dispara si applyTransition INSERTÓ un
// pase nuevo (outcome.created). El evento "added" del feed enlaza al ítem vía el
// pase, así que target_type es 'diary_entry' (resolveTargetHrefs ya lo resuelve).
export async function notifyAdded(
  supabase: SupabaseServerClient,
  actorId: string,
  outcome: TransitionOutcome,
): Promise<void> {
  if (outcome.kind !== "done" || !outcome.created) return;
  await notifyFollowersOfEvent(supabase, actorId, "added", {
    targetType: "diary_entry",
    targetId: outcome.passId,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. (Fallará en la referencia a `outcome.created` hasta Task 5 — es esperado; si se ejecuta antes, hacer Task 5 primero. Recomendado: ejecutar Task 5 antes que este Step.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/notify-followers.ts
git commit -m "feat(avisos): fan-out notifyFollowersOfEvent + notifyAdded"
```

---

### Task 5: `TransitionOutcome.created`

**Files:**
- Modify: `src/lib/passes/apply-transition.ts`

**Interfaces:**
- Produces: la variante `done` de `TransitionOutcome` gana `created: boolean` (`true` cuando se insertó un pase nuevo; `false` en update/no-op).

- [ ] **Step 1: Ampliar el tipo**

En `apply-transition.ts`, cambiar:
```ts
export type TransitionOutcome =
  | { kind: "done"; passId: string; closed: boolean; created: boolean }
  | { kind: "askResume" };
```

- [ ] **Step 2: Rellenar `created` en los tres return de `done`**

- Rama `plan.kind === "none"`: `return { kind: "done", passId: active!.id, closed: false, created: false };`
- Rama `plan.kind === "updateActive"`: en su return añadir `created: false,`.
- Return final (tras el insert de createActive/archiveAndCreate): añadir `created: true,`.

- [ ] **Step 3: Verificar consumidores y tests**

Run: `npx tsc --noEmit`
Expected: sin errores (los consumidores actuales no desestructuran `created`; solo se amplía la forma).
Run: `npm run test -- src/lib/passes`
Expected: PASS. Si algún test comparaba el objeto outcome completo, añadir `created` al esperado.

- [ ] **Step 4: Commit**

```bash
git add src/lib/passes/apply-transition.ts
git commit -m "feat(avisos): TransitionOutcome.created para distinguir alta de pase"
```

---

### Task 6: Enganches `finished` / `session` / `episode`

**Files:**
- Modify: `src/lib/passes/actions.ts` (closePass)
- Modify: `src/lib/sessions/actions.ts` (addSession)
- Modify: `src/lib/series/episode-actions.ts` (setEpisodeWatched)

**Interfaces:**
- Consumes: `notifyFollowersOfEvent` (Task 4).

- [ ] **Step 1: `finished` en `closePass`**

En `src/lib/passes/actions.ts`, importar:
```ts
import { notifyFollowersOfEvent } from "@/lib/social/notify-followers";
```
En `closePass`, tras el bloque de menciones y **antes** de `revalidateReadingLog`, añadir:
```ts
  // Aviso a los seguidores suscritos a "terminó". SOLO en closePass, nunca en
  // updatePass: editar un pase cerrado no debe re-notificar (misma regla que las
  // menciones de arriba).
  await notifyFollowersOfEvent(supabase, user.id, "finished", {
    targetType: "diary_entry",
    targetId: passId,
  });
```

- [ ] **Step 2: `session` en `addSession`**

En `src/lib/sessions/actions.ts`, importar `notifyFollowersOfEvent`. Localizar el punto **tras** la inserción exitosa de la fila de `progress_sessions` (donde ya se tiene `passId` validado como pase activo). Añadir:
```ts
  await notifyFollowersOfEvent(supabase, user.id, "session", {
    targetType: "diary_entry",
    targetId: passId,
  });
```
(El `passId` es el pase activo ya verificado al inicio de `addSession`. El evento de sesión enlaza al ítem vía el pase → `diary_entry`.)

- [ ] **Step 3: `episode` en `setEpisodeWatched`**

En `src/lib/series/episode-actions.ts`, importar `notifyFollowersOfEvent`. En `setEpisodeWatched`, tras `markEpisodeWatched(...)` en la rama `if (watched)` (no en el desmarcado), leer el id de la fila y notificar. `markEpisodeWatched` no devuelve el id, así que resolverlo:
```ts
  if (watched) {
    await markEpisodeWatched(supabase, user.id, seriesId, passId, season, episode);
    const { data: watchRow } = await supabase
      .from("episode_watches")
      .select("id")
      .eq("user_id", user.id)
      .eq("pass_id", passId)
      .eq("season_number", season)
      .eq("episode_number", episode)
      .maybeSingle();
    if (watchRow) {
      await notifyFollowersOfEvent(supabase, user.id, "episode", {
        targetType: "episode_watch",
        targetId: watchRow.id,
      });
    }
  } else {
```
(Se deja tal cual el `else` del desmarcado.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/passes/actions.ts src/lib/sessions/actions.ts src/lib/series/episode-actions.ts
git commit -m "feat(avisos): enganches finished/session/episode"
```

---

### Task 7: Enganche `added` (altas interactivas)

**Files:**
- Modify: `src/app/buscar/actions.ts` (addToLibrary)
- Modify: `src/app/buscar/manual/actions.ts`
- Modify: `src/lib/library/add-existing-item.ts`
- Modify: `src/lib/library/quick-add-actions.ts` (solo el alta de UN ítem)

**Interfaces:**
- Consumes: `notifyAdded` (Task 4), `TransitionOutcome.created` (Task 5).

Nota de diseño: el import masivo (`commit-row.ts`) inserta en `passes` directamente y **no** pasa por estas acciones, así que queda excluido por construcción. El quick-add **en lote** (`addMany`) se deja **fuera** a propósito (evitar ráfagas auto-infligidas): solo se engancha el alta de un ítem.

- [ ] **Step 1: `addToLibrary`**

En `src/app/buscar/actions.ts`, importar `notifyAdded`. Capturar el outcome y notificar:
```ts
  const outcome = await applyTransition(supabase, user.id, result.itemType, itemId, "planned");
  await notifyAdded(supabase, user.id, outcome);
```
(Sustituye el `await applyTransition(...)` que no capturaba el resultado.)

- [ ] **Step 2: Alta manual**

En `src/app/buscar/manual/actions.ts`, donde hace `await applyTransition(supabase, user.id, itemType, inserted.id, "planned");`, capturar el outcome y añadir `await notifyAdded(supabase, user.id, outcome);` justo después. Importar `notifyAdded`.

- [ ] **Step 3: add-existing-item**

En `src/lib/library/add-existing-item.ts`, misma operación sobre su `applyTransition(...,"planned")`: capturar outcome + `await notifyAdded(supabase, user.id, outcome);`. Importar `notifyAdded`.

- [ ] **Step 4: quick-add de un ítem**

En `src/lib/library/quick-add-actions.ts`, en la función de alta de **un** ítem (la que hace un único `applyTransition(...,"planned")`, ~línea 20), capturar outcome + `await notifyAdded(...)`. **No** tocar `addMany` (~línea 37).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/buscar/actions.ts src/app/buscar/manual/actions.ts src/lib/library/add-existing-item.ts src/lib/library/quick-add-actions.ts
git commit -m "feat(avisos): enganche added en altas interactivas (import excluido)"
```

---

### Task 8: Acción `setFollowNotify` + lectura `getFollowNotify`

**Files:**
- Create: `src/lib/social/notify-actions.ts`
- Modify: `src/lib/social/follows.ts`

**Interfaces:**
- Consumes: `parseNotifyCategories`, `NotifyCategory` (Task 2).
- Produces:
  - `setFollowNotify(targetUserId: string, username: string, categories: NotifyCategory[]): Promise<{ ok: boolean }>`
  - `getFollowNotify(supabase, viewerId: string | null, targetUserId: string): Promise<NotifyCategory[]>`

- [ ] **Step 1: `getFollowNotify` en `follows.ts`**

Añadir en `src/lib/social/follows.ts`:
```ts
import { parseNotifyCategories, type NotifyCategory } from "./notify-categories";

// Categorías de aviso que el viewer tiene activadas sobre target. Lee la propia
// fila de follows del follower (la RLS se la deja). Sin sesión o sin relación → [].
export async function getFollowNotify(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  targetUserId: string,
): Promise<NotifyCategory[]> {
  if (!viewerId || viewerId === targetUserId) return [];
  const { data, error } = await supabase
    .from("follows")
    .select("notify_events")
    .eq("follower_id", viewerId)
    .eq("followee_id", targetUserId)
    .maybeSingle();
  if (error) throw error;
  return parseNotifyCategories(data?.notify_events);
}
```

- [ ] **Step 2: `setFollowNotify`**

`src/lib/social/notify-actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { parseNotifyCategories, type NotifyCategory } from "./notify-categories";

// Activa/actualiza la campana de avisos sobre `targetUserId`. Escribe por
// service-role: la RLS de follows solo deja al followee hacer UPDATE (aceptar
// solicitudes), y abrirle UPDATE al follower reabriría el hueco de auto-aceptarse
// en perfiles privados (20260711_social_follows.sql). Requiere follow ACEPTADO.
export async function setFollowNotify(
  targetUserId: string,
  username: string,
  categories: NotifyCategory[],
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id === targetUserId) return { ok: false };

  const clean = parseNotifyCategories(categories);

  // Solo puedes poner avisos sobre alguien a quien SIGUES (accepted). Lectura con
  // el cliente de usuario: su propia fila de follows le es visible por RLS.
  const { data: rel } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", user.id)
    .eq("followee_id", targetUserId)
    .maybeSingle();
  if (rel?.status !== "accepted") return { ok: false };

  const writer = createServiceRoleClient();
  const { error } = await writer
    .from("follows")
    .update({ notify_events: clean })
    .eq("follower_id", user.id)
    .eq("followee_id", targetUserId);
  if (error) {
    console.error("setFollowNotify failed", error);
    return { ok: false };
  }
  revalidatePath(`/u/${username}`);
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/social/notify-actions.ts src/lib/social/follows.ts
git commit -m "feat(avisos): setFollowNotify (service-role) + getFollowNotify"
```

---

### Task 9: Componente `NotifyBell` (UI)

**Files:**
- Create: `src/components/social/notify-bell.tsx`
- Modify: `src/components/ui/icons.tsx` (añadir `BellIcon` si no existe)

**Interfaces:**
- Consumes: `setFollowNotify` (Task 8), `NOTIFY_CATEGORIES`/`NotifyCategory` (Task 2).
- Props: `{ targetUserId: string; username: string; initial: NotifyCategory[] }`.

- [ ] **Step 1: Asegurar un icono de campana**

En `src/components/ui/icons.tsx`, si no hay `BellIcon`, añadir uno (SVG stroke, `className` passthrough, `aria-hidden`), imitando los iconos existentes. Un `BellIcon` (contorno) basta; el estado "activo" se marca con `fill="currentColor"` vía prop `filled?: boolean`.

- [ ] **Step 2: Implementar `NotifyBell`**

`src/components/social/notify-bell.tsx` — popover propio (checkbox no puede usar `ActionMenu`, que cierra al seleccionar). Reutiliza el patrón de cierre por Escape / clic fuera de `ActionMenu`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BellIcon } from "@/components/ui/icons";
import { setFollowNotify } from "@/lib/social/notify-actions";
import { NOTIFY_CATEGORIES, type NotifyCategory } from "@/lib/social/notify-categories";

const HINTED: NotifyCategory = "added";

export function NotifyBell({
  targetUserId,
  username,
  initial,
}: {
  targetUserId: string;
  username: string;
  initial: NotifyCategory[];
}) {
  const t = useTranslations("social");
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<NotifyCategory[]>(initial);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label: Record<NotifyCategory, string> = {
    finished: t("notifyFinished"),
    session: t("notifySession"),
    episode: t("notifyEpisode"),
    added: t("notifyAdded"),
  };

  async function toggle(cat: NotifyCategory) {
    const next = cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat];
    const prev = cats;
    setCats(next); // optimista
    setFailed(false);
    const res = await setFollowNotify(targetUserId, username, next);
    if (!res.ok) {
      setCats(prev); // revierte
      setFailed(true);
    }
  }

  const active = cats.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t("notifyBellLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={active}
        onClick={() => setOpen((v) => !v)}
        className="grid h-[38px] w-[38px] place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground aria-pressed:text-foreground"
      >
        <BellIcon className="h-4 w-4" filled={active} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[44px] z-50 min-w-[248px] rounded-xl border border-border bg-surface p-2 shadow-card"
        >
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("notifyMenuTitle")}
          </p>
          {NOTIFY_CATEGORIES.map((cat) => (
            <label
              key={cat}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-surface-muted"
            >
              <input
                type="checkbox"
                checked={cats.includes(cat)}
                onChange={() => toggle(cat)}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                {label[cat]}
                {cat === HINTED && (
                  <span className="text-xs text-muted-foreground">{t("notifyAddedHint")}</span>
                )}
              </span>
            </label>
          ))}
          {failed && (
            <p role="alert" className="px-2 py-1 text-xs text-destructive">
              {t("actionError")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: sin errores. Confirmar que `social.actionError` ya existe en `es.json` (lo usa `FollowButton`); si no, añadirlo.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/notify-bell.tsx src/components/ui/icons.tsx
git commit -m "feat(avisos): componente NotifyBell"
```

---

### Task 10: Montar la campana en el perfil

**Files:**
- Modify: `src/app/u/[username]/page.tsx`

**Interfaces:**
- Consumes: `getFollowNotify` (Task 8), `NotifyBell` (Task 9).

- [ ] **Step 1: Cargar `notifyEvents` cuando se sigue**

En `page.tsx`, importar `getFollowNotify` y `NotifyBell`. Tras el `Promise.all` que resuelve `followState` (~línea 129), añadir la lectura condicional:
```ts
  const notifyEvents =
    !isOwner && blockState === "none" && followState === "accepted"
      ? await getFollowNotify(supabase, user?.id ?? null, profile.userId)
      : [];
```

- [ ] **Step 2: Renderizar la campana junto al botón Seguir**

Cambiar el prop `followButton` para envolver botón + campana:
```tsx
        followButton={
          !isOwner && blockState === "none" ? (
            <div className="flex items-start gap-2">
              <FollowButton
                targetUserId={profile.userId}
                targetIsPublic={profile.isPublic}
                state={followState}
                viewerLoggedIn={!!user}
              />
              {followState === "accepted" && (
                <NotifyBell
                  targetUserId={profile.userId}
                  username={profile.username}
                  initial={notifyEvents}
                />
              )}
            </div>
          ) : undefined
        }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificación e2e**

Crear/actualizar `e2e/avisos-por-persona.spec.ts`: con dos cuentas de test (patrón de los specs sociales existentes), A sigue a B; en el perfil de B aparece la campana; abrirla, marcar "Termine o reseñe una obra"; recargar el perfil y verificar que el checkbox sigue marcado (persistió). Reutiliza el dev server en 3000 (`npm run test:e2e` no arranca otro).
Run: `npm run test:e2e -- avisos-por-persona`
Expected: PASS. (Este es el check de integración del fan-out + persistencia; el `notify_events` en BD se puede verificar además con `mcp__supabase-dev__execute_sql`.)

- [ ] **Step 5: Commit**

```bash
git add src/app/u/[username]/page.tsx e2e/avisos-por-persona.spec.ts
git commit -m "feat(avisos): campana en el perfil + e2e"
```

---

### Task 11: Sincronizar documentación (definición de «hecho»)

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`

- [ ] **Step 1: data-model.md**

En la sección de `follows`: documentar la columna `notify_events text[] not null default '{}'` (categorías de aviso del follower). En `notification_type`: añadir los 4 valores `followed_*`. Actualizar la fecha de verificación de la cabecera.

- [ ] **Step 2: backlog.md**

Marcar la casilla de la feature "avisos por persona" (o añadirla marcada si no existía) bajo EPIC-05.

- [ ] **Step 3: decisiones.md (append-only)**

Añadir al final una entrada: "Avisos por persona sobre `follows.notify_events` (sin tabla nueva); el interruptor se escribe por service-role porque la RLS de follows solo permite UPDATE al followee y abrírselo al follower reabriría el auto-accept en perfiles privados. `added` engancha solo altas interactivas → el import masivo queda excluido por construcción."

- [ ] **Step 4: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/backlog.md docs/requirements/decisiones.md
git commit -m "docs(avisos): sincronizar data-model, backlog y decisiones"
```

---

## Self-Review

**Cobertura de la spec:**
- Columna `notify_events` → Task 1. ✓
- 4 valores de enum → Task 1. ✓
- Categorías + mapa + validación → Task 2. ✓
- Fan-out service-role + `notifyMany` → Task 4. ✓
- Enganches finished/session/episode → Task 6; added (con exclusión de import y quick-add batch) → Task 7. ✓
- `TransitionOutcome.created` → Task 5. ✓
- Escritura service-role del interruptor + lectura → Task 8. ✓
- UI campana (solo si accepted, checkbox por categoría, aviso en `added`, optimista) → Task 9. ✓
- Montaje en perfil + carga de estado inicial → Task 10. ✓
- Reuso de href (diary_entry/episode_watch) → sin tarea de href (por diseño). ✓
- i18n → Task 3. ✓
- Sync doc → Task 11. ✓

**Orden/dependencias:** Task 4 referencia `outcome.created` (Task 5) → ejecutar Task 5 antes que Task 4 (anotado en Task 4 Step 2). Task 1 Step 6 (prod) debe completarse antes de mergear el código de Tasks 6/7 que inserta los tipos nuevos.

**Consistencia de tipos:** `notifyFollowersOfEvent(supabase, actorId, category, {targetType,targetId})` — misma firma en Task 4 (def) y Task 6 (uso). `setFollowNotify(targetUserId, username, categories)` — misma en Task 8 (def), Task 9 (uso). `getFollowNotify(supabase, viewerId, targetUserId)` — Task 8 (def), Task 10 (uso). `TransitionOutcome.created` — Task 5 (def), Task 4/7 (uso). ✓

**Placeholders:** ninguno; todo paso de código lleva su bloque.
