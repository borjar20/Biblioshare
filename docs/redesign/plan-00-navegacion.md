# Fidelidad Paper · 00 — Navegación y carga progresiva (skeletons + streaming)

> Parte de la iniciativa **fidelidad Paper**, como **pasada previa**: no depende de las decisiones P-T y condiciona cómo se estructuran las pantallas de los planes 01–06 (cada sección que se restylee debería nacer ya con su frontera de Suspense y su skeleton). Índice en [`README.md`](./README.md).

**Síntoma:** entrar por primera vez a una ficha o a la colección tarda en responder — la pantalla anterior se queda congelada hasta que el servidor termina *todas* las queries.

**Referencias:** guías de Next 16.2 en `node_modules/next/dist/docs/01-app/02-guides/` — `streaming.md`, `instant-navigation.md`, `prefetching.md` (leerlas antes de tocar código: esta versión tiene convenciones nuevas).

> ## ✅ EJECUTADO Y MERGEADO (2026-07-16) — PR #44
>
> **Fases A y B completas, en `main`.** Este plan queda cerrado salvo los pendientes de §6.
>
> - **Fase A:** `ui/skeleton.tsx` (primitivos anti-CLS), `ui/loading-announce.tsx`, skeletons de sección compartidos (`library/collection-skeletons`, `social/feed-skeleton`, `clubs/club-skeletons`, `detail/item-tabs-skeleton`) y `loading.tsx` por ruta.
> - **Fase B:** shell instantáneo + `<Suspense>` por sección en **Colección, Perfil, Inicio, Club y Ficha** (las tres: libro/película/serie). En la Ficha, el hero pinta con la fila del catálogo + nota media + estado del pase, y todo lo pesado (backfill de personas, créditos, saga, ediciones, pases, sesiones, colas, TMDB, `ensureSeriesEpisodes`) llega por streaming.
> - **Fase C:** NO se hizo (decisión P-N1); reevaluar tras medir.
>
> **Coordinación con el pase-hub (#42): resuelta.** El solape era real y se gestionó: la Fase B de la Ficha esperó a que #42 aterrizara (ambos editaban los mismos tres `page.tsx`) y se aplicó encima del código ya reescrito por su Task 9. Colección/Perfil/Inicio/Club se hicieron en paralelo sin conflicto, como se había previsto.
>
> **Extra no planificado (#45):** durante los e2e salió un bug preexistente de #42 — `ClosePassSheet` se cerraba nada más abrirse en desarrollo (guard con `useRef` no idempotente + doble invocación de efectos de StrictMode). Arreglado aparte.

---

## 1. Diagnóstico (verificado en el código)

1. **No existe ni un `loading.tsx` en toda la app** (glob `src/app/**/loading.tsx` → 0 resultados). Sin fallback de ruta, una navegación cliente no pinta nada hasta que el RSC payload completo llega.
2. **`<Suspense>` solo se usa en un sitio**: la tira de ediciones de `libro/[id]` (`loadBookEditions` → promesa + `<Suspense fallback={<EditionsLoading/>}>`). Ese patrón, que ya funciona, es el precedente a extender.
3. **Las páginas awaitan todo arriba**: `coleccion/page.tsx` espera items + summary + queues; `u/[username]/page.tsx` espera 6+ queries (perfil, counts, follow state, stats, favoritos) antes de pintar la cabecera; `libro/[id]` espera obra + créditos + saga + ediciones + pases. El `await searchParams` en la cima hace dinámico todo lo de abajo.
4. **La primera visita a una ficha es el peor caso**: la escalera de hidratación (peldaño 2) dispara fetches a Google Books/TMDB **en el render del servidor**; hasta que la API externa responde no se pinta nada. Con streaming, el hero (datos ya cacheados de la tarjeta) puede pintar al instante y el resto llegar después.
5. **Sin `cacheComponents`** en `next.config.ts` y sin ningún `"use cache"`: no hay shell estático; TTFB = query más lenta.

## 2. Estrategia (3 fases incrementales)

### Fase A — Skeletons Paper + `loading.tsx` por ruta
Lo más barato y lo que más se nota. `loading.tsx` se **prefetch-ea como fallback instantáneo** en navegaciones: el tap responde al instante.

> ## ⚠️ REGLA QUE SALE DE EJECUTAR ESTO: `loading.tsx` MATA el 404 real
>
> Un `loading.tsx` es una **frontera de Suspense de ruta**: en cuanto empieza a streamear, el 200 queda comprometido y `notFound()` ya no puede devolver 404 (contrato HTTP, `streaming.md` §status codes). Next inyecta `<meta robots=noindex>` como paliativo, pero el status deja de ser correcto.
>
> **Medido (A/B, no teoría):** `/libro/<inexistente>` → **404** sin `loading.tsx`, **200** con él.
>
> **Norma:** `loading.tsx` **solo** en rutas que NO llaman `notFound()`. Hoy son exactamente cuatro: `(home)`, `buscar`, `clubes` y `coleccion`. Las **11 rutas que sí hacen `notFound()`** (las 3 fichas, perfil, club, saga, persona, sesión, seguidores, siguiendo, actividad) van **sin** `loading.tsx`.
>
> **Ojo con el `loading.tsx` raíz:** cubre TODAS las rutas que no tengan uno propio y les roba el 404 — un efecto colateral fácil de no ver. Por eso el skeleton de Inicio vive en el route group **`(home)`**: así no se filtra. Si añades un `loading.tsx`, comprueba antes si esa ruta (o alguna hija) hace `notFound()`.
>
> **Por qué renunciar a él cuesta poco:** tras la Fase B el streaming del contenido **no viene del `loading.tsx`**, viene del `<Suspense>` dentro de la página. Solo se pierde el skeleton de los primeros ~200 ms (consultas indexadas), no el streaming.

- Crear `src/components/ui/skeleton.tsx`: bloque `animate-pulse` sobre `bg-surface-muted` (tokens, nunca grises hardcodeados) con variantes (línea de texto, portada 2/3, tarjeta, avatar). **Regla anti-CLS:** cada skeleton reserva las dimensiones reales del contenido (misma altura de tarjeta, mismo aspect-ratio de portada).
- Skeletons por pantalla que imiten la composición del frame correspondiente. **Corregido al ejecutar** (ver la regla del 404): solo llevan `loading.tsx` `(home)`, `coleccion`, `buscar` y `clubes`. Las fichas, perfil y club se quedaron sin él; su skeleton de sección vive en el `<Suspense>` de la propia página (`ItemTabsSkeleton`, etc.).
- **Los primitivos deben ser client-safe.** `ui/skeleton.tsx` no puede importar nada de servidor: el anuncio accesible (`getTranslations` → `common.loading`) vive aparte en `ui/loading-announce.tsx`. Si no, cualquier client component que importe un skeleton (p. ej. la página `/clubes`) revienta al arrastrar `next-intl/server` al bundle.
- **Los fetches de cliente también necesitan skeleton.** `loading.tsx` y `<Suspense>` solo cubren el servidor. `/clubes` es un client component que trae sus listas con `useEffect`: sin un flag de carga, el primer render pinta "no hay clubes" con las listas aún vacías. Regla: si una lista se carga en cliente, distingue "cargando" de "vacío".

### Fase B — Suspense granular: shell primero, secciones después
`loading.tsx` es de página completa; el objetivo real es que **el shell (título, tabs, filtros) pinte ya** y cada sección hidrate al llegar, como pides. Patrón (de `streaming.md`): no awaitar en la cima; cada sección es un server component async envuelto en `<Suspense>` con su skeleton, y las promesas se pasan hacia abajo (como ya hace `editionsPromise`).

Cómo quedó cada pantalla (todas HECHAS en #44):
1. **Colección** ✅: h1 + tabs + filtros en el shell (los filtros se sacaron de `LibraryGrid`); overview, grid y colas en boundaries hermanos, con `key` por consulta para que al cambiar de filtro reaparezca el skeleton.
2. **Perfil** ✅: cabecera con lo justo (perfil+counts+stats); panel/colección/actividad en boundaries. `favorites` se movió dentro de `ActivityTab`.
3. **Inicio** ✅: título+filtros en el shell; el feed (la consulta pesada) en boundary.
4. **Club** ✅: cabecera+pestañas en el shell; feed (posts+hitos+marcar leído) y gestión (solicitudes) en boundaries. `activities` se queda arriba: lo necesita el badge de la pestaña.
5. **Ficha** ✅ (tras #42, aplicada encima de su Task 9): el hero pinta con la fila del catálogo + nota media + estado del pase activo, y **todo el bloque de pestañas** va tras un `<Suspense>` con `ItemTabsSkeleton` — ahí viven backfill de personas, créditos, saga, ediciones, pases, sesiones, colas, plataformas de TMDB y `ensureSeriesEpisodes`. El byline sale de la propia fila (autor/director/creador + año): los créditos enriquecidos dan el mismo texto y no merece la pena bloquear el hero por ellos. `notFound()` sigue **antes** del primer boundary.
   - **Medido:** `/libro/<real>` sirve el hero con datos reales y el contenido de pestañas por streaming detrás; la primera visita ya no espera al backfill ni a las APIs externas — que era el peor caso del síntoma original.

### Fase C — (opcional, decisión P-N1) Shell estático con `cacheComponents`
`cacheComponents: true` + `"use cache"` en las lecturas de **catálogo** (obras/ediciones: datos compartidos y moderados, cacheables por tag e invalidables con `updateTag` al editar ficha) haría el shell instantáneo de verdad y habilita `unstable_instant` (validación en dev/build de que cada ruta navega instantánea) y el helper `instant()` de `@next/playwright` para e2e. **Obstáculo real:** `createClient` usa `cookies()` → toda query es dinámica; cachear catálogo exige un cliente Supabase sin cookies para lecturas públicas (revisar RLS: el catálogo debe ser legible anon) y separar "datos de obra" de "datos del usuario" en cada pantalla. Es un cambio de arquitectura de datos, no un retoque.

## 3. Decisiones — RESUELTAS (2026-07-15)

- **P-N1 · DECIDIDO: fases A y B ahora; fase C (cacheComponents) NO por ahora** — se reevaluará tras medir el resultado de A+B.
- **P-N2 · DECIDIDO: query mínima.** El hero de la ficha pinta con una query rápida solo de la obra (título, portada, géneros); skeletons solo en las secciones. Sin datos pasados desde el cliente.
- **P-N3 · DECIDIDO: Ficha → Colección → Perfil → Inicio → Club.**
- **P-N4 · DECIDIDO: sin barra de progreso global** — los skeletons prefetcheados bastan.

## 4. Tareas

- [x] **`ui/skeleton.tsx` + skeletons por pantalla** (Fase A) — PR #44.
- [x] **`loading.tsx` por ruta** — PR #44, luego **acotado** a las 4 rutas sin `notFound()` (ver la regla del 404).
- [x] **Fase B ficha** (libro/película/serie) — PR #44, encima de #42.
- [x] **Fase B colección, perfil, inicio, club** — PR #44.
- [x] **Skeletons de los fetches de cliente** (`/clubes`) — PR #44.
- [ ] **Verificación de streaming real en el hosting** — script `stream-observer` de `streaming.md` §verifying o pestaña Network (Content Download largo + TTFB corto); comprobar que el gzip/proxy de Vercel no bufferiza. **Pendiente:** solo se verificó en dev local.
- [ ] (P-N1) spec aparte para Fase C — reevaluar tras medir A+B.

## 5. Verificación de cierre

- [x] Navegar tarjeta → ficha: el hero pinta con datos reales y las secciones llegan por streaming detrás (comprobado sobre una ficha real; skeletons con dimensiones reales).
- [x] Colección y perfil: shell (título/tabs/filtros) visible antes de que resuelvan las queries (comprobado en `/u/<perfil público>`: cabecera real + skeleton de sección en el mismo stream).
- [x] `notFound()` de fichas inexistentes devuelve **404 real** — se rompió con la Fase A y se recuperó acotando los `loading.tsx`. Verificado en libro/película/serie/perfil/saga/persona.
- [ ] `npx playwright test` verde — **NO alcanzable tal cual, y no por este plan**: la suite ya estaba roja en `main`. Estado tras #44+#45: **15/21**. Los fallos se atribuyeron uno a uno (revirtiendo a `main` y repitiendo): 4 preexistentes + 1 flaky, **ninguno de la Fase A/B**. De esos, #45 arregló los de `pase-hub`. **Queda rojo y SIN EXPLICAR**: `propose-wizard` y la búsqueda de películas/series (ver §6.3).
- [x] P-N1…P-N4 respondidas y registradas.

## 6. Pendiente tras cerrar el plan

1. **Streaming en el hosting real** (§4) — que gzip/proxy de Vercel no bufericen la respuesta; si lo hacen, el streaming no se nota en producción.
2. ~~**Suite e2e roja en `main`** — `propose-wizard` falla sin tocar nada~~ **RESUELTO (PR #47, 2026-07-16).** No era flaky ni era del test: el restyle `dafb57d` puso `+ {t("propose")}` en el botón y su nombre accesible pasó a "+ Proponer actividad", que dejó de casar con la regex anclada del spec. **El test tenía razón y el producto se había desviado** — el `+` es decorativo y ahora va con `aria-hidden` (convención del propio módulo). Arreglado en el origen, no en la aserción.
3. ~~**Los e2e de película y serie fallan por causa DESCONOCIDA**~~ **EXPLICADO (PR #47, 2026-07-16): era el ENTORNO, no el producto.** Supabase es remoto también en dev: mediana **240 ms por consulta, picos de 1,3 s** (medido con 15 round-trips). Los picos se ven igual en GETs (8 s) y en `proxy.ts` — que solo resuelve la sesión y pasó de 140 ms a 2,8 s — o sea, nada que ver con revalidaciones ni con TMDB. La señal inequívoca: **el test que fallaba se movía en cada pasada** (310, 347, 467, 512…) y cada timeout que se subía mudaba el fallo de sitio. Mitigado con `expect: 20_000` + `retries: 1` en `playwright.config.ts` (en la config, no assert a assert — el fallo se mueve). Hipótesis descartadas con pruebas: caché de fetch fría, carga concurrente (`workers: 1`) y — otra vez — las API keys. **Suite completa en verde: 20 pasan, 1 flaky, 0 fallos** (la línea base era 15/21).
4. **Fase C** (`cacheComponents` + `use cache`) — reevaluar tras medir A+B.

### 6b. Seguimiento ejecutado: agilidad contra servicios remotos (2026-07-16)

Del análisis del punto 3 salieron dos mejoras de producto, ambas MERGEADAS, que son continuación directa del objetivo de este plan (que la app se sienta ágil aunque BD y APIs sean remotas — y **en producción el Supabase es igual de remoto**):

- **`perf(fichas)` — PR #47 (`46da393`).** Las tres fichas encadenaban ~8 consultas EN FILA donde bastan 3-4: con ~240 ms de ida y vuelta por consulta, lo que manda no es cuántas hay sino cuántas van en serie. Solo hay dos dependencias reales y se respetan (`ensureItemEnriched` escribe lo que `getItemCredits` lee; `getSessions` necesita el pase abierto de `getPasses`); el pase activo, `getQueues`, `getCurrentUserRole` y `pass_reviews` van ahora en paralelo. Medido en la ficha de libro: POST caliente 3,5–7,4 s → **2,0–2,2 s**; GET `?tab=log` 2,3–3,1 s → **1,6–2,1 s**.
- **Badge de estado optimista — PR #48 (`d89005c`).** El badge del hero y los pills de la pestaña Registro son hermanos (el badge fuera del `<Suspense>`, los pills dentro): los pills eran optimistas y el badge esperaba a la revalidación (2-6 s enseñando "Pendiente" con "Viendo" pulsado). `ItemStatusProvider` (`components/detail/item-status-context.tsx`) comparte el estado entre ambos: sembrado con el `activeStatus` del hero, resincroniza derivar-de-props al revalidar, y publican todos los gestos (pills, seguir → `planned`, quitar → `null`, hoja de retomar → `in_progress`; cancelar no publica porque el revert de `askResume` ya ocurrió). El badge es `StatusBadgeLive`, isla de cliente con las etiquetas traducidas desde el servidor. El auto-cierre por episodios no publica a propósito: redirige con render fresco.
- Efecto colateral medible: `pase-hub` + `happy-path` bajaron de >4 min a **2,6 min** — los asserts del badge ya no esperan al round-trip del servidor, lo que además le quita presión al flaky del entorno.

## 7. Notas de herramientas (para la próxima vez)

- **`grep -o` solo imprime lo que casa la regex.** `grep -oE '^…KEY=' .env.local` devuelve `TMDB_API_KEY=` **tenga valor o no** — la regex acaba en `=`. Leerlo como "la clave está vacía" es un error real que ya se cometió aquí y contaminó tres documentos. Para comprobar si una var tiene valor: `awk -F= '/^CLAVE=/ {print length($2)}'`.
- **Depurar el servidor desde los e2e:** Playwright arranca su `webServer` con `stdout: 'ignore'` y `stderr: 'pipe'` → los `console.log` de server components **se descartan**. Usa `console.error` para que salgan como `[WebServer] …`.
- **El MCP de Supabase apunta a PROD y el dev server a DEV** ([[supabase-environments]]): son BD distintas. Un id sacado del MCP no existe en dev — para datos de dev, ir a su API REST con la anon key del `.env.local`.
- **`git checkout origin/main -- src` restaura pero no borra**: los ficheros que tu rama eliminó (p. ej. `src/app/page.tsx` movido a `(home)`) reaparecen y pueden duplicar rutas. Comprobar `git status` antes de dar por buena una línea base.
- **Si el test que falla CAMBIA en cada pasada, deja de mirar los tests.** Esa movilidad es la firma de un problema de entorno (latencia, recursos), no del bug de ningún spec — y subir el timeout de un assert solo muda el fallo al siguiente. Confírmalo midiendo algo que no dependa del producto (aquí: round-trips crudos a Supabase con `curl`, y el tiempo de `proxy.ts`, que no revalida nada).
- **`git checkout <fichero>` para "quitar la instrumentación" arrasa TODO lo no commiteado de ese fichero**, incluidos cambios pedidos que convivan con ella. Revertir con ediciones explícitas (o commitear lo bueno antes de instrumentar).
