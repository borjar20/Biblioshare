# Ficha cinemática · PR 4 — Episodios en tres columnas en PC · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En PC, la vista de lista de la pestaña Episodios pasa a tres columnas —temporadas `220` | episodios `1fr` | detalle `340`— y el detalle del episodio elegido vive en la tercera columna en vez de desplegarse bajo su fila. En móvil no cambia nada.

**Architecture:** Un hook `useIsDesktop()` (`useSyncExternalStore` sobre `matchMedia("(min-width: 1024px)")`, `false` en servidor y sin `matchMedia`) decide si el detalle va en línea (móvil) o en columna (PC), de modo que el detalle —con su `textarea`— se monta **una sola vez**. Un componente nuevo `EpisodeDetailColumn` pinta la tercera columna: estado vacío o fotograma + código + título + el `EpisodeInlineDetail` que ya existe. `EpisodePanel` amplía su rejilla y `EpisodeList` recibe `inlineDetail: boolean`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, next-intl, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md` §3 («Episodios»). Plan 06 §6e explica por qué PC·1 se quedó en dos columnas en julio (el cuerpo medía 771px) y dejó escrito que la tercera columna volvería a caber con el shell nuevo. Parte de `main` con las PR 1–3 mergeadas (#1206, #1209, #1211).

## Global Constraints

- PC (≥ lg, 1024px), vista **lista**: rejilla `lg:grid-cols-[220px_minmax(0,1fr)_340px]` dentro del marco actual (`lg:rounded-[14px] lg:border lg:bg-surface`).
- El detalle del episodio en PC va en la **tercera columna**; en móvil sigue **desplegado bajo su fila**. Nunca los dos a la vez: el detalle se monta una sola vez.
- Sin episodio elegido, la tercera columna muestra un estado vacío con el texto de `episode.pickEpisode`.
- La **rejilla** de PC (vista «rejilla», `EpisodeGrid`) **no se toca** (decisión del plan 06 §6e).
- Un solo estado: `openSeason` + `selectedKey` siguen siendo los de `EpisodePanel`; no se añade estado nuevo de selección.
- Textos nuevos solo en `messages/es.json` (es el único locale).
- #437: ningún `use cache` nuevo.
- Node 22: `fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; <comando>` en el mismo comando de PowerShell. `.env.local` en el worktree.

---

## File Structure

| Fichero | Acción | Responsabilidad |
|---|---|---|
| `src/lib/ui/use-is-desktop.ts` | Crear | `useIsDesktop()` |
| `src/lib/ui/use-is-desktop.test.ts` | Crear | Tests del hook |
| `src/components/detail/episode-detail-column.tsx` | Crear | Tercera columna (vacío / detalle) |
| `src/components/detail/episode-detail-column.test.tsx` | Crear | Tests de la columna |
| `messages/es.json` | Modificar | `episode.pickEpisode` |
| `src/components/detail/episode-list.tsx` | Modificar | Prop `inlineDetail` |
| `src/components/detail/episode-panel.tsx` | Modificar | Rejilla de 3, columna de detalle |
| `src/components/detail/episode-panel.test.tsx` | Modificar | Tests de PC vs móvil |
| `e2e/ficha-cinematica.spec.ts` | Modificar | e2e de la tercera columna |
| `docs/redesign/plan-06-ficha.md`, `docs/architecture/graph.json`, `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md` | Modificar | Cierre de la iniciativa |

---

### Task 1: `useIsDesktop` y `EpisodeDetailColumn`

**Files:**
- Create: `src/lib/ui/use-is-desktop.ts`, `src/lib/ui/use-is-desktop.test.ts`
- Create: `src/components/detail/episode-detail-column.tsx`, `src/components/detail/episode-detail-column.test.tsx`
- Modify: `messages/es.json` (bloque `"episode": {` de nivel superior, ~l.1506)

**Interfaces:**
- Consumes: `EpisodeInlineDetail` (`src/components/detail/episode-detail.tsx`) con sus props `{ episode, own, source, interactive, isPending, draft, onDraftChange, onSave, markUpToCount, onMarkUpTo }`; tipos `EpisodeRow`, `OwnWatch` (`@/lib/series/get-episode-data`), `GridSource` (`./episode-grid`).
- Produces:
  - `export function useIsDesktop(): boolean`
  - `export function EpisodeDetailColumn(props: EpisodeDetailColumnProps)` con

```ts
export type EpisodeDetailColumnProps = {
  /** El episodio elegido, o null → estado vacío. */
  episode: EpisodeRow | null;
  own: OwnWatch | null;
  source: GridSource;
  interactive: boolean;
  isPending: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  markUpToCount: number;
  onMarkUpTo: () => void;
};
```

- [ ] **Step 1: Tests que fallan**

`src/lib/ui/use-is-desktop.test.ts`:

```ts
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop } from "./use-is-desktop";

afterEach(() => vi.unstubAllGlobals());

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("useIsDesktop", () => {
  it("true a partir de lg (1024px)", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  });

  it("false por debajo", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("sin matchMedia (jsdom a secas, tests viejos) cuenta como móvil y no revienta", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });
});
```

`src/components/detail/episode-detail-column.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import { EpisodeDetailColumn, type EpisodeDetailColumnProps } from "./episode-detail-column";

vi.mock("next/image", () => ({ default: () => null }));
afterEach(cleanup);

const episode: EpisodeRow = {
  season: 2,
  episode: 3,
  title: "Tormenta",
  synopsis: "Todo se complica en la costa.",
  stillUrl: null,
  airDate: "2020-01-01",
  runtimeMinutes: 48,
  avgRating: null,
  ratingCount: 0,
  own: { watched: false, rating: null, review: null, seenBefore: false },
  aired: true,
} as EpisodeRow;

const base: EpisodeDetailColumnProps = {
  episode,
  own: episode.own,
  source: "mine",
  interactive: true,
  isPending: false,
  draft: "",
  onDraftChange: () => {},
  onSave: () => {},
  markUpToCount: 0,
  onMarkUpTo: () => {},
};

function renderColumn(props: Partial<EpisodeDetailColumnProps> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <EpisodeDetailColumn {...base} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("EpisodeDetailColumn", () => {
  it("sin episodio: estado vacío con el texto de es.json", () => {
    renderColumn({ episode: null, own: null });
    expect(screen.getByText(messages.episode.pickEpisode)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("con episodio: código, título, sinopsis y el cuadro de reseña", () => {
    renderColumn();
    expect(screen.getByText("T2E3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tormenta" })).toBeTruthy();
    expect(screen.getByText("Todo se complica en la costa.")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("sin título, usa el «sin título» de es.json", () => {
    renderColumn({ episode: { ...episode, title: null } as EpisodeRow });
    expect(screen.getByRole("heading", { name: messages.episode.untitled })).toBeTruthy();
  });
});
```

(Si `EpisodeRow` declara campos obligatorios distintos, completar el literal con lo que diga `src/lib/series/get-episode-data.ts`; el `as EpisodeRow` cubre los opcionales.)

- [ ] **Step 2:** `fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx vitest run src/lib/ui/use-is-desktop.test.ts src/components/detail/episode-detail-column.test.tsx` → FAIL (módulos no existen).

- [ ] **Step 3: Implementar**

`messages/es.json`, dentro del bloque `"episode": {` de nivel superior (el que empieza con `"season": "Temporada {n}"`), añadir junto a `"untitled"`:

```json
    "pickEpisode": "Elige un episodio para ver su sinopsis, puntuarlo o escribir tu reseña.",
```

`src/lib/ui/use-is-desktop.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

// ¿Estamos en el breakpoint `lg` de Tailwind (≥ 1024px)? Para lo que NO se puede
// resolver con CSS: montar un componente en un sitio u otro, no solo
// esconderlo. Caso de uso: el detalle de un episodio lleva un <textarea> con
// guardado al salir del foco, y montado dos veces (uno oculto) habría dos
// cuadros con el mismo borrador (ficha cinemática, PR 4).
//
// useSyncExternalStore y no useState+useEffect: sin setState en efecto (#856) y
// con instantánea de servidor, así que la hidratación no descuadra: en el
// servidor y en el primer render del cliente vale `false`, y se corrige solo.
const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // jsdom no trae matchMedia: los tests que no lo simulan ven móvil.
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

`src/components/detail/episode-detail-column.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import type { GridSource } from "./episode-grid";
import { EpisodeInlineDetail } from "./episode-detail";

export type EpisodeDetailColumnProps = {
  /** El episodio elegido, o null → estado vacío. */
  episode: EpisodeRow | null;
  own: OwnWatch | null;
  source: GridSource;
  interactive: boolean;
  isPending: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  markUpToCount: number;
  onMarkUpTo: () => void;
};

// La tercera columna del frame PC·1 (ficha cinemática, PR 4): el detalle del
// episodio elegido, anclado a la derecha mientras se recorre la lista. En móvil
// no existe: allí el mismo detalle se despliega bajo su fila (EpisodeList).
// Reutiliza EpisodeInlineDetail tal cual —metadatos, sinopsis, reseña y
// «vistos hasta aquí»— y le pone encima el fotograma y el título, que en la
// fila ya se ven pero aquí la columna está sola.
export function EpisodeDetailColumn({
  episode,
  own,
  ...detail
}: EpisodeDetailColumnProps) {
  const t = useTranslations("episode");

  if (!episode || !own) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
        {t("pickEpisode")}
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4">
      {episode.stillUrl && (
        <span className="relative mb-3.5 block aspect-video w-full overflow-hidden rounded-[8px] bg-surface-3">
          <Image src={episode.stillUrl} alt="" fill sizes="340px" className="object-cover" />
        </span>
      )}
      <span className="font-mono text-[10.5px] text-muted-foreground">
        {t("code", { s: episode.season, e: episode.episode })}
      </span>
      <h3 className="mt-1 font-serif text-[18px] leading-tight font-semibold text-foreground">
        {episode.title ?? t("untitled")}
      </h3>
      <EpisodeInlineDetail episode={episode} own={own} {...detail} />
    </div>
  );
}
```

- [ ] **Step 4:** Mismo comando → PASS. `npx tsc --noEmit` y `npx eslint src/lib/ui/use-is-desktop.ts src/components/detail/episode-detail-column.tsx` → limpios.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/use-is-desktop.ts src/lib/ui/use-is-desktop.test.ts src/components/detail/episode-detail-column.tsx src/components/detail/episode-detail-column.test.tsx messages/es.json
git commit -m "feat(episodios): columna de detalle del episodio y useIsDesktop"
```

---

### Task 2: Tres columnas en `EpisodePanel`; detalle en línea solo en móvil

**Files:**
- Modify: `src/components/detail/episode-list.tsx` (tipo `EpisodeListProps`; el bloque `{selected && (…EpisodeInlineDetail…)}` de `EpisodeItem`, ~l.255–273; el comentario de cabecera)
- Modify: `src/components/detail/episode-panel.tsx` (la rama `view !== "grid"`, ~l.444–492, y su comentario)
- Test: `src/components/detail/episode-panel.test.tsx`

**Interfaces:**
- Consumes: `useIsDesktop` y `EpisodeDetailColumn` (Task 1).
- Produces: `EpisodeListProps.inlineDetail: boolean` (obligatoria).

- [ ] **Step 1: Tests que fallan**

Añadir a `src/components/detail/episode-panel.test.tsx` (con `afterEach(() => vi.unstubAllGlobals())` si el fichero no lo tiene ya):

```tsx
function stubDesktop(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("EpisodePanel · PC·1 en tres columnas", () => {
  it("en PC, sin episodio elegido, la tercera columna invita a elegir uno", () => {
    stubDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);
    expect(screen.getByTestId("episode-detail-column").textContent).toContain(
      messages.episode.pickEpisode,
    );
    vi.unstubAllGlobals();
  });

  it("en PC, elegir un episodio lo abre en la columna y NO bajo su fila", () => {
    stubDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);
    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const column = screen.getByTestId("episode-detail-column");
    expect(column.querySelector("h3")?.textContent).toBe("Episodio 1x2");
    // Un solo cuadro de reseña en todo el panel: el de la columna.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(column.contains(screen.getByRole("textbox"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("en móvil, el detalle se despliega bajo su fila (como siempre)", () => {
    stubDesktop(false);
    renderPanel([ep(1, 1), ep(1, 2)]);
    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(
      screen.getByTestId("episode-detail-column").contains(screen.getByRole("textbox")),
    ).toBe(false);
    vi.unstubAllGlobals();
  });
});
```

(En jsdom la columna existe en el DOM a cualquier ancho —solo CSS la oculta—, por eso los tests la encuentran también en el caso móvil. El título de los episodios del fixture es `Episodio {s}x{e}`, ver `ep()` al principio del fichero. Si el nombre accesible del botón de la fila no casa con `/Episodio 1x2/`, usar el que tenga.)

- [ ] **Step 2:** `fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx vitest run src/components/detail/episode-panel.test.tsx` → FAIL (`episode-detail-column` no existe).

- [ ] **Step 3: `EpisodeList` con `inlineDetail`**

En `episode-list.tsx`:

1. En `EpisodeListProps`, añadir:

```ts
  /**
   * ¿El detalle del episodio elegido se despliega bajo su fila? Sí en móvil;
   * en PC va en la tercera columna (EpisodeDetailColumn) y aquí no se monta,
   * para que el cuadro de reseña exista una sola vez.
   */
  inlineDetail: boolean;
```

2. En `EpisodeItem`, desestructurar `inlineDetail` y cambiar la condición del bloque del detalle de `{selected && (` a `{selected && inlineDetail && (`. Actualizar su comentario: «El nivel 3 en móvil, bajo su fila. En PC vive en la tercera columna (EpisodeDetailColumn).»

3. El `lg:bg-type-series/7` de la fila seleccionada se queda: sigue señalando qué episodio está anclado en la columna.

4. En el comentario de cabecera del fichero, sustituir «columna central de PC (frame PC·1…)» por una frase que diga que en PC es la columna central de las tres de PC·1.

- [ ] **Step 4: `EpisodePanel` con tres columnas**

En `episode-panel.tsx`:

1. Imports: `import { useIsDesktop } from "@/lib/ui/use-is-desktop";` y `import { EpisodeDetailColumn } from "./episode-detail-column";`.
2. Dentro del componente, junto a los demás hooks: `const isDesktop = useIsDesktop();`.
3. Antes del `return`, calcular el episodio elegido de la temporada visible:

```ts
  // El episodio anclado en la tercera columna (PC). Solo si es de la temporada
  // que se está viendo: al cambiar de temporada en el raíl, la columna vuelve a
  // su estado vacío en vez de enseñar un episodio que ya no está en la lista.
  const selectedEpisode =
    activeGroup.episodes.find((e) => episodeKey(e) === selectedKey) ?? null;
```

(Debe ir después del `if (!activeGroup || !activeStat) return null;`.)

4. Sustituir el comentario `{/* El marco \`.ep3\` del frame PC·1, con dos columnas y no tres: … */}` por:

```tsx
          {/* El marco `.ep3` del frame PC·1: temporadas | episodios | detalle.
              En julio se quedó en dos columnas porque el cuerpo de la ficha
              medía 771px (plan 06 §6e); con el contenedor de la ficha
              cinemática la tercera vuelve a caber. En móvil no hay marco: cada
              nivel ocupa la pantalla por turnos y el detalle se abre bajo su
              fila. */}
```

5. La rejilla: `lg:grid-cols-[220px_minmax(0,1fr)]` → `lg:grid-cols-[220px_minmax(0,1fr)_340px]`.
6. A `<EpisodeList …>` pasarle `inlineDetail={!isDesktop}`.
7. Tras el `<div className={openSeason === null ? "hidden lg:block" : ""}>…</div>` de la lista, dentro de la rejilla, añadir la tercera columna:

```tsx
            <div
              data-testid="episode-detail-column"
              className="hidden lg:block lg:max-h-[560px] lg:overflow-y-auto lg:border-l lg:border-border"
            >
              <EpisodeDetailColumn
                episode={isDesktop ? selectedEpisode : null}
                own={isDesktop && selectedEpisode ? ownOf(selectedEpisode) : null}
                source={source}
                interactive={
                  interactive && Boolean(selectedEpisode?.aired)
                }
                isPending={isPending}
                draft={draft}
                onDraftChange={setDraft}
                onSave={() => selectedEpisode && saveReview(selectedEpisode)}
                markUpToCount={
                  interactive && selectedEpisode?.aired ? upToPending(selectedEpisode).length : 0
                }
                onMarkUpTo={() => selectedEpisode && markMany(upToPending(selectedEpisode))}
              />
            </div>
```

(`isDesktop ? … : null` hace que en móvil la columna —oculta por CSS— no monte el detalle ni su `textarea`. Los nombres `ownOf`, `saveReview`, `upToPending`, `markMany`, `setDraft`, `interactive`, `isPending` son los que ya usa `EpisodeList` en este mismo fichero; comprobarlo y usar los reales si difieren. `interactive && aired` replica el `canAct` de la fila.)

- [ ] **Step 5: Verificar**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx vitest run src/components/detail src/lib/ui; npx tsc --noEmit; npx eslint src/components/detail/episode-list.tsx src/components/detail/episode-panel.tsx src/components/detail/episode-panel.test.tsx
```

Expected: PASS (los 4 tests viejos de `episode-panel.test.tsx` incluidos: sin `matchMedia` simulado ven móvil, como antes) y limpio.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/episode-list.tsx src/components/detail/episode-panel.tsx src/components/detail/episode-panel.test.tsx
git commit -m "feat(episodios): PC·1 en tres columnas, el detalle del episodio en la suya"
```

---

### Task 3: e2e, verificación visual y cierre de la iniciativa

**Files:**
- Modify: `e2e/ficha-cinematica.spec.ts`
- Modify: `docs/redesign/plan-06-ficha.md`, `docs/architecture/graph.json`, `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md`

- [ ] **Step 1: e2e de la tercera columna**

Buscar en DEV (conector de Supabase de claude.ai, `project_id: "tyvzpuhxfwxrnkcpzxyg"`, solo lectura) una serie con episodios en `series_episodes` y ficha pública: por ejemplo `select s.id, s.title, count(*) from series s join series_episodes e on e.series_id = s.id group by s.id, s.title order by count(*) desc limit 3;` (ajustar los nombres de columna a los reales). En `e2e/ficha-cinematica.spec.ts`, añadir una constante `const SERIES = "/serie/<id elegido>";` con un comentario que diga qué serie es y por qué se eligió, y dentro de `test.describe("PC 1600", …)`:

```ts
  test("Episodios en tres columnas: el detalle del episodio en la columna de la derecha", async ({ page }) => {
    await page.goto(`${SERIES}?tab=episodes`);
    const column = page.getByTestId("episode-detail-column");
    await expect(column).toBeVisible();
    await expect(column).toContainText("Elige un episodio");

    // Primer episodio de la lista: el botón con aria-expanded de cada fila.
    const firstEpisode = page.locator("button[aria-expanded]").first();
    await firstEpisode.click();
    await expect(column.locator("h3")).toBeVisible();
    await expect(firstEpisode).toHaveAttribute("aria-expanded", "true");

    const list = await firstEpisode.boundingBox();
    const detail = await column.boundingBox();
    expect(detail!.x).toBeGreaterThan(list!.x + list!.width - 1);
  });
```

y dentro de `test.describe("móvil 375", …)`:

```ts
  test("Episodios en móvil: el detalle se abre bajo su fila, sin columna", async ({ page }) => {
    await page.goto(`${SERIES}?tab=episodes`);
    await expect(page.getByTestId("episode-detail-column")).toBeHidden();
  });
```

(Anónimo: la pestaña Episodios se ve sin sesión y el detalle se abre sin cuadro de reseña. Si en móvil la pestaña abre el índice de temporadas y no la lista, basta con la aserción de la columna oculta.)

- [ ] **Step 2: e2e contra build de producción**

Puerto 3000 libre, `npm run build`, `npx next start -p 3000` en segundo plano, esperar 200, y:

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22 | Out-Null; npx playwright test e2e/ficha-cinematica.spec.ts e2e/pase-hub.spec.ts e2e/serie-resenas-de-pase.spec.ts e2e/registrar-sesion-v2.spec.ts --reporter=line
```

Expected: PASS sin avalancha de `skipped` (`pase-hub` recorre Episodios con `openLastSeason()` y marca episodios desde la lista: debe seguir pasando). Parar el servidor; puerto 3000 libre.

- [ ] **Step 3: Verificación visual**

Capturas (Playwright desechable; el spec temporal va en `e2e/tmp-*.spec.ts` y se borra antes del commit; PNG al scratchpad de la sesión) de la pestaña Episodios de la serie a 1600 y 1100, en claro y oscuro, antes y después de elegir un episodio; y a 375 con un episodio abierto. Comprobar: tres columnas sin títulos partidos; la fila elegida teñida; la columna con fotograma (si lo hay), código, título, sinopsis; en 1100 la lista sigue legible (a 1100 el cuerpo es ~1020px: 220 + ~460 + 340); en móvil nada cambia.

- [ ] **Step 4: Cierre de la documentación**

1. `docs/redesign/plan-06-ficha.md` §6e, tras la nota de la PR 3: `> **PR 4 (2026-09-24):** PC·1 vuelve a tres columnas (temporadas 220 | episodios | detalle 340); el detalle del episodio vive en la tercera en PC y bajo su fila en móvil. PC·2 (muro/heatmap) sigue sin usar.`
2. `docs/architecture/graph.json`, nodo `c-detail`: `summary` → `"Hero cinemático único (backdrop TMDB / portada teñida), PassCard, pestañas con CTA pegado; InfoLayout (principal | datos pegajosa) y Episodios PC·1 en tres columnas; contenedor común DETAIL_CONTAINER (1320px)."`. Validar el JSON con `node -e "JSON.parse(require('fs').readFileSync('docs/architecture/graph.json','utf8'))"`.
3. `docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md`: en el frontmatter, `status: design` → `status: implementada (fase 1: #1206, #1209, #1211 y esta PR)`.
4. Fase 2 de la spec (contenido nuevo): abrir **una issue por bloque** con `--label "area:ui,tipo:feature,P3"` (o `area:catalogo` si necesita datos nuevos): tráilers (TMDB `videos`), obras relacionadas/recomendadas (TMDB `recommendations`), «más del autor/director», actividad de amigos sobre la obra. Cada issue enlaza la spec y explica qué dato hace falta y de dónde sale. Listar sus números en el informe.

- [ ] **Step 5: Commit y PR**

```bash
git add e2e/ficha-cinematica.spec.ts docs/redesign/plan-06-ficha.md docs/architecture/graph.json docs/superpowers/specs/2026-09-23-ficha-cinematica-design.md
git commit -m "test(episodios): e2e de PC·1 en tres columnas; cierre de la ficha cinemática"
```

PR `feat(episodios): PC·1 en tres columnas (PR 4/4)` con: resumen, capturas, e2e contra build de producción, las issues de la fase 2 y la nota #437.
