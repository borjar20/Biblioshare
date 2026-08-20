import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWork, parseFirstPublishYear } from "./work-detail";

function mockJson(payload: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => payload });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Lo que se prueba aquí es lo que #730 destapó: desde #674 la fila de catálogo
// nace vacía y el título del libro solo puede salir de este parser. Antes ni se
// leía del JSON — el campo estaba, pero nadie lo miraba, y la ficha se quedaba
// en «Sin título» con `hydrated_at` ya puesto (o sea, sin reintento).
describe("fetchWork", () => {
  it("saca título, claves de autor y año de primera publicación del mismo JSON", async () => {
    vi.stubGlobal(
      "fetch",
      mockJson({
        title: "  Brave New World  ",
        description: { value: "Una distopía." },
        subjects: ["Fiction", "Dystopias"],
        covers: [8775116],
        authors: [{ author: { key: "/authors/OL19981A" } }],
        first_publish_date: "1932",
      })
    );

    const work = await fetchWork("/works/OL64448W");

    expect(work?.title).toBe("Brave New World");
    expect(work?.authorKeys).toEqual(["OL19981A"]);
    expect(work?.firstPublishYear).toBe(1932);
    expect(work?.description).toBe("Una distopía.");
  });

  it("no inventa nada cuando el work no trae título ni autores", async () => {
    vi.stubGlobal("fetch", mockJson({ subjects: [] }));

    const work = await fetchWork("/works/OL1W");

    // null, no "" — la RPC hydrate_book distingue «no hay dato» de «cadena
    // vacía», y un título vacío se colaría como si fuera bueno.
    expect(work?.title).toBeNull();
    expect(work?.authorKeys).toEqual([]);
    expect(work?.firstPublishYear).toBeNull();
  });

  it("no repite una misma clave de autor listada dos veces", async () => {
    vi.stubGlobal(
      "fetch",
      mockJson({
        title: "Obra",
        authors: [
          { author: { key: "/authors/OL19981A" } },
          { author: { key: "OL19981A" } },
          { author: {} },
          {},
        ],
      })
    );

    expect((await fetchWork("/works/OL1W"))?.authorKeys).toEqual(["OL19981A"]);
  });
});

describe("parseFirstPublishYear", () => {
  it("saca el año de las formas que devuelve OpenLibrary", () => {
    // El campo es texto libre: estas tres formas conviven en el catálogo real.
    expect(parseFirstPublishYear("1932")).toBe(1932);
    expect(parseFirstPublishYear("November 1932")).toBe(1932);
    expect(parseFirstPublishYear("1932-11-01")).toBe(1932);
  });

  it("descarta lo que no es un año plausible", () => {
    expect(parseFirstPublishYear("sin fecha")).toBeNull();
    expect(parseFirstPublishYear("")).toBeNull();
    expect(parseFirstPublishYear(undefined)).toBeNull();
    expect(parseFirstPublishYear(1932)).toBeNull();
    // Fuera del rango que acepta el esquema (1400-2200).
    expect(parseFirstPublishYear("0800")).toBeNull();
    expect(parseFirstPublishYear("2999")).toBeNull();
  });
});
