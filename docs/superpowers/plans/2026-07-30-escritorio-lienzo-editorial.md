# Lienzo editorial para escritorio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Inicio, Mi Biblioteca y Estadísticas una composición de escritorio amplia con un raíl contextual, preservando por completo el comportamiento móvil y los flujos existentes.

**Architecture:** Un componente presentacional `DesktopEditorialLayout` delimita el lienzo, la cabecera/foco y el reparto `main`/`rail` solo desde `lg`. Cada ruta sigue siendo propietaria de sus datos y compone un rail específico; no se crea una sidebar global ni se mueve el estado al cliente. Los `Suspense` y skeletons permanecen junto a las consultas que ya aíslan.

**Tech Stack:** Next.js 16.2 App Router, React 19 Server Components, TypeScript 5, Tailwind CSS 4, next-intl, Vitest y Playwright.

## Global Constraints

- Antes de editar código Next, leer la guía aplicable en `node_modules/next/dist/docs/` y respetar sus avisos de deprecación.
- `passes` es la fuente de estado vivo; no leer ni escribir estado en `library_entries`.
- Solo `lg` y superior usa dos columnas; por debajo hay una columna y el contexto redundante no se pinta.
- No hay migración, RLS, nueva Server Action ni estado de cliente.
- Las cadenas nuevas se añaden a `messages/es.json` y se obtienen con `getTranslations`; una función `t()` no cruza a un componente cliente.
- Mantener clases Tailwind literales; no interpolar nombres de clase dinámicos.
- Usar Node 22 (`fnm use`) antes de pruebas, lint, build o e2e.

---

## File structure

| Archivo | Responsabilidad |
| --- | --- |
| `src/components/layout/desktop-editorial-layout.tsx` | Shell presentacional responsive y semántico de la composición editorial. |
| `src/components/layout/desktop-editorial-layout.test.ts` | Pruebas de markup de los contratos con rail y sin rail. |
| `src/components/library/collection-desktop-rail.tsx` | Resumen y enlaces contextuales de Mi Biblioteca, resueltos en servidor. |
| `src/components/stats/stats-desktop-rail.tsx` | Selector de periodo de escritorio y resumen contextual de Estadísticas. |
| `src/app/(home)/page.tsx`, `loading.tsx` | Adaptar Inicio y su skeleton al shell compartido, reutilizando `StatsRail`. |
| `src/app/coleccion/page.tsx` | Componer el rail de Biblioteca detrás de su propio `Suspense`. |
| `src/app/estadisticas/page.tsx`, `loading.tsx` | Componer Estadísticas con rail y reflejar la geometría durante carga. |
| `messages/es.json` | Etiquetas nuevas del rail de Biblioteca y Estadísticas. |
| `e2e/escritorio-lienzo-editorial.spec.ts` | Cobertura real de escritorio y móvil de las tres rutas. |
| `docs/requirements/decisiones.md` | Registro append-only de la decisión de no crear un rail global. |

### Task 1: Shell editorial presentacional

**Files:**
- Create: `src/components/layout/desktop-editorial-layout.tsx`
- Create: `src/components/layout/desktop-editorial-layout.test.ts`

**Interfaces:**
- Produces: `DesktopEditorialLayout({ header, focus, main, rail, className? })`.
- Contract: `header` y `focus` ocupan todo el ancho; `main` es obligatorio; `rail` es opcional y solo se ve desde `lg`.

- [ ] **Step 1: Leer la guía de composición App Router de la versión instalada.**

Run: `Get-ChildItem node_modules/next/dist/docs -Recurse -File | Select-String -Pattern "Server Components" -List`

Expected: localizar la guía que confirma que el shell puede ser un Server Component sin directiva `use client`.

- [ ] **Step 2: Escribir la prueba de markup que falla.**

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesktopEditorialLayout } from "./desktop-editorial-layout";

it("no reserva rail cuando no se proporciona", () => {
  const html = renderToStaticMarkup(createElement(DesktopEditorialLayout, { main: "principal" }));
  expect(html).toContain('data-editorial-main="true"');
  expect(html).not.toContain('data-editorial-rail="true"');
});
```

- [ ] **Step 3: Ejecutar la prueba para confirmar el fallo.**

Run: `npm test -- src/components/layout/desktop-editorial-layout.test.ts`

Expected: FAIL porque el componente todavía no existe.

- [ ] **Step 4: Implementar el shell mínimo.**

```tsx
import type { ReactNode } from "react";

type Props = { header?: ReactNode; focus?: ReactNode; main: ReactNode; rail?: ReactNode; className?: string };
export function DesktopEditorialLayout({ header, focus, main, rail, className = "" }: Props) {
  return <div data-editorial-layout className={`mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-5 py-6 lg:px-8 ${className}`}>
    {header}{focus}
    <div className={rail ? "mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8" : "mt-5"}>
      <main data-editorial-main>{main}</main>
      {rail ? <aside data-editorial-rail className="hidden border-l border-border pl-6 lg:block">{rail}</aside> : null}
    </div>
  </div>;
}
```

- [ ] **Step 5: Completar los casos de prueba y comprobarlos.**

Add a second case that supplies `header`, `focus` and `rail`, then assert the three `data-editorial-*` markers occur once. Run: `npm test -- src/components/layout/desktop-editorial-layout.test.ts`.

Expected: PASS.

- [ ] **Step 6: Commit the self-contained shell.**

```bash
git add src/components/layout/desktop-editorial-layout.tsx src/components/layout/desktop-editorial-layout.test.ts
git commit -m "feat(ui): add desktop editorial layout shell"
```

### Task 2: Adaptar Inicio y su carga progresiva

**Files:**
- Modify: `src/app/(home)/page.tsx`
- Modify: `src/app/(home)/loading.tsx`
- Modify: `e2e/inicio-feed-agrupado.spec.ts`

**Interfaces:**
- Consumes: `DesktopEditorialLayout` de Task 1 y `StatsRail({ userId })` existente.
- Produces: Inicio con `TodayBlock` atravesando el lienzo y el mismo rail de estadísticas actual, ahora dentro del shell con marcador `data-editorial-rail`.

- [ ] **Step 1: Añadir primero la aserción de escritorio al e2e existente.**

```ts
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/");
await expect(page.locator("[data-editorial-main]")).toBeVisible();
await expect(page.locator("[data-editorial-rail]")).toBeVisible();
```

- [ ] **Step 2: Ejecutar el único e2e y confirmar que falla por los marcadores ausentes.**

Run: `npm run test:e2e -- e2e/inicio-feed-agrupado.spec.ts`

Expected: FAIL en el nuevo locator, no en las aserciones previas del feed.

- [ ] **Step 3: Sustituir el envoltorio manual por el shell compartido.**

```tsx
<DesktopEditorialLayout
  header={<div className="hidden pb-2.5 lg:block">{/* saludo actual de escritorio */}</div>}
  focus={<Suspense fallback={<TodayBlockSkeleton />}><TodayBlock userId={user.id} /></Suspense>}
  main={<div className="min-w-0">{/* filtros y FeedSection actuales */}</div>}
  rail={<div className="sticky top-[calc(var(--topbar-h)+16px)]"><Suspense fallback={null}><StatsRail userId={user.id} /></Suspense></div>}
/>
```

Conservar dentro de esos fragmentos el saludo, filtros y `FeedSection` actuales; no extraer componentes nuevos solo para este cambio. Mantener las mismas `Suspense`, queries, textos y clases de filtros.

- [ ] **Step 4: Reflejar exactamente la nueva geometría en `loading.tsx`.**

Usar el mismo `max-w-[1280px]`, `lg:grid-cols-[minmax(0,1fr)_300px]`, `lg:gap-8` y placeholder de rail. Conservar `TodayBlockSkeleton` antes de la grid para que el bloque de hoy siga reservando su alto y no reabra el CLS #284.

- [ ] **Step 5: Ejecutar la regresión de Inicio.**

Run: `npm run test:e2e -- e2e/inicio-feed-agrupado.spec.ts`

Expected: PASS; el feed, el alta rápida y los tres bloques actuales de `StatsRail` siguen visibles a 1440 px.

- [ ] **Step 6: Commit the Home adaptation.**

```bash
git add src/app/(home)/page.tsx src/app/(home)/loading.tsx e2e/inicio-feed-agrupado.spec.ts
git commit -m "feat(home): widen desktop editorial canvas"
```

### Task 3: Raíl contextual de Mi Biblioteca

**Files:**
- Create: `src/components/library/collection-desktop-rail.tsx`
- Modify: `src/app/coleccion/page.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `getLibrarySummary(supabase, userId)`, `CollectionSummary` y `KnownTab` existentes.
- Produces: `CollectionDesktopRail({ userId, tab })`, Server Component que presenta resumen y enlaces de contexto sin modificar filtros ni URL.

- [ ] **Step 1: Añadir las traducciones del rail antes de implementarlo.**

```json
"collection": {
  "desktopRail": { "title": "Tu biblioteca", "browse": "Buscar títulos", "collections": "Ver colecciones" }
}
```

- [ ] **Step 2: Crear la prueba de interacción de escritorio en el nuevo spec e2e.**

```ts
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/coleccion?tab=todo");
await expect(page.locator("[data-editorial-main]")).toBeVisible();
await expect(page.locator("[data-editorial-rail]")).toContainText(/tu biblioteca/i);
await expect(page.locator("[data-editorial-rail]").getByRole("link", { name: /buscar títulos/i })).toHaveAttribute("href", "/buscar");
```

- [ ] **Step 3: Ejecutar el e2e para confirmar que falla.**

Run: `npm run test:e2e -- e2e/escritorio-lienzo-editorial.spec.ts`

Expected: FAIL porque Biblioteca no usa aún el shell ni existe el texto del rail.

- [ ] **Step 4: Implementar `CollectionDesktopRail` y componerlo con streaming.**

```tsx
export async function CollectionDesktopRail({ userId, tab }: { userId: string; tab: KnownTab }) {
  const supabase = await createClient();
  const summary = await getLibrarySummary(supabase, userId);
  const t = await getTranslations("collection.desktopRail");
  return <div className="grid gap-5"><p className="font-mono text-[11px] tracking-[0.12em] uppercase">{t("title")}</p>
    <CollectionSummary summary={summary} /><Link href="/buscar">{t("browse")}</Link>
    {tab !== "colecciones" && <Link href="/coleccion">{t("collections")}</Link>}</div>;
}
```

In `page.tsx`, wrap it in `<Suspense fallback={null}>` and pass it as `rail` to `DesktopEditorialLayout`, while header, tabs and the existing tab panels form `main`. No duplicar `LibraryFilters`: los filtros continúan sobre la rejilla y la URL permanece igual.

- [ ] **Step 5: Verificar tanto la pestaña por defecto como la filtrada.**

Run: `npm run test:e2e -- e2e/coleccion-general.spec.ts e2e/escritorio-lienzo-editorial.spec.ts`

Expected: PASS; `Colecciones` sigue siendo la pestaña inicial y `?tab=todo` conserva filtros y grid.

- [ ] **Step 6: Commit the library rail.**

```bash
git add src/components/library/collection-desktop-rail.tsx src/app/coleccion/page.tsx messages/es.json e2e/escritorio-lienzo-editorial.spec.ts
git commit -m "feat(collection): add contextual desktop rail"
```

### Task 4: Estadísticas en composición editorial

**Files:**
- Create: `src/components/stats/stats-desktop-rail.tsx`
- Modify: `src/app/estadisticas/page.tsx`
- Modify: `src/app/estadisticas/loading.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `StatsPeriod`, `availableYears()`, `PeriodPills({ current, years })` y el array `cards` ya construido por la ruta.
- Produces: `StatsDesktopRail({ period, years })`, rail de escritorio con selector de periodo y rótulo; el selector mantiene una copia `lg:hidden` en el cuerpo para móvil.

- [ ] **Step 1: Añadir el copy de sección y su aserción e2e.**

Add `stats.desktopRail.period: "Período"` to `messages/es.json`; in `e2e/escritorio-lienzo-editorial.spec.ts` add the authenticated `/estadisticas` case asserting the rail is visible and contains the active period link.

- [ ] **Step 2: Ejecutar el e2e y confirmar que falla.**

Run: `npm run test:e2e -- e2e/escritorio-lienzo-editorial.spec.ts`

Expected: FAIL because Estadísticas still has a single full-width masonry layout.

- [ ] **Step 3: Implementar el rail sin trasladar estado al cliente.**

```tsx
export async function StatsDesktopRail({ period, years }: { period: StatsPeriod; years: number[] }) {
  const t = await getTranslations("stats.desktopRail");
  return <div className="sticky top-[calc(var(--topbar-h)+16px)]"><p className="font-mono text-[11px] tracking-[0.12em] uppercase">{t("period")}</p>
    <div className="mt-3"><PeriodPills current={period} years={years} /></div></div>;
}
```

In `page.tsx`, retain the auth redirect, `Promise.all`, card order and `backHref`; wrap the header and mobile-only `PeriodPills` in `header`, cards in `main`, and `StatsDesktopRail` in `rail`. Do not duplicate statistics cards in the rail.

- [ ] **Step 4: Actualizar el skeleton de Estadísticas.**

Mirror the same 1280 px container, header/full-width mobile period selector, two-column desktop shell and 300 px rail placeholder. Keep cards in the existing responsive masonry within `main`.

- [ ] **Step 5: Ejecutar las pruebas de acceso y selector.**

Run: `npm run test:e2e -- e2e/estadisticas.spec.ts e2e/escritorio-lienzo-editorial.spec.ts`

Expected: PASS; visitante sigue redirigido a login, el selector conserva `?periodo=` y escritorio muestra rail.

- [ ] **Step 6: Commit the stats composition.**

```bash
git add src/components/stats/stats-desktop-rail.tsx src/app/estadisticas/page.tsx src/app/estadisticas/loading.tsx messages/es.json e2e/escritorio-lienzo-editorial.spec.ts
git commit -m "feat(stats): compose desktop editorial rail"
```

### Task 5: Regresión responsive, documentación y cierre

**Files:**
- Modify: `e2e/escritorio-lienzo-editorial.spec.ts`
- Modify: `docs/requirements/decisiones.md`

**Interfaces:**
- Consumes: Los tres contratos `data-editorial-layout`, `data-editorial-main` y `data-editorial-rail` entregados en Tasks 1--4.
- Produces: Cobertura de que no hay rail visible ni overflow en móvil y decisión arquitectónica persistente.

- [ ] **Step 1: Añadir el caso móvil antes de hacer el ajuste final.**

```ts
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/coleccion?tab=todo");
await expect(page.locator("[data-editorial-main]")).toBeVisible();
await expect(page.locator("[data-editorial-rail]")).not.toBeVisible();
await expect(page.locator("body")).toEvaluate((body) => body.scrollWidth <= window.innerWidth);
```

Repeat the same viewport assertion for `/` and `/estadisticas` after login.

- [ ] **Step 2: Ejecutar el spec de regresión y confirmar la línea base.**

Run: `npm run test:e2e -- e2e/escritorio-lienzo-editorial.spec.ts`

Expected: PASS only when desktop rails disappear below `lg` and no route creates horizontal overflow.

- [ ] **Step 3: Registrar la decisión en el documento canónico.**

Append this dated entry: `2026-07-30 — El patrón de escritorio es un shell presentacional de dos columnas desde lg, no una barra lateral global. Cada ruta decide si tiene rail; el contexto redundante no se pinta en móvil. Referencia: docs/superpowers/specs/2026-07-30-escritorio-lienzo-editorial-design.md.`

- [ ] **Step 4: Ejecutar validación completa con Node 22.**

Run: `fnm use; npm run lint; npm test; npm run test:e2e -- e2e/inicio-feed-agrupado.spec.ts e2e/coleccion-general.spec.ts e2e/estadisticas.spec.ts e2e/escritorio-lienzo-editorial.spec.ts`

Expected: todos los comandos terminan con código 0.

- [ ] **Step 5: Inspección visual de tamaños y temas.**

Con el servidor de desarrollo único en `:3000`, comprobar Inicio, Biblioteca y Estadísticas a 1280, 1440 y 1920 px, además de 768 y 390 px, en tema claro y oscuro. Confirmar que ningún rail tapa la topbar sticky y que los skeletons conservan la geometría antes de datos.

- [ ] **Step 6: Commit final de documentación y cobertura.**

```bash
git add e2e/escritorio-lienzo-editorial.spec.ts docs/requirements/decisiones.md
git commit -m "test(ui): cover editorial desktop layout"
```

## Self-review

- **Cobertura del spec:** Task 1 entrega el contrato común; Tasks 2--4 cubren las tres rutas y sus rails concretos; Task 5 cubre móvil, overflow, documentación y regresión. No hay requisito de esquema, datos o escritura sin tarea.
- **Sin placeholders:** cada tarea nombra archivos, contratos, comandos y aserciones concretas; no queda trabajo marcado como indefinido.
- **Consistencia:** todos los consumidores usan los tres atributos emitidos por `DesktopEditorialLayout`; `StatsDesktopRail` consume el mismo `StatsPeriod` que `PeriodPills`; Biblioteca conserva filtros en la columna principal y no introduce una segunda fuente de estado.
