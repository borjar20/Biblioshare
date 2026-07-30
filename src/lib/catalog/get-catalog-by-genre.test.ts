import { describe, expect, it, vi } from "vitest";
import { getCatalogByGenre } from "./get-catalog-by-genre";

// Mock mínimo del builder de supabase: cada from() devuelve un thenable que
// resuelve a un data fijo por tabla. Solo comprobamos el merge/orden/paginación.
function fakeSupabase(byTable: Record<string, { data: unknown[]; count: number }>) {
  return {
    from(table: string) {
      const res = byTable[table] ?? { data: [], count: 0 };
      const builder: any = {
        select: () => builder,
        contains: () => builder,
        order: () => builder,
        range: () => Promise.resolve({ data: res.data, count: res.count, error: null }),
      };
      return builder;
    },
  };
}

describe("getCatalogByGenre", () => {
  it("slug inválido → items vacíos y total 0", async () => {
    const s = fakeSupabase({});
    const out = await getCatalogByGenre(s as any, "no-existe", { page: 1 });
    expect(out).toEqual({ items: [], total: 0 });
  });

  it("mezcla tipos y ordena alfabéticamente por título", async () => {
    const s = fakeSupabase({
      books: { data: [{ id: "b1", title: "Zulú", cover_url: null, published_year: 2000 }], count: 1 },
      movies: { data: [{ id: "m1", title: "Alien", cover_url: null, release_year: 1979 }], count: 1 },
      series: { data: [], count: 0 },
    });
    const out = await getCatalogByGenre(s as any, "ciencia-ficcion", { page: 1 });
    expect(out.items.map((i) => i.title)).toEqual(["Alien", "Zulú"]);
    expect(out.total).toBe(2);
  });

  it("no consulta tablas fuera del appliesTo del género", async () => {
    // "ensayo" es solo de libro: movies/series no deben aportar.
    const s = fakeSupabase({
      books: { data: [{ id: "b1", title: "Sapiens", cover_url: null, published_year: 2011 }], count: 1 },
    });
    const out = await getCatalogByGenre(s as any, "ensayo", { page: 1 });
    expect(out.items.map((i) => i.itemType)).toEqual(["book"]);
  });
});
