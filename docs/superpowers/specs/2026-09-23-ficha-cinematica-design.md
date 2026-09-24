---
title: Ficha de obra cinemática (libro · película · serie), fase 1
date: 2026-09-23
status: implementada (fase 1: #1206, #1209, #1211 y esta PR)
area: ui / catalogo
---

# Ficha de obra cinemática — fase 1: estructura e impacto visual

## Problema

Las fichas `/libro/[id]`, `/pelicula/[id]` y `/serie/[id]` se sienten simples y en PC no usan
el ancho. La causa es estructural, no de estilo:

- `src/components/detail/item-shell.tsx` monta en PC un raíl sticky de 300px con la portada y
  el panel de control, dentro de un contenedor con `lg:max-w-[1200px]`. El cuerpo de **cualquier**
  pestaña queda en **~771px a cualquier viewport** (medido a 1280/1440/1600/1920 en el plan 06
  §6e). El plan 06 ya lo dejó escrito como «choque de shells de escritorio» que volvería a salir.
- El shell son **dos árboles** (hero de móvil + raíl/cabecera de PC) que se esconden por
  breakpoint; la portada se pinta dos veces y cada ajuste se hace por duplicado.
- No hay imagen de fondo real: el «backdrop» del hero es la propia portada ampliada al 25% y
  difuminada. `movies` y `series` no guardan `backdrop_path` de TMDB.

## Alcance

Rediseño completo de la ficha, **PC y móvil**, en dos fases:

1. **Esta spec (fase 1):** shell nuevo sin raíl, hero cinemático con backdrop real, tarjeta
   «tu pase», y los cuerpos de las pestañas usando el ancho.
2. **Fase 2 (fuera de esta spec):** bloques de contenido nuevo — tráilers, obras relacionadas,
   «más del autor/director», actividad de amigos. Cada uno se abre como **issue aparte** con sus
   tres etiquetas al cerrar la fase 1, y lleva su propia spec.

## Decisiones tomadas (brainstorming 2026-09-23)

| Pregunta | Elegido | Descartado |
|---|---|---|
| Estructura de PC | **A · Cinemática**: backdrop a todo el ancho, portada montada encima, cuerpo en contenedor de ~1320px | B · editorial (banda teñida + 3 columnas); C · raíl ensanchado |
| Imagen de fondo | **Backdrop real de TMDB** para películas y series; libros con portada difuminada y teñida | Solo portada difuminada para todos; hacerlo en dos fases |
| Dónde vive «tu pase» | **Tarjeta flotante** a la derecha del hero; al pegarse las pestañas, el CTA reaparece en su barra | Barra de acciones bajo el título; columna derecha sticky |
| Cuerpo de Info | **Principal + columna de datos** (`1fr \| 340px`) | Bandas a todo el ancho |
| Móvil | Hereda el hero con backdrop; la misma tarjeta, bajo el hero | Dejar el móvil como está |
| Construcción | **Un hero único responsive** + `PassCard` | Reestilizar los dos árboles; ficha v2 tras flag |

Maquetas de la sesión (no versionadas): `.superpowers/brainstorm/797-1790196580/content/`
(`layout-pc.html`, `hero-pase.html`, `info-body.html`, `movil-y-libro.html`).

## Diseño

### 1. Componentes

**Salen** de `src/components/detail/`: `item-rail.tsx`, `item-header-wide.tsx`,
`item-rail-actions.tsx`, `hero-status-or-follow.tsx`.

**`ItemHero`** (reescrito, componente de servidor). Pinta:

- El fondo, por este orden de preferencia:
  1. `backdropUrl` nítido, con degradado hacia `--background` en la parte baja.
  2. Sin backdrop pero con portada (todos los libros; pelis/series sin backdrop en TMDB): la
     portada ampliada, difuminada y teñida con el acento del tipo (`MEDIA_ACCENT`).
  3. Sin nada (obra manual recién creada): degradado del acento sobre `--surface-muted`.
- Barra superior de **móvil**: volver · etiqueta del tipo centrada · menú ⋯ (`menuSlot`).
- Portada con `ImageZoom` y borde de 2px del acento, **pintada una sola vez**.
- Etiqueta de tipo (en PC, con año y duración/cadena en mono), título en serif, byline, nota
  media con `RatingDots` y recuento de valoraciones.
- El slot de la tarjeta (`passCard`).

Distribución:

- **Móvil**: backdrop de ~240px; portada (~110px de ancho) montada sobre el degradado con
  título, byline y nota a su lado; la tarjeta debajo, a lo ancho, antes de las pestañas.
- **PC (≥ lg)**: el backdrop ocupa **todo el ancho de la ventana** (~420px de alto); encima,
  el contenedor de ~1320px con portada (~200px) · bloque de título · tarjeta flotante (~300px)
  a la derecha, alineados por abajo.

**`PassCard`** (componente de cliente). Fusión de `ItemRailActions` y `HeroStatusOrFollow`;
lee `useItemStatus` y `useFollow` como hoy.

- Sin pase activo: un único botón «Seguir» (anónimo → login, como hoy).
- Con pase: estado con su punto de color (enlace a `?tab=log`, **conserva
  `data-testid="status-badge"`**), barra de progreso solo donde hay cursor (no en película),
  CTA naranja (`bg-accent`, F3-006: el color del CTA es el del rol, no el del medio) y tu nota.
- Fondo `surface` al 92% con `backdrop-blur` en PC, para que se apoye sobre el backdrop.
- Una sola instancia en el DOM; se recoloca con CSS.

**`ItemShell`** queda como envoltorio fino: `ItemHero` + `tabs`. Sin grid y sin raíl.

**`ItemDetailTabs`** gana un slot `stickyAction`. Un centinela justo encima de la barra y un
`IntersectionObserver` detectan cuándo está pegada; en PC aparece entonces a la derecha una
versión compacta del CTA. En móvil no se muestra (la tarjeta ya está a mano).

**Contenedor común.** El cuerpo de las pestañas abandona `max-w-4xl` / `lg:max-w-none` y usa el
mismo contenedor de ~1320px que el hero, para que los bordes alineen de arriba abajo.

Las tres páginas solo cambian lo que pasan al shell: `backdropUrl` y los datos de la tarjeta
(lo que antes iba a `railActions` y `statusSlot`).

### 2. Datos: `backdrop_url`

- **Esquema**: `backdrop_url text null` en `movies` y `series`. URL completa de TMDB a
  **`w1280`**, mismo formato que `cover_url`. `image.tmdb.org` ya está en `next.config.ts`.
- **Escritura solo por RPC** (lección #676, sin grant directo de UPDATE): `hydrate_movie` y
  `hydrate_series` ganan `p_backdrop_url text default null`, fill-only (solo si la columna es
  NULL). `hydrate_screens_bulk` acepta la clave `backdrop_url` en su jsonb, aunque hoy ningún
  llamador la mande.
- **Grants**: correr la superficie 6 de `docs/DRIFT-CHECK.md`. Escribir por SECURITY DEFINER
  no necesita grant de columna; **leer** sí puede necesitar `grant select (backdrop_url)` si
  `movies`/`series` tienen SELECT por columna. Se verifica con consulta, no se supone.
- **Hidratación**: `ScreenDetails` gana `backdropUrl`, que se mapea desde `backdrop_path` en
  `getMovieDetails`/`getSeriesDetails` (misma respuesta, cero peticiones nuevas).
  `ensureItemEnriched` añade un guard propio, `needsBackdrop(item) = item.backdropUrl == null`,
  **independiente** de créditos y tamaños, por la misma razón que documenta
  `needsSizeHydration`: si no, las obras que ya tienen ambos no lo pedirían nunca.
- Obra sin backdrop en TMDB: se queda NULL y reintenta al abrirse. El `fetch` ya se cachea
  24h (`revalidate: 86400`), así que el coste es como mucho una llamada por obra y día. Se
  prefiere eso a inventar un valor centinela.
- Al escribirse, la ficha expira su caché en `after()` (patrón de `expireItemCredits`).
- **Sin backfill masivo**: cada ficha se completa la próxima vez que alguien la abre
  (el curador de la propia ficha). Mientras, se ve la portada difuminada, que es un estado válido.
- **Orden**: dev (`supabase-dev`) → prod, verificando contra `pg_proc`/`information_schema`,
  no contra el ledger. Registrar la migración en el manifiesto del bootstrap (lo que falló en
  #1201). Actualizar `docs/requirements/data-model.md` y su fecha.
- **#437**: el backdrop es igual para todo el mundo y viaja en la fila de la obra que el hero
  ya lee. No se añade ningún `use cache`.

### 3. Cuerpo de las pestañas

**Info**, rejilla `1fr | 340px` en los tres tipos (la columna de datos, sticky):

| | Columna principal | Columna de datos |
|---|---|---|
| Película | Sinopsis → Reparto (fila de 8, «+N») → Saga (tira de portadas) → Versiones | Ficha técnica + géneros → Dónde verla |
| Serie | Sinopsis → Reparto → Saga | Ficha técnica + géneros → Dónde verla |
| Libro | Sinopsis → Saga → Ediciones | Ficha técnica + géneros |

- El reparto deja de ir «a lo ancho» sobre las dos columnas y pasa a la principal.
- `SagaStrip`, hoy `lg:hidden`, vuelve en PC a la columna principal.
- En móvil **no cambia el orden** decidido en el plan 06; se mantiene `display:contents` + `order`.

**Comunidad y Registro** ya son `1fr | 340px` (`community-panel.tsx`, `log-panel.tsx`). Con el
contenedor nuevo la principal pasa de ~390 a ~930px sin tocar la rejilla. Ajustes: el `top` del
lateral sticky (ahora se mide desde las pestañas, no desde el raíl) y un tope de lectura
(~70ch) para reseñas y diario.

**Episodios**: el PC·1 de tres columnas de `Paper - Episodios (escala y PC).html`:
`temporadas 220 | episodios 1fr | detalle 340`. En PC el detalle pasa a la tercera columna en
vez de desplegarse bajo su fila; en móvil no cambia. La rejilla de PC no se toca (plan 06 §6e).

### 4. Casos límite

- **Títulos largos**: la serif de PC baja de 44 a 34px a partir de un umbral de caracteres;
  hasta 3 líneas.
- **lg estrecho (1024–1150px)**: la tarjeta no baja de 260px; si no cabe, cae **debajo** del
  bloque de título en vez de aplastarlo.
- **Legibilidad**: nunca hay texto sobre la imagen nítida; el degradado llega a `--background`
  antes del título. Verificar también en **oscuro** (degradado hacia `#1f1a16`).
- **Rendimiento**: el backdrop es el LCP → `next/image` con `priority` y `sizes="100vw"`.
- **Anónimo**: tarjeta con «Seguir», como hoy.

## Entrega por fases

| PR | Contenido | Toca datos |
|---|---|---|
| 1 | `backdrop_url` + RPC + `ScreenDetails` + guard + data-model | Sí |
| 2 | `ItemHero` único + `PassCard` + `stickyAction` + contenedor de ~1320px; fuera raíl y tope de 1200px | No |
| 3 | Info a `1fr \| 340px` en los tres tipos + ajustes de Comunidad y Registro (se separan en su propia PR si crece) | No |
| 4 | Episodios en PC·1 de tres columnas | No |

La PR 2 no depende de la 1: sin backdrop cae a la portada difuminada.

## Pruebas

- **Vitest**: mapeo de `backdrop_path` → `backdropUrl` en los detalles de TMDB; `needsBackdrop`;
  la elección de fondo del hero (backdrop → portada teñida → degradado).
- **Playwright, contra build de producción** (regla #437):
  - Actualizar `pase-hub.spec.ts`, `serie-resenas-de-pase.spec.ts` y
    `coleccion-status-contrast.spec.ts` donde localicen el raíl o la píldora de estado.
  - Nueva `ficha-cinematica.spec.ts`: a 1600px el cuerpo de Info mide > 1100px (el bug de los
    771px, con número); la tarjeta muestra estado y CTA; el CTA aparece en la barra de pestañas
    tras hacer scroll; a 375px la tarjeta está bajo el hero y no hay scroll horizontal.
- **Visual**: capturas de libro, película y serie a 375 y 1600px, en claro y oscuro, en cada PR
  de UI.

## Documentación al cerrar

- `docs/requirements/data-model.md` (PR 1).
- Entrada al final de `docs/requirements/decisiones.md`: se abandona el shell de raíl lateral del
  plan 06 y por qué.
- Nota en `docs/redesign/plan-06-ficha.md` §6e: el choque de shells se resolvió a favor del
  shell sin raíl.
- `docs/architecture/graph.json`: nodo `c-detail`.
- Issues de la fase 2, una por bloque, con `area:ui` o `area:catalogo`, `tipo:feature`, `P3`.
