import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { samplePayload } from "@/components/wrap-ups/__fixtures__/sample-payload";
import type { ItemRef, ShareSummary } from "./types";

vi.mock("server-only", () => ({}));
const { coverJpeg, isAllowedCoverUrl, narratorPng, petPng } = await import("./og-assets");
const { wrapUpImageCopy } = await import("./og-image");

const base: ShareSummary = samplePayload().share;

describe("wrapUpImageCopy: las reglas de la story de cierre", () => {
  it("con tiempo medido: cifra en horas, obras y episodios sin duración", () => {
    const c = wrapUpImageCopy(base);
    expect(c.period).toBe("Semana del 28 sep al 4 oct");
    expect(c.title).toBe("Tu semana");
    expect(c.figure).toEqual({ value: "17", unit: "h" });
    expect(c.lines).toEqual(["5 obras terminadas", "y 2 episodios sin duración conocida"]);
    expect(c.narratorLine).toBe("Marca la página: seguimos pronto.");
  });

  it("solo episodios sin duración: la cifra son los episodios, nunca «0 min»", () => {
    const c = wrapUpImageCopy({ ...base, minutes: 0, episodesWithoutRuntime: 7, finished: 1 });
    expect(c.figure).toEqual({ value: "7", unit: "episodios" });
    expect(c.lines[0]).toMatch(/no se convierte en horas/);
  });

  it("todo a cero: sin cifra", () => {
    const c = wrapUpImageCopy({ ...base, minutes: 0, episodesWithoutRuntime: 0, finished: 0 });
    expect(c.figure).toBeNull();
    expect(c.lines).toEqual(["Sin datos de tiempo en este periodo", "0 obras terminadas"]);
  });
});

const item = (coverUrl: string | null): ItemRef => ({ type: "book", id: "b", title: "T", coverUrl, times: 1 });
const okImage = async () => {
  const png = await sharp({ create: { width: 4, height: 6, channels: 3, background: "#123456" } }).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } });
};

describe("portadas", () => {
  it("solo https y orígenes conocidos", () => {
    expect(isAllowedCoverUrl("https://image.tmdb.org/t/p/w342/x.jpg")).toBe(true);
    expect(isAllowedCoverUrl("https://abc.supabase.co/storage/v1/object/public/x.png")).toBe(true);
    expect(isAllowedCoverUrl("http://image.tmdb.org/x.jpg")).toBe(false);
    expect(isAllowedCoverUrl("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedCoverUrl("no es url")).toBe(false);
  });

  it("descarga, recorta a la carta y devuelve JPEG", async () => {
    const src = await coverJpeg(item("https://image.tmdb.org/x.jpg"), 20, 30, vi.fn(okImage) as unknown as typeof fetch);
    expect(src).toMatch(/^data:image\/jpeg;base64,/);
    const meta = await sharp(Buffer.from(src!.split(",")[1], "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([20, 30]);
  });

  it("pasa un AbortSignal con tiempo límite", async () => {
    const f = vi.fn(okImage);
    await coverJpeg(item("https://image.tmdb.org/x.jpg"), 20, 30, f as unknown as typeof fetch);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("cualquier fallo → null (la imagen pinta la carta con el título)", async () => {
    const url = "https://image.tmdb.org/x.jpg";
    const timeout = vi.fn(async () => { throw new DOMException("t", "TimeoutError"); }) as unknown as typeof fetch;
    expect(await coverJpeg(item(url), 20, 30, timeout)).toBeNull();
    const notFound = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await coverJpeg(item(url), 20, 30, notFound)).toBeNull();
    const html = vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect(await coverJpeg(item(url), 20, 30, html)).toBeNull();
    const garbage = vi.fn(async () => new Response("xx", { headers: { "content-type": "image/png" } })) as unknown as typeof fetch;
    expect(await coverJpeg(item(url), 20, 30, garbage)).toBeNull();
  });

  it("sin portada u origen no permitido: ni siquiera pide", async () => {
    const f = vi.fn(okImage) as unknown as typeof fetch;
    expect(await coverJpeg(item(null), 20, 30, f)).toBeNull();
    expect(await coverJpeg(item("https://evil.example/x.jpg"), 20, 30, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("sprites", () => {
  it("narradora: primer frame recortado y escalado por un entero", async () => {
    const s = await narratorPng("reader");
    const meta = await sharp(Buffer.from(s.src.split(",")[1], "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([s.width, s.height]);
    expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(230);
    expect(Math.max(s.width, s.height)).toBeGreaterThan(115);
  });

  it("ardilla: null sin mascota; la bellota tiene su propio sheet", async () => {
    expect(await petPng(null)).toBeNull();
    expect(await petPng({ name: "A", petClass: "bard", stage: "acorn" })).not.toBeNull();
    expect(await petPng({ name: "B", petClass: "bard", stage: "young" })).not.toBeNull();
  });
});
