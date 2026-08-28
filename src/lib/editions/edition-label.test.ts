import { describe, expect, it } from "vitest";
import { formatEdition, pagesForPass } from "./edition-label";
import type { Edition } from "./types";

const base: Edition = {
  id: "1", label: "Bolsillo", publisher: "DeBolsillo", year: 2011,
  language: "ES", totalUnits: 880, isbn: null, coverUrl: null,
};

describe("formatEdition", () => {
  it("junta editorial y paginas en un libro", () => {
    expect(formatEdition(base, "book")).toBe("Bolsillo · DeBolsillo · 880 p");
  });

  it("usa minutos en una pelicula", () => {
    const extended: Edition = { ...base, label: "Extendida", publisher: null, totalUnits: 166 };
    expect(formatEdition(extended, "movie")).toBe("Extendida · 2h 46m");
  });

  it("se queda en la etiqueta cuando no hay mas datos", () => {
    const bare: Edition = { ...base, publisher: null, totalUnits: null };
    expect(formatEdition(bare, "book")).toBe("Bolsillo");
  });
});

// La precedencia de páginas tiene DOS peldaños y solo dos (spec 2026-08-26 §5).
// Cada caso distingue una implementación correcta de una rota: si el helper
// devolviera siempre las de la obra, el primero falla; si devolviera siempre
// las de la edición, el segundo y el tercero; si tratara el 0 como ausente
// (`||` en vez de `??`), el cuarto.
describe("pagesForPass", () => {
  it("manda la edición que el usuario identificó en su pase", () => {
    expect(pagesForPass({ totalUnits: 880 }, 1200)).toBe(880);
  });

  it("sin edición en el pase, las páginas orientativas de la obra", () => {
    expect(pagesForPass(null, 1200)).toBe(1200);
  });

  it("con edición SIN páginas, cae a las de la obra", () => {
    expect(pagesForPass({ totalUnits: null }, 1200)).toBe(1200);
  });

  it("un total de 0 en la edición es un total, no una ausencia", () => {
    expect(pagesForPass({ totalUnits: 0 }, 1200)).toBe(0);
  });

  it("null cuando no hay ni edición ni páginas de la obra", () => {
    expect(pagesForPass(null, null)).toBeNull();
  });
});
