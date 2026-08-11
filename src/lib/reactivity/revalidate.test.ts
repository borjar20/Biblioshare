import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de server-only para evitar el error de módulo en tests.
vi.mock("server-only", () => ({}));

// Mock de next/cache: capturamos revalidatePath y updateTag.
const revalidatePath = vi.fn();
const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  updateTag: (...a: unknown[]) => updateTag(...a),
}));

import {
  revalidateFeed,
  revalidateItemPage,
  revalidateAllItemPages,
  revalidateProfile,
  revalidateClubPages,
  revalidateReadingLog,
  revalidateInteraction,
} from "./revalidate";

beforeEach(() => {
  revalidatePath.mockClear();
  updateTag.mockClear();
});

// Todas las rutas (path + type) que un helper pidió revalidar.
function calls() {
  return revalidatePath.mock.calls.map((c) => c.join(" "));
}

describe("revalidate helpers", () => {
  it("revalidateFeed revalida el feed de inicio", () => {
    revalidateFeed();
    expect(calls()).toEqual(["/"]);
  });

  it("revalidateItemPage usa la ruta literal del item", () => {
    revalidateItemPage("book", "abc");
    expect(calls()).toEqual(["/libro/abc"]);
  });

  it("revalidateAllItemPages cubre libro, pelicula y serie como page pattern", () => {
    revalidateAllItemPages();
    expect(calls()).toEqual([
      "/libro/[id] page",
      "/pelicula/[id] page",
      "/serie/[id] page",
    ]);
  });

  it("revalidateProfile usa la ruta literal del usuario", () => {
    revalidateProfile("borja");
    expect(calls()).toEqual(["/u/borja"]);
  });

  // El calendario y la ficha de evento entran desde el seguimiento de eventos
  // (spec 2026-08-04): seguir cambia el contador de la ficha y la marca de
  // «seguido» de la rejilla, y sin revalidarlas el optimismo de la UI no tendría
  // con qué reconciliarse.
  it("revalidateClubPages cubre ficha de club, actividad, calendario, evento y listado", () => {
    revalidateClubPages();
    expect(calls()).toEqual([
      "/club/[slug] page",
      "/club/[slug]/actividad/[id] page",
      "/club/[slug]/calendario page",
      "/club/[slug]/evento/[id] page",
      "/clubes",
    ]);
  });

  it("revalidateReadingLog toca ficha + perfiles + feed", () => {
    revalidateReadingLog("movie", "xyz");
    expect(calls()).toEqual(["/pelicula/xyz", "/u/[username] page", "/"]);
  });

  it("revalidateReadingLog invalida la etiqueta de nota (read-your-own-writes)", () => {
    revalidateReadingLog("movie", "xyz");
    expect(updateTag).toHaveBeenCalledWith("ratings:movie:xyz");
  });

  it("revalidateInteraction incluye las fichas de club (bug arreglado)", () => {
    revalidateInteraction();
    expect(calls()).toEqual([
      "/libro/[id] page",
      "/pelicula/[id] page",
      "/serie/[id] page",
      "/",
      "/club/[slug] page",
      "/club/[slug]/actividad/[id] page",
      "/club/[slug]/calendario page",
      "/club/[slug]/evento/[id] page",
      "/clubes",
    ]);
  });
});
