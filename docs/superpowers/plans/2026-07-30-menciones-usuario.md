# Menciones @usuario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir mencionar a otra persona con `@username` en reseñas, comentarios y posts de club, con autocompletar al teclear, notificación al mencionado y enlace a su perfil al renderizar.

**Architecture:** El texto crudo `@username` es la fuente de verdad (sin tabla nueva, SD-3). Un parser puro extrae menciones; al escribir se resuelven y notifican (con filtro de entregabilidad en capa de app); al renderizar se linkifican solo los usernames que existen. Autocompletar vía un hook reutilizable sobre `<input>`/`<textarea>`. Único cambio de esquema: un valor de enum `notification_type`.

**Tech Stack:** Next.js (App Router, RSC + server actions), Supabase (Postgres + RLS), next-intl, Vitest, Playwright.

## Global Constraints

- **Esquema manda `docs/requirements/data-model.md`**; estado vivo del usuario en `passes` (no `library_entries`/`diary_entries`).
- **Migraciones: dev primero (`supabase-dev`), luego prod.** Verificar contra objetos reales (`pg_enum`), no el ledger.
- **i18n desde el primer componente** (next-intl, `messages/*.json`).
- **Username**: `USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/` (`src/lib/profile/username.ts`).
- **Notificaciones best-effort**: un fallo al notificar nunca deshace la escritura real.
- **Límite de texto**: comentarios ≤2000 (`comments_body_len`); posts `MAX_BODY_LENGTH` (`src/lib/clubs/posts.ts`).
- **Verificación**: automática por defecto (`docs/TESTING.md`) — Vitest + Playwright / qa-verifier.
- **Cap menciones**: `MAX_MENTIONS = 10` por texto.

---

### Task 1: Parser de menciones (módulo puro)

**Files:**
- Create: `src/lib/social/mentions.ts`
- Test: `src/lib/social/mentions.test.ts`

**Interfaces:**
- Produces:
  - `export const MENTION_RE: RegExp` — global, `/(^|[^a-z0-9_@/])@([a-z0-9_]{3,30})/gi` (grupo 1 = prefijo, grupo 2 = username).
  - `export const MAX_MENTIONS = 10`
  - `export function extractMentions(text: string): string[]` — usernames únicos, minúsculas, máx 10, en orden de aparición.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/social/mentions.test.ts
import { describe, it, expect } from "vitest";
import { extractMentions } from "./mentions";

describe("extractMentions", () => {
  it("extracts a simple mention", () => {
    expect(extractMentions("hola @borjar20 qué tal")).toEqual(["borjar20"]);
  });
  it("lowercases and dedupes", () => {
    expect(extractMentions("@Borja y @borja")).toEqual(["borja"]);
  });
  it("ignores @ inside emails", () => {
    expect(extractMentions("escribe a foo@borjar20.com")).toEqual([]);
  });
  it("ignores @ inside paths", () => {
    expect(extractMentions("ver /u/@borja")).toEqual([]);
  });
  it("matches at start of string", () => {
    expect(extractMentions("@borja hola")).toEqual(["borja"]);
  });
  it("matches after punctuation", () => {
    expect(extractMentions("gracias,@borja!")).toEqual(["borja"]);
  });
  it("rejects too-short usernames (<3)", () => {
    expect(extractMentions("@ab @abc")).toEqual(["abc"]);
  });
  it("caps at 3-30 chars", () => {
    const long = "a".repeat(31);
    expect(extractMentions(`@${long}`)).toEqual([long.slice(0, 30)]);
  });
  it("caps total mentions at 10", () => {
    const text = Array.from({ length: 15 }, (_, i) => `@user_${i}`).join(" ");
    expect(extractMentions(text)).toHaveLength(10);
  });
  it("returns empty for no mentions", () => {
    expect(extractMentions("sin menciones aquí")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/social/mentions.test.ts`
Expected: FAIL — `extractMentions` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/social/mentions.ts
// Parser puro de menciones @usuario. Sin imports server-only: lo comparten
// la escritura (resolver+notificar) y el render (linkificar). El prefijo
// capturado (grupo 1) evita @ dentro de emails (a@b) y rutas (/@b).
export const MENTION_RE = /(^|[^a-z0-9_@/])@([a-z0-9_]{3,30})/gi;

export const MAX_MENTIONS = 10;

export function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const username = match[2].toLowerCase();
    if (!seen.has(username)) {
      seen.add(username);
      result.push(username);
      if (result.length >= MAX_MENTIONS) break;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/social/mentions.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/mentions.ts src/lib/social/mentions.test.ts
git commit -m "feat(social): parser puro de menciones @usuario"
```

---

### Task 2: Migración del enum + tipo TS + i18n

**Files:**
- Create (migración): aplicar vía `mcp__supabase-dev__apply_migration` luego `mcp__supabase-prod__apply_migration`, nombre `20260730_notification_mentioned`
- Modify: `src/lib/social/notification-types.ts:6-25` (unión) y `:57-75` (`NOTIFICATION_TYPE_KEY`)
- Modify: `messages/es.json` (y cualquier otro locale en `messages/`)

**Interfaces:**
- Produces: valor `'mentioned'` en enum `notification_type`; `NotificationType` incluye `"mentioned"`; clave i18n `notifications.mentioned`.

- [ ] **Step 1: Aplicar la migración en dev**

Usar `mcp__supabase-dev__apply_migration` con name `20260730_notification_mentioned` y query:

```sql
alter type notification_type add value if not exists 'mentioned';
```

> Nota: `add value` no puede correr dentro de un bloque transaccional junto a otros usos del mismo enum; esta migración contiene **solo** esa sentencia.

- [ ] **Step 2: Verificar el valor contra pg_enum (no el ledger)**

Usar `mcp__supabase-dev__execute_sql`:

```sql
select enumlabel from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'notification_type' and enumlabel = 'mentioned';
```

Expected: una fila `mentioned`.

- [ ] **Step 3: Aplicar la misma migración en prod**

Repetir Step 1 con `mcp__supabase-prod__apply_migration` (mismo name y query) y Step 2 con `mcp__supabase-prod__execute_sql`.

- [ ] **Step 4: Añadir el valor a la unión TS y al mapa de claves**

En `src/lib/social/notification-types.ts`, añadir `| "mentioned"` a `NotificationType` (tras `club_event_created`):

```ts
  | "club_event_created"
  | "mentioned";
```

Y en `NOTIFICATION_TYPE_KEY` (antes del cierre `}`):

```ts
  club_event_created: "clubEventCreated",
  mentioned: "mentioned",
};
```

- [ ] **Step 5: Añadir la traducción**

En `messages/es.json`, dentro del objeto `notifications`, añadir:

```json
"mentioned": "{name} te mencionó"
```

(Replicar la clave `mentioned` en cualquier otro fichero de `messages/`.)

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/notification-types.ts messages/
git commit -m "feat(social): tipo de notificacion 'mentioned' + i18n"
```

---

### Task 3: `notifyMentions` (resolución + filtro de entregabilidad)

**Files:**
- Create: `src/lib/social/notify-mentions.ts`
- Test: `src/lib/social/notify-mentions.test.ts`

**Interfaces:**
- Consumes: `extractMentions` (Task 1); `notifyMany` de `src/lib/social/notifications.ts`.
- Produces:
  ```ts
  export type MentionGate =
    | { kind: "profile"; ownerId: string }
    | { kind: "club"; clubId: string };
  export type MentionNotifyTarget = {
    type: "diary_entry" | "comment" | "club_post";
    id: string;
  };
  export async function resolveDeliverableMentions(
    supabase, // SupabaseServerClient
    params: { authorId: string; text: string; gate: MentionGate },
  ): Promise<string[]>; // user_ids entregables (sin autor, sin duplicados)
  export async function notifyMentions(
    supabase,
    params: { authorId: string; text: string; target: MentionNotifyTarget; gate: MentionGate },
  ): Promise<string[]>; // user_ids notificados
  ```
- `resolveDeliverableMentions` se exporta aparte porque los call sites necesitan el conjunto para el **supersede** antes de decidir a quién notificar por la vía genérica.

- [ ] **Step 1: Write the failing test**

Los tests aíslan `resolveDeliverableMentions` con un mock mínimo de Supabase (se testea la lógica de filtrado, no la red).

```ts
// src/lib/social/notify-mentions.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveDeliverableMentions } from "./notify-mentions";

// Mock encadenable de PostgREST: cada método devuelve `this` salvo el final.
function makeSupabase(handlers: Record<string, unknown>) {
  return {
    from(table: string) {
      const h = handlers[table] as { rows: unknown[] };
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "not"]) builder[m] = () => builder;
      // resuelve la promesa con { data }
      builder.then = (res: (v: { data: unknown[] }) => void) => res({ data: h.rows });
      return builder;
    },
  } as never;
}

describe("resolveDeliverableMentions — perfil público", () => {
  it("entrega a todos los mencionados existentes menos el autor", async () => {
    const supabase = makeSupabase({
      profile_identities: { rows: [
        { user_id: "u-borja", username: "borja" },
        { user_id: "u-ana", username: "ana" },
        { user_id: "author", username: "yo" },
      ] },
      profiles: { rows: [{ is_public: true }] },
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@borja @ana @yo",
      gate: { kind: "profile", ownerId: "author" },
    });
    expect(out.sort()).toEqual(["u-ana", "u-borja"]);
  });
});

describe("resolveDeliverableMentions — perfil privado", () => {
  it("solo entrega a seguidores aceptados del dueño", async () => {
    const supabase = makeSupabase({
      profile_identities: { rows: [
        { user_id: "u-borja", username: "borja" },
        { user_id: "u-ana", username: "ana" },
      ] },
      profiles: { rows: [{ is_public: false }] },
      follows: { rows: [{ follower_id: "u-borja" }] }, // solo borja sigue
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "owner",
      text: "@borja @ana",
      gate: { kind: "profile", ownerId: "owner" },
    });
    expect(out).toEqual(["u-borja"]);
  });
});

describe("resolveDeliverableMentions — club", () => {
  it("solo entrega a miembros activos del club", async () => {
    const supabase = makeSupabase({
      profile_identities: { rows: [
        { user_id: "u-borja", username: "borja" },
        { user_id: "u-ana", username: "ana" },
      ] },
      club_members: { rows: [{ user_id: "u-ana" }] }, // solo ana es miembro
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@borja @ana",
      gate: { kind: "club", clubId: "c1" },
    });
    expect(out).toEqual(["u-ana"]);
  });
});

describe("resolveDeliverableMentions — sin menciones", () => {
  it("devuelve vacío sin tocar la BD", async () => {
    const supabase = makeSupabase({});
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "a", text: "texto sin menciones",
      gate: { kind: "profile", ownerId: "a" },
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/social/notify-mentions.test.ts`
Expected: FAIL — `resolveDeliverableMentions` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/social/notify-mentions.ts
import type { createClient } from "@/lib/supabase/server";
import { extractMentions } from "./mentions";
import { notifyMany } from "./notifications";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type MentionGate =
  | { kind: "profile"; ownerId: string }
  | { kind: "club"; clubId: string };

export type MentionNotifyTarget = {
  type: "diary_entry" | "comment" | "club_post";
  id: string;
};

// Resuelve qué user_id de los mencionados en `text` deben recibir la
// notificación, aplicando el gate de visibilidad en capa de app (sin función
// SQL nueva). Se exporta aparte de notifyMentions porque los call sites
// necesitan el conjunto para el supersede del ruido (ver interaction-actions).
// TODO(E5.J1): cuando exista user_blocks, restar los bloqueos bidireccionales.
export async function resolveDeliverableMentions(
  supabase: SupabaseServerClient,
  params: { authorId: string; text: string; gate: MentionGate },
): Promise<string[]> {
  const usernames = extractMentions(params.text);
  if (usernames.length === 0) return [];

  const { data: identities } = await supabase
    .from("profile_identities")
    .select("user_id, username")
    .in("username", usernames);

  const mentionedIds = (identities ?? [])
    .map((r) => r.user_id as string)
    .filter((id): id is string => !!id && id !== params.authorId);
  if (mentionedIds.length === 0) return [];

  if (params.gate.kind === "club") {
    const { data: members } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", params.gate.clubId)
      .eq("status", "active")
      .in("user_id", mentionedIds);
    return (members ?? []).map((m) => m.user_id as string);
  }

  // gate.kind === "profile"
  const { data: owner } = await supabase
    .from("profiles")
    .select("is_public")
    .eq("id", params.gate.ownerId)
    .maybeSingle();

  if (owner?.is_public) return mentionedIds;

  // Perfil privado: solo seguidores aceptados del dueño.
  const { data: followers } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", params.gate.ownerId)
    .eq("status", "accepted")
    .in("follower_id", mentionedIds);
  return (followers ?? []).map((f) => f.follower_id as string);
}

// Notifica a los mencionados entregables. Best-effort: nunca lanza (igual que
// notify()/notifyMany). Devuelve los user_id notificados para el supersede.
export async function notifyMentions(
  supabase: SupabaseServerClient,
  params: { authorId: string; text: string; target: MentionNotifyTarget; gate: MentionGate },
): Promise<string[]> {
  try {
    const deliverables = await resolveDeliverableMentions(supabase, {
      authorId: params.authorId,
      text: params.text,
      gate: params.gate,
    });
    if (deliverables.length === 0) return [];
    await notifyMany(supabase, {
      userIds: deliverables,
      actorId: params.authorId,
      type: "mentioned",
      targetType: params.target.type,
      targetId: params.target.id,
    });
    return deliverables;
  } catch (error) {
    console.error("notifyMentions failed", error);
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/social/notify-mentions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/notify-mentions.ts src/lib/social/notify-mentions.test.ts
git commit -m "feat(social): notifyMentions con filtro de entregabilidad"
```

---

### Task 4: Enganchar notifyMentions en comentarios, posts de club y reseñas

**Files:**
- Modify: `src/lib/social/interaction-actions.ts` (`addComment`, líneas ~146-195)
- Modify: `src/lib/clubs/posts.ts` (`notifyNewPost` ~75-97, `createTextPost` ~99-112, `createShareActivityPost` ~114-139)
- Modify: `src/lib/passes/actions.ts` (`closePass` ~86-104)

**Interfaces:**
- Consumes: `notifyMentions`, `resolveDeliverableMentions`, `MentionGate` (Task 3).

- [ ] **Step 1: addComment — notificar menciones + supersede + href al comentario**

En `src/lib/social/interaction-actions.ts`, importar arriba:

```ts
import { notifyMentions } from "./notify-mentions";
```

Reemplazar el bloque de inserción + notificación de `addComment` (desde el `insert` hasta el `revalidateInteraction()`) por:

```ts
  // Insert devolviendo el id: lo necesita el target de la notificación de
  // mención (target_type='comment' → resolveTargetHrefs lo lleva al padre).
  const { data: inserted, error } = await supabase
    .from("comments")
    .insert({
      target_type: targetType,
      target_id: targetId,
      author_id: user.id,
      body: trimmed,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Gate de visibilidad del comentario = el del PADRE (lo que se comenta).
  let mentioned: string[] = [];
  if (targetType === "club_post") {
    const { data: post } = await supabase
      .from("club_posts")
      .select("club_id")
      .eq("id", targetId)
      .maybeSingle();
    if (post?.club_id) {
      mentioned = await notifyMentions(supabase, {
        authorId: user.id,
        text: trimmed,
        target: { type: "comment", id: inserted.id },
        gate: { kind: "club", clubId: post.club_id },
      });
    }
  } else if (targetType === "diary_entry" || targetType === "episode_watch") {
    const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
    if (ownerId) {
      mentioned = await notifyMentions(supabase, {
        authorId: user.id,
        text: trimmed,
        target: { type: "comment", id: inserted.id },
        gate: { kind: "profile", ownerId },
      });
    }
  }

  // Notificación genérica al dueño, con supersede: si el dueño fue mencionado,
  // ya recibió 'mentioned' — no se le duplica con review_commented/etc.
  const notificationType = COMMENT_NOTIFICATION_TYPE[targetType];
  if (
    notificationType &&
    targetType !== "activity_checkpoint" &&
    targetType !== "club_activity" &&
    targetType !== "pass" &&
    targetType !== "progress_session"
  ) {
    try {
      const ownerId = await resolveTargetOwner(supabase, targetType, targetId);
      if (ownerId && ownerId !== user.id && !mentioned.includes(ownerId)) {
        await notify(supabase, {
          userId: ownerId,
          actorId: user.id,
          type: notificationType,
          targetType,
          targetId,
        });
      }
    } catch (error) {
      console.error(error);
    }
  }
  revalidateInteraction();
```

- [ ] **Step 2: posts.ts — menciones en post de texto/compartido + supersede en el fan-out**

En `src/lib/clubs/posts.ts`, importar:

```ts
import { notifyMentions } from "@/lib/social/notify-mentions";
```

Ampliar `notifyNewPost` para aceptar exclusiones (los ya notificados por mención):

```ts
async function notifyNewPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
  authorId: string,
  postId: string,
  excludeUserIds: string[] = [],
): Promise<void> {
  try {
    const { data: members } = await supabase
      .from("club_members")
      .select("user_id")
      .eq("club_id", clubId)
      .eq("status", "active");
    const exclude = new Set([authorId, ...excludeUserIds]);
    const userIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => !exclude.has(id));
    await notifyMany(supabase, {
      userIds,
      actorId: authorId,
      type: "club_post",
      targetType: "club_post",
      targetId: postId,
    });
  } catch (error) {
    console.error("notifyNewPost failed", error);
  }
}
```

> Nota: adaptar la firma real de `notifyNewPost` a la existente — si hoy no recibe `postId`, tómalo del insert. Los tres call sites ya insertan; añade `.select("id").single()` para obtenerlo. Si la implementación previa de `notifyNewPost` derivaba el post id de otra forma, respétala y solo añade `excludeUserIds`.

En `createTextPost`, cambiar el insert para devolver el id y notificar menciones antes del fan-out:

```ts
  const { data: post, error } = await supabase
    .from("club_posts")
    .insert({ club_id: clubId, author_id: userId, kind: "text", body: trimmed })
    .select("id")
    .single();
  if (error) throw error;

  const mentioned = await notifyMentions(supabase, {
    authorId: userId,
    text: trimmed,
    target: { type: "club_post", id: post.id },
    gate: { kind: "club", clubId },
  });
  await notifyNewPost(supabase, clubId, userId, post.id, mentioned);
  revalidateClubPages();
```

Aplicar el mismo patrón en `createShareActivityPost` (insert con `.select("id").single()`, `notifyMentions` sobre `trimmed`, y `notifyNewPost(..., post.id, mentioned)`). `createPoll` no tiene cuerpo libre relevante para menciones (la pregunta sí es texto — **incluir** menciones de la pregunta con el mismo patrón, target `club_post` con el id que devuelva `create_club_poll`; si la RPC no devuelve id, dejar `createPoll` sin menciones y anotarlo como límite en §8 de la spec).

- [ ] **Step 3: closePass — notificar menciones de la reseña (solo alta)**

En `src/lib/passes/actions.ts`, importar:

```ts
import { notifyMentions } from "@/lib/social/notify-mentions";
```

`savePassFields` no devuelve el texto ni el estado público; ampliarla para exponerlos, o releer tras guardar. Mínimo: hacer que `savePassFields` devuelva también el `review` y `isPublic` calculados. Cambiar su tipo de retorno y el cuerpo:

```ts
async function savePassFields(
  supabase: SupabaseServerClient,
  passId: string,
  userId: string,
  formData: FormData,
): Promise<ClosePassState & { review?: string | null; isPublic?: boolean }> {
  // ... validaciones idénticas ...
  const review = String(formData.get("review") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on";
  const { error } = await supabase
    .from("passes")
    .update({ finished_on: finishedOn, rating, review: review || null, is_public: isPublic })
    .eq("id", passId)
    .eq("user_id", userId);
  return error ? { error: "generic" } : { review: review || null, isPublic };
}
```

En `closePass` (NO en `updatePass` — editar no re-notifica, §8 de la spec), tras el guardado exitoso:

```ts
  const result = await savePassFields(supabase, passId, user.id, formData);
  if (result.error) return result;

  // Solo tiene sentido notificar menciones si la reseña es pública (el
  // destinatario debe poder verla) y hay texto. El gate 'profile' con el
  // propio autor como owner reutiliza la visibilidad de su perfil.
  if (result.review && result.isPublic) {
    await notifyMentions(supabase, {
      authorId: user.id,
      text: result.review,
      target: { type: "diary_entry", id: passId },
      gate: { kind: "profile", ownerId: user.id },
    });
  }

  revalidateReadingLog(itemType, itemId);
  return {};
```

- [ ] **Step 4: Verificar tipos y tests existentes**

Run: `npx tsc --noEmit && npx vitest run src/lib/social src/lib/passes src/lib/clubs`
Expected: sin errores de tipo; tests existentes en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/interaction-actions.ts src/lib/clubs/posts.ts src/lib/passes/actions.ts
git commit -m "feat(social): notificar menciones en comentarios, posts y resenas"
```

---

### Task 5: Búsqueda de candidatos para autocompletar

**Files:**
- Create: `src/lib/social/mention-search.ts`
- Test: `src/lib/social/mention-search.test.ts`

**Interfaces:**
- Consumes: `searchProfiles` de `src/lib/profile/search-profiles.ts`.
- Produces:
  ```ts
  export type MentionCandidate = {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    isInGraph: boolean;
  };
  export type MentionScope = { scope: "club"; clubId: string } | { scope: "profile" };
  export async function searchMentionCandidates(
    query: string,
    ctx: MentionScope,
  ): Promise<MentionCandidate[]>; // "use server", máx 6
  ```

- [ ] **Step 1: Write the failing test (helper puro de mezcla grafo+global)**

La server action toca red; se extrae y testea el merge puro. Crear el helper y su test:

```ts
// src/lib/social/mention-search.test.ts
import { describe, it, expect } from "vitest";
import { mergeCandidates } from "./mention-search";

describe("mergeCandidates", () => {
  it("pone el grafo primero y rellena con global, dedup por username", () => {
    const graph = [{ username: "borja", displayName: null, avatarUrl: null }];
    const global = [
      { username: "borja", displayName: null, avatarUrl: null },
      { username: "ana", displayName: null, avatarUrl: null },
    ];
    const out = mergeCandidates(graph, global, 6);
    expect(out.map((c) => c.username)).toEqual(["borja", "ana"]);
    expect(out[0].isInGraph).toBe(true);
    expect(out[1].isInGraph).toBe(false);
  });
  it("respeta el límite", () => {
    const global = Array.from({ length: 10 }, (_, i) => ({
      username: `u${i}`, displayName: null, avatarUrl: null,
    }));
    expect(mergeCandidates([], global, 6)).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/social/mention-search.test.ts`
Expected: FAIL — `mergeCandidates` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/social/mention-search.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { searchProfiles, type ProfileSearchResult } from "@/lib/profile/search-profiles";

export type MentionCandidate = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isInGraph: boolean;
};

export type MentionScope = { scope: "club"; clubId: string } | { scope: "profile" };

// Grafo primero, relleno global después, dedup por username. Puro: testeable
// sin red.
export function mergeCandidates(
  graph: ProfileSearchResult[],
  global: ProfileSearchResult[],
  limit: number,
): MentionCandidate[] {
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  for (const p of graph) {
    if (seen.has(p.username)) continue;
    seen.add(p.username);
    out.push({ ...p, isInGraph: true });
    if (out.length >= limit) return out;
  }
  for (const p of global) {
    if (seen.has(p.username)) continue;
    seen.add(p.username);
    out.push({ ...p, isInGraph: false });
    if (out.length >= limit) return out;
  }
  return out;
}

const LIMIT = 6;

export async function searchMentionCandidates(
  query: string,
  ctx: MentionScope,
): Promise<MentionCandidate[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const supabase = await createClient();

  if (ctx.scope === "club") {
    // Miembros activos del club cuyo username/nombre casa el prefijo.
    const { data } = await supabase
      .from("club_members")
      .select("profile_identities!inner(username, display_name, avatar_url)")
      .eq("club_id", ctx.clubId)
      .eq("status", "active")
      .ilike("profile_identities.username", `${q}%`)
      .limit(LIMIT);
    const rows = (data ?? [])
      .map((r) => (r as { profile_identities: ProfileSearchResult }).profile_identities)
      .filter(Boolean);
    return rows.map((p) => ({
      username: p.username,
      displayName: p.displayName ?? (p as unknown as { display_name: string | null }).display_name ?? null,
      avatarUrl: (p as unknown as { avatar_url: string | null }).avatar_url ?? null,
      isInGraph: true,
    }));
  }

  // scope profile: grafo (sigo o me siguen) + relleno global.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let graph: ProfileSearchResult[] = [];
  if (user) {
    const { data: rel } = await supabase
      .from("follows")
      .select("follower_id, followee_id")
      .eq("status", "accepted")
      .or(`follower_id.eq.${user.id},followee_id.eq.${user.id}`);
    const ids = new Set<string>();
    for (const r of rel ?? []) {
      if (r.follower_id !== user.id) ids.add(r.follower_id as string);
      if (r.followee_id !== user.id) ids.add(r.followee_id as string);
    }
    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from("profile_identities")
        .select("username, display_name, avatar_url, user_id")
        .in("user_id", [...ids])
        .ilike("username", `${q}%`)
        .limit(LIMIT);
      graph = (profs ?? []).map((p) => ({
        username: p.username as string,
        displayName: (p.display_name as string) ?? null,
        avatarUrl: (p.avatar_url as string) ?? null,
      }));
    }
  }
  const global = await searchProfiles(supabase, q);
  return mergeCandidates(graph, global, LIMIT);
}
```

> Nota de implementación: el embed `club_members` → `profile_identities!inner` depende de que exista la FK/relación en PostgREST. Si no la reconoce, hacer dos pasos (traer `user_id` de miembros activos, luego `profile_identities in (ids)` filtrando por `ilike` en app) — mismo patrón de dos pasos que `resolveUsers` en `follows.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/social/mention-search.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/mention-search.ts src/lib/social/mention-search.test.ts
git commit -m "feat(social): busqueda de candidatos para @menciones"
```

---

### Task 6: Hook + dropdown de autocompletar y su cableado en los 3 composers

**Files:**
- Create: `src/components/social/use-mention-autocomplete.tsx` (hook + dropdown)
- Test: `src/components/social/use-mention-autocomplete.test.ts` (helper puro de detección de token)
- Modify: `src/components/social/review-interactions.tsx` (input de comentario, ~185-191)
- Modify: `src/components/detail/close-pass-sheet.tsx` (textarea `review`)
- Modify: `src/components/detail/pass-diary.tsx` (textarea `review`)
- Modify: `src/components/clubs/club-post-composer.tsx` (textarea del post)

**Interfaces:**
- Consumes: `searchMentionCandidates`, `MentionScope`, `MentionCandidate` (Task 5).
- Produces:
  ```ts
  // helper puro
  export function findActiveMentionToken(
    value: string, caret: number,
  ): { query: string; start: number } | null;
  // hook
  export function useMentionAutocomplete(opts: {
    value: string;
    onChange: (next: string) => void;
    scope: MentionScope;
  }): {
    onInput: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    dropdown: React.ReactNode;
  };
  ```

- [ ] **Step 1: Write the failing test (detector de token puro)**

```ts
// src/components/social/use-mention-autocomplete.test.ts
import { describe, it, expect } from "vitest";
import { findActiveMentionToken } from "./use-mention-autocomplete";

describe("findActiveMentionToken", () => {
  it("detecta un token @ bajo el cursor", () => {
    const text = "hola @bor";
    expect(findActiveMentionToken(text, text.length)).toEqual({ query: "bor", start: 5 });
  });
  it("no detecta si el @ es de un email", () => {
    const text = "foo@bar";
    expect(findActiveMentionToken(text, text.length)).toBeNull();
  });
  it("cierra el token al llegar un espacio", () => {
    const text = "@bor ya";
    expect(findActiveMentionToken(text, text.length)).toBeNull();
  });
  it("detecta @ al inicio", () => {
    expect(findActiveMentionToken("@a", 2)).toEqual({ query: "a", start: 0 });
  });
  it("usa la posición del cursor, no el final", () => {
    const text = "@borja hola";
    expect(findActiveMentionToken(text, 4)).toEqual({ query: "bor", start: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/social/use-mention-autocomplete.test.ts`
Expected: FAIL — módulo/función no existe.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/social/use-mention-autocomplete.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchMentionCandidates } from "@/lib/social/mention-search";
import type { MentionCandidate, MentionScope } from "@/lib/social/mention-search";

// Detecta el token @… que contiene el cursor. Devuelve null si no hay uno
// activo (no hay @, hay espacio entre el @ y el cursor, o el @ va pegado a un
// carácter de palabra — email/ruta). Puro: testeable sin DOM.
export function findActiveMentionToken(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const before = at === 0 ? "" : upto[at - 1];
  if (before && /[a-z0-9_@/]/i.test(before)) return null; // email/ruta
  const query = upto.slice(at + 1);
  if (!/^[a-z0-9_]*$/i.test(query)) return null; // hay espacio/símbolo → cerrado
  return { query, start: at };
}

export function useMentionAutocomplete(opts: {
  value: string;
  onChange: (next: string) => void;
  scope: MentionScope;
}) {
  const { value, onChange, scope } = opts;
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [active, setActive] = useState(0);
  const [token, setToken] = useState<{ query: string; start: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    (query: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const results = await searchMentionCandidates(query, scope);
        setCandidates(results);
        setActive(0);
      }, 150);
    },
    [scope],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onInput = useCallback(
    (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const found = findActiveMentionToken(el.value, el.selectionStart ?? el.value.length);
      setToken(found);
      if (found && found.query.length >= 1) runSearch(found.query);
      else setCandidates([]);
    },
    [runSearch],
  );

  const pick = useCallback(
    (c: MentionCandidate) => {
      if (!token) return;
      const before = value.slice(0, token.start);
      const after = value.slice(token.start + 1 + token.query.length);
      onChange(`${before}@${c.username} ${after}`);
      setCandidates([]);
      setToken(null);
    },
    [token, value, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (candidates.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % candidates.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + candidates.length) % candidates.length); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(candidates[active]); }
      else if (e.key === "Escape") { setCandidates([]); setToken(null); }
    },
    [candidates, active, pick],
  );

  const dropdown =
    candidates.length > 0 ? (
      <ul className="absolute z-20 mt-1 max-h-60 w-56 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
        {candidates.map((c, i) => (
          <li key={c.username}>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                i === active ? "bg-accent/10 text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="font-medium">@{c.username}</span>
              {c.displayName && <span className="truncate text-xs text-muted-foreground">{c.displayName}</span>}
              {c.isInGraph && <span className="ml-auto text-[10px] text-accent">sigues</span>}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return { onInput, onKeyDown, dropdown };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/social/use-mention-autocomplete.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Cablear en el input de comentario**

En `src/components/social/review-interactions.tsx`:
- Aceptar una prop nueva `clubId?: string` (para el scope del comentario en un post de club) y calcular el scope:

```tsx
import { useMentionAutocomplete } from "./use-mention-autocomplete";
// ... dentro del componente, tras const [draft, setDraft] = useState(""):
const mention = useMentionAutocomplete({
  value: draft,
  onChange: setDraft,
  scope: clubId ? { scope: "club", clubId } : { scope: "profile" },
});
```

- Envolver el `<input>` en un contenedor relativo, cablear los handlers y pintar el dropdown:

```tsx
<div className="relative flex-1">
  <input
    type="text"
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onInput={mention.onInput}
    onKeyDown={mention.onKeyDown}
    placeholder={t("writeComment")}
    className="w-full rounded-full border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
  />
  {mention.dropdown}
</div>
```

(El caller que renderiza `ReviewInteractions` para comentarios de un post de club le pasa `clubId`; en reseñas de perfil se omite y el scope cae a `profile`.)

- [ ] **Step 6: Cablear en los textareas de reseña y post de club**

En `src/components/detail/close-pass-sheet.tsx` y `src/components/detail/pass-diary.tsx`, para el `<textarea name="review">`:
- Asegurar que el valor está en estado controlado (`useState`); si hoy es no-controlado, introducir `const [review, setReview] = useState(defaultValue)` y `name="review"` sigue enviando el valor en el submit del form (server action lee `formData.get("review")`).
- Añadir:

```tsx
const mention = useMentionAutocomplete({
  value: review,
  onChange: setReview,
  scope: { scope: "profile" },
});
// envolver el textarea en <div className="relative"> ... {mention.dropdown} </div>
// y añadir onInput={mention.onInput} onKeyDown={mention.onKeyDown} al textarea.
```

En `src/components/clubs/club-post-composer.tsx`, igual, con `scope: { scope: "club", clubId }` (el composer ya conoce el `clubId` del club en el que publica).

- [ ] **Step 7: Verificar tipos y build de componentes**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/components/social/use-mention-autocomplete.tsx src/components/social/use-mention-autocomplete.test.ts src/components/social/review-interactions.tsx src/components/detail/close-pass-sheet.tsx src/components/detail/pass-diary.tsx src/components/clubs/club-post-composer.tsx
git commit -m "feat(social): autocompletar @menciones en los 3 composers"
```

---

### Task 7: Render de menciones como enlace

**Files:**
- Create: `src/components/social/mention-text.tsx` (componente cliente-safe)
- Create: `src/lib/social/resolve-mentions.ts` (`resolveKnownMentions`, server)
- Test: `src/components/social/mention-text.test.tsx`
- Modify: `src/components/detail/review-row.tsx` (cuerpo de reseña)
- Modify: `src/components/clubs/club-post-card.tsx:69` (`post.body`)
- Modify: `src/components/social/review-interactions.tsx:142` (`c.body` en comentarios)
- Modify: `src/components/social/review-card.tsx:70` (`reviewExcerpt`)

**Interfaces:**
- Consumes: `MENTION_RE` (Task 1).
- Produces:
  ```ts
  export function MentionText(props: { text: string; knownUsernames: Set<string> }): JSX.Element;
  // server:
  export async function resolveKnownMentions(supabase, texts: string[]): Promise<Set<string>>;
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/social/mention-text.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MentionText } from "./mention-text";

describe("MentionText", () => {
  it("linkifica un username conocido", () => {
    render(<MentionText text="hola @borja" knownUsernames={new Set(["borja"])} />);
    const link = screen.getByRole("link", { name: "@borja" });
    expect(link).toHaveAttribute("href", "/u/borja");
  });
  it("deja como texto plano un username desconocido", () => {
    render(<MentionText text="hola @nadie" knownUsernames={new Set()} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/@nadie/)).toBeInTheDocument();
  });
  it("preserva el texto alrededor", () => {
    const { container } = render(
      <MentionText text="a @borja b" knownUsernames={new Set(["borja"])} />,
    );
    expect(container.textContent).toBe("a @borja b");
  });
});
```

> Si el proyecto no tiene `@testing-library/react` cableado en Vitest, adaptar a la utilidad de render existente (revisar otros `*.test.tsx` en `src/components`). Si no hay ninguno, degradar este test a una prueba unitaria de una función pura `tokenizeMentions(text, known)` que devuelva segmentos `{ type: "text"|"mention", value }`, y que `MentionText` renderice a partir de ella.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/social/mention-text.test.tsx`
Expected: FAIL — `MentionText` no existe.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/social/mention-text.tsx
import Link from "next/link";
import { Fragment } from "react";
import { MENTION_RE } from "@/lib/social/mentions";

// Renderiza texto libre linkificando @usuario SOLO si el username existe
// (knownUsernames). Un typo (@nadie) queda como texto plano — nunca un enlace
// muerto. Cliente-safe: no hace fetch, recibe el set ya resuelto.
export function MentionText({
  text,
  knownUsernames,
}: {
  text: string;
  knownUsernames: Set<string>;
}) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  // MENTION_RE es global: se reinicia lastIndex al empezar.
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const prefix = m[1];
    const username = m[2];
    const mentionStart = m.index + prefix.length;
    // texto antes de la mención (incluye el prefijo capturado)
    parts.push(<Fragment key={key++}>{text.slice(lastIndex, mentionStart)}</Fragment>);
    if (knownUsernames.has(username.toLowerCase())) {
      parts.push(
        <Link key={key++} href={`/u/${username.toLowerCase()}`} className="font-medium text-accent hover:underline">
          @{username}
        </Link>,
      );
    } else {
      parts.push(<Fragment key={key++}>@{username}</Fragment>);
    }
    lastIndex = mentionStart + 1 + username.length;
  }
  parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  return <>{parts}</>;
}
```

```ts
// src/lib/social/resolve-mentions.ts
import type { createClient } from "@/lib/supabase/server";
import { extractMentions } from "./mentions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Dado un lote de textos, resuelve en UNA query qué usernames mencionados
// existen — para pasar el set a <MentionText> y linkificar solo los reales.
export async function resolveKnownMentions(
  supabase: SupabaseServerClient,
  texts: string[],
): Promise<Set<string>> {
  const usernames = [...new Set(texts.flatMap((t) => extractMentions(t)))];
  if (usernames.length === 0) return new Set();
  const { data } = await supabase
    .from("profile_identities")
    .select("username")
    .in("username", usernames);
  return new Set((data ?? []).map((r) => (r.username as string).toLowerCase()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/social/mention-text.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Cablear los renderers**

En cada superficie que hoy pinta el cuerpo como texto plano, resolver el set en el server component padre (con `resolveKnownMentions`) y pasar `<MentionText text={body} knownUsernames={known} />` en vez del `{body}`/`{post.body}`/`{c.body}` actual:

- `src/components/clubs/club-post-card.tsx:69` — cambiar `{post.body}` por `<MentionText text={post.body} knownUsernames={known} />`. El padre que lista posts (`listClubPosts` consumer) llama `resolveKnownMentions(supabase, posts.map(p => p.body))` y pasa `known` a cada card.
- `src/components/detail/review-row.tsx` — el cuerpo de la reseña de comunidad: envolver con `MentionText`; el server component de la ficha (`get-community.ts` consumer) resuelve el set de todas las reseñas mostradas.
- `src/components/social/review-interactions.tsx:142` — `{c.body}` de cada comentario: cambiar por `<MentionText text={c.body} knownUsernames={known} />`. Como este componente es cliente y los comentarios vienen prefetcheados, pasar `known` como prop desde el server (resuelto sobre `comments.map(c => c.body)` donde se construyen las props de `ReviewInteractions`).
- `src/components/social/review-card.tsx:70` — `{event.reviewExcerpt}` del feed: envolver con `MentionText`; el server del feed (`feed.ts` consumer) resuelve sobre los excerpts. (El excerpt puede truncar una mención a mitad — aceptable, solo se linkifica lo que quede entero.)

> En cada caso, `known` es un `Set<string>`. Para componentes cliente que reciben props serializadas, pasar `Array.from(known)` y reconstruir `new Set(...)` dentro, o pasar directamente el array y cambiar la prop de `MentionText` a aceptar `string[]` — elegir lo que encaje con el patrón de serialización del componente (los Set no serializan a través del límite RSC→cliente). **Decisión**: cambiar la prop a `knownUsernames: string[]` y hacer el `.includes`/`Set` dentro de `MentionText` para evitar el problema de serialización. Ajustar el test del Step 1 en consecuencia (`knownUsernames={["borja"]}`).

- [ ] **Step 6: Verificar tipos y tests**

Run: `npx tsc --noEmit && npx vitest run src/components/social src/lib/social`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/social/mention-text.tsx src/components/social/mention-text.test.tsx src/lib/social/resolve-mentions.ts src/components/detail/review-row.tsx src/components/clubs/club-post-card.tsx src/components/social/review-interactions.tsx src/components/social/review-card.tsx
git commit -m "feat(social): render de @menciones como enlace"
```

---

### Task 8: Verificación end-to-end, RLS y cierre de documentación

**Files:**
- Create (E2E): `e2e/menciones.spec.ts` (o la ruta que use `npm run test:e2e`)
- Modify: `docs/requirements/data-model.md`, `docs/requirements/social-epic.md`, `docs/requirements/decisiones.md`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Batería RLS / impersonación (dev)**

Con `mcp__supabase-dev__execute_sql`, verificar (usando `set local role` / `request.jwt.claims` según el patrón de baterías previas del epic):
- Mención en reseña de **perfil privado** cuyo autor NO sigue al mencionado ⇒ `resolveDeliverableMentions` devuelve vacío (comprobar vía la lógica: crear datos de prueba y confirmar que no se inserta notificación para el no-seguidor).
- Mención en reseña de perfil privado a un **seguidor aceptado** ⇒ sí notifica.
- Mención en post de club a un **no-miembro** ⇒ no notifica; a un **miembro activo** ⇒ sí.
- La fila `notifications` insertada respeta la RLS existente (solo el destinatario la ve) — ya cubierto por Bloque D, confirmar que `type='mentioned'` no rompe nada.

Documentar los casos y resultados en el checklist manual (siguiente step).

- [ ] **Step 2: E2E en navegador (per docs/TESTING.md)**

Escribir/ejecutar (o delegar a `qa-verifier`) el flujo con dos cuentas reales:
1. Usuario A escribe un comentario en una reseña pública, teclea `@` + prefijo, aparece el dropdown, elige a B.
2. Al guardar, B recibe una notificación "A te mencionó" cuyo enlace lleva a la reseña (`?tab=community`).
3. El comentario renderiza `@B` como enlace a `/u/B`.
4. A menciona a un usuario privado que no le sigue en una reseña ⇒ ese usuario **no** recibe ping (mención queda como texto/enlace pero sin notificación).
5. En un post de club, mencionar a un no-miembro ⇒ sin ping.

Guardar el checklist en `docs/superpowers/plans/2026-07-30-menciones-usuario-manual-test.md` si la verificación automática no cubre algún paso.

- [ ] **Step 3: Actualizar data-model.md**

Registrar el nuevo valor `mentioned` del enum `notification_type` y actualizar la fecha de verificación de la sección correspondiente.

- [ ] **Step 4: Marcar E5.K3 en social-epic.md**

Cambiar `- [ ] **E5.K3**` a `- [x] **E5.K3**` con una nota de estado (fecha, "dev+prod", puntero a esta spec y plan).

- [ ] **Step 5: Append en decisiones.md**

Añadir al final (append-only) una entrada: menciones como texto crudo sin tabla sidecar; gate de entregabilidad en capa de app (sin función SQL nueva); supersede del ruido de notificación; editar reseña no re-notifica.

- [ ] **Step 6: Abrir issues de los límites conocidos**

Abrir issue(s) en el repo (regla de oro de AGENTS.md) para: re-notificación al editar reseña (diff de menciones); fixup de menciones al renombrar username; bloqueos (E5.J1) restando del conjunto entregable; y `createPoll` sin menciones si la RPC no devuelve id.

- [ ] **Step 7: Commit final**

```bash
git add docs/
git commit -m "docs(social): cierra E5.K3 menciones (data-model, epic, decisiones)"
```

---

## Self-Review (cobertura de la spec)

- §1 Alcance (3 superficies) → Tasks 4 (escritura) + 6 (composers) + 7 (render). ✅
- §2 Sin tabla / enum nuevo → Task 2. ✅
- §3 Parser → Task 1. ✅
- §4 notifyMentions + entregabilidad + supersede + call sites → Tasks 3 + 4. ✅
- §5 Autocompletar (candidatos + composer) → Tasks 5 + 6. ✅
- §6 Render (linkify known-only, batch resolve) → Task 7. ✅
- §7 i18n + tipos → Task 2. ✅
- §8 Límites conocidos → Task 8 Step 6 (issues). ✅
- §9 Verificación (unit/RLS/E2E) → unit en cada task; RLS+E2E en Task 8. ✅
- §10 Cierre de doc → Task 8. ✅
- §11 Ficheros → mapeados en las Files de cada task. ✅

Nota de consistencia de tipos: `knownUsernames` se decide como `string[]` (no `Set`) por serialización RSC→cliente (Task 7 Step 5) — el test del Step 1 se ajusta a array.
