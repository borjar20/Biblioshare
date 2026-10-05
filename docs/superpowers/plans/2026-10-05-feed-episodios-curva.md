# Episodios del día en fichas o curva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la tarjeta de varios episodios del día muestre todas las notas: fichas con 2-3, curva desde 4; en el post, además, la lista completa (4-12) o mejores/peores con desplegable (13+).

**Architecture:** Lógica pura (selección de mejores, media, geometría de la curva) en módulos `.ts` testeables sin DOM; cuatro componentes de presentación en `src/components/social/feed-card/episodes/`; `ReviewCard` elige cuál pintar según el número de episodios y si está en el feed o en `/post/[id]` (`showInteractions`).

**Tech Stack:** Next.js 16, React 19, next-intl, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-05-feed-episodios-curva-design.md`.

## Global Constraints

- Rama `feat/feed-episodios-curva` (creada, con la spec commiteada).
- Node 22: en bash, `eval "$(fnm env --shell bash)" && fnm use 22` antes de cualquier `npx` (misma línea).
- Umbrales: 1 episodio = ruta actual (no se toca); **2-3 → fichas**; **4+ → curva**. Feed: curva con etiquetas por punto **hasta 8**, compacta desde 9. Post: curva siempre con etiquetas; **4-12 → curva + lista completa**; **13+ → curva + 3 mejores y 3 peores + «Ver los N episodios»**.
- Escala **sobre 5 con medios** en todo lo que se lee: `formatDots(rating)` de `src/lib/rating/dots.ts` («4», «3,5»). Notas guardadas 1-10.
- Curva: eje vertical **1-5 siempre**, una guía por nivel, **sin línea de media**; sin nota = círculo hueco en la base y tramo discontinuo al saltarlo; cambio de temporada = línea discontinua con «T2»; mejor = punto más grande y claro. Color `var(--type-series)`; textos `var(--muted-foreground)`.
- Empates: la ★ va a **todos** los empatados en la nota más alta; si todos los episodios con nota empatan (y hay más de uno), ninguno.
- Copia en `messages/es.json` (namespace `feed.card`). Ningún literal de UI en componentes (salvo «★», «/5» viene de i18n).
- Sin cambios de datos ni de esquema; sin `use cache`.
- Commits terminan con una línea en blanco y `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `messages/es.json` y varios ficheros usan CRLF: conservar finales de línea.

---

### Task 1: Lógica pura — mejores, media, temporadas y geometría de la curva

**Files:**
- Create: `src/components/social/feed-card/episodes/episode-stats.ts`
- Create: `src/components/social/feed-card/episodes/curve-geometry.ts`
- Test: `src/components/social/feed-card/episodes/episode-stats.test.ts`
- Test: `src/components/social/feed-card/episodes/curve-geometry.test.ts`

**Interfaces:**
- Consumes: `FeedEpisode` de `@/lib/social/feed` (`{ season: number; episode: number; title: string | null; rating: number | null }`).
- Produces:
  - `episodeCode(e: { season: number; episode: number }, short?: boolean): string` → `"S1E4"` / `"E4"`.
  - `bestEpisodes(eps: FeedEpisode[]): Set<FeedEpisode>` (regla de empates).
  - `highlights(eps: FeedEpisode[], k?: number): { best: FeedEpisode[]; worst: FeedEpisode[] }` (sin solaparse; ignora sin nota).
  - `averageRating(eps: FeedEpisode[]): number | null` (escala 1-10; null con menos de 2 notas).
  - `seasonsOf(eps: FeedEpisode[]): number[]` (únicas, ordenadas).
  - `curveGeometry(eps: FeedEpisode[], opts: { width: number; height: number; labels: boolean }): CurveGeometry` con `CurveGeometry = { ticks: { value: number; y: number }[]; axisX: number; plotTop: number; plotBottom: number; right: number; points: { x: number; y: number; episode: FeedEpisode; rated: boolean; best: boolean }[]; segments: { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[]; area: string | null; seasonBreaks: { x: number; season: number }[] }`.

- [ ] **Step 1: Tests que fallan**

`episode-stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FeedEpisode } from "@/lib/social/feed";
import { averageRating, bestEpisodes, episodeCode, highlights, seasonsOf } from "./episode-stats";

const ep = (episode: number, rating: number | null, season = 1): FeedEpisode => ({ season, episode, title: `E${episode}`, rating });

describe("episodeCode", () => {
  it("largo y corto", () => {
    expect(episodeCode(ep(4, 8))).toBe("S1E4");
    expect(episodeCode(ep(4, 8), true)).toBe("E4");
  });
});

describe("bestEpisodes", () => {
  it("un único mejor", () => {
    const eps = [ep(1, 6), ep(2, 9), ep(3, 7)];
    expect([...bestEpisodes(eps)]).toEqual([eps[1]]);
  });
  it("empate parcial: todos los empatados", () => {
    const eps = [ep(1, 9), ep(2, 6), ep(3, 9)];
    expect([...bestEpisodes(eps)]).toEqual([eps[0], eps[2]]);
  });
  it("empate total: ninguno", () => {
    expect(bestEpisodes([ep(1, 8), ep(2, 8)]).size).toBe(0);
  });
  it("sin notas: ninguno; una sola nota: esa", () => {
    expect(bestEpisodes([ep(1, null), ep(2, null)]).size).toBe(0);
    const eps = [ep(1, null), ep(2, 7)];
    expect([...bestEpisodes(eps)]).toEqual([eps[1]]);
  });
});

describe("highlights", () => {
  it("3 mejores y 3 peores, ignorando sin nota, desempate por orden de emisión", () => {
    const eps = [ep(1, 6), ep(2, 10), ep(3, null), ep(4, 2), ep(5, 8), ep(6, 4), ep(7, 10), ep(8, 6)];
    const { best, worst } = highlights(eps);
    expect(best.map((e) => e.episode)).toEqual([2, 7, 5]);
    expect(worst.map((e) => e.episode)).toEqual([4, 6, 1]);
  });
  it("con pocas notas no se solapan", () => {
    const eps = [ep(1, 6), ep(2, 10), ep(3, 2)];
    const { best, worst } = highlights(eps);
    expect(best.map((e) => e.episode)).toEqual([2, 1]);
    expect(worst.map((e) => e.episode)).toEqual([3]);
  });
});

describe("averageRating y seasonsOf", () => {
  it("media de las notas; null con menos de 2", () => {
    expect(averageRating([ep(1, 8), ep(2, 7), ep(3, null)])).toBe(7.5);
    expect(averageRating([ep(1, 8), ep(2, null)])).toBeNull();
  });
  it("temporadas únicas y ordenadas", () => {
    expect(seasonsOf([ep(25, 7, 1), ep(26, 7, 1), ep(1, 7, 2)])).toEqual([1, 2]);
  });
});
```

`curve-geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FeedEpisode } from "@/lib/social/feed";
import { curveGeometry } from "./curve-geometry";

const ep = (episode: number, rating: number | null, season = 1): FeedEpisode => ({ season, episode, title: null, rating });
const opts = { width: 320, height: 120, labels: true };

describe("curveGeometry", () => {
  it("eje 1-5 siempre, de abajo arriba", () => {
    const g = curveGeometry([ep(1, 8), ep(2, 6), ep(3, 7), ep(4, 9)], { ...opts, labels: false });
    expect(g.ticks.map((t) => t.value)).toEqual([1, 2, 3, 4, 5]);
    expect(g.ticks[0].y).toBeGreaterThan(g.ticks[4].y);
  });

  it("un punto por episodio, de izquierda a derecha; la nota 10 arriba del todo", () => {
    const g = curveGeometry([ep(1, 10), ep(2, 2), ep(3, 6), ep(4, 4)], opts);
    expect(g.points).toHaveLength(4);
    expect(g.points[0].x).toBeLessThan(g.points[3].x);
    expect(g.points[0].y).toBeCloseTo(g.ticks[4].y);
    expect(g.points[1].y).toBeCloseTo(g.ticks[0].y);
  });

  it("sin nota: punto hueco en la base y el tramo que lo salta, discontinuo", () => {
    const g = curveGeometry([ep(1, 8), ep(2, null), ep(3, 6), ep(4, 7)], opts);
    expect(g.points[1].rated).toBe(false);
    expect(g.points[1].y).toBe(g.plotBottom);
    expect(g.segments.map((s) => s.dashed)).toEqual([true, false]);
  });

  it("mejor episodio marcado (con la regla de empates)", () => {
    const g = curveGeometry([ep(1, 8), ep(2, 10), ep(3, 6), ep(4, 10)], opts);
    expect(g.points.map((p) => p.best)).toEqual([false, true, false, true]);
  });

  it("separador al cambiar de temporada, entre los dos puntos", () => {
    const g = curveGeometry([ep(25, 8, 1), ep(26, 7, 1), ep(1, 6, 2), ep(2, 9, 2)], opts);
    expect(g.seasonBreaks).toHaveLength(1);
    expect(g.seasonBreaks[0].season).toBe(2);
    expect(g.seasonBreaks[0].x).toBeGreaterThan(g.points[1].x);
    expect(g.seasonBreaks[0].x).toBeLessThan(g.points[2].x);
  });

  it("relleno solo con 2 o más notas", () => {
    expect(curveGeometry([ep(1, 8), ep(2, 7), ep(3, 6), ep(4, 5)], opts).area).toMatch(/^M.*Z$/);
    expect(curveGeometry([ep(1, 8), ep(2, null), ep(3, null), ep(4, null)], opts).area).toBeNull();
  });

  it("con etiquetas deja más margen arriba y abajo", () => {
    const eps = [ep(1, 8), ep(2, 7), ep(3, 6), ep(4, 5)];
    const a = curveGeometry(eps, { ...opts, labels: true });
    const b = curveGeometry(eps, { ...opts, labels: false });
    expect(a.plotTop).toBeGreaterThan(b.plotTop);
    expect(a.plotBottom).toBeLessThan(b.plotBottom);
  });
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `npx vitest run src/components/social/feed-card/episodes`
Expected: FAIL — no se resuelven `./episode-stats` ni `./curve-geometry`.

- [ ] **Step 3: Implementar**

`episode-stats.ts`:

```ts
import type { FeedEpisode } from "@/lib/social/feed";

// Cálculos de la tarjeta de episodios del día (spec 2026-10-05-feed-episodios-
// curva). Notas en la escala guardada 1-10; la vista las pinta sobre 5.

export function episodeCode(e: { season: number; episode: number }, short = false): string {
  return short ? `E${e.episode}` : `S${e.season}E${e.episode}`;
}

const rated = (eps: FeedEpisode[]) => eps.filter((e): e is FeedEpisode & { rating: number } => e.rating != null);

// El mejor (o los mejores si empatan). Si TODOS los que tienen nota empatan y
// son más de uno, no hay «mejor»: no se marca ninguno.
export function bestEpisodes(eps: FeedEpisode[]): Set<FeedEpisode> {
  const withRating = rated(eps);
  if (withRating.length === 0) return new Set();
  const max = Math.max(...withRating.map((e) => e.rating));
  const top = withRating.filter((e) => e.rating === max);
  if (withRating.length > 1 && top.length === withRating.length) return new Set();
  return new Set(top);
}

// «Lo mejor» y «lo peor» del post con muchos episodios: hasta `k` por lado,
// sin que un episodio salga en los dos (con pocas notas, se reparten).
// Desempate por orden de emisión.
export function highlights(eps: FeedEpisode[], k = 3): { best: FeedEpisode[]; worst: FeedEpisode[] } {
  const order = (e: FeedEpisode) => e.season * 10_000 + e.episode;
  const byBest = [...rated(eps)].sort((a, b) => b.rating - a.rating || order(a) - order(b));
  const byWorst = [...rated(eps)].sort((a, b) => a.rating - b.rating || order(a) - order(b));
  const nBest = Math.min(k, Math.ceil(byBest.length / 2));
  const nWorst = Math.min(k, Math.floor(byBest.length / 2));
  return { best: byBest.slice(0, nBest), worst: byWorst.slice(0, nWorst) };
}

export function averageRating(eps: FeedEpisode[]): number | null {
  const withRating = rated(eps);
  if (withRating.length < 2) return null;
  return withRating.reduce((sum, e) => sum + e.rating, 0) / withRating.length;
}

export function seasonsOf(eps: FeedEpisode[]): number[] {
  return [...new Set(eps.map((e) => e.season))].sort((a, b) => a - b);
}
```

`curve-geometry.ts`:

```ts
import type { FeedEpisode } from "@/lib/social/feed";
import { bestEpisodes } from "./episode-stats";

// Geometría de la curva de episodios, separada del SVG para probarla sin DOM.
// Eje vertical fijo 0-10 (escala guardada): las guías van en 2, 4, 6, 8 y 10,
// que la vista rotula 1-5; un episodio sin nota se apoya en la base (0).
export type CurvePoint = { x: number; y: number; episode: FeedEpisode; rated: boolean; best: boolean };
export type CurveGeometry = {
  ticks: { value: number; y: number }[];
  axisX: number;
  plotTop: number;
  plotBottom: number;
  right: number;
  points: CurvePoint[];
  segments: { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[];
  area: string | null;
  seasonBreaks: { x: number; season: number }[];
};

const AXIS_W = 24;
const PAD_R = 10;

export function curveGeometry(
  eps: FeedEpisode[],
  { width, height, labels }: { width: number; height: number; labels: boolean },
): CurveGeometry {
  const plotTop = labels ? 22 : 10;
  const plotBottom = height - (labels ? 20 : 10);
  const left = AXIS_W + (labels ? 16 : 8);
  const right = width - PAD_R;
  const n = eps.length;
  const x = (i: number) => (n > 1 ? left + (i * (right - left)) / (n - 1) : (left + right) / 2);
  const y = (rating: number) => plotTop + ((10 - rating) / 10) * (plotBottom - plotTop);

  const best = bestEpisodes(eps);
  const points: CurvePoint[] = eps.map((e, i) => ({
    x: x(i),
    y: e.rating != null ? y(e.rating) : plotBottom,
    episode: e,
    rated: e.rating != null,
    best: best.has(e),
  }));

  const ratedIdx = points.map((p, i) => (p.rated ? i : -1)).filter((i) => i >= 0);
  const segments = ratedIdx.slice(1).map((i, k) => {
    const prev = ratedIdx[k];
    return { x1: points[prev].x, y1: points[prev].y, x2: points[i].x, y2: points[i].y, dashed: i - prev > 1 };
  });

  const area =
    ratedIdx.length >= 2
      ? "M" +
        ratedIdx.map((i) => `${points[i].x.toFixed(1)},${points[i].y.toFixed(1)}`).join(" L") +
        ` L${points[ratedIdx.at(-1)!].x.toFixed(1)},${plotBottom.toFixed(1)}` +
        ` L${points[ratedIdx[0]].x.toFixed(1)},${plotBottom.toFixed(1)} Z`
      : null;

  const seasonBreaks = eps.flatMap((e, i) =>
    i > 0 && e.season !== eps[i - 1].season ? [{ x: (points[i].x + points[i - 1].x) / 2, season: e.season }] : [],
  );

  const ticks = [1, 2, 3, 4, 5].map((value) => ({ value, y: y(value * 2) }));

  return { ticks, axisX: AXIS_W, plotTop, plotBottom, right, points, segments, area, seasonBreaks };
}
```

- [ ] **Step 4: Comprobar que pasan**

Run: `npx vitest run src/components/social/feed-card/episodes`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/components/social/feed-card/episodes
git commit -m "feat(feed): cálculo de mejores episodios y geometría de la curva"
```

---

### Task 2: `EpisodeTiles` y `EpisodeCurve`

**Files:**
- Create: `src/components/social/feed-card/episodes/episode-tiles.tsx`
- Create: `src/components/social/feed-card/episodes/episode-curve.tsx`
- Modify: `messages/es.json` (`feed.card`: claves nuevas)
- Test: `src/components/social/feed-card/episodes/episode-views.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`episodeCode`, `bestEpisodes`, `curveGeometry`); `formatDots` de `@/lib/rating/dots`; `RatingDots` de `@/components/ui/rating-dots`.
- Produces:
  - `EpisodeTiles({ episodes, itemType, size }: { episodes: FeedEpisode[]; itemType: ItemType; size: "feed" | "post" })`.
  - `EpisodeCurve({ episodes, size, showBest }: { episodes: FeedEpisode[]; size: "feed" | "post"; showBest?: boolean })`.
  - Claves i18n `feed.card.{outOf5, noRatingShort, curveLabel, bestLine, seasons, average, highlightsBest, highlightsWorst, showAll, showLess}`.

- [ ] **Step 1: Copia**

En `messages/es.json`, dentro de `feed.card` (tras `"noRating": "Sin nota"`; añadir la coma), añadir:

```json
      "outOf5": "/5",
      "noRatingShort": "sin nota",
      "curveLabel": "Notas por episodio: {list}",
      "bestLine": "Mejor episodio",
      "seasons": "{count, plural, one {Temporada {list}} other {Temporadas {list}}}",
      "average": "media {value}",
      "highlightsBest": "Lo mejor",
      "highlightsWorst": "Lo peor",
      "showAll": "Ver los {count} episodios",
      "showLess": "Ver menos"
```

Borrar `"moreItems"` **no**: lo sigue usando `FeedMiniList`.

- [ ] **Step 2: Tests que fallan**

`episode-views.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../../messages/es.json";
import type { FeedEpisode } from "@/lib/social/feed";
import { EpisodeTiles } from "./episode-tiles";
import { EpisodeCurve } from "./episode-curve";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      {node}
    </NextIntlClientProvider>,
  );
}

const ep = (episode: number, rating: number | null, title: string | null = `Título ${episode}`, season = 1): FeedEpisode => ({ season, episode, title, rating });

describe("EpisodeTiles", () => {
  it("una ficha por episodio con la nota sobre 5 y el título", () => {
    const { container } = wrap(<EpisodeTiles episodes={[ep(4, 8), ep(5, 7)]} itemType="series" size="feed" />);
    expect(container.textContent).toContain("S1E4");
    expect(container.textContent).toContain("Título 5");
    expect(container.textContent).toContain("3,5/5");
  });

  it("el mejor lleva ★; sin nota dice «sin nota»", () => {
    const { container } = wrap(<EpisodeTiles episodes={[ep(4, 9), ep(5, null), ep(6, 6)]} itemType="series" size="feed" />);
    expect(container.textContent).toContain("S1E4 ★");
    expect(container.textContent).not.toContain("S1E6 ★");
    expect(container.textContent).toContain("sin nota");
  });
});

describe("EpisodeCurve", () => {
  const four = [ep(4, 8), ep(5, 7), ep(6, null), ep(7, 10)];

  it("es una imagen con las notas de cada episodio en su nombre accesible", () => {
    wrap(<EpisodeCurve episodes={four} size="feed" />);
    expect(screen.getByRole("img", { name: /S1E4: 4; S1E5: 3,5; S1E6: sin nota; S1E7: 5/ })).toBeTruthy();
  });

  it("eje 1-5 siempre, también en modo compacto", () => {
    const many = Array.from({ length: 14 }, (_, i) => ep(i + 1, 6 + (i % 4)));
    const { container } = wrap(<EpisodeCurve episodes={many} size="feed" />);
    const axis = [...container.querySelectorAll("[data-axis-tick]")].map((n) => n.textContent);
    expect(axis).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("en el feed, etiquetas por punto hasta 8; desde 9, sin etiquetas", () => {
    const { container: few } = wrap(<EpisodeCurve episodes={four} size="feed" />);
    expect(few.querySelectorAll("[data-point-label]")).toHaveLength(3);
    cleanup();
    const nine = Array.from({ length: 9 }, (_, i) => ep(i + 1, 7));
    const { container: many } = wrap(<EpisodeCurve episodes={nine} size="feed" />);
    expect(many.querySelectorAll("[data-point-label]")).toHaveLength(0);
  });

  it("en el post, etiquetas siempre", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ep(i + 1, 5 + (i % 5)));
    const { container } = wrap(<EpisodeCurve episodes={nine} size="post" />);
    expect(container.querySelectorAll("[data-point-label]")).toHaveLength(9);
  });

  it("showBest pinta el mejor episodio con su título y nota", () => {
    const { container } = wrap(<EpisodeCurve episodes={four} size="feed" showBest />);
    expect(container.textContent).toContain("S1E7 · Título 7");
  });

  it("separador de temporada rotulado", () => {
    const { container } = wrap(<EpisodeCurve episodes={[ep(25, 8, null, 1), ep(26, 7, null, 1), ep(1, 6, null, 2), ep(2, 9, null, 2)]} size="feed" />);
    expect(container.textContent).toContain("T2");
  });
});
```

- [ ] **Step 3: Comprobar que fallan**

Run: `npx vitest run src/components/social/feed-card/episodes/episode-views.test.tsx`
Expected: FAIL — no se resuelven los componentes.

- [ ] **Step 4: Implementar**

`episode-tiles.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { bestEpisodes, episodeCode } from "./episode-stats";

// Fichas de 2-3 episodios (spec 2026-10-05-feed-episodios-curva): con tan pocos
// puntos una curva no tiene forma, así que cada episodio es una ficha con su
// nota grande. En el post, más grandes y con el título entero.
export function EpisodeTiles({
  episodes,
  itemType,
  size,
}: {
  episodes: FeedEpisode[];
  itemType: ItemType;
  size: "feed" | "post";
}) {
  const t = useTranslations("feed");
  const best = bestEpisodes(episodes);
  const post = size === "post";
  return (
    <ul className={`grid gap-1.5 ${episodes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {episodes.map((e) => {
        const isBest = best.has(e);
        return (
          <li
            key={episodeCode(e)}
            className={`min-w-0 rounded-lg border px-2 py-1.5 ${isBest ? "border-[var(--type-series)] bg-surface-muted" : "border-border bg-surface-muted/60"} ${post ? "px-3 py-2.5" : ""}`}
          >
            <p className={`font-mono text-[9.5px] ${isBest ? "text-gold-ink" : "text-muted-foreground"}`}>
              {episodeCode(e)}
              {isBest && " ★"}
            </p>
            {e.rating != null ? (
              <>
                <p className={`font-bold leading-tight text-[var(--type-series)] ${post ? "text-[28px]" : "text-[20px]"}`}>
                  {formatDots(e.rating)}
                  <span className="text-[10px] font-normal text-muted-foreground">{t("card.outOf5")}</span>
                </p>
                <RatingDots value={e.rating} size="sm" itemType={itemType} />
              </>
            ) : (
              <p className={`font-bold leading-tight text-muted-foreground ${post ? "text-[20px]" : "text-[16px]"}`}>
                —<span className="ml-1 text-[10px] font-normal">{t("card.noRatingShort")}</span>
              </p>
            )}
            {e.title && (
              <p className={`mt-1 text-[11px] leading-snug text-foreground ${post ? "text-[13px]" : "line-clamp-2"}`}>{e.title}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

`episode-curve.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import { formatDots } from "@/lib/rating/dots";
import { curveGeometry } from "./curve-geometry";
import { bestEpisodes, episodeCode } from "./episode-stats";

// Curva de los episodios del día (4 o más). SVG propio; la geometría vive en
// curve-geometry.ts. Eje 1-5 siempre, sin línea de media. En el feed lleva la
// nota y el código en cada punto hasta 8 episodios; desde 9 queda compacta.
// En el post, siempre con etiquetas.
const SIZE = { feed: { width: 320, labeled: 124, compact: 80 }, post: { width: 600, labeled: 170, compact: 170 } };
const FEED_LABEL_MAX = 8;

export function EpisodeCurve({
  episodes,
  size,
  showBest = false,
}: {
  episodes: FeedEpisode[];
  size: "feed" | "post";
  showBest?: boolean;
}) {
  const t = useTranslations("feed");
  const labels = size === "post" || episodes.length <= FEED_LABEL_MAX;
  const { width } = SIZE[size];
  const height = labels ? SIZE[size].labeled : SIZE[size].compact;
  const g = curveGeometry(episodes, { width, height, labels });
  const label = t("card.curveLabel", {
    list: episodes.map((e) => `${episodeCode(e)}: ${e.rating != null ? formatDots(e.rating) : t("card.noRatingShort")}`).join("; "),
  });
  const best = [...bestEpisodes(episodes)][0];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block h-auto w-full">
        <defs>
          <linearGradient id="episode-curve-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--type-series)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--type-series)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={g.axisX} x2={g.right} y1={tick.y} y2={tick.y} stroke="var(--border)" />
            <text data-axis-tick x={g.axisX - 6} y={tick.y + 3} textAnchor="end" fontSize="9.5" fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
              {tick.value}
            </text>
          </g>
        ))}
        <line x1={g.axisX} x2={g.axisX} y1={g.ticks[4].y - 4} y2={g.plotBottom} stroke="var(--border)" />
        {g.area && <path d={g.area} fill="url(#episode-curve-fill)" />}
        {g.seasonBreaks.map((b) => (
          <g key={b.season}>
            <line x1={b.x} x2={b.x} y1={g.plotTop - 6} y2={g.plotBottom} stroke="var(--border)" strokeDasharray="2 3" />
            <text x={b.x + 3} y={g.plotTop - 8} fontSize="8.5" fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
              T{b.season}
            </text>
          </g>
        ))}
        {g.segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="var(--type-series)"
            strokeWidth={labels ? 2 : 1.6}
            strokeLinecap="round"
            strokeDasharray={s.dashed ? "3 3" : undefined}
            opacity={s.dashed ? 0.6 : 1}
          />
        ))}
        {g.points.map((p) => (
          <g key={episodeCode(p.episode)}>
            {p.rated ? (
              <circle
                cx={p.x}
                cy={p.y}
                r={labels ? (p.best ? 6 : 4.5) : p.best ? 4 : 2}
                fill={p.best ? "var(--foreground)" : "var(--type-series)"}
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ) : (
              <circle cx={p.x} cy={p.y} r={labels ? 4 : 2} fill="var(--surface)" stroke="var(--muted-foreground)" strokeDasharray="2 2" />
            )}
            {labels && (
              <>
                {p.rated && (
                  <text data-point-label x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={p.best ? "var(--foreground)" : "var(--type-series)"}>
                    {formatDots(p.episode.rating)}
                  </text>
                )}
                <text x={p.x} y={height - 5} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
                  {episodeCode(p.episode, true)}
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
      {!labels && (
        <p className="mt-0.5 flex justify-between font-mono text-[9.5px] text-muted-foreground">
          <span>{episodeCode(episodes[0])}</span>
          <span>{episodeCode(episodes[episodes.length - 1])}</span>
        </p>
      )}
      {showBest && best && (
        <p className="mt-1.5 text-[12px]">
          <span className="text-gold-ink" aria-label={t("card.bestLine")}>★</span>{" "}
          <span className="font-semibold">{[episodeCode(best), best.title].filter(Boolean).join(" · ")}</span>{" "}
          <span className="font-mono text-[var(--type-series)]">{formatDots(best.rating)}</span>
        </p>
      )}
    </div>
  );
}
```

Nota: si `text-gold-ink` o `var(--font-mono)` no existen en `src/app/globals.css`, usar el token equivalente que sí exista (buscar con grep) y decirlo en el informe.

- [ ] **Step 5: Comprobar que pasan**

Run: `npx vitest run src/components/social/feed-card/episodes`
Expected: PASS.

Run: `npx tsc --noEmit` → sin errores. `npx eslint src/components/social/feed-card/episodes` → sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/social/feed-card/episodes messages/es.json
git commit -m "feat(feed): fichas y curva de episodios"
```

---

### Task 3: Vistas del post — `EpisodeList` y `EpisodeHighlights`

**Files:**
- Create: `src/components/social/feed-card/episodes/episode-list.tsx`
- Create: `src/components/social/feed-card/episodes/episode-highlights.tsx`
- Test: `src/components/social/feed-card/episodes/episode-post-views.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`episodeCode`, `bestEpisodes`, `highlights`), claves `feed.card.{highlightsBest, highlightsWorst, showAll, showLess, noRatingShort}` (Task 2).
- Produces:
  - `EpisodeList({ episodes, itemType }: { episodes: FeedEpisode[]; itemType: ItemType })` — todos, 1 columna en móvil y 2 desde `sm`, orden de arriba abajo por columna; el mejor con ★ y fondo.
  - `EpisodeHighlights({ episodes, itemType })` — «Lo mejor»/«Lo peor» (3 y 3) en 2 columnas desde `sm` y botón «Ver los N episodios» / «Ver menos» que despliega `EpisodeList`.

- [ ] **Step 1: Tests que fallan**

`episode-post-views.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../../messages/es.json";
import type { FeedEpisode } from "@/lib/social/feed";
import { EpisodeList } from "./episode-list";
import { EpisodeHighlights } from "./episode-highlights";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      {node}
    </NextIntlClientProvider>,
  );
}

const ep = (episode: number, rating: number | null): FeedEpisode => ({ season: 1, episode, title: `Título ${episode}`, rating });

describe("EpisodeList", () => {
  it("todos los episodios con título y nota sobre 5; el mejor con ★", () => {
    const eps = [ep(1, 6), ep(2, 9), ep(3, null), ep(4, 7)];
    const { container } = wrap(<EpisodeList episodes={eps} itemType="series" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(container.textContent).toContain("Título 3");
    expect(container.textContent).toContain("4,5");
    expect(screen.getByText("Título 2").parentElement!.textContent).toContain("★");
  });
});

describe("EpisodeHighlights", () => {
  const many = Array.from({ length: 14 }, (_, i) => ep(i + 1, [6, 10, 4, 8, 2, 7, 9, 5, 6, 3, 8, 7, 6, 5][i]));

  it("3 mejores y 3 peores, el resto plegado", () => {
    const { container } = wrap(<EpisodeHighlights episodes={many} itemType="series" />);
    expect(container.textContent).toContain("Lo mejor");
    expect(container.textContent).toContain("Lo peor");
    expect(container.textContent).toContain("Título 2"); // 10
    expect(container.textContent).toContain("Título 5"); // 2
    expect(container.textContent).not.toContain("Título 13");
  });

  it("«Ver los 14 episodios» despliega la lista completa y «Ver menos» la recoge", () => {
    const { container } = wrap(<EpisodeHighlights episodes={many} itemType="series" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver los 14 episodios" }));
    expect(container.textContent).toContain("Título 13");
    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(container.textContent).not.toContain("Título 13");
  });
});
```

- [ ] **Step 2: Comprobar que fallan**

Run: `npx vitest run src/components/social/feed-card/episodes/episode-post-views.test.tsx`
Expected: FAIL — no se resuelven los componentes.

- [ ] **Step 3: Implementar**

`episode-list.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import { bestEpisodes, episodeCode } from "./episode-stats";

// Lista de episodios del post (4-12, o desplegada desde «Ver los N»): una fila
// por episodio, en 2 columnas desde `sm` y de arriba abajo por columna.
export function EpisodeList({ episodes, itemType }: { episodes: FeedEpisode[]; itemType: ItemType }) {
  const best = bestEpisodes(episodes);
  return (
    <ul className="gap-x-6 sm:columns-2">
      {episodes.map((e) => (
        <EpisodeRow key={episodeCode(e)} episode={e} itemType={itemType} best={best.has(e)} />
      ))}
    </ul>
  );
}

export function EpisodeRow({
  episode: e,
  itemType,
  best = false,
  longCode = false,
}: {
  episode: FeedEpisode;
  itemType: ItemType;
  best?: boolean;
  longCode?: boolean;
}) {
  const t = useTranslations("feed");
  return (
    <li className={`flex break-inside-avoid items-center gap-2.5 rounded-md px-1.5 py-1 text-[13px] ${best ? "bg-surface-muted" : ""}`}>
      <span className={`shrink-0 font-mono text-[10.5px] text-muted-foreground ${longCode ? "w-11" : "w-8"}`}>{episodeCode(e, !longCode)}</span>
      <span className="min-w-0 flex-1 truncate">
        {e.title}
        {best && <span className="ml-1 text-gold-ink">★</span>}
      </span>
      {e.rating != null ? (
        <>
          <RatingDots value={e.rating} size="sm" itemType={itemType} />
          <span className="w-7 shrink-0 text-right font-mono text-[11px] text-[var(--type-series)]">{formatDots(e.rating)}</span>
        </>
      ) : (
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{t("card.noRatingShort")}</span>
      )}
    </li>
  );
}
```

`episode-highlights.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FeedEpisode } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { highlights } from "./episode-stats";
import { EpisodeList, EpisodeRow } from "./episode-list";

// Post con 13 o más episodios: la lista entera sería un muro. «Lo mejor» y «lo
// peor» (3 y 3) a la vista; el resto, a un toque en «Ver los N episodios».
export function EpisodeHighlights({ episodes, itemType }: { episodes: FeedEpisode[]; itemType: ItemType }) {
  const t = useTranslations("feed");
  const [open, setOpen] = useState(false);
  const { best, worst } = highlights(episodes);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { key: "best", title: t("card.highlightsBest"), list: best },
          { key: "worst", title: t("card.highlightsWorst"), list: worst },
        ].map((col) => (
          <section key={col.key}>
            <h3 className="mb-1 font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase">{col.title}</h3>
            <ul>
              {col.list.map((e) => (
                <EpisodeRow key={`${e.season}-${e.episode}`} episode={e} itemType={itemType} longCode />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start text-[12.5px] font-medium text-accent hover:underline"
      >
        {open ? t("card.showLess") : t("card.showAll", { count: episodes.length })}
      </button>
      {open && <EpisodeList episodes={episodes} itemType={itemType} />}
    </div>
  );
}
```

- [ ] **Step 4: Comprobar que pasan**

Run: `npx vitest run src/components/social/feed-card/episodes`
Expected: PASS. Luego `npx tsc --noEmit` y `npx eslint src/components/social/feed-card/episodes` sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/social/feed-card/episodes
git commit -m "feat(feed): lista y destacados de episodios para la página del post"
```

---

### Task 4: `ReviewCard` usa fichas, curva, lista y destacados

**Files:**
- Modify: `src/components/social/review-card.tsx` (rama `else` de `eps.length === 1`; imports)
- Test: `src/components/social/review-joint-cards.test.tsx` (`describe("ReviewCard")`)

**Interfaces:**
- Consumes: `EpisodeTiles`, `EpisodeCurve`, `EpisodeList`, `EpisodeHighlights`, `averageRating`, `seasonsOf` (Tasks 1-3); `formatDots`.
- Produces: `ReviewCard` con las mismas props. Ruta de 1 episodio y ruta de obra **sin cambios**.

Reglas (varios episodios):
- Fila de obra: título = serie; datos = `workType` · `t("card.seasons", { count, list })` (con `new Intl.ListFormat("es", { type: "conjunction" }).format(seasons.map(String))` → «1 y 2») · `t("card.average", { value: formatDots(avg) })` si hay media.
- Debajo de la fila (ancho completo, no dentro de `FeedWorkRow`):
  - `eps.length <= 3` → `<EpisodeTiles size={showInteractions ? "feed" : "post"} />`.
  - Feed (`showInteractions`) y 4+ → `<EpisodeCurve size="feed" showBest />`.
  - Post y 4-12 → `<EpisodeCurve size="post" />` + `<EpisodeList />`.
  - Post y 13+ → `<EpisodeCurve size="post" />` + `<EpisodeHighlights />`.
- `FeedMiniList` deja de importarse aquí (el componente se queda: lo usarán las PRs 2-3).

- [ ] **Step 1: Ajustar los tests**

En `review-joint-cards.test.tsx`, sustituir el test «varios episodios: cada uno con su nota, «Sin nota» si no la tiene y «+N más» pasado el tercero» y el que comprueba `role="img"` de «Sin nota» en la mini-lista por estos (mantener los helpers `watched` y `ep` que ya existen en el fichero; `ep(episode, rating, title)` crea temporada 2):

```tsx
  it("2-3 episodios: fichas con la nota sobre 5 y la temporada en los datos", () => {
    const { container } = wrap(<ReviewCard event={watched([ep(3, 4, "1893"), ep(4, 7), ep(5, null)])} viewerLoggedIn knownUsernames={[]} />);
    expect(container.textContent).toContain("valoró 3 episodios");
    expect(container.textContent).toContain("Temporada 2");
    expect(container.textContent).toContain("3,5/5");
    expect(container.textContent).toContain("sin nota");
    expect(container.textContent).not.toContain("más");
  });

  it("4 o más en el feed: curva con todas las notas, sin «+N más», y el mejor debajo", () => {
    const eps = [ep(3, 4, "1893"), ep(4, 8, "Corazón"), ep(5, null), ep(6, 6), ep(7, 10, "Gloria")];
    const { container } = wrap(<ReviewCard event={watched(eps)} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.getByRole("img", { name: /S2E3: 2; S2E4: 4; S2E5: sin nota; S2E6: 3; S2E7: 5/ })).toBeTruthy();
    expect(container.textContent).toContain("S2E7 · Gloria");
    expect(container.textContent).not.toContain("más");
  });

  it("post con 4-12: curva y la lista completa", () => {
    const eps = [ep(3, 4, "1893"), ep(4, 8, "Corazón"), ep(5, 6, "Ciencia"), ep(6, 6, "Final")];
    wrap(<ReviewCard event={watched(eps)} viewerLoggedIn knownUsernames={[]} showInteractions={false} />);
    expect(screen.getByRole("img", { name: /S2E3: 2/ })).toBeTruthy();
    expect(screen.getByText("Final")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ver los/ })).toBeNull();
  });

  it("post con 13+: curva, lo mejor y lo peor, y «Ver los 13 episodios»", () => {
    const eps = Array.from({ length: 13 }, (_, i) => ep(i + 1, (i % 9) + 2, `Cap ${i + 1}`));
    const { container } = wrap(<ReviewCard event={watched(eps)} viewerLoggedIn knownUsernames={[]} showInteractions={false} />);
    expect(container.textContent).toContain("Lo mejor");
    expect(screen.getByRole("button", { name: "Ver los 13 episodios" })).toBeTruthy();
  });
```

(Si al leer el fichero el helper `ep` tiene otra firma, adaptar las llamadas, no el helper.)

- [ ] **Step 2: Comprobar que fallan**

Run: `npx vitest run src/components/social/review-joint-cards.test.tsx -t "ReviewCard"`
Expected: FAIL en los cuatro tests nuevos.

- [ ] **Step 3: Implementar**

En `review-card.tsx`:

Imports: quitar `FeedMiniList`; añadir

```tsx
import { formatDots } from "@/lib/rating/dots";
import { EpisodeTiles } from "./feed-card/episodes/episode-tiles";
import { EpisodeCurve } from "./feed-card/episodes/episode-curve";
import { EpisodeList } from "./feed-card/episodes/episode-list";
import { EpisodeHighlights } from "./feed-card/episodes/episode-highlights";
import { averageRating, seasonsOf } from "./feed-card/episodes/episode-stats";
```

Declarar junto a `let row` una variable `let episodesView: React.ReactNode = null;`.

Sustituir el bloque `else { row = (<FeedWorkRow … ><FeedMiniList … /></FeedWorkRow>); }` por:

```tsx
    } else {
      const seasons = seasonsOf(eps);
      const avg = averageRating(eps);
      const facts = [
        workType,
        t("card.seasons", {
          count: seasons.length,
          list: new Intl.ListFormat("es", { type: "conjunction" }).format(seasons.map(String)),
        }),
        avg != null ? t("card.average", { value: formatDots(avg) }) : null,
      ].filter(Boolean).join(" · ");
      row = (
        <FeedWorkRow
          itemType={event.itemType}
          itemId={event.itemId}
          coverUrl={event.itemCoverUrl}
          title={event.itemTitle}
          facts={facts}
        />
      );
      // Fichas con 2-3 (una curva de 2-3 puntos no tiene forma); curva desde 4.
      // En el post (sin interacciones) hay sitio: lista completa hasta 12 y,
      // desde 13, lo mejor y lo peor con el resto plegado.
      episodesView =
        eps.length <= 3 ? (
          <EpisodeTiles episodes={eps} itemType={event.itemType} size={showInteractions ? "feed" : "post"} />
        ) : showInteractions ? (
          <EpisodeCurve episodes={eps} size="feed" showBest />
        ) : (
          <>
            <EpisodeCurve episodes={eps} size="post" />
            {eps.length <= 12 ? (
              <EpisodeList episodes={eps} itemType={event.itemType} />
            ) : (
              <EpisodeHighlights episodes={eps} itemType={event.itemType} />
            )}
          </>
        );
    }
```

Y en el JSX de retorno, entre `{row}` y `{excerpt}`:

```tsx
      {row}
      {episodesView}
      {excerpt}
```

Actualizar el comentario de cabecera de la función: la ruta de varios episodios ya no es «debajo cada episodio con SU nota en una mini-lista», sino fichas (2-3) / curva (4+), y en el post lista o destacados.

- [ ] **Step 4: Comprobar que pasan**

Run: `npx vitest run src/components/social src/lib/social`
Expected: PASS.

Run: `npx tsc --noEmit` y `npx eslint src/components/social/review-card.tsx src/components/social/feed-card` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/social/review-card.tsx src/components/social/review-joint-cards.test.tsx
git commit -m "feat(feed): episodios del día en fichas o curva, y lista o destacados en el post"
```

---

### Task 5 (controlador): doc, issue, verificación

- [ ] Entrada al final de `docs/requirements/decisiones.md` (CRLF): regla 1 / 2-3 / 4+ y post 4-12 / 13+, escala sobre 5, sin media en el gráfico, empates.
- [ ] Issue `area:social,tipo:feature,P3`: «Post de episodios: mostrar la reseña de cada episodio del día» (hoy solo la del episodio del que cuelga; hay que traer `review`/`review_is_spoiler` en `dayWatches`).
- [ ] Verificación visual con sesión iniciada (Inicio y `/post/[id]`, 375 px y escritorio, claro y oscuro). Sin sesión: decirlo y pedírsela al usuario.
- [ ] Commit de docs, push y PR.
