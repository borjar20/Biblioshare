import { describe, expect, it } from "vitest";
import {
  authorMatches,
  chooseWinner,
  planReconciliation,
  resolveQid,
  titleMatchesLabel,
  type BookRow,
} from "./wikidata-reconcile";
import type { InventaireEntity } from "./inventaire/client";

function entity(
  uri: string,
  labels: Record<string, string>,
  authorNames: string[] = []
): InventaireEntity {
  return { uri, labels, authorNames };
}

function book(over: Partial<BookRow> = {}): BookRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Elantris",
    author: "Brandon Sanderson",
    created_at: "2026-01-01T00:00:00Z",
    wikidata_id: null,
    passCount: 0,
    otherTraceCount: 0,
    ...over,
  };
}

describe("authorMatches", () => {
  it("casa el autor real cuando OpenLibrary añade al traductor", () => {
    expect(
      authorMatches("Brandon Sanderson, Rafael Marín", entity("wd:Q1", {}, ["Brandon Sanderson"]))
    ).toBe(true);
  });

  it("no casa un libro sin autor", () => {
    expect(authorMatches(null, entity("wd:Q1", {}, ["Frank Herbert"]))).toBe(false);
    expect(authorMatches("", entity("wd:Q1", {}, ["Frank Herbert"]))).toBe(false);
  });

  it("no casa una entidad sin autores", () => {
    expect(authorMatches("Frank Herbert", entity("wd:Q1", {}, []))).toBe(false);
  });

  it("no casa un autor que normaliza a vacío", () => {
    // La trampa del helper prohibido: con contención sin cota, «—» casaba con
    // cualquiera. `isSameTitle` lo corta.
    expect(authorMatches("—", entity("wd:Q1", {}, ["Frank Herbert"]))).toBe(false);
  });

  it("no casa un nombre corto contenido en otro más largo", () => {
    // La otra trampa: «Ana» dentro de «Susana Fortes».
    expect(authorMatches("Ana", entity("wd:Q1", {}, ["Susana Fortes"]))).toBe(false);
  });
});

describe("titleMatchesLabel", () => {
  it("iguala mayúsculas, acentos y puntuación", () => {
    expect(titleMatchesLabel("Sombras de Identidad", "Sombras de identidad")).toBe(true);
    expect(titleMatchesLabel("Words of Radiance", "Words  of, Radiance")).toBe(true);
  });

  it("una palabra de más NO casa, esté donde esté", () => {
    // Es la diferencia con `isSameTitle` y la razón de ser de esta función:
    // la contención aceptaba el sufijo y BORRABA la fila de la obra completa.
    expect(titleMatchesLabel("Words of Radiance, Part 2", "Words of Radiance")).toBe(false);
    expect(titleMatchesLabel("The Stormlight Archive 1", "The Stormlight Archive")).toBe(false);
    expect(titleMatchesLabel("Elantris: edición aniversario", "Elantris")).toBe(false);
  });

  it("una palabra de MENOS tampoco casa, que es la dirección habitual", () => {
    // El label de Inventaire suele ser el canónico LARGO y el título del
    // catálogo el corto, así que ésta es la dirección que más se da. Sin la
    // comprobación de tamaño, `{tress}` estaría contenido en `{tress, of, the,
    // emerald, sea}` y casaría: «Tress» se fundiría con «Tress of the Emerald
    // Sea», que son la misma obra… pero por la misma puerta se colaría
    // cualquier título de una palabra dentro de cualquier saga que la contenga.
    expect(titleMatchesLabel("Tress", "Tress of the Emerald Sea")).toBe(false);
    expect(titleMatchesLabel("Words of Radiance", "Words of Radiance, Part 2")).toBe(false);
  });

  it("una palabra repetida en medio SÍ casa: es un conjunto, no una secuencia", () => {
    expect(titleMatchesLabel("La Biblioteca de Medianoche", "La biblioteca de la medianoche")).toBe(true);
  });

  it("un título que normaliza a vacío no casa con nada, ni consigo mismo", () => {
    // Sin esta guarda, dos obras en un alfabeto que `normalizeTitle` no conserva
    // producirían el conjunto vacío las dos y se fundirían entre sí. Dev tiene
    // cuatro títulos así (§8 del informe de Task 15).
    expect(titleMatchesLabel("חוק ומסג", "מסע אחר")).toBe(false);
    expect(titleMatchesLabel("—", "…")).toBe(false);
    expect(titleMatchesLabel("Elantris", "—")).toBe(false);
  });
});

describe("resolveQid", () => {
  const wor = entity("wd:Q8034469", { en: "Words of Radiance", es: "Palabras Radiantes" }, [
    "Brandon Sanderson",
  ]);

  it("casa un título en español contra el label inglés de la entidad", () => {
    expect(resolveQid({ title: "Palabras Radiantes", author: "Brandon Sanderson" }, [wor])).toBe(
      "Q8034469"
    );
  });

  it("no casa sin verificación de autor: es la regla de seguridad", () => {
    expect(resolveQid({ title: "Palabras Radiantes", author: null }, [wor])).toBeNull();
    expect(
      resolveQid({ title: "Palabras Radiantes", author: "Patrick Rothfuss" }, [wor])
    ).toBeNull();
  });

  it("ignora las entidades propias de Inventaire (inv:), que no anclan identidad", () => {
    const inv = entity("inv:abc", { es: "Palabras Radiantes" }, ["Brandon Sanderson"]);
    expect(resolveQid({ title: "Palabras Radiantes", author: "Brandon Sanderson" }, [inv])).toBeNull();
  });

  it("una entidad inv: al lado de la buena no estropea el match", () => {
    // Las `inv:` se descartan ANTES de contar QIDs distintos. Si se colaran, la
    // entidad de Inventaire sin equivalente en Wikidata aportaría un `null` al
    // conjunto, saldrían dos valores distintos y el match bueno se perdería por
    // «ambigüedad» — un `sin-match` silencioso y difícil de explicar.
    const inv = entity("inv:abc", { es: "Palabras Radiantes" }, ["Brandon Sanderson"]);
    expect(resolveQid({ title: "Palabras Radiantes", author: "Brandon Sanderson" }, [inv, wor])).toBe(
      "Q8034469"
    );
  });

  it("no elige entre varias obras del mismo autor sin corroboración de título", () => {
    // El defecto del pseudocódigo del plan: `.find(autor casa)` habría devuelto
    // Q1 —«El camino de los reyes»— para un libro titulado «Juramentada».
    const otra = entity("wd:Q1", { es: "El camino de los reyes" }, ["Brandon Sanderson"]);
    const otraMas = entity("wd:Q2", { es: "Elantris" }, ["Brandon Sanderson"]);
    expect(resolveQid({ title: "Juramentada", author: "Brandon Sanderson" }, [otra, otraMas])).toBeNull();
  });

  it("el título elige entre varias obras del mismo autor", () => {
    const otra = entity("wd:Q1", { es: "El camino de los reyes" }, ["Brandon Sanderson"]);
    expect(resolveQid({ title: "Palabras Radiantes", author: "Brandon Sanderson" }, [otra, wor])).toBe(
      "Q8034469"
    );
  });

  it("una sola obra del autor NO basta: el título también tiene que casar", () => {
    // Los dos falsos positivos medidos contra dev el 2026-08-27, que es por lo
    // que el título dejó de ser opcional. Ver la cabecera de `resolveQid`.
    const shadowsOfSelf = entity("wd:Q16387049", { en: "Shadows of Self", es: "Sombras de identidad" }, [
      "Brandon Sanderson",
    ]);
    expect(resolveQid({ title: "Shadows Beneath", author: "Brandon Sanderson" }, [shadowsOfSelf])).toBeNull();
    expect(
      resolveQid({ title: "Das Rad der Zeit 34. Der Traum des Wolfs", author: "Brandon Sanderson" }, [wor])
    ).toBeNull();
    // …y la otra cara: el título que SÍ casa sigue resolviendo.
    expect(resolveQid({ title: "Sombras de Identidad", author: "Brandon Sanderson" }, [shadowsOfSelf])).toBe(
      "Q16387049"
    );
  });

  // LOS CUATRO PARES CONGELADOS. Con la regla vieja (`isSameTitle`, contención
  // con cota del 65%) estos títulos resolvían el QID de la obra COMPLETA, y
  // `planReconciliation` proponía `merge_book_into`: la fila del trozo y la de
  // la obra entera se fundían y una de las dos se BORRABA. Medido contra las
  // filas reales de dev, donde las seis `Words of Radiance%` producían cinco
  // fusiones y sobrevivía «Part Two». No es un caso hipotético.
  it.each([
    ["Words of Radiance (1 of 5)"],
    ["Words of Radiance Part One"],
    ["Words of Radiance, Part 1"],
    ["Words of Radiance, Part 2"],
    ["Words of Radiance, Part Two"],
  ])("un trozo o volumen NO casa con la obra completa: %s", (title) => {
    expect(resolveQid({ title, author: "Brandon Sanderson" }, [wor])).toBeNull();
  });

  it("un número de volumen pegado al título de la saga NO casa (ratio 0.92)", () => {
    // El más traicionero de todos: por contención da 0.92, muy por encima del
    // 65%, así que la regla vieja lo fusionaba sin dudar.
    const saga = entity("wd:Q3253490", { en: "The Stormlight Archive" }, ["Brandon Sanderson"]);
    expect(resolveQid({ title: "The Stormlight Archive 1", author: "Brandon Sanderson" }, [saga])).toBeNull();
    expect(resolveQid({ title: "The Stormlight Archive", author: "Brandon Sanderson" }, [saga])).toBe(
      "Q3253490"
    );
  });

  it("un ordinal romano de volumen NO casa con la obra base", () => {
    const lotr = entity("wd:Q15228", { es: "El Señor de los Anillos" }, ["J. R. R. Tolkien"]);
    expect(resolveQid({ title: "El Señor de los Anillos I", author: "J. R. R. Tolkien" }, [lotr])).toBeNull();
  });

  it("recupera el falso negativo que motivaba dejar el título suelto", () => {
    // «La Biblioteca de Medianoche» (alta manual, sin la segunda «la») contra el
    // label «La biblioteca de la medianoche». `isSameTitle` fallaba porque el
    // «la» extra va EN MEDIO: la contención no se cumple y el umbral del 65% ni
    // se llega a consultar (el ratio, 0.90, es irrelevante). Por conjunto de
    // palabras es el mismo título. Ver la cabecera de `resolveQid`.
    const medianoche = entity("wd:Q100152091", { es: "La biblioteca de la medianoche" }, ["Matt Haig"]);
    expect(resolveQid({ title: "La Biblioteca de Medianoche", author: "Matt Haig" }, [medianoche])).toBe(
      "Q100152091"
    );
  });

  it("el precio asumido: un subtítulo legítimo deja de casar, y falla del lado seguro", () => {
    // Documentado a propósito. «Elantris: edición aniversario» sale como
    // `sin-match`: no escribe nada y no borra nada — el duplicado sobrevive y
    // sigue siendo recuperable. Al revés (fusionar de más) no lo es.
    const elantris = entity("wd:Q1328405", { es: "Elantris" }, ["Brandon Sanderson"]);
    expect(
      resolveQid({ title: "Elantris: edición aniversario", author: "Brandon Sanderson" }, [elantris])
    ).toBeNull();
  });

  it("dos entidades distintas del mismo autor y mismo título tampoco se eligen", () => {
    const a = entity("wd:Q1", { es: "Dune" }, ["Frank Herbert"]);
    const b = entity("wd:Q2", { es: "Dune" }, ["Frank Herbert"]);
    expect(resolveQid({ title: "Dune", author: "Frank Herbert" }, [a, b])).toBeNull();
  });

  it("dos títulos en alfabeto no latino no se funden por el conjunto vacío", () => {
    const otra = entity("wd:Q1", { he: "מסע אחר" }, ["Frank Herbert"]);
    expect(resolveQid({ title: "חוק ומסג", author: "Frank Herbert" }, [otra])).toBeNull();
  });

  it("un libro sin título no casa", () => {
    expect(resolveQid({ title: null, author: "Brandon Sanderson" }, [wor])).toBeNull();
  });

  it("sin entidades no casa", () => {
    expect(resolveQid({ title: "Elantris", author: "Brandon Sanderson" }, [])).toBeNull();
  });
});

describe("chooseWinner", () => {
  it("gana la fila con más pases aunque sea la más nueva", () => {
    const vieja = book({ id: "a", created_at: "2020-01-01T00:00:00Z", passCount: 0 });
    const nueva = book({ id: "b", created_at: "2026-01-01T00:00:00Z", passCount: 3 });
    expect(chooseWinner([vieja, nueva]).id).toBe("b");
  });

  it("a igualdad de pases gana el resto del rastro de usuario", () => {
    const sinRastro = book({ id: "a", created_at: "2020-01-01T00:00:00Z", otherTraceCount: 0 });
    const conResena = book({ id: "b", created_at: "2026-01-01T00:00:00Z", otherTraceCount: 2 });
    expect(chooseWinner([sinRastro, conResena]).id).toBe("b");
  });

  it("sin ningún rastro por ninguna parte, gana la más antigua", () => {
    const vieja = book({ id: "b", created_at: "2020-01-01T00:00:00Z" });
    const nueva = book({ id: "a", created_at: "2026-01-01T00:00:00Z" });
    expect(chooseWinner([nueva, vieja]).id).toBe("b");
  });

  it("es determinista con fechas idénticas: manda el id menor", () => {
    const uno = book({ id: "a", created_at: "2020-01-01T00:00:00Z" });
    const dos = book({ id: "b", created_at: "2020-01-01T00:00:00Z" });
    expect(chooseWinner([dos, uno]).id).toBe("a");
    expect(chooseWinner([uno, dos]).id).toBe("a");
  });

  it("los pases mandan sobre el resto del rastro", () => {
    const conPase = book({ id: "a", passCount: 1, otherTraceCount: 0 });
    const conMuchoRuido = book({ id: "b", passCount: 0, otherTraceCount: 50 });
    expect(chooseWinner([conPase, conMuchoRuido]).id).toBe("a");
  });
});

describe("planReconciliation", () => {
  it("un QID sin disputa se asigna", () => {
    const plan = planReconciliation([{ book: book({ id: "a" }), qid: "Q1" }]);
    expect(plan).toEqual([
      expect.objectContaining({ qid: "Q1", action: { kind: "set-qid" } }),
    ]);
  });

  it("un libro que ya tiene su QID y nadie se lo disputa no genera acción", () => {
    const plan = planReconciliation([
      { book: book({ id: "a", wikidata_id: "Q1" }), qid: "Q1" },
    ]);
    expect(plan).toEqual([]);
  });

  it("dos libros con el mismo QID: uno conserva y el otro se fusiona en él", () => {
    const ganador = book({ id: "a", passCount: 5 });
    const perdedor = book({ id: "b", passCount: 0 });
    const plan = planReconciliation([
      { book: perdedor, qid: "Q1" },
      { book: ganador, qid: "Q1" },
    ]);
    expect(plan).toContainEqual(
      expect.objectContaining({
        book: ganador,
        action: { kind: "conserva", loserIds: ["b"] },
      })
    );
    expect(plan).toContainEqual(
      expect.objectContaining({ book: perdedor, action: { kind: "merge-into", winnerId: "a" } })
    );
  });

  it("el ganador NO es el que llega primero, sino el de más rastro", () => {
    // El pseudocódigo del plan asignaba el QID al primero que lo reclamaba y
    // fusionaba el resto contra él: el orden de escaneo decidía qué pases
    // había que repuntar.
    const primero = book({ id: "a", passCount: 0 });
    const segundo = book({ id: "b", passCount: 9 });
    const plan = planReconciliation([
      { book: primero, qid: "Q1" },
      { book: segundo, qid: "Q1" },
    ]);
    const conserva = plan.find((p) => p.action.kind === "conserva");
    expect(conserva?.book.id).toBe("b");
  });

  it("el dueño preexistente del QID puede perder contra una fila con más rastro", () => {
    const dueno = book({ id: "a", wikidata_id: "Q1", passCount: 0 });
    const nueva = book({ id: "b", passCount: 4 });
    const plan = planReconciliation([
      { book: dueno, qid: "Q1" },
      { book: nueva, qid: "Q1" },
    ]);
    expect(plan.find((p) => p.action.kind === "conserva")?.book.id).toBe("b");
    expect(plan.find((p) => p.action.kind === "merge-into")?.book.id).toBe("a");
  });

  it("tres filas del mismo QID dejan un ganador y dos fusiones", () => {
    const plan = planReconciliation([
      { book: book({ id: "a", passCount: 1 }), qid: "Q1" },
      { book: book({ id: "b", passCount: 7 }), qid: "Q1" },
      { book: book({ id: "c", passCount: 0 }), qid: "Q1" },
    ]);
    const conserva = plan.filter((p) => p.action.kind === "conserva");
    const merges = plan.filter((p) => p.action.kind === "merge-into");
    expect(conserva).toHaveLength(1);
    expect(conserva[0].book.id).toBe("b");
    expect(merges.map((m) => m.book.id).sort()).toEqual(["a", "c"]);
    expect(merges.every((m) => m.action.kind === "merge-into" && m.action.winnerId === "b")).toBe(true);
  });

  it("los sin-match no se agrupan entre sí aunque compartan título", () => {
    const plan = planReconciliation([
      { book: book({ id: "a", title: "Dune" }), qid: null },
      { book: book({ id: "b", title: "Dune" }), qid: null },
    ]);
    expect(plan).toHaveLength(2);
    expect(plan.every((p) => p.action.kind === "sin-match")).toBe(true);
  });

  it("QIDs distintos no se tocan entre sí", () => {
    const plan = planReconciliation([
      { book: book({ id: "a" }), qid: "Q1" },
      { book: book({ id: "b" }), qid: "Q2" },
    ]);
    expect(plan.every((p) => p.action.kind === "set-qid")).toBe(true);
  });
});
