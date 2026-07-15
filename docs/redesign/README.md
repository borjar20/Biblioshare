# Iniciativa: fidelidad Paper

Planes por pestaña para acercar el producto a las maquetas del handoff
(`Biblioshare_mockups/Biblioshare/design_handoff_biblioshare_paper/`, fuera del repo).
La base del rediseño (tokens, fuentes, IA nueva, componentes) ya está mergeada;
esto es la pasada de **fidelidad**: que cada pantalla calque su frame.

## Cómo usar estos planes

- **Una sesión por plan** (Clubes admite 2–3; Colección ahora incluye v2 con 2 sesiones extra). Cada plan es autocontenido: estado actual → diferencias visuales → decisiones → tareas → verificación.
- **Decisiones RESUELTAS (2026-07-15):** todas las preguntas (P-N, P-T y las P de cada plan) están contestadas y anotadas en la §3 de cada doc. Si al ejecutar surge una divergencia nueva, se pregunta — no se asume (regla de la iniciativa).
- Método de trabajo en cada sesión: abrir la maqueta `.html` en el navegador (canvas pannable, es pixel-perfect) y comparar lado a lado con la app en dev, light y dark, antes y después.
- Verificación: e2e con Playwright (`docs/TESTING.md`); recordar `fnm use` (Node 22) antes de `npx playwright test`.

## Planes

| # | Plan | Ámbito | Dependencias |
|---|---|---|---|
| 00 | [Navegación y carga](./plan-00-navegacion.md) | Skeletons, loading.tsx, Suspense/streaming | **Pasada previa** — antes que el resto |
| 01 | [Inicio](./plan-01-inicio.md) | Feed, filtros, escritorio | P3 layout escritorio; clubes en feed (P1) |
| 02 | [Colección](./plan-02-coleccion.md) | General/tipos/colas, resumen, grid | Colección v2 = posible epic aparte (P1) |
| 03 | [Buscar](./plan-03-buscar.md) | Títulos, personas, alta manual, escáner | Escalera de hidratación ya decidida (P1/P2) |
| 04 | [Clubes](./plan-04-clubes.md) | Landing, club, actividades, gestión, wizard | 2–3 sesiones; PR #13 tierlist |
| 05 | [Perfil](./plan-05-perfil.md) | Panel/Colección/Actividad, escritorio | PR #30 (objetivos plegados) |
| 06 | [Ficha de título](./plan-06-ficha.md) | Hero, Info, Comunidad, Registro, Episodios, Moderador, ediciones | PR #32/#42 (pases); P1 estrellas vs dots |
| 07 | [Transversal](./plan-07-transversal.md) | Nav, notificaciones, estados, marca, onboarding, **decisiones P-T** | Resolver primero |

## Orden sugerido

0. **00 Navegación** (fases A+B: skeletons + streaming; fase C descartada por ahora) — cambia cómo se estructuran las páginas, va antes de restylearlas. Orden interno: ficha → colección → resto.
1. **07 base transversal**: topbar horizontal de escritorio (P-T1), token `--foreground-soft` (P-T6), subtabs serif (P-T2) — tres tareas cortas que tocan toda la app; mejor antes de los restylings por pestaña.
2. **06 Ficha** (pantalla núcleo; coordinar con PRs #32/#42 de pases) o **02 Colección v1** (autocontenida).
3. 01 Inicio (incluye clubes en feed + "¿qué has disfrutado hoy?") · 03 Buscar (corta).
4. 05 Perfil (incluye el cambio de IA: perfil propio sin Colección).
5. 04 Clubes (la más larga: 3 sesiones con progreso real e invitaciones).
6. **02 Colección v2** (2 sesiones: migración+grid, Todo+hoja añadir).
7. Cierre: hojas de sesión+cronómetro (06 P4), calendario con portadas (07 P-T5), pasada de modo oscuro + estados.

## Fuera de alcance (decidido 2026-07-15)

- Fase C de navegación (`cacheComponents`/`use cache`) — reevaluar tras medir A+B (plan 00, P-N1).
- §3.8 salvo lo aprobado: muro de stats, stats diarias, notas/citas y sorteo van a epic aparte (plan 07, P-T5). **Entran**: calendario con portadas y "¿qué has disfrutado hoy?".
- Quick-add y editorial·páginas en Buscar — la escalera de hidratación manda (plan 03).
- "Compartir" en el feed — pospuesto hasta tener destino claro (plan 01, P4).
- Chips de recuento en Buscar·Personas — idea futura anotada: tags de géneros favoritos + logros por usuario (plan 03, P3).
