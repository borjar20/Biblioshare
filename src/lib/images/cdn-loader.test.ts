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
    // La URL de salida es igual a la de entrada (no hay a dónde subir), así
    // que se marca con `?width=` inocuo para no disparar el falso positivo de
    // next-image-missing-loader-width (ver comentario de markIfUnchanged).
    expect(cdnLoader({ src: poster, width: 1920 })).toBe(`${poster}?width=342`);
  });

  it("no toca otras familias de TMDB (logos, perfiles, fotogramas)", () => {
    // w92/w185/w300 admiten buckets distintos según la familia: reescribirlos
    // daría 404 en TMDB. El path no cambia, pero sí se declara `width` para
    // implementar el contrato de next/image honestamente.
    for (const src of [
      "https://image.tmdb.org/t/p/w92/logo.png",
      "https://image.tmdb.org/t/p/w185/perfil.jpg",
      "https://image.tmdb.org/t/p/w300/still.jpg",
    ]) {
      expect(cdnLoader({ src, width: 30 })).toBe(`${src}?width=30`);
    }
  });

  it("elige el tamaño de OpenLibrary según el ancho, sin subir", () => {
    expect(cdnLoader({ src: cover("L"), width: 60 })).toBe(cover("S"));
    expect(cdnLoader({ src: cover("L"), width: 300 })).toBe(cover("M"));
    // Sin cambio de bucket (nunca sube): mismo falso positivo que arriba.
    expect(cdnLoader({ src: cover("M"), width: 800 })).toBe(
      `${cover("M")}?width=M`
    );
    expect(cdnLoader({ src: cover("S"), width: 800 })).toBe(
      `${cover("S")}?width=S`
    );
  });

  it("declara `width` como parámetro inocuo en orígenes que no sabe redimensionar", () => {
    // Avatares de Supabase Storage: no hay resize gratis (issue #160). Se
    // declara `width` para que next/image no avise de que el loader lo
    // ignora, sin fingir un resize que no ocurre.
    const avatar =
      "https://xyz.supabase.co/storage/v1/object/public/avatars/u1.jpg";
    expect(cdnLoader({ src: avatar, width: 40 })).toBe(`${avatar}?width=40`);
  });

  it("no toca rutas locales (sin origen remoto que declarar)", () => {
    expect(cdnLoader({ src: "/next.svg", width: 40 })).toBe("/next.svg");
  });
});
