# Fidelidad Paper · 02 — Colección

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- `Paper - Colección.html` → frames **A · Móvil General**, **B · Móvil Libros (grid+filtros)**, **C · Escritorio General**
- `Paper - Colección v2.html` → frames **A · Colecciones grid**, **B · Detalle**, **C · Todo**, **D · Añadir a colección** (feature nueva, ver §3)
- `Paper - Colas, Retos, Usuarios, Admin.html` → frame **1 · Colas en Colección**

**Objetivo:** que `/coleccion` calque los frames A/B/C de `Paper - Colección.html`; Colección v2 y detalles de Colas quedan condicionados a decisión.

---

## 1. Estado actual

| Pieza | Archivo | Estado |
|---|---|---|
| Página | `src/app/coleccion/page.tsx` | Estructura correcta: General abre con ContinueStrip + CollectionSummary; pestañas por tipo; Colas integradas como pestaña. |
| Pestañas | `src/app/coleccion/collection-tabs.tsx` | Mono uppercase con subrayado teñido por tipo (patrón "subtabs en mono" decidido en el rediseño). General · Libros · Películas · Series · Colas. |
| Tarjetas continuar | `src/components/library/continue-strip.tsx` | Muy fiel: banda de acento izquierda, portada, eyebrow mono del tipo, progreso, "Continuar ›". |
| Resumen | `src/components/library/collection-summary.tsx` | Total serif + barra apilada ✔. Leyenda y tipos difieren (ver §2.4). |
| Tarjeta de grid | `src/components/library/library-item-card.tsx` | Portada 2/3 con borde por tipo + dot de estado; título serif; autor itálica; editorial·páginas; relecturas. |
| Filtros | `src/components/library/library-filters.tsx` | Búsqueda + estado + orden (se muestran en todas las pestañas, incluida General). |
| Colas | `src/app/coleccion/queues-panel.tsx` | Panel funcional dentro de la pestaña Colas. |

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

1. **Cabecera de página** — Maqueta A: el título "Mi colección" vive en el **topbar** (wordmark Fraunces 16px) precedido de una **barrita de acento** (8×22px, radio 999px), con botones ⌕ y + a la derecha. Actual: `h1` "…" plano dentro de la página bajo el header global. Como el header global es compartido, la traducción razonable sin tocar la arquitectura: `h1` en `font-serif` + barrita de acento delante (frame C de escritorio: `h1` Fraunces 28px + contador mono "128 títulos" en la misma línea). Añadir el **contador de títulos** junto al h1 (el dato ya está en `getLibrarySummary`).
2. **Cabecera "Ahora mismo · En curso"** — Maqueta `.pin-head`: dot de acento 7px + eyebrow + **contador N a la derecha** (mono 10.5px). Actual (`continue-strip.tsx:21`): solo el eyebrow. Añadir dot y contador.
3. **General sin filtros y con "Actualizado recientemente"** — Maqueta A: en General **no hay** búsqueda/píldoras/orden; tras el resumen viene el eyebrow "Actualizado recientemente" y un grid de 3 columnas con lo último tocado. Actual: General muestra `LibraryFilters` completos y el grid entero. Cambiar: en `tab === "general"` ocultar filtros, poner eyebrow y limitar el grid a lo reciente (p. ej. 9–12 ítems, `sort: "recent"`); el grid completo con filtros queda en las pestañas de tipo. (Si alguien llega a General con `?status=` desde un enlace viejo se puede seguir respetando, como hoy.)
4. **Resumen: leyenda y tipos** — Maqueta: leyenda en **grid de 2 columnas** (`gap 7px 14px`), cada línea "dot + nombre …… recuento" con el recuento en mono semibold `--fg` alineado a la derecha; y fila de tipos con **cifras grandes Fraunces 26px teñidas por tipo** y label 11px debajo, `justify-content:space-around`. Actual: leyenda inline "estado · n" todo muted, y tipos como chips-píldora pequeños. Rehacer ambas filas de `collection-summary.tsx` (el título "Resumen" en Fraunces 15px también falta).
5. **Badge de estado sobre portada (grid de Colección)** — Maqueta B `.sb`: **píldora con texto** ("Leyendo", "Leído", "Pdte.") + dot, fondo `surface` al 88% con blur y borde. Actual: `dotOnly`. En Colección usar la variante píldora (la dot-only es la del grid del Perfil, mockup IA nueva). `status-badge.tsx` ya tiene la variante con texto; darle el fondo translúcido con blur de la maqueta y usarla en `library-item-card.tsx` cuando se renderiza en Colección (prop o variante).
6. **Metadatos del grid de tipo** — Maqueta B: en leídos, línea mono `9.5px` "2ª lectura · ★ 9" (relecturas y **nota** juntas). Actual: relecturas en `text-xs` normal y **la nota no se muestra**. Añadir rating a `LibraryItem` en la tarjeta (el dato ya existe en la query de biblioteca; verificar en `src/lib/library/get-library-items.ts`) y componer la línea en mono.
7. **Grid de tipo a 2 columnas en móvil** — Maqueta B: `g2` con tarjetas grandes y metadatos. Actual: `grid-cols-2` ✔ (coincide). En escritorio maqueta C usa `g5` ✔ (coincide con `lg:grid-cols-5`). Solo revisar gap (16px maqueta vs `gap-4` ✔).
8. **Escritorio General a dos columnas** — Maqueta C: fila superior en grid `1fr 320px`: tarjetas continuar apiladas a la izquierda, Resumen como tarjeta a la derecha (sticky no, simplemente columna); "Actualizado recientemente" a lo ancho debajo con `g5`. Actual: todo apilado en una columna `max-w-4xl`. Añadir `lg:grid-cols-[1fr_320px]` al bloque GeneralOverview.
9. **Tarjeta continuar, ajustes finos** — Maqueta: portada 58×87 radio 5px, título 15px, autor 11.5px, progreso con fila "p. 240 / 662 · 38%" en mono 10px + "Continuar ›" 11px semibold teñido. Actual muy cerca (portada 64×96 rounded-lg). Ajustar tamaños exactos y ordenar la fila progreso/CTA como en la maqueta (label izquierda, CTA derecha, ya está). En General móvil las tarjetas van **apiladas a una columna** (maqueta A), no `sm:grid-cols-2`; a partir de escritorio siguen apiladas dentro de la columna izquierda (frame C). Cambiar el grid interno de `continue-strip.tsx` a una columna.

## 3. Divergencias funcionales — RESUELTAS (2026-07-15)

- **P1 · DECIDIDO: Colección v2 SE INCLUYE en la iniciativa.** Se planifica como **sesión(es) extra de este plan** con spec propia previa: modelo de datos (`collections` + `collection_items`, RLS, migración vía agente supabase-schema), grid de colecciones con abanico de portadas + tile crear, detalle, pestaña "Todo" (absorbe el grid actual sin bloque "en curso") y hoja "Añadir a colección" desde ficha/grid. **Ejecutar DESPUÉS de la fidelidad v1** (tareas 1–5), porque v2 reorganiza las pestañas.
- **P2 · DECIDIDO vía P-T3 (topbar contextual): SÍ** — topbar "Mi colección" con barrita de acento + ⌕ (búsqueda en colección) y + (→ `/buscar`).
- **P3 · Colas: se mantiene como pestaña** (no cuestionado en la sesión de decisiones; si molesta al integrar v2, replantear entonces). Restyling contra su frame en tarea propia.
- **P4 · DECIDIDO vía P-T2: subtabs en serif Fraunces.**

## 4. Tareas

> **TAREAS 1–5 HECHAS Y VERIFICADAS 2026-07-18** (fidelidad v1, frames A/B/C de `Paper - Colección.html`). Verificado en navegador a 1280 y 400, claro y oscuro; tsc/eslint limpios; e2e nuevo `coleccion-general.spec.ts` verde. Hallazgos: el contador de títulos se sirve por **su propia consulta en `<Suspense>`** (`TitleCount`) para no bloquear el shell instantáneo ni duplicar acoplando el summary de General; el badge píldora sobre portada es una **variante `overlay` nueva** de `status-badge` (surface translúcido + blur), y `LibraryItemCard` la usa solo con `inCollection` (el Perfil sigue dot-only); `getLibraryItems` gana un `limit` opcional (recorta tras ordenar) para los recientes de General. **Pendientes del plan:** T6 (Colas, bloqueada por P3) y **T7 (Colección v2, con migración)**.

### Tarea 1 — Cabecera y sección "en curso"
- **Modificar:** `src/app/coleccion/page.tsx`, `src/components/library/continue-strip.tsx`
- `h1` serif + barrita de acento + contador mono de títulos (pasar `summary.total`; en General ya se carga el summary — para las otras pestañas cargarlo o mover el contador solo a General).
- `pin-head` completo: dot acento + eyebrow + N.
- ContinueStrip a una columna (quitar `sm:grid-cols-2`), tamaños de la maqueta.
- Commit: `style(coleccion): cabecera serif y bloque en-curso fieles al mockup`

### Tarea 2 — Resumen fiel (leyenda 2-col + tipos con cifras grandes)
- **Modificar:** `src/components/library/collection-summary.tsx`
- Título "Resumen" Fraunces 15px; leyenda `grid grid-cols-2 gap-x-3.5 gap-y-2` con recuento mono semibold a la derecha (`ml-auto`); fila de tipos `flex justify-around border-t pt-3.5` con `font-serif text-[26px]` teñido (`MEDIA_ACCENT[type].text`) y label 11px muted debajo.
- Commit: `style(coleccion): resumen con leyenda en dos columnas y tipos en cifras serif`

### Tarea 3 — General = recientes sin filtros
- **Modificar:** `src/app/coleccion/page.tsx`
- En `tab === "general"`: no renderizar `LibraryFilters`; añadir eyebrow "Actualizado recientemente" (clave i18n nueva → agente i18n-keeper después); `getLibraryItems(..., { sort: "recent" })` con límite (añadir `limit` opcional a la query si no existe) y grid 3 col móvil / 5 col escritorio.
- **Prueba:** e2e de colección existentes; añadir asserts de que General no muestra búsqueda y sí el eyebrow.
- Commit: `feat(coleccion): general muestra recientes sin filtros (mockup A)`

### Tarea 4 — Badge píldora sobre portada + nota en metadatos
- **Modificar:** `src/components/ui/status-badge.tsx` (fondo translúcido + blur + borde para la variante con texto en overlay), `src/components/library/library-item-card.tsx` (usar píldora en Colección; línea mono `relecturas · ★ nota` para completados), y `src/lib/library/get-library-items.ts` si falta exponer `rating`.
- Ojo: el grid del **Perfil** sigue con dot-only (mockup IA nueva frame C) — parametrizar, no cambiar globalmente.
- Commit: `style(coleccion): badge de estado con texto sobre portada y nota en la tarjeta`

### Tarea 5 — Layout de escritorio del General
- **Modificar:** `src/app/coleccion/page.tsx`
- `GeneralOverview` en `lg:grid lg:grid-cols-[1fr_320px] lg:gap-6` (continuar izquierda, resumen derecha), recientes debajo a lo ancho.
- Commit: `style(coleccion): general a dos columnas en escritorio (mockup C)`

### Tarea 6 — (bloqueada por P3) Restyling del panel de Colas
- Contra el frame "Colas · en Colección": filas arrastrables con portada, estimación por ítem y total por cola. Analizar `queues-panel.tsx` en su sesión (hoy fuera de alcance visual de esta pasada).

### Tarea 7 — Colección v2 (APROBADA, tras las tareas 1–6)
- Sesión 1: spec + migración (`collections`, `collection_items`, RLS; agente supabase-schema) + grid de colecciones y detalle (frames A/B de `Paper - Colección v2.html`).
- Sesión 2: pestaña "Todo" (reubicar el grid actual) + hoja "Añadir a colección" (frame D) desde ficha y grid.

## 5. Verificación de cierre

- [x] Frames A/B/C lado a lado con `/coleccion` (móvil 400px y escritorio 1280): general (recientes 3 col sin filtros), pestaña Libros con filtros (2 col), escritorio a dos columnas (continuar | resumen). — **verificado T1–T5**.
- [x] Modo oscuro sin hardcodes (verificado claro y oscuro; tokens de acento/estado por tema). — **T1–T5**.
- [x] `npx playwright test` (Node 22): `coleccion-general.spec.ts` nuevo verde; happy-path/pase-hub (que tocan `/coleccion`) sin regresión.
- [x] P1–P4 respondidas y registradas.
- [ ] **T6 (Colas) y T7 (Colección v2, con migración)** — pendientes, sesión aparte.
