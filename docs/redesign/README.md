# Iniciativa: fidelidad Paper

Planes por pestaña para acercar el producto a las maquetas del handoff
(`Biblioshare_mockups/Biblioshare/design_handoff_biblioshare_paper/`, fuera del repo).
La base del rediseño (tokens, fuentes, IA nueva, componentes) ya está mergeada;
esto es la pasada de **fidelidad**: que cada pantalla calque su frame.

## Principio responsive (aplica a todo)

Los mockups son **mobile-first**: casi todos los frames son de teléfono. En móvil se calca el frame; en **tablet y escritorio se mantiene la estética Paper pero se aprovecha el espacio lateral** con dos columnas, rails sticky y grids anchos — nada de "móvil estirado" en una columna centrada. Donde un plan no trae frame de escritorio (Clubes, Ficha, actividad, notificaciones), el layout ancho es diseño propio a proponer antes de codificar. Norma completa y patrones en [plan 07 §0 + decisión P-T7](./plan-07-transversal.md).

## Cómo usar estos planes

- **Una sesión por plan** (Clubes admite 2–3; Colección ahora incluye v2 con 2 sesiones extra). Cada plan es autocontenido: estado actual → diferencias visuales → decisiones → tareas → verificación.
- **Decisiones RESUELTAS (2026-07-15):** todas las preguntas (P-N, P-T y las P de cada plan) están contestadas y anotadas en la §3 de cada doc. Si al ejecutar surge una divergencia nueva, se pregunta — no se asume (regla de la iniciativa).
- Método de trabajo en cada sesión: abrir la maqueta `.html` en el navegador (canvas pannable, es pixel-perfect) y comparar lado a lado con la app en dev, light y dark, antes y después.
- Verificación: e2e con Playwright (`docs/TESTING.md`); recordar `fnm use` (Node 22) antes de `npx playwright test`.
- **Regla de los dos árboles (salió del plan 06, confirmada en el 01):** cuando una pantalla pinta lo mismo en dos árboles por breakpoint (`lg:hidden` / `hidden lg:block`), el que no toca **se queda en el DOM, oculto**. La suite corre a **1280**, así que **todo locator lleva `:visible`** (`page.locator("h1:visible")`, `locator("visible=true")`). Ya ha roto tests dos veces: 5 asserts en la ficha (#50) y 2 en el feed (#69). El patrón solo es seguro para **duplicados sin estado**.
- **Si cae media suite de golpe, mira la carga de la máquina antes que tu código** — con varias sesiones en paralelo el home autenticado pasa de 4 s a 20 s y caen 15+ tests con asserts inconexos. Y no montes un A/B con el server exhausto en una rama y recién arrancado en la otra: eso mide el cansancio, no tu cambio.

## Planes

| # | Plan | Ámbito | Dependencias |
|---|---|---|---|
| 00 | [Navegación y carga](./plan-00-navegacion.md) | Skeletons, loading.tsx, Suspense/streaming | ✅ **HECHO** (PR #44, mergeado) — lee su **regla del 404** antes de añadir cualquier `loading.tsx` |
| 01 | [Inicio](./plan-01-inicio.md) | Feed, filtros, escritorio, bloque de hoy | ✅ **CERRADO** (T1–T6, PRs #69/#70/#71). Lee su **§6 Hallazgos**: `getFeed` devuelve `FeedEntry[]` y el filtro es `?filtro=` |
| 02 | [Colección](./plan-02-coleccion.md) | General/tipos/colas, resumen, grid | Colección v2 = posible epic aparte (P1) |
| 03 | [Buscar](./plan-03-buscar.md) | Títulos, personas, alta manual, escáner | Escalera de hidratación ya decidida (P1/P2) |
| 04 | [Clubes](./plan-04-clubes.md) | Landing, club, actividades, gestión, wizard | 2–3 sesiones; PR #13 tierlist |
| 05 | [Perfil](./plan-05-perfil.md) | **Reescrito v2** (2026-07-17): Actividad/Estadísticas/Rincón, `/estadisticas`, Memorizar, sorteo | **6 fases, ~5 sesiones**; bloqueado por D2 (destacados en plan 02) |
| 06 | [Ficha de título](./plan-06-ficha.md) | Hero, Info, Comunidad, Registro, Episodios, Moderador, ediciones | ✅ **CERRADO** (T1–T8 + verificación, PR #68). Ojo al **choque de shells** de su §6e: el cuerpo de la ficha topa en 771px |
| 07 | [Transversal](./plan-07-transversal.md) | Nav, notificaciones, estados, marca, onboarding, **decisiones P-T** | Base (P-T1/P-T2/P-T6) ✅ **HECHA** (PR #46) — ver su **§6 Hallazgos**; el resto sigue abierto |

## Orden sugerido

0. ~~**00 Navegación**~~ ✅ **HECHO y mergeado** (PR #44; fase C descartada por ahora). Las páginas ya nacen con su shell + `<Suspense>` por sección: **al restylear, respeta esa estructura** y no metas un `loading.tsx` en rutas con `notFound()` (regla del 404 en el plan 00). De paso salió el arreglo del #45 (hoja de cierre y StrictMode).
1. ~~**07 base transversal**: topbar horizontal de escritorio (P-T1), token `--foreground-soft` (P-T6), subtabs serif (P-T2)~~ ✅ **HECHA** (PR #46). Del plan 07 sigue pendiente todo lo demás (topbar contextual P-T3, notificaciones, estados, iconos, onboarding, marca). Antes de restylear una pestaña, **lee el [§6 del plan 07](./plan-07-transversal.md)**: Perfil es el avatar en escritorio y los subtabs de la ficha siguen pendientes a propósito (plan 06). El token `--foreground-soft` **ya está aplicado en 01 y 06**; queda por aplicar en **04 Clubes**.
2. ~~**06 Ficha**~~ ✅ **CERRADO** (2026-07-17): T1–T8 mergeadas y verificación de cierre pasada (PR #68). Antes de tocar cualquier escritorio, lee su **§6e**: mientras la ficha conserve el raíl lateral, el cuerpo de sus pestañas **topa en 771px a cualquier viewport**, y las maquetas nuevas están dibujadas para ~1160.
3. ~~**01 Inicio**~~ ✅ **CERRADO** (2026-07-17): T1–T4 (#69, clubes en el feed, filtros `?filtro=`, rail de escritorio, frame A fiel), T5 (#70, el bloque "¿Qué has disfrutado hoy?") y T6 (#71, "Para más tarde"). Del frame G **no queda nada por construir**: "Registrar algo nuevo" fue descartado por el usuario, no aplazado. Si vas a tocar el Inicio, lee su **§7** (por qué el rail perdió "Ahora mismo" y conservó "Racha") y su **§9**. · Siguiente: **03 Buscar** (corta).
4. **05 Perfil — REPLANIFICADO (2026-07-17) contra `Paper - Perfil v2.html`**, que deroga las maquetas viejas del perfil. Ya no es una sesión de fidelidad: son **6 fases** (F1 estructura · F2 estadísticas · F3 Memorizar · F4 sorteo · F5 `/estadisticas` · F6 exportar), y de F2 en adelante **todas llevan migración**. F1 y F2 se pueden mergear solas. **Antes de empezar, lee su §3** (10 decisiones, incluida la P2 vieja que queda sustituida) **y su §5** (D2: si el plan 02 no aloja los destacados en `/coleccion`, F1 se los carga).
5. 04 Clubes (la más larga: 3 sesiones con progreso real e invitaciones).
6. **02 Colección v2** (2 sesiones: migración+grid, Todo+hoja añadir).
7. Cierre: hojas de sesión+cronómetro (06 P4), calendario con portadas (07 P-T5), pasada de modo oscuro + estados.

## Fuera de alcance (decidido 2026-07-15)

- Fase C de navegación (`cacheComponents`/`use cache`) — reevaluar tras medir A+B (plan 00, P-N1).
- ~~§3.8 salvo lo aprobado: muro de stats, stats diarias, notas/citas y sorteo van a epic aparte (plan 07, P-T5).~~ **REVERTIDO el 2026-07-17**: el mockup `Paper - Perfil v2.html` mete el muro de stats, las notas/citas ("Memorizar") y el sorteo **dentro del perfil**, y el usuario lo aprobó como plan por fases. Ya no hay epic aparte: viven en el [plan 05](./plan-05-perfil.md) (F2–F5). **Entran** también: calendario con portadas y "¿qué has disfrutado hoy?".
- **Gasto** (la tarjeta "24 € este mes" del frame J del perfil v2) — no hay precio en ninguna tabla; depende del ejemplar/acceso, que es la **fase 2 del pase**. Fuera hasta entonces (plan 05, P8).
- **Exportar tarjetas de estadísticas** (el ↧ de la topbar del frame J) — solo se exporta la **cita** de Memorizar (plan 05, P10). Nada de botones muertos mientras tanto.
- Quick-add y editorial·páginas en Buscar — la escalera de hidratación manda (plan 03).
- "Compartir" en el feed — pospuesto hasta tener destino claro (plan 01, P4).
- Chips de recuento en Buscar·Personas — idea futura anotada: tags de géneros favoritos + logros por usuario (plan 03, P3).
