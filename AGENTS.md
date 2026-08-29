<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:biblioshare-docs -->
# Documentación y datos — léelo antes de tocar

**Fuente de verdad = el repo.** El índice y "qué doc manda para qué" está en `README.md`
(sección «Gobernanza documental»). Antes de fiarte de un doc, mira su cabecera de frescura:
`[Canónico · verificado …]` manda; `[Histórico · congelado …]` explica el *porqué*, no el *hoy*.
`docs/superpowers/specs/` y `plans/` son historia congelada por feature, no el estado de hoy.

**Antes de barrer el repo buscando dónde vive algo, mira `docs/architecture/graph.json`.** Es el
mapa de arquitectura en formato máquina: nodos por capa, dependencias y **flujos end-to-end con
el fichero que toca cada paso** (registrar sesión, importar CSV, derivar el mapa de una saga…).
Trae además `meta.invariants` —las reglas duras del proyecto con la evidencia en código— y las
trampas por nodo. Es DERIVADO: si contradice al código, manda el código. Cómo consultarlo y
regenerarlo, en `docs/architecture/README.md`.

**Esquema (dos trampas que ya han dado bugs en prod):** manda `docs/requirements/data-model.md`.
El estado vivo del usuario vive en **`passes`**, nunca en `library_entries` (CONGELADA) ni en
`diary_entries` (renombrada a `passes`).

**Migraciones:** "no aparece en `list_migrations`" **≠** "no está en prod" — verifica contra los
objetos reales (`pg_proc`/`pg_class`), no el ledger. Regla: dev primero (`supabase-dev`), luego prod.

## Caché y RLS: solo se cachea lo que es idéntico para TODO el mundo (regla #437)

**En una app cuya privacidad descansa en RLS, un `use cache` mal puesto no es una regresión de
rendimiento: es una fuga de datos ENTRE CUENTAS.** El resultado de una consulta depende de quién la
hace (RLS filtra por `auth.uid()`); si cacheas esa función y compartes la entrada, le sirves a un
usuario las filas que solo otro podía ver. Y es traicionero porque **no se ve en desarrollo**: con
una sola cuenta abierta la caché acierta siempre y todo parece correcto — sale en producción, que ya
tiene 3 cuentas reales.

Una función con `use cache` recibe **argumentos escalares** y usa un **cliente SIN sesión**
(`createPublicClient()` de `src/lib/supabase/server.ts`, rol anónimo), **nunca el cliente de la
petición**. Al escribir CUALQUIER `use cache`, contesta por escrito en la PR:

1. **¿El dato es el mismo para un anónimo, para el dueño y para un tercero?**
   - **Sí** → cacheable. Cliente sin sesión, argumentos escalares.
   - **No** → no se cachea; se queda detrás de `<Suspense>`.
   - **Depende de la sesión pero con vida útil conocida** → `use cache: private` (cachea en el
     navegador, no en el servidor; no entra en el shell estático).
2. **¿La función, o algo que llama, toca `cookies()`, `headers()` o `searchParams`?** Si sí, no
   compila como cacheada (`next-request-in-use-cache`) — y **pasa `next build` y falla en `next
   start`**, así que prueba los e2e contra build de producción, no solo `next dev`. Extrae el valor
   fuera y pásalo como argumento.

**Cambio semántico que hay que decidir a propósito:** cachear un agregado público (p. ej. la media
de notas de una obra) mueve el cálculo de «sobre las filas que el que mira puede ver» a «sobre las
filas públicas». Casi seguro es lo que se quiere, pero **es un cambio de comportamiento** y se
decide explícito, no se cuela en un refactor de rendimiento (ya pasó con `getRatingSummary`, #436 —
ver `decisiones.md`).

Origen: auditoría Next.js 16, issue #437 (`tipo:acta`). Es el único punto del informe donde el
riesgo no es «va más lento de lo que podría».

## Definición de «hecho»: no cierres un cambio sin sincronizar la doc

Antes de dar por terminado cualquier cambio, repasa:

1. **¿Tocaste el esquema** (tablas, columnas, RLS, enums, funciones, migraciones)**?**
   → actualiza `docs/requirements/data-model.md` y su fecha de verificación.
   **¿Añadiste una COLUMNA?** → corre la superficie 6 de `docs/DRIFT-CHECK.md` (grants por
   columna). Varias tablas tienen `grant` fino y **una columna sin su grant rompe la
   escritura ENTERA de la tabla**, no solo el campo nuevo — compila, pasa el typecheck y
   pasa los unitarios, y revienta en producción. Ha pasado dos veces (issue #375).
2. **¿Cerraste o cambiaste el estado de una feature?**
   → marca la casilla en `docs/requirements/backlog.md`. La narrativa de *cómo* se hizo va en una
   spec de `docs/superpowers/specs/`, **nunca** en el backlog (eso fue lo que lo pudrió antes).
3. **¿Tomaste una decisión de forma/arquitectura?**
   → añade una entrada **al final** de `docs/requirements/decisiones.md` (append-only; no reescribas
   las anteriores).
4. **¿Dudas de si la doc coincide con la realidad?**
   → corre el chequeo de `docs/DRIFT-CHECK.md` (o el comando `/drift-check`).
5. **¿Queda algo pendiente, dudoso o descubierto de refilón?**
   → **ábrelo como issue en el repo.** Ver la regla de abajo.

Regla de oro: un cambio no está "hecho" hasta que el doc canónico correspondiente vuelve a ser cierto.

## Todo lo pendiente vive como issue: las issues SON el backlog

**Si algo queda pendiente, se abre una issue. Sin excepciones.** No vale dejarlo en el cuerpo de una
PR, en un comentario `TODO`, en el resumen de una sesión ni en la memoria del agente: nada de eso
sobrevive a que se cierre la conversación. El repositorio de issues es el backlog operativo del
proyecto — `docs/requirements/backlog.md` sigue siendo el mapa de *features* a medio plazo, pero lo
que está vivo y accionable se rastrea en issues.

Aplica a todo esto, no solo a los bugs:

- **Un fallo que descubres arreglando otra cosa.** No lo encadenes a la PR en curso: la hace
  irrevisable y mezcla dos diagnósticos. Issue aparte con lo que sepas.
- **Un arreglo parcial o con límites asumidos** (p. ej. una solución que solo cubre un navegador).
  Que funcione hoy no lo hace cerrado.
- **Una sospecha sin confirmar.** Vale abrirla diciendo que es una sospecha; lo que no vale es que
  se pierda.
- **Trabajo que decides NO hacer** y por qué. Si merece hacerse algún día, merece una issue.

**Escríbela para quien la lea dentro de seis meses sin tu contexto**, y ten presente que puede ser
lo único que quede. Como mínimo: qué falla y qué se esperaba, **cómo reproducirlo**, qué acota el
problema (qué SÍ funciona), y las trampas que te costaron tiempo. Si tienes un baseline o una
medición, pégalos: una tabla de «antes/después» vale más que un párrafo de prosa.

**Y si el diagnóstico de una issue resulta ser falso, dilo al cerrarla.** Un diagnóstico equivocado
que sobrevive en el repo es peor que no tener issue: manda a la siguiente persona en la dirección
contraria. Ha pasado ya dos veces (#106 y #117): en ambas, lo que la issue daba por causa era un
síntoma que apuntaba a otro sitio.

### Toda issue nace con sus tres etiquetas

Sin etiquetas, 140 issues son un muro: no se puede distinguir «rompe producción» de «pulido que
decidimos no hacer», y el backlog deja de servir para decidir. **Etiqueta al crearla**, en el mismo
comando — ponerlas después no lo hace nadie:

```sh
gh issue create --label "area:social,tipo:bug,P1" --title "…" --body-file …
```

Exactamente **una de cada dimensión**, ni más ni menos:

| Dimensión | Valores |
|---|---|
| **Área** | `area:sagas` · `area:clubes` · `area:social` · `area:catalogo` · `area:ui` · `area:infra` · `area:play` |
| **Tipo** | `tipo:bug` · `tipo:deuda` · `tipo:cobertura` · `tipo:feature` · `tipo:acta` · `tipo:sospecha` |
| **Prioridad** | `P0` · `P1` · `P2` · `P3` |

Qué significa cada tipo, que es donde se falla al elegir:

- **`tipo:bug`** — hace algo que no debe. Si no puedes escribir «se esperaba X y pasa Y», no es esto.
- **`tipo:deuda`** — límite asumido a sabiendas, o código que hay que ordenar. Funciona hoy y su
  consecuencia es previsible.
- **`tipo:cobertura`** — el código está bien; lo que falta es el test que distinguiría una
  implementación correcta de una rota.
- **`tipo:feature`** — funcionalidad que nadie ha construido aún.
- **`tipo:acta`** — se decidió **no** hacerlo, y se registra para que nadie lo reimplemente leyendo
  un mockup viejo. No es trabajo pendiente: es memoria. No se hace ni se cierra.
- **`tipo:sospecha`** — no reproducido. Hay que confirmarlo **antes** de arreglar nada.

Y la prioridad, que es la que se infla sola:

- **`P0`** — rompe producción, datos o seguridad. Se arregla antes de construir nada nuevo. Si hay
  más de un puñado a la vez, no son todas P0.
- **`P1`** — bug con víctima real, o algo que hace desconfiar de lo que la pantalla dice.
- **`P2`** — deuda, cobertura y pulido con consecuencia previsible. **El sitio por defecto.**
- **`P3`** — feature, idea o registro. No bloquea a nadie.

Regla contra la inflación: **la prioridad la fija el daño a quien usa la app, no lo cerca que esté
de lo que estás tocando ahora.** Un `tipo:deuda` que te molesta hoy sigue siendo P2.
<!-- END:biblioshare-docs -->

<!-- BEGIN:biblioshare-cleanup -->
# Higiene del entorno — no dejes basura entre sesiones

Las sesiones dejan worktrees y servidores colgados que se acumulan y provocan errores (puerto
3000 ocupado, RAM agotada en la máquina de 8 GB, worktrees zombis). **La sesión que ensucia,
limpia.** Y si te encuentras el entorno sucio al empezar, límpialo antes de trabajar.

## Worktrees de git (viven en `.claude/worktrees/`)
- Si creaste uno (superpowers / worktree de agente), **quítalo al acabar**:
  `git worktree remove <ruta>` (`--force` si sus cambios ya están integrados o son descartables).
- Barre los huérfanos: `git worktree list` → los marcados `prunable` se limpian con
  `git worktree prune`. Las **carpetas** que sobrevivan en `.claude/worktrees/` tras el prune se
  borran a mano (ni git ni un agente remoto las quitan).
- No abras un worktree nuevo por costumbre: solo cuando de verdad necesites aislar cambios en paralelo.

## Servidores dev y de pruebas (PowerShell)
- **Un solo `next dev`, y en el puerto 3000.** Si 3000 está ocupado por una sesión anterior, Next
  salta a 3001 y ahí empiezan los "errores raros": la app, los redirects de Supabase y los e2e
  esperan 3000. Mata el viejo antes de arrancar; no levantes un segundo.
- Ver quién ocupa el puerto:  `Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess`
- Ver procesos node:          `Get-Process node`
- Matar el que sobra:         `Stop-Process -Id <pid>`   (o `Get-Process node | Stop-Process` para todos)
- `npm run test:e2e` (Playwright) **reutiliza el dev server que ya haya** — no arranques otro solo para probar.
- Al cerrar la sesión, no dejes en segundo plano `next dev`, watchers de Vitest ni servidores de Playwright.

Estado limpio = puerto 3000 libre (o un único `next dev` tuyo) y cero worktrees huérfanos en
`.claude/worktrees/`.
<!-- END:biblioshare-cleanup -->
