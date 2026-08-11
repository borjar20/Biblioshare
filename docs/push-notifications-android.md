# Notificaciones push — Web (VAPID) + Android (FCM)

`[Canónico · verificado 2026-08-05]`

Sistema unificado de notificaciones. **La notificación in-app (`notifications`) es
la fuente de verdad**; los transportes push (Web Push/VAPID y FCM Android) son
entrega secundaria best-effort: si fallan, la acción social original y la
notificación in-app se completan igual.

Firebase se usa **solo** como transporte FCM para Android. Nada de Firestore,
Auth, Storage, Hosting ni Analytics.

## Arquitectura de un vistazo

```
Evento de dominio (follow / reacción / comentario / club / recordatorio…)
  → notify() / notifyMany()            src/lib/social/notifications.ts
      → INSERT en notifications        (fuente de verdad, service_role)
      → dispatcher                     src/lib/push/send-push.ts
          → lee preferencias + push_devices ACTIVOS del destinatario
          → agrupa por canal y reparte:
              WebPushTransport  (VAPID) → navegador  src/lib/push/transports.ts
              FcmAndroidTransport (FCM v1) → WebView Android  src/lib/push/fcm.ts
          → registra salud por dispositivo (last_success / last_error / failure_count)
          → apaga tokens definitivamente inválidos; mantiene los de fallo temporal
```

Detección de plataforma centralizada en `src/lib/push/platform.ts`
(`getNotificationPlatform`, `enable/disablePushNotifications`,
`getPushPermissionState`). El registro nativo vive en `src/lib/push/android.ts`
(se carga por import dinámico: nunca entra en el bundle web).

## Variables de entorno

| Variable | Dónde | Qué es | Secreto |
|---|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel + cliente | Clave pública VAPID (Web Push) | No |
| `VAPID_PRIVATE_KEY` | Vercel (server) | Clave privada VAPID | **Sí** |
| `FIREBASE_PROJECT_ID` | Vercel (server) | ID del proyecto Firebase | No |
| `FIREBASE_CLIENT_EMAIL` | Vercel (server) | `client_email` de la cuenta de servicio | No |
| `FIREBASE_PRIVATE_KEY` | Vercel (server) | `private_key` de la cuenta de servicio | **Sí** |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) | Ya existente; el dispatcher lo usa | **Sí** |

Reglas:

- Los tres `FIREBASE_*` se leen **server-side** en `src/lib/push/fcm.ts`. **Nunca**
  `NEXT_PUBLIC_*`, nunca en el cliente, nunca en `google-services.json`, nunca en el repo.
- `FIREBASE_PRIVATE_KEY` lleva saltos de línea. En una env var se guardan como `\n`
  literales; el código los restaura (`.replace(/\\n/g, "\n")`) antes de firmar. Al
  pegarla en Vercel, deja el valor con `\n` literales entre `-----BEGIN…` y `-----END…`.
- Ponerlas con `vercel env add FIREBASE_PRIVATE_KEY production` (y `preview`/`development`
  si se quiere probar fuera de prod).

`FIREBASE_PRIVATE_KEY` (formato del valor de la env var):

```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...\n...==\n-----END PRIVATE KEY-----\n
```

## Generar la cuenta de servicio (una vez)

1. [Firebase Console](https://console.firebase.google.com/) → crea/abre el proyecto
   (solo se usará FCM).
2. Registra la app Android con el **package name exacto** `app.biblioshare.mobile`
   (coincide con `applicationId` en `android/app/build.gradle` y `appId` en
   `capacitor.config.ts`).
3. Descarga **`google-services.json`** y colócalo en **`android/app/google-services.json`**.
   El `android/app/build.gradle` aplica el plugin `com.google.gms.google-services`
   **solo si ese fichero existe** (si no, el build sigue pero el push no funciona).
4. Project Settings → **Service accounts** → *Generate new private key*. Descarga el JSON.
   De ese JSON salen las tres env vars:
   - `project_id`  → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key`  → `FIREBASE_PRIVATE_KEY`
5. Borra el JSON de tu disco una vez copiadas las env vars (o guárdalo fuera del repo).

Tras poner `@capacitor/push-notifications` y `google-services.json`, sincroniza el
proyecto nativo:

```bash
npx cap sync android
```

## Ubicación de `google-services.json` y qué NUNCA se sube a Git

- `android/app/google-services.json` — **config de cliente** (project number, API key
  de cliente, app id). Va embebida en el APK, no es un secreto. El `.gitignore` de
  Capacitor la deja fuera del repo por defecto (línea `# google-services.json`
  comentada en `android/.gitignore`); si prefieres versionarla, es admisible.
- **La cuenta de servicio (JSON con `private_key`) NUNCA se sube.** Está cubierta por
  `.gitignore` raíz (`*service-account*.json`, `firebase-adminsdk-*.json`,
  `firebase-service-account*.json`). Su clave es lo que permite enviar push como la app.
- `.env*` ya está gitignorado (salvo `.env.example`): ahí viven `VAPID_PRIVATE_KEY` y
  `FIREBASE_PRIVATE_KEY` en local.
- La keystore de release (`*.jks`, `keystore.properties`) tampoco, ya de antes.

## Probar FCM (Android)

Requisitos: `google-services.json` en `android/app/`, `FIREBASE_*` en el entorno del
backend (Vercel, o local con `npx vercel env pull`), y un dispositivo/emulador con
Google Play Services.

1. Compila el APK: `npx cap sync android && npx cap open android` → Run (o `./gradlew assembleDebug`).
2. Inicia sesión en la app. En Ajustes (⚙ del perfil) → activa las notificaciones push.
   Acepta el permiso de Android 13+.
3. Comprueba que se registró el dispositivo:
   ```sql
   select id, platform, enabled, app_version, created_at, last_success_at, last_error
   from public.push_devices where platform = 'fcm_android' order by created_at desc;
   ```
4. Dispara un evento real hacia esa cuenta (que otra cuenta le siga, reaccione o
   comente), o inserta una notificación de prueba. Debe llegar el push nativo.
5. Toca la notificación → la app abre la ruta interna del `data.path` (validada).

Diagnóstico rápido de envío (logs del backend, ya enmascarados):
`FCM: delivery <outcome> (<code>) to <token enmascarado>`.

## Probar VAPID (Web/PWA)

1. Abre la app en un navegador con soporte (Chrome/Firefox/Edge), en **HTTPS**
   (localhost cuenta). El service worker solo se registra en producción
   (`ServiceWorkerRegister`).
2. Ajustes o campana → activa notificaciones. Acepta el permiso del navegador.
3. Verifica el registro:
   ```sql
   select id, platform, enabled, created_at from public.push_devices where platform = 'web_push';
   ```
4. Dispara un evento hacia esa cuenta. El SW (`public/sw.js`) muestra la notificación;
   al tocarla navega a `data.url`.

## Eliminar un dispositivo

- **Desde la app:** Ajustes → desactivar push. En web cancela la suscripción del
  navegador + baja la fila; en Android da de baja el token FCM. Al **cerrar sesión** en
  Android también se baja el token del dispositivo.
- **A mano (SQL):**
  ```sql
  delete from public.push_devices where id = '<device-id>';
  -- o todos los de un usuario:
  delete from public.push_devices where user_id = '<user-id>';
  ```

## Depurar tokens inválidos

El dispatcher **no borra** los tokens muertos: los **apaga** (`enabled = false`) y guarda
la causa, para que se vean en Ajustes como «error de registro» y se puedan inspeccionar.

```sql
-- Dispositivos apagados y por qué
select id, platform, last_error, last_error_at, failure_count
from public.push_devices where not enabled order by last_error_at desc;

-- Dispositivos que acumulan fallos temporales (siguen activos)
select id, platform, failure_count, last_error, last_error_at
from public.push_devices where enabled and failure_count > 0 order by failure_count desc;
```

Clasificación (ver `src/lib/push/fcm-errors.ts`):

- `UNREGISTERED` / `NOT_FOUND` / 404 / `SENDER_ID_MISMATCH` → **inválido** → `enabled = false`.
- `INVALID_ARGUMENT` (payload/config), 401/403 (credencial OAuth), 429 (cuota), 5xx,
  red → **temporal** → se mantiene activo, sube `failure_count`.

Reactivar un dispositivo tras arreglar la causa: `update public.push_devices set
enabled = true, failure_count = 0, last_error = null where id = '<id>';`

## Rotar la clave de la cuenta de servicio

1. Firebase Console → Service accounts → *Generate new private key* (crea una nueva; la
   vieja sigue válida hasta que la revoques).
2. Actualiza `FIREBASE_PRIVATE_KEY` (y `FIREBASE_CLIENT_EMAIL` si cambió) en Vercel.
3. **Redeploy** (las env vars se leen al arrancar; el access token OAuth se cachea en
   memoria del proceso y se re-emite solo con un proceso nuevo).
4. Verifica que llega un push de prueba.
5. En Google Cloud Console → IAM → Service Accounts → Keys, **borra la clave antigua**.

## Añadir APNs/iOS en el futuro sin tocar el contrato

El modelo ya lo contempla; el contrato lógico (`NotificationEvent`, el dispatcher,
`notify/notifyMany`) **no cambia**. Pasos:

1. La enum `push_platform` ya incluye `apns_ios` (misma forma que `fcm_android`: `token`,
   sin campos VAPID). No hace falta migración de esquema.
2. Implementar `ApnsTransport` (`PushTransport`) en `src/lib/push/` y mapearlo en
   `transportFor()` (`src/lib/push/transports.ts`), donde hoy `apns_ios` devuelve `null`.
3. En `platform.ts`/`android.ts`, la rama nativa ya cubre iOS vía Capacitor: el mismo
   `@capacitor/push-notifications` entrega el token APNs en el listener `registration`;
   `registerFcmDevice` se generaliza a `registerNativeDevice(platform, token)`.
4. Registrar la app iOS y los certificados/clave APNs; añadir sus secretos análogos.
5. El resto —preferencias, categorías, dedupe, salud de dispositivo, UI— funciona igual.
