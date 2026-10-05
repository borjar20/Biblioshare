import type { FeedEpisode } from "@/lib/social/feed";

// Cálculos de la tarjeta de episodios del día (spec 2026-10-05-feed-episodios-
// curva). Notas en la escala guardada 1-10; la vista las pinta sobre 5.

export function episodeCode(e: { season: number; episode: number }, short = false): string {
  return short ? `E${e.episode}` : `S${e.season}E${e.episode}`;
}

const rated = (eps: FeedEpisode[]) => eps.filter((e): e is FeedEpisode & { rating: number } => e.rating != null);

// El mejor (o los mejores si empatan). Si TODOS los que tienen nota empatan y
// son más de uno, no hay «mejor»: no se marca ninguno.
export function bestEpisodes(eps: FeedEpisode[]): Set<FeedEpisode> {
  const withRating = rated(eps);
  if (withRating.length === 0) return new Set();
  const max = Math.max(...withRating.map((e) => e.rating));
  const top = withRating.filter((e) => e.rating === max);
  if (withRating.length > 1 && top.length === withRating.length) return new Set();
  return new Set(top);
}

// «Lo mejor» y «lo peor» del post con muchos episodios: hasta `k` por lado,
// sin que un episodio salga en los dos (con pocas notas, se reparten).
// Desempate por orden de emisión.
export function highlights(eps: FeedEpisode[], k = 3): { best: FeedEpisode[]; worst: FeedEpisode[] } {
  const order = (e: FeedEpisode) => e.season * 10_000 + e.episode;
  const byBest = [...rated(eps)].sort((a, b) => b.rating - a.rating || order(a) - order(b));
  const nBest = Math.min(k, Math.ceil(byBest.length / 2));
  const nWorst = Math.min(k, Math.floor(byBest.length / 2));
  const best = byBest.slice(0, nBest);
  // Los peores se sacan de los que NO están ya en `best`: con empates (13
  // episodios con un 7) dos ordenaciones independientes repetirían episodios.
  const taken = new Set(best);
  const byWorst = [...rated(eps)]
    .filter((e) => !taken.has(e))
    .sort((a, b) => a.rating - b.rating || order(a) - order(b));
  return { best, worst: byWorst.slice(0, nWorst) };
}

export function averageRating(eps: FeedEpisode[]): number | null {
  const withRating = rated(eps);
  if (withRating.length < 2) return null;
  return withRating.reduce((sum, e) => sum + e.rating, 0) / withRating.length;
}

export function seasonsOf(eps: FeedEpisode[]): number[] {
  return [...new Set(eps.map((e) => e.season))].sort((a, b) => a - b);
}
