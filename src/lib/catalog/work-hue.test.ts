import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
import { getWorkHue, resolveWorkHue, smallCoverUrl } from "./work-hue";
import { hashTitleHue } from "./work-hue-core";

const png = (r: number, g: number, b: number) =>
  sharp({ create: { width: 40, height: 60, channels: 3, background: { r, g, b } } }).png().toBuffer();
const ok = (buf: Buffer) => new Response(new Uint8Array(buf), { status: 200 });
const TMDB = "https://image.tmdb.org/t/p/w342/a.jpg";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

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
  it("extrae el tono de una portada con color", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(190, 30, 30)));
    const hue = await getWorkHue(TMDB);
    expect(hue).toBeGreaterThanOrEqual(15);
    expect(hue).toBeLessThanOrEqual(40);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://image.tmdb.org/t/p/w92/a.jpg");
  });
  it("devuelve null con una portada sin color", async () => {
    vi.mocked(fetch).mockResolvedValue(ok(await png(128, 128, 128)));
    await expect(getWorkHue(TMDB)).resolves.toBeNull();
  });
  it("rechaza orígenes no permitidos sin descargar nada", async () => {
    await expect(getWorkHue("https://evil.example/a.jpg")).rejects.toThrow();
    await expect(getWorkHue("http://image.tmdb.org/t/p/w342/a.jpg")).rejects.toThrow();
    await expect(getWorkHue("https://abc.supabase.co/rest/v1/secret")).rejects.toThrow();
    await expect(getWorkHue("https://archive.org/a.jpg")).rejects.toThrow();
    await expect(getWorkHue("no es una url")).rejects.toThrow();
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
  it("no sigue redirecciones a hosts no permitidos", async () => {
    vi.mocked(fetch).mockResolvedValue(redirect("https://evil.example/a.jpg"));
    await expect(getWorkHue(OL)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue(redirect("http://archive.org/a.jpg"));
    await expect(getWorkHue(OL)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("corta una cadena de redirecciones demasiado larga", async () => {
    vi.mocked(fetch).mockImplementation(async () => redirect("https://archive.org/loop"));
    await expect(getWorkHue(OL)).rejects.toThrow();
  });
  it("lanza si la respuesta falla, para no cachear el fallo", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 500 }));
    await expect(getWorkHue(TMDB)).rejects.toThrow();
  });
  it("lanza si la imagen no se puede leer", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("no soy una imagen", { status: 200 }));
    await expect(getWorkHue(TMDB)).rejects.toThrow();
  });
});

describe("resolveWorkHue", () => {
  const silence = () => vi.spyOn(console, "error").mockImplementation(() => {});
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
  it("si falla, hash y registra el error", async () => {
    const spy = silence();
    vi.mocked(fetch).mockRejectedValue(new Error("red"));
    expect(await resolveWorkHue({ coverUrl: TMDB, title: "Dune" })).toBe(hashTitleHue("Dune"));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
