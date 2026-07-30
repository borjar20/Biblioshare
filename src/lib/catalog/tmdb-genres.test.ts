import { describe, expect, it } from "vitest";
import { resolveGenresFromIds, resolveGenresFromEsLabels } from "./tmdb-genres";
import { isCanonicalLabel } from "./genre-vocab";

describe("tmdb-genres por id", () => {
  it("mapea ids simples a su label canónica", () => {
    expect(resolveGenresFromIds([878])).toEqual(["Ciencia ficción"]);
    expect(resolveGenresFromIds([99])).toEqual(["Documental"]);
    expect(resolveGenresFromIds([53])).toEqual(["Thriller"]); // Suspense → Thriller
  });

  it("los ids compuestos de TV emiten varios slugs", () => {
    expect(resolveGenresFromIds([10765])).toEqual(["Ciencia ficción", "Fantasía"]);
    expect(resolveGenresFromIds([10759])).toEqual(["Acción", "Aventura"]);
    expect(resolveGenresFromIds([10768])).toEqual(["Bélica", "Política"]);
  });

  it("descarta ids de ruido", () => {
    expect(resolveGenresFromIds([10762, 10764, 10767, 10763, 10770, 10766])).toEqual([]);
  });

  it("dedupe y corta a 5", () => {
    // 10759 (Acción,Aventura) + 28 (Acción) → Acción una sola vez
    expect(resolveGenresFromIds([10759, 28])).toEqual(["Acción", "Aventura"]);
    const many = resolveGenresFromIds([878, 14, 27, 53, 9648, 18, 35]);
    expect(many.length).toBe(5);
  });

  it("toda salida es canónica", () => {
    for (const label of resolveGenresFromIds([878, 10765, 10759, 80])) {
      expect(isCanonicalLabel(label)).toBe(true);
    }
  });

  it("undefined/vacío → []", () => {
    expect(resolveGenresFromIds(undefined)).toEqual([]);
    expect(resolveGenresFromIds([])).toEqual([]);
  });
});

describe("tmdb-genres por label es-ES (backfill)", () => {
  it("traduce labels crudas de TMDB a canónicas", () => {
    expect(resolveGenresFromEsLabels(["Suspense"])).toEqual(["Thriller"]);
    expect(resolveGenresFromEsLabels(["Sci-Fi & Fantasy"])).toEqual([
      "Ciencia ficción",
      "Fantasía",
    ]);
  });

  it("descarta labels de ruido y desconocidas", () => {
    expect(resolveGenresFromEsLabels(["Película de TV", "Kids", "Xyz"])).toEqual([]);
  });
});
