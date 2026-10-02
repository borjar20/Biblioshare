# CI de regresiones

> **[Canónico · verificado 2026-10-01 · #836, #1172, #1251]**

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

## Compresión y errores del servidor

La compresión pública pertenece al CDN de Vercel. `compress: false` evita
el middleware Gzip de Next que conserva listeners `drain` ya ejecutados
(#1251); `next start` local sirve respuestas sin comprimir. El smoke local
verifica los recorridos y el streaming, pero no el compresor del CDN.

Antes de publicar este cambio se comprueba el preview exacto y después
producción: `/login` con `Accept-Encoding: br, gzip` debe devolver HTTP 200,
HTML completo y `Content-Encoding: br` o `gzip`; con `identity`, HTTP 200 y
HTML completo sin codificación. Fuera de Vercel se requiere un proxy/CDN que
negocie compresión **sin bufferizar el streaming**. La comprobación HTTP de
codificación no detecta buffering: en ese hosting se prueba además una frontera
Suspense con retraso controlado, comprobando que el shell llega antes de resolver
esa frontera. No se ha verificado aquí ningún hosting ajeno a Vercel. No desplegar
`next start` expuesto sin esa capa y sus dos comprobaciones.

El wrapper falla ante `MaxListenersExceededWarning` de `[Gzip]`, aunque las
aserciones del navegador pasen. Conserva asimismo los controles de lecturas
de petición tardías (#754) e invalidación durante render (#1250); no convierte
todos los avisos en errores ni aumenta el límite de listeners.
Diagnóstico y mediciones: [#1251](2026-10-01-gzip-listeners-1251.md).

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
