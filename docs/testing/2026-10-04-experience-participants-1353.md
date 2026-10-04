# Experiencias: acompañantes según quien mira (#1353)

> [Histórico · verificado contra el candidato local el 2026-10-04; navegador, revisión independiente y CI pendientes de la integración coordinada]

## Resultado y alcance

El detalle, el álbum de `/experiencias` y las tarjetas del perfil describen a
las personas aceptadas salvo la cuenta que mira. Con Alba organizadora y
Beatriz y Carmen aceptadas, Beatriz lee **Con Alba, Carmen**; Alba lee
**Con Beatriz, Carmen**. Una visita sin sesión no excluye ninguna cuenta ni
confunde `viewerId = null` con una etiqueta de invitado `userId = null`.

El feed conserva su narrativa: su cabecera ya presenta al organizador como
actor y el «Con» de esa tarjeta describe a sus acompañantes. Este contexto
se elige explícitamente mediante `variant="feed"`; el álbum exige un
`viewerId: string | null` en su contrato de props. Se mantiene el límite
visual de tres nombres y la fila de avatares aceptados existente.

Un helper compartido selecciona una sola vez las personas aceptadas y
resuelve nombre de invitado, nombre visible, usuario o la etiqueta traducida
**Acompañante**. Sólo emplea las identidades que las consultas actuales han
devuelto. Desaparece el filtro duplicado de la cabecera y la tarjeta ya no
descarta silenciosamente una identidad sin nombre visible.

Base: `eee8b8c63a7758597f32547b224c415177ae5680`, rama
`codex/experience-participants-1353`, checkout reutilizado
`.claude/worktrees/push1052`. La rama previa `codex/saga-member-coverage-191`
con HEAD `9e7acab` se conserva.

## Fuentes

- `src/components/experiences/experience-companion-names.ts`: selección y nombres.
- `src/components/experiences/experience-detail.tsx`: usa su `e.viewerId` existente.
- `src/components/experiences/experience-card.tsx`: contexto de álbum o feed.
- `src/app/experiencias/page.tsx`: pasa el `user.id` que la ruta ya resolvía.
- `src/app/u/[username]/page.tsx` y `_tabs/experiences-tab.tsx`: pasan el
  `user?.id ?? null` existente hasta la tarjeta, separado del dueño del perfil.
- Tests del render de detalle/tarjeta, del tab de perfil y del paso de contexto
  de la página del perfil.

No cambian consultas de Experiencias, esquema, RLS, acciones, políticas de
caché, dependencias, traducciones ni el mapper social. No se añaden lecturas
Auth por tarjeta, cookies, tokens ni datos de producción. #1354, sobre las
fotos de los momentos, conserva su alcance propio.

## RED conservado

Se renderizaron los componentes reales con las traducciones españolas
reales, sin servidor, navegador ni base de datos. El adaptador de base de
datos del test rechaza cualquier consulta durante el render.

| Paso | Resultado observado | Resultado esperado | Dictamen |
|---|---|---|---|
| Cabecera mirando Beatriz, código de la base | `Con Beatriz, Carmen` | `Con Alba, Carmen` | FAIL material: 1/1 |
| Tarjeta mirando Beatriz, filtro todavía anterior | `Con Beatriz, Carmen` | `Con Alba, Carmen` | FAIL material: 1/2, cabecera ya PASS |

No se sustituyeron estos logs por las pasadas verdes. Tampoco se guardan
copias de las fuentes anteriores: la base Git identifica el código original.

La primera tanda de pruebas del tab dio 26 PASS y 3 FAIL por contexto de
locale ausente en el provider de jsdom. El test resuelve la exportación
cliente de next-intl, mientras Next resuelve su wrapper servidor que aporta
el locale. Se suministró únicamente ese contexto externo en el test,
manteniendo RouteMessages, queries y Card reales. No se modificó el producto
por este fallo de harness. El log inicial también se conserva.

## Verificación final

Runtime explícito: Node **24.19.0**, Next **16.3.8**, Vitest **4.1.11**.
Las guías locales de Server/Client Components y Fetching Data se leyeron
antes de modificar fuentes.

| Check | Resultado | Alcance |
|---|---|---|
| Render y rutas focales | PASS, 29 tests / 3 archivos, 4,11 s | 22 nuevos y 7 existentes |
| Regresión pertinente tras restaurar mutantes | PASS, 111 tests / 17 archivos, 18,20 s | Experiencias, mapper de feed y rutas de perfil; sin skips |
| TypeScript completo, `--noEmit --incremental false` | PASS, exit 0 | Todos los tipos del checkout |
| ESLint de los nueve archivos de fuente/test tocados | PASS, exit 0 | Sin diagnósticos |
| `git diff --check` | PASS | Formato del diff |
| Navegador y build de producción | PENDIENTE | Tanda nativa coordinada; este worker no inicia servicios |
| Revisión independiente y CI | PENDIENTE | Gates de integración/entrega del coordinador |

Los tests observan el texto de la interfaz: organizador, invitada aceptada,
visita ajena y anónima, invitaciones pendientes/rechazadas, invitado sin
cuenta, identidad protegida, recuerdo sin acompañantes y contexto del feed.
La prueba del tab recorre su query y el mapper reales con una base simulada
en la frontera; falla si aparece una consulta Auth nueva. Los tres checks
de página conservan `viewerId` del propietario, visitante o anónimo hasta
la pestaña.

Comandos ejecutados desde este checkout, con
`C:/Users/jasc9/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`:

```text
node node_modules/vitest/vitest.mjs run src/components/experiences/experience-companion-display.test.tsx src/app/u/[username]/_tabs/experiences-tab.test.tsx src/app/u/[username]/page.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose
node node_modules/vitest/vitest.mjs run src/components/experiences src/lib/experiences src/lib/social/feed-experiences.test.ts src/app/u/[username]/_tabs/experiences-tab.test.tsx src/app/u/[username]/page.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/components/experiences/experience-detail.tsx src/components/experiences/experience-card.tsx src/components/experiences/experience-companion-names.ts src/components/experiences/experience-companion-display.test.tsx src/app/experiencias/page.tsx src/app/u/[username]/page.tsx src/app/u/[username]/page.test.tsx src/app/u/[username]/_tabs/experiences-tab.tsx src/app/u/[username]/_tabs/experiences-tab.test.tsx
git diff --check
```

## Sensibilidad causal

Se cambió una sola condición por pasada y se restauraron las fuentes en
`finally`, comprobando el SHA-256 de origen y de restauración. Cada mutante
terminó con exit 1 por las aserciones indicadas; no por fallo de importación
ni transporte. No se suman sus FAIL deliberados a la tanda final.

| Mutante | FAIL detectados | Consecuencia visible |
|---|---:|---|
| Quitar la guarda de `viewerId === null` | 2 | La visita anónima ve sólo `Con Alba`, pierde Luis y Acompañante |
| Quitar aceptación | 2 | Aparece `Con Alba, Carmen, Diana`, siendo Diana pendiente |
| Quitar fallback protegido | 5 | Falta Acompañante en detalle, álbum y feed |
| Página de perfil usa al dueño como viewer | 2 | Sustituye al visitante y al anónimo por `owner` |
| Tab del perfil pasa al dueño a Card | 2 | Beatriz y anónimo leen `Con Beatriz, Carmen` |
| Feed excluye al viewer en lugar de su sujeto | 2 | Repite a Alba en su propia narrativa |

## Evidencia y límites para QA

Artefactos propios en `.scratch/experience-participants1353-20261004/`.
SHA-256:

| Artefacto | SHA-256 |
|---|---|
| `red-detail.log` | `7D2D9A21BC073F0D2500461ADDDA16C6BF0576F3364E312DF72F744C56C2FE24` |
| `red-card.log` | `AAA747A09B68D29066CFE365ACA9AB4CCFE973AAFA48899F4D0CC5CA1EB72FBE` |
| `green-render-routes.log`, FAIL de harness | `FA382B2B4C00CB5686F7D4689BD47F02E1698AD8CE4E1A2E455B74852EB0601C` |
| `green-render-routes-r2.log` | `DB80EEB20A79BE66097D515E36582A76E5366CB639D03B1EE49CE577A56870DF` |
| `green-experiences-regression.log` | `BFECB61332167615A2021F2EFA898063BB3B43F7BF4C7ABBEC117835C8F53400` |
| `mutation-results.json` | `4291721F634D2911124F053D4EC27567AFB1B6CA71A9291E5DA63ECE340C7B6F` |
| `run-mutants.mjs` | `2D7019D9763E0ACA3E2A0DAA31E3ABA6204A2F3DA52781901AA05093BB25444F` |

El JSON de mutantes contiene hashes de los seis logs y de las fuentes
anteriores, mutadas y restauradas. Typecheck y lint tienen logs vacíos y
exit 0; su SHA-256 es `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.

La QA nativa debe recorrer `/experiencia/<id>`, `/experiencias` y
`/u/<organizador>?tab=experiencias` con el organizador y el invitado;
visitar el perfil/detalle compartidos sin sesión cuando sus políticas lo
permitan; conservar el sujeto del feed y el fallback de identidades no
reveladas. Acotar «Con» a la cabecera/tarjeta: la sección de gestión de
participantes sigue mostrando estados de invitación como antes.
Los tests aquí acreditan presentación y paso de contexto; no acreditan
acceso remoto, políticas RLS en ejecución ni una sesión de navegador real.
