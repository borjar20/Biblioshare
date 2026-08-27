import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { findVolumeByIsbn, findBestVolume } from "./client";

beforeEach(() => {
  process.env.GOOGLE_BOOKS_API_KEY = "test-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_BOOKS_API_KEY;
});

const volume = {
  id: "vol1",
  volumeInfo: {
    title: "La biblioteca de la medianoche",
    authors: ["Matt Haig"],
    description: "Sinopsis en español.",
    pageCount: 304,
    language: "es",
    imageLinks: { thumbnail: "http://books.google.com/books/content?id=vol1&zoom=1" },
  },
};

function mockFetchOnce(body: unknown, init?: ResponseInit) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init)));
}

describe("findVolumeByIsbn", () => {
  it("null sin API key (dependencia blanda desactivada)", async () => {
    delete process.env.GOOGLE_BOOKS_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await findVolumeByIsbn("9788410138407")).toBeNull();
    // Sin key no debe ni intentar la llamada de red.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mapea volumen por ISBN con cover https y zoom=2", async () => {
    mockFetchOnce({ items: [volume] });
    const out = await findVolumeByIsbn("9788410138407");
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
    expect(await findVolumeByIsbn("9788410138407")).toBeNull();
  });

  it("null si fetch rechaza (fallo de red, nunca lanza)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    expect(await findVolumeByIsbn("9788410138407")).toBeNull();
  });

  it("descarta pageCount 0 (no es un dato real, es 'desconocido')", async () => {
    mockFetchOnce({
      items: [{ id: "vol2", volumeInfo: { title: "T", pageCount: 0 } }],
    });
    const out = await findVolumeByIsbn("9780000000000");
    expect(out?.pageCount).toBeNull();
  });

  it("descarta un item sin id (no hay volumeId con el que anclar nada)", async () => {
    mockFetchOnce({ items: [{ volumeInfo: { title: "Sin id" } }, volume] });
    const out = await findVolumeByIsbn("9788410138407");
    expect(out?.volumeId).toBe("vol1");
  });

  it("cover null si no hay imageLinks", async () => {
    mockFetchOnce({
      items: [{ id: "vol3", volumeInfo: { title: "Sin portada" } }],
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
            imageLinks: { thumbnail: "http://evil.example.com/x.jpg" },
          },
        },
      ],
    });
    const out = await findVolumeByIsbn("9780000000002");
    expect(out?.coverUrl).toBeNull();
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

  it("null sin API key", async () => {
    delete process.env.GOOGLE_BOOKS_API_KEY;
    expect(await findBestVolume("Cualquiera", "Cualquiera", "es")).toBeNull();
  });
});
