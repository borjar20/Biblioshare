# #1278 — original de ImageZoom bajo demanda

> **[Canónico · verificado contra código y build/start local el 2026-10-01]**

## Resultado y alcance

El original ya no se monta al renderizar una ficha, un perfil o una portada de
club. Se monta al pulsar «Ampliar imagen» y se conserva después de cerrar para
reutilizarlo al reabrir. El diálogo nativo mantiene modalidad, nombre accesible,
Escape, cierre por clic y retorno del foco al disparador.

El estado conserva la URL que se pidió abrir. Una URL nueva no se monta antes
de pulsar su disparador. Esta guarda se revisó por lectura; los casos de navegador
no editan `src` durante la vida del componente.

Cambio de producto: `src/components/ui/image-zoom.tsx`. La miniatura, sus tamaños,
el loader, las traducciones y las reglas de acceso siguen siendo los existentes.
La documentación del hero distingue ahora sus dos imágenes visibles del original
que solo aparece al abrir el visor. No hay cambios de esquema ni dependencias.

## Entorno y comandos

- Node 24.19.0, Next 16.3.8, React 19.2.4 y Playwright 1.61.1/Chromium.
- Supabase desechable local: `http://127.0.0.1:54321`; claves solo en memoria.
- Línea base en main `fb8400cd1df54a4c17e81313505305f76500a022`, build
  `fZF9uxyLFIuyuGINpBl-j`; producto corregido en build `NYgySNmOllDNr16gZQKpz`.
- `node node_modules/typescript/bin/tsc --noEmit`.
- `node node_modules/eslint/bin/eslint.js src/components/ui/image-zoom.tsx e2e/ci/image-zoom-loading.spec.ts e2e/ci/hero-images.spec.ts`.
- `node .scratch/ticket-campaign/qa1278/run.mjs baseline|build|prod`.
- El runner ejecuta `next build` o Playwright con la configuración acotada a
  `image-zoom-loading.spec.ts`; Playwright levanta `next start` en localhost:3000
  y lo cierra al acabar. Un worker, cero reintentos.

## Verificación y FAIL conservados

| Control | Dictamen | Evidencia |
|---|---|---|
| Tipos iniciales del test | FAIL | Dos errores de inferencia `UserResponse`; se corrigieron con guards Auth explícitos, sin alterar producto |
| Visor anterior, película móvil | FAIL: 0 PASS / 1 FAIL | Original montado antes de abrir; traza con póster w154 y original w342 |
| Build corregido | PASS | 16,892 s; build `NYgySNmOllDNr16gZQKpz` |
| Primer lote corregido | FAIL: 14 PASS / 2 FAIL | El test exigía una única petición de portada del club durante login/redirección, aunque ya es la URL visible |
| Lote final | PASS: 16 PASS / 0 FAIL / 0 SKIPPED / 0 flaky | 15,620 s de Playwright; 16,176 s totales |
| Tipos y lint finales | PASS | Ambos checks terminaron con exit 0 sobre el código final |
| Limpieza de la pasada final | PASS | Auth 404 y ocho superficies a cero |
| Verificación agregada de todas las pasadas | PASS | Cero obras, clubes, perfiles y usuarios Auth con la marca propia |

La línea base falla por el defecto que se quería distinguir: el diálogo cerrado
contiene `img` y Chromium pide el original w342 antes del primer clic, además de
la miniatura w154. Se conserva `trace.zip` y una extracción que solo contiene URLs
de las imágenes propias. El FAIL inicial de tipos pertenece al test.

Los dos FAIL del primer lote corregido pertenecen al alcance de su aserción de
red: una portada de club ya usa la URL original en el contenido visible. Tras
login/redirección se registraron dos peticiones de esa misma portada en esos
casos; no se pueden atribuir ambas al visor. Se comprueba que la portada visible
se pidió y que `dialog img` no existe antes de abrir; no se fija su recuento global.
Las comprobaciones de los tres orígenes con miniaturas distintas siguen exigiendo
cero peticiones del original antes de abrir y una tras abrir.

## Casos y limpieza

`e2e/ci/image-zoom-loading.spec.ts` queda incluido automáticamente por la
configuración CI (`testDir: ./e2e/ci`). Cuatro consumidores —película TMDB,
libro Google Books, perfil con avatar Storage y club— por dos pantallas
(375×812 y 1280×900, DPR 1) y dos formas de cerrar dan los 16 casos.

Cada caso verifica original ausente antes de abrir, imagen completa visible
al abrir, `dialog:modal`, nombre accesible, cierre, foco y reapertura sin más
peticiones. Los recursos sintéticos propios son SVG de 600×900 interceptados
solo por su marca. El avatar del perfil usa sus dos ramas responsive reales;
el disparador visible es único en cada pantalla.

Se crean dos obras, un club y un actor propios. Los IDs de catálogo/club se
limpian por REST antes de sembrar y después. Se borra el club antes del actor;
Auth devuelve 404 y `profiles`, `pet_state`, `passes`, `pet_acorn_ledger` y
`pet_cosmetics` quedan a cero para ese actor. La lectura agregada comprueba
también cero restos `qa1278-…` de las pasadas que fallaron. No se usa ni borra
ninguna cuenta persistente. El puerto 3000 queda libre tras las pruebas.

Ambos lotes corregidos registran cero `MaxListenersExceededWarning` de Gzip y
cero `The destination stream closed early`. Esto describe estas pasadas;
no cierra las incidencias independientes #1251/#1263. Las capturas conservadas
corresponden al hero después de cerrar el visor, en móvil y escritorio.

## Artefactos y límites

Raíz local ignorada: `.scratch/ticket-campaign/qa1278/`. Evidencia en
`baseline-1790863780316/`, `build-1790863878890/`, `prod-1790863960997/` y
`prod-1790864137272/`, más `types-initial.log`, `baseline-request-summary.json`,
`cleanup-all.json` y `static-checks.json`. `evidence-final.json` registra
21 SHA-256 de código, resultados, logs, traza, limpieza y capturas.

| Fuente | SHA-256 local |
|---|---|
| `src/components/ui/image-zoom.tsx` | `fb891ba50f1f4d8457f9f525d569643194b08eadae623524e003125e5c849269` |
| `e2e/ci/image-zoom-loading.spec.ts` | `5a1929a11d23b3a66bc80bd870ce513d9d58922c36998f9a8050b2e0a2e1eafa` |
| `e2e/ci/hero-images.spec.ts` (comentario de alcance) | `b1abe425d86a36fad689eecdc3f8fb32bb957abd3d46e74765bb92ca9faa72b9` |

Esta evidencia prueba montaje, URL, peticiones y comportamiento del visor en
Chromium contra producción local. No mide bytes ni LCP del CDN, no atribuye
ahorro de red a la portada de club ya visible y no afirma aceptación en producción
remota ni en otros navegadores. La lógica nativa del diálogo conserva sus estilos
y sus handlers de cierre anteriores.
