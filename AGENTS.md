<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Biblioshare — guía para agentes

Biblioshare es una PWA (Next.js 16 + React 19 + Supabase + Tailwind, en Vercel, con wrapper
Android vía Capacitor) para registrar libros, películas y series. Producción tiene usuarios
reales y su privacidad descansa en RLS. Escribe docs, issues y copy en español.

Este fichero recoge solo lo que aplica a casi cualquier tarea. El detalle vive en los docs que
se enlazan; léelos cuando la tarea toque su terreno, no por adelantado.

## Dónde mirar antes de buscar

- **El repo es la fuente de verdad.** Qué doc manda para qué está en `README.md` («Documentación»
  y «Gobernanza documental»). Cada doc lleva cabecera de frescura: `[Canónico · verificado …]`
  describe el presente; `[Histórico · congelado …]` explica el porqué, no el estado actual.
  `docs/superpowers/specs/` y `plans/` son historia por feature.
- **Para localizar código, consulta antes `docs/architecture/graph.json`** que barrer el repo:
  trae los flujos end-to-end con el fichero de cada paso, las invariantes del proyecto
  (`meta.invariants`) y las trampas por nodo. Es derivado: si contradice al código, manda el
  código. Uso y regeneración en `docs/architecture/README.md`.
- **Antes de depurar algo raro, lee `docs/TRAMPAS.md`.** Vocabulario de dominio en `CONTEXT.md`;
  nombres de cara al usuario en `docs/UI-GLOSARIO.md`.
- **Next.js:** esta versión tiene cambios incompatibles con lo que conoces (ver bloque de arriba).
  Consulta `node_modules/next/dist/docs/` antes de usar una API de Next.

## Esquema y migraciones

Manda `docs/requirements/data-model.md`. Dos trampas que ya han causado bugs en producción:

- El estado vivo del usuario está en **`passes`**. `library_entries` está congelada (sus
  `status`/`position` tienen meses) y `diary_entries` es el nombre antiguo de `passes`.
- «No aparece en `list_migrations`» no significa «no está en prod»: verifica contra los objetos
  reales (`pg_proc`, `pg_class`), no contra el ledger.

Las migraciones van primero a dev (`supabase-dev`), se verifican y después a producción. Cada SQL
nuevo se añade a `supabase/bootstrap/manifest.json` y se ejecuta `npm run db:baseline`.

## Caché y RLS (regla #437)

Un `use cache` mal puesto aquí no es un problema de rendimiento: es una fuga de datos entre
cuentas. RLS filtra por `auth.uid()`, así que el resultado depende de quién pregunta; si se
cachea y se comparte, un usuario recibe filas de otro. No se nota en desarrollo (con una sola
cuenta la caché siempre acierta) y sí en producción.

Una función con `use cache` recibe argumentos escalares y usa `createPublicClient()`
(`src/lib/supabase/server.ts`, rol anónimo), nunca el cliente de la petición. En la PR, responde
por escrito para cada `use cache` nuevo:

1. **¿El dato es igual para un anónimo, para el dueño y para un tercero?** Sí → cacheable. No →
   sin caché, detrás de `<Suspense>`. Depende de la sesión pero tiene vida útil conocida →
   `use cache: private`.
2. **¿Toca, directa o indirectamente, `cookies()`, `headers()` o `searchParams`?** Entonces no
   puede ir cacheada (`next-request-in-use-cache`). El error pasa `next build` y sale en
   `next start`, así que prueba los e2e contra build de producción. Saca el valor fuera y pásalo
   como argumento.

Cachear un agregado público (p. ej. la media de notas de una obra) cambia su semántica de «filas
que el que mira puede ver» a «filas públicas». Suele ser lo deseado, pero se decide de forma
explícita y se registra en `decisiones.md`; no se cuela en un refactor (precedente:
`getRatingSummary`, #436).

## Definición de «hecho»

Un cambio está hecho cuando el doc canónico que lo describe vuelve a ser cierto:

1. **Esquema** (tablas, columnas, RLS, enums, funciones, migraciones) → actualiza `data-model.md`
   en la sección del objeto y con su fecha de verificación. Si añadiste una **columna**, corre la
   superficie 6 de `docs/DRIFT-CHECK.md`: varias tablas tienen grants por columna, y una columna
   sin grant rompe la escritura de toda la tabla. Pasa typecheck y unitarios y falla en
   producción; ha ocurrido dos veces (#375).
2. **Estado de una feature** → marca la casilla en `docs/requirements/backlog.md`. La narrativa de
   cómo se hizo va en una spec de `docs/superpowers/specs/`, no en el backlog.
3. **Decisión de forma o arquitectura** → nueva entrada al final de
   `docs/requirements/decisiones.md`. Es append-only: no reescribas entradas anteriores.
4. **Duda de si la doc coincide con la realidad** → corre `docs/DRIFT-CHECK.md`.
5. **Algo pendiente, dudoso o descubierto de paso** → ábrelo como issue (siguiente sección).

Los docs canónicos describen el presente en su sección. No apiles banners de «Delta …» al
principio de un doc: el registro de verificación va a la evidencia de `docs/testing/` y la
decisión a `decisiones.md`.

## Las issues son el backlog

Todo lo que quede pendiente se abre como issue en `borjar20/Biblioshare`: un fallo descubierto
arreglando otra cosa (en su propia issue, no dentro de la PR en curso), un arreglo parcial, una
sospecha sin confirmar o un trabajo que se decide no hacer. Lo que quede en un `TODO`, en el
cuerpo de una PR o en el resumen de una sesión se pierde. Antes de operar con issues lee
`docs/agents/issue-tracker.md`.

Escribe cada issue para alguien que la lea dentro de seis meses sin tu contexto: qué falla y qué
se esperaba, cómo reproducirlo, qué sí funciona (lo que acota el problema) y las trampas que te
costaron tiempo. Si tienes mediciones, pega la tabla de antes/después.

Si al cerrar una issue su diagnóstico resulta falso, dilo en el cierre: un diagnóstico erróneo
que sobrevive manda al siguiente en la dirección contraria (pasó en #106 y #117).

### Etiquetas: exactamente una de cada dimensión, al crearla

```sh
gh issue create --repo borjar20/Biblioshare --label "area:social,tipo:bug,P1" --title "…" --body-file …
```

| Dimensión | Valores |
|---|---|
| Área | `area:sagas` · `area:clubes` · `area:social` · `area:catalogo` · `area:ui` · `area:infra` · `area:play` |
| Tipo | `tipo:bug` · `tipo:deuda` · `tipo:cobertura` · `tipo:feature` · `tipo:acta` · `tipo:sospecha` |
| Prioridad | `P0` · `P1` · `P2` · `P3` |

| Tipo | Cuándo |
|---|---|
| `tipo:bug` | Hace algo que no debe: puedes escribir «se esperaba X y pasa Y». |
| `tipo:deuda` | Límite asumido a sabiendas o código por ordenar. Funciona hoy; su consecuencia es previsible. |
| `tipo:cobertura` | El código está bien; falta el test que distinguiría una implementación correcta de una rota. |
| `tipo:feature` | Funcionalidad que aún no existe. |
| `tipo:acta` | Se decidió no hacerlo; queda registrado para que nadie lo reimplemente. Ni se hace ni se cierra. |
| `tipo:sospecha` | No reproducido. Se confirma antes de arreglar nada. |

| Prioridad | Cuándo |
|---|---|
| `P0` | Rompe producción, datos o seguridad. Va antes que cualquier trabajo nuevo; si hay muchas a la vez, no todas son P0. |
| `P1` | Bug con víctima real, o algo que hace desconfiar de lo que muestra la pantalla. |
| `P2` | Deuda, cobertura y pulido con consecuencia previsible. Es el valor por defecto. |
| `P3` | Feature, idea o registro. No bloquea a nadie. |

La prioridad la fija el daño a quien usa la app, no lo cerca que esté de lo que estás tocando.

## Higiene del entorno

La máquina local es Windows con 8 GB de RAM y PowerShell. La sesión que ensucia, limpia; si
encuentras el entorno sucio al empezar, límpialo antes de trabajar.

- **Worktrees** (`.claude/worktrees/`): ábrelos solo si necesitas aislar cambios en paralelo y
  quítalos al acabar (`git worktree remove <ruta>`). `git worktree prune` limpia los huérfanos;
  las carpetas que sobrevivan se borran a mano.
- **Un solo `next dev`, en el puerto 3000.** Si 3000 está ocupado, Next salta a 3001 y fallan los
  redirects de Supabase y los e2e. Mata el anterior antes de arrancar:
  `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`, luego
  `Stop-Process -Id <pid>`.
- `npm run test:e2e` reutiliza el servidor que haya; no arranques otro para probar.
- Al terminar no dejes en segundo plano `next dev`, watchers de Vitest ni servidores de Playwright.

## Arte pixel (mascota, BiblioPlay)

Los sprites de `public/pet/` se generan con el MCP `pixellab` mediante el agente `pet-artist`,
siguiendo `docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`. Cada etapa es un
personaje PixelLab con un estado por clase y sprite sheets (`fetch-character.mjs`); la vía de
capas o piezas está probada y descartada. Los candidatos van a `.superpowers/brainstorm/<fecha>/`
y a `public/pet/` solo lo elegido, con los nombres del manifiesto.
