import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { findVolumeByIsbn, findBestVolume } from "./client";

beforeEach(() => {
  process.env.GOOGLE_BOOKS_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_BOOKS_API_KEY;
});

const ISBN = "9788410138407";

const volume = {
  id: "vol1",
  volumeInfo: {
    title: "La biblioteca de la medianoche",
    authors: ["Matt Haig"],
    description: "Sinopsis en español.",
    pageCount: 304,
    language: "es",
    industryIdentifiers: [{ type: "ISBN_13", identifier: ISBN }],
    imageLinks: { thumbnail: "http://books.google.com/books/content?id=vol1&zoom=1" },
  },
};

function isbnIds(isbn: string) {
  return [{ type: "ISBN_13", identifier: isbn }];
}

/** Devuelve el spy para poder auditar la petición saliente, no solo la respuesta. */
function mockFetchOnce(body: unknown, init?: ResponseInit) {
  // Una `Response` nueva por llamada: el cuerpo solo se puede leer una vez, y
  // hay casos que hacen dos consultas contra el mismo payload.
  const spy = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function urlOf(spy: ReturnType<typeof vi.fn>): URL {
  return new URL(String(spy.mock.calls[0][0]));
}

describe("petición saliente", () => {
  it("no elige un volumen de Dumas hijo cuando se pidió a Dumas padre", async () => {
    mockFetchOnce({ items: [{ id: "wrong", volumeInfo: { title: "Obra", authors: ["Alexandre Dumas hijo"] } }] });
    expect(await findBestVolume("Obra", "Alexandre Dumas", "es")).toBeNull();
  });
  // Sin estas aserciones, degradar `isbn:X` a búsqueda libre o perder
  // `langRestrict` pasa desapercibido: la forma de `q` es lo que sostiene la
  // regla dura de que solo el ISBN identifica sin ambigüedad.
  it("la búsqueda por ISBN va cualificada con `isbn:` y con key y maxResults", async () => {
    const spy = mockFetchOnce({ items: [volume] });
    await findVolumeByIsbn(ISBN);
    const url = urlOf(spy);
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/books/v1/volumes");
    expect(url.searchParams.get("q")).toBe(`isbn:${ISBN}`);
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("maxResults")).toBe("5");
    // Un fallo de la API externa no puede quedarse colgado bloqueando la ficha.
    expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("la búsqueda por texto va cualificada con intitle:/inauthor: y restringida de idioma", async () => {
    const spy = mockFetchOnce({ items: [volume] });
    await findBestVolume("La biblioteca de la medianoche", "Matt Haig", "es");
    const url = urlOf(spy);
    expect(url.searchParams.get("q")).toBe(
      "intitle:La biblioteca de la medianoche inauthor:Matt Haig"
    );
    expect(url.searchParams.get("langRestrict")).toBe("es");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("maxResults")).toBe("5");
    expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sin autor, la búsqueda por texto lleva intitle: y nada de inauthor:", async () => {
    const spy = mockFetchOnce({ items: [volume] });
    await findBestVolume("La biblioteca de la medianoche", null, "en");
    const url = urlOf(spy);
    expect(url.searchParams.get("q")).toBe("intitle:La biblioteca de la medianoche");
    expect(url.searchParams.get("langRestrict")).toBe("en");
  });
});

describe("findVolumeByIsbn", () => {
  it("null sin API key (dependencia blanda desactivada)", async () => {
    delete process.env.GOOGLE_BOOKS_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await findVolumeByIsbn(ISBN)).toBeNull();
    // Sin key no debe ni intentar la llamada de red.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mapea volumen por ISBN con cover https y zoom=2", async () => {
    mockFetchOnce({ items: [volume] });
    const out = await findVolumeByIsbn(ISBN);
    expect(out?.volumeId).toBe("vol1");
    expect(out?.title).toBe("La biblioteca de la medianoche");
    expect(out?.authors).toEqual(["Matt Haig"]);
    expect(out?.synopsis).toBe("Sinopsis en español.");
    expect(out?.language).toBe("es");
    expect(out?.coverUrl).toMatch(/^https:\/\/books\.google\.com\//);
    expect(out?.coverUrl).toContain("zoom=2");
    expect(out?.pageCount).toBe(304);
  });

  it("null si la respuesta no trae items", async () => {
    mockFetchOnce({});
    expect(await findVolumeByIsbn("0000000000000")).toBeNull();
  });

  it("null si la API responde con error HTTP, aunque el cuerpo traiga items (nunca lanza ni usa una respuesta de error)", async () => {
    // Un 500 real de Google Books no siempre viene vacío de "items"; lo que
    // marca que la respuesta es inválida es el status, no la forma del JSON.
    mockFetchOnce({ items: [volume] }, { status: 500 });
    expect(await findVolumeByIsbn(ISBN)).toBeNull();
  });

  it("null si fetch rechaza (fallo de red, nunca lanza)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect(await findVolumeByIsbn(ISBN)).toBeNull();
  });

  it("descarta pageCount 0 (no es un dato real, es 'desconocido')", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol2",
          volumeInfo: { title: "T", pageCount: 0, industryIdentifiers: isbnIds("9780000000000") },
        },
      ],
    });
    const out = await findVolumeByIsbn("9780000000000");
    expect(out?.pageCount).toBeNull();
  });

  it("descarta un item sin id (no hay volumeId con el que anclar nada)", async () => {
    mockFetchOnce({ items: [{ volumeInfo: { title: "Sin id" } }, volume] });
    const out = await findVolumeByIsbn(ISBN);
    expect(out?.volumeId).toBe("vol1");
  });

  it("cover null si no hay imageLinks", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol3",
          volumeInfo: { title: "Sin portada", industryIdentifiers: isbnIds("9780000000001") },
        },
      ],
    });
    const out = await findVolumeByIsbn("9780000000001");
    expect(out?.coverUrl).toBeNull();
  });

  it("cover null si el host no pasa la allowlist (URL manipulable)", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol4",
          volumeInfo: {
            title: "Portada ajena",
            industryIdentifiers: isbnIds("9780000000002"),
            imageLinks: { thumbnail: "http://evil.example.com/x.jpg" },
          },
        },
      ],
    });
    const out = await findVolumeByIsbn("9780000000002");
    expect(out?.coverUrl).toBeNull();
  });

  it("quita edge=curl de la portada (esquina rizada que desentona con OL/TMDB)", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol5",
          volumeInfo: {
            title: "Escaneado",
            industryIdentifiers: isbnIds("9780000000003"),
            imageLinks: {
              thumbnail: "http://books.google.com/books/content?id=vol5&zoom=1&edge=curl",
            },
          },
        },
      ],
    });
    const out = await findVolumeByIsbn("9780000000003");
    expect(out?.coverUrl).not.toContain("edge");
    expect(out?.coverUrl).toContain("zoom=2");
  });

  // m5: esta es la ÚNICA vía que CREA obra en un catálogo COMPARTIDO, así que
  // se confirma el ISBN contra lo que el volumen declara, no solo contra la
  // forma de la consulta.
  it("null si el volumen declara OTRO ISBN (no se crea obra con el vecino de índice)", async () => {
    mockFetchOnce({
      items: [
        {
          id: "otro",
          volumeInfo: { title: "Otro libro", industryIdentifiers: isbnIds("9780000000009") },
        },
      ],
    });
    expect(await findVolumeByIsbn(ISBN)).toBeNull();
  });

  it("null si el volumen no declara industryIdentifiers (falla cerrado)", async () => {
    mockFetchOnce({ items: [{ id: "sinids", volumeInfo: { title: "Sin identificadores" } }] });
    expect(await findVolumeByIsbn(ISBN)).toBeNull();
  });

  it("acepta el ISBN con guiones: se compara normalizado", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol6",
          volumeInfo: { title: "Con guiones", industryIdentifiers: isbnIds("978-84-101-3840-7") },
        },
      ],
    });
    const out = await findVolumeByIsbn(ISBN);
    expect(out?.volumeId).toBe("vol6");
  });

  it("salta el volumen equivocado y se queda con el que declara el ISBN pedido", async () => {
    mockFetchOnce({
      items: [
        {
          id: "ruido",
          volumeInfo: { title: "Ruido", industryIdentifiers: isbnIds("9780000000009") },
        },
        volume,
      ],
    });
    const out = await findVolumeByIsbn(ISBN);
    expect(out?.volumeId).toBe("vol1");
  });
});

// C2: la API real devuelve campos con el tipo equivocado. Antes esto era un
// TypeError que escapaba del try de queryVolumes (el callback de match corre
// FUERA), rompiendo el contrato "nunca lanza" de la cabecera.
describe("payloads malformados (contrato «nunca lanza»)", () => {
  it("authors como cadena en vez de array: no lanza, queda vacío", async () => {
    mockFetchOnce({
      items: [
        {
          id: "raro1",
          volumeInfo: {
            title: "Un Libro",
            authors: "Matt Haig",
            industryIdentifiers: isbnIds(ISBN),
          },
        },
      ],
    });
    await expect(findBestVolume("Un Libro", "Matt Haig", "es")).resolves.toBeNull();
    const out = await findVolumeByIsbn(ISBN);
    expect(out?.authors).toEqual([]);
  });

  it("title numérico: no lanza, queda null", async () => {
    mockFetchOnce({
      items: [{ id: "raro2", volumeInfo: { title: 1984, industryIdentifiers: isbnIds(ISBN) } }],
    });
    await expect(findBestVolume("1984", null, "es")).resolves.toBeNull();
    const out = await findVolumeByIsbn(ISBN);
    expect(out?.title).toBeNull();
  });

  it("description/language/pageCount con tipos raros no llegan a la base", async () => {
    mockFetchOnce({
      items: [
        {
          id: "raro3",
          volumeInfo: {
            title: "T",
            description: { text: "objeto" },
            language: 42,
            pageCount: "304",
            imageLinks: "no-soy-un-objeto",
            industryIdentifiers: isbnIds(ISBN),
          },
        },
      ],
    });
    const out = await findVolumeByIsbn(ISBN);
    expect(out?.synopsis).toBeNull();
    expect(out?.language).toBeNull();
    expect(out?.pageCount).toBeNull();
    expect(out?.coverUrl).toBeNull();
  });

  it("authors con elementos no-string: se filtran, no rompen la verificación", async () => {
    mockFetchOnce({
      items: [
        {
          id: "raro4",
          volumeInfo: {
            title: "La biblioteca de la medianoche",
            authors: [null, 7, "Matt Haig"],
            industryIdentifiers: isbnIds(ISBN),
          },
        },
      ],
    });
    const out = await findBestVolume("La biblioteca de la medianoche", "Matt Haig", "es");
    expect(out?.volumeId).toBe("raro4");
  });

  it("items que no es un array: no lanza, se ignora", async () => {
    mockFetchOnce({ items: { id: "no-soy-array" } });
    expect(await findVolumeByIsbn(ISBN)).toBeNull();
    mockFetchOnce({ items: [null, "cadena", 3] });
    expect(await findVolumeByIsbn(ISBN)).toBeNull();
  });
});

describe("findBestVolume", () => {
  it("acepta cuando título y autor casan (normalizados)", async () => {
    mockFetchOnce({ items: [volume] });
    const out = await findBestVolume("La Biblioteca De La Medianoche", "Matt Haig", "es");
    expect(out?.volumeId).toBe("vol1");
  });

  it("rechaza si el título no casa (mejor hueco que dato de otra obra)", async () => {
    mockFetchOnce({ items: [volume] });
    expect(await findBestVolume("Otra obra distinta", "Matt Haig", "es")).toBeNull();
  });

  it("rechaza si el título casa pero el autor no (evita falso positivo por homónimo de título)", async () => {
    mockFetchOnce({ items: [volume] });
    expect(await findBestVolume("La biblioteca de la medianoche", "Otro Autor", "es")).toBeNull();
  });

  it("sin autor conocido, acepta solo por título", async () => {
    mockFetchOnce({ items: [volume] });
    const out = await findBestVolume("La biblioteca de la medianoche", null, "es");
    expect(out?.volumeId).toBe("vol1");
  });

  it("tolera el nombre incompleto del mismo autor (contención por encima de la cota)", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol7",
          volumeInfo: { title: "Un Libro", authors: ["J. Matt Haig"] },
        },
      ],
    });
    const out = await findBestVolume("Un Libro", "Matt Haig", "es");
    expect(out?.volumeId).toBe("vol7");
  });

  // C1, defecto 1: la contención sin cota aceptaba "Ana" dentro de
  // "susanafortes" (normalizeTitleForComparison machaca los espacios).
  it("rechaza un autor que solo es SUBSTRING de otro (contención con cota, no a pelo)", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol8",
          volumeInfo: { title: "Un Libro", authors: ["Susana Fortes"] },
        },
      ],
    });
    expect(await findBestVolume("Un Libro", "Ana", "es")).toBeNull();
  });

  // C1, defecto 2: un autor de solo puntuación normalizaba a "" y el
  // `if (!wantAuthor) return true` lo tomaba por "autor desconocido",
  // desactivando la guarda entera.
  it("un autor de solo puntuación NO desactiva la verificación (falla cerrado)", async () => {
    mockFetchOnce({
      items: [
        {
          id: "vol9",
          volumeInfo: { title: "Un Libro", authors: ["Quien Sea"] },
        },
      ],
    });
    expect(await findBestVolume("Un Libro", "—", "es")).toBeNull();
    mockFetchOnce({
      items: [{ id: "vol10", volumeInfo: { title: "Un Libro", authors: ["Quien Sea"] } }],
    });
    expect(await findBestVolume("Un Libro", "...", "es")).toBeNull();
  });

  it("un volumen sin autores no cuela cuando SÍ se conoce el autor", async () => {
    mockFetchOnce({
      items: [{ id: "vol11", volumeInfo: { title: "Un Libro" } }],
    });
    expect(await findBestVolume("Un Libro", "Matt Haig", "es")).toBeNull();
  });

  it("null sin API key", async () => {
    delete process.env.GOOGLE_BOOKS_API_KEY;
    expect(await findBestVolume("Cualquiera", "Cualquiera", "es")).toBeNull();
  });
});
