# CI de regresiones

> **[Canónico · verificado 2026-09-30 · #836, #1172]**

`.github/workflows/tests.yml` corre en cada pull request y push a main:

- `quality`: Node 22, instalación desde lockfile, lint completo con `npm run lint`,
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

La deuda de lint de #856 y #1172 se corrigió el 2026-09-30: el informe completo
contiene 0 errores y 28 avisos en 1833 archivos. CI exige ahora cero errores en
toda la superficie, incluso en archivos que la PR no toca. Los avisos siguen
visibles; no se desactivaron reglas. ESLint excluye el andamiaje efímero de
`.superpowers/`, `.scratch/` y los resultados de compilación de Android, además
de las exclusiones de generación que ya existían. El código fuente sigue incluido.
La medición anterior se conserva en la evidencia de
[#1172](2026-09-30-lint-baseline.md).

El job de navegador es un conjunto crítico explícito, no toda la suite de dev.
Los 20 fallos históricos sin atribución de #919 y las semillas remotas de otros
specs siguen pendientes. Un job verde no demuestra que esas pruebas pasen.
La protección de `main` exige checks correctos y una rama actualizada con la base;
se comprobó durante la entrega de #1204. El workflow publica los resultados,
pero no modifica esa configuración de GitHub.
