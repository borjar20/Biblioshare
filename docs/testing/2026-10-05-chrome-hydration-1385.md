# #1385: ruta y sesión del chrome tienen límites de hidratación independientes

> **[Canónico · verificado contra código, revisión independiente, build/start local y entrega a main el 2026-10-05; MTG 2/2 y retorno 2/2 PASS; CI integrada PASS; auditoría global y gate FULL históricos FAIL]**

El candidato separa la espera de `usePathname` de la espera de sesión de
Header, BottomNav y la compañera. La regresión discrimina las dos topologías:
el límite compartido recupera dos discrepancias de HTML al navegar a una
pantalla completa con sesión pendiente; el límite separado retira las barras
sin recuperación. Una compilación nueva del pin `e5fdb395` pasa después los
dos casos originales de MTG y los dos controles de retorno. La auditoría
global conserva sus fallos; la entrega posterior pasa la CI integrada y se fusiona en main8424.

## Evidencia que motivó el cambio

El spec original `e2e/ci/play-seat-interactions.spec.ts:251` conserva sus
guardas de salud del navegador. En la build anterior, MTG/Commander → Duelo →
Empezar produjo dos errores React `#418` con argumento `HTML` en
`/partida/activa`. La pasada anónima de diagnóstico a 390px conserva ese
`FAIL`; la investigación previa también había observado el fallo a 1280px.

En las dos pausas de hidratación, el nodo HTML sobrante (`rq`) era,
respectivamente, el `HEADER` real y el `NAV` inferior. Ambos pertenecían a un
`Suspense` directamente bajo el contenedor de AppShell, con hidratación activa
y `documentPathname=/partida/activa`. La captura localiza el error en el
chrome; no registra el valor del hook ni todos los índices de la frontera y
no demuestra que el provider o el actor de celebraciones causen el fallo.

Se conserva el probe nativo en:

```text
.scratch/ticket-campaign/20261004-continue/hydration1385-native-r1/original-probe-r1/
  original-native.log
  browser-journal.ndjson
  fiber-captures/hydration-pause-001.json
  fiber-captures/hydration-pause-002.json
  manifest-final.sha256.json
```

SHA-256 del manifiesto original comunicado por la investigación:
`c73cb957722bd402630152ea116e15251dddfb9dc362277b73787b575b66e6a8`.

## Cambio acotado

`ChromeBoundary` se usa para las tres piezas en `app-shell.tsx`:

```text
Suspense externo (resolución de ruta)
  ChromeGate
    Suspense interno (payload de sesión)
      SessionChrome / SessionNav / SessionCompanion
```

El `Suspense` externo sigue siendo necesario: la guía instalada de Next
16.3.8 indica que `usePathname` puede suspender con Cache Components en rutas
con parámetros que no se conocen al prerenderizar. El límite interno deja
que el gate se hidrate aunque el payload de sesión aún no se haya entregado.
Así puede desmontar esa frontera al entrar en una pantalla completa.

Los dos límites reciben el fallback que ya tenía cada pieza. Se mantienen
`HeaderSkeleton`, `BottomNavSkeleton` y el fallback `null` de la compañera;
las clases que reservan altura no cambian. El landmark principal,
`SkipLink` y `SessionCelebrationActor` siguen fuera del gate. No se modifica
la lectura de identidad, el actor, el provider, el consumidor ni el arte.

## Regresión durable y RED → GREEN

`src/components/nav/chrome-boundary.test.tsx` ejecuta el helper real que usa
AppShell, `ChromeGate`, el JSX del Header real y `BottomNav`. Usa
`renderToString` y `hydrateRoot` de React DOM 19.2.4. El Header anónimo se
resuelve antes de entregar su JSX; traducciones y campana son fronteras
declaradas del test.

El recurso de sesión tiene HTML resuelto en servidor y una promesa retenida
en cliente. La ruta usa un store controlado: cada lectura devuelve la ruta
vigente y los gates ya montados se suscriben a cambios. Es una costura para
el orden de hidratación; no es la implementación del router de Next. El
test no ejecuta Auth, transporte RSC ni el streaming de una build de Next.

Una barrera interactiva bajo `main`, con estado propio, confirma que los
handlers exteriores ya funcionan mientras la sesión sigue retenida. Antes
de navegar se comprueba que el HTML de ambas barras conserva sus nodos del
servidor. Después se cambia la ruta sin reconstruir el árbol del shell.

En GREEN, el test exige que los tres gates hayan hecho commit **antes** del
cambio de ruta, que ambas barras se hayan retirado **antes** de liberar la
sesión y que, tras liberarla, no haya recuperación ni `console.error`.
La consola se observa sin suprimirla y todos los errores recibidos por
`onRecoverableError` deben ser cero.

Para el RED se extrajo el límite original sin cambio semántico:
`Suspense → ChromeGate → payload`. Se conservó el test y sólo se retiró el
`Suspense` interno del helper. Tanto la navegación a `/partida/activa` como
la navegación a `/mascota` fallaron con exactamente dos errores descriptivos
de hydration mismatch y diffs de HTML sobrante `- <header>` y `- <nav>`.
Los otros tres controles pasaron. No se presenta este mensaje de React DOM
de desarrollo como una nueva captura binaria del `#418` de producción.

| Caso | Límite compartido (RED) | Límite separado (GREEN) |
| --- | --- | --- |
| Setup → `/partida/activa`, sesión retenida | FAIL: sobran Header y Nav | PASS: retirada antes de liberar sesión, cero errores |
| Setup → `/mascota`, sesión retenida | FAIL: sobran Header y Nav | PASS: retirada antes de liberar sesión, cero errores |
| Ruta normal, sesión retenida y después liberada | PASS | PASS: conserva los mismos nodos SSR |
| Pathname retenido, `main` interactivo y posterior liberación | PASS | PASS: cero errores y barras presentes |
| Pantalla completa inicial con las tres piezas | PASS | PASS: ninguna lectura de sesión ni fallback |

El hash del test es idéntico en la comparación final `red-r4` / `green-r2`:
`d2df3d54a23e182d734ce75f3e7d7a7df2cd61dc9b891cec70be5bf9165cb674`.
El hash de AppShell también coincide entre ambos; la variable cambiada
es exclusivamente el límite interno del helper.

## Checks del candidato

| Check | Resultado |
| --- | --- |
| Regresión final con el límite compartido (`red-r4`) | FAIL previsto: 2 FAIL / 3 PASS |
| Regresión final con el límite separado (`green-r2`) | PASS: 5/5 |
| Regresión + navegación + rutas fullscreen | PASS: 3 archivos / 31 pruebas |
| ESLint de AppShell, helper y regresión | PASS |
| TypeScript focal de los tres fuentes y sus importaciones | PASS |
| Diff sin errores de espacios | PASS |
| Revisión fresca independiente | PASS: 5 regresiones, 34 controles estáticos, cero hallazgos |
| Spec MTG original sobre build/start nuevo | PASS: 390px y 1280px, 2/2, retry0, guardas intactas |
| Retorno desde partida activa por historial | PASS: 390px y 1280px, 2/2, retry0 |
| Diario global de navegador | FAIL conservado: 16 GET RSC cancelados sin clasificación; cero pageerror, console.error y HTTP>=400 |
| Freeze de fuentes y archivos compilados previos | PASS: 3272 fuentes y 2445 archivos generados originales idénticos |
| Gate de inventario completo de `.next` | FAIL conservado: 56 archivos nuevos en `server/route-cache` |
| Parada física independiente | PASS: procesos propios, perfiles, pilas y puertos libres; backup y volúmenes conservados |

Invocación focal de pruebas:

```text
node node_modules/vitest/vitest.mjs run src/components/nav/chrome-boundary.test.tsx src/components/nav/fullscreen-routes.test.ts src/components/nav/navigation.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

ESLint se ejecutó sólo sobre los tres fuentes cambiados. TypeScript usó una
configuración temporal de evidencia que extiende el `tsconfig.json` del
proyecto, incluye esos tres fuentes y `next-env.d.ts`, y desactiva el estado
incremental. No se alteró la configuración del repositorio.

## Evidencia y límites de entrega

Todos los intentos permanecen bajo
`.scratch/ticket-campaign/20261004-continue/fix-chrome1385-r1/`. Cada pasada
guarda los fuentes antes de ejecutar, sus hashes, el log y el resultado.

- `red-r1`: `HARNESS_FAIL`; el estado de la primera barrera vivía en el
  padre y reconstruía las props del chrome antes de navegar. No se cuenta
  como reproducción de la issue.
- `red-r2`: `NO_RED`; una transición por estado/contexto del padre pasó con
  el límite original. No era una prueba discriminante del orden buscado.
- `red-r3` y `red-r4`: RED material, con los dos sobrantes HTML por caso.
- `green-r1` y `green-r2`: GREEN tras separar los límites; `green-r2`
  corresponde a las aserciones temporales finales y a las 31 pruebas.
- `checks/tsc-result.json`: `HARNESS_FAIL` inicial porque la configuración
  focal omitía las declaraciones globales de CSS de `next-env.d.ts`.
  `checks/tsc-r2-result.json` conserva el PASS después de incluir ese archivo
  existente. Los dos TS2307 originales y su explicación no se borraron.

El handoff del autor partió de `2c487a8d74a06acf8a7026d0ac35ee42fbe2fa84` en
`codex/chrome-hydration-1385`, sin servicios ni operaciones Git o remotas. El
coordinador recibió después la revisión independiente y guardó el pin
`e5fdb395d20e97c5b6b99378c24389ba60ceca65` antes del runtime siguiente.

## Verificación Native y límites del corte e5fdb395

La revisión fresca conserva cero hallazgos, cinco regresiones PASS, 34 controles
estáticos y fuentes idénticas. Su manifiesto es
`b5468085d4459611497ee46c1be48dfc4c05dae0caa4d72c635f6129d35dfc27`.

La ejecución única usa Node24.19, Next16.3.8 y el backend local 966 con ledger291
y censo vacío. Construye desde una `.next` nueva la build
`rS5hN2l856Bf-eL5iOPir`; la build anterior se conserva aparte. No hay actores,
semillas, CDP, interceptación de red/almacenamiento, imports de producto ni
cambios en el spec original. Sus dos casos pasan en 3616ms y los dos controles
estrechos de retorno en 1934ms, sin SKIP, flaky, repeticiones ni reintentos.

El diario observa los cuatro contextos hasta su cierre: cero errores de página,
consola y HTTP>=400. Conserva 16 `GET` de tipo `fetch`, `?_rsc` y `ERR_ABORTED`:
seis en MTG móvil, siete en escritorio y tres en el control móvil. Permanecen
sin clasificación causal en el alcance de #1301; no se añade una allowlist ni
se afirma una auditoría global limpia.

El supervisor también conserva un FAIL material de su gate de inventario
completo: `.next` pasa de 2445 a 2501 archivos. La inspección posterior encuentra
56 añadidos exclusivamente en `server/route-cache`, cero modificados o
eliminados. Los 2445 hashes previos, incluidos 792 ejecutables, BUILD_ID y
manifiestos de rutas/referencias permanecen idénticos. Next instalado define y
escribe esa caché; la forma observada es compatible con ese mecanismo, sin
trazar cada escritor ni auditar payload o privacidad de la caché. Este
diagnóstico no convierte el gate original en PASS. Las 3272 fuentes conservaron
el hash de inventario
`477c6d966a4af15f7f7bbf959ae37a1eda040202b5a552cb7da48d480926c384`.
La auditoría de build encuentra cero ocurrencias de service_role; el anon
público se pasa intencionalmente a la build. No se leen archivos `.env`.

Antes de parar, el ledger conserva 291 pasos y el censo de
Auth/sesiones/perfiles/pases/partidas/jugadores continúa vacío. Un recibo
independiente posterior acredita parada normal con backup, 40 volúmenes previos
conservados, nueve PIDs propios ausentes, cero perfiles Playwright,
cero contenedores activos y puertos
3000/3001/9222/54320–54329 libres. SHA del recibo:
`a438b86b8d3ce5a66ef332b19064ee83f1cf088a48c47c4901762d8b842bd08b`.

Ejecución sellada bajo
`.scratch/ticket-campaign/20261005-resume/qa-chrome1385-native-r1/execution-r1/`,
manifiesto `dc0205bba68d0079775c55f90056e6c6058370643dc2687e4c9f04c682033c97`;
diagnóstico posterior en `postrun-diagnostic-r1/`, manifiesto
`af3813f0e2cd1ebe8cf2135d3b3c909e995febe1d840c36c4a15178d36078c14`.
No hubo otro runtime.
Estos PASS focales acreditan Chromium anónimo local; no miden geometría del
fallback, Android, Auth real ni producción. La entrega posterior queda
verificada en [el corte integrado de #1334/#1369/#1385](2026-10-05-celebrations-main-integration-1334.md):
PR #1407 y #1372 fusionadas con CI verde, PR #1364 fusionada en main
`8424eeccd1e906cb9fcf93d309832cdc927fb3f0` y CI final de 496 archivos/4873
unitarios, 20+9 contratos Node, 298 pasos SQL y 168/168 recorridos PASS.
GitHub registra el despliegue de ese commit y la URL habitual carga el
consumidor nuevo; ese check público no acredita presentación autenticada.
El delta documental posterior conserva las mismas fuentes ejecutables del
pin Native y todos los FAIL y límites anteriores.
