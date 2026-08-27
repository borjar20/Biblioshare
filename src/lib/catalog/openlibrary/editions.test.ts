import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRepresentationCandidates, pickEditions, type OpenLibraryEditionDoc } from "./editions";

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

// Stub de fetch para el endpoint editions.json: `entriesByOffset` simula lo
// que devolvería cada página (offset -> entries), y `size` es el total
// declarado por OpenLibrary que decide cuántas páginas más se piden.
function stubEditionsPages(entriesByOffset: Record<number, OpenLibraryEditionDoc[]>, size: number) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const match = url.match(/offset=(\d+)/);
    const offset = match ? Number(match[1]) : 0;
    const entries = entriesByOffset[offset] ?? [];
    return { ok: true, json: async () => ({ entries, size }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("fetchRepresentationCandidates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("elige la mejor candidata ES y EN (idioma, luego portada) y la mediana de paginas", async () => {
    const esConPortada = doc({
      isbn_13: [VALID_ISBNS[0]],
      title: "El nombre del viento",
      number_of_pages: 662,
      covers: [1],
      languages: [{ key: "/languages/spa" }],
    });
    // Misma obra, otra edicion espanola sin portada: pickEditions ya la deja
    // detras de la que si tiene, asi que la candidata ES debe salir de la
    // primera, no de esta.
    const esSinPortada = doc({
      isbn_13: [VALID_ISBNS[1]],
      title: "El nombre del viento (bolsillo)",
      number_of_pages: 700,
      covers: undefined,
      languages: [{ key: "/languages/spa" }],
    });
    const en = doc({
      isbn_13: [VALID_ISBNS[2]],
      title: "The Name of the Wind",
      number_of_pages: 662,
      covers: [2],
      languages: [{ key: "/languages/eng" }],
    });
    const otroIdioma = doc({
      isbn_13: [VALID_ISBNS[3]],
      title: "Le Nom du vent",
      number_of_pages: 500,
      covers: [3],
      languages: [{ key: "/languages/fre" }],
    });

    stubEditionsPages({ 0: [esConPortada, esSinPortada, en, otroIdioma] }, 4);

    const result = await fetchRepresentationCandidates("OL12345W");

    expect(result.es).toEqual({
      title: "El nombre del viento",
      coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
      pages: 662,
    });
    expect(result.en).toEqual({
      title: "The Name of the Wind",
      coverUrl: "https://covers.openlibrary.org/b/id/2-L.jpg",
      pages: 662,
    });
    // Paginas filtradas: [662, 700, 662, 500] -> ordenadas [500, 662, 662, 700]
    // -> mediana = (662 + 662) / 2 = 662.
    expect(result.pagesMedian).toBe(662);
  });

  it("una obra sin ediciones no tiene candidatas ni mediana", async () => {
    stubEditionsPages({ 0: [] }, 0);

    const result = await fetchRepresentationCandidates("OL99999W");

    expect(result).toEqual({ es: null, en: null, pagesMedian: null });
  });

  it("un fallo de red nunca lanza: degrada a los tres campos null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const result = await fetchRepresentationCandidates("OL1W");

    expect(result).toEqual({ es: null, en: null, pagesMedian: null });
  });

  it("acota el escaneo a 2 paginas (200 ediciones) aunque la obra tenga muchas mas", async () => {
    // Con `size` grande el codigo pediria hasta MAX_EDITIONS_PAGES (5) si
    // reutilizase ese tope; aqui debe frenar en 2 paginas (offset 0 y 100) y
    // no llegar nunca al offset 200.
    const { calls } = stubEditionsPages(
      {
        0: [doc({ isbn_13: [VALID_ISBNS[0]] })],
        100: [doc({ isbn_13: [VALID_ISBNS[1]] })],
        200: [doc({ isbn_13: [VALID_ISBNS[2]] })],
      },
      1000
    );

    await fetchRepresentationCandidates("OL1W");

    expect(calls.some((u) => u.includes("offset=0"))).toBe(true);
    expect(calls.some((u) => u.includes("offset=100"))).toBe(true);
    expect(calls.some((u) => u.includes("offset=200"))).toBe(false);
  });
});
