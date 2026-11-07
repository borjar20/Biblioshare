// URL del atlas de /sagas (spec 2026-10-28 índice §3): filtros que atenúan, búsqueda y foco
// de los enlaces viejos (`vista`). `vista=todas` y `n` se ignoran: eran de la rejilla.
export type IndexType = "libro" | "pelicula" | "serie";
export type IndexFilters = { tipos: IndexType[]; itinerarios: boolean; coleccion: boolean; min5: boolean };
export type IndexFocus = "sigues" | "universos" | null;
export type IndexParams = { q: string; filters: IndexFilters; focus: IndexFocus };

export const NO_FILTERS: IndexFilters = { tipos: [], itinerarios: false, coleccion: false, min5: false };
const TYPES: readonly IndexType[] = ["libro", "pelicula", "serie"];
const FIELD: Record<IndexType, "book" | "movie" | "series"> = { libro: "book", pelicula: "movie", serie: "series" };

export function parseIndexParams(get: (name: string) => string | null): IndexParams {
  const tipos = (get("tipo") ?? "").split(",").filter((v): v is IndexType => (TYPES as readonly string[]).includes(v));
  const vista = get("vista");
  return {
    q: (get("q") ?? "").trim(),
    filters: { tipos, itinerarios: get("itinerarios") === "1", coleccion: get("coleccion") === "1", min5: get("min5") === "1" },
    focus: vista === "sigo" ? "sigues" : vista === "universos" ? "universos" : null,
  };
}

export function indexQueryString({ q, filters }: { q: string; filters: IndexFilters }): string {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (filters.tipos.length > 0) qs.set("tipo", filters.tipos.join(","));
  if (filters.itinerarios) qs.set("itinerarios", "1");
  if (filters.coleccion) qs.set("coleccion", "1");
  if (filters.min5) qs.set("min5", "1");
  return qs.toString();
}

export const hasFilters = (f: IndexFilters) => f.tipos.length > 0 || f.itinerarios || f.coleccion || f.min5;

export function matchesFilters(
  s: { typeBreakdown: { book: number; movie: number; series: number }; routeCount: number; ownedCount: number; titleCount: number },
  f: IndexFilters,
): boolean {
  if (f.tipos.length > 0 && !f.tipos.some((t) => s.typeBreakdown[FIELD[t]] > 0)) return false;
  if (f.itinerarios && s.routeCount === 0) return false;
  if (f.coleccion && s.ownedCount === 0) return false;
  if (f.min5 && s.titleCount < 5) return false;
  return true;
}

export const normalizeSearch = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function matchesQuery(s: { name: string; children: Array<{ name: string }> }, q: string): boolean {
  const needle = normalizeSearch(q.trim());
  if (!needle) return true;
  return [s.name, ...s.children.map((c) => c.name)].some((n) => normalizeSearch(n).includes(needle));
}
