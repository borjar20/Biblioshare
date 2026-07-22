"use client";

// Loader de next/image que NO pasa por el optimizador de Vercel.
//
// Por qué: el plan Hobby incluye 5.000 transformaciones/mes y cada combinación
// única de (imagen origen, ancho, calidad) gasta una. Con un catálogo de miles
// de portadas la cuota se agota sola, y a cambio el optimizador aportaba muy
// poco: TODAS nuestras imágenes remotas vienen ya de un CDN que las sirve en
// tamaños fijos y pequeños (TMDB w342, OpenLibrary -M, avatares de Storage).
//
// En vez de reescalar en Vercel, pedimos al CDN de origen el tamaño que toca.
// Regla: solo bajamos de tamaño, nunca subimos — así ninguna vista pierde
// nitidez respecto a lo que ya se veía.

const TMDB_POSTER_WIDTHS = [92, 154, 185, 342] as const;

// Solo tratamos w342: es el único bucket que este repo usa para pósters
// (ver TMDB_IMAGE_BASE en src/lib/catalog/tmdb.ts), así que la familia es
// inequívoca. Los demás (w92 logo, w185 perfil, w300 fotograma) ya son
// pequeños y cada familia admite buckets distintos: tocarlos daría 404.
const TMDB_POSTER_RE = /^https:\/\/image\.tmdb\.org\/t\/p\/w342\//;

const OPENLIBRARY_RE =
  /^(https:\/\/covers\.openlibrary\.org\/[ab]\/id\/\d+)-([SML])\.jpg$/;

const OPENLIBRARY_RANK = { S: 0, M: 1, L: 2 } as const;

function tmdbPoster(src: string, width: number): string {
  const target =
    TMDB_POSTER_WIDTHS.find((candidate) => candidate >= width) ?? 342;
  return src.replace("/t/p/w342/", `/t/p/w${target}/`);
}

function openLibraryCover(
  base: string,
  current: "S" | "M" | "L",
  width: number
): string {
  const wanted = width <= 120 ? "S" : width <= 400 ? "M" : "L";
  // Nunca subir: si en BD hay -M y la vista pide 800px, se queda en -M.
  const size =
    OPENLIBRARY_RANK[wanted] < OPENLIBRARY_RANK[current] ? wanted : current;
  return `${base}-${size}.jpg`;
}

export default function cdnLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (TMDB_POSTER_RE.test(src)) return tmdbPoster(src, width);

  const openLibrary = OPENLIBRARY_RE.exec(src);
  if (openLibrary) {
    return openLibraryCover(
      openLibrary[1],
      openLibrary[2] as "S" | "M" | "L",
      width
    );
  }

  // Avatares de Supabase Storage, Google Books y cualquier otro origen: se
  // sirven tal cual. Coste en transformaciones: cero.
  return src;
}
