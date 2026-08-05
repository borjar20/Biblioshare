# CI: build de Android + Firebase App Distribution

`[Canónico · verificado 2026-08-05]`

Al publicar un GitHub Release, `.github/workflows/firebase-app-distribution.yml` compila
el APK de release firmado, lo sube a Firebase App Distribution (grupo de testers
`beta-testers`, proyecto `biblioshare-cab6c`) y lo adjunta como asset al propio release.
No dispara con tags sueltos ni con pushes normales, solo al **publicar** un release.

## Secrets necesarios (GitHub → Settings → Secrets and variables → Actions)

| Secret | Contenido |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 ruta/a/biblioshare-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | contraseña de la keystore |
| `ANDROID_KEY_ALIAS` | alias de la clave dentro de la keystore |
| `ANDROID_KEY_PASSWORD` | contraseña de la clave |
| `FIREBASE_APPDISTRO_SERVICE_ACCOUNT` | JSON completo de la cuenta de servicio de App Distribution (ver abajo) |

Los cuatro primeros son los mismos valores que ya usas en tu `android/keystore.properties`
local — cópialos tal cual, no generes una keystore nueva.

## Crear la cuenta de servicio de App Distribution (una vez)

Separada de la que usa Vercel para FCM push (`docs/push-notifications-android.md`):
mínimo privilegio, si se filtra una no compromete la otra.

1. [Google Cloud Console](https://console.cloud.google.com/) → proyecto `biblioshare-cab6c`
   → IAM y administración → Cuentas de servicio → **Crear cuenta de servicio**.
2. Nombre sugerido: `github-actions-appdistribution`.
3. Rol: **Firebase App Distribution Admin** (buscar por ese nombre exacto).
4. Claves → Agregar clave → Crear clave nueva → JSON. Descarga el fichero.
5. `gh secret set FIREBASE_APPDISTRO_SERVICE_ACCOUNT < ruta/al/json/descargado.json`
6. Borra el JSON de tu disco una vez copiado (o guárdalo fuera del repo).

## Crear el grupo de testers (una vez)

[Firebase Console](https://console.firebase.google.com/) → proyecto `biblioshare-cab6c` →
App Distribution → pestaña **Testers y grupos** → crear grupo `beta-testers` → añade los
correos de los testers. Añadir/quitar testers se hace aquí, sin tocar el workflow.

## Probar el workflow

Publica un GitHub Release de prueba (puede ser un pre-release). El job debe:

1. Compilar sin errores y producir un APK **firmado con la clave de release**, no la de
   debug — compruébalo en los logs del step "Build signed release APK": si
   `keystore.properties` no llegó bien, Gradle avisa con
   `keystore.properties no encontrado: el APK de release saldra SIN FIRMAR.`
2. Aparecer en Firebase Console → App Distribution con el `versionName`/`versionCode`
   esperados, y notificar a los testers del grupo `beta-testers`.
3. Quedar adjunto al release de GitHub como `biblioshare-<versionName>.apk`.

## Rotar la cuenta de servicio

Igual que la de FCM (`docs/push-notifications-android.md`): genera una clave nueva en
Google Cloud Console → IAM → esa cuenta de servicio → Claves, actualiza el secret
`FIREBASE_APPDISTRO_SERVICE_ACCOUNT` con `gh secret set`, y borra la clave antigua una vez
confirmado que un release nuevo sube bien con la clave nueva.

## Fuera de alcance

- iOS (requiere macOS/runner en la nube, ver `docs/push-notifications-android.md`).
- Subida a Play Store / Play Console.
- Cálculo automático de SHA-256 o del resto de las notas del release — se escriben a mano
  al crear el release, como hasta ahora.
