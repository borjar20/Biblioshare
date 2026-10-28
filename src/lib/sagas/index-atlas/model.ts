import { sagaHref } from "@/lib/catalog/item-href";
import type { SagaAccentToken } from "../accents";
import type { SagaIndexCard } from "../build-saga-index";

// Modelo del atlas de /sagas (spec 2026-10-28 índice §4.1). Puro: el cliente lo vuelve a
// derivar tras seguir una saga (actualización optimista).
export type ComarcaKey = "libros" | "peliculas" | "series" | "mixtas";
export type IndexZoneKey = "en-curso" | "sigues" | "terminadas" | "por-descubrir" | ComarcaKey;
export type IndexAtlasChild = { id: string; name: string; href: string; accent: SagaAccentToken; titleCount: number };
export type IndexAtlasSaga = {
  id: string; name: string; href: string; coverUrl: string | null; accent: SagaAccentToken;
  zone: IndexZoneKey; comarca: ComarcaKey | null;
  titleCount: number; typeBreakdown: { book: number; movie: number; series: number };
  creator: string | null; routeCount: number; ownedCount: number; isFollowed: boolean;
  progress: { completed: number; total: number } | null;
  children: IndexAtlasChild[];
};
export type IndexAtlasComarca = { key: ComarcaKey; sagas: IndexAtlasSaga[] };
export type IndexAtlasZone = { key: IndexZoneKey; count: number; sagas: IndexAtlasSaga[]; comarcas: IndexAtlasComarca[] | null };
export type IndexAtlasModel = { zones: IndexAtlasZone[]; sagaCount: number; universeCount: number; followedCount: number; authenticated: boolean };

const COMARCAS: readonly ComarcaKey[] = ["libros", "peliculas", "series", "mixtas"];
type ReaderZone = Extract<IndexZoneKey, "en-curso" | "sigues" | "terminadas" | "por-descubrir">;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
const bySize = (a: IndexAtlasSaga, b: IndexAtlasSaga) => b.titleCount - a.titleCount || byName(a, b);

/** El único tipo con obras; con más de uno (o ninguno), Mixtas. */
function comarcaOf(t: SagaIndexCard["typeBreakdown"]): ComarcaKey {
  const present = (["book", "movie", "series"] as const).filter((k) => t[k] > 0);
  if (present.length !== 1) return "mixtas";
  return present[0] === "book" ? "libros" : present[0] === "movie" ? "peliculas" : "series";
}

function readerZone(c: SagaIndexCard): ReaderZone {
  const done = c.progress !== null && c.progress.total > 0 && c.progress.completed >= c.progress.total;
  if (c.started && !done) return "en-curso";
  if (c.isFollowed && !c.started) return "sigues";
  if (done) return "terminadas";
  return "por-descubrir";
}

export function deriveIndexAtlas(cards: SagaIndexCard[], authenticated: boolean): IndexAtlasModel {
  const sagas = cards.map((c): IndexAtlasSaga => {
    const comarca = comarcaOf(c.typeBreakdown);
    const zone: IndexZoneKey = authenticated ? readerZone(c) : comarca;
    return {
      id: c.id, name: c.name, href: sagaHref(c.id), coverUrl: c.coverUrl, accent: c.accent,
      zone, comarca: zone === "por-descubrir" ? comarca : null,
      titleCount: c.titleCount, typeBreakdown: c.typeBreakdown, creator: c.creator,
      routeCount: c.routeCount, ownedCount: c.ownedCount, isFollowed: authenticated && c.isFollowed,
      progress: authenticated && c.progress ? { completed: c.progress.completed, total: c.progress.total } : null,
      children: c.children.map((h) => ({ id: h.id, name: h.name, href: sagaHref(h.id), accent: h.accent, titleCount: h.titleCount })),
    };
  });
  const lastTouched = new Map(cards.map((c) => [c.id, c.lastTouchedAt ?? ""] as const));

  const zones: IndexAtlasZone[] = [];
  const push = (key: IndexZoneKey, list: IndexAtlasSaga[], comarcas: IndexAtlasComarca[] | null = null) => {
    if (list.length > 0) zones.push({ key, count: list.length, sagas: list, comarcas });
  };
  if (authenticated) {
    const inZone = (k: IndexZoneKey) => sagas.filter((s) => s.zone === k);
    push("en-curso", inZone("en-curso").sort((a, b) => (lastTouched.get(b.id)! > lastTouched.get(a.id)! ? 1 : lastTouched.get(b.id)! < lastTouched.get(a.id)! ? -1 : byName(a, b))));
    push("sigues", inZone("sigues").sort(byName));
    push("terminadas", inZone("terminadas").sort(byName));
    const comarcas = COMARCAS
      .map((key) => ({ key, sagas: sagas.filter((s) => s.zone === "por-descubrir" && s.comarca === key).sort(bySize) }))
      .filter((c) => c.sagas.length > 0);
    push("por-descubrir", comarcas.flatMap((c) => c.sagas), comarcas);
  } else {
    for (const key of COMARCAS) push(key, sagas.filter((s) => s.zone === key).sort(bySize));
  }

  return {
    zones,
    sagaCount: sagas.length,
    universeCount: sagas.filter((s) => s.children.length > 0).length,
    followedCount: sagas.filter((s) => s.isFollowed).length,
    authenticated,
  };
}

/** Todas las sagas en orden de zona, de comarca y de saga: el orden de lista y de tabulación. */
export const orderedSagas = (model: IndexAtlasModel) => model.zones.flatMap((z) => z.sagas);
