import { describe, expect, it, beforeEach, vi } from "vitest";

// Lo que se comprueba aquí es el ORDEN, que es donde estaba el fallo: el equipo
// se ordenaba solo por rol, y como TODOS los créditos de libro son
// role="author", las comparaciones daban 0 y mandaba el orden arbitrario de
// Postgres. "El nombre del viento" podía pintar al ilustrador delante del autor.

const estado = vi.hoisted(() => ({ filas: [] as unknown[] }));

vi.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createPublicClient: () => ({
    from: () => ({
      select: () => {
        // La consulta encadena .eq().eq() y se espera con await: basta con un
        // objeto que se devuelva a sí mismo y sea "thenable".
        const q: Record<string, unknown> = {};
        q.eq = () => q;
        q.then = (resolve: (value: unknown) => void) => resolve({ data: estado.filas });
        return q;
      },
    }),
  }),
}));

import { getItemCredits } from "./get-item-credits";

function fila(
  name: string,
  role: string,
  billingOrder: number | null
): Record<string, unknown> {
  return {
    role,
    character: null,
    billing_order: billingOrder,
    person: { id: `p-${name}`, name, photo_url: null },
  };
}

beforeEach(() => {
  estado.filas = [];
});

describe("getItemCredits · orden del equipo", () => {
  it("dentro del mismo rol manda billing_order, no el orden que devuelva la BD", async () => {
    // Caso real: el work de OL lista a Rothfuss y al ilustrador Simonetti con el
    // mismo type, así que los dos son role="author"; el backfill les pone
    // billing_order 0 y 1. La BD los devuelve al revés.
    estado.filas = [fila("Marc Simonetti", "author", 1), fila("Patrick Rothfuss", "author", 0)];

    const { crew } = await getItemCredits("book", "libro-1");
    expect(crew.map((c) => c.name)).toEqual(["Patrick Rothfuss", "Marc Simonetti"]);
  });

  it("el rol sigue mandando por encima de billing_order", async () => {
    estado.filas = [fila("Guionista", "writer", 0), fila("Directora", "director", 7)];

    const { crew } = await getItemCredits("movie", "peli-1");
    expect(crew.map((c) => c.name)).toEqual(["Directora", "Guionista"]);
  });

  it("un billing_order nulo va al final de su rol, no al principio", async () => {
    // Los créditos sembrados desde la ficha de una persona nacen sin
    // billing_order; no deben colarse por delante del autor principal.
    estado.filas = [fila("Sin orden", "author", null), fila("Autora", "author", 0)];

    const { crew } = await getItemCredits("book", "libro-2");
    expect(crew.map((c) => c.name)).toEqual(["Autora", "Sin orden"]);
  });

  it("el reparto se sigue ordenando por billing_order", async () => {
    estado.filas = [
      fila("Secundario", "cast", 3),
      fila("Protagonista", "cast", 0),
      fila("Directora", "director", null),
    ];

    const { cast, crew } = await getItemCredits("movie", "peli-2");
    expect(cast.map((c) => c.name)).toEqual(["Protagonista", "Secundario"]);
    expect(crew.map((c) => c.name)).toEqual(["Directora"]);
  });
});
