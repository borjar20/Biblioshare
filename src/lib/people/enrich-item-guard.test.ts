import { describe, expect, it, vi } from "vitest";
import { ensureItemEnriched } from "./enrich-item";

// El guard de créditos de `ensureItemEnriched`. Lo que se comprueba aquí no es
// una preferencia de estilo: es el bug del 2026-08-12 —una película creada desde
// la ficha de una persona nacía con UN crédito, el guard viejo («¿hay algún
// crédito?») la daba por enriquecida y se quedaba sin reparto, sin equipo y sin
// saga para siempre—.
//
// El discriminante es `billing_order`: el enriquecido completo lo escribe en el
// reparto facturado, la siembra por persona lo deja a null.

type CreditRow = { billing_order: number | null };

/**
 * Doble del cliente que responde al `count` del guard SOLO con las filas que
 * tengan `billing_order` no nulo, que es justo lo que filtra la consulta real.
 */
function fakeSupabase(credits: CreditRow[]) {
  const detailsFetched: string[] = [];
  const api = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return this;
            },
            not(column: string) {
              detailsFetched.push(`count:${table}:${column}`);
              return Promise.resolve({
                count: credits.filter((c) => c.billing_order !== null).length,
                error: null,
              });
            },
          };
        },
      };
    },
    _calls: detailsFetched,
  };
  return api;
}

describe("guard de créditos de ensureItemEnriched", () => {
  it("con SOLO créditos sin billing_order (siembra por persona) -> hay que enriquecer", async () => {
    // Sin TMDB_API_KEY la llamada de detalles devuelve null y la función sale
    // limpia; lo que se mide es que LLEGÓ a intentarlo, o sea que el guard no la
    // dio por enriquecida.
    const original = process.env.TMDB_API_KEY;
    delete process.env.TMDB_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const supabase = fakeSupabase([{ billing_order: null }]);
    await ensureItemEnriched(supabase as never, "movie", {
      id: "uuid-1",
      tmdbId: 603,
      durationMinutes: 136,
    });

    // Consultó el guard filtrando por billing_order, no por "existe alguno".
    expect(supabase._calls).toContain("count:credits:billing_order");

    if (original === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = original;
    vi.unstubAllGlobals();
  });

  it("con reparto facturado (billing_order 0) -> no vuelve a pedir nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const supabase = fakeSupabase([{ billing_order: 0 }]);
    await ensureItemEnriched(supabase as never, "movie", {
      id: "uuid-1",
      tmdbId: 603,
      // Con la duración ya puesta tampoco hacen falta tamaños: sin créditos que
      // traer, la función tiene que salir SIN tocar la red.
      durationMinutes: 136,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
