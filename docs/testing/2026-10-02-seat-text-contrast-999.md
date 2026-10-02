# Contraste del texto en los asientos — #999

> **[Verificado contra código, unitarios, estáticos y build/start local el 2026-10-02]**
>
> Base: `030426a` (`origin/main` al crear `codex/seat-contrast-999`).
> Ejecución: Node `v24.19.0`, Vitest `4.1.11`. La QA integrada verifica fuentes
> de `f5963e20d7da57d4041ad7034378fce5bce08646`.

## Hallazgo confirmado y cambio

`SeatToken` pinta las iniciales con `text-surface` sobre el color del asiento.
Las dos tallas usan texto pequeño (14 y 12 px), por lo que necesitan 4,5:1.
La prueba anterior solo exigía 3:1 entre asiento y fieltro: pasaban sus 12 casos
sin comprobar la tinta de la ficha.

El único incumplimiento reproducido era el asiento 5 en claro. Se cambia
`--play-seat-5` de `#9d6f1c` a `#996d19`; su tinta sigue siendo `#fffdf8`.
No cambian los otros cinco colores ni los bloques oscuros. `DESIGN.md` refleja
el valor y el criterio de contraste.

Razones calculadas sin redondear antes de compararlas con el umbral:

| Asiento | Texto en claro antes | Texto en claro después | Texto en oscuro explícito y del sistema, antes = después |
|---|---:|---:|---:|
| 1 | 4,508397 | 4,508397 | 7,545957 |
| 2 | 5,589299 | 5,589299 | 6,608833 |
| 3 | 4,757432 | 4,757432 | 7,494434 |
| 4 | 6,352289 | 6,352289 | 6,199366 |
| 5 | 4,372747 | 4,534193 | 7,329728 |
| 6 | 6,749334 | 6,749334 | 6,311630 |

En oscuro, la tinta real es `--surface: #2a231d`, sobre los colores más claros
de ese tema. El asiento 1 usa `#e6a878`; el 5, `#e0a94a`. Ambos bloques oscuros
declaran los mismos valores.

Se mantienen los suelos existentes del test:

| Comprobación | Suelo | Antes | Después |
|---|---:|---:|---:|
| Asiento 5 contra fieltro claro | 3:1 | 3,276448 | 3,397417 |
| Mínimo asiento contra fieltro claro | 3:1 | 3,276448 | 3,378088 |
| Mínimo asiento contra fieltro oscuro, ambos bloques | 3:1 | 7,396316 | 7,396316 |
| Mínima distancia entre asientos en claro (1 y 5) | ΔE CIE76 ≥ 15 | 19,642307 | 20,360927 |
| Mínima distancia entre asientos en oscuro (4 y 6) | ΔE CIE76 ≥ 15 | 21,966975 | 21,966975 |
| Peligro contra asiento 1 en claro | ΔE CIE76 ≥ 25 | 28,556544 | 28,556544 |
| Peligro contra asiento 1 en oscuro, ambos bloques | ΔE CIE76 ≥ 25 | 34,088329 | 34,088329 |

La distancia CIE76 conserva el criterio propio de la paleta; no es una razón
de contraste de WCAG ni sustituye los nombres y la posición del jugador.

## Diagnósticos que no son ciertos en esta base

- **El asiento 1 no incumple el contraste de texto:** da exactamente
  `4.508396861162232:1`. No se modifica por una aproximación a «4,5».
- **La ficha común ya existe.** `SeatToken` está en
  `src/components/play/ui/seat-token.tsx`. Reloj, Turnos, Recursos y Azar
  comparten `SeatPicker → SeatRow → SeatToken`; Magic usa `SeatRow` y la talla
  pequeña de `SeatToken`, y la hoja de puntuación lo usa directamente.
  No se vuelve a implementar la deduplicación solicitada en #999.
- **La doble alta con Enter se aborda en #995.** No forma parte de este cambio
  de contraste ni se declara corregida por esta prueba.

## Prueba de regresión y resultados

`src/app/contraste-play.test.ts` renderiza el componente real, obtiene la
variable de su fondo y resuelve su utilidad de tinta mediante `@theme inline`.
Comprueba los seis asientos en tallas `md` y `sm`, en claro, `.dark` y oscuro
del sistema. No copia los colores del diseño ni simula `SeatToken`.

| Check | Resultado |
|---|---|
| Test anterior de BiblioPlay, antes de añadir cobertura | PASS — 12/12 |
| Test ampliado con los colores anteriores | **FAIL material** — 29 PASS, 1 FAIL: asiento 5 claro, `4.372747431480539 < 4.5` |
| Test ampliado y suites vecinas de tokens y asientos | PASS — 120/120, 3 ficheros; BiblioPlay contiene 30 casos |
| ESLint del test modificado | PASS — 0 errores y 0 avisos |
| TypeScript del checkout (`--noEmit --incremental false`) | PASS |
| `git diff --check` | PASS |
| Navegador: seis asientos y dos tallas a 320/1280 px | **PASS del helper recuperado** — 72 combinaciones DOM y otras 24 del fallback CSS; el FAIL global previo se conserva |

Comandos reproducibles, con el Node admitido por el proyecto:

```powershell
$node999 = 'C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $node999 node_modules/vitest/vitest.mjs run src/app/contraste-play.test.ts src/app/contraste-tokens.test.ts src/lib/play/ui/seats.test.ts --maxWorkers=1 --no-file-parallelism
& $node999 node_modules/eslint/bin/eslint.js src/app/contraste-play.test.ts
& $node999 --max-old-space-size=2048 node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

La QA usa una configuración real con seis jugadores y obtiene los estilos
computados de las fichas. Los asientos 1 y 5 conservan fondo `#b1602e` / `#996d19`
y tinta `#fffdf8` en claro; fondo `#e6a878` / `#e0a94a` y tinta `#2a231d` en oscuro.
El coordinador inspeccionó las ocho capturas. Es verificación de producción
local; no acredita el entorno desplegado.

## Verificación integrada y recuperación

La tanda `integration-1790939949423` generó un build nuevo con Turbopack desde
las fuentes indicadas arriba, Node 24.19.0 y Next 16.3.8:

| Identidad | Valor |
|---|---|
| Build | `3vVLat3xvkVOXhUZ7q3XJ` |
| SHA256 del manifiesto de referencias de servidor | `e2da93a0e6e631e366ed3536beef730a7caae8c1023b0c87415b1ba23b2d755d` |

Los **14 recorridos permanentes** (12 de #995 y dos de #964) pasan en **19,838 s**,
con cero FAIL, SKIP, flaky o reintentos. Pasan los **245 unitarios en 11 archivos**,
TypeScript, ESLint focal de 19 archivos (dos warnings preexistentes) y el check
de whitespace. Las mediciones DOM del contraste también cumplen, pero la tanda
conserva **GLOBAL FAIL**: el script opcional de analítica devolvió 404/MIME
incorrecto en local y el observador exigía erróneamente prefetch `== 1`.

`contrast-recovery-1790940469196` repite **sólo el helper suplementario** y da
**PASS** sobre el mismo build y manifiesto. No reconstruye la aplicación ni
vuelve a ejecutar los catorce recorridos o los 245 unitarios, y no cambia el
dictamen original.

| Cobertura del helper recuperado | Mediciones |
|---|---:|
| DOM real: 6 asientos × 2 tallas × 3 temas × 2 anchuras (320/1280 px) | 72 |
| Fallback CSS de oscuro del sistema, medido aparte en ambas anchuras | 24 |

El mínimo de las 72 combinaciones es el asiento 1 claro, `4.508396861162232:1`;
el asiento 5 claro da `4.534192836:1`. El mecanismo de clases del tema se restaura
tras comprobar el fallback CSS. No se presenta éste como 24 casos DOM adicionales
de la matriz solicitada.

El helper aísla explícitamente sólo `/_vercel/speed-insights/script.js`: seis
respuestas de JavaScript vacío, sin mock de producto. Observa cero errores de
consola, página o HTTP y clasifica nueve cancelaciones de prefetch mediante
GET/fetch, ausencia de navegación, cabecera RSC, marcador de prefetch y fase
observada. Next 16.3.8 usa valores `1`, `2` y `3` para esa cabecera; no se ignora
`ERR_ABORTED` de forma general. Estas nueve observaciones no reclasifican las
cinco cancelaciones originales de [#1301](https://github.com/borjar20/Biblioshare/issues/1301).

El script local y la limitación de esta recuperación se rastrean en
[#1306](https://github.com/borjar20/Biblioshare/issues/1306). Este cambio de Play
no corrige la analítica ni acredita que no falle en el despliegue de Vercel.

Ambas pasadas conservaron estables las **1719 fuentes** en bytes y texto LF,
sin secretos detectados ni escrituras inesperadas. La DB siguió con cero
usuarios, perfiles, sesiones, refresh tokens, libros, ediciones y pases.
La limpieza dio PASS: Next detenido, Supabase detenido con backup normal y
puerto 3000 libre. El build y su manifiesto permanecieron iguales.

Las copias selladas de estas dos pasadas viven en
`.scratch/ticket-campaign/20261002-resolve-all/qa-evidence/` del checkout raíz.
El coordinador comprobó los hashes de sus **82 artefactos**; los cuatro archivos
de cierre se contrastaron de nuevo al actualizar este informe:

| Tanda | Archivo | SHA256 |
|---|---|---|
| Integración `integration-1790939949423` — GLOBAL FAIL conservado | `result.json` | `bf9cf39c20d1c0981558056fbc67163c17b63292207d2859816e946404e2c460` |
| Integración | `manifest.sha256.json` | `34203790fb74b20c259913fe4f9a0f75e8df1c7cd310e6fa4a37fc2ee704465f` |
| Recuperación `contrast-recovery-1790940469196` — helper PASS | `result.json` | `4a9d3237f0c172fe2c62a1164484e1d54b8ee6c82c0a866c6ae94ce304c62af3` |
| Recuperación | `manifest.sha256.json` | `e6a022382e0f49c66414fbfb9768575f1f4ba5032a383d3e18a993df93d40d0f` |

Esta evidencia acredita el build local indicado y la recuperación acotada.
CI remoto y entrega mediante PR siguen pendientes de la coordinación principal;
no se afirma una reconstrucción ni una verificación de un commit posterior.

## Evidencia conservada

Artefactos locales ignorados en `.scratch/seat-text-contrast-999/`. Se conserva
el RED y el CSS anterior; la pasada con el color final usa ficheros nuevos.

| Artefacto | SHA-256 |
|---|---|
| `before.css` | `b2e0e463cd068905101ce33cb9fdf36f8281dc4947d735fc2a75624a18bc1ef4` |
| `before.json` | `5fd9323f7922b49aa62ce385196471a73335bff8c26036b2b9bc9fda55635635` |
| `red-vitest.log` | `d27c4a5ffb6967872085b7dc24b6240d4ad691a573f728b4df8e685f266e6a1d` |
| `final.json` | `67a5c8c86235c0521a7e6c2e69ee9bb6b23a3c357c2fbeb50a45a40560659de9` |
| `final.css` / `src/app/globals.css` | `fed6484e049d73aa37b1991e9336e351052feda8b1040bb2d321ee5d5222f679` |
| `src/components/play/ui/seat-token.tsx`, sin cambios | `788367531a0822c22a0e67765fde25713bfeddbdde6a08ce24015c73ec84b3d7` |
