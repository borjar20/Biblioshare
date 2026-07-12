# E5.D4 — Notificaciones push (Web Push) — Manual test checklist

Reemplaza el Task 10 del plan de implementación (verificación automática en
navegador) — según la convención actual del proyecto (`docs/TESTING.md`), este
documento es para que lo ejecutes tú manualmente en un navegador de
escritorio (Chrome o Edge; no hace falta un móvil para las notificaciones push
de escritorio).

> **Estado (2026-07-12): 1.1 y 1.2 verificados en dev y prod**, tras
> encontrar y corregir 3 bugs reales durante la verificación (ver §4). 1.3 en
> adelante siguen pendientes de pasar formalmente.

## 0. Preparar el entorno

Las claves VAPID se generaron en esta sesión y **no** se han escrito a
ningún fichero ni commit — usa los valores que te reporté en el chat para
añadir `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` a `.env.local`
(dev) y al dashboard de Vercel (prod, ya confirmado añadido).

**Añadido durante la verificación, no estaba en el plan original**:
`SUPABASE_SERVICE_ROLE_KEY` también hace falta, tanto en `.env.local` (clave
`service_role` del proyecto **dev**, `tyvzpuhxfwxrnkcpzxyg`) como en Vercel
(clave `service_role` del proyecto **prod**, `vmutcradmodhiltuohys` — cuidado
de no confundir una con otra, es el bug real que retrasó la verificación en
prod). Ver §4.3 para el motivo.

```bash
npm run dev
```

Ya no hace falta el worktree — E5.D4 está mergeado en `main`. Si el puerto
3000 ya está ocupado, usa `npm run dev -- -p 3005` (o el puerto que
prefieras) y ajusta las URLs de abajo en consecuencia.

Credenciales de `devtest` (usuario de prueba sembrado): están en `.env.local`
bajo `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` / `TEST_USER_USERNAME`. Para el
paso de entrega necesitarás una segunda cuenta (`/signup`) que pueda
seguir/reaccionar/comentar sobre `devtest`.

## 1. Checklist funcional

### 1.1 — Opt-in ✅ verificado (dev + prod, 2026-07-12)

- [x] Inicia sesión como `devtest`, abre el header y comprueba que aparece un
  nuevo enlace de texto **"Cuenta"** entre "Usuarios" y (si aplica) "Admin".
- [x] Click en "Cuenta" — aterrizas en `/cuenta`, con el título "Cuenta" y el
  toggle de "Notificaciones push" (apagado por defecto).
- [x] Click en el toggle. El navegador muestra el prompt nativo de permiso de
  notificaciones. Acepta.
- [x] El toggle pasa a estado "on" (relleno, círculo a la derecha) sin
  recargar la página.
- [x] Comprueba en base de datos (dev, `tyvzpuhxfwxrnkcpzxyg`) que existe una
  fila nueva en `push_subscriptions` con `user_id` = el de `devtest` y
  `channel = 'web'`. Consulta de solo lectura, acotada a ese usuario.

### 1.2 — Entrega ✅ verificado (dev + prod, 2026-07-12)

- [x] Desde una segunda cuenta, sigue a `devtest` (genera `new_follower` o
  `follow_request` según si `devtest` es pública o privada), o reacciona/
  comenta una reseña de `devtest` (genera `review_liked`/`review_commented`).
- [x] Confirma que aparece una notificación real del sistema operativo (fuera
  de la pestaña del navegador) con el mismo texto que mostraría la campana
  in-app para esa misma notificación (compara con `/`  → campana, o con la
  fila nueva en `notifications`).
- [x] El título de la notificación es "Biblioshare".

### 1.3 — Click-through (pendiente de pasar formalmente)

- [ ] Haz click en la notificación del sistema. Se abre (o enfoca, si ya
  había una pestaña de Biblioshare abierta) la app en la URL correcta —
  p. ej. una notificación de `follow_request`/`new_follower` debe llevar al
  perfil de quien te siguió; una de `review_liked`/`review_commented` debe
  llevar a la reseña correspondiente (con `?tab=community`).

### 1.4 — Opt-out

- [ ] Vuelve a `/cuenta` como `devtest` y apaga el toggle.
- [ ] Comprueba que la fila en `push_subscriptions` para ese usuario
  desaparece.
- [ ] Genera una notificación más hacia `devtest` (p. ej. otro like) y
  confirma que **no** llega ninguna notificación del sistema operativo, pero
  que la campana in-app sigue mostrando la notificación con normalidad (el
  opt-out de push no debe afectar a las notificaciones in-app).

### 1.5 — Permiso denegado

- [ ] En una ventana de incógnito nueva (o tras bloquear manualmente las
  notificaciones para el sitio desde los ajustes del navegador), inicia
  sesión y visita `/cuenta`. En vez del toggle funcional, debe aparecer el
  texto de aviso de permiso bloqueado ("Has bloqueado los avisos para este
  sitio...").

### 1.6 — Navegador sin soporte (opcional)

- [ ] Si tienes acceso a un navegador sin `PushManager`/`Notification` (poco
  probable en desktop moderno), confirma que `/cuenta` muestra el mensaje de
  "no soportado" en vez de un toggle roto. Si no tienes forma fácil de
  probar esto, márcalo como omitido y sigue adelante — no es bloqueante.

### 1.7 — Consola limpia

- [ ] Durante todo lo anterior, no aparecen errores en la consola del
  navegador (F12 → Console) ni en los logs del `dev` server.

## 2. Limpieza

Si creaste una segunda cuenta de prueba o generaste follows/reacciones solo
para este checklist, bórralos al terminar. Deja `devtest` sin suscripción
push activa (haz opt-out) salvo que prefieras dejarla activa a propósito para
verificaciones futuras.

## 3. Si algo falla

Si cualquier punto del checklist no se comporta como se describe, dime
exactamente cuál y qué viste en su lugar (incluyendo cualquier error de
consola o de los logs del servidor) — lo investigamos a partir de ahí en vez
de asumir que la implementación funciona.

## 4. Bugs reales encontrados y corregidos durante esta verificación

Ninguno de estos estaba cubierto por `npx tsc --noEmit`/`eslint` — todos
requirieron probar en un navegador real y/o el build de producción real para
salir a la luz. Documentados aquí por si el patrón se repite en trabajo
futuro de push/service worker.

### 4.1 — Build de Vercel roto: `web-push` se colaba en el bundle de cliente

`notification-bell.tsx` (`"use client"`) importaba `NOTIFICATION_TYPE_KEY`
desde `notifications.ts`, que a su vez importa `send-push.ts` → `web-push` →
módulos nativos de Node (`net`/`tls`) a nivel de módulo. Eso arrastraba una
dependencia server-only al bundle del navegador y rompía el build
(`Module not found: net/tls`). Corregido separando los tipos/constante
puros a `notification-types.ts` (sin dependencias server-only) e importando
desde ahí en el componente cliente. Commit `fe53d8e`.

### 4.2 — Ese mismo build, roto también por claves VAPID ausentes

`webpush.setVapidDetails(...)` corría como side effect a nivel de módulo, que
lanza una excepción síncrona si las env vars no están presentes — tira abajo
la recolección de datos de página de `next build` (todas las páginas
importan `header.tsx` → `notifications.ts`) en cualquier build sin esas dos
env vars visibles en ese contexto exacto. Corregido con configuración
perezosa: solo se llama la primera vez que se intenta un envío real,
devolviendo `false` en vez de lanzar si faltan las claves. Mismo commit
`fe53d8e`.

### 4.3 — El bug real: RLS bloqueaba en silencio la lectura cross-user de `push_subscriptions`

`notify()` corre con el cliente Supabase de la request del **actor** (quien
sigue/reacciona/comenta), pero la política RLS de `push_subscriptions` es
self-only (`auth.uid() = user_id`) — el actor no tiene permiso para leer ni
borrar las suscripciones del **destinatario**. RLS filtra esto en silencio
(sin error, simplemente cero filas), así que `sendPushToUser` nunca
encontraba nada que enviar y no quedaba ningún rastro en los logs.

Aislado confirmando que un envío manual con `webpush.sendNotification()`
usando la misma suscripción y las mismas claves VAPID, pero sin pasar por
Supabase, sí mostraba la notificación — lo que demostró que la suscripción,
las claves y el service worker estaban bien, y acotó el problema a este hueco
de RLS. Corregido con un cliente `service_role` nuevo
(`src/lib/supabase/service-role.ts`), usado solo dentro de
`sendPushToUser` — nunca importable desde código de cliente. Commit
`8ccaad9`.

**Nuevo requisito de entorno derivado de esta corrección**:
`SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (dev) y en Vercel (prod) — ver
§0. La primera vez que se probó en prod, se había pegado por error la clave
`service_role` del proyecto **dev** en Vercel en vez de la de **prod**; el
error de Supabase (`Invalid API key`) fue visible directamente en los logs
de runtime de Vercel y confirmó la causa en segundos.

### 4.4 — Bonus: el listener `push` del service worker no soportaba payloads no-JSON

Detectado al usar el botón de prueba "Push" de Chrome DevTools (que envía un
string plano, no JSON) — `event.data.json()` lanzaba una excepción no
capturada antes de llegar a `showNotification()`. Nuestro servidor siempre
envía JSON válido, así que esto no afectaba al flujo real, pero se corrigió
igualmente por robustez (fallback a texto plano si el parseo JSON falla).
Commit `df44e44`.
