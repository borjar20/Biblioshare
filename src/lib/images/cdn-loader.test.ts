import { describe, expect, it } from "vitest";
import cdnLoader from "./cdn-loader";

const poster = "https://image.tmdb.org/t/p/w342/abc123.jpg";
const cover = (size: string) =>
  `https://covers.openlibrary.org/b/id/8100921-${size}.jpg`;

describe("cdnLoader", () => {
  it("baja el póster de TMDB al bucket más pequeño que cubre el ancho", () => {
    expect(cdnLoader({ src: poster, width: 30 })).toBe(
      "https://image.tmdb.org/t/p/w92/abc123.jpg"
    );
    expect(cdnLoader({ src: poster, width: 128 })).toBe(
      "https://image.tmdb.org/t/p/w154/abc123.jpg"
    );
  });

  it("nunca sube por encima de w342 aunque se pida más", () => {
    expect(cdnLoader({ src: poster, width: 1920 })).toBe(poster);
  });

  it("no toca otras familias de TMDB (logos, perfiles, fotogramas)", () => {
    // w92/w185/w300 admiten buckets distintos según la familia: reescribirlos
    // daría 404 en TMDB.
    for (const src of [
      "https://image.tmdb.org/t/p/w92/logo.png",
      "https://image.tmdb.org/t/p/w185/perfil.jpg",
      "https://image.tmdb.org/t/p/w300/still.jpg",
    ]) {
      expect(cdnLoader({ src, width: 30 })).toBe(src);
    }
  });

  it("elige el tamaño de OpenLibrary según el ancho, sin subir", () => {
    expect(cdnLoader({ src: cover("L"), width: 60 })).toBe(cover("S"));
    expect(cdnLoader({ src: cover("L"), width: 300 })).toBe(cover("M"));
    expect(cdnLoader({ src: cover("M"), width: 800 })).toBe(cover("M"));
    expect(cdnLoader({ src: cover("S"), width: 800 })).toBe(cover("S"));
  });

  it("sirve tal cual los orígenes que no sabemos redimensionar", () => {
    const avatar =
      "https://xyz.supabase.co/storage/v1/object/public/avatars/u1.jpg";
    expect(cdnLoader({ src: avatar, width: 40 })).toBe(avatar);
    expect(cdnLoader({ src: "/next.svg", width: 40 })).toBe("/next.svg");
  });
});
