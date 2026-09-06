# CI de regresiones

> **[Canónico · implementación 2026-09-06 · #836]**

`.github/workflows/tests.yml` corre en cada pull request y push a main:

- `quality`: Node 22, instalación desde lockfile, lint de archivos modificados,
  typecheck completo y suite Vitest completa, un worker.
- `critical-flows`: Supabase local desde cero, verificación del esquema, build
  de producción y Playwright contra `next start`. Prueba login real, filtros
  del cuaderno a 390 px (regresión #833), entrada en Colección y persistencia
  de una partida anónima tras navegar y recargar.

Sin secrets remotos ni cuenta compartida: la cuenta es sintética y desechable;
el helper comprueba el borrado incluso si falla el test. Cada job destruye su
base local al terminar. Los fallos del navegador conservan informe, screenshot
y trace siete días; no se usan reintentos para convertir rojos en verdes.
El workflow tiene únicamente `contents: read` y cancela ejecuciones superpuestas.

## Repetir en local

Preparar y arrancar la base como en [supabase-local.md](supabase-local.md).
Con Node 22 y `supabase` en PATH (o `SUPABASE_CLI` apuntando a su ejecutable):

```sh
npm run test:ci:build
npm run test:ci:smoke
```

El wrapper lee las claves de la instancia local del checkout y las pasa solo a
los procesos hijos; no lee ni modifica archivos de credenciales. El config de
Playwright rechaza destinos remotos y nunca reutiliza un servidor existente.
No arrancar otro servidor en 3000. Los specs `e2e/ci` están excluidos del config
de dev para no ejecutar fixtures locales contra una cuenta compartida.

## Límites explícitos

La base del 2026-09-06 (`5c6e501`) tiene 22 errores y 26 avisos de lint en 1624
archivos versionados; deuda en #856. `test:ci:lint` sin CI_LINT_BASE mide toda
esa superficie y termina en FAIL. En CI, CI_LINT_BASE contiene el SHA de base
del evento: se exige lint limpio en todos los archivos modificados, incluidos
errores antiguos si se toca ese archivo. No se desactivan reglas ni se oculta
el fallo de la medición completa. Los artefactos no versionados quedan fuera.

El job de navegador es un conjunto crítico explícito, no toda la suite de dev.
Los 20 fallos históricos sin atribución de #919 y las semillas remotas de otros
specs siguen pendientes. Un job verde no demuestra que esas pruebas pasen.
Convertir estos checks en obligatorios para merge requiere configurar las reglas
de la rama en GitHub; este cambio solo publica los checks y sus resultados.
