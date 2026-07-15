# Fidelidad Paper · 00 — Navegación y carga progresiva (skeletons + streaming)

> Parte de la iniciativa **fidelidad Paper**, como **pasada previa**: no depende de las decisiones P-T y condiciona cómo se estructuran las pantallas de los planes 01–06 (cada sección que se restylee debería nacer ya con su frontera de Suspense y su skeleton). Índice en [`README.md`](./README.md).

**Síntoma:** entrar por primera vez a una ficha o a la colección tarda en responder — la pantalla anterior se queda congelada hasta que el servidor termina *todas* las queries.

**Referencias:** guías de Next 16.2 en `node_modules/next/dist/docs/01-app/02-guides/` — `streaming.md`, `instant-navigation.md`, `prefetching.md` (leerlas antes de tocar código: esta versión tiene convenciones nuevas).

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

Por pantalla (orden = impacto):
1. **Ficha** (`libro|pelicula|serie/[id]`): query mínima de la obra (título, portada, géneros — lo que pinta el hero) → hero renderiza ya; `credits`, `saga`, `community`, `passes/log` cada uno en su boundary. La hidratación de primera visita (APIs externas) pasa a streamear en vez de bloquear. ⚠️ mantener `notFound()` **antes** del primer boundary (contrato HTTP, `streaming.md` §status codes).
2. **Colección**: h1 + tabs + filtros sin await; `ContinueStrip`, `CollectionSummary` y el grid en boundaries hermanos (cada uno resuelve solo).
3. **Perfil**: cabecera con la query de perfil sola; counts/stats/favoritos/panel en boundaries por tarjeta (el Panel entero puede ser un boundary).
4. **Inicio**: feed en boundary (el shell con h1+filtros pinta ya).
5. **Club**: header con la query del club; summary, feed y actividades en boundaries.

### Fase C — (opcional, decisión P-N1) Shell estático con `cacheComponents`
`cacheComponents: true` + `"use cache"` en las lecturas de **catálogo** (obras/ediciones: datos compartidos y moderados, cacheables por tag e invalidables con `updateTag` al editar ficha) haría el shell instantáneo de verdad y habilita `unstable_instant` (validación en dev/build de que cada ruta navega instantánea) y el helper `instant()` de `@next/playwright` para e2e. **Obstáculo real:** `createClient` usa `cookies()` → toda query es dinámica; cachear catálogo exige un cliente Supabase sin cookies para lecturas públicas (revisar RLS: el catálogo debe ser legible anon) y separar "datos de obra" de "datos del usuario" en cada pantalla. Es un cambio de arquitectura de datos, no un retoque.

## 3. Divergencias / decisiones — COMENTAR ANTES DE IMPLEMENTAR

- **P-N1 · ¿Fase C sí o no (o después)?** Recomendación: hacer A+B ahora (resuelven el síntoma) y dejar C como epic aparte tras medir; toca RLS, clientes Supabase y cache-invalidation, y `unstable_instant` sigue marcado draft en 16.2.
- **P-N2 · Skeleton vs contenido conocido.** En la ficha podríamos pintar el hero **con los datos que ya tenía la tarjeta clicada** (título/portada) en vez de skeleton puro. Técnicas: query mínima rápida (recomendada, server-first) o pasar datos por la navegación. ¿Vale la query mínima o quieres explorar el "hero instantáneo" con datos del cliente?
- **P-N3 · Prioridad de rutas.** Propuesta: ficha y colección primero (las que citas), luego perfil, inicio, club. ¿De acuerdo, o hay otra que te duela más?
- **P-N4 · Indicador de navegación global.** Mientras el `loading.tsx` no llega (prefetch frío), ¿quieres además una barra de progreso fina bajo el topbar (patrón clásico) o lo consideramos ruido?

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
