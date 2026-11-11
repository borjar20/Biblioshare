// Forma del cartel de la ficha (spec 2026-11-09). Se decide por el origen, sin
// medir cada imagen: las portadas de libros rondan 180–340 px y no aguantan a
// toda pantalla; los pósters de TMDB sí, pedidos en 780.
export type PosterArt =
  | { kind: "bleed"; src: string }
  | { kind: "atmosphere"; src: string }
  | { kind: "type" };

const TMDB_POSTER = /^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/.+)$/;

export function pickPosterArt({ coverUrl }: { coverUrl: string | null }): PosterArt {
  if (!coverUrl) return { kind: "type" };
  const tmdb = TMDB_POSTER.exec(coverUrl);
  if (tmdb) return { kind: "bleed", src: `${tmdb[1]}w780${tmdb[2]}` };
  return { kind: "atmosphere", src: coverUrl };
}

export function posterTitleClass(title: string): string {
  const length = Array.from(title).length;
  if (length <= 20) return "text-[64px] xl:text-[88px]";
  if (length <= 45) return "text-[50px] xl:text-[66px]";
  if (length <= 80) return "text-[38px] xl:text-[50px]";
  return "text-[30px] xl:text-[38px]";
}
