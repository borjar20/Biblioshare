# Fidelidad Paper · 01 — Inicio (Feed)

> Parte de la iniciativa **fidelidad Paper** (una sesión por pestaña). Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- `Paper - IA nueva (Inicio + Perfil).html` → frame **A · Inicio · Feed** (móvil, la verdad vigente)
- `Paper - Home (feed + stats).html` → frame **B · Escritorio · feed + barra lateral** (dos columnas)

**Objetivo:** que la pestaña Inicio (`/`) sea indistinguible del frame A en móvil, y decidir/implementar el layout de escritorio del frame B.

---

## 1. Estado actual

| Pieza | Archivo | Estado |
|---|---|---|
| Página | `src/app/page.tsx` | Feed-only (IA nueva aplicada en PR #28). Una sola columna `max-w-2xl` en todos los breakpoints. |
| Tarjeta de feed | `src/components/social/feed-card.tsx` | Muy fiel: avatar 34px, portada 52×78 con `shadow-cover`, título serif 14px, autor itálica serif 11px, RatingDots, excerpt 12.5px. |
| Filtros | `src/components/social/feed-filters.tsx` | Chips mono uppercase con activo teñido de accent (patrón correcto). Set actual: Todo · Libros · Películas · Series · Solo reseñas. |
| Lista + paginación | `src/components/social/feed-list.tsx` | Cursor + carga incremental. |
| Topbar | `src/components/header.tsx` | Ya es Paper: sticky, blur, wordmark, campana, theme toggle. No navega (nav en BottomNav/SideNav). |
| Datos | `src/lib/social/feed.ts` | Eventos de personas (reseñas, terminados, altas). **No hay eventos de clubes.** |

Lo grueso del frame A ya está hecho. Lo que queda es (a) detalles finos de la tarjeta, (b) el layout de escritorio, y (c) decisiones funcionales.

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

1. **Cabecera de página** — Maqueta: `h1` "Novedades" en **Fraunces 600 24px** + contador `sigues a 24` en mono 11px a la derecha (misma línea, `align-items:baseline`). Actual (`page.tsx:69`): `text-2xl font-semibold` **sin `font-serif`**. Añadir `font-serif` y verificar el peso (600).
2. **Excerpt de reseña** — Maqueta `.fitem .tx`: color `#584f43` (un marrón más oscuro que `--muted`), `line-height:1.55`. Actual (`feed-card.tsx:127`): `text-muted-foreground` `leading-relaxed`. Es un color intermedio entre `foreground` y `muted-foreground`; opciones: `text-foreground/80` o un token derivado. En dark el equivalente de maqueta (Modo oscuro.html) hay que comprobarlo antes de fijar valor.
3. **Fila de reacciones** — Maqueta `.frx`: separador `border-top: 1px solid var(--border)` con `padding-top:11px; margin-top:12px`, texto 11.5px muted, iconos ♥ y ❝ con gap 16px. Verificar `review-interactions.tsx` contra esto (separador y tamaños).
4. **Dot de estado en evento "añadió"** — Maqueta frame A (línea 237): texto del estado en **el color del estado** (`color:var(--st-planned)`, weight 600, 11px), no en muted. Actual (`feed-card.tsx:117`): `text-muted-foreground`. Cambiar a texto teñido por estado (`text-status-planned` etc. — comprobar que existen esas utilidades de texto; si no, añadirlas en `globals.css`).
5. **Espaciados de página** — Maqueta: cabecera `padding:18px 20px 8px`, cuerpo `12px 20px 22px`, gap entre filtros y primera tarjeta 16px, entre tarjetas 12px. Actual: `gap-6 px-4 py-8`. Ajustar a ritmo de la maqueta (py más corto arriba, gap 3 entre tarjetas).

## 3. Divergencias funcionales — RESUELTAS (2026-07-15)

- **P1 · DECIDIDO: SÍ, clubes en el feed.** `getFeed` emite también eventos de los clubes del usuario (nueva actividad, propuestas) y `feed-card.tsx` gana la variante club (badge verde `club-badge`, "N se apuntan"). Desbloquea la Tarea 4.
- **P2 · DECIDIDO: set de la maqueta** — `Todo · Reseñas · Libros · Pantalla · Clubes`. "Pantalla" = películas+series combinado (soportarlo en `getFeed`); "Clubes" filtra los eventos de P1.
- **P3 · DECIDIDO: feed + rail de stats en escritorio** (frame B): dos columnas con rail sticky de 312px reutilizando los componentes del Panel, con el saludo "Hola, {nombre}". Desbloquea la Tarea 3.
- **P4 · DECIDIDO: Compartir se POSPONE** — se decidirá cuando haya un destino claro (share nativo vs compartir a club).
- **Nuevo (P-T5 transversal):** entra el bloque **"¿Qué has disfrutado hoy?"** encabezando el Inicio sobre el feed (frame G de Estadísticas y features) — añadir como tarea propia en la sesión de este plan.

## 4. Tareas

> Cada tarea es independiente y committeable por separado. Las de §3 solo tras decisión.

### Tarea 1 — Afinado visual de la página del feed
- **Modificar:** `src/app/page.tsx`
- `h1`: `className="font-serif text-2xl font-semibold tracking-tight"` (Fraunces ya es la font-serif del proyecto).
- Contenedor: pasar de `gap-6 … py-8` a cabecera/cuerpo con el ritmo de la maqueta (`pt-5 pb-2` cabecera, `gap-4` filtros→lista).
- Verificar en `feed-list.tsx` que el gap entre tarjetas sea 12px (`gap-3` o `mb-3`).
- **Prueba:** `npm run dev`, comparar lado a lado con el frame A (abrir la maqueta en el navegador). Ejecutar e2e de feed si existe (`npx playwright test`, spec de feed) — solo debe cambiar estilo, no estructura de datos.
- Commit: `style(feed): cabecera serif y ritmo de espaciado del mockup IA nueva`

### Tarea 2 — Tarjeta de feed: excerpt, reacciones y dot de estado
- **Modificar:** `src/components/social/feed-card.tsx`, `src/components/social/review-interactions.tsx`, quizá `src/app/globals.css`
- Excerpt: subir contraste (equivalente a `#584f43` → p. ej. `text-foreground/75`); mantener 12.5px/1.55.
- Estado en "añadió": `text-status-{status}` en vez de muted (añadir utilidades de texto por estado si faltan).
- Reacciones: separador superior + 11.5px + gap 16px si no coincide ya.
- **Prueba:** feed con reseña, terminado y alta (usuario dev con datos); light y dark. E2e existentes de interacciones deben seguir verdes.
- Commit: `style(feed): tarjeta fiel al mockup (excerpt, estado y reacciones)`

### Tarea 3 — (bloqueada por P3) Layout de escritorio
- Si se aprueba el rail: **modificar** `src/app/page.tsx` a grid `lg:grid-cols-[1fr_312px]` con `<aside>` sticky (`top-20`) reutilizando `now-consuming.tsx`, `stats/weekly-strip.tsx`, `stats/streak-card.tsx`, `stats/book-goal-card.tsx`, `stats/goal-rows.tsx` (los mismos del Panel de Perfil — extraer a un componente compartido `src/components/stats/stats-rail.tsx` para no duplicar queries: las funciones de datos ya existen para el Panel).
- Si se rechaza: solo ensanchar tipografía del saludo/cabecera en `lg` si se decide el saludo.
- Commit: `feat(feed): rail de stats en escritorio (mockup Home B)`

### Tarea 4 — (bloqueada por P1/P2/P4) Clubes en feed, filtros nuevos, compartir
- Alcance y plan de datos se detallará cuando haya decisión; tocaría `src/lib/social/feed.ts` (unión con actividad de clubes), `feed-card.tsx` (variante club con `club-badge` verde) y `feed-filters.tsx` (set nuevo).

## 5. Verificación de cierre

- [ ] Frame A y `/` en móvil (viewport 400px) lado a lado: cabecera, filtros, 3 tipos de tarjeta (reseña / terminado / alta) idénticos en composición.
- [ ] Modo oscuro sin regresiones (tokens, nada hardcodeado).
- [ ] `npx playwright test` verde (con Node 22 activo: `fnm use` primero).
- [ ] Preguntas P1–P4 respondidas y registradas aquí (tachar o convertir en tareas).
