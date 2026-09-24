# Ficha cinemática · PR 3 — Info a dos columnas + ajustes de Comunidad y Registro · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pestaña Info de las tres fichas use el ancho nuevo con la misma rejilla `principal | datos (340px, pegajosa)`, y que Comunidad y Registro dejen de depender de medidas del raíl viejo.

**Architecture:** Un componente de servidor `InfoLayout` con dos slots (`main`, `aside`) que en PC es una rejilla `minmax(0,1fr) | 340px` con la columna de datos pegajosa, y en móvil se aplana con `display:contents` para que cada sección conserve su posición con `order-*` (el orden móvil del plan 06 no cambia). Las tres páginas pasan a componer Info con él. `SagaList` gana `stripShown` para no duplicar la saga principal ahora que la tira de portadas también se ve en PC. Una constante `DETAIL_ASIDE_STICKY` fija el `top` de todos los laterales pegajosos bajo la barra de pestañas.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, Tailwind v4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md` §3. Parte de `main` con las PR 1 (#1206) y 2 (#1209) ya mergeadas.

## Global Constraints

- Rejilla de Info en los tres tipos: `lg:grid-cols-[minmax(0,1fr)_340px]`, hueco `lg:gap-x-11`; la columna de datos pegajosa.
- Orden en PC (columna principal / columna de datos):
  - Película: Sinopsis → Reparto → Saga → Versiones | Ficha técnica + géneros → Dónde verla
  - Serie: Sinopsis → Reparto → Saga | Ficha técnica + géneros → Dónde verla
  - Libro: Sinopsis → Saga → Ediciones | Ficha técnica + géneros
- **En móvil NO cambia el orden** del plan 06:
  - Película: sagas(1) → sinopsis(2) → versiones(3) → reparto(4) → dónde verla(5) → ficha(6)
  - Serie: sagas(1) → sinopsis(2) → reparto(3) → dónde verla(4) → ficha(5)
  - Libro: sagas(1) → sinopsis(2) → ficha(3) → ediciones(4)
- Cada sección se pinta **una sola vez** en el DOM (hoy la ficha del libro se pinta dos veces, una oculta por breakpoint: se acaba).
- `SagaStrip` se ve también en PC; la saga principal no se repite en `SagaList` cuando la tira está visible.
- Laterales pegajosos (Info, Comunidad): `lg:sticky lg:top-[calc(var(--topbar-h)+73px)]` — 49px de la barra de pestañas pegada + 24px de aire. Una sola constante.
- Tope de lectura: sinopsis `max-w-[68ch]`; texto de reseñas y del diario de pases `max-w-[70ch]`.
- El contenedor del panel es `DETAIL_CONTAINER` (`lg:px-10`): nada dentro de la ficha puede seguir usando el `lg:-mx-11 lg:px-11` del panel viejo.
- #437: ningún `use cache` nuevo.
- Node 22: `fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; <comando>` en el mismo comando de PowerShell. `.env.local` en el worktree.

---

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/components/detail/detail-container.ts` | Modificar | + `DETAIL_ASIDE_STICKY` |
| `src/components/detail/info-layout.tsx` | Crear | Rejilla principal/datos de Info |
| `src/components/detail/info-layout.test.tsx` | Crear | Tests de la rejilla |
| `src/components/detail/saga-list.tsx` | Modificar | Prop `stripShown` |
| `src/components/detail/saga-list.test.tsx` | Crear | Tests de `stripShown` |
| `src/components/detail/info-panel.tsx` | Modificar | Solo sinopsis: fuera `sidebar`/`extra`; tope de lectura |
| `src/components/credits-section.tsx` | Modificar | Rejilla de 8 en xl |
| `src/app/libro/[id]/page.tsx`, `src/app/pelicula/[id]/page.tsx`, `src/app/serie/[id]/page.tsx` | Modificar | Info con `InfoLayout` |
| `src/components/detail/community-panel.tsx` | Modificar | `top` del lateral |
| `src/components/detail/review-row.tsx`, `src/components/detail/pass-diary.tsx` | Modificar | Tope de lectura |
| `src/components/detail/catalog-editor.tsx` | Modificar | `lg:-mx-10 lg:px-10` |
| `e2e/ficha-cinematica.spec.ts`, `e2e/sagas-v2.spec.ts` | Modificar | Cobertura / comentario |
| `docs/redesign/plan-06-ficha.md` | Modificar | Nota de orden PC |

---

### Task 1: `InfoLayout`, `DETAIL_ASIDE_STICKY` y `SagaList.stripShown`

**Files:**
- Modify: `src/components/detail/detail-container.ts`
- Create: `src/components/detail/info-layout.tsx`
- Test: `src/components/detail/info-layout.test.tsx`
- Modify: `src/components/detail/saga-list.tsx`
- Test: `src/components/detail/saga-list.test.tsx`

**Interfaces:**
- Produces:
  - `export const DETAIL_ASIDE_STICKY = "lg:sticky lg:top-[calc(var(--topbar-h)+73px)]"`
  - `export function InfoLayout({ main, aside }: { main: ReactNode; aside: ReactNode })` — los hijos de `main`/`aside` llevan su `order-N lg:order-none`.
  - `SagaList` acepta `stripShown: boolean` (obligatoria).

- [ ] **Step 1: Tests que fallan**

`src/components/detail/info-layout.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoLayout } from "./info-layout";
import { DETAIL_ASIDE_STICKY } from "./detail-container";

afterEach(cleanup);

describe("InfoLayout", () => {
  it("pinta principal y datos una sola vez, en ese orden de documento", () => {
    render(
      <InfoLayout
        main={<p className="order-2 lg:order-none">sinopsis</p>}
        aside={<p className="order-3 lg:order-none">ficha</p>}
      />,
    );
    expect(screen.getAllByText("sinopsis")).toHaveLength(1);
    expect(screen.getAllByText("ficha")).toHaveLength(1);
    const main = screen.getByTestId("info-main");
    const aside = screen.getByTestId("info-aside");
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("la columna de datos es la pegajosa y las dos se aplanan en móvil", () => {
    render(<InfoLayout main={<p>a</p>} aside={<p>b</p>} />);
    const aside = screen.getByTestId("info-aside");
    for (const cls of DETAIL_ASIDE_STICKY.split(" ")) expect(aside.className).toContain(cls);
    expect(aside.className).toContain("contents");
    expect(screen.getByTestId("info-main").className).toContain("contents");
  });
});
```

`src/components/detail/saga-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SagaMembership } from "@/lib/sagas/types";
import { SagaList } from "./saga-list";

afterEach(cleanup);

// Solo los campos que SagaList lee; el resto del tipo no importa aquí.
const saga = (id: string, name: string): SagaMembership =>
  ({ sagaId: id, name, isPrimary: id === "s1", position: 1, total: 3 }) as SagaMembership;

const sagas = [saga("s1", "Dune"), saga("s2", "Villeneuve")];

describe("SagaList · stripShown", () => {
  it("con la tira visible, la principal no se repite en la lista (a ningún ancho)", () => {
    render(<SagaList itemType="movie" sagas={sagas} positionLabel={() => null} stripShown />);
    const main = screen.getByRole("link", { name: /Dune/ });
    expect(main.className.split(" ")).toContain("hidden");
    expect(main.className).not.toContain("lg:flex");
  });

  it("sin tira, la principal SÍ sale en la lista, también en móvil", () => {
    render(<SagaList itemType="movie" sagas={sagas} positionLabel={() => null} stripShown={false} />);
    const main = screen.getByRole("link", { name: /Dune/ });
    expect(main.className.split(" ")).not.toContain("hidden");
  });

  it("las secundarias salen siempre", () => {
    render(<SagaList itemType="movie" sagas={sagas} positionLabel={() => null} stripShown />);
    expect(screen.getByRole("link", { name: /Villeneuve/ }).className.split(" ")).not.toContain("hidden");
  });
});
```

(Si `SagaMembership` tiene campos obligatorios distintos, ajustar el literal de `saga()` a lo que declare `src/lib/sagas/types.ts`; el cast ya cubre los que falten.)

- [ ] **Step 2:** `fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx vitest run src/components/detail/info-layout.test.tsx src/components/detail/saga-list.test.tsx` → FAIL (módulo `info-layout` no existe; `stripShown` no se aplica).

- [ ] **Step 3: Implementar**

En `src/components/detail/detail-container.ts`, añadir al final:

```ts
// El `top` de los laterales pegajosos de las pestañas (Info, Comunidad). Van
// DEBAJO de la barra de pestañas, que también se pega: 49px de barra (py-3.5 +
// línea de 20px + borde) y 24px de aire. Antes cada lateral calculaba el suyo
// desde el raíl de PC (topbar + 34px) y, con la barra pegada, se metía debajo.
export const DETAIL_ASIDE_STICKY = "lg:sticky lg:top-[calc(var(--topbar-h)+73px)]";
```

`src/components/detail/info-layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { DETAIL_ASIDE_STICKY } from "./detail-container";

// La pestaña Info de las tres fichas (spec 2026-09-23 ficha cinemática §3):
// en PC, una rejilla `principal | datos (340)` con la columna de datos pegada
// bajo la barra de pestañas; en móvil, UNA columna.
//
// En móvil las dos envolturas son `display:contents`: sus hijos pasan a ser
// hijos directos del flex de fuera y cada uno se coloca con su `order-N`. Así el
// orden móvil del plan 06 (que mezcla secciones de las dos columnas: la ficha
// del libro va ENTRE la sinopsis y las ediciones) se conserva sin pintar nada
// dos veces. En PC cada hijo lleva `lg:order-none` y manda el orden del DOM.
export function InfoLayout({ main, aside }: { main: ReactNode; aside: ReactNode }) {
  return (
    <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-11">
      <div data-testid="info-main" className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-10">
        {main}
      </div>
      <div
        data-testid="info-aside"
        className={`contents lg:flex lg:flex-col lg:gap-6 ${DETAIL_ASIDE_STICKY}`}
      >
        {aside}
      </div>
    </div>
  );
}
```

En `src/components/detail/saga-list.tsx`: añadir la prop y cambiar la clase de la fila principal.

```tsx
export function SagaList({
  itemType,
  sagas,
  positionLabel,
  stripShown,
}: {
  itemType: ItemType;
  /** Todas, la principal primero. */
  sagas: SagaMembership[];
  /** "nº {position} de {total}" ya traducido, por saga. */
  positionLabel: (saga: SagaMembership) => string | null;
  /**
   * ¿Se está pintando la tira de portadas (SagaStrip) de la principal? Si sí,
   * la principal ya se ve ahí y no se repite en la lista, a ningún ancho. Antes
   * la tira era solo de móvil y la fila principal se escondía SOLO en móvil
   * (`hidden lg:flex`), así que una saga sin tira quedaba sin ninguna de las dos.
   */
  stripShown: boolean;
}) {
```

y la clase de cada `<Link>`:

```tsx
            className={`flex items-center gap-2.5 border-b border-border py-3 lg:rounded-[10px] lg:border lg:px-3.5 lg:py-2.5 ${
              isMain
                ? stripShown
                  ? "hidden"
                  : `${accent.border} ${accent.bgSoft}`
                : "lg:border-border lg:bg-surface"
            }`}
```

Si con la principal oculta no queda ninguna fila visible (una sola saga y tira visible), `SagaList` no debe pintar un contenedor vacío con hueco: añadir tras el `if (sagas.length === 0) return null;`:

```tsx
  // Con la tira visible y una sola saga no queda nada que listar.
  if (stripShown && sagas.length === 1) return null;
```

y un test más en `saga-list.test.tsx`:

```tsx
  it("una sola saga con la tira visible: no pinta nada", () => {
    const { container } = render(
      <SagaList itemType="movie" sagas={[saga("s1", "Dune")]} positionLabel={() => null} stripShown />,
    );
    expect(container.innerHTML).toBe("");
  });
```

- [ ] **Step 4:** Mismo comando → PASS. `npx tsc --noEmit` fallará en las tres páginas por la prop obligatoria `stripShown`: es esperado, se cablea en las Tasks 2–4. **Para no dejar un commit que no compila**, en este mismo paso pasar provisionalmente en las tres páginas `stripShown={false}` a su `<SagaList …>` (comportamiento: la principal se ve en la lista a todos los anchos; las Tasks 2–4 lo sustituyen). Volver a correr `npx tsc --noEmit` → limpio.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/detail-container.ts src/components/detail/info-layout.tsx src/components/detail/info-layout.test.tsx src/components/detail/saga-list.tsx src/components/detail/saga-list.test.tsx "src/app/libro/[id]/page.tsx" "src/app/pelicula/[id]/page.tsx" "src/app/serie/[id]/page.tsx"
git commit -m "feat(ficha): InfoLayout de dos columnas y SagaList que no repite la saga de la tira"
```

---

### Task 2: Info del libro con `InfoLayout`

**Files:**
- Modify: `src/app/libro/[id]/page.tsx` (el `info={ <CatalogEditor …> … </CatalogEditor> }` de `BookTabs`, hoy ~l.528–612)
- Modify: `src/components/detail/info-panel.tsx` (tope de lectura de la sinopsis)

**Interfaces:**
- Consumes: `InfoLayout` (Task 1), `SagaList.stripShown` (Task 1).

- [ ] **Step 1: Sustituir el cuerpo de `CatalogEditor`**

Todo lo que hoy va entre `<CatalogEditor …>` y `</CatalogEditor>` (el comentario «Orden del mockup (frame 1)…» y el `<div className="lg:grid lg:grid-cols-[1fr_340px] …">` entero, con la ficha pintada dos veces) se sustituye por:

```tsx
          {/* Info del libro (spec ficha cinemática §3). PC: sinopsis → saga →
              ediciones | ficha. Móvil, el orden del plan 06 (frame 1): sagas →
              sinopsis → ficha → ediciones — de ahí los `order-N`. */}
          <InfoLayout
            main={
              <>
                <div className="order-2 lg:order-none">
                  <InfoPanel
                    aboutLabel={tDetail("about")}
                    synopsis={book.synopsis}
                    noSynopsisLabel={tDetail("noSynopsis")}
                    actions={<EditFichaButton />}
                  />
                </div>
                {sagas.length > 0 && (
                  <section className="order-1 flex flex-col gap-3.5 lg:order-none">
                    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                      {tDetail("sagasCount", { count: sagas.length })}
                    </span>
                    {stripShown && mainSaga && (
                      <SagaStrip
                        members={sagaMembers}
                        currentType="book"
                        currentId={book.id}
                        sagaId={mainSaga.sagaId}
                        sagaName={mainSaga.name}
                        positionLabel={sagaPosition(mainSaga)}
                      />
                    )}
                    <SagaList
                      itemType="book"
                      sagas={sagas}
                      positionLabel={sagaPosition}
                      stripShown={stripShown}
                    />
                  </section>
                )}
                <div className="order-4 lg:order-none">
                  <EditionsSection
                    itemType="book"
                    itemId={book.id}
                    editionsPromise={editionsPromise}
                    usedEditionIdsPromise={usedEditionIdsPromise}
                    editionsFallback={<EditionsLoading />}
                    selectedEditionId={
                      passes.find((p) => !p.finishedOn)?.editionId ?? null
                    }
                    canContribute={canContribute}
                  />
                </div>
              </>
            }
            aside={
              <div className="order-3 lg:order-none">
                <MetadataSidebar
                  rows={metaRows}
                  genres={genres}
                  genresLabel={tDetail("genres")}
                />
              </div>
            }
          />
```

Y justo antes del `return (` de `BookTabs`, junto a `sagaPosition`, definir:

```ts
  // La tira de portadas de la saga principal se pinta a TODOS los anchos desde
  // la ficha cinemática (antes era solo móvil). Mismo umbral que tenía el libro.
  const stripShown = Boolean(mainSaga) && sagaMembers.length >= 1;
```

Importar `InfoLayout`: `import { InfoLayout } from "@/components/detail/info-layout";`. Quitar el `stripShown={false}` provisional de la Task 1 (ya lo sustituye esto).

- [ ] **Step 2: Tope de lectura en `InfoPanel`**

En `src/components/detail/info-panel.tsx`, en el `<div className="flex min-w-0 flex-col gap-4">` que envuelve título y párrafos, añadir `max-w-[68ch]`:

```tsx
      <div className="flex min-w-0 max-w-[68ch] flex-col gap-4">
```

con un comentario encima: `{/* Tope de lectura: con la columna principal a ~860px, la sinopsis a 14px salía a ~120 caracteres por línea. */}`. (El `extra` de la serie queda dentro de este div hasta la Task 4, que lo saca; mientras, el reparto de la serie también queda topado — es transitorio dentro de esta PR.)

- [ ] **Step 3: Verificar**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx tsc --noEmit; npx eslint "src/app/libro/[id]/page.tsx" src/components/detail/info-panel.tsx; npx vitest run src/components/detail
```

Expected: limpio y PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/libro/[id]/page.tsx" src/components/detail/info-panel.tsx
git commit -m "feat(ficha): Info del libro a dos columnas, ficha técnica pintada una sola vez"
```

---

### Task 3: Info de la película con `InfoLayout` y reparto de 8

**Files:**
- Modify: `src/app/pelicula/[id]/page.tsx` (el `info={ <CatalogEditor …> … </CatalogEditor> }` de `MovieTabs`)
- Modify: `src/components/credits-section.tsx` (rejilla del reparto)

**Interfaces:**
- Consumes: `InfoLayout`, `SagaList.stripShown` (Task 1).

- [ ] **Step 1: Sustituir el cuerpo de `CatalogEditor`**

Todo lo que hoy va entre `<CatalogEditor …>` y `</CatalogEditor>` (el comentario «Frames 5 (móvil) y 12 (PC)…» y el `<div className="flex flex-col gap-10 lg:grid …">` entero) se sustituye por:

```tsx
          {/* Info de la película (spec ficha cinemática §3). PC: sinopsis →
              reparto → saga → versiones | ficha → dónde verla. Móvil, el orden
              del plan 06 (frame 5): sagas → sinopsis → versiones → reparto →
              dónde verla → ficha — de ahí los `order-N`. */}
          <InfoLayout
            main={
              <>
                <div className="order-2 lg:order-none">
                  <InfoPanel
                    aboutLabel={tDetail("about")}
                    synopsis={movie.synopsis}
                    noSynopsisLabel={tDetail("noSynopsis")}
                    actions={<EditFichaButton />}
                  />
                </div>
                {(credits.cast.length > 0 || credits.crew.length > 0) && (
                  <div className="order-4 min-w-0 lg:order-none">
                    <CreditsSection credits={credits} />
                  </div>
                )}
                {sagas.length > 0 && (
                  <section className="order-1 flex flex-col gap-3.5 lg:order-none">
                    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                      {tDetail("sagasCount", { count: sagas.length })}
                    </span>
                    {stripShown && mainSaga && (
                      <SagaStrip
                        members={sagaMembers}
                        currentType="movie"
                        currentId={movie.id}
                        sagaId={mainSaga.sagaId}
                        sagaName={mainSaga.name}
                        positionLabel={sagaPosition(mainSaga)}
                      />
                    )}
                    <SagaList
                      itemType="movie"
                      sagas={sagas}
                      positionLabel={sagaPosition}
                      stripShown={stripShown}
                    />
                  </section>
                )}
                <div className="order-3 lg:order-none">
                  <EditionsSection
                    itemType="movie"
                    itemId={movie.id}
                    editionsPromise={Promise.resolve(editions)}
                    usedEditionIdsPromise={usedEditionIdsPromise}
                    editionsFallback={<EditionsLoading />}
                    selectedEditionId={
                      passes.find((p) => !p.finishedOn)?.editionId ?? null
                    }
                    canContribute={canContribute}
                  />
                </div>
              </>
            }
            aside={
              <>
                <div className="order-6 lg:order-none">
                  <MetadataSidebar
                    rows={metaRows}
                    genres={genres}
                    genresLabel={tDetail("genres")}
                  />
                </div>
                {watchProviders && (
                  <div className="order-5 lg:order-none">
                    <WatchProviders data={watchProviders} />
                  </div>
                )}
              </>
            }
          />
```

Antes del `return (` de `MovieTabs`, junto a `sagaPosition`:

```ts
  // La tira de la saga principal, a todos los anchos (antes solo móvil).
  const stripShown = Boolean(mainSaga) && sagaMembers.length >= 1;
```

Importar `InfoLayout` y quitar el `stripShown={false}` provisional.

- [ ] **Step 2: Reparto de 8 en xl**

En `src/components/credits-section.tsx`, la rejilla del reparto:

```tsx
        <div className="flex gap-3.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-6 lg:gap-[18px] lg:overflow-visible lg:pb-0 xl:grid-cols-8">
```

y actualizar el comentario de cabecera del componente que dice «a lo ancho en PC (`.desk-cast`)» por: «en PC va en la columna principal de Info (ficha cinemática): 6 por fila en lg, 8 en xl». No se añade «+N»: el reparto que se guarda ya viene acotado por la hidratación y cabe entero en filas de 8 (desviación consciente de la spec §3, que lo mencionaba).

- [ ] **Step 3: Verificar**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx tsc --noEmit; npx eslint "src/app/pelicula/[id]/page.tsx" src/components/credits-section.tsx; npx vitest run src/components
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/pelicula/[id]/page.tsx" src/components/credits-section.tsx
git commit -m "feat(ficha): Info de la película a dos columnas; el reparto entra en la principal"
```

---

### Task 4: Info de la serie con `InfoLayout`; `InfoPanel` solo sinopsis

**Files:**
- Modify: `src/app/serie/[id]/page.tsx` (el `info={ <CatalogEditor …> … </CatalogEditor> }` de `SeriesTabs`)
- Modify: `src/components/detail/info-panel.tsx` (fuera `sidebar` y `extra`)

**Interfaces:**
- Consumes: `InfoLayout`, `SagaList.stripShown` (Task 1).
- Produces: `InfoPanel` con props `{ aboutLabel, synopsis, noSynopsisLabel, actions? }` — sin `sidebar` ni `extra`.

- [ ] **Step 1: Sustituir el cuerpo de `CatalogEditor`**

Todo lo que hoy va entre `<CatalogEditor …>` y `</CatalogEditor>` (el `<div className="flex flex-col gap-10">` con las sagas y el `InfoPanel` con `sidebar`/`extra`) se sustituye por:

```tsx
          {/* Info de la serie (spec ficha cinemática §3). PC: sinopsis →
              reparto → saga | ficha → dónde verla. Móvil, el orden de siempre:
              sagas → sinopsis → reparto → dónde verla → ficha. */}
          <InfoLayout
            main={
              <>
                <div className="order-2 lg:order-none">
                  <InfoPanel
                    aboutLabel={tDetail("about")}
                    synopsis={series.synopsis}
                    noSynopsisLabel={tDetail("noSynopsis")}
                    actions={<EditFichaButton />}
                  />
                </div>
                {(credits.cast.length > 0 || credits.crew.length > 0) && (
                  <div className="order-3 min-w-0 lg:order-none">
                    <CreditsSection credits={credits} />
                  </div>
                )}
                {sagas.length > 0 && (
                  <section className="order-1 flex flex-col gap-3.5 lg:order-none">
                    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                      {tDetail("sagasCount", { count: sagas.length })}
                    </span>
                    {stripShown && mainSaga && (
                      <SagaStrip
                        members={sagaMembers}
                        currentType="series"
                        currentId={series.id}
                        sagaId={mainSaga.sagaId}
                        sagaName={mainSaga.name}
                        positionLabel={sagaPosition(mainSaga)}
                      />
                    )}
                    <SagaList
                      itemType="series"
                      sagas={sagas}
                      positionLabel={sagaPosition}
                      stripShown={stripShown}
                    />
                  </section>
                )}
              </>
            }
            aside={
              <>
                <div className="order-5 lg:order-none">
                  <MetadataSidebar
                    rows={metaRows}
                    genres={genres}
                    genresLabel={tDetail("genres")}
                  />
                </div>
                {watchProviders && (
                  <div className="order-4 lg:order-none">
                    <WatchProviders data={watchProviders} />
                  </div>
                )}
              </>
            }
          />
```

Antes del `return (` de `SeriesTabs`, junto a `sagaPosition`:

```ts
  // La tira de la saga principal, a todos los anchos. La serie conserva su
  // umbral de 2 miembros (una tira de una sola portada, la propia, no aporta).
  const stripShown = Boolean(mainSaga) && sagaMembers.length >= 2;
```

Importar `InfoLayout`, quitar el `stripShown={false}` provisional. Si `credits` no está en el ámbito de `SeriesTabs` con ese nombre, usar la variable con la que hoy se pasa `<CreditsSection credits={…} />` en el `extra`.

- [ ] **Step 2: `InfoPanel` sin `sidebar` ni `extra`**

Ya no los usa nadie. `src/components/detail/info-panel.tsx` queda:

```tsx
import type { ReactNode } from "react";

// La sinopsis de la ficha (con el botón «Editar ficha» junto al título). Desde
// la ficha cinemática el reparto, la ficha técnica y «dónde verla» los coloca
// InfoLayout en su columna; esto ya solo es la sinopsis.
export function InfoPanel({
  aboutLabel,
  synopsis,
  noSynopsisLabel,
  actions,
}: {
  aboutLabel: string;
  synopsis: string | null;
  noSynopsisLabel: string;
  /** Botón "Editar ficha" (CatalogEditor), junto al título de esta sección. */
  actions?: ReactNode;
}) {
  const paragraphs = synopsis
    ? synopsis.split(/\n\n+/).filter((p) => p.trim().length > 0)
    : [];

  return (
    // Tope de lectura: con la columna principal a ~860px, la sinopsis a 14px
    // salía a ~120 caracteres por línea.
    <div className="flex min-w-0 max-w-[68ch] flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{aboutLabel}</h2>
        {actions}
      </div>
      {paragraphs.length > 0 ? (
        paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground">
            {p}
          </p>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{noSynopsisLabel}</p>
      )}
    </div>
  );
}
```

(El `min-w-0` que evitaba el desborde del reparto en 360px, #721, ahora lo lleva el envoltorio del reparto en cada página: `order-N min-w-0`.)

- [ ] **Step 3: Verificar**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx tsc --noEmit; npx eslint "src/app/serie/[id]/page.tsx" src/components/detail/info-panel.tsx; npx vitest run
```

Expected: limpio y la suite entera en verde. `grep -rn "sidebar=\|extra=" src/app/serie` no debe devolver usos de `InfoPanel`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/serie/[id]/page.tsx" src/components/detail/info-panel.tsx
git commit -m "feat(ficha): Info de la serie a dos columnas; InfoPanel se queda en la sinopsis"
```

---

### Task 5: Comunidad, Registro y editor de moderador sin medidas del raíl

**Files:**
- Modify: `src/components/detail/community-panel.tsx` (~l.178–181)
- Modify: `src/components/detail/review-row.tsx` (~l.124)
- Modify: `src/components/detail/pass-diary.tsx` (~l.244 y ~l.254)
- Modify: `src/components/detail/catalog-editor.tsx` (~l.443 y ~l.821)

**Interfaces:**
- Consumes: `DETAIL_ASIDE_STICKY` (Task 1).

- [ ] **Step 1: Lateral de Comunidad**

En `community-panel.tsx`, importar `import { DETAIL_ASIDE_STICKY } from "./detail-container";` y sustituir el `<aside …>` y su comentario:

```tsx
      {/* Resumen de notas. En PC es la tarjeta pegada de la derecha
          (`.rate-card` del frame 9): se queda quieta mientras suben las
          reseñas, pegada BAJO la barra de pestañas (DETAIL_ASIDE_STICKY). */}
      <aside className={`order-1 mb-[22px] lg:order-none lg:mb-0 ${DETAIL_ASIDE_STICKY}`}>
```

- [ ] **Step 2: Tope de lectura en reseñas y diario**

En `review-row.tsx`, el `<p>` del texto de la reseña: añadir `max-w-[70ch]` a su `className` (queda `"max-w-[70ch] whitespace-pre-line break-words text-[13.5px] …"`), y una línea al comentario de encima: `Tope de lectura de ~70 caracteres: la columna principal de Comunidad mide ~860px en PC.`

En `pass-diary.tsx`, los dos `<p className="mt-1 text-[12.5px] leading-[1.55] text-foreground-soft">` (reseña del pase y nota libre de abandono): añadir `max-w-[70ch]` a cada uno.

- [ ] **Step 3: Editor de moderador**

En `catalog-editor.tsx`, las dos barras pegajosas (~l.443 la superior, ~l.821 la inferior) sangran con `lg:-mx-11 lg:px-11`, que era el padding del panel viejo (44px). El panel ahora usa `DETAIL_CONTAINER` (`lg:px-10`, 40px). Sustituir en las dos `lg:-mx-11` → `lg:-mx-10` y `lg:px-11` → `lg:px-10`.

- [ ] **Step 4: Verificar**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx tsc --noEmit; npx eslint src/components/detail/community-panel.tsx src/components/detail/review-row.tsx src/components/detail/pass-diary.tsx src/components/detail/catalog-editor.tsx; npx vitest run src/components/detail
```

`grep -rn "lg:-mx-11\|lg:px-11\|topbar-h)+34px" src/components/detail src/app` → sin resultados.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/community-panel.tsx src/components/detail/review-row.tsx src/components/detail/pass-diary.tsx src/components/detail/catalog-editor.tsx
git commit -m "fix(ficha): laterales pegados bajo las pestañas, tope de lectura y sangrado del editor al contenedor nuevo"
```

---

### Task 6: e2e, verificación visual y documentación

**Files:**
- Modify: `e2e/ficha-cinematica.spec.ts`
- Modify: `e2e/sagas-v2.spec.ts` (solo el comentario ~l.221–229)
- Modify: `docs/redesign/plan-06-ficha.md`

- [ ] **Step 1: Ampliar la spec e2e**

En `e2e/ficha-cinematica.spec.ts`, dentro de `test.describe("PC 1600", …)`, añadir:

```ts
  test("Info a dos columnas: la ficha técnica a la derecha, una sola vez, pegada bajo las pestañas", async ({ page }) => {
    await page.goto(BOOK);
    const synopsis = page.getByRole("heading", { name: "Sinopsis" });
    await expect(synopsis).toBeVisible();
    const aside = page.getByTestId("info-aside");
    // Una sola ficha técnica en el DOM (antes el libro la pintaba dos veces).
    await expect(page.locator("aside").filter({ hasText: "Primera publicación" })).toHaveCount(1);
    const s = await synopsis.boundingBox();
    const a = await aside.boundingBox();
    expect(a!.x).toBeGreaterThan(s!.x + 400);

    // Tras bajar, el lateral queda por DEBAJO de la barra de pestañas pegada.
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(400);
    const tabs = await page.getByRole("tablist").boundingBox();
    const a2 = await aside.boundingBox();
    expect(a2!.y).toBeGreaterThanOrEqual(tabs!.y + tabs!.height);
  });
```

y dentro de `test.describe("móvil 375", …)`:

```ts
  test("Info en una columna con el orden de siempre: sinopsis antes que la ficha, la ficha antes que las ediciones", async ({ page }) => {
    await page.goto(BOOK);
    const synopsis = await page.getByRole("heading", { name: "Sinopsis" }).boundingBox();
    const ficha = await page.locator("aside").filter({ hasText: "Primera publicación" }).boundingBox();
    const editions = await page.getByText("Ediciones", { exact: true }).first().boundingBox();
    expect(ficha!.y).toBeGreaterThan(synopsis!.y);
    expect(editions!.y).toBeGreaterThan(ficha!.y);
  });
```

(Comprobar en `messages/es.json` las etiquetas reales —«Sinopsis», «Primera publicación», «Ediciones»— y el nombre del heading de la sinopsis; si alguna difiere, usar la real. El libro `3e80b690-…` es la ficha pública de DEV que ya usan `navegacion-anonima.spec.ts` y esta spec.)

- [ ] **Step 2: Comentario de `sagas-v2.spec.ts`**

El comentario de ~l.221–229 explica que la tira es `lg:hidden` y la fila de la lista `hidden lg:flex`. Ya no es así: sustituirlo por

```ts
  // Sección de sagas de la ficha de obra (SagaList/SagaStrip, src/components/detail):
  // el rótulo "Sagas · N" y un enlace de vuelta a Era Uno. Desde la ficha
  // cinemática la tira de portadas se ve a TODOS los anchos y, cuando está, la
  // saga principal no se repite en la lista (SagaList `stripShown`). `:visible`
  // por robustez: el enlace visible es el de la tira o, sin tira, el de la lista.
```

El código del test no cambia.

- [ ] **Step 3: e2e contra build de producción**

Puerto 3000 libre (`Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue`), luego:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npm run build
```

Arrancar `npx next start -p 3000` en segundo plano, esperar 200 con `curl`, y:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx playwright test e2e/ficha-cinematica.spec.ts e2e/sagas-v2.spec.ts e2e/pase-hub.spec.ts e2e/serie-resenas-de-pase.spec.ts e2e/navegacion-anonima.spec.ts --reporter=line
```

Expected: PASS sin avalancha de `skipped`. Parar el `next start` al acabar y comprobar que 3000 queda libre.

- [ ] **Step 4: Verificación visual**

Con un solo `next dev` en 3000: capturas (Playwright desechable en el scratchpad de la sesión, fuera del repo) de la pestaña Info de libro, película y serie a 375, 1100 y 1600, en claro y oscuro, y de Comunidad de una obra con reseñas a 1600 tras bajar. Comprobar: la ficha técnica a la derecha en ≥ lg y pegada bajo las pestañas al bajar; la tira de saga visible en PC sin repetir la principal en la lista; la sinopsis sin líneas de más de ~70 caracteres; el orden móvil intacto; el lateral de Comunidad no se mete bajo la barra de pestañas. Adjuntar las capturas a la PR.

- [ ] **Step 5: `plan-06-ficha.md`**

Tras la nota «Resuelto el 2026-09-24…» de §6e, añadir:

```markdown
> **PR 3 de la ficha cinemática (2026-09-24):** la pestaña Info de los tres tipos usa `InfoLayout`
> (`principal | datos 340`, datos pegados bajo las pestañas). El orden en PC cambia respecto a los
> frames 8/12 (el reparto ya no va «a lo ancho» encima: entra en la principal; la tira de saga se ve
> también en PC); el orden móvil de §2 NO cambia.
```

- [ ] **Step 6: Commit y PR**

```bash
git add e2e/ficha-cinematica.spec.ts e2e/sagas-v2.spec.ts docs/redesign/plan-06-ficha.md
git commit -m "test(ficha): e2e de Info a dos columnas y orden móvil; nota en el plan 06"
```

PR `feat(ficha): Info a dos columnas y laterales bajo las pestañas (PR 3/4)` con: resumen, enlace a la spec, capturas, resultado de los e2e contra build de producción y la nota #437 («no se añade `use cache`»).
