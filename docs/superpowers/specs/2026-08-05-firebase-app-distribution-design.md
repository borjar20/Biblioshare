# CI: build de Android + Firebase App Distribution en cada release

`[Spec]` — 2026-08-05

## Contexto

Hoy el APK de release de Android se compila **a mano** (`./gradlew assembleRelease` local,
firmado con una keystore que vive fuera del repo) y se adjunta manualmente al crear un
GitHub Release (hay uno: `v1.0`, 2026-07-29). No hay `.github/workflows/` en el repo. El
wrapper Android es un shell de Capacitor que carga `https://biblioshare-nine.vercel.app`
por HTTPS (`capacitor.config.ts`, `server.url`) — no empaqueta la web, así que el build de
CI no necesita `next build`, solo compilar el proyecto nativo.

Ya existe un proyecto Firebase (`biblioshare-cab6c`) usado hoy solo como transporte FCM
para push (`docs/push-notifications-android.md`). `android/app/google-services.json` está
commiteado (es config de cliente, no secreto). Este cambio añade un segundo uso de ese
mismo proyecto Firebase: App Distribution para builds de prueba a testers.

## Objetivo

Al publicar un GitHub Release, un workflow de GitHub Actions compila el APK de release
firmado, lo sube a Firebase App Distribution para el grupo de testers `beta-testers`, y lo
adjunta como asset al propio release — sustituyendo el paso manual de adjuntar el APK.

## Diseño

### 1. Disparador

`.github/workflows/firebase-app-distribution.yml`, `on: release: types: [published]`.
Se ejecuta cuando se publica un release en GitHub, igual que se ha hecho a mano con `v1.0`.

### 2. Versionado

`android/app/build.gradle` fija hoy `versionCode 1` / `versionName "1.0"`. Se cambia a leer
de Gradle properties con esos mismos valores como fallback (no rompe builds locales sin
las properties):

```groovy
versionCode project.hasProperty('appVersionCode') ? (project.appVersionCode as Integer) : 1
versionName project.hasProperty('appVersionName') ? project.appVersionName : "1.0"
```

El workflow deriva `versionName` del tag del release (`v1.2.0` → `1.2.0`, se quita la `v`
inicial) y usa `github.run_number` como `versionCode` (entero creciente sin llevar cuenta
manual). Se pasan a Gradle con `-PappVersionCode=$N -PappVersionName=$X`.

### 3. Pasos del workflow

1. `actions/checkout`
2. Node 22.23.1 (de `.nvmrc`) + `npm ci`
3. `npx cap sync android` (mismo paso que documenta `docs/push-notifications-android.md`
   antes de compilar; mantiene el proyecto nativo sincronizado con `package.json`/plugins)
4. JDK 21 (`actions/setup-java`, coincide con `kotlinOptions.jvmTarget` en `build.gradle`)
5. Reconstruir la firma de release en el runner:
   - decodificar `ANDROID_KEYSTORE_BASE64` a `android/app/release.jks`
   - escribir `android/keystore.properties` con `storeFile` (ruta absoluta al `.jks`
     recién escrito), `storePassword`, `keyAlias`, `keyPassword` desde los secrets
     correspondientes — misma forma que ya documenta el comentario de cabecera de
     `android/app/build.gradle`
6. Derivar versión del tag (paso 2) y compilar:
   `cd android && ./gradlew assembleRelease -PappVersionCode=$N -PappVersionName=$X`
7. Renombrar el APK resultante a `biblioshare-$VERSION_NAME.apk` (convención ya usada en
   el asset del release `v1.0`)
8. Subir a Firebase App Distribution vía `npx firebase-tools`:
   `appdistribution:distribute biblioshare-$VERSION_NAME.apk --app $FIREBASE_ANDROID_APP_ID
   --groups beta-testers --release-notes-file notes.txt`
   - `GOOGLE_APPLICATION_CREDENTIALS` apunta a un fichero temporal escrito desde el secret
     `FIREBASE_APPDISTRO_SERVICE_ACCOUNT` (JSON completo de la cuenta de servicio)
   - `notes.txt` = cuerpo del GitHub Release (`github.event.release.body`), o el nombre
     del tag si el cuerpo viene vacío
   - `FIREBASE_ANDROID_APP_ID` = el `mobilesdk_app_id` de `google-services.json`
     (`1:662274343878:android:9fa66a65468c965e2f68c7`) — no es secreto, va literal en el
     workflow
9. Adjuntar el mismo APK al release que disparó el workflow:
   `gh release upload "$TAG" "biblioshare-$VERSION_NAME.apk" --clobber`
   (requiere `permissions: contents: write` en el workflow; usa el `GITHUB_TOKEN`
   automático, sin secret nuevo)

### 4. Secrets nuevos (los crea el usuario, fuera del alcance de este cambio)

| Secret | Contenido | Uso |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 biblioshare-release.jks` | firma del APK |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` de la keystore | firma del APK |
| `ANDROID_KEY_ALIAS` | `keyAlias` de la keystore | firma del APK |
| `ANDROID_KEY_PASSWORD` | `keyPassword` de la keystore | firma del APK |
| `FIREBASE_APPDISTRO_SERVICE_ACCOUNT` | JSON completo de una cuenta de servicio **nueva**, con rol *Firebase App Distribution Admin* en el proyecto `biblioshare-cab6c` (separada de la que usa Vercel para FCM) | subida a App Distribution |

El grupo de testers `beta-testers` se crea una vez a mano en Firebase Console → App
Distribution → Testers y grupos.

### 5. Documentación (regla del `AGENTS.md`)

- `docs/ci-firebase-app-distribution.md` nuevo, mismo estilo que
  `docs/push-notifications-android.md`: qué hace el workflow, cómo crear/rotar la cuenta de
  servicio de App Distribution, cómo gestionar el grupo de testers, troubleshooting de
  fallos de firma o de subida.
- Entrada nueva en `docs/requirements/decisiones.md` (append-only): CI de Android nuevo,
  firma vía secrets de GitHub Actions (no build local), cuenta de servicio de App
  Distribution separada de la de FCM (mínimo privilegio).
- No toca `data-model.md` (sin cambios de esquema) ni `backlog.md` (no es una feature de
  producto de cara al usuario final).

### Fuera de alcance

- iOS (ya documentado como pendiente en `docs/push-notifications-android.md`, requiere
  macOS/runner en la nube).
- Cálculo automático de SHA-256 o redacción automática del resto del cuerpo de las notas
  del release — se sigue escribiendo a mano como hasta ahora.
- Subida a Play Store / Play Console. Solo Firebase App Distribution.

## Testing

No hay lógica de aplicación que testear con Vitest/Playwright — es un workflow de CI. La
verificación es: publicar un release de prueba (o usar `workflow_dispatch` temporalmente
para probar sin crear un release) y confirmar en los logs de Actions que:

1. El APK compila y queda firmado con la clave de release (no la de debug).
2. Aparece en Firebase Console → App Distribution con el `versionName`/`versionCode`
   esperados y llega la notificación a los testers del grupo `beta-testers`.
3. El APK queda adjunto al release de GitHub con el nombre `biblioshare-$VERSION_NAME.apk`.
