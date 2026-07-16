# Fidelidad Paper · 07 — Transversal (nav, notificaciones, estados, marca)

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- Topbars/tabbars de todas las maquetas (patrón común)
- `Paper - Notificaciones.html` (A con avisos, B vacío)
- `Paper - Estados.html` (6 estados: perfil privado, colección vacía, feed vacío, sin resultados, error, offline)
- `Paper - Modo oscuro.html` + `Paper - Modo oscuro (resto).html`
- `Biblioshare - Idea de marca.html`, `Biblioshare - Marca en producto.html` (logo, app icon, splash, login)
- `Biblioshare - Onboarding.html`
- `Paper - Estadísticas y features.html` (§3.8 — features aparte, ver §3)

---

## 0. Principio responsive (2026-07-15) — aplica a TODOS los planes

**Los mockups son mobile-first.** Casi todos los frames son de teléfono (400px); solo Home, Colección y Buscar traen un frame de escritorio (`.win`). Eso **no** significa que el resto deba quedarse en una columna estrecha centrada en pantallas grandes.

**Norma:** en móvil se calca el frame; en **tablet y escritorio se conserva la estética Paper pero se aprovecha el espacio lateral** con layouts de dos (o más) columnas, rails laterales, grids más anchos y agrupaciones que en móvil van apiladas. El objetivo es que la app no se sienta "un móvil estirado" en el navegador.

Patrones a preferir en `md:`/`lg:` (Tailwind), respetando tokens y sin romper el móvil:
- **Contenido + rail lateral sticky** (Inicio: feed + stats; Ficha: contenido + sidebar de metadatos/ediciones; Perfil: overview + destacados).
- **Rejillas más anchas** (Colección/Buscar: 2 col móvil → 5 col escritorio, ya en las maquetas `.win`).
- **Secciones apiladas en móvil que pasan a fila** (bloques del Panel, resumen + "en curso").
- **Ancho máximo generoso** donde hoy hay `max-w-2xl`/`max-w-4xl` cortando la página; subirlo en `lg:` cuando el contenido lo aproveche.
- Anti-regresión: cada layout de escritorio debe **degradar limpio a la columna móvil** y no introducir scroll horizontal.

Donde un plan no trae frame de escritorio (Clubes, Ficha, detalle de actividad, notificaciones), el layout ancho es **diseño propio** guiado por esta norma — al ejecutar esas sesiones, proponer la disposición de dos columnas antes de codificar. Registrado como decisión **P-T7** en §3.

---

## 1. Estado actual

| Pieza | Archivo | Estado |
|---|---|---|
| Nav inferior | `src/components/nav/bottom-nav.tsx` | Fiel al `.tabbar`: mono 10px, activo accent, blur, safe-area. Iconos propios. Conserva las **cinco** entradas (Perfil incluido). |
| Nav escritorio | `src/components/nav/top-nav.tsx` | ✅ **Topbar horizontal** (P-T1, PR #46). SideNav retirada. Cuatro entradas; Perfil es el avatar (§6). |
| Topbar | `src/components/header.tsx` | Wordmark + nav (sm+) + campana + theme toggle + avatar (sm+). Falta el **contextual por sección** (P-T3). |
| Notificaciones | `src/components/social/notification-bell.tsx`, `social/follow-requests.tsx`, `push/push-toggle.tsx` | Campana con dropdown; push toggle existe. |
| Estados | `src/components/ui/empty-state.tsx`, `retry-button.tsx`, `social/private-profile-stub.tsx`, `src/app/offline/` | Los 6 estados tienen equivalente. |
| Iconos | `src/components/ui/icons.tsx` | Set propio (no hay librería fijada; el handoff sugiere lucide-react o equivalente, trazo ~1.8 redondeado). |
| Marca | `src/components/ui/wordmark.tsx`, `AppLogoIcon` | Wordmark "Biblio**share**" ✔. Logo estantería/app icon: revisar manifest y splash. |
| Onboarding | `src/app/onboarding/` | Existe; comparar contra las 4 pantallas de la maqueta. |
| Tema | `globals.css` + `theme-toggle.tsx` | Tokens Paper light/dark ya aplicados (base del rediseño, mergeada) + `--foreground-soft` (P-T6, PR #46) **declarado pero sin aplicar**. |

## 2. Trabajo transversal (hacer sin preguntar)

1. **Notificaciones contra la maqueta A/B** — dropdown anclado a la campana: no leídas con **dot de acento + fondo sutil**, se marcan leídas al abrir, solicitudes de seguir con aceptar/rechazar **en línea**; vacío con ilustración sobria + **toggle de push**. Comparar `notification-bell.tsx` (y decidir dónde viven las solicitudes si el plan 05-P1 las mueve aquí).
2. **Estados 1–6** — pasar por cada uno con la maqueta al lado: perfil privado (stub ✔), colección vacía propia, feed vacío (CTA a descubrir gente → ¿enlaza a Buscar·Personas?), búsqueda sin resultados (alta manual ✔), error con reintentar, offline (PWA solo-lectura). Afinar composición del `empty-state.tsx` (glifo, título serif, texto, CTA) contra los frames.
3. **Auditoría de iconos** — principio de marca: *línea sobria, trazo ~1.8 redondeado, monocromo `currentColor`, sin emoji*. Revisar `icons.tsx` icono a icono; los glifos unicode de las maquetas (⌕ ▦ ◔ ❖…) son placeholders, no el set final. Si el set propio ya cumple, no hay que migrar a lucide (ver P-T4).
4. **Onboarding** — 4 pantallas (intereses → primeros títulos → gente y clubes → bienvenida). Comparar `src/app/onboarding/` con la maqueta; mismo tratamiento cover-forward y serif.
5. **Login/registro con marca** — `Biblioshare - Marca en producto.html` trae login/registro y splash con el wordmark y los tres lomos. Comparar `(auth)/login` y `signup`.
6. **App icon + manifest** — ruta recomendada: tres lomos sobre terracota, esquinas 24%. Revisar manifest/íconos PWA (agente pwa-shell) y generar assets si faltan.
7. **Modo oscuro** — al cerrar cada plan 01–06, pasar las pantallas de `Modo oscuro(.resto).html`; los tokens ya existen, esto es caza de hardcodes.
8. **Admin (ruta oculta)** — frame 4 de `Paper - Colas, Retos, Usuarios, Admin.html`: topbar con chip mono "ADMIN" teñido, tabla de usuarios con rol editable (usuario/colaborador/admin) y acciones suspender/banear/eliminar. Comparar `src/app/admin/page.tsx`; la entrada es el enlace del perfil propio (ya así).

## 3. Decisiones transversales — RESUELTAS (2026-07-15)

- **P-T1 · DECIDIDO: topbar horizontal en escritorio.** Wordmark + Inicio·Colección·Buscar·Clubes + iconos a la derecha, como las maquetas. Se retira SideNav. Tarea nueva §4.7. — ✅ **EJECUTADO** 2026-07-16 (PR #46). Al ejecutarlo se concretó **dónde queda Perfil**: en el avatar (§6.1).
- **P-T2 · DECIDIDO: subtabs en serif Fraunces** (~15.5px, 600, subrayado de acento). Revierte la decisión previa "subtabs en mono" — actualizar la memoria del proyecto. Afecta a planes 02, 04, 05; la ficha va en sans semibold (su maqueta). — ✅ **EJECUTADO** 2026-07-16 (PR #46), ficha excluida a propósito (§6.3).
- **P-T3 · DECIDIDO: topbar contextual por sección.** Título y acciones de cada pestaña en el topbar ("Mi colección" + barrita de acento + ⌕/+, "Clubes" + Crear…). Se hace incremental, una sección por sesión; campana y toggle de tema se recolocan (perfil/ajustes y donde diga la maqueta). — ⏳ **PENDIENTE**, se monta encima de la topbar de P-T1. **Leer §6.2 antes de empezar**: los iconos de la derecha varían por frame y hay un glifo ambiguo sin resolver.
- **P-T4 · DECIDIDO: auditar el set propio primero.** Migrar a lucide-react solo si la auditoría (§2.3) sale mal.
- **P-T5 · DECIDIDO: entran DOS features de §3.8** — **calendario con portadas** (celda del calendario del Panel con portada + barra de intensidad, verde = terminado; sobre `MonthCalendar`) y **"¿Qué has disfrutado hoy?"** (registro del día en un toque encabezando el Inicio sobre el feed → coordinar con plan 01). El resto (muro, stats diarias, notas/citas, sorteo) a epic aparte.
- **P-T6 · DECIDIDO: token nuevo `--foreground-soft`** (light `#584f43` + equivalente dark tomado de las maquetas de modo oscuro) en `globals.css`, aplicado en reseñas/sinopsis/excerpts (planes 01/04/06). — ✅ **DECLARADO** 2026-07-16 (PR #46); el equivalente oscuro que faltaba resulta ser **`#cabfb0`** (§6.4). **Aplicarlo sigue pendiente** en los planes 01/04/06.
- **P-T7 · DECIDIDO: aprovechar el espacio lateral en tablet/escritorio** (ver §0). Los mockups son mobile-first; en pantallas grandes se mantiene la estética Paper pero con dos columnas / rails / grids anchos en vez de una columna centrada. Aplica a todos los planes; donde no hay frame de escritorio, el layout ancho es diseño propio a proponer antes de codificar.

## 4. Tareas

1. ~~Resolver P-T1…P-T6~~ **HECHO 2026-07-15** — decisiones en §3.
1b. ~~**Topbar horizontal de escritorio** (P-T1)~~ **HECHA 2026-07-16** (PR #46). `side-nav.tsx` borrado; nav horizontal nueva en `nav/top-nav.tsx`, montada desde `header.tsx`. Ver §6 para el hallazgo del avatar y el aviso a P-T3.
1c. ~~**Token `--foreground-soft`** (P-T6)~~ **HECHA 2026-07-16** (PR #46). Declarado en `globals.css` en los cuatro sitios (`:root`, `.dark`, `prefers-color-scheme` y `@theme` → utilidad `text-foreground-soft`). **Solo declarado: falta aplicarlo** en reseñas/sinopsis/excerpts — eso es de los planes 01/04/06.
1d. ~~**Subtabs a serif** (P-T2)~~ **HECHA 2026-07-16** (PR #46). `components/section-tabs.tsx`, `app/coleccion/collection-tabs.tsx` y `clubs/club-tabs.tsx` a Fraunces 600 ~15.5px con subrayado de acento. Ojo a las rutas: dos de los tres archivos **no** estaban donde este plan decía (`section-tabs.tsx` cuelga de `components/`, no de `components/nav/`; `collection-tabs.tsx` vive en `app/coleccion/`).
1e. **Features aprobadas de §3.8** (P-T5): calendario con portadas (`stats/month-calendar.tsx`) y "¿Qué has disfrutado hoy?" (bloque nuevo sobre el feed, plan 01) — cada una su sesión corta con spec mínima contra `Paper - Estadísticas y features.html` frames C y G.
2. Notificaciones (§2.1). Commit: `style(notificaciones): dropdown fiel a la maqueta`
3. Estados (§2.2), un commit por estado si hay cambios.
4. Auditoría de iconos (§2.3) → informe corto en este doc + fixes. 
5. Onboarding (§2.4) y auth con marca (§2.5).
6. App icon/manifest (§2.6, con pwa-shell).

## 5. Verificación de cierre

- [ ] Notificaciones A/B, los 6 estados y onboarding comparados con sus maquetas (light y dark).
- [ ] Instalación PWA muestra el icono nuevo.
- [ ] `npx playwright test` verde (Node 22).
- [ ] Decisiones P-T1…P-T6 registradas aquí y reflejadas en los planes 01–06.

## 6. Hallazgos al ejecutar la base transversal (2026-07-16, PR #46)

Lo que las maquetas concretaron y el plan no decía. Todo sale de leer los frames, no de suponer.

### 6.1 Perfil no es una entrada de nav en escritorio: es el avatar

Los **cuatro** frames de escritorio (`Home` B, `Colección` C, `Buscar` C, `Perfil` C) traen la misma topbar: a la izquierda ❖ + wordmark y **cuatro** enlaces (Inicio·Colección·Buscar·Clubes); a la derecha, iconos y un **avatar con degradado** que es la entrada a Perfil. En **móvil** la `.tabbar` sí conserva las **cinco** entradas, Perfil incluida, y la topbar móvil no lleva avatar.

Por eso `nav-items.ts` expone ahora dos cosas: `navItems()` (5, para la tabbar) y `primaryNavItems()` (4, para la topbar). `AppShell` ya hacía una sola lectura de perfil; ahora trae `avatar_url` en esa misma consulta, sin viajes extra.

**Consecuencia para el plan 05 (Perfil):** el acceso al perfil propio en escritorio es este avatar. Tenerlo presente si ese plan recoloca ajustes ⚙ o las solicitudes de seguir.

### 6.2 ⚠️ Aviso para P-T3: los iconos de la derecha varían por frame

No hay un set fijo de iconos en la topbar. Por frame:

| Frame | Iconos a la derecha |
|---|---|
| Home · escritorio | ⌕ · ◔ · avatar |
| Colección · escritorio | ⌕ · ◔ · avatar |
| Buscar · escritorio | ◔ · avatar (**sin ⌕** — ya estás en Buscar) |
| Perfil · escritorio | ⌕ · avatar (**sin ◔**) |
| Topbar móvil | ⌕ · ◔ (sin avatar) |

**Duda NO resuelta, a decidir en P-T3:** el glifo `◔` es ambiguo — puede ser el toggle de tema o la campana de notificaciones. En la `.tabbar` móvil `◔` es el icono de **Perfil**, lo que sugiere que son placeholders reutilizados y no un icono con significado fijo (coherente con §2.3: *los glifos unicode de las maquetas son placeholders, no el set final*).

En la PR #46 **no se tocó nada de esto**: campana y toggle siguen donde estaban. Recolocarlos es explícitamente parte de P-T3.

### 6.3 La ficha se queda fuera de P-T2, y es correcto

`item-detail-tabs.tsx` **no** se pasó a serif. Su frame (`Paper - Ficha de título completa.html`) define `.tab` **sin `font-family`** → sans, 13.5px, 600. Es distinto a propósito de los subtabs de Colección/Perfil/Clubes, que sí piden Fraunces. Coincide con lo que ya decía P-T2 ("la ficha va en sans semibold"). **Pasar la ficha de mono a sans semibold queda para el plan 06**, que es su dueño.

Detalle útil: el `uppercase` de los subtabs era solo CSS (`text-transform`), así que quitarlo **no cambia los nombres accesibles** y los e2e que localizan pestañas por nombre siguen valiendo.

### 6.4 El equivalente oscuro de `--foreground-soft` es `#cabfb0`

`#584f43` no era un token en las maquetas: está **hardcodeado** en tres frames (`Ficha`, `Home`, `IA nueva`), siempre en el mismo rol — prosa larga: `.fitem .tx` (texto del feed), `.review .tx` (reseñas), `.diary-entry .tx`, `.epi-detail .syn` (sinopsis).

El valor oscuro **no hay que inventarlo**: `Paper - Modo oscuro (resto).html` trae el bloque gemelo del feed (mismas clases `.fitem`/`.art`/`.tt`/`.au`/`.rd`/`.tx`/`.frx`) y ahí `.tx` es **`#cabfb0`**.

Sitio del token: entre `--foreground` y `--muted-foreground`. **No** usar `--muted-foreground` para prosa — es para etiquetas.

### 6.5 Rutas reales de los subtabs

Dos de los tres archivos de la tarea 1d no estaban donde este plan decía: `section-tabs.tsx` cuelga de `src/components/` (no de `components/nav/`) y `collection-tabs.tsx` vive en `src/app/coleccion/` (no en `components/library/`). Corregido arriba.
