# E5.D4 — Push Notifications (Web Push) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the 5 existing notification types (follow_request, new_follower, follow_accepted, review_liked, review_commented) as real OS-level push notifications for users who opt in, on top of the existing `notifications` table — Web Push only (Android/desktop/iOS-outside-EU); native push is explicitly out of scope but the schema won't need reshaping to add it later.

**Architecture:** One new table (`push_subscriptions`, channel-discriminated via a jsonb `credentials` column) stores each device's Web Push subscription. `notify()` (already the single choke point for all 5 notification types, built in Bloque D) gets a best-effort hook that renders the same i18n copy the in-app bell uses and sends it via the `web-push` npm package to every subscription the recipient has registered. Client-side: an opt-in toggle on a new `/cuenta` settings page drives the browser's `Notification`/`PushManager` APIs; the existing service worker (`public/sw.js`) gains `push`/`notificationclick` listeners, purely additive to its current offline-cache logic.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Supabase Postgres/Auth/RLS, next-intl, `web-push` (new dependency), TypeScript, Tailwind, existing PWA service worker.

## Global Constraints

- Native push (APNs via Capacitor, for iOS+EU reliability) is explicitly out of scope for this plan — `push_channel` only declares `'web'`, no `ios_native` value, no native sender code.
- All 5 existing notification types get push delivery uniformly — no per-type opt-out/settings in this MVP.
- Opt-in is an explicit toggle on `/cuenta` — never an automatic/contextual permission prompt.
- No `UPDATE` RLS policy on `push_subscriptions` — a changed subscription is a delete+insert at the application level, not a Postgres-level upsert.
- VAPID keys: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client-safe) and `VAPID_PRIVATE_KEY` (server-only) — generated once, handed to the user directly in chat for `.env.local`/Vercel dashboard, never written to a file or committed.
- No RLS impersonation battery needed beyond confirming the plain self-only-ownership pattern already verified for `notifications` — this table has no polymorphic target or cross-user visibility logic.
- Per current project convention (`docs/TESTING.md`), UI verification is a **manual test checklist document**, not an automated browser-driving subagent.
- Run `npx tsc --noEmit` and `npx eslint <touched files>` after every task that touches `.ts`/`.tsx` files.
- Windows/PowerShell environment — use the Bash tool (Git Bash) for shell commands shown below, not native PowerShell cmdlets.

---

### Task 1: Migration — `push_subscriptions` table + RLS

**Files:**
- Create: `supabase/migrations/20260712_push_subscriptions.sql`

**Interfaces:**
- Produces: enum `public.push_channel` (`'web'`), table `public.push_subscriptions(id, user_id, channel, credentials, created_at)`, unique index `idx_push_subscriptions_user_channel_endpoint`. Consumed by Task 2 (types), Task 5 (subscription actions), Task 6 (`sendPushToUser`).

- [ ] **Step 1: Write the migration file**

```sql
-- E5.D4 — Notificaciones push (Web Push). Ver
-- docs/superpowers/specs/2026-07-12-push-notifications-design.md.
-- channel solo declara 'web' hoy; un canal nativo futuro (ios_native, vía
-- Capacitor/APNs) sería un ALTER TYPE ADD VALUE + una forma distinta de
-- `credentials`, sin rediseñar la tabla.

create type public.push_channel as enum ('web');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel public.push_channel not null default 'web',
  credentials jsonb not null,
  created_at timestamptz not null default now()
);

-- Constraint de tabla no admite expresiones (credentials->>'endpoint' no es
-- una columna) — el UNIQUE va como índice de expresión aparte. Re-suscribirse
-- desde el mismo dispositivo/endpoint es idempotente a nivel de aplicación
-- (delete+insert, ver subscription-actions.ts).
create unique index idx_push_subscriptions_user_channel_endpoint
  on public.push_subscriptions (user_id, channel, (credentials->>'endpoint'));

comment on table public.push_subscriptions is 'Suscripciones de push por usuario (E5.D4). channel discrimina el canal de entrega; credentials es jsonb específico de canal (hoy solo "web": {endpoint, keys:{p256dh,auth}}).';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions select own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "push_subscriptions insert own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "push_subscriptions delete own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Apply the migration to dev via the Management API**

```bash
node -e '
const fs = require("fs");
const sql = fs.readFileSync("supabase/migrations/20260712_push_subscriptions.sql", "utf8");
fetch("https://api.supabase.com/v1/projects/tyvzpuhxfwxrnkcpzxyg/database/query", {
  method: "POST",
  headers: { Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
}).then(async r => { console.log("STATUS", r.status); console.log(await r.text()); });
'
```

Expected: `STATUS 201` and no error body.

- [ ] **Step 3: Run the RLS impersonation battery against dev**

Everything happens inside one rolled-back transaction — no real data is touched.

```sql
begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-test-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'rls-test-b@example.com');
insert into public.profiles (user_id, username, is_public) values
  ('11111111-1111-1111-1111-111111111111', 'rlstest_a', true),
  ('22222222-2222-2222-2222-222222222222', 'rlstest_b', true);

-- Test 1: A se suscribe (insert propio) → OK.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.push_subscriptions (user_id, channel, credentials)
  values ('11111111-1111-1111-1111-111111111111', 'web', '{"endpoint":"https://fcm.example/a","keys":{"p256dh":"x","auth":"y"}}');

-- Test 2: B intenta insertar una suscripción SUPLANTANDO a A → debe fallar.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.push_subscriptions (user_id, channel, credentials)
  values ('11111111-1111-1111-1111-111111111111', 'web', '{"endpoint":"https://fcm.example/spoof","keys":{"p256dh":"x","auth":"y"}}'); -- esperado: ERROR (RLS)

-- Test 3: B no puede ver la suscripción de A.
select count(*) from public.push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111'; -- esperado: 0

-- Test 4: B no puede borrar la suscripción de A.
delete from public.push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111' returning id; -- esperado: 0 filas

-- Test 5: sin política UPDATE — ni siquiera A puede actualizar su propia fila.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.push_subscriptions set channel = 'web' where user_id = '11111111-1111-1111-1111-111111111111' returning id; -- esperado: 0 filas (RLS deniega, sin error, sin política = sin acceso)

-- Test 6: A borra su propia suscripción → OK.
delete from public.push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111' returning id; -- esperado: 1 fila

-- Test 7: anon no puede insertar ni leer nada (no está en "to authenticated").
reset role;
set local role anon;
insert into public.push_subscriptions (user_id, channel, credentials)
  values ('11111111-1111-1111-1111-111111111111', 'web', '{"endpoint":"https://fcm.example/anon","keys":{"p256dh":"x","auth":"y"}}'); -- esperado: ERROR (RLS)

reset role;
rollback;
```

Confirm each `-- esperado:` comment against the actual output. If any test doesn't match, fix the migration and re-run Steps 2–3 (drop-and-retry if needed: `drop table if exists public.push_subscriptions cascade; drop type if exists public.push_channel;`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260712_push_subscriptions.sql
git commit -m "feat: add push_subscriptions table for E5.D4 (Web Push)"
```

---

### Task 2: `schema-baseline.sql` + `database.types.ts` patch

**Files:**
- Modify: `supabase/schema-baseline.sql` (append at end)
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: TypeScript types `Database["public"]["Tables"]["push_subscriptions"]`, `Database["public"]["Enums"]["push_channel"]`.

- [ ] **Step 1: Append the migration SQL to `schema-baseline.sql`**

Append this block at the very end of `supabase/schema-baseline.sql` (verbatim, same SQL as Task 1):

```sql


-- ============================================================
-- 20260712_push_subscriptions.sql (E5.D4)
-- ============================================================
-- Notificaciones push (Web Push). channel solo declara 'web' hoy; un canal
-- nativo futuro (ios_native, vía Capacitor/APNs) sería un ALTER TYPE ADD
-- VALUE + una forma distinta de `credentials`, sin rediseñar la tabla.

create type public.push_channel as enum ('web');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel public.push_channel not null default 'web',
  credentials jsonb not null,
  created_at timestamptz not null default now()
);

create unique index idx_push_subscriptions_user_channel_endpoint
  on public.push_subscriptions (user_id, channel, (credentials->>'endpoint'));

comment on table public.push_subscriptions is 'Suscripciones de push por usuario (E5.D4). channel discrimina el canal de entrega; credentials es jsonb específico de canal (hoy solo "web": {endpoint, keys:{p256dh,auth}}).';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions select own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "push_subscriptions insert own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "push_subscriptions delete own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Patch `database.types.ts` — add the `push_subscriptions` table type**

Find the end of the `notifications` block in the `Tables` section (ends right before `library_entries: {` — same anchor point used by Bloques B/C's patches) and insert immediately after it:

```ts
      push_subscriptions: {
        Row: {
          channel: Database["public"]["Enums"]["push_channel"]
          created_at: string
          credentials: Json
          id: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["push_channel"]
          created_at?: string
          credentials: Json
          id?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["push_channel"]
          created_at?: string
          credentials?: Json
          id?: string
          user_id?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Patch `database.types.ts` — extend the `Enums` block**

Find the `Enums: {` block and add a new line (alongside the existing `notification_type`/`target_kind` entries):

```ts
      push_channel: "web"
```

- [ ] **Step 4: Patch `database.types.ts` — extend the `Constants` block**

Find `export const Constants = { public: { Enums: {` and add:

```ts
      push_channel: ["web"],
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema-baseline.sql src/lib/supabase/database.types.ts
git commit -m "chore: sync schema-baseline and generated types for push_subscriptions"
```

---

### Task 3: Add `web-push` dependency + generate VAPID keys

**Files:**
- Modify: `package.json` (and `package-lock.json` via install)

- [ ] **Step 1: Install the `web-push` package**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

- [ ] **Step 2: Generate the VAPID keypair**

```bash
npx web-push generate-vapid-keys
```

This prints a public and private key pair. **Do not write these to any file or commit them.** Report both values back in your final message to the human so they can add them to `.env.local` (as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`) and to the Vercel dashboard's environment variables for prod, matching how `TMDB_API_KEY`/`GOOGLE_BOOKS_API_KEY` are already handled in this project (see `docs/TESTING.md`).

- [ ] **Step 3: Verify install**

```bash
npx tsc --noEmit
```

Expected: clean (no code references the package yet, this just confirms the install didn't break anything).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add web-push dependency for E5.D4"
```

Do **not** commit any file containing the actual VAPID key values.

---

### Task 4: `src/lib/push/send-push.ts` — Web Push sender

**Files:**
- Create: `src/lib/push/send-push.ts`

**Interfaces:**
- Consumes: `web-push` package; `Database["public"]["Tables"]["push_subscriptions"]` (Task 2).
- Produces: `type PushPayload = { title: string; body: string; url: string }`, `function sendPushToUser(supabase, userId: string, payload: PushPayload): Promise<void>`. Consumed by Task 6 (`notify()`).

- [ ] **Step 1: Write `src/lib/push/send-push.ts`**

```ts
import webpush from "web-push";
import type { createClient } from "@/lib/supabase/server";

// Entrega de push (E5.D4), canal-agnóstica: hoy solo implementa "web"; un
// canal nativo futuro (ios_native, vía Capacitor/APNs) se añadiría como una
// rama más en el bucle de sendPushToUser, sin tocar la firma pública.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type WebCredentials = { endpoint: string; keys: { p256dh: string; auth: string } };

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

webpush.setVapidDetails(
  "mailto:borjar20@gmail.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

async function sendWebPush(
  credentials: WebCredentials,
  payload: PushPayload,
): Promise<{ expired: boolean }> {
  try {
    await webpush.sendNotification(
      credentials as webpush.PushSubscription,
      JSON.stringify(payload),
    );
    return { expired: false };
  } catch (error) {
    // 404/410 del push service = el navegador descartó esta suscripción
    // (desinstalada, permiso revocado desde el SO, etc.) — limpiar en el
    // llamador. Cualquier otro fallo se registra pero no se relanza: el
    // envío de push es siempre best-effort.
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) return { expired: true };
    console.error("sendWebPush failed", error);
    return { expired: false };
  }
}

export async function sendPushToUser(
  supabase: SupabaseServerClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, channel, credentials")
    .eq("user_id", userId);

  if (error) {
    console.error("sendPushToUser: failed to load subscriptions", error);
    return;
  }

  for (const sub of subs ?? []) {
    if (sub.channel === "web") {
      const { expired } = await sendWebPush(sub.credentials as WebCredentials, payload);
      if (expired) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
    // futuro: else if (sub.channel === "ios_native") await sendNativePush(...)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean. If `webpush.PushSubscription`'s type doesn't accept the cast cleanly, check `@types/web-push`'s exported types directly (`node_modules/@types/web-push/index.d.ts`) and adjust the cast target — the runtime shape (`{endpoint, keys: {p256dh, auth}}`) is correct regardless of the exact TS type name.

- [ ] **Step 3: Commit**

```bash
git add src/lib/push/send-push.ts
git commit -m "feat: add Web Push sender (sendPushToUser)"
```

---

### Task 5: `src/lib/push/subscription-actions.ts` — subscribe/unsubscribe server actions

**Files:**
- Create: `src/lib/push/subscription-actions.ts`

**Interfaces:**
- Produces: `"use server"` functions `subscribeToPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void>`, `unsubscribeFromPush(endpoint: string): Promise<void>`. Consumed by Task 7 (`PushToggle`).

- [ ] **Step 1: Write `src/lib/push/subscription-actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type WebSubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Mutaciones de suscripción push (E5.D4). Sin política UPDATE en la tabla
// (ver migración) — re-suscribirse es delete+insert a nivel de aplicación,
// no un upsert de Postgres.

export async function subscribeToPush(subscription: WebSubscriptionJson): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("channel", "web")
    .filter("credentials->>endpoint", "eq", subscription.endpoint);

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    channel: "web",
    credentials: subscription,
  });
  if (error) throw error;
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("channel", "web")
    .filter("credentials->>endpoint", "eq", endpoint);
  if (error) throw error;
}
```

Note: `.filter("credentials->>endpoint", "eq", value)` is used instead of `.eq("credentials->>endpoint", value)` because `.eq()`'s TypeScript signature is constrained to known column names from the generated types, while `.filter()` accepts an arbitrary PostgREST filter path string (the standard way to filter on a computed/jsonb-path column with this client).

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/push/subscription-actions.ts
git commit -m "feat: add subscribeToPush/unsubscribeFromPush server actions"
```

---

### Task 6: Hook push delivery into `notify()`

**Files:**
- Modify: `src/lib/social/notifications.ts`
- Modify: `src/components/social/notification-bell.tsx`

**Interfaces:**
- Consumes: `sendPushToUser`, `type PushPayload` from `src/lib/push/send-push.ts` (Task 4).
- Produces: `notify()` (existing, extended behavior — signature unchanged, all existing call sites in `src/lib/social/actions.ts`/`interaction-actions.ts` keep working with zero changes); new exported const `NOTIFICATION_TYPE_KEY: Record<NotificationType, string>`.

- [ ] **Step 1: Rewrite `src/lib/social/notifications.ts`**

Add these imports at the top (alongside the existing ones):

```ts
import { getTranslations } from "next-intl/server";
import { sendPushToUser, type PushPayload } from "@/lib/push/send-push";
```

Add this exported constant right after the `NotificationType` export (this is the same mapping `notification-bell.tsx` currently defines locally — Step 3 below removes the duplicate there):

```ts
export const NOTIFICATION_TYPE_KEY: Record<NotificationType, string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
};
```

Replace the entire `notify()` function:

```ts
export async function notify(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
  });
  // Best-effort: no se propaga. Una notificación fallida no debe deshacer la
  // acción real (follow/accept/reacción/comentario) que ya se confirmó.
  if (error) {
    console.error("notify() failed", error);
    return;
  }

  // Entrega push (E5.D4), también best-effort — nunca debe afectar a la
  // notificación in-app, que ya se insertó arriba con éxito.
  try {
    await deliverPush(supabase, params);
  } catch (pushError) {
    console.error("notify() push delivery failed", pushError);
  }
}

async function deliverPush(
  supabase: SupabaseServerClient,
  params: {
    userId: string;
    actorId: string;
    type: NotificationType;
    targetType?: ReviewTargetType;
    targetId?: string;
  },
): Promise<void> {
  const { data: actor } = await supabase
    .from("profile_identities")
    .select("username, display_name")
    .eq("user_id", params.actorId)
    .maybeSingle();
  if (!actor?.username) return;

  let href = `/u/${actor.username}`;
  if (params.targetType && params.targetId) {
    const hrefByKey = await resolveReviewHrefs(supabase, [
      { targetType: params.targetType, targetId: params.targetId },
    ]);
    href = hrefByKey.get(`${params.targetType}:${params.targetId}`) ?? href;
  }

  const t = await getTranslations("notifications");
  const tCommon = await getTranslations("common");
  const name = actor.display_name || actor.username;

  const payload: PushPayload = {
    title: tCommon("appName"),
    body: t(NOTIFICATION_TYPE_KEY[params.type], { name }),
    url: href,
  };

  await sendPushToUser(supabase, params.userId, payload);
}
```

Leave `getUnreadCount`, `resolveReviewHrefs`, and `listNotifications` exactly as they are — only their surrounding context changes (new imports/const above them, new `notify()`/`deliverPush` before them).

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Update `notification-bell.tsx` to import the shared type-key map**

In `src/components/social/notification-bell.tsx`, find:

```ts
import type { Notification } from "@/lib/social/notifications";

const TYPE_KEY: Record<Notification["type"], string> = {
  follow_request: "followRequest",
  new_follower: "newFollower",
  follow_accepted: "followAccepted",
  review_liked: "reviewLiked",
  review_commented: "reviewCommented",
};
```

Replace with:

```ts
import { NOTIFICATION_TYPE_KEY, type Notification } from "@/lib/social/notifications";
```

Then find every remaining reference to `TYPE_KEY` in the file (there is exactly one, in the `t(TYPE_KEY[n.type], {...})` call) and rename it to `NOTIFICATION_TYPE_KEY`.

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/lib/social/notifications.ts src/components/social/notification-bell.tsx
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/notifications.ts src/components/social/notification-bell.tsx
git commit -m "feat: hook push delivery into notify(), share NOTIFICATION_TYPE_KEY"
```

---

### Task 7: `PushToggle` component + `push` i18n namespace

**Files:**
- Create: `src/components/push/push-toggle.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `subscribeToPush`, `unsubscribeFromPush` from `src/lib/push/subscription-actions.ts` (Task 5); `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Task 3, inlined client-side by Next.js at build time — no prop threading needed for a `NEXT_PUBLIC_`-prefixed var).
- Produces: `<PushToggle />`. Consumed by Task 8 (`/cuenta` page).

- [ ] **Step 1: Write `src/components/push/push-toggle.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push/subscription-actions";

type PermissionState = "unsupported" | "default" | "denied";

// Toggle de opt-in de notificaciones push (E5.D4). El estado real vive en el
// navegador (Notification.permission + PushManager), no en la app — se
// consulta al montar en vez de guardarse en servidor.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushToggle() {
  const t = useTranslations("push");
  const [state, setState] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready.then((registration) =>
      registration.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)),
    );
  }, []);

  function enable() {
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });
      const json = subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await subscribeToPush(json);
      setSubscribed(true);
    });
  }

  function disable() {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    });
  }

  if (state === "unsupported") {
    return <p className="text-sm text-muted-foreground">{t("unsupported")}</p>;
  }

  if (state === "denied") {
    return <p className="text-sm text-muted-foreground">{t("deniedHint")}</p>;
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{t("toggleLabel")}</span>
        <span className="text-xs text-muted-foreground">{t("toggleHint")}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={subscribed}
        aria-label={t("toggleLabel")}
        disabled={isPending}
        onClick={subscribed ? disable : enable}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          subscribed ? "bg-accent" : "bg-surface-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            subscribed ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add the `push` i18n namespace**

In `messages/es.json`, add a new top-level namespace (place it near `feed`/`social`/`notifications` for discoverability):

```json
  "push": {
    "toggleLabel": "Notificaciones push",
    "toggleHint": "Recibe un aviso del sistema cuando alguien te siga, reaccione o comente.",
    "unsupported": "Tu navegador no soporta notificaciones push.",
    "deniedHint": "Has bloqueado los avisos para este sitio. Actívalos desde los ajustes de notificaciones de tu navegador para poder recibirlos."
  },
```

- [ ] **Step 3: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/push/push-toggle.tsx
```

Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/push/push-toggle.tsx messages/es.json
git commit -m "feat: add PushToggle component"
```

---

### Task 8: `/cuenta` account settings page + header nav link

**Files:**
- Create: `src/app/cuenta/page.tsx`
- Modify: `src/components/header.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `PushToggle` from `src/components/push/push-toggle.tsx` (Task 7).

- [ ] **Step 1: Write `src/app/cuenta/page.tsx`**

There is no existing `/cuenta` index page today — only `/cuenta/contrasena` (reachable exclusively via the password-recovery email flow, not linked in the UI). This is the first general account-settings entry point in the app.

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PushToggle } from "@/components/push/push-toggle";

export const metadata: Metadata = {
  title: "Cuenta — Biblioshare",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getTranslations("cuenta");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <PushToggle />
    </div>
  );
}
```

- [ ] **Step 2: Add the `cuenta` i18n namespace**

In `messages/es.json`, add:

```json
  "cuenta": {
    "title": "Cuenta",
    "navLabel": "Cuenta"
  },
```

- [ ] **Step 3: Add a header nav link to `/cuenta`**

In `src/components/header.tsx`, find the `/usuarios` link block:

```tsx
            <Link
              href="/usuarios"
              aria-label={t("users.navLabel")}
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <UsersIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{t("users.navLabel")}</span>
            </Link>
            {isAdmin && (
```

Insert a new link between it and the `isAdmin` block. **Do not add a new icon** — `icons.tsx` has an in-progress icon redesign in the working tree; follow this same file's existing text-only precedent (the `/admin` link right below has no icon either):

```tsx
            <Link
              href="/usuarios"
              aria-label={t("users.navLabel")}
              className="inline-flex shrink-0 items-center gap-2 hover:text-foreground"
            >
              <UsersIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{t("users.navLabel")}</span>
            </Link>
            <Link href="/cuenta" className="shrink-0 hover:text-foreground">
              {t("cuenta.navLabel")}
            </Link>
            {isAdmin && (
```

`t` is already the `getTranslations()` instance in scope at the top of this Server Component (`const t = await getTranslations();`, no namespace argument — it resolves keys by their full dotted path, matching how `t("users.navLabel")` and `t("challenges.navLabel")` already work a few lines above) — no new import needed.

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint "src/app/cuenta/page.tsx" src/components/header.tsx
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/cuenta/page.tsx src/components/header.tsx messages/es.json
git commit -m "feat: add /cuenta account settings page with push toggle"
```

---

### Task 9: Service worker — `push` and `notificationclick` listeners

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: Read the current file, then append the two new listeners**

Read `public/sw.js` in full first (it's short, ~63 lines) to confirm the current content matches what's below before editing — don't rewrite the file wholesale. Add these two listeners at the end of the file, after the existing `fetch` listener:

```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Biblioshare", {
      body: data.body,
      icon: "/icon-192",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.navigate(url).then((c) => c.focus());
      return self.clients.openWindow(url);
    })
  );
});
```

Do not change `CACHE_NAME`, the `install`/`activate`/`fetch` listeners, or anything else in the file — these two new listeners are purely additive and don't interact with the precache/fetch logic.

- [ ] **Step 2: Verify lint**

```bash
npx eslint public/sw.js
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat: add push/notificationclick listeners to service worker"
```

---

### Task 10: Manual test checklist

**Files:**
- Create: `docs/superpowers/plans/2026-07-12-push-notifications-manual-test.md`

- [ ] **Step 1: Write the checklist document**

Per current project convention (`docs/TESTING.md`), this replaces automated browser-driven E2E verification. Write a markdown checklist covering:

1. **Setup**: confirm `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set in `.env.local` (from Task 3), then `npm run dev`.
2. **Opt-in**: log in as `devtest`, navigate to `/cuenta` (via the new header nav link), click the push toggle on. Confirm the browser's native permission prompt appears, granting it flips the toggle on, and a row appears in `push_subscriptions` for `devtest` (read-only SQL check against dev, scoped to that user).
3. **Delivery**: from a second account (or by triggering any of the 5 notification types toward `devtest` — e.g. have another user follow `devtest`), confirm a real OS-level push notification appears (Chrome/Edge desktop support this without needing a phone) with the correct title/body text matching what the in-app bell would show for that same notification.
4. **Click-through**: click the push notification, confirm it opens/focuses the app at the correct URL (matching what the equivalent bell notification links to — e.g. a `follow_request` push should land on the actor's profile).
5. **Opt-out**: toggle push off on `/cuenta`, confirm the `push_subscriptions` row is removed, and confirm a subsequent notification does NOT produce a push (in-app bell still works as before — opting out of push doesn't touch in-app notifications).
6. **Denied permission**: in a fresh browser profile or after manually blocking notifications for the site, confirm `/cuenta` shows the disabled state with the "denied" hint instead of a working toggle.
7. **No console errors** throughout.
8. **Cleanup**: remove any test data created during verification (extra follow relationships, disposable accounts) — standard project discipline.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-12-push-notifications-manual-test.md
git commit -m "docs: add manual test checklist for E5.D4 push notifications"
```

---

### Task 11: Apply to prod, update docs

**Files:**
- Modify: `docs/requirements/social-epic.md`
- Modify: `docs/REQUIREMENTS.md`

- [ ] **Step 1: Apply the migration to prod**

Use `mcp__supabase__apply_migration` with `name: "push_subscriptions"` and the exact SQL from Task 1, Step 1 (the tool is pinned to the prod project ref).

- [ ] **Step 2: Verify prod**

Run `mcp__supabase__get_advisors` with `type: "security"` and confirm no genuinely new findings beyond the project's already-accepted pre-existing pattern (a plain self-only-ownership table like this shouldn't introduce anything new at all).

- [ ] **Step 3: Set prod environment variables**

Remind the human to add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to the Vercel dashboard's Environment Variables (Project Settings → Environment Variables) before this reaches prod — same manual step already used for the other API keys per `docs/TESTING.md`.

- [ ] **Step 4: Update `docs/requirements/social-epic.md`**

Mark `E5.D4` as done (`- [x]`) and add a status note matching the style of the other closed EPIC-05 blocks — built + verified in dev (manual checklist), no schema surprises, native push explicitly still deferred.

- [ ] **Step 5: Update `docs/REQUIREMENTS.md`**

Add a dated row to the §9 decision table documenting: the channel-agnostic `push_subscriptions` design (ready for a future native channel without reshaping), the `notify()` hook reusing the exact in-app copy via `NOTIFICATION_TYPE_KEY`, and that native push (iOS+EU via Capacitor/APNs) remains explicitly out of scope pending 7.31 reaching a buildable state.

- [ ] **Step 6: Commit**

```bash
git add docs/requirements/social-epic.md docs/REQUIREMENTS.md
git commit -m "docs: mark E5.D4 done (Web Push notifications)"
```
