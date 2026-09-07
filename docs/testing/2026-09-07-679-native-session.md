# Sesión Android cifrada (#679)

[Canónico · verificado 2026-09-07 en emulador Android 16 / API 36]

El código cifra la sesión con AES-256-GCM y Android Keystore, migra las
preferencias antiguas a noBackupFilesDir y excluye backup/transferencia.
El origen HTTP se restringe al proyecto de producción y no sigue redirecciones.

## Verificación

Con JDK 21 y el emulador desechable `codex679`:

`android/gradlew.bat -p android :app:connectedDebugAndroidTest :app:testDebugUnitTest --no-daemon --max-workers=2`

- 64 tests JVM: cifrado, integridad, widgets existentes y origen permitido.
- 8 tests instrumentados: almacenamiento cifrado, migración y corrupción,
  tombstone ante fallo de limpieza, reemplazo de clave incompatible, pérdida de
  clave, logout con lectura fallida, concurrencia refresh/logout y contexto APK.
- La concurrencia usa latches, comprueba que logout bloquea durante el refresh y
  termina sin sesión. El transporte HTTP se sustituye en memoria: cero llamadas
  de autenticación reales. Comprueba también rechazo del origen externo antes
  de conectar y redirecciones desactivadas.
- El primer intento instrumentado falló por UID incorrecto del harness y un
  identificador antiguo de la plantilla; se corrigieron ambos. Evidencia local:
  `.superpowers/679-instrumentation-red/`.
- La nueva regresión `signOutClearsEvenWhenSessionReadFails` falló antes del fix
  con ProviderException y pasó después. Evidencia local:
  `.superpowers/679-logout-read-red/`.

## Límite de entrega

Esta verificación usa un APK debug instalado solo en un emulador desechable.
No se han usado credenciales reales, firmado una release ni distribuido una APK.
Las instalaciones existentes requieren una actualización: pendiente en #679.
No elimina copias históricas externas ni modifica cookies del WebView.
