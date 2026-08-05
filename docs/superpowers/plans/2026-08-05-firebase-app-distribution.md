# CI: build de Android + Firebase App Distribution en releases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** al publicar un GitHub Release, un workflow de GitHub Actions compila el APK de
Android firmado, lo sube a Firebase App Distribution (grupo `beta-testers`) y lo adjunta
como asset al release.

**Architecture:** un único workflow YAML dispara en `release: published`; usa secrets de
GitHub Actions para la keystore de firma y una cuenta de servicio de Firebase; el
`versionCode`/`versionName` de Android se hacen configurables desde Gradle properties para
que el workflow los derive del tag del release sin tocar `build.gradle` en cada release.

**Tech Stack:** GitHub Actions, Gradle/AGP (Android), Firebase CLI (`firebase-tools` vía
`npx`), `gh` CLI (ya disponible en los runners de GitHub-hosted).

## Global Constraints

- Node **22.23.1** (de `.nvmrc`) para `npm ci` / `npx cap sync android`.
- JDK **21** (coincide con `kotlinOptions.jvmTarget` en `android/app/build.gradle`).
- La keystore de release y sus contraseñas **nunca** se escriben en el repo, solo en
  ficheros temporales del runner, construidos desde GitHub Secrets.
- `FIREBASE_ANDROID_APP_ID` = `1:662274343878:android:9fa66a65468c965e2f68c7` (de
  `android/app/google-services.json`, `client[0].client_info.mobilesdk_app_id`) — no es
  secreto, va literal en el workflow.
- Grupo de testers en Firebase App Distribution: `beta-testers`.
- Spec completo: `docs/superpowers/specs/2026-08-05-firebase-app-distribution-design.md`.

---

### Task 1: `versionCode`/`versionName` configurables desde Gradle properties

**Files:**
- Modify: `android/app/build.gradle:34-35`

**Interfaces:**
- Produces: dos propiedades de Gradle opcionales, `appVersionCode` (entero) y
  `appVersionName` (string), que si se pasan con `-P` sobreescriben `versionCode`/
  `versionName` en `defaultConfig`. Sin pasarlas, el build usa los valores fijos actuales
  (`1` / `"1.0"`) — comportamiento local sin cambios.

- [ ] **Step 1: Cambiar las líneas fijas por lectura de property con fallback**

En `android/app/build.gradle`, sustituye:

```groovy
        versionCode 1
        versionName "1.0"
```

por:

```groovy
        versionCode project.hasProperty('appVersionCode') ? (project.appVersionCode as Integer) : 1
        versionName project.hasProperty('appVersionName') ? project.appVersionName : "1.0"
```

- [ ] **Step 2: Verificar que un build sin properties sigue usando 1 / "1.0"**

Run:
```bash
cd android && ./gradlew assembleDebug
type app\build\outputs\apk\debug\output-metadata.json | findstr /C:"versionCode" /C:"versionName"
```
Expected: `"versionCode": 1` y `"versionName": "1.0"` en la salida.

- [ ] **Step 3: Verificar que las properties sobreescriben el valor**

Run:
```bash
cd android && ./gradlew assembleDebug -PappVersionCode=42 -PappVersionName=4.2.0
type app\build\outputs\apk\debug\output-metadata.json | findstr /C:"versionCode" /C:"versionName"
```
Expected: `"versionCode": 42` y `"versionName": "4.2.0"`.

- [ ] **Step 4: Commit**

```bash
git add android/app/build.gradle
git commit -m "build(android): versionCode/versionName configurables por Gradle property"
```

---

### Task 2: Workflow de GitHub Actions

**Files:**
- Create: `.github/workflows/firebase-app-distribution.yml`

**Interfaces:**
- Consumes: `appVersionCode`/`appVersionName` de Gradle (Task 1); secrets
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`, `FIREBASE_APPDISTRO_SERVICE_ACCOUNT` (deben existir ya en el
  repo — los crea el usuario, ver spec §4; si faltan, el job falla en el paso que los usa,
  con un mensaje de GitHub Actions indicando el secret vacío).
- Produces: un APK firmado subido a Firebase App Distribution y adjunto como asset al
  GitHub Release que disparó el run.

- [ ] **Step 1: Crear el directorio y el workflow**

Crea `.github/workflows/firebase-app-distribution.yml`:

```yaml
name: Firebase App Distribution

on:
  release:
    types: [published]

permissions:
  contents: write

jobs:
  build-and-distribute:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"

      - name: Install deps
        run: npm ci

      - name: Sync Capacitor Android
        run: npx cap sync android

      - name: Setup JDK
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"

      - name: Derive version from tag
        id: version
        run: |
          TAG="${GITHUB_REF_NAME}"
          VERSION_NAME="${TAG#v}"
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
          echo "version_name=$VERSION_NAME" >> "$GITHUB_OUTPUT"
          echo "version_code=${GITHUB_RUN_NUMBER}" >> "$GITHUB_OUTPUT"

      - name: Restore release keystore
        working-directory: android
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > app/release.jks
          cat > keystore.properties <<EOF
          storeFile=${{ github.workspace }}/android/app/release.jks
          storePassword=${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}
          keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          EOF

      - name: Build signed release APK
        working-directory: android
        run: |
          ./gradlew assembleRelease \
            -PappVersionCode=${{ steps.version.outputs.version_code }} \
            -PappVersionName=${{ steps.version.outputs.version_name }}

      - name: Rename APK
        id: apk
        run: |
          NAME="biblioshare-${{ steps.version.outputs.version_name }}.apk"
          cp android/app/build/outputs/apk/release/app-release.apk "$NAME"
          echo "name=$NAME" >> "$GITHUB_OUTPUT"

      - name: Write release notes
        run: |
          cat > notes.txt <<'EOF'
          ${{ github.event.release.body }}
          EOF
          if [ ! -s notes.txt ]; then
            echo "${{ steps.version.outputs.tag }}" > notes.txt
          fi

      - name: Write Firebase service account
        run: echo '${{ secrets.FIREBASE_APPDISTRO_SERVICE_ACCOUNT }}' > firebase-sa.json

      - name: Upload to Firebase App Distribution
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ github.workspace }}/firebase-sa.json
        run: |
          npx firebase-tools appdistribution:distribute "${{ steps.apk.outputs.name }}" \
            --app "1:662274343878:android:9fa66a65468c965e2f68c7" \
            --groups "beta-testers" \
            --release-notes-file notes.txt

      - name: Attach APK to the GitHub Release
        run: gh release upload "${{ steps.version.outputs.tag }}" "${{ steps.apk.outputs.name }}" --clobber
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] **Step 2: Validar la sintaxis YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/firebase-app-distribution.yml'))" && echo OK`
Expected: `OK` (falla con traza si el YAML está mal formado).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/firebase-app-distribution.yml
git commit -m "ci(android): build + subida a Firebase App Distribution al publicar un release"
```

---

### Task 3: Documentación operativa

**Files:**
- Create: `docs/ci-firebase-app-distribution.md`

**Interfaces:**
- Ninguna (documentación pura). Sigue el estilo de `docs/push-notifications-android.md`
  (cabecera de frescura, secciones cortas con pasos numerados).

- [ ] **Step 1: Escribir el documento**

Crea `docs/ci-firebase-app-distribution.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/ci-firebase-app-distribution.md
git commit -m "docs(ci): guía operativa de Firebase App Distribution"
```

---

### Task 4: Registrar la decisión en `decisiones.md`

**Files:**
- Modify: `docs/requirements/decisiones.md` (añadir fila al final de la tabla "Log de
  decisiones (fechado)", línea 278 actual — **no reescribir filas existentes**, es
  append-only)

- [ ] **Step 1: Añadir la fila**

Al final de la tabla (última fila hoy: `2026-07-08 | MVP cerrado como **v1.0**...`), añade:

```markdown
| 2026-08-05 | CI de Android (Firebase App Distribution) firma con secrets de GitHub Actions, no con build local; cuenta de servicio separada de la de FCM (mínimo privilegio) | Automatiza el paso manual de compilar+adjuntar el APK en cada release sin exponer la keystore de release fuera del runner; una cuenta de servicio por uso evita que comprometer una (push o distribución) dé acceso a la otra |
```

- [ ] **Step 2: Commit**

```bash
git add docs/requirements/decisiones.md
git commit -m "docs(decisiones): CI de Firebase App Distribution, firma vía secrets"
```

---

## Self-Review Notes

- **Spec coverage:** §1 disparador → Task 2 Step 1 (`on: release: published`). §2
  versionado → Task 1. §3 pasos del workflow → Task 2 (los 9 pasos del spec están todos en
  el YAML). §4 secrets → documentados en Task 3, consumidos en Task 2. §5 documentación →
  Tasks 3 y 4. §6 fuera de alcance → reflejado explícitamente en Task 3 doc, nada
  implementado de más.
- **Placeholders:** ninguno; todos los pasos llevan el YAML/Groovy/Markdown completo, no
  descripciones.
- **Consistencia de nombres:** `appVersionCode`/`appVersionName` (Task 1) coinciden
  exactamente con `steps.version.outputs.version_code`/`version_name` pasados en Task 2.
  `beta-testers` y el `mobilesdk_app_id` son literales idénticos en Task 2 y Task 3.
