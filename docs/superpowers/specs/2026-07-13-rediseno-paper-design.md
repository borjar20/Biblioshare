# Rediseño Biblioshare · sistema "Paper"

## Contexto

Biblioshare usa hoy un tema morado/rosa (`--background:#ffe9fc`, `--accent:#2c002b`) y una arquitectura de información que ha ido creciendo por acumulación: el header tiene 7 entradas de nav, la home mezcla dashboard privado y feed social en dos pestañas, el perfil duplica ese dashboard en su pestaña "overview", y colas, retos, usuarios y admin cuelgan como rutas sueltas sin jerarquía.

Existe un handoff de diseño completo en `C:\Users\borja\Desktop\Proyects\Personal\Biblioshare_mockups\Biblioshare\design_handoff_biblioshare_paper` (README + `globals.css` + 15 mockups HTML) que propone **Paper**: un sistema cálido y editorial (terracota sobre papel, Fraunces generoso) a medio camino entre Goodreads y Letterboxd, **más** una reorganización de la IA que elimina esas duplicaciones.

Resultado buscado: la app se ve como los mockups y navega como ellos, sin reescribirla. Los HTML son referencia visual, **no código a incrustar** — se recrean con los patrones del codebase (Tailwind v4, `next/font`, `next-intl`, Supabase, `components/ui`).

## Decisiones tomadas

- **Tres fases, un PR cada una.** Cada fase es visible y reversible por separado.
- **`/coleccion` es ruta propia** (tu biblioteca, con las colas dentro). `/u/[otro]?tab=coleccion` es la de otra persona. Sin destinos duplicados en la nav.
- **Las rutas absorbidas se borran** (`/cola`, `/retos`, `/usuarios`), sin redirects. Es seguro: `public/sw.js` solo precachea la página offline y borra las cachés viejas al activar, así que basta con subir `CACHE_NAME` a `biblioshare-v2`.
- **Escritorio: nav lateral en `sm+`** con las mismas 5 entradas que la barra inferior móvil, desde una única fuente de verdad. Sin layouts a dos columnas por ahora.
- **Suspender/ban de usuarios queda fuera.** Es una feature de backend (schema + RLS + política de sesiones) que merece su propio brainstorm. El Admin se repinta pero mantiene solo el cambio de rol.

## Punto de partida (lo que ya está bien)

La tematización del codebase está **muy disciplinada**: casi todo el color sale de tokens CSS y `src/lib/catalog/media-accent.ts` es el punto único para los acentos por tipo. Las tres fuentes (Geist, Geist Mono, Fraunces) ya están cargadas en `src/app/layout.tsx` vía `next/font`. El toggle de tema (`theme-script.tsx` + `theme-toggle.tsx` + clase `.dark`) ya funciona. `episode-grid.tsx` (rejilla de episodios) y `push-toggle.tsx` ya existen.

Por eso la fase 1 es casi solo un reemplazo de `globals.css`.

**Gotcha documentado en `media-accent.ts`:** usar `var(--type-book)`, **no** `var(--color-type-book)` — `@theme inline` no emite las variables. Aplica igual a los nuevos `--gold` y `--green`.

---

## Fase 1 — La piel (Paper)

Cambio de color y tipografía. Cero cambios de ruta, cero cambios de IA.

### 1.1 Tokens
- Reemplazar `src/app/globals.css` por el `globals.css` del handoff. Mismos nombres de token, solo cambian valores; añade `--gold` (estrellas) y `--green` (social/clubes), ambos ya mapeados en `@theme inline`.
- Ojo: el bloque `@media (prefers-color-scheme: dark)` es una copia literal de `.dark`. Se mantiene esa duplicación (el archivo del handoff ya la trae) — es el precio de que el toggle manual gane sobre la preferencia del sistema.
- Verificar contraste de `text-accent-foreground` sobre `bg-accent` en ambos modos.

### 1.2 Los 5 agujeros de color hardcodeado
Estos **no** los arregla el cambio de tokens:

| Archivo | Problema | Arreglo |
|---|---|---|
| `src/lib/series/rating-scale.ts` | `RATING_TIERS` con 6 hex fijos, sin variante oscura → ilegibles sobre el fondo espresso | Convertir a tokens CSS con variante `.dark` |
| `src/components/push/push-toggle.tsx` | knob `bg-white` | `bg-accent-foreground` |
| `src/components/mobile-nav.tsx` | scrim `bg-black/40` | token de scrim (o se elimina con el archivo en fase 2) |
| `src/components/detail/episode-grid.tsx` | punto `bg-white/80` y texto forzado a `#fff` | tokens |
| `src/components/stats/month-calendar.tsx` | caja de error con `border-red-500 / text-red-300` (único uso de paleta Tailwind cruda en `src/`) | `border-status-dropped` / `text-status-dropped` |

### 1.3 Hex que hay que sincronizar a mano
Entornos sin CSS vars — hardcodear es inevitable, pero hay que actualizarlos o la app tendrá el chrome morado:
- `src/app/layout.tsx` → `viewport.themeColor`
- `src/app/manifest.ts` → `background_color` / `theme_color`
- `src/lib/app-icon.tsx` y `src/app/u/[username]/opengraph-image.tsx` → colores del icono e imagen OG

### 1.4 Empujar Fraunces
Hoy `font-serif` solo se usa en 4 sitios (más el `h1,h2,h3` global). Paper lo quiere generoso: títulos de pantalla, títulos de ítem, autor (itálica), cifras grandes y encabezados de sección. Aplicar en `library-item-card.tsx`, `cover-card.tsx`, `feed-card.tsx`, `profile-header.tsx`, `item-hero.tsx` y los `stats/*`. Geist Mono se queda como está (micro-etiquetas, metadatos, contadores) — ese uso ya es correcto.

### 1.5 Consolidar estilos de formulario
`item-manage-panel.tsx` y `app/admin/role-select.tsx` repiten literalmente el mismo string de clases de `select`. Extraer a `src/components/ui/` mientras se repinta.

**Referencia:** `Paper - Guía de estilo.html`, `Paper - Handoff a código.html`, `Paper - Modo oscuro.html`.

---

## Fase 2 — La arquitectura de información

### 2.1 Navegación (el cambio estructural de verdad)
Hoy no existe barra inferior: hay un `header.tsx` con nav inline de 7 entradas y un `mobile-nav.tsx` (drawer). En los mockups **el header deja de navegar** y pasa a ser una topbar contextual (Inicio: logo + buscar + notificaciones; Perfil: título + ajustes). La navegación entera baja a la barra.

- Nuevo `src/components/nav/nav-items.ts` — fuente única: **Inicio** (`/`) · **Colección** (`/coleccion`) · **Buscar** (`/buscar`) · **Clubes** (`/clubes`) · **Perfil** (`/u/[me]`). Iconos del set interno `components/ui/icons.tsx`.
- Nuevo `bottom-nav.tsx` (sticky, móvil) y `side-nav.tsx` (`sm+`), ambos consumiendo `nav-items.ts`.
- Reescribir `header.tsx` como topbar contextual; conserva `NotificationBell` y `ThemeToggle`.
- **Borrar `mobile-nav.tsx`.**
- Admin y Ajustes salen del nav → entradas dentro de la pantalla de Perfil.

### 2.2 Inicio = el Feed
`src/app/page.tsx` pierde las pestañas: pasa a ser el feed social a pantalla completa (`FeedFilters` + `FeedList`, ya existen). **Borrar `src/components/home/home-tabs.tsx`.** Todo el contenido del antiguo tab "panel" (`NowConsuming`, `WeeklyStrip`, `StreakCard`, `MonthCalendar`, `AnnualStats`, `GoalsForm`) se muda a Perfil › Panel — son los mismos componentes, solo cambian de página.

### 2.3 Perfil = Panel · Colección · Actividad
`src/app/u/[username]/page.tsx` cambia sus pestañas de `overview|book|movie|series` a `panel|coleccion|actividad` (`section-tabs.tsx` ya sincroniza con `?tab=`, se mantiene ese mecanismo):
- **Panel** — solo el dueño. El dashboard mudado desde la home, **más los retos personales**. Lleva el aviso "solo tú ves este panel".
- **Colección** — la biblioteca, con las pestañas por tipo dentro (`library-filters.tsx`, `library-item-card.tsx`).
- **Actividad** — pública. `ActivityChart` + `FavoritesShelf` + reseñas recientes. Es lo que ve un visitante.

Esto elimina la duplicación actual Panel↔overview. Un visitante no ve la pestaña Panel. `MonthCalendar` recibe hoy `basePath="/"` — hay que pasarle la nueva base.

### 2.4 Rutas absorbidas
- **`/coleccion`** (nueva): tu biblioteca + **las colas dentro** (reutiliza `src/app/cola/*` y `src/lib/queue/*` tal cual, incluido el drag & drop de `@dnd-kit`).
- **Retos** → Perfil › Panel (reutiliza `src/app/retos/*` y `src/lib/challenges/*`).
- **Usuarios** → conmutador **Títulos / Personas** en `/buscar` (reutiliza `src/lib/profile/search-profiles.ts`).
- **Borrar** `src/app/cola/`, `src/app/retos/`, `src/app/usuarios/`.
- **Subir `CACHE_NAME` a `"biblioshare-v2"` en `public/sw.js`** — imprescindible para que el service worker no sirva las rutas borradas desde caché.
- Los guards de `redirect("/login")` de las rutas borradas se replican en sus nuevos hogares.
- Los deep links de notificaciones (`?tab=community` en páginas de ítem, `src/lib/social/notifications.ts`) no se ven afectados.

### 2.5 i18n
`messages/es.json` es el único locale. Añadir las claves nuevas (nav, sub-pestañas de perfil, aviso de panel privado) y retirar las huérfanas.

**Referencia:** `Paper - IA nueva (Inicio + Perfil).html`, `Paper - Colección.html`, `Paper - Colas, Retos, Usuarios, Admin.html`.

---

## Fase 3 — Las novedades de pantalla

- **Colección › General**: ítems "en curso" **fijados arriba** como tarjetas *continuar* con progreso y borde del color del tipo, y un bloque **Resumen** (total, barra apilada por estado, recuento por tipo).
- **Buscar**: el conmutador Títulos/Personas de la fase 2, ya con el diseño del mockup (el tipo activo tiñe el acento y el borde de las portadas).
- **Estados vacíos y de error** (`Paper - Estados.html`): perfil privado, colección vacía, feed vacío, búsqueda sin resultados, error de carga con reintento, sin conexión. Patrón común: glifo sobrio + título Fraunces + mensaje tenue + acción. Se extrae un componente compartido; `retry-button.tsx` ya existe.
- **Notificaciones** (`Paper - Notificaciones.html`): repintar el dropdown, verificar que al abrirlo se marca todo como leído, y colgar el `PushToggle` (ya existe) al pie.
- **Rejilla de episodios**: `episode-grid.tsx` **ya existe** — solo hay que repintarlo contra `Paper - Episodios rejilla.html` (la escala de tiers ya se habrá tematizado en la fase 1).
- **Clubes** y **Ficha de título**: repaso contra `Paper - Clubes.html` y `Paper - Ficha de título completa.html`. Toda la funcionalidad existe (buddy read, tierlist, list challenge, hitos); es trabajo de piel.
- Sin emoji: glifos e iconos del set SVG interno.

---

## Verificación

No hay red de seguridad visual: Vitest solo cubre funciones puras (`src/lib/**/*.test.ts`) y Playwright tiene un único happy-path sin screenshots. Un rediseño no romperá ningún test — pero ningún test detectará una regresión. Por tanto:

**Automático, en cada fase:**
- `npm run build` (typecheck + lint) y `npm run test`.
- `npx playwright test` — el happy-path debe seguir pasando. En la fase 2 habrá que actualizarlo si toca rutas borradas.

**Manual, en cada fase** (preferencia del proyecto: checklist manual, no E2E de navegador automatizado — ver `docs/TESTING.md`):
Generar un documento de checklist con `npm run dev`, cubriendo:
- **Fase 1**: cada pantalla en claro **y** oscuro; la rejilla de episodios (los tiers de rating eran el peor agujero); el switch de push; el calendario en estado de error; el icono de la PWA y el chrome del navegador (themeColor).
- **Fase 2**: las 5 entradas de nav en móvil y en `sm+`; que `/cola`, `/retos` y `/usuarios` dan 404; que **no** se sirven desde el service worker tras un hard reload (validar el bump a v2); Panel invisible para un visitante; deep links de notificaciones; drag & drop de colas dentro de Colección.
- **Fase 3**: estados vacíos forzando cada condición (cuenta nueva, búsqueda sin resultados, red desconectada).

**Comparación contra el handoff:** cada pantalla contra su archivo HTML de referencia, abriéndolos en paralelo.

---

## Archivos críticos

**Fase 1:** `src/app/globals.css` · `src/lib/series/rating-scale.ts` · `src/app/layout.tsx` · `src/app/manifest.ts` · `src/lib/app-icon.tsx` · `src/app/u/[username]/opengraph-image.tsx` · `src/components/push/push-toggle.tsx` · `src/components/detail/episode-grid.tsx` · `src/components/stats/month-calendar.tsx`

**Fase 2:** `src/components/header.tsx` · `src/components/mobile-nav.tsx` (borrar) · `src/components/nav/*` (nuevo) · `src/app/page.tsx` · `src/components/home/home-tabs.tsx` (borrar) · `src/app/u/[username]/page.tsx` · `src/components/section-tabs.tsx` · `src/app/coleccion/*` (nuevo) · `src/app/cola/`, `src/app/retos/`, `src/app/usuarios/` (borrar) · `src/app/buscar/page.tsx` · `public/sw.js` · `messages/es.json`

**Fase 3:** `src/app/coleccion/*` · `src/components/social/notification-bell.tsx` · `src/components/detail/episode-grid.tsx` · componente de estado vacío (nuevo) · `src/components/clubs/*`

Al terminar cada fase, actualizar `docs/REQUIREMENTS.md` (el subagente `backlog-scribe` se encarga).
