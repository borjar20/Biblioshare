import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { cacheLife } from "next/cache";
import { after } from "next/server";
import { getWorkHue, resolveWorkHue, smallCoverUrl } from "./work-hue";
import { hashTitleHue } from "./work-hue-core";

const png = (r: number, g: number, b: number) =>
  sharp({ create: { width: 40, height: 60, channels: 3, background: { r, g, b } } }).png().toBuffer();
const ok = (buf: Buffer) => new Response(new Uint8Array(buf), { status: 200 });
const TMDB = "https://image.tmdb.org/t/p/w342/a.jpg";

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(cacheLife).mockClear();
  vi.mocked(after).mockClear();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorLog.mockRestore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("smallCoverUrl", () => {
  it("pide la variante pequeña", () => {
    expect(smallCoverUrl(TMDB)).toBe("https://image.tmdb.org/t/p/w92/a.jpg");
    expect(smallCoverUrl("https://covers.openlibrary.org/b/id/1-L.jpg"))
      .toBe("https://covers.openlibrary.org/b/id/1-S.jpg");
  });
  it("deja igual los demás orígenes", () => {
    const g = "https://books.google.com/books/content?id=x";
    expect(smallCoverUrl(g)).toBe(g);
  });
});

describe("getWorkHue", () => {
  it("extrae el tono de una portada con color y lo cachea a largo plazo", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(190, 30, 30)));
    const hue = await getWorkHue(TMDB);
    expect(hue).toBeGreaterThanOrEqual(15);
    expect(hue).toBeLessThanOrEqual(40);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://image.tmdb.org/t/p/w92/a.jpg");
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith("max");
  });
  it("devuelve null con una portada sin color y también lo cachea a largo plazo", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(128, 128, 128)));
    await expect(getWorkHue(TMDB)).resolves.toBeNull();
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith("max");
  });
  it.each([
    "https://evil.example/a.jpg",
    "http://image.tmdb.org/t/p/w342/a.jpg",
    "https://abc.supabase.co/rest/v1/secret",
    "https://archive.org/a.jpg",
    "no es una url",
  ])("no descarga de un origen no permitido: %s", async (url) => {
    await expect(getWorkHue(url)).resolves.toBe("failed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("admite portadas de Storage", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(190, 30, 30)));
    await expect(getWorkHue("https://abc.supabase.co/storage/v1/object/public/c/1.png")).resolves.not.toBeNull();
  });
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  const OL = "https://covers.openlibrary.org/b/id/1-L.jpg";
  it("sigue la redirección de OpenLibrary a archive.org", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(redirect("https://archive.org/download/x/1-S.jpg"))
      .mockResolvedValueOnce(redirect("https://ia903209.us.archive.org/view_archive.php?file=1-S.jpg"))
      .mockResolvedValueOnce(ok(await png(190, 30, 30)));
    await expect(getWorkHue(OL)).resolves.not.toBeNull();
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual([
      "https://covers.openlibrary.org/b/id/1-S.jpg",
      "https://archive.org/download/x/1-S.jpg",
      "https://ia903209.us.archive.org/view_archive.php?file=1-S.jpg",
    ]);
  });
  it("cancela el cuerpo de cada redirección", async () => {
    const hop = new Response("redirigiendo", { status: 302, headers: { location: "https://archive.org/x.jpg" } });
    const cancel = vi.spyOn(hop.body!, "cancel");
    vi.mocked(fetch)
      .mockResolvedValueOnce(hop)
      .mockResolvedValueOnce(ok(await png(190, 30, 30)));
    await getWorkHue(OL);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("no sigue redirecciones a hosts no permitidos", async () => {
    vi.mocked(fetch).mockResolvedValue(redirect("https://evil.example/a.jpg"));
    await expect(getWorkHue(OL)).resolves.toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue(redirect("http://archive.org/a.jpg"));
    await expect(getWorkHue(OL)).resolves.toBe("failed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("corta una cadena de redirecciones demasiado larga", async () => {
    vi.mocked(fetch).mockImplementation(async () => redirect("https://archive.org/loop"));
    await expect(getWorkHue(OL)).resolves.toBe("failed");
  });
  it("una respuesta fallida se cachea poco tiempo como «failed» y se registra una vez", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 500 }));
    await expect(getWorkHue(TMDB)).resolves.toBe("failed");
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith("minutes");
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
  it("una imagen ilegible se cachea poco tiempo como «failed»", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("no soy una imagen", { status: 200 }));
    await expect(getWorkHue(TMDB)).resolves.toBe("failed");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });
  it("un fallo de red no lanza", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("red"));
    await expect(getWorkHue(TMDB)).resolves.toBe("failed");
  });
  it("no lee el cuerpo si Content-Length ya supera los 2 MiB", async () => {
    const big = new Response("x", { status: 200, headers: { "content-length": String(2 * 1024 * 1024 + 1) } });
    const read = vi.spyOn(big, "arrayBuffer");
    vi.mocked(fetch).mockResolvedValue(big);
    await expect(getWorkHue(TMDB)).resolves.toBe("failed");
    expect(read).not.toHaveBeenCalled();
  });
  it("admite exactamente 2 MiB declarados, el máximo de uploadCover", async () => {
    const buf = await png(190, 30, 30);
    const edge = new Response(new Uint8Array(buf), {
      status: 200,
      headers: { "content-length": String(2 * 1024 * 1024) },
    });
    vi.mocked(fetch).mockResolvedValue(edge);
    await expect(getWorkHue(TMDB)).resolves.toEqual(expect.any(Number));
  });
  it("rechaza una imagen de más de 16 Mpx sin decodificarla", async () => {
    const huge = await sharp({ create: { width: 4100, height: 4000, channels: 3, background: "#b01e1e" } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    vi.mocked(fetch).mockResolvedValue(ok(huge));
    await expect(getWorkHue(TMDB)).resolves.toBe("failed");
  });
});

describe("resolveWorkHue", () => {
  it("usa el tono de la portada si lo hay", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(30, 60, 200)));
    expect(await resolveWorkHue({ coverUrl: TMDB, title: "Dune" })).not.toBe(hashTitleHue("Dune"));
  });
  it("sin portada usa el hash y no descarga", async () => {
    expect(await resolveWorkHue({ coverUrl: null, title: "Tress" })).toBe(hashTitleHue("Tress"));
    expect(fetch).not.toHaveBeenCalled();
  });
  it("portada sin color: hash", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(128, 128, 128)));
    expect(await resolveWorkHue({ coverUrl: TMDB, title: "Rayuela" })).toBe(hashTitleHue("Rayuela"));
  });
  it("si falla, hash y un único registro del error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("red"));
    expect(await resolveWorkHue({ coverUrl: TMDB, title: "Dune" })).toBe(hashTitleHue("Dune"));
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
  it.each(["https://evil.example/a.jpg", "no es una url"])(
    "un origen no permitido cae al hash en silencio y sin entrar en caché: %s",
    async (coverUrl) => {
      expect(await resolveWorkHue({ coverUrl, title: "Dune" })).toBe(hashTitleHue("Dune"));
      expect(fetch).not.toHaveBeenCalled();
      expect(cacheLife).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    },
  );

  describe("presupuesto de la petición", () => {
    const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    it("a los 800 ms responde con el hash y deja la extracción en marcha", async () => {
      fakeTimers();
      vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));
      const settled = vi.fn();
      const result = resolveWorkHue({ coverUrl: TMDB, title: "Dune" }).then((hue) => {
        settled(hue);
        return hue;
      });

      await vi.advanceTimersByTimeAsync(799);
      expect(settled).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe(hashTitleHue("Dune"));
      expect(after).toHaveBeenCalledTimes(1);
      expect(errorLog).not.toHaveBeenCalled();
    });

    it("el `after` espera a la extracción tardía y da margen a la escritura", async () => {
      fakeTimers();
      let deliver!: (res: Response) => void;
      vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { deliver = resolve; }));
      const result = resolveWorkHue({ coverUrl: TMDB, title: "Dune" });
      await vi.advanceTimersByTimeAsync(800);
      await result;

      const task = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
      const done = vi.fn();
      const running = task().then(done);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(done).not.toHaveBeenCalled();

      // sharp decodifica en libuv: se cede el bucle con setImmediate, que no está
      // falseado (vi.waitFor avanzaría el reloj falso y se comería el margen).
      deliver(ok(await png(190, 30, 30)));
      while (vi.mocked(cacheLife).mock.calls.length === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(499);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await running;
      expect(done).toHaveBeenCalledTimes(1);
    });

    it("dentro de plazo devuelve el tono real y no programa nada", async () => {
      fakeTimers();
      vi.mocked(fetch).mockResolvedValue(ok(await png(30, 60, 200)));
      const hue = await resolveWorkHue({ coverUrl: TMDB, title: "Dune" });
      expect(hue).not.toBe(hashTitleHue("Dune"));
      expect(after).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
