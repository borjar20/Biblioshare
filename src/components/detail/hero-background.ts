// Qué pinta el hero detrás (spec 2026-09-23 §1), por orden de preferencia:
// el backdrop apaisado de TMDB (pelis y series, PR 1), la portada ampliada y
// difuminada (todos los libros, y pelis/series sin backdrop), o un degradado
// del acento del tipo (obra manual sin portada). Pura para poder probarla.
export type HeroBackground =
  | { kind: "backdrop"; src: string }
  | { kind: "cover"; src: string }
  | { kind: "none" };

export function pickHeroBackground({
  backdropUrl,
  coverUrl,
}: {
  backdropUrl: string | null;
  coverUrl: string | null;
}): HeroBackground {
  if (backdropUrl) return { kind: "backdrop", src: backdropUrl };
  if (coverUrl) return { kind: "cover", src: coverUrl };
  return { kind: "none" };
}
