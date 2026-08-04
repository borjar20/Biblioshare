# Baseline de rendimiento

> **[Canónico · método verificado el 2026-08-04]** La captura de campo de abajo está
> **congelada a propósito**: el plan Hobby de Vercel solo guarda **7 días**, así que estos
> números **ya no se pueden volver a consultar**. Si esta cabecera dice una fecha vieja, es
> que la captura es histórica — vuelve a correr los scripts para tener la de hoy.

Referencia de partida para la migración a Cache Components / Instant Navigation (issue #448).
Sin esto, «va más rápido» es una impresión.

## Por qué hay dos vías

**Porque el campo no llega.** Medido el 2026-08-04: **159 muestras de LCP en 6 días** para toda
la aplicación, y muy mal repartidas — `/` tenía 89 y `/clubes` y `/estadisticas` **una cada
una**. Un p75 sobre una muestra es esa muestra.

Justo esas dos páginas son las de la Fase 2 (#438 y #440), así que **el RUM nunca podrá
demostrar que sus arreglos funcionaron**. De ahí la segunda vía.

| | Qué mide | Para qué sirve | Para qué NO |
|---|---|---|---|
| **A · Campo** (`scripts/perf-baseline.mjs`) | Usuarios reales, producción | Tendencia global y TTFB | Comparar rutas con poco tráfico |
| **B · Laboratorio** (`scripts/perf-lab.mjs`) | Chromium local contra build de producción | Antes/después **por ruta** | Decir cómo lo vive un usuario real |

## Cómo se recapturan

```sh
# Vía A — campo. Necesita estar logueado en la CLI (npx vercel login).
node scripts/perf-baseline.mjs

# Vía B — laboratorio. SIEMPRE contra build de producción, nunca `next dev`.
npm run build && npm start
node scripts/perf-lab.mjs
```

Los dos escupen Markdown listo para pegar aquí o en una issue.

---

## Captura · 2026-08-04

### Vía A · Campo (Speed Insights, producción, ventana 6d)

| Métrica | p75 mín | p75 máx | Umbral «bueno» | Veredicto |
|---|---:|---:|---:|---|
| LCP | 2324 ms | 4444 ms | 2500 ms | mal |
| INP | 48 ms | 144 ms | 200 ms | **bien** |
| CLS | 0.016 | 0.118 | 0.1 | regular |
| FCP | 1884 ms | 4176 ms | 1800 ms | mal |
| TTFB | 1437 ms | 3785 ms | 800 ms | mal |

> Es el rango de los p75 **diarios**, no un p75 de la ventana entera: Vercel no deja agregar
> todo el periodo (`--granularity 6d` da `Unsupported duration`) y promediar los p75 de cada
> día **no da un p75**.

**Volumen de muestras (LCP, 6d) — total 159:**

| Ruta | Muestras | ¿Sirve para comparar? |
|---|---:|---|
| `/` | 89 | sí |
| `/buscar` | 30 | sí |
| `/libro/[id]` | 9 | no |
| `/u/[username]` | 9 | no |
| `/coleccion` | 7 | no |
| `/pelicula/[id]` | 6 | no |
| `/sesion/[passId]` | 3 | no |
| `/club/[slug]` | 2 | no |
| `/clubes` | 1 | **no** ← #438 |
| `/estadisticas` | 1 | **no** ← #440 |

### Vía B · Laboratorio (localhost:3000, mediana de 5 cargas en frío)

Build de producción del commit de esta rama, Supabase **dev**, Chromium local.

| Ruta | TTFB | FCP | LCP | Issue |
|---|---:|---:|---:|---|
| `/` | 786 ms | 1396 ms | **3176 ms** | |
| `/estadisticas` | 391 ms | 572 ms | **2784 ms** | #440 |
| `/clubes` | 440 ms | 564 ms | 1272 ms | #438 |
| `/buscar` | 421 ms | 668 ms | 1044 ms | |
| `/u/[username]` | 516 ms | 968 ms | 1036 ms | |
| `/coleccion` | 614 ms | 808 ms | 808 ms | |

> **OJO con el TTFB de esta tabla.** `responseStart` marca el **primer byte**, y Next suelta la
> cabecera del documento en cuanto puede, incluso mientras sigue esperando datos. En
> `/estadisticas` eso da un TTFB de 391 ms **que no significa que la página esté lista**: sus 18
> consultas siguen ahí, y se ven en el LCP de 2784 ms. Para páginas que hacen streaming,
> **el TTFB no mide "cuándo está el dato"** — mira el LCP.

---

## Qué dice esta captura

**En campo, el TTFB manda sobre el LCP.** Con un p75 de 1,4–3,8 s de TTFB dentro de un LCP de
2,3–4,4 s, el servidor se come la mayor parte del presupuesto: la portada podría cargarse
instantáneamente y el LCP seguiría siendo malo.

Esto **reordena el plan de la auditoría**: lo que manda es el trabajo de servidor — #435 (layout
raíz), #436 (capa de datos) y la caché.

**Pero el laboratorio matiza, no confirma a ciegas.** En local el TTFB baja a 391–786 ms (red
local y Supabase dev), y ahí aparece lo que el campo tapaba: en `/` el LCP (3176 ms) va **1,8 s
por detrás del FCP** (1396 ms). Ese hueco no es servidor, es una imagen que se descubre tarde —
o sea que **#441 (`priority`) sí tiene trabajo que hacer en `/`**, aunque no sea la palanca
principal para el usuario real. Las dos cosas son ciertas a la vez porque miden escenarios
distintos; por eso hay dos vías.

No es la primera medida que apunta ahí. `playwright.config.ts` ya documenta que los GET se van
a 8 s con `proxy.ts` **pasando de 140 ms a 2,8 s**, y que solo resuelve la sesión de Supabase.
Dos medidas independientes, la misma conclusión.

**El INP (48–144 ms) está bien**, y eso también es información: confirma que el lado cliente
no necesita trabajo. Encaja con lo que vio la auditoría — 12 `useMemo` en 197 componentes de
cliente, sin memoización defensiva.

**El CLS (hasta 0.118) está justo en el límite** y es el que puede **empeorar** con la
migración: cada `<Suspense>` nuevo añade un fallback que debe reservar altura. Ya costó 0.51
un `fallback={null}` (#284).

## Trampas de la medición

- **El plan Hobby corta a 7 días.** `--since 30d` no devuelve menos: falla con
  `the hobby plan only grants access to the latest 7 days of data`. Y `--since 7d` también
  falla si la granularidad empuja el borde: usar `6d`.
- **`npx` desde Node en Windows.** `execFileSync("npx", [...])` da `ENOENT`, y `npx.cmd` da
  `EINVAL` porque Node 24 no lanza `.cmd` sin shell. Por eso `perf-baseline.mjs` monta una
  cadena única (y valida con lista blanca lo que viene de argv).
- **La Vía B mide contra el Supabase de DEV**, que es al que apunta `.env.local`. Las cifras
  absolutas no son las de producción; lo que vale es el **delta antes/después** sobre el mismo
  montaje. No compares un número de la Vía B con uno de la Vía A.
- **Medir contra `next dev` no vale para nada** (compila bajo demanda). Siempre
  `npm run build && npm start`.
- **Web Analytics no está activado** y `@vercel/analytics` no está instalado. Es otro producto:
  Analytics son visitas, Speed Insights son las Core Web Vitals. Para esto no hace falta.
