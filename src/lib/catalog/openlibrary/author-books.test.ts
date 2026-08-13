import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAuthorWorks } from "./author-books";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubTwoPasses(esDocs: unknown[], enDocs: unknown[]) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const docs = url.includes("lang=es") ? esDocs : enDocs;
    return { ok: true, json: async () => ({ docs }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("fetchAuthorWorks", () => {
  it("hace las DOS pasadas de idioma y normaliza el resultado", async () => {
    const { calls } = stubTwoPasses(
      [
        {
          key: "/works/OL1W",
          title: "The Hunger Games",
          language: ["eng", "spa"],
          edition_count: 142,
          first_publish_year: 2008,
          cover_i: 111,
          editions: { docs: [{ title: "Los juegos del hambre", language: ["spa"] }] },
        },
      ],
      [
        {
          key: "/works/OL1W",
          title: "The Hunger Games",
          language: ["eng", "spa"],
          edition_count: 142,
          first_publish_year: 2008,
          cover_i: 111,
          editions: { docs: [{ title: "The Hunger Games", language: ["eng"] }] },
        },
      ]
    );

    const obras = await fetchAuthorWorks("OL1394359A");

    expect(calls).toHaveLength(2);
    expect(calls.some((u) => u.includes("lang=es"))).toBe(true);
    expect(calls.some((u) => u.includes("lang=en"))).toBe(true);
    expect(calls.every((u) => u.includes("author_key=OL1394359A"))).toBe(true);
    expect(calls.every((u) => u.includes("editions.title"))).toBe(true);
    expect(obras).toEqual([
      {
        workKey: "/works/OL1W",
        title: "Los juegos del hambre",
        year: 2008,
        coverUrl: "https://covers.openlibrary.org/b/id/111-M.jpg",
      },
    ]);
  });

  it("acepta la clave larga y la corta", async () => {
    const { calls } = stubTwoPasses([], []);
    await fetchAuthorWorks("/authors/OL234454A");
    expect(calls.every((u) => u.includes("author_key=OL234454A"))).toBe(true);
  });

  it("con clave vacía no toca la red", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAuthorWorks("")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si una de las dos pasadas falla, devuelve lista vacía sin lanzar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        String(input).includes("lang=es")
          ? { ok: true, json: async () => ({ docs: [] }) }
          : { ok: false, json: async () => ({}) }
      )
    );
    await expect(fetchAuthorWorks("OL1A")).resolves.toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(fetchAuthorWorks("OL1A")).resolves.toEqual([]);
  });

  it("si la pasada ES vuelve vacía y la EN no, no escribe nada (respuesta a medias)", async () => {
    stubTwoPasses(
      [],
      [
        {
          key: "/works/OL1W",
          title: "The Hunger Games",
          language: ["eng", "spa"],
          edition_count: 142,
          first_publish_year: 2008,
          cover_i: 111,
          editions: { docs: [{ title: "The Hunger Games", language: ["eng"] }] },
        },
      ]
    );
    await expect(fetchAuthorWorks("OL1394359A")).resolves.toEqual([]);
  });

  it("si la pasada EN vuelve vacía y la ES no, no escribe nada (respuesta a medias)", async () => {
    stubTwoPasses(
      [
        {
          key: "/works/OL1W",
          title: "The Hunger Games",
          language: ["eng", "spa"],
          edition_count: 142,
          first_publish_year: 2008,
          cover_i: 111,
          editions: { docs: [{ title: "Los juegos del hambre", language: ["spa"] }] },
        },
      ],
      []
    );
    await expect(fetchAuthorWorks("OL1394359A")).resolves.toEqual([]);
  });

  it("si las DOS pasadas vuelven vacías, es un autor legítimo sin obras, no un error", async () => {
    stubTwoPasses([], []);
    await expect(fetchAuthorWorks("OL1394359A")).resolves.toEqual([]);
  });

  it(
    "lanza las dos pasadas a la vez, no una detrás de otra",
    { timeout: 2000 },
    async () => {
      // Si alguien cambia el Promise.all por dos await seguidos, la primera
      // llamada se queda esperando un desbloqueo que solo produce la segunda, y
      // este test expira en vez de pasar. Es la única forma de distinguir
      // «dos llamadas» de «dos llamadas en paralelo».
      let desbloquear: (() => void) | undefined;
      const primeraEnVuelo = new Promise<void>((resolve) => {
        desbloquear = resolve;
      });
      let llamadas = 0;

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          llamadas += 1;
          if (llamadas === 1) await primeraEnVuelo;
          else desbloquear?.();
          return { ok: true, json: async () => ({ docs: [] }) };
        })
      );

      await expect(fetchAuthorWorks("OL1394359A")).resolves.toEqual([]);
      expect(llamadas).toBe(2);
    }
  );
});
