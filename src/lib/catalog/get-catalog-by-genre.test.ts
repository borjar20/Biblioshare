import { describe, expect, it, vi } from "vitest";
import { getCatalogByGenre } from "./get-catalog-by-genre";

// Mock mínimo del builder de supabase: cada from() devuelve un thenable que
// resuelve a un data fijo por tabla. `data` se entrega TAL CUAL (sin ordenar
// por título) porque el código bajo prueba ya no pide `.order`/`.range` a la
// query — el orden/paginación se hace en JS. `.limit()` es el último eslabón
// de la cadena y es quien resuelve la promesa (como en el cliente real).
function fakeSupabase(byTable: Record<string, { data: unknown[]; count: number }>) {
  return {
    from(table: string) {
      const res = byTable[table] ?? { data: [], count: 0 };
      const builder: any = {
        select: () => builder,
        contains: () => builder,
        limit: () => Promise.resolve({ data: res.data, count: res.count, error: null }),
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

  it("un título con diacrítico manda al frente en orden 'es' aunque llegue el último en el fetch", async () => {
    // Simula la divergencia de colación: la fila con "Ábaco" llega la ÚLTIMA
    // en el orden de fetch (como haría el orden DEFAULT de Postgres, que no
    // es locale-aware), pero en orden "es" debe ir ANTES que "Zeta". Si el
    // código paginara sobre el orden de fetch en vez de re-ordenar en JS,
    // "Ábaco" seguiría detrás de "Zeta".
    const s = fakeSupabase({
      books: {
        data: [
          { id: "b1", title: "Zeta", cover_url: null, published_year: 2001 },
          { id: "b2", title: "Ábaco", cover_url: null, published_year: 2002 },
        ],
        count: 2,
      },
    });
    const out = await getCatalogByGenre(s as any, "ensayo", { page: 1 });
    expect(out.items.map((i) => i.title)).toEqual(["Ábaco", "Zeta"]);
  });

  it("página 2: un ítem con rango bajo en orden 'es' pero fuera de la ventana de fetch por tabla ya no se pierde", async () => {
    // Reproduce el bug real: 25 filas en "books", una única tabla con más
    // matches que PAGE_SIZE (24). El fetch llega en un orden DIVERGENTE del
    // orden "es" (simulando el orden DEFAULT de Postgres): "Ábaco" —que en
    // orden "es" debería ser la primera— llega la ÚLTIMA de las 25 filas.
    //
    // Con la lógica vieja (`.order("title").range(0, PAGE_SIZE*page-1)` en
    // la query), la página 1 solo pedía las primeras 24 filas EN ORDEN DE
    // FETCH, así que "Ábaco" (fila 25 del fetch) nunca se descargaba para
    // la página 1; y la página 2 solo mostraba la cola sobrante ("B24"),
    // sin "Ábaco" tampoco. Resultado: "Ábaco" no aparecía en NINGUNA página.
    //
    // Con la lógica nueva (fetch completo hasta SAFETY_LIMIT, orden y
    // paginación en JS), "Ábaco" reordena al principio y cae en página 1.
    const fillers = Array.from({ length: 24 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return { id: `filler-${n}`, title: `B${n}`, cover_url: null, published_year: 2000 + i };
    });
    const data = [...fillers, { id: "abaco", title: "Ábaco", cover_url: null, published_year: 1999 }];
    const s = fakeSupabase({ books: { data, count: 25 } });

    const page1 = await getCatalogByGenre(s as any, "ensayo", { page: 1 });
    expect(page1.items).toHaveLength(24);
    expect(page1.items[0].title).toBe("Ábaco");
    expect(page1.items.map((i) => i.title)).not.toContain("B24");

    const page2 = await getCatalogByGenre(s as any, "ensayo", { page: 2 });
    expect(page2.items.map((i) => i.title)).toEqual(["B24"]);
    expect(page1.total).toBe(25);
    expect(page2.total).toBe(25);
  });
});
