import { describe, expect, it } from "vitest";
import { NOTES_PAGE_SIZE, defaultNotesQuery, notesHref, parseNotesQuery } from "./query";

describe("parseNotesQuery", () => {
  it("sin parámetros devuelve el estado por defecto", () => {
    expect(parseNotesQuery({})).toEqual(defaultNotesQuery());
  });

  it("lee búsqueda, tipo, favoritas y página", () => {
    const q = parseNotesQuery({
      q: "  hormiga ",
      tipo: "cita",
      favoritas: "1",
      pagina: "3",
    });
    expect(q.q).toBe("hormiga");
    expect(q.kind).toBe("quote");
    expect(q.favorites).toBe(true);
    expect(q.page).toBe(3);
  });

  it("un valor desconocido cae al defecto en vez de romper", () => {
    const q = parseNotesQuery({ tipo: "poema", orden: "aleatorio", pagina: "-4" });
    expect(q.kind).toBe("all");
    expect(q.sort).toBe("recientes");
    expect(q.page).toBe(1);
  });

  it("`pagina` no numérica es la página 1", () => {
    expect(parseNotesQuery({ pagina: "última" }).page).toBe(1);
  });

  it("normaliza la etiqueta con la misma regla que la escritura", () => {
    expect(parseNotesQuery({ etiqueta: "#Final Feliz" }).tag).toBe("final-feliz");
  });

  it("una etiqueta que se queda en nada es ninguna etiqueta", () => {
    expect(parseNotesQuery({ etiqueta: "  #  " }).tag).toBeNull();
  });

  it("lee `obra` como tipo:id", () => {
    expect(parseNotesQuery({ obra: "series:abc-123" }).item).toEqual({
      itemType: "series",
      itemId: "abc-123",
    });
  });

  it("descarta `obra` entera si el tipo no es uno de los tres", () => {
    expect(parseNotesQuery({ obra: "comic:abc-123" }).item).toBeNull();
    expect(parseNotesQuery({ obra: "book:" }).item).toBeNull();
    expect(parseNotesQuery({ obra: "book" }).item).toBeNull();
  });

  it("un parámetro repetido se queda con el primero, no con el array", () => {
    expect(parseNotesQuery({ tipo: ["cita", "nota"] }).kind).toBe("quote");
  });
});

describe("notesHref", () => {
  it("el estado por defecto es la ruta desnuda: nada de ?orden=recientes&pagina=1", () => {
    expect(notesHref(defaultNotesQuery())).toBe("/notas");
  });

  it("escribe solo lo que no es el defecto", () => {
    const q = { ...defaultNotesQuery(), kind: "quote" as const, page: 2 };
    expect(notesHref(q)).toBe("/notas?tipo=cita&pagina=2");
  });

  it("sin overrides serializa el estado tal cual, página incluida", () => {
    const q = { ...defaultNotesQuery(), page: 7 };
    expect(notesHref(q)).toBe("/notas?pagina=7");
  });

  it("cambiar un filtro devuelve a la página 1", () => {
    const q = { ...defaultNotesQuery(), page: 7 };
    expect(notesHref(q, { kind: "note" })).toBe("/notas?tipo=nota");
  });

  it("pero pasar `page` explícita sí manda: es lo que usa el paginador", () => {
    const q = { ...defaultNotesQuery(), page: 7 };
    expect(notesHref(q, { page: 8 })).toBe("/notas?pagina=8");
  });

  it("escapa el texto de búsqueda y la etiqueta", () => {
    const q = { ...defaultNotesQuery(), q: "sin & con", tag: "año-nuevo" };
    expect(notesHref(q)).toBe("/notas?q=sin+%26+con&etiqueta=a%C3%B1o-nuevo");
  });

  it("serializa la obra como tipo:id", () => {
    const q = defaultNotesQuery();
    expect(notesHref(q, { item: { itemType: "book", itemId: "u1" } })).toBe(
      "/notas?obra=book%3Au1",
    );
  });

  it("un override a null quita el filtro", () => {
    const q = { ...defaultNotesQuery(), tag: "final" };
    expect(notesHref(q, { tag: null })).toBe("/notas");
  });

  it("ida y vuelta: lo que escribe notesHref lo vuelve a leer parseNotesQuery", () => {
    const q = {
      q: "hormiga",
      kind: "note" as const,
      tag: "final",
      item: { itemType: "movie" as const, itemId: "m1" },
      favorites: true,
      sort: "obra" as const,
      page: 4,
    };
    const params = Object.fromEntries(
      new URLSearchParams(notesHref(q).split("?")[1]).entries(),
    );
    expect(parseNotesQuery(params)).toEqual(q);
  });
});

describe("NOTES_PAGE_SIZE", () => {
  it("es un tamaño de página razonable y positivo", () => {
    expect(NOTES_PAGE_SIZE).toBeGreaterThan(0);
  });
});
