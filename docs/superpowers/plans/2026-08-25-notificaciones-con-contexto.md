# Notificaciones con contexto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la campana y el push digan lo que pasó de verdad — con qué emoji se reaccionó, qué obra se terminó y qué se comentó — en vez de una frase fija por tipo.

**Architecture:** `notifications` gana una columna `context jsonb` con una foto de lo ocurrido, escrita por `notify()` desde lo que cada punto de llamada ya tiene en la mano. Una función **pura** elige la variante de copia a partir de ese contexto, y la usan tanto la campana (cliente) como el push (servidor), que hoy coinciden solo por convención.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, `next-intl`, Vitest (entorno `node`), `web-push`.

**Spec:** `docs/superpowers/specs/2026-08-25-notificaciones-con-contexto-design.md`

## Global Constraints

- **Rama**: `spec/notificaciones-con-contexto`, ya creada desde `main` (`cf91d981`), con el spec commiteado en `c0ffae59`.
- **`notifications` tiene GRANTS POR COLUMNA.** Verificado el 2026-08-25 contra dev: `anon` y `authenticated` tienen `SELECT` y `UPDATE` columna a columna; `postgres` y `service_role` tienen `INSERT`, `SELECT`, `UPDATE` y `REFERENCES` columna a columna. **Una columna nueva sin su `grant` rompe la escritura ENTERA de la tabla**, o sea, todas las notificaciones — compila, pasa el typecheck y pasa los unitarios. Es la issue #375, que ya mordió dos veces.
- **`interaction_targets` NO guarda ningún título** (solo `kind`, `source_id`, `owner_id`, `audience_*`, `href`, `commentable`, `reactable`, `comment_notification_type`, `reaction_notification_type`). Por eso reacciones y comentarios **no** nombran la obra.
- **Nadie añade una consulta nueva para rellenar el contexto.** Si un punto de llamada no tiene el dato barato, lo omite y su copia se queda como está.
- **`context` es nullable y no hay backfill.** Todas las filas históricas siguen con la copia genérica: ese es el camino que más se va a ejecutar.
- **El extracto de un comentario spoiler no se guarda.** Se marca `spoiler: true` y el texto no llega a la base de datos.
- **Extracto máximo 140 caracteres**, recortado al escribir, sin partir un emoji ni una palabra.
- **Idioma**: solo existe `messages/es.json`. Todo texto visible sale de ahí.
- **Node 22**: el shell trae Node 20 y rompe Vitest. Usa `fnm use 22`.
- **Migraciones**: dev primero (`mcp__supabase-dev__*`), prod después y solo con autorización humana explícita. La última migración es `20260876_reactions_emoji_libre.sql`, así que esta es `20260877_notifications_context.sql`.
- `notify()` es **best-effort**: no propaga errores. El contexto viaja dentro de esa garantía.

## Mapa de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260877_notifications_context.sql` | Columna `context jsonb` **y sus grants**. |
| `src/lib/social/notification-context.ts` | Lado ESCRITURA: el tipo `NotificationContext` y `buildExcerpt()`. Puro. |
| `src/lib/social/notification-context.test.ts` | Recorte sin partir emoji ni palabra; spoiler sin texto. |
| `src/lib/social/notification-copy.ts` | Lado LECTURA: elige clave i18n y valores según el contexto. Puro, sin `next-intl`. |
| `src/lib/social/notification-copy.test.ts` | Degradados, spoiler, emoji no soportado, agrupación. |

**Se modifican:**

| Fichero | Cambio |
|---|---|
| `src/lib/social/notification-types.ts` | `Notification` gana `context`; se añade `ENRICHED_NOTIFICATION_KEY`. |
| `src/lib/social/notifications.ts` | `notify()`/`notifyMany` aceptan y escriben `context`; `buildPushPayload` construye el cuerpo con `notification-copy`; la lectura devuelve `context`. |
| `src/lib/social/interaction-actions.ts` | `toggleReaction` pasa `emoji`; `addComment` pasa extracto o `spoiler`. |
| `src/lib/social/notify-mentions.ts` | Pasa extracto o `spoiler`. |
| `src/lib/social/post-actions.ts` (`createPost`) | Resuelve el título de la obra y lo pasa. |
| `src/lib/social/notify-followers.ts` | `notifyFollowersOfPost` acepta `subject` y lo reenvía. |
| `src/components/social/notification-bell.tsx` | Usa `notification-copy` en vez de construir la clave a mano. |
| `messages/es.json` | Claves de las variantes enriquecidas. |
| `docs/requirements/data-model.md`, `docs/requirements/decisiones.md` | Doc canónica. |

---

### Task 1: Migración — la columna `context` y sus grants

**Files:**
- Create: `supabase/migrations/20260877_notifications_context.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `public.notifications.context jsonb` (nullable), con grants equivalentes a los de las demás columnas.

- [ ] **Step 1: Comprobar los grants actuales, para copiarlos exactamente**

Con `mcp__supabase-dev__execute_sql`:

```sql
select grantee, privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name='notifications' and column_name='dedupe_key'
order by grantee, privilege_type;
```

Esperado: `anon` con SELECT y UPDATE; `authenticated` con SELECT y UPDATE; `postgres` y `service_role` con INSERT, REFERENCES, SELECT y UPDATE. Esos son los que la columna nueva debe acabar teniendo. Anota el resultado: es tu referencia.

- [ ] **Step 2: Escribir la migración**

Crea `supabase/migrations/20260877_notifications_context.sql`:

```sql
-- Notificaciones con contexto (spec 2026-08-25-notificaciones-con-contexto).
-- La notificación guarda una FOTO de lo ocurrido, para que la copia pueda decir
-- con qué emoji se reaccionó, qué obra se terminó y qué se comentó, en vez de
-- una frase fija por tipo.
--
-- jsonb y no tres columnas sueltas: los campos son opcionales y distintos según
-- el tipo (una notificación de seguidor no trae ninguno; una reacción no trae
-- extracto), y así solo hay UN grant que revisar cuando el contexto crezca.
-- La forma la valida TypeScript en el único sitio que la escribe (notify()).
--
--   { "emoji": "🔥", "subject": "Dune", "excerpt": "Lo terminé…", "spoiler": false }
--
-- Nullable y SIN backfill a propósito: las filas anteriores se quedan a null y
-- caen a la copia genérica de siempre. Inventar el contexto de una notificación
-- de hace tres meses sería fabricar datos.
alter table public.notifications add column if not exists context jsonb;

-- LOS GRANTS NO SON OPCIONALES. Esta tabla tiene permisos POR COLUMNA: una
-- columna nueva sin ellos no rompe solo ese campo, rompe la escritura ENTERA de
-- la tabla — es decir, deja de emitirse CUALQUIER notificación. Compila, pasa
-- el typecheck y pasa los unitarios, y revienta en producción (issue #375, que
-- ya ha ocurrido dos veces).
grant select (context), update (context) on public.notifications to anon;
grant select (context), update (context) on public.notifications to authenticated;
grant insert (context), select (context), update (context), references (context)
  on public.notifications to postgres;
grant insert (context), select (context), update (context), references (context)
  on public.notifications to service_role;

comment on column public.notifications.context is
  'Foto de lo ocurrido al notificar: {emoji, subject, excerpt, spoiler}. Todos opcionales. El extracto NO se guarda si el comentario es spoiler. Ver src/lib/social/notification-context.ts.';
```

- [ ] **Step 3: Aplicar en dev**

Usa `mcp__supabase-dev__apply_migration` con `name: "20260877_notifications_context"` y el contenido del fichero.

Esperado: sin error.

- [ ] **Step 4: Verificar la columna y sus grants contra los objetos reales**

```sql
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='context') as columna,
  (select count(*) from information_schema.column_privileges
    where table_schema='public' and table_name='notifications' and column_name='context'
      and grantee='service_role' and privilege_type='INSERT') as insert_service_role,
  (select count(*) from information_schema.column_privileges
    where table_schema='public' and table_name='notifications' and column_name='context'
      and grantee='authenticated' and privilege_type='SELECT') as select_authenticated;
```

Esperado: `1`, `1`, `1`. Si `insert_service_role` es 0, **para**: la escritura de notificaciones está rota aunque nada lo diga.

- [ ] **Step 5: Probar que la escritura sigue viva, insertando de verdad**

Esta es la prueba que ningún test de TypeScript hace y la que ha fallado dos veces en este repo. Con `mcp__supabase-dev__execute_sql`:

```sql
-- Inserta una notificación real con contexto y la borra. Usa dos usuarios que
-- existan; si solo hay uno, se repite para user_id y actor_id.
--
-- Ojo: NO sirve `min(id)`/`max(id)` sobre auth.users. `id` es uuid y Postgres
-- no tiene agregados min/max para ese tipo — da `ERROR 42883: function
-- min(uuid) does not exist`. Por eso se numeran las filas y se eligen por
-- posición.
with u as (
  select id, row_number() over (order by id) as n from auth.users limit 2
)
insert into public.notifications (user_id, actor_id, type, context)
select
  (select id from u where n = 1),
  coalesce((select id from u where n = 2), (select id from u where n = 1)),
  'new_follower',
  '{"emoji":"🔥","subject":"Dune"}'::jsonb
returning id, context;
```

Esperado: devuelve una fila con el `context` puesto. Luego bórrala:

```sql
delete from public.notifications where context->>'subject' = 'Dune';
```

Esperado: borra exactamente la que insertaste. Confirma con un `select count(*)` que no queda ninguna.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260877_notifications_context.sql
git commit -m "feat(social): notifications guarda el contexto de lo ocurrido"
```

---

### Task 2: El contexto y su recorte (lado escritura)

**Files:**
- Create: `src/lib/social/notification-context.ts`
- Create: `src/lib/social/notification-context.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `type NotificationContext = { emoji?: string; subject?: string; excerpt?: string; spoiler?: boolean }`
  - `EXCERPT_MAX_CHARS: number` (140)
  - `buildExcerpt(body: string): string`
  - `commentContext(body: string, isSpoiler: boolean): NotificationContext`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/social/notification-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildExcerpt,
  commentContext,
  EXCERPT_MAX_CHARS,
} from "./notification-context";

describe("buildExcerpt", () => {
  it("deja intacto lo que ya es corto", () => {
    expect(buildExcerpt("Lo terminé anoche")).toBe("Lo terminé anoche");
  });

  it("recorta por palabras y remata con puntos suspensivos", () => {
    const largo = "palabra ".repeat(40).trim();
    const corto = buildExcerpt(largo);
    expect(corto.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS + 1);
    expect(corto.endsWith("…")).toBe(true);
    // No parte una palabra por la mitad.
    expect(corto.slice(0, -1).trim().endsWith("palabra")).toBe(true);
  });

  // El caso que se rompe con slice() a pelo: un emoji ocupa varias unidades de
  // código, y cortar por el medio deja medio carácter roto en pantalla.
  it("no parte un emoji al recortar", () => {
    const conEmoji = `${"a".repeat(EXCERPT_MAX_CHARS - 1)}👨‍👩‍👧 final`;
    const corto = buildExcerpt(conEmoji);
    expect(corto).not.toContain("\uD83D");
    expect([...corto].every((c) => c.codePointAt(0) !== 0xfffd)).toBe(true);
  });

  it("colapsa saltos de línea y espacios repetidos", () => {
    expect(buildExcerpt("uno\n\n  dos   tres")).toBe("uno dos tres");
  });

  it("de un cuerpo vacío o solo espacios saca cadena vacía", () => {
    expect(buildExcerpt("")).toBe("");
    expect(buildExcerpt("   \n  ")).toBe("");
  });
});

describe("commentContext", () => {
  it("de un comentario normal saca el extracto", () => {
    expect(commentContext("Lo terminé anoche", false)).toEqual({
      excerpt: "Lo terminé anoche",
    });
  });

  // Regla dura del spec: el texto de un spoiler NO se guarda. Si se guardara,
  // se escaparía luego por el push, por una exportación o por un lector nuevo.
  it("de un spoiler NO saca extracto, solo la marca", () => {
    expect(commentContext("Muere el protagonista", true)).toEqual({ spoiler: true });
  });

  it("de un cuerpo vacío saca un contexto vacío, no un extracto vacío", () => {
    expect(commentContext("   ", false)).toEqual({});
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/notification-context.test.ts
```

Esperado: FAIL — `Cannot find module './notification-context'`.

- [ ] **Step 3: Escribir el módulo**

Crea `src/lib/social/notification-context.ts`:

```ts
// Lado ESCRITURA del contexto de una notificación: el tipo que se guarda en
// `notifications.context` y cómo se prepara el extracto. Puro y sin
// dependencias, para que se pueda probar sin DOM ni base de datos.
//
// La lectura (elegir la copia) vive aparte, en notification-copy.ts.

/**
 * Foto de lo ocurrido, guardada al crear la notificación. Todos los campos son
 * opcionales: una notificación de seguidor no trae ninguno, una reacción solo
 * trae `emoji`, un comentario solo `excerpt` o `spoiler`.
 *
 * NO se actualiza si luego editan el comentario o corrigen el título: es un
 * aviso histórico, dice lo que pasó entonces.
 */
export type NotificationContext = {
  /** El emoji literal con el que se reaccionó. */
  emoji?: string;
  /** Título de la obra, cuando quien notifica lo tiene a mano. */
  subject?: string;
  /** Extracto de lo que se dijo. Nunca presente si `spoiler` es true. */
  excerpt?: string;
  /** El comentario estaba marcado como spoiler: se avisa, no se cita. */
  spoiler?: boolean;
};

export const EXCERPT_MAX_CHARS = 140;

/**
 * Recorta el cuerpo de un comentario para la notificación.
 *
 * Recorta por GRAFEMAS y no por unidades de código: un emoji ocupa varias, y
 * un `slice()` a pelo lo parte por la mitad y deja medio carácter en pantalla.
 * Y remata en el último espacio para no cortar una palabra.
 */
export function buildExcerpt(body: string): string {
  const limpio = body.replace(/\s+/gu, " ").trim();
  if (!limpio) return "";

  const grafemas = [...new Intl.Segmenter("es", { granularity: "grapheme" }).segment(limpio)];
  if (grafemas.length <= EXCERPT_MAX_CHARS) return limpio;

  const cortado = grafemas
    .slice(0, EXCERPT_MAX_CHARS)
    .map((g) => g.segment)
    .join("");
  const ultimoEspacio = cortado.lastIndexOf(" ");
  const base = ultimoEspacio > 0 ? cortado.slice(0, ultimoEspacio) : cortado;
  return `${base.trimEnd()}…`;
}

/**
 * Contexto de una notificación de comentario o mención.
 *
 * Si el comentario es spoiler, el texto NO se guarda: se marca y punto. Lo que
 * no se guarda no puede escaparse después por el push ni por un lector nuevo.
 */
export function commentContext(body: string, isSpoiler: boolean): NotificationContext {
  if (isSpoiler) return { spoiler: true };
  const excerpt = buildExcerpt(body);
  return excerpt ? { excerpt } : {};
}
```

- [ ] **Step 4: Ejecutar el test**

```bash
fnm use 22 && npx vitest run src/lib/social/notification-context.test.ts
```

Esperado: PASS, los 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/notification-context.ts src/lib/social/notification-context.test.ts
git commit -m "feat(social): el contexto de notificacion y su extracto"
```

---

### Task 3: La copia (lado lectura)

**Files:**
- Modify: `src/lib/social/notification-types.ts`
- Create: `src/lib/social/notification-copy.ts`
- Create: `src/lib/social/notification-copy.test.ts`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `NotificationContext` (Task 2); `NOTIFICATION_TYPE_KEY`, `NotificationType`.
- Produces:
  - `ENRICHED_NOTIFICATION_KEY: Partial<Record<NotificationType, { emoji?: string; excerpt?: string; spoiler?: string; subject?: string }>>` (en `notification-types.ts`)
  - `notificationCopy(input: { type: NotificationType; context?: NotificationContext | null; name: string; extraActorsCount?: number; canRenderEmoji?: (emoji: string) => boolean }): { key: string; values: Record<string, string | number> }`

- [ ] **Step 1: Añadir las claves de texto**

En `messages/es.json`, dentro de `"notifications"`, añade (no borres ninguna existente):

```json
    "reviewLikedEmoji": "{name} reaccionó {emoji} a tu reseña",
    "clubPostLikedEmoji": "{name} reaccionó {emoji} a tu publicación",
    "commentLikedEmoji": "{name} reaccionó {emoji} a tu comentario",
    "activityLikedEmoji": "{name} reaccionó {emoji} a tu actividad",
    "thoughtLikedEmoji": "{name} reaccionó {emoji} a tu pensamiento",
    "postLikedEmoji": "{name} reaccionó {emoji} a tu publicación",
    "clubRoundLikedEmoji": "{name} reaccionó {emoji} a la ronda de tu club",
    "reviewCommentedExcerpt": "{name} en tu reseña: «{excerpt}»",
    "reviewCommentedSpoiler": "{name} comentó tu reseña · contiene spoiler",
    "clubPostCommentedExcerpt": "{name} en tu publicación: «{excerpt}»",
    "clubPostCommentedSpoiler": "{name} comentó tu publicación · contiene spoiler",
    "activityCommentedExcerpt": "{name} en tu actividad: «{excerpt}»",
    "activityCommentedSpoiler": "{name} comentó tu actividad · contiene spoiler",
    "checkpointCommentedExcerpt": "{name} en tu punto de control: «{excerpt}»",
    "checkpointCommentedSpoiler": "{name} comentó tu punto de control · contiene spoiler",
    "thoughtCommentedExcerpt": "{name} en tu pensamiento: «{excerpt}»",
    "thoughtCommentedSpoiler": "{name} comentó tu pensamiento · contiene spoiler",
    "postCommentedExcerpt": "{name} en tu publicación: «{excerpt}»",
    "postCommentedSpoiler": "{name} comentó tu publicación · contiene spoiler",
    "clubRoundCommentedExcerpt": "{name} en la ronda de tu club: «{excerpt}»",
    "clubRoundCommentedSpoiler": "{name} comentó la ronda de tu club · contiene spoiler",
    "mentionedExcerpt": "{name} te mencionó: «{excerpt}»",
    "mentionedSpoiler": "{name} te mencionó en un spoiler",
    "followedFinishedSubject": "{name} terminó {subject}",
    "followedSessionSubject": "{name} compartió una sesión de {subject}",
    "followedEpisodeSubject": "{name} vio un episodio de {subject}",
    "followedStartedSubject": "{name} empezó {subject}",
    "followedDroppedSubject": "{name} abandonó {subject}",
```

- [ ] **Step 2: Declarar qué variantes existen por tipo**

En `src/lib/social/notification-types.ts`, después de `NOTIFICATION_TYPE_KEY`, añade:

```ts
/**
 * Variantes enriquecidas por tipo. Se declaran EXPLÍCITAMENTE en vez de
 * componer la clave concatenando sufijos: así una clave que no existe en
 * `messages/es.json` es un hueco visible aquí, y no un texto crudo en pantalla
 * que nadie descubre hasta que un usuario lo fotografía.
 *
 * Un tipo ausente de este mapa no tiene variantes y se queda con su copia de
 * siempre — es el caso de invitaciones de club, eventos y rondas propuestas.
 */
export const ENRICHED_NOTIFICATION_KEY: Partial<
  Record<NotificationType, { emoji?: string; excerpt?: string; spoiler?: string; subject?: string }>
> = {
  review_liked: { emoji: "reviewLikedEmoji" },
  club_post_liked: { emoji: "clubPostLikedEmoji" },
  comment_liked: { emoji: "commentLikedEmoji" },
  activity_liked: { emoji: "activityLikedEmoji" },
  thought_liked: { emoji: "thoughtLikedEmoji" },
  post_liked: { emoji: "postLikedEmoji" },
  club_round_liked: { emoji: "clubRoundLikedEmoji" },
  review_commented: { excerpt: "reviewCommentedExcerpt", spoiler: "reviewCommentedSpoiler" },
  club_post_commented: {
    excerpt: "clubPostCommentedExcerpt",
    spoiler: "clubPostCommentedSpoiler",
  },
  activity_commented: {
    excerpt: "activityCommentedExcerpt",
    spoiler: "activityCommentedSpoiler",
  },
  checkpoint_commented: {
    excerpt: "checkpointCommentedExcerpt",
    spoiler: "checkpointCommentedSpoiler",
  },
  thought_commented: { excerpt: "thoughtCommentedExcerpt", spoiler: "thoughtCommentedSpoiler" },
  post_commented: { excerpt: "postCommentedExcerpt", spoiler: "postCommentedSpoiler" },
  club_round_commented: {
    excerpt: "clubRoundCommentedExcerpt",
    spoiler: "clubRoundCommentedSpoiler",
  },
  mentioned: { excerpt: "mentionedExcerpt", spoiler: "mentionedSpoiler" },
  followed_finished: { subject: "followedFinishedSubject" },
  followed_session: { subject: "followedSessionSubject" },
  followed_episode: { subject: "followedEpisodeSubject" },
  followed_started: { subject: "followedStartedSubject" },
  followed_dropped: { subject: "followedDroppedSubject" },
};
```

Y en el tipo `Notification`, añade el campo:

```ts
  /** Foto de lo ocurrido; null en las filas anteriores a la spec 2026-08-25. */
  context?: NotificationContext | null;
```

con su import: `import type { NotificationContext } from "./notification-context";`

- [ ] **Step 3: Escribir el test que falla**

Crea `src/lib/social/notification-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { notificationCopy } from "./notification-copy";

const nombre = "Ana";

describe("notificationCopy sin contexto", () => {
  // El camino más transitado: TODAS las filas anteriores a esta spec.
  it("cae a la copia de siempre cuando no hay contexto", () => {
    expect(notificationCopy({ type: "review_liked", name: nombre })).toEqual({
      key: "reviewLiked",
      values: { name: nombre },
    });
    expect(notificationCopy({ type: "review_liked", context: null, name: nombre })).toEqual({
      key: "reviewLiked",
      values: { name: nombre },
    });
    expect(notificationCopy({ type: "review_liked", context: {}, name: nombre })).toEqual({
      key: "reviewLiked",
      values: { name: nombre },
    });
  });

  it("un tipo sin variantes se queda con su copia aunque traiga contexto", () => {
    expect(
      notificationCopy({ type: "club_invite", context: { emoji: "🔥" }, name: nombre }),
    ).toEqual({ key: "clubInvite", values: { name: nombre } });
  });
});

describe("notificationCopy con emoji", () => {
  it("usa la variante con emoji", () => {
    expect(
      notificationCopy({ type: "review_liked", context: { emoji: "🔥" }, name: nombre }),
    ).toEqual({ key: "reviewLikedEmoji", values: { name: nombre, emoji: "🔥" } });
  });

  // Un emoji que el sistema no sabe pintar saldría como cuadradito: mejor la
  // frase de siempre que un churro. Ver issue #793.
  it("degrada a la copia de siempre si el dispositivo no puede pintarlo", () => {
    expect(
      notificationCopy({
        type: "review_liked",
        context: { emoji: "🫩" },
        name: nombre,
        canRenderEmoji: () => false,
      }),
    ).toEqual({ key: "reviewLiked", values: { name: nombre } });
  });

  it("sin comprobador de emoji, lo pinta (es el caso del servidor y del push)", () => {
    expect(
      notificationCopy({ type: "review_liked", context: { emoji: "🐙" }, name: nombre }),
    ).toEqual({ key: "reviewLikedEmoji", values: { name: nombre, emoji: "🐙" } });
  });
});

describe("notificationCopy con comentario", () => {
  it("cita el extracto", () => {
    expect(
      notificationCopy({
        type: "review_commented",
        context: { excerpt: "Lo terminé anoche" },
        name: nombre,
      }),
    ).toEqual({
      key: "reviewCommentedExcerpt",
      values: { name: nombre, excerpt: "Lo terminé anoche" },
    });
  });

  // Regla dura: un spoiler NUNCA imprime texto, ni aunque alguien haya metido
  // un excerpt a mano en el JSON de la fila.
  it("un spoiler avisa pero no cita, aunque traiga excerpt", () => {
    expect(
      notificationCopy({
        type: "review_commented",
        context: { spoiler: true, excerpt: "Muere el protagonista" },
        name: nombre,
      }),
    ).toEqual({ key: "reviewCommentedSpoiler", values: { name: nombre } });
  });
});

describe("notificationCopy con obra", () => {
  it("nombra la obra", () => {
    expect(
      notificationCopy({ type: "followed_finished", context: { subject: "Dune" }, name: nombre }),
    ).toEqual({ key: "followedFinishedSubject", values: { name: nombre, subject: "Dune" } });
  });
});

describe("notificationCopy agrupada", () => {
  // La agrupación manda sobre el contexto: con varios actores, el emoji de UNO
  // de ellos no representa al grupo.
  it("con varios actores usa la copia agrupada e ignora el contexto", () => {
    expect(
      notificationCopy({
        type: "review_liked",
        context: { emoji: "🔥" },
        name: nombre,
        extraActorsCount: 3,
      }),
    ).toEqual({ key: "reviewLikedGrouped", values: { name: nombre, count: 3 } });
  });

  it("un tipo sin copia agrupada cae a la suya con el contador", () => {
    expect(
      notificationCopy({ type: "thought_liked", name: nombre, extraActorsCount: 2 }),
    ).toEqual({ key: "thoughtLiked", values: { name: nombre, count: 2 } });
  });
});
```

- [ ] **Step 4: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/notification-copy.test.ts
```

Esperado: FAIL — `Cannot find module './notification-copy'`.

- [ ] **Step 5: Escribir el módulo**

Crea `src/lib/social/notification-copy.ts`:

```ts
import type { NotificationContext } from "./notification-context";
import {
  ENRICHED_NOTIFICATION_KEY,
  NOTIFICATION_TYPE_KEY,
  type NotificationType,
} from "./notification-types";

// Lado LECTURA: decide QUÉ clave de traducción usar y con qué valores, a partir
// del contexto guardado. Puro y sin `next-intl` a propósito — devuelve la clave
// y los valores, y quien llama hace el `t()`. Así lo pueden usar igual la
// campana (cliente, `useTranslations`) y el push (servidor, `getTranslations`),
// que hoy coinciden solo por convención y se desincronizarían en cuanto alguien
// tocara una de las dos.

/** Copias agrupadas que ya existían; la agrupación manda sobre el contexto. */
const GROUPED_NOTIFICATION_KEY: Partial<Record<NotificationType, string>> = {
  review_liked: "reviewLikedGrouped",
  club_post_liked: "clubPostLikedGrouped",
  comment_liked: "commentLikedGrouped",
  activity_liked: "activityLikedGrouped",
};

export function notificationCopy(input: {
  type: NotificationType;
  context?: NotificationContext | null;
  name: string;
  extraActorsCount?: number;
  /**
   * Si este dispositivo sabe pintar el emoji. Sin él se asume que sí: es el
   * caso del servidor (el push lo pinta el sistema operativo del móvil, con sus
   * propias fuentes, no nuestro HTML).
   */
  canRenderEmoji?: (emoji: string) => boolean;
}): { key: string; values: Record<string, string | number> } {
  const { type, context, name, extraActorsCount, canRenderEmoji } = input;
  const base = NOTIFICATION_TYPE_KEY[type];

  // Varios actores: el emoji o el extracto de UNO no representa al grupo.
  if (extraActorsCount) {
    return {
      key: GROUPED_NOTIFICATION_KEY[type] ?? base,
      values: { name, count: extraActorsCount },
    };
  }

  const variantes = ENRICHED_NOTIFICATION_KEY[type];
  if (!variantes || !context) return { key: base, values: { name } };

  // El spoiler va PRIMERO: si está marcado, no se cita ni aunque la fila traiga
  // un excerpt (que no debería, pero el JSON no lo impide).
  if (context.spoiler && variantes.spoiler) {
    return { key: variantes.spoiler, values: { name } };
  }
  if (context.excerpt && variantes.excerpt) {
    return { key: variantes.excerpt, values: { name, excerpt: context.excerpt } };
  }
  if (context.emoji && variantes.emoji && (canRenderEmoji?.(context.emoji) ?? true)) {
    return { key: variantes.emoji, values: { name, emoji: context.emoji } };
  }
  if (context.subject && variantes.subject) {
    return { key: variantes.subject, values: { name, subject: context.subject } };
  }

  return { key: base, values: { name } };
}
```

- [ ] **Step 6: Ejecutar el test y el typecheck**

```bash
fnm use 22 && npx vitest run src/lib/social/notification-copy.test.ts && npx tsc --noEmit
```

Esperado: los 11 tests PASAN. `tsc` sin errores en `src/`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/notification-copy.ts src/lib/social/notification-copy.test.ts src/lib/social/notification-types.ts messages/es.json
git commit -m "feat(social): la copia de notificacion se elige por contexto"
```

---

### Task 4: `notify()` escribe el contexto y el push lo usa

**Files:**
- Modify: `src/lib/social/notifications.ts`
- Modify: `src/lib/social/notifications.test.ts`

**Interfaces:**
- Consumes: `NotificationContext` (Task 2), `notificationCopy` (Task 3).
- Produces: `notify()` y `notifyMany()` aceptan `context?: NotificationContext`; la lectura devuelve `context` en cada `Notification`.

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/social/notifications.test.ts`, añade:

```ts
it("guarda el contexto en la fila de la notificación", async () => {
  const fake = makeNotifyClient();
  mocks.createServiceRoleClient.mockReturnValue(fake.writer);

  await notify(fake.client, {
    userId: "dueño",
    actorId: "actor",
    type: "review_liked",
    context: { emoji: "🔥" },
  });

  expect(fake.insertedNotifications[0]).toMatchObject({
    type: "review_liked",
    context: { emoji: "🔥" },
  });
});

it("sin contexto escribe null, no un objeto vacío", async () => {
  const fake = makeNotifyClient();
  mocks.createServiceRoleClient.mockReturnValue(fake.writer);

  await notify(fake.client, { userId: "dueño", actorId: "actor", type: "new_follower" });

  expect(fake.insertedNotifications[0].context).toBeNull();
});
```

Reutiliza los ayudantes que ya existan en el fichero para simular el cliente; si el que hay no expone las filas insertadas, extiéndelo siguiendo su propio patrón en vez de crear otro.

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/notifications.test.ts
```

Esperado: FAIL — la fila insertada no tiene `context`.

- [ ] **Step 3: Aceptar y escribir el contexto**

En `src/lib/social/notifications.ts`, añade el import:

```ts
import type { NotificationContext } from "./notification-context";
import { notificationCopy } from "./notification-copy";
```

En los params de `notify()`, añade:

```ts
    /**
     * Foto de lo ocurrido (emoji, obra, extracto). Opcional: quien no lo tenga
     * barato lo omite y su copia se queda como está — nadie añade una consulta
     * para rellenarlo.
     */
    context?: NotificationContext;
```

Y en `row`:

```ts
    context: params.context ?? null,
```

Haz lo mismo en `notifyMany()`: el mismo campo opcional en sus params y en las filas que construye.

- [ ] **Step 4: Que el push use la copia compartida**

En `buildPushPayload`, añade `context` a sus params y sustituye la línea del cuerpo:

```ts
  // La MISMA función que la campana. Sin comprobador de emoji: en el servidor no
  // hay canvas con el que medir, y el push lo pinta el sistema del dispositivo
  // con sus propias fuentes, así que el emoji siempre viaja.
  const copy = notificationCopy({
    type: params.type,
    context: params.context,
    name,
  });

  return {
    category: NOTIFICATION_CATEGORY[params.type],
    type: params.type,
    title: tCommon("appName"),
    body: t(copy.key, copy.values),
    path: href,
    actorUserId: params.actorId ?? undefined,
  };
```

Pasa `context` desde `notify()` a `deliverPush()` y de ahí a `buildPushPayload()`.

- [ ] **Step 5: Devolver el contexto al leer**

En la consulta que lista notificaciones, añade `context` a las columnas seleccionadas y al objeto `Notification` que se construye:

```ts
    context: (row.context ?? null) as NotificationContext | null,
```

**No uses `select("*")`**: con grants por columna, `*` es exactamente lo que se rompe cuando falta un permiso. Enumera, como ya hace el fichero.

- [ ] **Step 6: Ejecutar los tests**

```bash
fnm use 22 && npx vitest run src/lib/social && npx tsc --noEmit
```

Esperado: PASS, incluidos los dos nuevos. `tsc` limpio en `src/`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/notifications.ts src/lib/social/notifications.test.ts
git commit -m "feat(social): notify guarda el contexto y el push comparte la copia"
```

---

### Task 5: Los llamantes rellenan lo que ya tienen

**Files:**
- Modify: `src/lib/social/interaction-actions.ts`
- Modify: `src/lib/social/notify-mentions.ts`
- Modify: `src/lib/sessions/actions.ts`
- Modify: `src/lib/social/interaction-actions.test.ts`

**Interfaces:**
- Consumes: `commentContext` (Task 2), `notify()` con `context` (Task 4).
- Produces: nada nuevo; solo rellena.

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/social/interaction-actions.test.ts`, dentro de `describe("toggleReaction")`:

```ts
  it("la notificación de reacción lleva el emoji que se puso", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await toggleReaction("target-pass", "🔥");

    expect(mocks.notify).toHaveBeenCalledWith(
      fake.client,
      expect.objectContaining({ context: { emoji: "🔥" } }),
    );
  });
```

Y en el `describe` de `addComment`:

```ts
  it("la notificación de comentario lleva un extracto", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await addComment("target-pass", "Lo terminé anoche y me dejó tocado");

    expect(mocks.notify).toHaveBeenCalledWith(
      fake.client,
      expect.objectContaining({
        context: { excerpt: "Lo terminé anoche y me dejó tocado" },
      }),
    );
  });

  it("la de un comentario spoiler avisa sin citar", async () => {
    const fake = makeActionClient({ target: passTarget });
    mocks.createClient.mockResolvedValue(fake.client);

    await addComment("target-pass", "Muere el protagonista", { isSpoiler: true });

    expect(mocks.notify).toHaveBeenCalledWith(
      fake.client,
      expect.objectContaining({ context: { spoiler: true } }),
    );
  });
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
fnm use 22 && npx vitest run src/lib/social/interaction-actions.test.ts
```

Esperado: FAIL — las llamadas a `notify` no llevan `context`.

- [ ] **Step 3: Rellenar en las reacciones**

En `toggleReaction`, en la llamada a `notify`, añade:

```ts
          // El emoji es justo lo que la copia genérica se comía: "le gustó"
          // aunque hubieras reaccionado con 😱.
          context: { emoji },
```

- [ ] **Step 4: Rellenar en comentarios y menciones**

En `addComment`, importa `commentContext` de `./notification-context` y pásalo:

```ts
          context: commentContext(body, isSpoiler),
```

usando las variables que la función ya tiene para el cuerpo y la marca de spoiler (no inventes nombres: mira los suyos).

En `src/lib/social/notify-mentions.ts` hay un matiz: `notifyMentions` recibe
`{ authorId, text, interactionTargetId, usernames? }` — tiene el **texto**, pero **no** la marca de
spoiler. Añádele `isSpoiler?: boolean` a esos params y pásalo desde sus llamantes (los mismos que
ya saben si el comentario es spoiler). Dentro, el contexto sale igual: `commentContext(params.text, params.isSpoiler ?? false)`.

Ojo con el llamante de `createPost` (`src/lib/social/post-actions.ts:114-119`): un *pensamiento*
no tiene marca de spoiler propia, así que ahí se pasa `false` — y no pasa nada, porque
`commentContext` ya devuelve solo el extracto.

- [ ] **Step 5: Rellenar la obra en los avisos de seguimiento**

Quien emite los `followed_*` es `notifyFollowersOfPost` en `src/lib/social/notify-followers.ts`
(**no** `sessions/actions.ts`), y su firma actual es:

```ts
export async function notifyFollowersOfPost(
  supabase: SupabaseServerClient,
  authorId: string,
  post: { postId: string; kind: PostKind; interactionTargetId: string },
): Promise<void>
```

No recibe ningún título, y su llamante —`createPost`, en `src/lib/social/post-actions.ts:135`—
tampoco lo tiene: consulta el ancla pidiendo solo `id` (`post-actions.ts:60-64`).

Por eso el spec autoriza aquí **una** consulta, y solo aquí: `createPost` es una acción de
publicación que ya hace del orden de cinco consultas y corre una vez, no por destinatario.

1. En `createPost`, después de resolver el ancla, resuelve el título de la obra a la que apunta
   el post. **Mira cómo lo hace el feed** (`src/lib/social/feed.ts` ya resuelve títulos para
   pintar las tarjetas) y reutiliza el mismo camino en vez de inventar una consulta nueva.
2. Pasa el título a `notifyFollowersOfPost` como un cuarto campo opcional de `post`:
   `subject?: string`.
3. Dentro de `notifyFollowersOfPost`, pásalo al `notifyMany` como `context: post.subject ? { subject: post.subject } : undefined`.

**Si al mirar el feed resulta que resolver el título cuesta más de una consulta**, para e infórmalo
antes de escribirlo: la excepción del spec cubre una, no una cascada.

- [ ] **Step 6: Ejecutar los tests**

```bash
fnm use 22 && npx vitest run && npx tsc --noEmit
```

Esperado: la suite entera PASA. `tsc` limpio en `src/`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/interaction-actions.ts src/lib/social/interaction-actions.test.ts src/lib/social/notify-mentions.ts src/lib/sessions/actions.ts
git commit -m "feat(social): cada aviso lleva el contexto que ya tenia a mano"
```

---

### Task 6: La campana usa la copia compartida

**Files:**
- Modify: `src/components/social/notification-bell.tsx`

**Interfaces:**
- Consumes: `notificationCopy` (Task 3), `isEmojiRenderable` de `src/lib/social/emoji-support.ts`.

- [ ] **Step 1: Sustituir la construcción de la clave**

En `src/components/social/notification-bell.tsx`, borra el `GROUPED_NOTIFICATION_TYPE_KEY` local (ahora vive dentro de `notification-copy.ts`) y sustituye el bloque que elige el texto por:

```tsx
                      <span className="text-sm text-foreground">
                        {(() => {
                          // La MISMA función que usa el push. Con el comprobador
                          // de emoji: aquí sí hay canvas, y un emoji que este
                          // sistema no sabe pintar saldría como cuadradito
                          // (issue #793), así que se cae a la copia sin emoji.
                          const copy = notificationCopy({
                            type: n.type,
                            context: n.context,
                            name: n.actorDisplayName || n.actorUsername || tCommon("appName"),
                            extraActorsCount: n.extraActorsCount,
                            canRenderEmoji: isEmojiSupported,
                          });
                          return t(copy.key, copy.values);
                        })()}
                      </span>
```

con los imports:

```tsx
import { notificationCopy } from "@/lib/social/notification-copy";
import { isEmojiSupported } from "@/lib/social/emoji-support";
```

`isEmojiSupported(emoji)` ya existe en `main` (llegó con la PR #792) y tiene exactamente la firma
que hace falta: `(emoji: string, measure?, measureWidth?) => boolean`, con medidores inyectables y
degradado a `true` cuando no se puede decidir. Pasarla directamente como `canRenderEmoji` es
correcto: los dos parámetros opcionales no estorban.

- [ ] **Step 2: Typecheck, lint y suite**

```bash
fnm use 22 && npx tsc --noEmit && npx eslint src/components/social src/lib/social && npx vitest run
```

Esperado: cero errores en `src/`, lint limpio, suite entera en verde.

- [ ] **Step 3: Commit**

```bash
git add src/components/social/notification-bell.tsx
git commit -m "feat(social): la campana pinta la copia con contexto"
```

---

### Task 7: Verificación en navegador, doc y cierre

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md`

- [ ] **Step 1: Verificar en un navegador de verdad**

Esto es copy que la gente lee: hay que verlo. Levanta un único `next dev` en el 3000 (mata el que hubiera antes: `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`, luego `Stop-Process -Id <pid>`), reacciona con un emoji desde otra cuenta y comprueba en la campana del dueño que dice «reaccionó 🔥 a tu reseña» y no «le gustó».

Comprueba **los cuatro caminos**, porque cada uno tiene su forma de fallar:
1. Reacción con emoji → variante con emoji.
2. Comentario normal → extracto entre comillas, recortado si es largo.
3. Comentario marcado spoiler → avisa **sin** citar.
4. Notificación antigua (cualquiera de las que ya había) → copia de siempre, sin romperse.

Anota lo que ves. Si algo no coincide, es un hallazgo: párate y dilo.

- [ ] **Step 2: Correr la superficie 6 de DRIFT-CHECK**

`docs/DRIFT-CHECK.md`, superficie 6 (grants por columna). No es opcional: esta tarea añadió una columna a una tabla con permisos por columna, que es exactamente el caso que la regla cubre. Pega el resultado.

- [ ] **Step 3: Actualizar `data-model.md`**

En la sección de `notifications`, añade:

```markdown
- `context` (`jsonb`, nullable) — **foto de lo ocurrido** al notificar, para que la copia diga
  qué pasó y no solo de qué tipo es: `{ emoji, subject, excerpt, spoiler }`, todos opcionales.
  Lo escribe `notify()` desde lo que cada punto de llamada ya tiene a mano; nadie añade una
  consulta para rellenarlo (`src/lib/social/notification-context.ts`).
  - **El extracto de un comentario spoiler NO se guarda**: se marca `spoiler: true` y el texto
    no llega a la base de datos, así que no puede escaparse luego por el push.
  - **Sin backfill**: las filas anteriores a 2026-08-25 lo tienen a `null` y caen a la copia
    genérica.
  - **No se actualiza** si editan el comentario o corrigen el título: es un aviso histórico.
  - ⚠️ Esta tabla tiene **grants por columna**. Al añadir cualquier columna hay que conceder
    `select`/`update` a `anon` y `authenticated`, e `insert`/`select`/`update`/`references` a
    `postgres` y `service_role`. Sin eso se rompe la escritura ENTERA de la tabla — ninguna
    notificación se emite (issue #375).
```

Actualiza la fecha de verificación de la cabecera.

- [ ] **Step 4: Añadir la entrada de decisiones**

Al **final** de `docs/requirements/decisiones.md` (append-only), siguiendo el patrón fecha-título de las últimas entradas:

```markdown
## 2026-08-25 — Notificaciones con contexto

- **La notificación guarda una foto de lo ocurrido, en vez de resolverlo al leer.** Resolver al
  leer daría siempre el dato fresco, pero los objetos son polimórficos (reseña, post, comentario,
  actividad, ronda…) y la campana se pinta en cada carga: serían varias consultas por tanda. Se
  guarda al escribir, como ya se hacía con el `href`. El precio, aceptado: si luego editan el
  comentario, la notificación conserva lo de entonces — que para un aviso histórico es lo
  correcto.
- **Una columna `jsonb` y no tres columnas sueltas.** Los campos son opcionales y distintos según
  el tipo, y así solo hay **un `grant` que revisar** en una tabla con permisos por columna. La
  forma la valida TypeScript en el único sitio que la escribe.
- **El extracto de un spoiler no se guarda siquiera.** Taparlo en la interfaz habría dejado el
  texto en la base de datos, y de ahí al push —donde no hay «pulsa para revelar»— y a cualquier
  lector futuro. Lo que no se guarda no se filtra.
- **Reacciones y comentarios no nombran la obra.** `interaction_targets` no guarda ningún título,
  así que hacerlo exigiría una consulta polimórfica por notificación. Se prefiere la copia algo
  menos rica a pagar eso en cada aviso. Queda como issue.
```

- [ ] **Step 5: Abrir la issue de lo que queda fuera**

```bash
gh issue create --label "area:social,tipo:feature,P3" --title "Nombrar la obra en las notificaciones de reaccion y comentario" --body "Las notificaciones de reaccion y comentario dicen 'tu resena' pero no CUAL: 'reacciono 🔥 a tu resena' en vez de 'a tu resena de Dune'.

No es un olvido: al implementar la spec 2026-08-25-notificaciones-con-contexto se verifico que interaction_targets NO guarda ningun titulo (solo kind, source_id, owner_id, audience_*, href y los flags). Rellenar el subject exigiria una consulta polimorfica por notificacion, contra la tabla que corresponda al kind, y el plan prohibia expresamente anadir consultas en el camino de notificar.

Los avisos de seguimiento (followed_*) SI nombran la obra, porque createPost la tiene en la mano.

Dos caminos si algun dia compensa:
- desnormalizar un titulo en interaction_targets, que ya es la tabla que unifica los objetos interactuables;
- o resolverlo al leer solo para las notificaciones sin leer, que son pocas.

Medir antes: la latencia contra Supabase esta en ~240 ms por consulta con picos de 1,3 s (ver playwright.config.ts)."
```

- [ ] **Step 6: Commit y PR**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md
git commit -m "docs(social): data-model y decisiones de las notificaciones con contexto"
git push -u origin spec/notificaciones-con-contexto
```

Abre la PR con `gh pr create`, y en el cuerpo responde por escrito la pregunta de la regla #437: **esta rama no añade ningún `use cache`**; las notificaciones dependen de `auth.uid()` (cada persona ve las suyas) y siguen leyéndose con el cliente de la petición.

**No apliques la migración en producción sin autorización humana explícita.**

---

## Autorrevisión del plan

**Cobertura del spec:**

| Sección del spec | Tarea |
|---|---|
| §3 Modelo de datos (columna, jsonb, nullable, sin backfill) | Task 1 |
| §3 Grants por columna | Task 1 (steps 2, 4, 5) y Task 7 (DRIFT-CHECK) |
| §3 Spoiler sin extracto, recorte al escribir | Task 2 |
| §4 Quién rellena el contexto, sin consultas nuevas | Task 5 |
| §5 Variantes de copia, emoji tal cual, degradado | Task 3 |
| §5 Función pura compartida por campana y push | Tasks 3, 4 y 6 |
| §6 Pruebas | Tasks 2, 3, 4, 5 y 7 (navegador) |
| §7 Alcance: lo que queda fuera | Task 7 (issue) |
| §8 Definición de hecho | Task 7 |

**Coherencia de nombres** (verificada entre tareas): `NotificationContext`, `buildExcerpt`, `commentContext` y `EXCERPT_MAX_CHARS` (Task 2) se usan con esos nombres en 3, 4 y 5. `notificationCopy` y `ENRICHED_NOTIFICATION_KEY` (Task 3) se usan igual en 4 y 6. El campo de la fila se llama `context` en SQL y en TypeScript, sin traducción por medio.

**Tres supuestos del borrador que resultaron falsos, comprobados contra el código y ya corregidos
arriba** — se dejan escritos porque son la clase de detalle que se vuelve a suponer mal:

1. **El export de `emoji-support.ts` se llama `isEmojiSupported`, no `isEmojiRenderable`.** El
   módulo sí existe en `main` (llegó con la PR #792) y su firma
   `(emoji, measure?, measureWidth?) => boolean` encaja tal cual como `canRenderEmoji`.
2. **Los `followed_*` los emite `notify-followers.ts`, no `sessions/actions.ts`.** Y su llamante
   real es `createPost` en `src/lib/social/post-actions.ts:135`.
3. **Ningún llamante tiene el título de la obra a mano**, así que la regla original de «cero
   consultas nuevas» habría dejado `subject` sin rellenar en todas partes, cargándose una de las
   tres cosas pedidas. El spec se enmendó con una excepción acotada a `createPost` (§4), con su
   razón: es una acción de publicación que ya hace ~5 consultas y corre una vez, no un camino de
   lectura ni algo que se repita por destinatario.

**Riesgo que queda vivo:** el Step 5 de la Task 5 manda mirar cómo resuelve el título
`src/lib/social/feed.ts` y reutilizar ese camino. Si allí el título cuesta más de una consulta, la
excepción del spec no lo cubre y hay que parar y decidirlo, no ampliarla por inercia.
