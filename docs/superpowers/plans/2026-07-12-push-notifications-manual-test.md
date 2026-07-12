# E5.D4 — Notificaciones push (Web Push) — Manual test checklist

Reemplaza el Task 10 del plan de implementación (verificación automática en
navegador) — según la convención actual del proyecto (`docs/TESTING.md`), este
documento es para que lo ejecutes tú manualmente en un navegador de
escritorio (Chrome o Edge; no hace falta un móvil para las notificaciones push
de escritorio).

## 0. Preparar el entorno

Las claves VAPID se generaron en esta sesión y **no** se han escrito a
ningún fichero ni commit — usa los valores que te reporté en el chat para
añadir `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` a `.env.local`.

```bash
cd .claude/worktrees/push-notifications
npm run dev
```

Si el puerto 3000 ya está ocupado, usa `npm run dev -- -p 3005` (o el puerto
que prefieras) y ajusta las URLs de abajo en consecuencia.

Credenciales de `devtest` (usuario de prueba sembrado): están en `.env.local`
bajo `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` / `TEST_USER_USERNAME`. Para el
paso de entrega necesitarás una segunda cuenta (`/signup`) que pueda
seguir/reaccionar/comentar sobre `devtest`.

## 1. Checklist funcional

### 1.1 — Opt-in

- [ ] Inicia sesión como `devtest`, abre el header y comprueba que aparece un
  nuevo enlace de texto **"Cuenta"** entre "Usuarios" y (si aplica) "Admin".
- [ ] Click en "Cuenta" — aterrizas en `/cuenta`, con el título "Cuenta" y el
  toggle de "Notificaciones push" (apagado por defecto).
- [ ] Click en el toggle. El navegador muestra el prompt nativo de permiso de
  notificaciones. Acepta.
- [ ] El toggle pasa a estado "on" (relleno, círculo a la derecha) sin
  recargar la página.
- [ ] Comprueba en base de datos (dev, `tyvzpuhxfwxrnkcpzxyg`) que existe una
  fila nueva en `push_subscriptions` con `user_id` = el de `devtest` y
  `channel = 'web'`. Consulta de solo lectura, acotada a ese usuario.

### 1.2 — Entrega

- [ ] Desde una segunda cuenta, sigue a `devtest` (genera `new_follower` o
  `follow_request` según si `devtest` es pública o privada), o reacciona/
  comenta una reseña de `devtest` (genera `review_liked`/`review_commented`).
- [ ] Confirma que aparece una notificación real del sistema operativo (fuera
  de la pestaña del navegador) con el mismo texto que mostraría la campana
  in-app para esa misma notificación (compara con `/`  → campana, o con la
  fila nueva en `notifications`).
- [ ] El título de la notificación es "Biblioshare".

### 1.3 — Click-through

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
