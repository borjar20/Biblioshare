import { describe, expect, it } from "vitest";
import { formatEdition, primaryEdition } from "./edition-label";
import type { Edition } from "./types";

const base: Edition = {
  id: "1", label: "Bolsillo", publisher: "DeBolsillo", year: 2011,
  language: "ES", totalUnits: 880, isbn: null, coverUrl: null, isPrimary: false,
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

describe("primaryEdition", () => {
  it("devuelve la primaria", () => {
    const primary: Edition = { ...base, id: "2", isPrimary: true };
    expect(primaryEdition([base, primary])?.id).toBe("2");
  });

  it("devuelve null sin ediciones", () => {
    expect(primaryEdition([])).toBeNull();
  });
});
