# Avisos de seguidores desde el post — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los avisos de seguimiento (`followed_*`) se emitan al publicar un post y apunten siempre a `/post/[id]`, en vez de emitirse al ocurrir el hecho y adivinar después si hay un post al que enlazar.

**Architecture:** El fan-out se muda al único punto que inserta en `posts` (`createPost`). La notificación guarda siempre el `interaction_target_id` del post, sin rama de fallback a la ficha. Se separan dos ejes que hoy están mezclados: el `notification_type` (uno por `post.kind`, decide el texto de la campana) y la `NotifyCategory` (tres valores, decide el interruptor de suscripción).

**Tech Stack:** Next.js (App Router, server actions), Supabase (Postgres + RLS), TypeScript, Vitest, Playwright, next-intl.

**Spec:** `docs/superpowers/specs/2026-08-13-avisos-de-seguidores-desde-el-post-design.md`

## Global Constraints

- **Un solo locale:** `messages/es.json`. No hay `en.json`.
- **`notifications` solo la escribe service-role.** El INSERT está revocado a `anon`/`authenticated` desde `20260730194407_social_phase0_close_notification_inserts.sql`. Todo pasa por `notifyMany`, que ya usa `createServiceRoleClient()`.
- **Best-effort, nunca lanza.** Todo el fan-out va en `try/catch` y registra con `console.error`. Un aviso que no sale **jamás** puede tumbar la acción real (publicar un post, guardar una sesión).
- **`follows` se lee por service-role.** `notify_events` es preferencia privada de quien sigue; leerla con el cliente del autor la expondría por RLS. Ver `notify-followers.ts:89-95`.
- **No se borra ningún valor del enum `notification_type`.** `followed_added` deja de emitirse pero se conserva: hay filas vivas en `notifications` que lo usan.
- **Migraciones: dev primero (`supabase-dev`), luego prod.** Y «no aparece en `list_migrations`» ≠ «no está en prod»: verificar contra `pg_type`/`pg_enum`, no contra el ledger.
- **Node v22.** El shell arranca con v20 y rompe Vitest. Forzar con `fnm use 22` antes de correr tests.
- **Numeración de migraciones:** la última es `20260855_unconfirm_checkpoint.sql`. Las nuevas son `20260856` y `20260857`.

---

## File Structure

**Nuevos:**
- `src/lib/social/post-kinds.ts` — lista canónica de `post.kind` sin dependencias server-only. Existe para romper un ciclo: `notify-categories.ts` lo importan componentes cliente y no puede depender de `post-actions.ts` (que es `"use server"`).
- `supabase/migrations/20260856_notification_type_followed_post_kinds.sql` — tres valores de enum.
- `supabase/migrations/20260857_follows_notify_events_post_categories.sql` — transformación de `follows.notify_events`.

**Reescritos:**
- `src/lib/social/notify-categories.ts` — de 4 categorías-por-hecho a 3 categorías-por-naturaleza + dos mapas (`kind → type`, `kind → categoría`).
- `src/lib/social/notify-followers.ts` — `notifyFollowersOfPost` sustituye a `notifyFollowersOfEvent`; desaparecen `notifyAdded` y `resolvePostInteractionTargetId`.
- `src/lib/social/notify-followers.test.ts` — contrato nuevo.

**Modificados:**
- `src/lib/social/notification-types.ts` — 3 tipos nuevos + sus claves i18n.
- `src/lib/push/types.ts` — 3 entradas en `NOTIFICATION_CATEGORY`.
- `src/lib/social/post-actions.ts` — el lookup de `interaction_targets` sale del `if (body)` y se engancha el fan-out.
- `src/lib/sessions/actions.ts`, `src/lib/passes/actions.ts`, `src/lib/series/episode-actions.ts`, `src/lib/library/quick-add-actions.ts`, `src/lib/library/add-existing-item.ts`, `src/app/buscar/actions.ts`, `src/app/buscar/manual/actions.ts` — se quitan las llamadas.
- `src/components/social/notify-bell.tsx` — 3 casillas, sin hint.
- `messages/es.json` — etiquetas y textos.
- `src/lib/social/notify-categories.test.ts`, `src/lib/social/post-actions.test.ts` — cobertura.
- `e2e/posts.spec.ts` — dos casos nuevos.
- `docs/requirements/data-model.md`, `docs/requirements/decisiones.md`, `docs/requirements/backlog.md`.

---

## Task 1: Migraciones (enum + datos)

Van primero: el código de la Task 3 emite `followed_started`/`followed_dropped`/`followed_thought`, y escribir un valor que el enum no tiene revienta en runtime.

Son **dos ficheros**, no uno. `ALTER TYPE ... ADD VALUE` no puede usarse en la misma transacción que lo añade; aunque aquí la segunda migración no lee los valores nuevos, separarlas quita el riesgo entero y hace que un rollback parcial sea legible.

**Files:**
- Create: `supabase/migrations/20260856_notification_type_followed_post_kinds.sql`
- Create: `supabase/migrations/20260857_follows_notify_events_post_categories.sql`

**Interfaces:**
- Consumes: nada.
- Produce: los valores de enum `followed_started`, `followed_dropped`, `followed_thought`, que usa la Task 3. Y el dominio nuevo de `follows.notify_events`: `{milestone, progress, thought}`.

- [ ] **Step 1: Escribir la migración del enum**

`supabase/migrations/20260856_notification_type_followed_post_kinds.sql`:

```sql
-- Tres tipos nuevos de aviso de seguimiento, uno por post.kind que hoy no tiene
-- el suyo (spec 2026-08-13). Los avisos followed_* pasan a emitirse al PUBLICAR
-- un post, no al ocurrir el hecho, y el tipo decide el TEXTO de la campana: por
-- eso hace falta uno por kind y no uno por categoria de suscripcion.
--
-- Los tres que ya existen se reutilizan tal cual:
--   post.kind 'finished'   -> followed_finished
--   post.kind 'progressed' -> followed_session
--   post.kind 'watched'    -> followed_episode
--
-- followed_added NO se borra: deja de emitirse (anadir a biblioteca no publica
-- post y no lo hara), pero hay filas vivas en notifications que lo usan y
-- quitar un valor de un enum con filas que lo referencian no compensa aqui.

alter type public.notification_type add value if not exists 'followed_started';
alter type public.notification_type add value if not exists 'followed_dropped';
alter type public.notification_type add value if not exists 'followed_thought';
```

- [ ] **Step 2: Escribir la migración de datos**

`supabase/migrations/20260857_follows_notify_events_post_categories.sql`:

```sql
-- follows.notify_events pasa de 4 categorias por HECHO
-- ('finished','session','episode','added') a 3 por NATURALEZA DEL POST
-- ('milestone','progress','thought') -- spec 2026-08-13 §5.
--
--   finished              -> milestone
--   session OR episode    -> progress
--   cualquier cosa activa -> thought   <-- decision deliberada del dueno:
--       "quiero saber de esta persona" se interpreta como que incluye lo que
--       escriba. Es la unica transformacion que ANADE un aviso que nadie pidio
--       literalmente, y por eso queda escrita aqui y en decisiones.md.
--   added                 -> se pierde (anadir no publica post)
--
-- El WHERE hace DOS cosas, y las dos importan:
--   1. Una fila con notify_events vacio SE QUEDA VACIA: quien no queria avisos
--      de alguien sigue sin recibirlos. Un array vacio no solapa con nada, asi
--      que `&&` lo excluye solo (no hace falta cardinality > 0).
--   2. REAPLICAR ESTA MIGRACION ES SEGURO. Sin esta condicion, una fila ya
--      migrada ({milestone,thought}) volveria a pasar por el transform: ya no
--      contiene 'finished', asi que la rama de milestone no aporta nada y la
--      fila colapsaria a {thought}, perdiendo milestone en silencio. Filtrar por
--      "todavia contiene vocabulario VIEJO" lo impide.
--
-- No hay columna nueva, asi que la superficie 6 de docs/DRIFT-CHECK.md (grants
-- por columna) no aplica: notify_events ya trae el suyo desde
-- 20260804000000_follow_notify_events.sql.

update public.follows
set notify_events = (
  select array_agg(distinct v order by v)
  from unnest(
    (case when 'finished' = any(notify_events)
          then array['milestone'] else array[]::text[] end)
    || (case when 'session' = any(notify_events) or 'episode' = any(notify_events)
             then array['progress'] else array[]::text[] end)
    || array['thought']::text[]
  ) as v
)
where notify_events && array['finished','session','episode','added']::text[];

-- El comentario de columna es documentacion incrustada en el esquema: `\d+
-- follows` y information_schema lo sirven. El de 20260804000000 describia el
-- vocabulario viejo, asi que se refresca aqui.
comment on column public.follows.notify_events is
  'Categorias de aviso activas sobre este followee (milestone|progress|thought). Un aviso se emite al PUBLICAR un post de esa categoria, nunca al ocurrir el hecho.';
```

> El `where` que se escribió primero era `cardinality(notify_events) > 0` y la revisión lo tumbó: filtraba los vacíos pero no los ya migrados, así que una segunda aplicación se comía `milestone`. En dev no se veía —cero filas con `notify_events` no vacío— y en este repo el ledger y la base real divergen a propósito, que es justo cuando alguien reaplica un fichero creyendo que no corrió.

- [ ] **Step 3: Probar la transformación contra casos conocidos (antes de aplicarla)**

Esto es el test de la migración: corre la MISMA expresión sobre una tabla de casos, sin tocar datos reales. Ejecútalo con `mcp__supabase-dev__execute_sql`:

```sql
with cases(nombre, entrada, esperado) as (values
  ('solo finished',        array['finished'],                     array['milestone','thought']),
  ('solo session',         array['session'],                      array['progress','thought']),
  ('solo episode',         array['episode'],                      array['progress','thought']),
  ('session + episode',    array['session','episode'],            array['progress','thought']),
  ('solo added',           array['added'],                        array['thought']),
  ('las cuatro',           array['finished','session','episode','added'],
                                                                  array['milestone','progress','thought'])
)
select
  nombre,
  entrada,
  esperado,
  (select array_agg(distinct v order by v)
   from unnest(
     (case when 'finished' = any(entrada) then array['milestone'] else array[]::text[] end)
     || (case when 'session' = any(entrada) or 'episode' = any(entrada)
              then array['progress'] else array[]::text[] end)
     || array['thought']::text[]
   ) as v) as obtenido,
  (select array_agg(distinct v order by v)
   from unnest(
     (case when 'finished' = any(entrada) then array['milestone'] else array[]::text[] end)
     || (case when 'session' = any(entrada) or 'episode' = any(entrada)
              then array['progress'] else array[]::text[] end)
     || array['thought']::text[]
   ) as v) = esperado as ok
from cases;
```

Esperado: **seis filas, `ok = true` en todas**. El array vacío no está en la tabla a propósito: lo excluye el `WHERE cardinality(...) > 0` de la migración, no la expresión.

- [ ] **Step 4: Fotografiar el estado ANTES en dev**

```sql
select notify_events, count(*)
from public.follows
where cardinality(notify_events) > 0
group by notify_events
order by count(*) desc;
```

Anota el resultado en el mensaje del commit o en la PR. Sin foto previa no se puede afirmar que la migración hizo lo correcto.

- [ ] **Step 5: Aplicar las dos migraciones en dev**

Con `mcp__supabase-dev__apply_migration`, en orden: primero `20260856`, luego `20260857`.

- [ ] **Step 6: Verificar en dev contra los objetos reales**

Enum (contra `pg_enum`, no contra `list_migrations`):

```sql
select enumlabel
from pg_enum
where enumtypid = 'public.notification_type'::regtype
  and enumlabel in ('followed_started','followed_dropped','followed_thought')
order by enumlabel;
```

Esperado: 3 filas.

Datos:

```sql
select notify_events, count(*)
from public.follows
group by notify_events
order by count(*) desc;
```

Esperado: ningún array contiene ya `finished`, `session`, `episode` ni `added`; los no vacíos contienen `thought`; los que estaban vacíos siguen vacíos y su recuento coincide con el de la foto del Step 4.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260856_notification_type_followed_post_kinds.sql supabase/migrations/20260857_follows_notify_events_post_categories.sql
git commit -m "feat(db): tipos de aviso por post.kind y categorias de notify_events"
```

> **Prod queda pendiente.** Se aplica en la Task 7, cuando el código que las usa esté verde. Aplicar la de datos en prod antes de desplegar el código dejaría a la gente con la campana muda durante la ventana.

---

## Task 2: Tipos, textos y categoría push (aditivo)

Nada de esto cambia comportamiento: añade los tres tipos nuevos a las tablas que TypeScript obliga a mantener completas. Se hace aparte para que la Task 3 sea solo el cambio de disparo.

**Files:**
- Modify: `src/lib/social/notification-types.ts:37-40`, `:120-123`
- Modify: `src/lib/push/types.ts:109-112`
- Modify: `messages/es.json:553-556`

**Interfaces:**
- Consumes: los valores de enum de la Task 1.
- Produce: `NotificationType` incluye `followed_started | followed_dropped | followed_thought`; `NOTIFICATION_TYPE_KEY` y `NOTIFICATION_CATEGORY` los cubren; existen las claves i18n `social.followedStarted`, `social.followedDropped`, `social.followedThought`.

- [ ] **Step 1: Añadir los tipos a la unión**

En `src/lib/social/notification-types.ts`, sustituye el bloque de las líneas 37-40:

```ts
  | "followed_finished"
  | "followed_session"
  | "followed_episode"
  | "followed_added"
```

por:

```ts
  // Avisos de seguimiento. Desde la spec 2026-08-13 los emite createPost al
  // PUBLICAR, no el hecho: hay uno por post.kind porque el tipo decide el TEXTO
  // de la campana ("terminó X" vs "empezó X"). La suscripción va por otro eje
  // (NotifyCategory, 3 valores) — ver notify-categories.ts.
  | "followed_finished" // post.kind 'finished'
  | "followed_session" // post.kind 'progressed'
  | "followed_episode" // post.kind 'watched'
  | "followed_started" // post.kind 'started'
  | "followed_dropped" // post.kind 'dropped'
  | "followed_thought" // post.kind 'thought'
  // Ya no se emite: añadir a biblioteca no publica post. Se conserva por las
  // filas históricas de `notifications`.
  | "followed_added"
```

- [ ] **Step 2: Añadir sus claves i18n**

En el mismo fichero, tras `followed_added: "followedAdded",` (línea 123):

```ts
  followed_started: "followedStarted",
  followed_dropped: "followedDropped",
  followed_thought: "followedThought",
```

- [ ] **Step 3: Añadir la categoría push**

En `src/lib/push/types.ts`, tras `followed_added: "progress",` (línea 112):

```ts
  followed_started: "progress",
  followed_dropped: "progress",
  // Un pensamiento es contenido personal, no progreso: misma categoría que
  // post_commented / thought_liked.
  followed_thought: "social",
```

- [ ] **Step 4: Añadir los textos en es.json**

En `messages/es.json`, sustituye las líneas 553-556:

```json
    "followedFinished": "{name} terminó una obra",
    "followedSession": "{name} registró una sesión de lectura",
    "followedEpisode": "{name} vio un episodio",
    "followedAdded": "{name} añadió algo a su biblioteca"
```

por:

```json
    "followedFinished": "{name} terminó una obra",
    "followedSession": "{name} compartió una sesión de lectura",
    "followedEpisode": "{name} compartió un episodio",
    "followedStarted": "{name} empezó una obra",
    "followedDropped": "{name} abandonó una obra",
    "followedThought": "{name} publicó un pensamiento",
    "followedAdded": "{name} añadió algo a su biblioteca"
```

`followedSession` y `followedEpisode` cambian de redacción: el aviso ya solo existe cuando se comparte, así que «registró» era la palabra del modelo viejo. Afecta también a las filas históricas, que pasan a leerse «compartió» — es una imprecisión menor y preferible a que el texto describa un modelo que ya no existe.

- [ ] **Step 5: Verificar que compila**

```bash
fnm use 22 && npx tsc --noEmit
```

Esperado: cero errores. `NOTIFICATION_TYPE_KEY` y `NOTIFICATION_CATEGORY` son `Record<NotificationType, …>` a propósito: si te dejas un tipo sin entrada, esto NO compila. Si falla ahí, es que te saltaste el Step 2 o el 3.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/notification-types.ts src/lib/push/types.ts messages/es.json
git commit -m "feat(social): tipos de aviso followed_started/dropped/thought"
```

---

## Task 3: `notifyFollowersOfPost` junto al viejo (sin enganchar)

Se añade el fan-out nuevo **sin borrar el viejo ni tocar ningún llamante**. La Task 4 hace el cambio de una vez.

> **El árbol queda ROJO al terminar esta tarea, y es inevitable.** Lo escribí al revés en la primera versión del plan y el implementador lo destapó. `NotifyCategory` cambia de dominio conservando el nombre (4 valores por hecho → 3 por naturaleza del post), así que todo el que pase un literal viejo deja de compilar: `notify-bell.tsx` y las tres server actions (`sessions/actions.ts`, `passes/actions.ts`, `episode-actions.ts`), más el `notifyFollowersOfEvent` que esta tarea tiene prohibido tocar. Son exactamente los ficheros que arregla la Task 4. **Las tareas 3 y 4 se revisan JUNTAS**: por separado, la 3 no se puede juzgar contra un árbol que compile.

**Files:**
- Create: `src/lib/social/post-kinds.ts`
- Modify: `src/lib/social/notify-categories.ts`
- Modify: `src/lib/social/post-actions.ts:9-15`
- Modify: `src/lib/social/notify-followers.ts` (añadir, no borrar)
- Test: `src/lib/social/notify-followers.test.ts` (añadir un `describe`, no tocar el existente)
- Test: `src/lib/social/notify-categories.test.ts`

**Interfaces:**
- Consumes: `notifyMany(supabase, params)` de `./notifications` — acepta `{userIds, actorId, type, interactionTargetId?, targetType?, targetId?, dedupeKey?}`. `NotificationType` de `./notification-types`.
- Produce:
  - `POST_KINDS: readonly PostKind[]` y `type PostKind = "thought"|"progressed"|"started"|"finished"|"dropped"|"watched"` en `./post-kinds`.
  - `NOTIFY_CATEGORIES: readonly ["milestone","progress","thought"]`, `type NotifyCategory`, `CATEGORY_FOR_POST_KIND: Record<PostKind, NotifyCategory>`, `POST_KIND_NOTIFICATION_TYPE: Record<PostKind, NotificationType>`, `parseNotifyCategories(raw: unknown): NotifyCategory[]` en `./notify-categories`.
  - `notifyFollowersOfPost(supabase, authorId, post: {postId: string; kind: PostKind; interactionTargetId: string}): Promise<void>` en `./notify-followers`.

- [ ] **Step 1: Escribir el test de los mapas (falla porque no existen)**

Sustituye entero `src/lib/social/notify-categories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { POST_KINDS } from "./post-kinds";
import {
  NOTIFY_CATEGORIES,
  CATEGORY_FOR_POST_KIND,
  POST_KIND_NOTIFICATION_TYPE,
  parseNotifyCategories,
} from "./notify-categories";

describe("categorías de aviso por persona", () => {
  it("cada post.kind tiene tipo de notificación y categoría", () => {
    for (const kind of POST_KINDS) {
      expect(POST_KIND_NOTIFICATION_TYPE[kind]).toBeTruthy();
      expect(NOTIFY_CATEGORIES).toContain(CATEGORY_FOR_POST_KIND[kind]);
    }
  });

  it("los hitos van a milestone, el progreso a progress, el pensamiento a thought", () => {
    expect(CATEGORY_FOR_POST_KIND.started).toBe("milestone");
    expect(CATEGORY_FOR_POST_KIND.finished).toBe("milestone");
    expect(CATEGORY_FOR_POST_KIND.dropped).toBe("milestone");
    expect(CATEGORY_FOR_POST_KIND.progressed).toBe("progress");
    expect(CATEGORY_FOR_POST_KIND.watched).toBe("progress");
    expect(CATEGORY_FOR_POST_KIND.thought).toBe("thought");
  });

  it("reutiliza los tres tipos que ya existían", () => {
    expect(POST_KIND_NOTIFICATION_TYPE.finished).toBe("followed_finished");
    expect(POST_KIND_NOTIFICATION_TYPE.progressed).toBe("followed_session");
    expect(POST_KIND_NOTIFICATION_TYPE.watched).toBe("followed_episode");
  });

  it("cada post.kind tiene su PROPIO tipo — dos kinds nunca comparten texto", () => {
    const types = POST_KINDS.map((k) => POST_KIND_NOTIFICATION_TYPE[k]);
    expect(new Set(types).size).toBe(POST_KINDS.length);
  });

  it("parseNotifyCategories descarta las categorías del modelo viejo", () => {
    expect(parseNotifyCategories(["finished", "session", "episode", "added"])).toEqual([]);
  });

  it("parseNotifyCategories acepta las nuevas, deduplica y rechaza lo que no es array", () => {
    expect(parseNotifyCategories(["milestone", "milestone", "thought"])).toEqual([
      "milestone",
      "thought",
    ]);
    expect(parseNotifyCategories("milestone")).toEqual([]);
    expect(parseNotifyCategories(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
fnm use 22 && npx vitest run src/lib/social/notify-categories.test.ts
```

Esperado: FAIL. `Failed to resolve import "./post-kinds"`.

- [ ] **Step 3: Crear `post-kinds.ts`**

`src/lib/social/post-kinds.ts`:

```ts
// Lista canónica de `posts.kind` (enum public.post_kind, 20260844_posts.sql).
//
// Vive en su propio módulo, y no en post-actions.ts, porque post-actions.ts es
// `"use server"`: notify-categories.ts lo importan componentes CLIENTE
// (notify-bell.tsx) y no puede arrastrar un módulo de server actions al bundle
// del navegador. Aquí no hay ninguna dependencia, solo la lista.

export const POST_KINDS = [
  "thought",
  "progressed",
  "started",
  "finished",
  "dropped",
  "watched",
] as const;

export type PostKind = (typeof POST_KINDS)[number];
```

- [ ] **Step 4: Reescribir `notify-categories.ts`**

Sustituye entero `src/lib/social/notify-categories.ts`:

```ts
import type { NotificationType } from "./notification-types";
import { POST_KINDS, type PostKind } from "./post-kinds";

// Dos ejes distintos, y mezclarlos fue el error del modelo anterior:
//
//   NotifyCategory  — lo que la persona ACTIVA en la campana de un perfil. Tres
//                     valores, agrupados por naturaleza del post.
//   NotificationType — lo que decide el TEXTO del aviso. Uno por post.kind, para
//                     que la campana diga "terminó Dune" y no "publicó un hito".
//
// Sin dependencias server-only: lo importan la campana (cliente) y el fan-out
// (servidor).
export const NOTIFY_CATEGORIES = ["milestone", "progress", "thought"] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const CATEGORY_FOR_POST_KIND: Record<PostKind, NotifyCategory> = {
  started: "milestone",
  finished: "milestone",
  dropped: "milestone",
  progressed: "progress",
  watched: "progress",
  thought: "thought",
};

// Record (no Partial) a propósito, igual que NOTIFICATION_CATEGORY en push:
// si se añade un post.kind y se olvida su tipo, esto NO compila.
export const POST_KIND_NOTIFICATION_TYPE: Record<PostKind, NotificationType> = {
  // Los tres que ya existían se reutilizan: mismos textos, mismo mapeo de push.
  finished: "followed_finished",
  progressed: "followed_session",
  watched: "followed_episode",
  started: "followed_started",
  dropped: "followed_dropped",
  thought: "followed_thought",
};

const VALID = new Set<string>(NOTIFY_CATEGORIES);

// Una server action es un endpoint POST público: valida contra el set permitido,
// descarta desconocidos y deduplica. Entrada no-array → lista vacía.
//
// Esto es además el colador de las categorías del modelo viejo
// ('finished'|'session'|'episode'|'added'): si alguna fila se quedara sin migrar,
// se lee como lista vacía en vez de romper la campana.
export function parseNotifyCategories(raw: unknown): NotifyCategory[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<NotifyCategory>();
  for (const v of raw) if (typeof v === "string" && VALID.has(v)) seen.add(v as NotifyCategory);
  return [...seen];
}

export { POST_KINDS, type PostKind };
```

- [ ] **Step 5: Correr el test para verlo pasar**

```bash
fnm use 22 && npx vitest run src/lib/social/notify-categories.test.ts
```

Esperado: PASS, 6 tests.

> El árbol NO compila todavía: `notify-followers.ts:5` sigue importando `CATEGORY_NOTIFICATION_TYPE`, que ya no existe. Lo arregla el Step 7.

- [ ] **Step 6: Hacer que `post-actions.ts` use la lista compartida**

En `src/lib/social/post-actions.ts`, sustituye las líneas 9-15:

```ts
export type PostKind =
  | "thought"
  | "progressed"
  | "started"
  | "finished"
  | "dropped"
  | "watched";
```

por:

```ts
// La lista vive en post-kinds.ts (sin deps server-only) para que la puedan leer
// notify-categories.ts y la campana. Se reexporta para no romper a quien ya
// importa el tipo de aquí (autopost.ts).
export type { PostKind };
```

Y añade el import del tipo arriba, junto a los demás (una sola línea; `CreatePostInput` sigue usándolo localmente):

```ts
import type { PostKind } from "./post-kinds";
```

`post-actions.ts` es `"use server"`, donde Next.js exige que todo lo exportado sea una función async — los `export type` están exentos porque se borran al compilar, igual que ya pasaba con el `PostKind` y el `CreatePostInput` de ahora.

- [ ] **Step 7: Escribir el test del fan-out nuevo (falla porque no existe)**

Añade al FINAL de `src/lib/social/notify-followers.test.ts`, sin tocar nada de lo que ya hay:

```ts
import { notifyFollowersOfPost } from "./notify-followers";

describe("notifyFollowersOfPost — el aviso nace del post", () => {
  it("guarda el interaction_target del post y nunca un target de ficha", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      makeFakeSupabase({ follows: [{ ...FOLLOWER, notify_events: ["progress"] }] }),
    );
    const supabase = makeFakeSupabase({});

    await notifyFollowersOfPost(supabase, "autor", {
      postId: "post-p",
      kind: "progressed",
      interactionTargetId: "it-post-p",
    });

    expect(mocks.notifyMany).toHaveBeenCalledTimes(1);
    const params = mocks.notifyMany.mock.calls[0][1];
    expect(params.interactionTargetId).toBe("it-post-p");
    expect(params.targetType).toBeUndefined();
    expect(params.targetId).toBeUndefined();
    expect(params.userIds).toEqual(["seguidor"]);
    expect(params.actorId).toBe("autor");
  });

  it("la clave de dedupe cuelga del POST, no del pase: dos posts = dos avisos", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      makeFakeSupabase({ follows: [{ ...FOLLOWER, notify_events: ["progress"] }] }),
    );
    const supabase = makeFakeSupabase({});

    await notifyFollowersOfPost(supabase, "autor", {
      postId: "post-1",
      kind: "progressed",
      interactionTargetId: "it-1",
    });
    await notifyFollowersOfPost(supabase, "autor", {
      postId: "post-2",
      kind: "progressed",
      interactionTargetId: "it-2",
    });

    expect(mocks.notifyMany.mock.calls[0][1].dedupeKey).toBe("person:followed_session:post-1");
    expect(mocks.notifyMany.mock.calls[1][1].dedupeKey).toBe("person:followed_session:post-2");
  });

  it("cada kind emite su tipo y filtra por SU categoría", async () => {
    const casos = [
      { kind: "started", categoria: "milestone", tipo: "followed_started" },
      { kind: "finished", categoria: "milestone", tipo: "followed_finished" },
      { kind: "dropped", categoria: "milestone", tipo: "followed_dropped" },
      { kind: "progressed", categoria: "progress", tipo: "followed_session" },
      { kind: "watched", categoria: "progress", tipo: "followed_episode" },
      { kind: "thought", categoria: "thought", tipo: "followed_thought" },
    ] as const;

    for (const caso of casos) {
      vi.clearAllMocks();
      mocks.notifyMany.mockResolvedValue(["seguidor"]);
      mocks.createServiceRoleClient.mockReturnValue(
        makeFakeSupabase({ follows: [{ ...FOLLOWER, notify_events: [caso.categoria] }] }),
      );

      await notifyFollowersOfPost(makeFakeSupabase({}), "autor", {
        postId: "post-1",
        kind: caso.kind,
        interactionTargetId: "it-1",
      });

      expect(mocks.notifyMany, `kind ${caso.kind}`).toHaveBeenCalledTimes(1);
      expect(mocks.notifyMany.mock.calls[0][1].type, `kind ${caso.kind}`).toBe(caso.tipo);
    }
  });

  it("quien no tiene la categoría activa no recibe nada", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      makeFakeSupabase({ follows: [{ ...FOLLOWER, notify_events: ["milestone"] }] }),
    );

    await notifyFollowersOfPost(makeFakeSupabase({}), "autor", {
      postId: "post-p",
      kind: "progressed",
      interactionTargetId: "it-post-p",
    });

    expect(mocks.notifyMany).not.toHaveBeenCalled();
  });

  it("un fallo leyendo follows no propaga (best-effort)", async () => {
    mocks.createServiceRoleClient.mockImplementation(() => {
      throw new Error("service role caído");
    });

    await expect(
      notifyFollowersOfPost(makeFakeSupabase({}), "autor", {
        postId: "post-p",
        kind: "progressed",
        interactionTargetId: "it-post-p",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.notifyMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Correr el test para verlo fallar**

```bash
fnm use 22 && npx vitest run src/lib/social/notify-followers.test.ts
```

Esperado: FAIL. `notifyFollowersOfPost is not a function` (y el error de importación de `CATEGORY_NOTIFICATION_TYPE` del Step 5).

- [ ] **Step 9: Escribir `notifyFollowersOfPost`**

En `src/lib/social/notify-followers.ts`, sustituye el import de la línea 5:

```ts
import { CATEGORY_NOTIFICATION_TYPE, type NotifyCategory } from "./notify-categories";
```

por:

```ts
import {
  CATEGORY_FOR_POST_KIND,
  POST_KIND_NOTIFICATION_TYPE,
  type NotifyCategory,
} from "./notify-categories";
import type { PostKind } from "./post-kinds";
```

Añade al final del fichero:

```ts
// Avisa a los seguidores ACEPTADOS de `authorId` que tienen activada la categoría
// de ESTE post. Se llama desde createPost, el único sitio que inserta en `posts`.
//
// Por qué desde ahí y no desde el hecho (sesión, cierre de pase): el aviso nace
// con su destino en la mano. La versión anterior se disparaba al ocurrir el hecho
// y salía a BUSCAR si por casualidad había un post; en el camino de la sesión el
// aviso se emitía antes de crear el post, así que no lo encontraba nunca y caía a
// la ficha del ítem. Ese modo de fallo aquí no existe: si hay post, es este.
//
// Best-effort: mismo contrato que notify() — nunca lanza. Un fan-out roto no puede
// deshacer un post ya publicado.
//
// Lee follows por service-role: es un camino de servidor de confianza y así
// notify_events (preferencia privada del follower) no se expone por RLS al autor.
export async function notifyFollowersOfPost(
  supabase: SupabaseServerClient,
  authorId: string,
  post: { postId: string; kind: PostKind; interactionTargetId: string },
): Promise<void> {
  try {
    const category: NotifyCategory = CATEGORY_FOR_POST_KIND[post.kind];
    const type = POST_KIND_NOTIFICATION_TYPE[post.kind];

    const writer = createServiceRoleClient();
    const { data, error } = await writer
      .from("follows")
      .select("follower_id")
      .eq("followee_id", authorId)
      .eq("status", "accepted")
      .contains("notify_events", [category]);
    if (error) throw error;
    const userIds = (data ?? []).map((r) => r.follower_id);
    if (userIds.length === 0) return;

    await notifyMany(supabase, {
      userIds,
      actorId: authorId,
      type,
      // SIEMPRE el target del post. No hay rama de fallback a la ficha: el href
      // sale de interaction_targets.href, que la DB fija como '/post/' || id
      // (20260844_posts.sql:99-115).
      interactionTargetId: post.interactionTargetId,
      // Solo IDEMPOTENCIA (doble envío, reintento), no colapso. La clave vieja
      // colgaba del pase y colapsaba avisos que llevaban a posts DISTINTOS; un
      // post es un enlace propio y colapsarlos era tirar información. El volumen
      // lo controla quien publica: para eso pulsó «Compartir». notifyMany añade
      // `:${userId}`.
      dedupeKey: `person:${type}:${post.postId}`,
    });
  } catch (err) {
    console.error("notifyFollowersOfPost failed", err);
  }
}
```

- [ ] **Step 10: Correr los tests para verlos pasar**

```bash
fnm use 22 && npx vitest run src/lib/social/notify-followers.test.ts src/lib/social/notify-categories.test.ts
```

Esperado: PASS. Los tests viejos de `notifyFollowersOfEvent` siguen ahí y siguen verdes — el viejo no se ha tocado.

- [ ] **Step 11: Comprobar que lo ROTO es exactamente lo que se espera**

```bash
fnm use 22 && npx tsc --noEmit
```

Esperado: **NO compila**, y ese es el estado correcto al acabar esta tarea. Lo que debes confirmar es que los errores caen **solo** en estos ficheros, todos ellos por pasar un literal del vocabulario viejo a `NotifyCategory`:

- `src/components/social/notify-bell.tsx`
- `src/lib/sessions/actions.ts`
- `src/lib/passes/actions.ts`
- `src/lib/series/episode-actions.ts`
- `src/lib/social/notify-followers.ts` (el `notifyFollowersOfEvent` viejo, que esta tarea no toca)
- `src/lib/social/notify-followers.test.ts` (el `describe` viejo)

Un error en cualquier OTRO fichero sí es tuyo: párate y repórtalo. Los seis de arriba los cierra la Task 4, y por eso las dos se revisan juntas.

- [ ] **Step 12: Commit**

```bash
git add src/lib/social/post-kinds.ts src/lib/social/notify-categories.ts src/lib/social/notify-categories.test.ts src/lib/social/notify-followers.ts src/lib/social/notify-followers.test.ts src/lib/social/post-actions.ts
git commit -m "feat(social): notifyFollowersOfPost y categorias por naturaleza del post"
```

---

## Task 4: Cambiar el disparo (enganchar el nuevo, borrar el viejo)

Es una sola tarea porque no se puede partir sin dejar el árbol roto o con avisos duplicados: enganchar el nuevo sin quitar el viejo mandaría dos avisos por hecho.

**Files:**
- Modify: `src/lib/social/post-actions.ts:87-109`
- Modify: `src/lib/social/notify-followers.ts` (borrar `resolvePostInteractionTargetId`, `notifyFollowersOfEvent`, `notifyAdded`)
- Modify: `src/lib/sessions/actions.ts:18,185-188`
- Modify: `src/lib/passes/actions.ts:8,140-146`
- Modify: `src/lib/series/episode-actions.ts:14,91-104`
- Modify: `src/lib/library/quick-add-actions.ts:7,31`
- Modify: `src/lib/library/add-existing-item.ts:7,30`
- Modify: `src/app/buscar/actions.ts:9,82`
- Modify: `src/app/buscar/manual/actions.ts:10,93`
- Test: `src/lib/social/post-actions.test.ts`
- Test: `src/lib/social/notify-followers.test.ts` (borrar el `describe` viejo)

**Interfaces:**
- Consumes: `notifyFollowersOfPost(supabase, authorId, {postId, kind, interactionTargetId})` de la Task 3.
- Produce: `createPost` avisa a los seguidores. `notifyFollowersOfEvent` y `notifyAdded` dejan de existir.

- [ ] **Step 1: Escribir el test del enganche (falla porque no existe)**

En `src/lib/social/post-actions.test.ts`, añade el mock nuevo al bloque `vi.hoisted` de arriba y su `vi.mock`:

```ts
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidateFeed: vi.fn(),
  notifyMentions: vi.fn(),
  notifyFollowersOfPost: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateFeed: mocks.revalidateFeed }));
vi.mock("./notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));
vi.mock("./notify-followers", () => ({ notifyFollowersOfPost: mocks.notifyFollowersOfPost }));
```

Y añade este `describe` al final del fichero:

```ts
describe("createPost — fan-out a seguidores", () => {
  it("avisa con el target del post ya resuelto", async () => {
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: { id: "it-post-1" },
    });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "progressed",
      anchorType: "book",
      anchorId: "anchor-1",
      sourceKind: "progress_session",
      sourceId: "ses-1",
    });

    expect(result).toEqual({ ok: true, id: "post-1" });
    expect(mocks.notifyFollowersOfPost).toHaveBeenCalledTimes(1);
    expect(mocks.notifyFollowersOfPost.mock.calls[0][1]).toBe("actor");
    expect(mocks.notifyFollowersOfPost.mock.calls[0][2]).toEqual({
      postId: "post-1",
      kind: "progressed",
      interactionTargetId: "it-post-1",
    });
  });

  it("un hito SIN cuerpo también avisa (el lookup del target no depende del body)", async () => {
    // Regresión: el lookup de interaction_targets vivía dentro de `if (body)`
    // porque solo lo usaban las menciones. Los posts de hito no llevan cuerpo,
    // así que dejarlo ahí los habría dejado a todos sin aviso.
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: { id: "it-post-1" },
    });
    mocks.createClient.mockResolvedValue(client);

    await createPost({
      kind: "finished",
      anchorType: "book",
      anchorId: "anchor-1",
      sourceKind: "pass",
      sourceId: "pase-1",
    });

    expect(mocks.notifyFollowersOfPost).toHaveBeenCalledTimes(1);
    expect(mocks.notifyMentions).not.toHaveBeenCalled();
  });

  it("sin interaction_target no avisa, pero el post sigue publicado", async () => {
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: null,
    });
    mocks.createClient.mockResolvedValue(client);

    const result = await createPost({
      kind: "thought",
      anchorType: "book",
      anchorId: "anchor-1",
      body: "hola",
    });

    expect(result).toEqual({ ok: true, id: "post-1" });
    expect(mocks.notifyFollowersOfPost).not.toHaveBeenCalled();
  });

  it("un fan-out que lanza NO convierte el post en {ok:false}", async () => {
    const { client } = makeClient({
      user: { id: "actor" },
      anchorFound: true,
      mentionTarget: { id: "it-post-1" },
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.notifyFollowersOfPost.mockRejectedValueOnce(new Error("boom"));

    const result = await createPost({
      kind: "finished",
      anchorType: "book",
      anchorId: "anchor-1",
      sourceKind: "pass",
      sourceId: "pase-1",
    });

    expect(result).toEqual({ ok: true, id: "post-1" });
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
fnm use 22 && npx vitest run src/lib/social/post-actions.test.ts
```

Esperado: FAIL, 4 tests nuevos. `expected "spy" to be called 1 times, but got 0 times`.

- [ ] **Step 3: Enganchar el fan-out en `createPost`**

En `src/lib/social/post-actions.ts`, añade el import junto a los otros:

```ts
import { notifyFollowersOfPost } from "./notify-followers";
```

Y sustituye el bloque de las líneas 87-109 (el `if (body) { … notifyMentions … }`) por:

```ts
    // El target canónico del post ('post', materializado por el trigger de
    // 20260844_posts.sql) se resuelve SIEMPRE, no solo cuando hay cuerpo: lo
    // necesitan las menciones (que sí requieren cuerpo) y el aviso a seguidores
    // (que no — un post de hito no lleva texto).
    let interactionTargetId: string | null = null;
    try {
      const { data: target } = await supabase
        .from("interaction_targets")
        .select("id")
        .eq("kind", "post")
        .eq("source_id", inserted.id)
        .maybeSingle();
      interactionTargetId = target?.id ?? null;
    } catch (targetError) {
      console.error("createPost: interaction_target lookup failed", targetError);
    }

    // Menciones @usuario, best-effort. Un fallo aquí nunca debe deshacer el post
    // ya publicado.
    if (body && interactionTargetId) {
      try {
        await notifyMentions(supabase, {
          authorId: user.id,
          text: body,
          interactionTargetId,
        });
      } catch (mentionError) {
        console.error("createPost: notifyMentions failed", mentionError);
      }
    }

    // Aviso a los seguidores suscritos a la categoría de este post. Este es EL
    // punto de disparo de los avisos followed_* (spec 2026-08-13): createPost es
    // el único sitio que inserta en `posts`, así que el aviso no puede volver a
    // emitirse antes de que exista el post al que apunta.
    //
    // Sin target no se avisa: no debería pasar (lo escribe un trigger AFTER
    // INSERT en la misma transacción), y si pasa, un aviso sin destino es peor
    // que ninguno. Misma postura que las menciones.
    if (interactionTargetId) {
      try {
        await notifyFollowersOfPost(supabase, user.id, {
          postId: inserted.id,
          kind: input.kind,
          interactionTargetId,
        });
      } catch (notifyError) {
        console.error("createPost: notifyFollowersOfPost failed", notifyError);
      }
    }
```

- [ ] **Step 4: Correr el test para verlo pasar**

```bash
fnm use 22 && npx vitest run src/lib/social/post-actions.test.ts
```

Esperado: PASS, todos.

- [ ] **Step 5: Quitar la llamada de la sesión**

En `src/lib/sessions/actions.ts`, borra el import de la línea 18 (`import { notifyFollowersOfEvent } …`) y borra el bloque de las líneas 185-188:

```ts
  await notifyFollowersOfEvent(supabase, user.id, "session", {
    targetType: "diary_entry",
    targetId: passId,
  });
```

En su lugar, deja este comentario donde estaba, para que nadie lo reintroduzca:

```ts
  // Registrar una sesión NO avisa a nadie por sí solo: el aviso a seguidores lo
  // emite createPost más abajo, y solo si el usuario marcó «Compartir». Ese es el
  // trato de la spec 2026-08-13 — se pierden los avisos de lo no compartido a
  // cambio de que el aviso lleve siempre al post.
```

- [ ] **Step 6: Quitar la llamada del cierre de pase**

En `src/lib/passes/actions.ts`, borra el import de la línea 8 y el bloque 140-146 (el comentario «Aviso a los seguidores suscritos a "terminó"…» y la llamada). Deja en su sitio:

```ts
  // Cerrar el pase no avisa: el aviso de «terminó» lo emite createPost cuando
  // updateStatus autopostea el hito (manage-actions.ts). Ver spec 2026-08-13.
```

- [ ] **Step 7: Quitar la llamada del episodio**

En `src/lib/series/episode-actions.ts`, borra el import de la línea 14 y sustituye el bloque 89-104 por:

```ts
  if (watched) {
    await markEpisodeWatched(supabase, user.id, seriesId, passId, season, episode);
    // Marcar un episodio no avisa a nadie: el aviso lo emitiría un post
    // kind='watched', y hoy NADIE crea posts de ese kind (no existe «compartir
    // episodio»). Ver spec 2026-08-13 §8.2 — hay issue abierta.
  } else {
```

El resto del `else` y el `rollAndMaybeClose` final quedan igual.

- [ ] **Step 8: Quitar las cuatro llamadas a `notifyAdded`**

En cada uno de estos cuatro ficheros, borra el import de `notifyAdded` y su única llamada:

- `src/lib/library/quick-add-actions.ts` — import línea 7, llamada línea 31
- `src/lib/library/add-existing-item.ts` — import línea 7, llamada línea 30
- `src/app/buscar/actions.ts` — import línea 9, llamada línea 82
- `src/app/buscar/manual/actions.ts` — import línea 10, llamada línea 93

En los cuatro, la variable `outcome` puede quedar sin usar. Si el lint se queja, comprueba antes si `outcome` se sigue usando para otra cosa en esa función; si no, cambia `const outcome = await applyTransition(...)` por `await applyTransition(...)`.

- [ ] **Step 9: Borrar el fan-out viejo**

En `src/lib/social/notify-followers.ts`, borra:

- `resolvePostInteractionTargetId` entera (líneas 9-75, incluido su comentario de cabecera)
- `notifyFollowersOfEvent` entera (líneas 77-124)
- `notifyAdded` entera (líneas 126-140)
- el import de `TransitionOutcome` (línea 3) y el de `ReviewTargetType` de `./notifications` (línea 4, deja solo `notifyMany`)

Queda solo `notifyFollowersOfPost` con sus imports.

- [ ] **Step 10: Borrar los tests del fan-out viejo**

En `src/lib/social/notify-followers.test.ts`, borra el `describe("notifyFollowersOfEvent — ruteo al post del hito", …)` entero (líneas 97-166) y el import de `notifyFollowersOfEvent` (línea 16). Actualiza el comentario de cabecera del fichero (líneas 3-5) a:

```ts
// Ancla el contrato del fan-out a seguidores: el aviso nace del POST y guarda
// SIEMPRE su interaction_target_id, sin rama de fallback a la ficha del ítem.
```

El helper `makeFakeSupabase`, la constante `FOLLOWER` y el `beforeEach` se quedan: los usa el `describe` nuevo de la Task 3. En el `beforeEach`, cambia `notify_events: ["finished", "session", "added"]` por `notify_events: ["milestone", "progress", "thought"]`.

- [ ] **Step 11: Verificar que no queda ni un rastro**

```bash
grep -rn "notifyFollowersOfEvent\|notifyAdded\|CATEGORY_NOTIFICATION_TYPE\|resolvePostInteractionTargetId" src/ e2e/
```

Esperado: **sin resultados**.

- [ ] **Step 12: Compilar y correr los unitarios**

```bash
fnm use 22 && npx tsc --noEmit && npx vitest run
```

Esperado: cero errores de tipos; toda la suite en verde. Si `src/lib/passes/actions.test.ts` falla, es porque cubría el aviso de `closePass` que acabas de quitar — bórrale ese caso, no reintroduzcas la llamada.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(social): los avisos de seguimiento se emiten al publicar el post"
```

---

## Task 5: La campana de un perfil, con tres casillas

**Files:**
- Modify: `src/components/social/notify-bell.tsx:9,42-47,96-100`
- Modify: `messages/es.json:385-389`

**Interfaces:**
- Consumes: `NOTIFY_CATEGORIES` y `NotifyCategory` de la Task 3.
- Produce: nada que consuma otra tarea.

- [ ] **Step 1: Cambiar las etiquetas en es.json**

Sustituye las líneas 385-389:

```json
    "notifyFinished": "Termine o reseñe una obra",
    "notifySession": "Registre una sesión",
    "notifyEpisode": "Vea un episodio",
    "notifyAdded": "Añada algo a su biblioteca",
    "notifyAddedHint": "Puede llegar en ráfagas si añade muchas obras seguidas.",
```

por:

```json
    "notifyMilestone": "Empiece, termine o abandone una obra",
    "notifyProgress": "Comparta su progreso",
    "notifyThought": "Publique un pensamiento",
    "notifyOnlyPublishedHint": "Solo llegan avisos de lo que publica: lo que registre en privado no avisa.",
```

- [ ] **Step 2: Actualizar el componente**

En `src/components/social/notify-bell.tsx`:

Borra la línea 9 (`const HINTED: NotifyCategory = "added";`).

Sustituye el mapa de etiquetas (líneas 42-47) por:

```ts
  const label: Record<NotifyCategory, string> = {
    milestone: t("notifyMilestone"),
    progress: t("notifyProgress"),
    thought: t("notifyThought"),
  };
```

Sustituye el bloque del hint por categoría (líneas 96-100):

```tsx
              <span className="flex flex-col">
                {label[cat]}
                {cat === HINTED && (
                  <span className="text-xs text-muted-foreground">{t("notifyAddedHint")}</span>
                )}
              </span>
```

por, simplemente:

```tsx
              <span>{label[cat]}</span>
```

Y añade el aviso general una sola vez, justo después del `</label>` de cierre del `.map(...)` y antes del bloque `{failed && (`:

```tsx
          <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
            {t("notifyOnlyPublishedHint")}
          </p>
```

El hint deja de colgar de una categoría porque ya no habla del volumen de `added`: habla de la regla nueva —solo se avisa de lo publicado— y esa aplica a las tres.

- [ ] **Step 3: Verificar que compila**

```bash
fnm use 22 && npx tsc --noEmit
```

Esperado: cero errores. `Record<NotifyCategory, string>` obliga a que las tres claves estén.

- [ ] **Step 4: Verificar que no queda ninguna clave i18n muerta ni ninguna sin definir**

```bash
grep -rn "notifyFinished\|notifySession\|notifyEpisode\|notifyAdded\|notifyAddedHint" src/ messages/
```

Esperado: **sin resultados**. (Ojo: `followedFinished`, `followedSession` y `followedAdded` SÍ deben seguir en `es.json` — son los textos de los avisos, no las etiquetas del menú. El patrón de arriba no los captura porque empiezan por `followed`, no por `notify`.)

- [ ] **Step 5: Arreglar el e2e que las etiquetas viejas rompen**

`e2e/avisos-por-persona.spec.ts` marca la casilla por su etiqueta literal, que acaba de desaparecer. En las tres apariciones (líneas 71, 79 y el `expect` de la 78-80), sustituye:

```ts
/termine o reseñe una obra/i
```

por:

```ts
/empiece, termine o abandone una obra/i
```

Y actualiza el título del test para que no mienta sobre qué categoría prueba:

```ts
test("A sigue a B, abre la campana de avisos y la categoría marcada persiste", async ({
```

se queda igual — sigue siendo cierto. Solo cambia el selector.

- [ ] **Step 6: Correr ese e2e**

```bash
fnm use 22 && npx playwright test e2e/avisos-por-persona.spec.ts
```

Esperado: PASS. Si falla con `strict mode violation` es que el patrón nuevo casa con más de una casilla: acótalo con `{ exact: true }` y el texto completo.

- [ ] **Step 7: Commit**

```bash
git add src/components/social/notify-bell.tsx messages/es.json e2e/avisos-por-persona.spec.ts
git commit -m "feat(social): campana por persona con las tres categorias de post"
```

---

## Task 6: e2e — el aviso lleva al post, y lo no compartido no avisa

Cubre el hueco que la spec señala: `e2e/avisos-por-persona.spec.ts:52` solo comprueba que el toggle persiste, nunca que llegue el aviso.

**Files:**
- Modify: `e2e/posts.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior, ya desplegado en el dev server.
- Produce: nada.

- [ ] **Step 1: Escribir el caso feliz**

Añade al final de `e2e/posts.spec.ts`. Reutiliza los helpers que el fichero ya tiene (`rest`, `insertOne`, `createUser`, `deleteUser`, `login`, `loginAs`, `devtestId`, `resolveBookFixture`, `snapshotPass`, `restorePass`, `sessionIds`, `sessionLink`) — **no crees helpers nuevos**:

```ts
// Spec 2026-08-13 — el aviso de seguimiento nace del POST: compartir una sesión
// avisa a quien sigue, y la campana abre /post/[id], NO la ficha del libro. Antes
// de esta spec el aviso se emitía en addSession ANTES de createPost, así que el
// resolutor no encontraba el post y caía a la ficha (el bug que motivó el cambio).
//
// El autor es devtest (tiene el pase fixture con el que se conduce la hoja de
// sesión); el seguidor es un usuario desechable. El follow se inserta por
// service-role con notify_events ya puesto: que el toggle persista lo cubre
// avisos-por-persona.spec.ts, aquí lo que se prueba es a dónde LLEVA el aviso.
test("sesión compartida: quien sigue recibe el aviso y la campana abre el post", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await login(page);
  const owner = await devtestId();
  const { itemId, passId } = await resolveBookFixture(owner);

  const stamp = Date.now();
  const follower = await createUser(request, `avisopost${stamp}`.slice(0, 20));
  const shareBody = `Sesión con aviso e2e ${stamp}`;
  const bodyFilter = encodeURIComponent(shareBody);
  const passSnapshot = await snapshotPass(passId);
  const sessionsBefore = await sessionIds(passId);

  try {
    await insertOne("follows", {
      follower_id: follower.id,
      followee_id: owner,
      status: "accepted",
      notify_events: ["progress"],
    });

    // ── El autor registra una sesión CON «Compartir» ──
    await page.goto(`/libro/${itemId}?tab=log`);
    const dialog = page.getByRole("dialog");
    await sessionLink(page, passId).click();
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="page"]').fill("5"); // lejísimos del total: no auto-cierra
    await dialog.getByRole("checkbox", { name: "Compartir en mi perfil" }).check();
    await dialog.getByPlaceholder(/algo que contar/i).fill(shareBody);
    await dialog.getByRole("button", { name: "Guardar sesión" }).click();
    await expect(dialog).toBeHidden();

    // ── Verdad del SERVIDOR antes de mirar la campana: el aviso existe ──
    await expect
      .poll(
        async () =>
          (
            await rest<{ id: string }[]>(
              `notifications?user_id=eq.${follower.id}&type=eq.followed_session&select=id`,
            )
          ).length,
        { timeout: 15_000, message: "el aviso followed_session del seguidor debe persistir" },
      )
      .toBeGreaterThan(0);

    const [post] = await rest<{ id: string }[]>(
      `posts?kind=eq.progressed&body=eq.${bodyFilter}&select=id`,
    );
    expect(post?.id).toBeTruthy();

    // ── El seguidor abre la campana y el aviso le lleva AL POST ──
    await loginAs(page, follower.email, follower.password);
    await page.getByRole("button", { name: "Notificaciones" }).click();
    const aviso = page.getByRole("link").filter({ hasText: /compartió una sesión de lectura/i });
    await expect(aviso).toBeVisible();
    await aviso.click();
    // LA aserción del test: /post/<id>, no /libro/<id>.
    await expect(page).toHaveURL(new RegExp(`/post/${post.id}$`));
  } finally {
    await rest(
      `follows?follower_id=eq.${follower.id}&followee_id=eq.${owner}`,
      { method: "DELETE" },
    ).catch(() => {});
    const rows = await rest<{ id: string }[]>(
      `progress_sessions?pass_id=eq.${passId}&select=id`,
    ).catch(() => [] as { id: string }[]);
    const newIds = rows.map((r) => r.id).filter((id) => !sessionsBefore.has(id));
    if (newIds.length > 0) {
      await rest(`posts?source_id=in.(${newIds.join(",")})&kind=eq.progressed`, {
        method: "DELETE",
      }).catch(() => {});
      await rest(`progress_sessions?id=in.(${newIds.join(",")})`, { method: "DELETE" }).catch(
        () => {},
      );
    }
    await restorePass(passId, passSnapshot);
    await deleteUser(follower.id); // arrastra sus notifications por FK
  }
});
```

- [ ] **Step 2: Escribir el caso negativo**

Es el trato de la spec, y sin este test nadie se entera si alguien reintroduce el disparo en `addSession`:

```ts
// La otra mitad del trato: lo que NO se publica no avisa. Sin este caso, alguien
// puede reintroducir un notifyFollowersOfEvent en addSession y todos los tests
// seguirían verdes.
test("sesión NO compartida: cero avisos para quien sigue", async ({ page, request }) => {
  test.setTimeout(150_000);
  await login(page);
  const owner = await devtestId();
  const { itemId, passId } = await resolveBookFixture(owner);

  const stamp = Date.now();
  const follower = await createUser(request, `sinaviso${stamp}`.slice(0, 20));
  const passSnapshot = await snapshotPass(passId);
  const sessionsBefore = await sessionIds(passId);

  try {
    await insertOne("follows", {
      follower_id: follower.id,
      followee_id: owner,
      status: "accepted",
      // Las TRES activas: si algo avisara, avisaría con cualquier categoría.
      notify_events: ["milestone", "progress", "thought"],
    });

    await page.goto(`/libro/${itemId}?tab=log`);
    const dialog = page.getByRole("dialog");
    await sessionLink(page, passId).click();
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="page"]').fill("7");
    // NO se marca «Compartir en mi perfil».
    await dialog.getByRole("button", { name: "Guardar sesión" }).click();
    await expect(dialog).toBeHidden();

    // Se espera a que la SESIÓN exista (verdad del servidor). Sin este anclaje,
    // "0 avisos" sería cierto simplemente porque aún no había pasado nada.
    await expect
      .poll(
        async () => {
          const rows = await rest<{ id: string }[]>(
            `progress_sessions?pass_id=eq.${passId}&select=id`,
          );
          return rows.filter((r) => !sessionsBefore.has(r.id)).length;
        },
        { timeout: 15_000, message: "la sesión sin compartir debe guardarse igual" },
      )
      .toBeGreaterThan(0);

    const avisos = await rest<{ id: string }[]>(
      `notifications?user_id=eq.${follower.id}&select=id`,
    );
    expect(avisos).toHaveLength(0);

    // Y tampoco se publicó post de esa sesión.
    const rows = await rest<{ id: string }[]>(`progress_sessions?pass_id=eq.${passId}&select=id`);
    const newIds = rows.map((r) => r.id).filter((id) => !sessionsBefore.has(id));
    const posts = await rest<{ id: string }[]>(
      `posts?source_id=in.(${newIds.join(",")})&select=id`,
    );
    expect(posts).toHaveLength(0);
  } finally {
    await rest(
      `follows?follower_id=eq.${follower.id}&followee_id=eq.${owner}`,
      { method: "DELETE" },
    ).catch(() => {});
    const rows = await rest<{ id: string }[]>(
      `progress_sessions?pass_id=eq.${passId}&select=id`,
    ).catch(() => [] as { id: string }[]);
    const newIds = rows.map((r) => r.id).filter((id) => !sessionsBefore.has(id));
    if (newIds.length > 0) {
      await rest(`progress_sessions?id=in.(${newIds.join(",")})`, { method: "DELETE" }).catch(
        () => {},
      );
    }
    await restorePass(passId, passSnapshot);
    await deleteUser(follower.id);
  }
});
```

- [ ] **Step 3: Correr los dos**

`npm run test:e2e` **reutiliza el dev server que ya haya**. Comprueba antes que el 3000 está libre o lo ocupa tu propio `next dev`:

```bash
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
```

Luego:

```bash
fnm use 22 && npx playwright test e2e/posts.spec.ts
```

Esperado: PASS, incluidos los dos nuevos y todos los que ya había.

> Si algo falla solo bajo `next dev` y pasa en build de producción (o al revés), sospecha de `use cache`: `next-request-in-use-cache` **pasa `next build` y falla en `next start`**. Corre los e2e contra build de producción antes de dar la tarea por buena.

- [ ] **Step 4: Commit**

```bash
git add e2e/posts.spec.ts
git commit -m "test(e2e): el aviso de sesion compartida abre el post; sin compartir no avisa"
```

---

## Task 7: Documentación, prod y las issues pendientes

Un cambio no está hecho hasta que el doc canónico vuelve a ser cierto.

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md`
- Modify: `docs/requirements/backlog.md:90`

**Interfaces:**
- Consumes: todo lo anterior, verde.
- Produce: nada.

- [ ] **Step 1: Aplicar las dos migraciones en prod**

Con `mcp__supabase-prod__apply_migration`, en el mismo orden: `20260856`, luego `20260857`. Antes, la misma foto del estado previo:

```sql
select notify_events, count(*)
from public.follows
where cardinality(notify_events) > 0
group by notify_events
order by count(*) desc;
```

Verifica después con las dos consultas del Step 6 de la Task 1, contra `pg_enum` y contra `follows` — **no** contra `list_migrations`.

- [ ] **Step 2: Actualizar `data-model.md`**

Toca los dos sitios que hablan de esto (`:167-171` y `:603-605`) y añade un delta con fecha 2026-08-13:

- `public.notification_type` gana `followed_started`, `followed_dropped`, `followed_thought`. `followed_added` se conserva pero **ya no se emite**.
- `follows.notify_events` cambia de dominio: de `{finished, session, episode, added}` a `{milestone, progress, thought}`. Migración `20260857`.
- Los avisos `followed_*` los escribe `createPost`, no las acciones de pase/sesión/episodio, y llevan siempre `interaction_target_id` (nunca `target_type`/`target_id`).

Actualiza la fecha de verificación del documento.

- [ ] **Step 3: Añadir la entrada en `decisiones.md`**

**Al final**, sin reescribir ninguna anterior (es append-only):

| 2026-08-13 | **Los avisos de seguimiento (`followed_*`) se emiten al PUBLICAR un post, no al ocurrir el hecho; la notificación guarda siempre el `interaction_target` del post y no tiene fallback a la ficha** | Se acepta perder los avisos de lo no publicado (sesión sin «Compartir», cierre de pase con autopost desactivado) y desaparecen las categorías `added` y `episode`. A cambio el destino del aviso es correcto por construcción, no por que el orden entre dos acciones no coordinadas resulte favorable. La migración enciende `thought` a quien tuviera cualquier categoría activa: «quiero saber de esta persona» se interpreta como que incluye lo que escriba |

- [ ] **Step 4: Actualizar `backlog.md:90`**

La línea dice hoy `campana por categoría (finished|session|episode|added)`. Cámbiala a `milestone|progress|thought` y añade la referencia a la spec 2026-08-13. La narrativa de *cómo* se hizo va en la spec, **nunca** en el backlog.

- [ ] **Step 5: Abrir la issue de `watched` sin productor**

```sh
gh issue create --label "area:social,tipo:deuda,P2" --title "El post kind 'watched' no lo crea nadie: marcar un episodio no avisa a nadie" --body-file -
```

El cuerpo debe contener, escrito para quien lo lea dentro de seis meses sin este contexto:

- **Qué pasa:** marcar un episodio como visto no genera ningún aviso a los seguidores. Antes de la spec 2026-08-13 sí lo generaba (`followed_episode`, disparado desde `setEpisodeWatched`).
- **Por qué:** los avisos ahora nacen al publicar un post. `watched` está declarado como `PostKind` (`src/lib/social/post-kinds.ts`) y el feed sabe pintarlo (`src/lib/social/feed.ts:240-241`), pero **ninguna ruta lo crea**: no existe «compartir episodio», el equivalente del «Compartir» de la hoja de sesión.
- **Qué SÍ funciona:** compartir una sesión de lectura (`progressed`) y los hitos de pase (`started`/`finished`/`dropped`). La categoría `progress` de la campana existe y funciona; solo que hoy la dispara únicamente `progressed`.
- **Qué haría falta:** un opt-in de compartir en la pestaña Episodios que llame a `createPost({kind:"watched", sourceKind:"episode_watch", sourceId:<episode_watches.id>})`. El resto —tipo de aviso `followed_episode`, categoría `progress`, texto en `es.json`, categoría push— **ya está puesto** y sin usar.

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md docs/requirements/backlog.md
git commit -m "docs: sincronizar data-model, decisiones y backlog con los avisos desde el post"
```

- [ ] **Step 7: Chequeo de deriva**

```bash
/drift-check
```

O a mano, la superficie de `docs/DRIFT-CHECK.md` que cubre enums y columnas. La superficie 6 (grants por columna) **no** aplica: no se añadió ninguna columna.

---

## Notas de verificación final

Antes de dar el trabajo por cerrado:

```bash
fnm use 22 && npx tsc --noEmit && npx vitest run && npx playwright test
```

Y a mano, la comprobación que motivó todo esto: registrar una sesión con «Compartir» desde una cuenta, y desde la cuenta que la sigue pulsar el aviso. Debe abrir `/post/<uuid>`, no la ficha del libro.

Higiene al terminar: puerto 3000 libre (o un único `next dev` tuyo), cero worktrees huérfanos en `.claude/worktrees/`.
