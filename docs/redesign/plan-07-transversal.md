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

## 1. Estado actual

| Pieza | Archivo | Estado |
|---|---|---|
| Nav inferior | `src/components/nav/bottom-nav.tsx` | Fiel al `.tabbar`: mono 10px, activo accent, blur, safe-area. Iconos propios. |
| Nav escritorio | `src/components/nav/side-nav.tsx` | **SideNav lateral** en sm+ (las maquetas de escritorio usan topbar horizontal — ver P-T1). |
| Topbar | `src/components/header.tsx` | Wordmark + campana + theme toggle; no navega. |
| Notificaciones | `src/components/social/notification-bell.tsx`, `social/follow-requests.tsx`, `push/push-toggle.tsx` | Campana con dropdown; push toggle existe. |
| Estados | `src/components/ui/empty-state.tsx`, `retry-button.tsx`, `social/private-profile-stub.tsx`, `src/app/offline/` | Los 6 estados tienen equivalente. |
| Iconos | `src/components/ui/icons.tsx` | Set propio (no hay librería fijada; el handoff sugiere lucide-react o equivalente, trazo ~1.8 redondeado). |
| Marca | `src/components/ui/wordmark.tsx`, `AppLogoIcon` | Wordmark "Biblio**share**" ✔. Logo estantería/app icon: revisar manifest y splash. |
| Onboarding | `src/app/onboarding/` | Existe; comparar contra las 4 pantallas de la maqueta. |
| Tema | `globals.css` + `theme-toggle.tsx` | Tokens Paper light/dark ya aplicados (base del rediseño, mergeada). |

## 2. Trabajo transversal (hacer sin preguntar)

1. **Notificaciones contra la maqueta A/B** — dropdown anclado a la campana: no leídas con **dot de acento + fondo sutil**, se marcan leídas al abrir, solicitudes de seguir con aceptar/rechazar **en línea**; vacío con ilustración sobria + **toggle de push**. Comparar `notification-bell.tsx` (y decidir dónde viven las solicitudes si el plan 05-P1 las mueve aquí).
2. **Estados 1–6** — pasar por cada uno con la maqueta al lado: perfil privado (stub ✔), colección vacía propia, feed vacío (CTA a descubrir gente → ¿enlaza a Buscar·Personas?), búsqueda sin resultados (alta manual ✔), error con reintentar, offline (PWA solo-lectura). Afinar composición del `empty-state.tsx` (glifo, título serif, texto, CTA) contra los frames.
3. **Auditoría de iconos** — principio de marca: *línea sobria, trazo ~1.8 redondeado, monocromo `currentColor`, sin emoji*. Revisar `icons.tsx` icono a icono; los glifos unicode de las maquetas (⌕ ▦ ◔ ❖…) son placeholders, no el set final. Si el set propio ya cumple, no hay que migrar a lucide (ver P-T4).
4. **Onboarding** — 4 pantallas (intereses → primeros títulos → gente y clubes → bienvenida). Comparar `src/app/onboarding/` con la maqueta; mismo tratamiento cover-forward y serif.
5. **Login/registro con marca** — `Biblioshare - Marca en producto.html` trae login/registro y splash con el wordmark y los tres lomos. Comparar `(auth)/login` y `signup`.
6. **App icon + manifest** — ruta recomendada: tres lomos sobre terracota, esquinas 24%. Revisar manifest/íconos PWA (agente pwa-shell) y generar assets si faltan.
7. **Modo oscuro** — al cerrar cada plan 01–06, pasar las pantallas de `Modo oscuro(.resto).html`; los tokens ya existen, esto es caza de hardcodes.
8. **Admin (ruta oculta)** — frame 4 de `Paper - Colas, Retos, Usuarios, Admin.html`: topbar con chip mono "ADMIN" teñido, tabla de usuarios con rol editable (usuario/colaborador/admin) y acciones suspender/banear/eliminar. Comparar `src/app/admin/page.tsx`; la entrada es el enlace del perfil propio (ya así).

## 3. Decisiones transversales — COMENTAR ANTES DE IMPLEMENTAR

> Estas preguntas afectan a varios planes; conviene resolverlas ANTES de empezar las sesiones por pestaña.

- **P-T1 · Nav de escritorio: ¿topbar horizontal o SideNav?** Todas las maquetas de escritorio (Home B, Colección C, Buscar C) usan **topbar horizontal** (wordmark + Inicio·Colección·Buscar·Clubes + iconos búsqueda/perfil/avatar). La app usa SideNav lateral en sm+, decisión del rediseño. Fidelidad estricta = topbar. ¿Cambiamos o mantenemos SideNav?
- **P-T2 · Subtabs: ¿serif (maqueta) o mono (patrón actual)?** Las maquetas pintan las subtabs de Perfil/Colección/Club en **Fraunces serif 15–15.5px**; la app las unificó en **mono uppercase** ("subtabs en mono es patrón", decisión previa del rediseño). Una sola decisión para toda la app (afecta a planes 02, 04, 05; la ficha usa sans y va aparte). 
- **P-T3 · Topbar contextual por sección.** Las maquetas ponen el título de la sección en el topbar ("Mi colección" con barrita de acento, "Buscar", "Clubes" con + Crear) y acciones contextuales; la app tiene un header global fijo (wordmark + campana + tema) y el título dentro de la página. ¿Adoptamos topbar contextual (más fiel, más obra) o mantenemos el header global?
- **P-T4 · ¿Migrar iconos a lucide-react?** Solo si la auditoría (§2.3) encuentra el set propio inconsistente. Migrar es mecánico pero toca toda la app.
- **P-T5 · §3.8 Estadísticas y features (muro de stats, stats diarias con anillos, calendario con portadas, memorizar notas/citas, sorteo de cartas/estantería, "¿qué has disfrutado hoy?").** Son **features nuevas**, no fidelidad — la mayoría ni existe. Propuesta: sacarlas de esta iniciativa y tratarlas como epic aparte cuando toque. ¿De acuerdo? (El "muro" podría absorber parte del Panel del perfil en el futuro.)
- **P-T6 · Excerpt/texto secundario `#584f43`.** Varias maquetas usan un marrón intermedio entre `foreground` y `muted-foreground` para texto de reseñas/sinopsis. ¿Se añade token (`--foreground-soft` o similar) o se aproxima con `text-foreground/75`? Una decisión, se aplica en 01/04/06.

## 4. Tareas

1. **Resolver P-T1…P-T6 con el usuario** y anotar las decisiones aquí. Sin esto no arrancar las sesiones de los planes 01–06 que dependan de ellas.
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
