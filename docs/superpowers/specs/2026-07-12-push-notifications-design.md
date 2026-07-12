# E5.D4 — Notificaciones push (Web Push, con esquema listo para push nativo)

Diseño para E5.D4 de `docs/requirements/social-epic.md` — entrega push sobre la tabla
`notifications` ya construida en Bloque D. Implementa **Web Push** (Android, escritorio,
iOS fuera de la UE); el esquema y la capa de entrega quedan preparados para un canal de
push nativo (APNs vía Capacitor, para iOS+UE) sin necesitar rediseño, pero ese canal **no**
se implementa en este bloque — depende de 7.31 (Capacitor) llegar a un estado compilable,
que hoy no lo es en este entorno (sin JDK/Android SDK, sin Mac para iOS).

## 1. Alcance

Entregar como notificación push del sistema operativo cualquiera de los 5 tipos de
notificación in-app ya existentes (`follow_request`, `new_follower`, `follow_accepted`,
`review_liked`, `review_commented`), para los usuarios que hayan activado el toggle en
`/cuenta`. Sin configuración granular por tipo en este MVP (mismo alcance uniforme que las
notificaciones in-app de Bloque D).

**Fuera de alcance**: push nativo vía APNs/Capacitor (canal `ios_native`, reservado en el
enum pero no implementado); entrega con reintentos/cola (`pg_cron` + `push_outbox`) — se
documenta como camino de escalada, no se construye "por si acaso" (§8-D); configuración
por tipo de notificación.

## 2. Modelo de datos

```sql
create type public.push_channel as enum ('web');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel public.push_channel not null default 'web',
  credentials jsonb not null,
  created_at timestamptz not null default now()
);

-- Constraint de tabla no admite expresiones (credentials->>'endpoint' no es una
-- columna) — el UNIQUE va como índice de expresión aparte.
create unique index idx_push_subscriptions_user_channel_endpoint
  on public.push_subscriptions (user_id, channel, (credentials->>'endpoint'));

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions select own" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "push_subscriptions insert own" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "push_subscriptions delete own" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);
```

`credentials` es jsonb específico de canal — hoy solo `web`:
`{ endpoint, keys: { p256dh, auth } }` (la forma nativa de `PushSubscription.toJSON()`).
`channel` solo declara `'web'`; un canal nativo futuro (`ios_native`) sería un
`ALTER TYPE ... ADD VALUE` + una forma distinta de `credentials` (`{ token }`), sin migrar
la tabla. Sin política `UPDATE`: una suscripción cambiada es un delete+insert, no un patch
(el endpoint puede rotar por decisión del navegador).

## 3. Entrega y enganche en `notify()`

**`src/lib/push/send-push.ts`**:

```ts
type WebCredentials = { endpoint: string; keys: { p256dh: string; auth: string } };
type PushPayload = { title: string; body: string; url: string };

async function sendWebPush(
  credentials: WebCredentials,
  payload: PushPayload,
): Promise<{ expired: boolean }> {
  // usa el paquete npm `web-push` + las claves VAPID (§5)
}

export async function sendPushToUser(
  supabase: SupabaseServerClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, channel, credentials")
    .eq("user_id", userId);

  for (const sub of subs ?? []) {
    if (sub.channel === "web") {
      const { expired } = await sendWebPush(sub.credentials as WebCredentials, payload);
      // 410 Gone del push service = el navegador descartó la suscripción → limpiar.
      if (expired) await supabase.from("push_subscriptions").delete().eq("id", sub.id);
    }
    // futuro: else if (sub.channel === "ios_native") await sendNativePush(...)
  }
}
```

**Enganche en `notify()`** (`src/lib/social/notifications.ts`): justo después del insert en
`notifications`, llamada best-effort a `sendPushToUser` dentro del mismo try/catch que ya
absorbe los errores propios de `notify()` — un fallo de push nunca debe romper la acción
real que lo dispara, igual que hoy con el insert in-app.

**URL de destino**: se extrae `resolveReviewHrefs` (Bloque C) a una función de un solo
target, `resolveNotificationHref(supabase, type, actorUsername, targetType?, targetId?)`,
reutilizada tanto por el resolver por lotes de la campana (`listNotifications`) como por
esta ruta de push (un solo target por llamada) — misma lógica, dos granularidades, sin
duplicar los joins a `diary_entries`/`library_entries`/`episode_watches`.

## 4. Flujo de suscripción en cliente

`/cuenta` gana una página índice (hoy solo existe `/cuenta/contrasena`) con una sección
"Notificaciones push" y un componente cliente `PushToggle`:

- **Activar**: `Notification.requestPermission()` → si concedido,
  `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({ userVisibleOnly:
  true, applicationServerKey: <clave pública VAPID> })` → server action `subscribeToPush`
  que hace upsert en `push_subscriptions`.
- **Desactivar**: `registration.pushManager.getSubscription()` →`.unsubscribe()` en
  cliente, luego server action `unsubscribeFromPush` que borra la fila por endpoint.
- **Estado al cargar**: se consulta `registration.pushManager.getSubscription()` para
  pintar el toggle — no hace falta guardar "ya se le preguntó" en servidor, la propia
  suscripción del navegador es la fuente de verdad.
- Si `Notification.permission === "denied"` a nivel de navegador, el toggle se muestra
  deshabilitado con una nota para reactivarlo desde los ajustes del navegador — la app no
  puede volver a pedir el permiso.

## 5. Service worker

`public/sw.js` gana dos listeners nuevos, aditivos a la lógica de caché existente (sin
tocar el precache ni el fetch handler):

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

Reutiliza el icono `/icon-192` ya existente en el manifest — sin asset nuevo. Sin cambio
de `CACHE_NAME`: estos listeners no afectan el precache ni el fetch handler.

## 6. Claves VAPID y secretos

Par de claves generado una vez vía `npx web-push generate-vapid-keys`, siguiendo la
disciplina de secretos ya establecida en el proyecto (`docs/TESTING.md`: las API keys van
directas a `.env.local`/dashboard de Vercel, nunca pegadas en un comando ni comiteadas):

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — segura de exponer en cliente (así identifica el
  navegador qué servidor puede enviar a una suscripción).
- `VAPID_PRIVATE_KEY` — solo servidor, usada por `sendWebPush` para firmar las peticiones
  al push service.

Las claves se generan y se entregan directamente en el chat para que el usuario las añada
a mano a `.env.local` y al dashboard de Vercel — nunca se escriben en un archivo ni se
comitean, mismo trato que las claves de Supabase/TMDB/Google Books ya en el proyecto.

## 7. i18n y testing

**i18n**: namespace `push` nuevo (labels del toggle, aviso de permiso denegado) + entrada
en un namespace `cuenta` para la página índice nueva.

**Testing**: sin batería de impersonación RLS más allá de confirmar el patrón
solo-propio-dueño ya verificado en `notifications`. La verificación real es
inherentemente manual — checklist manual (no subagente de navegador automático, ver
`docs/TESTING.md`), cubriendo: activar el toggle → prompt de permiso del navegador → fila
en `push_subscriptions`; disparar una notificación real (p. ej. una segunda cuenta te
sigue) → llega la push (Chrome/Edge de escritorio la soportan sin necesitar móvil); click
en la push → aterriza en la URL correcta; desactivar el toggle → la fila desaparece y no
llegan más pushes; una suscripción invalidada por el navegador se limpia en servidor en el
siguiente envío fallido (manejo del 410).
