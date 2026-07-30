import { describe, expect, it } from "vitest";
import { genrePagerState } from "./genre-pager";

// Límite de visibilidad del pager de /genero/[slug]. Antes de esta feature la
// página no exponía forma de llegar a la página 2+ (total > PAGE_SIZE pero sin
// controles) — este test fija el contrato: con 2 páginas, la página 2 debe ser
// alcanzable desde la 1 (showNext) y la 1 desde la 2 (showPrev), y "next" debe
// desaparecer justo en la última página, no antes ni después.
describe("genrePagerState", () => {
  it("una sola página: no se muestra el pager", () => {
    expect(genrePagerState(1, 1).visible).toBe(false);
  });

  it("página 1 de 2: siguiente visible (página 2 alcanzable), anterior no", () => {
    const s = genrePagerState(1, 2);
    expect(s.visible).toBe(true);
    expect(s.showNext).toBe(true);
    expect(s.showPrev).toBe(false);
  });

  it("página 2 de 2 (última): siguiente oculto, anterior visible", () => {
    const s = genrePagerState(2, 2);
    expect(s.visible).toBe(true);
    expect(s.showNext).toBe(false);
    expect(s.showPrev).toBe(true);
  });

  it("página intermedia de un rango mayor: ambos visibles", () => {
    const s = genrePagerState(2, 3);
    expect(s.showPrev).toBe(true);
    expect(s.showNext).toBe(true);
  });
});
