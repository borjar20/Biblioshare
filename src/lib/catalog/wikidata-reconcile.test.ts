import { describe, expect, it } from "vitest";
import {
  authorMatches,
  chooseWinner,
  planReconciliation,
  resolveQid,
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

  it("el subtítulo de una edición partida no rompe el match", () => {
    // `isSameTitle` acepta contención cuando el más corto es ≥65% del más largo:
    // «Words of Radiance, Part Two» sigue casando con «Words of Radiance».
    expect(resolveQid({ title: "Words of Radiance, Part Two", author: "Brandon Sanderson" }, [wor])).toBe(
      "Q8034469"
    );
  });

  it("dos entidades distintas del mismo autor y mismo título tampoco se eligen", () => {
    const a = entity("wd:Q1", { es: "Dune" }, ["Frank Herbert"]);
    const b = entity("wd:Q2", { es: "Dune" }, ["Frank Herbert"]);
    expect(resolveQid({ title: "Dune", author: "Frank Herbert" }, [a, b])).toBeNull();
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
