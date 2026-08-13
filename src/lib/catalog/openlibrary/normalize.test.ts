import { describe, expect, it } from "vitest";
import { acceptEditionTitle, normalizeAuthorWorks, normalizeTitleForComparison } from "./normalize";
import collinsEs from "./__fixtures__/collins-es.json";
import collinsEn from "./__fixtures__/collins-en.json";
import shustermanEs from "./__fixtures__/shusterman-es.json";
import shustermanEn from "./__fixtures__/shusterman-en.json";

describe("normalizeTitleForComparison", () => {
  it("iguala mayúsculas, acentos y puntuación", () => {
    expect(normalizeTitleForComparison("Duckling ugly")).toBe(
      normalizeTitleForComparison("Duckling Ugly")
    );
    expect(normalizeTitleForComparison("It's O.K. to say no!")).toBe(
      normalizeTitleForComparison("It's Ok to Say No!")
    );
    expect(normalizeTitleForComparison("En llamas")).toBe(
      normalizeTitleForComparison("  EN  LLAMAS  ")
    );
  });

  it("no confunde dos títulos distintos de la misma saga", () => {
    expect(normalizeTitleForComparison("Fundación")).not.toBe(
      normalizeTitleForComparison("Fundación e Imperio")
    );
  });
});

describe("acceptEditionTitle", () => {
  it("acepta el título de la edición en el idioma pedido", () => {
    expect(acceptEditionTitle("Fatta Eld", "En llamas", ["spa"], "spa")).toBe("En llamas");
  });

  it("rechaza una edición en otro idioma aunque venga primera", () => {
    // `lang=es` devuelve la MEJOR edición disponible, no necesariamente en
    // español: sin esta comprobación se cuelan títulos en alemán y turco, que
    // son peores que el título inglés de la obra.
    expect(
      acceptEditionTitle("Gregor and the Marks of Secret", "Gregor Und Der Fluch DES Unterlandes", ["ger"], "spa")
    ).toBeNull();
  });

  it("rechaza un título de edición que pierde información respecto al de la obra", () => {
    // El work «Gregor and the Code of Claw» no puede quedarse en «Gregor».
    expect(acceptEditionTitle("Gregor and the Code of Claw", "Gregor", ["eng"], "eng")).toBeNull();
  });

  it("acepta un título más largo o distinto, aunque comparta prefijo", () => {
    expect(acceptEditionTitle("Gregor", "Gregor the Overlander", ["eng"], "eng")).toBe(
      "Gregor the Overlander"
    );
    expect(acceptEditionTitle("The Hunger Games", "Los juegos del hambre", ["spa"], "spa")).toBe(
      "Los juegos del hambre"
    );
  });

  it("tolera edición ausente o sin idiomas", () => {
    expect(acceptEditionTitle("Scythe", undefined, ["spa"], "spa")).toBeNull();
    expect(acceptEditionTitle("Scythe", "Siega", undefined, "spa")).toBeNull();
    expect(acceptEditionTitle("Scythe", "", ["spa"], "spa")).toBeNull();
  });
});

// Los fixtures son respuestas REALES capturadas el 2026-08-13. Al estar
// congelados, estos recuentos son estables aunque Open Library cambie.
const collins = normalizeAuthorWorks(collinsEs.docs, collinsEn.docs);
const shusterman = normalizeAuthorWorks(shustermanEs.docs, shustermanEn.docs);
const titulos = (obras: { title: string }[]) => obras.map((o) => o.title);

describe("normalizeAuthorWorks · recuentos", () => {
  it("Collins pasa de 25 entradas crudas a 14 obras", () => {
    expect(collinsEs.docs).toHaveLength(25);
    expect(collins).toHaveLength(14);
  });

  it("Shusterman pasa de 86 entradas crudas a 68 obras", () => {
    expect(shustermanEs.docs).toHaveLength(86);
    expect(shusterman).toHaveLength(68);
  });

  it("sin `collection` entre los patrones, sobrevive «The Unwind Collection»", () => {
    // El precio exacto de haber quitado ese patrón: es el único estuche que
    // pasa el filtro en las 111 obras probadas. Se documenta aquí para que la
    // próxima persona no lo lea como un fallo.
    expect(titulos(shusterman)).toContain("The Unwind Collection");
  });

  it("todas las obras salen con año, que es el fallo que originó esto", () => {
    // En dev, 83 de los 84 «libros» de Shusterman no tenían año.
    expect(collins.every((o) => o.year !== null)).toBe(true);
    expect(shusterman.every((o) => o.year !== null)).toBe(true);
  });
});

describe("normalizeAuthorWorks · título", () => {
  it("usa el título español de la edición, no el arbitrario de la obra", () => {
    // El work OL36410330W se titula «Fatta Eld» (sueco) y tiene 116 ediciones,
    // de las que solo 2 son suecas y 7 españolas, tituladas «En llamas».
    expect(titulos(collins)).toContain("En llamas");
    expect(titulos(collins)).not.toContain("Fatta Eld");
    expect(titulos(collins)).toContain("Los juegos del hambre");
    expect(titulos(collins)).toContain("Sinsajo");
  });

  it("no trunca un título cuando la edición pierde información", () => {
    expect(titulos(collins)).toContain("Gregor and the Code of Claw");
    expect(titulos(collins)).not.toContain("Gregor");
  });
});

describe("normalizeAuthorWorks · filtros", () => {
  it("descarta las obras sin edición en español ni inglés", () => {
    // «Dena sutan» es Catching Fire en euskera, con tres registros de obra.
    expect(titulos(collins).some((t) => t.includes("Dena sutan"))).toBe(false);
  });

  it("descarta estuches y omnibus", () => {
    for (const basura of [
      "Gregor the Overlander Box Set",
      "Hunger Games 5-Book Box Set",
      "The Underland Chronicles 5 Volume Set",
    ]) {
      expect(titulos(collins)).not.toContain(basura);
    }
    expect(titulos(collins).some((t) => t.toLowerCase().includes("trilog"))).toBe(false);
  });

  it("NO usa un umbral de ediciones: una novedad con una sola edición sobrevive", () => {
    // `Sunrise on the Reaping` tenía 1 edición y es una novela real de 2025.
    // Se fusiona con `Amanecer de la Cosecha`, que tiene 11.
    expect(titulos(collins)).toContain("Amanecer de la Cosecha");
  });
});

describe("normalizeAuthorWorks · desduplicación", () => {
  it("fusiona dos registros del mismo libro en idiomas distintos", () => {
    // «Amanecer de la Cosecha» y «Sunrise on the Reaping» son el mismo libro en
    // dos works: sus conjuntos de títulos candidatos se cruzan por el inglés.
    expect(titulos(collins).filter((t) => t.toLowerCase().includes("reaping"))).toHaveLength(0);
    expect(titulos(collins).filter((t) => t === "Amanecer de la Cosecha")).toHaveLength(1);
  });

  it("fusiona los registros repetidos de Shusterman", () => {
    // `Dread locks` estaba tres veces y `Duckling ugly` dos.
    const repetidos = titulos(shusterman).filter((t) => /dread locks/i.test(t));
    expect(repetidos).toHaveLength(1);
  });

  it("no fusiona dos libros distintos de una misma saga", () => {
    const clave = titulos(shusterman).filter((t) => /^Everlost$|^Everwild$|^Everfound$/.test(t));
    expect(clave.length).toBeGreaterThanOrEqual(2);
  });

  it("no deja dos obras con la misma work key", () => {
    const keys = collins.map((o) => o.workKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("normalizeAuthorWorks · bordes", () => {
  it("con listas vacías devuelve lista vacía", () => {
    expect(normalizeAuthorWorks([], [])).toEqual([]);
  });

  it("descarta docs sin key o sin título", () => {
    expect(
      normalizeAuthorWorks(
        [{ title: "Sin key", language: ["eng"] }, { key: "/works/OL1W", language: ["eng"] }],
        []
      )
    ).toEqual([]);
  });

  it("un libro real llamado «Omnibus» cae — falso positivo asumido", () => {
    expect(
      normalizeAuthorWorks(
        [{ key: "/works/OL9W", title: "Omnibus", language: ["eng"], edition_count: 3 }],
        []
      )
    ).toEqual([]);
  });

  it("respeta el orden de Open Library, no el alfabético", () => {
    expect(collins[0].title).toBe("Los juegos del hambre");
  });
});
