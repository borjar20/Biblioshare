# Iniciativa: fidelidad Paper

Planes por pestaña para acercar el producto a las maquetas del handoff
(`Biblioshare_mockups/Biblioshare/design_handoff_biblioshare_paper/`, fuera del repo).
La base del rediseño (tokens, fuentes, IA nueva, componentes) ya está mergeada;
esto es la pasada de **fidelidad**: que cada pantalla calque su frame.

## Cómo usar estos planes

- **Una sesión por plan** (Clubes admite 2–3). Cada plan es autocontenido: estado actual → diferencias visuales → divergencias funcionales → tareas → verificación.
- **Antes de la primera sesión**: resolver las decisiones transversales **P-T1…P-T6** del plan 07 — varias bloquean tareas de los otros planes.
- Las secciones **"Divergencias funcionales — COMENTAR ANTES DE IMPLEMENTAR"** son literales: ahí no se asume nada, se pregunta al usuario y se anota la decisión en el propio doc (regla de la iniciativa).
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

0. **00 Navegación** (fases A+B: skeletons + streaming) — cambia cómo se estructuran las páginas, así que va antes de restylearlas; sus preguntas P-N1…P-N4 se pueden resolver junto a las P-T.
1. **07 (decisiones)** → desbloquea el resto.
2. **06 Ficha** (pantalla núcleo; coordinar con pases) o **02 Colección** (autocontenida).
3. 01 Inicio · 03 Buscar (cortas).
4. 05 Perfil (corta, ya muy fiel).
5. 04 Clubes (la más larga, trocear).
6. Cierre: pasada de modo oscuro + estados (07 §2.2, §2.7).

## Fuera de alcance (decidido en los planes, pendiente de confirmar)

- Colección v2 (colecciones curadas) — feature nueva completa (plan 02, P1).
- §3.8 Estadísticas y features (muro, sorteo, notas/citas, registro en un toque) — epic aparte (plan 07, P-T5).
- Quick-add desde Buscar — contradice la escalera de hidratación (plan 03, P1).
