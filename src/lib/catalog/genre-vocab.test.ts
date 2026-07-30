import { describe, expect, it } from "vitest";
import {
  GENRES,
  labelForSlug,
  slugForLabel,
  isCanonicalLabel,
  genreDefForSlug,
} from "./genre-vocab";

describe("genre-vocab", () => {
  it("no tiene slugs duplicados", () => {
    const slugs = GENRES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("no tiene labels duplicadas", () => {
    const labels = GENRES.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("los slugs son URL-safe (minúsculas, guiones, sin acentos)", () => {
    for (const g of GENRES) {
      expect(g.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("appliesTo nunca está vacío", () => {
    for (const g of GENRES) expect(g.appliesTo.length).toBeGreaterThan(0);
  });

  it("slugForLabel y labelForSlug son inversas", () => {
    for (const g of GENRES) {
      expect(slugForLabel(g.label)).toBe(g.slug);
      expect(labelForSlug(g.slug)).toBe(g.label);
    }
  });

  it("devuelve null para desconocidos", () => {
    expect(labelForSlug("no-existe")).toBeNull();
    expect(slugForLabel("No existe")).toBeNull();
    expect(genreDefForSlug("no-existe")).toBeNull();
    expect(isCanonicalLabel("No existe")).toBe(false);
  });

  it("reconoce una label canónica conocida", () => {
    expect(isCanonicalLabel("Ciencia ficción")).toBe(true);
    expect(slugForLabel("Ciencia ficción")).toBe("ciencia-ficcion");
  });

  it("Historia aplica a los tres tipos (libro, peli y serie)", () => {
    const historia = GENRES.find((g) => g.slug === "historia");
    expect(historia?.appliesTo).toEqual(["book", "movie", "series"]);
  });
});
