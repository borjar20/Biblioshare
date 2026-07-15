# Fidelidad Paper · 00 — Navegación y carga progresiva (skeletons + streaming)

> Parte de la iniciativa **fidelidad Paper**, como **pasada previa**: no depende de las decisiones P-T y condiciona cómo se estructuran las pantallas de los planes 01–06 (cada sección que se restylee debería nacer ya con su frontera de Suspense y su skeleton). Índice en [`README.md`](./README.md).

**Síntoma:** entrar por primera vez a una ficha o a la colección tarda en responder — la pantalla anterior se queda congelada hasta que el servidor termina *todas* las queries.

**Referencias:** guías de Next 16.2 en `node_modules/next/dist/docs/01-app/02-guides/` — `streaming.md`, `instant-navigation.md`, `prefetching.md` (leerlas antes de tocar código: esta versión tiene convenciones nuevas).

> ⚠️ **Coordinación con el pase-hub (PR #42, en paralelo).** Analizado el 2026-07-15 contra el plan de implementación de #42 (12 tasks; hoy solo docs, el código va después). Solape:
> - **Fase A (skeletons + `loading.tsx`): CERO conflicto.** Solo crea ficheros nuevos; el pase-hub no toca ninguno. Se puede hacer entera y en paralelo sin coordinar.
> - **Fase B en la Ficha: COLISIÓN DIRECTA.** Ambos editan `src/app/libro/[id]/page.tsx`, `serie/[id]/page.tsx` y `pelicula/[id]/page.tsx` (pase-hub Task 9 los reescribe para leer del pase; fase B los reestructura con Suspense). → **La fase B de la Ficha espera a que #42 aterrice** y se aplica encima; si no, rework/merge garantizado.
> - **Fase B en Colección/Perfil/Inicio/Club: acoplamiento blando.** El pase-hub reescribe las *funciones lectoras* (`get-library-items/summary/stats`, `feed.ts`…) pero **no** esos ficheros de página (no están en su lista). La fase B reestructura la página, no la lectora, y las lectoras conservan su firma → sin colisión de fichero; a lo sumo un ajuste trivial si cambia el tipo devuelto. Se puede hacer sin esperar.
> - **Regla operativa:** empezar por Fase A (todo) + Fase B de Colección/Perfil/Inicio/Club; **dejar la Fase B de la Ficha para después de #42**. Reordena el §2 Fase B en consecuencia.

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

- Crear `src/components/ui/skeleton.tsx`: bloque `animate-pulse` sobre `bg-surface-muted` (tokens, nunca grises hardcodeados) con variantes (línea de texto, portada 2/3, tarjeta, avatar). **Regla anti-CLS:** cada skeleton reserva las dimensiones reales del contenido (misma altura de tarjeta, mismo aspect-ratio de portada).
- Skeletons por pantalla que imiten la composición del frame correspondiente (portadas 2/3 fantasma, eyebrows, tarjetas): `coleccion/loading.tsx`, `libro|pelicula|serie/[id]/loading.tsx` (hero fantasma + tabs), `u/[username]/loading.tsx`, `club/[slug]/loading.tsx`, `clubes/loading.tsx`, `buscar/loading.tsx` (este último ligero: la página ya es rápida sin query).

### Fase B — Suspense granular: shell primero, secciones después
`loading.tsx` es de página completa; el objetivo real es que **el shell (título, tabs, filtros) pinte ya** y cada sección hidrate al llegar, como pides. Patrón (de `streaming.md`): no awaitar en la cima; cada sección es un server component async envuelto en `<Suspense>` con su skeleton, y las promesas se pasan hacia abajo (como ya hace `editionsPromise`).

Por pantalla (orden ajustado por la coordinación con #42 — ver aviso arriba; el orden por impacto puro sería Ficha primero):
1. **Colección**: h1 + tabs + filtros sin await; `ContinueStrip`, `CollectionSummary` y el grid en boundaries hermanos (cada uno resuelve solo).
2. **Perfil**: cabecera con la query de perfil sola; counts/stats/favoritos/panel en boundaries por tarjeta (el Panel entero puede ser un boundary).
3. **Inicio**: feed en boundary (el shell con h1+filtros pinta ya).
4. **Club**: header con la query del club; summary, feed y actividades en boundaries.
5. **Ficha** (`libro|pelicula|serie/[id]`) — **BLOQUEADA por #42 (colisión directa de fichero):** query mínima de la obra (título, portada, géneros) → hero renderiza ya; `credits`, `saga`, `community`, `passes/log` cada uno en su boundary. La hidratación de primera visita (APIs externas) pasa a streamear en vez de bloquear. ⚠️ mantener `notFound()` **antes** del primer boundary (contrato HTTP, `streaming.md` §status codes). Hacer **después** de que el pase-hub reescriba estas páginas, aplicando la estructura de Suspense encima.

### Fase C — (opcional, decisión P-N1) Shell estático con `cacheComponents`
`cacheComponents: true` + `"use cache"` en las lecturas de **catálogo** (obras/ediciones: datos compartidos y moderados, cacheables por tag e invalidables con `updateTag` al editar ficha) haría el shell instantáneo de verdad y habilita `unstable_instant` (validación en dev/build de que cada ruta navega instantánea) y el helper `instant()` de `@next/playwright` para e2e. **Obstáculo real:** `createClient` usa `cookies()` → toda query es dinámica; cachear catálogo exige un cliente Supabase sin cookies para lecturas públicas (revisar RLS: el catálogo debe ser legible anon) y separar "datos de obra" de "datos del usuario" en cada pantalla. Es un cambio de arquitectura de datos, no un retoque.

## 3. Decisiones — RESUELTAS (2026-07-15)

- **P-N1 · DECIDIDO: fases A y B ahora; fase C (cacheComponents) NO por ahora** — se reevaluará tras medir el resultado de A+B.
- **P-N2 · DECIDIDO: query mínima.** El hero de la ficha pinta con una query rápida solo de la obra (título, portada, géneros); skeletons solo en las secciones. Sin datos pasados desde el cliente.
- **P-N3 · DECIDIDO: Ficha → Colección → Perfil → Inicio → Club.**
- **P-N4 · DECIDIDO: sin barra de progreso global** — los skeletons prefetcheados bastan.

## 4. Tareas

1. **`ui/skeleton.tsx` + skeletons de ficha y colección** (Fase A parcial). Commit: `feat(ux): skeletons Paper y loading.tsx en ficha y coleccion`
2. **`loading.tsx` del resto de rutas** (perfil, club, clubes, buscar, inicio). Commit: `feat(ux): loading.tsx en el resto de rutas principales`
3. **Fase B ficha** — reordenar `libro|pelicula|serie/[id]/page.tsx`: query mínima para hero, secciones en Suspense (patrón `editionsPromise`). Commit por tipo. **Prueba:** primera visita a una ficha no cacheada (hidratación externa) pinta hero al instante; e2e de ficha verdes.
4. **Fase B colección** y **perfil**, **inicio**, **club** — un commit por pantalla.
5. **Verificación de streaming real** — script `stream-observer` de `streaming.md` §verifying o pestaña Network (Content Download largo + TTFB corto); comprobar que el gzip del hosting no bufferiza.
6. (P-N1 si se aprueba) spec aparte para Fase C.

## 5. Verificación de cierre

- [ ] Navegar tarjeta → ficha fría: el hero/skeleton pinta de inmediato, las secciones llegan progresivamente (sin layout shift: skeletons con dimensiones reales).
- [ ] Colección y perfil: shell (título/tabs/filtros) visible antes de que resuelvan las queries.
- [ ] `notFound()` de fichas inexistentes sigue devolviendo 404 real.
- [ ] `npx playwright test` verde (Node 22) — los e2e no dependen de que la página llegue entera de golpe (esperar por contenido, no por load).
- [ ] P-N1…P-N4 respondidas y registradas.
