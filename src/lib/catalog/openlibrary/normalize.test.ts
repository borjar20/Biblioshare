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

  // El idioma del título elegido VIAJA con el título. Sin esta etiqueta, la
  // hidratación en lote no puede decir a `repr_meta` de dónde salió y un
  // título inglés escrito por el lote quedaría congelado (modo de fallo #730).
  it("declara el idioma del título elegido", () => {
    const [work] = normalizeAuthorWorks(
      [
        {
          key: "/works/OL1W",
          title: "Words of Radiance",
          language: ["spa", "eng"],
          edition_count: 23,
          editions: { docs: [{ title: "Palabras Radiantes", language: ["spa"] }] },
        },
      ],
      [
        {
          key: "/works/OL1W",
          title: "Words of Radiance",
          language: ["spa", "eng"],
          edition_count: 23,
          editions: { docs: [{ title: "Words of Radiance", language: ["eng"] }] },
        },
      ]
    );
    expect(work.title).toBe("Palabras Radiantes");
    expect(work.titleLang).toBe("es");
  });

  it("marca 'en' cuando solo hay título de edición inglesa", () => {
    const [work] = normalizeAuthorWorks(
      [],
      [
        {
          key: "/works/OL3W",
          title: "Elantris",
          language: ["eng"],
          edition_count: 5,
          editions: { docs: [{ title: "Elantris: Tenth Anniversary", language: ["eng"] }] },
        },
      ]
    );
    expect(work.title).toBe("Elantris: Tenth Anniversary");
    expect(work.titleLang).toBe("en");
  });

  it("marca 'other' cuando cae al título de la obra", () => {
    const [work] = normalizeAuthorWorks(
      [{ key: "/works/OL2W", title: "Elantris", language: ["eng"], edition_count: 5 }],
      []
    );
    expect(work.title).toBe("Elantris");
    expect(work.titleLang).toBe("other");
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
      // No "Hunger Games 5-Book Box Set": ese title nunca lo emite el
      // pipeline (esa obra no tiene `language`, así que la regla 2 ya la
      // descarta). El título REAL que emitiría la obra tetralogía si el
      // filtro de omnibus desapareciese es este, con "4-Book", no "5-Book":
      "Tetralogía Los Juegos Del Hambre / the Hunger Games 4-Book Box Set",
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
    // Las tres, exactas: si una fusión falsa se comiese cualquiera de los
    // tres, este `toEqual` lo detecta. Un `toBeGreaterThanOrEqual(2)` deja
    // pasar justo el caso que este test existe para atrapar.
    const clave = titulos(shusterman).filter((t) => /^Everlost$|^Everwild$|^Everfound$/.test(t));
    expect(clave.sort()).toEqual(["Everfound", "Everlost", "Everwild"]);
  });

  it("cada obra devuelta tiene una workKey con forma de obra y un título no vacío", () => {
    // Que no haya dos `workKey` iguales es una garantía de la estructura de
    // datos (un candidato por entrada de `Map`, indexado por `doc.key`): no
    // puede fallar y no prueba nada. Esto sí puede fallar.
    for (const obra of collins) {
      expect(obra.workKey).toMatch(/^\/works\/OL\d+W$/);
      expect(obra.title.length).toBeGreaterThan(0);
    }
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

  it("respeta el orden de Open Library, no el de ediciones ni el alfabético", () => {
    // "Los juegos del hambre" tiene 142 ediciones, el máximo: es el primero
    // tanto en el orden de Open Library como en el de ediciones, así que por
    // sí solo no distingue una implementación que devolviese el orden de
    // ediciones (el error exacto que avisa la spec) de una correcta. Las dos
    // órdenes divergen en el índice 2: Open Library pone ahí "Balada de
    // pájaros cantores y serpientes" (34 ediciones); por ediciones tocaría
    // "Sinsajo" (98). Fijar hasta el índice 3 es lo que hace discriminante
    // este test.
    expect(collins.slice(0, 4).map((o) => o.title)).toEqual([
      "Los juegos del hambre",
      "En llamas",
      "Balada de pájaros cantores y serpientes",
      "Sinsajo",
    ]);
  });

  it("coverUrl usa el cover_i real de la obra", () => {
    // "The Hunger Games" (OL5735363W) trae cover_i 12646537 en el fixture.
    const obra = collins.find((o) => o.title === "Los juegos del hambre");
    expect(obra?.coverUrl).toBe("https://covers.openlibrary.org/b/id/12646537-M.jpg");
  });

  it("dos títulos que normalizan a cadena vacía no se fusionan entre sí", () => {
    // Antes del arreglo, ambos títulos normalizaban a "" y ese vacío entraba en
    // el conjunto de candidatos, así que casaban entre sí y uno desaparecía. Los
    // fixtures reales no tienen ningún título así, por eso este caso es sintético.
    const obras = normalizeAuthorWorks(
      [
        { key: "/works/OLA1W", title: "!!!", language: ["eng"], edition_count: 5 },
        { key: "/works/OLA2W", title: "???", language: ["eng"], edition_count: 3 },
      ],
      []
    );

    expect(obras).toHaveLength(2);
    expect(obras.map((o) => o.title)).toEqual(["!!!", "???"]);
  });

  it("no fusiona en cadena a través de un título heredado", () => {
    // `Alfa` y `Gamma` no comparten NINGÚN título; solo `Beta` toca a los dos.
    // Con la herencia vieja, `Alfa` absorbía los títulos de `Beta` y luego se
    // comía a `Gamma`. El orden importa: la fusión recorre por número de
    // ediciones descendente, así que el puente va en medio (9 > 8 > 7).
    const obras = normalizeAuthorWorks(
      [
        {
          key: "/works/OLB1W",
          title: "Alfa",
          language: ["spa"],
          edition_count: 9,
          editions: { docs: [{ title: "Beta", language: ["spa"] }] },
        },
        {
          key: "/works/OLB2W",
          title: "Beta",
          language: ["spa"],
          edition_count: 8,
          editions: { docs: [{ title: "Gamma", language: ["spa"] }] },
        },
        { key: "/works/OLB3W", title: "Gamma", language: ["spa"], edition_count: 7 },
      ],
      []
    );

    // `Beta` sí se fusiona con `Alfa` —comparten título directamente— pero
    // `Gamma` sobrevive, que es lo que la herencia se llevaba por delante.
    expect(obras.map((o) => o.workKey)).toEqual(["/works/OLB1W", "/works/OLB3W"]);
  });
});
