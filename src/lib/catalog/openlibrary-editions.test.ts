import { describe, expect, it } from "vitest";
import { pickEditions, type OpenLibraryEditionDoc } from "./openlibrary-editions";

function doc(over: Partial<OpenLibraryEditionDoc> = {}): OpenLibraryEditionDoc {
  return {
    title: "El nombre del viento",
    isbn_13: ["9788401352836"],
    publishers: ["Plaza & Janés"],
    publish_date: "2007",
    number_of_pages: 662,
    languages: [{ key: "/languages/spa" }],
    physical_format: "Hardcover",
    covers: [123],
    ...over,
  };
}

describe("pickEditions", () => {
  it("descarta las ediciones sin ISBN: no se puede identificar lo que no tiene ISBN", () => {
    const sinIsbn = doc({ isbn_13: undefined, isbn_10: undefined });
    expect(pickEditions([sinIsbn])).toEqual([]);
  });

  it("descarta los ISBN con digito de control invalido", () => {
    expect(pickEditions([doc({ isbn_13: ["9788401352837"] })])).toEqual([]);
  });

  it("mapea el formato fisico a una etiqueta legible", () => {
    expect(pickEditions([doc()])[0].label).toBe("Tapa dura");
    expect(pickEditions([doc({ physical_format: "Paperback" })])[0].label).toBe("Bolsillo");
    expect(pickEditions([doc({ physical_format: undefined })])[0].label).toBe("Edición");
  });

  it("saca el idioma de la clave de openlibrary", () => {
    expect(pickEditions([doc()])[0].language).toBe("ES");
    expect(pickEditions([doc({ languages: [{ key: "/languages/eng" }] })])[0].language).toBe("EN");
  });

  it("pone el espanol y el ingles por delante de otros idiomas", () => {
    const fr = doc({ isbn_13: ["9782070413119"], languages: [{ key: "/languages/fre" }] });
    const en = doc({ isbn_13: ["9780756404741"], languages: [{ key: "/languages/eng" }] });
    const orden = pickEditions([fr, en]).map((e) => e.language);
    expect(orden).toEqual(["EN", "FR"]);
  });

  it("corta en el tope, que nadie elige entre trescientas tiradas", () => {
    const muchas = Array.from({ length: 40 }, (_, i) =>
      doc({ isbn_13: [VALID_ISBNS[i % VALID_ISBNS.length]], publish_date: String(1990 + i) })
    );
    expect(pickEditions(muchas, 20).length).toBeLessThanOrEqual(20);
  });

  it("no repite el mismo ISBN dos veces", () => {
    expect(pickEditions([doc(), doc()]).length).toBe(1);
  });

  it("descarta las ediciones de Independently Published: son reimpresiones POD sin curar", () => {
    const pod = doc({ publishers: ["Independently Published"] });
    expect(pickEditions([pod])).toEqual([]);
  });

  it("descarta CreateSpace aunque el nombre completo traiga mas texto (coincide por 'contiene')", () => {
    const pod = doc({ publishers: ["CreateSpace Independent Publishing Platform"] });
    expect(pickEditions([pod])).toEqual([]);
  });

  it("entre dos ediciones por lo demas iguales, la que tiene portada va primero", () => {
    const sinPortada = doc({ isbn_13: [VALID_ISBNS[0]], covers: undefined });
    const conPortada = doc({ isbn_13: [VALID_ISBNS[1]], covers: [456] });
    const orden = pickEditions([sinPortada, conPortada]).map((e) => e.isbn);
    expect(orden).toEqual([VALID_ISBNS[1], VALID_ISBNS[0]]);
  });

  it("no descarta una editorial de verdad solo porque contenga 'press'", () => {
    const cambridge = doc({ publishers: ["Cambridge University Press"] });
    expect(pickEditions([cambridge])).toHaveLength(1);
    expect(pickEditions([cambridge])[0].publisher).toBe("Cambridge University Press");
  });
});

// ISBN-13 reales y validos, para no pelearnos con el digito de control en los tests.
const VALID_ISBNS = [
  "9788401352836",
  "9780756404741",
  "9782070413119",
  "9788499080479",
  "9788401023743",
];
