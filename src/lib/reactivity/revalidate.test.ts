import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de server-only para evitar el error de módulo en tests.
vi.mock("server-only", () => ({}));

// Mock de next/cache: capturamos cada llamada a revalidatePath.
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import {
  revalidateFeed,
  revalidateItemPage,
  revalidateAllItemPages,
  revalidateProfile,
  revalidateClubPages,
  revalidateReadingLog,
  revalidateInteraction,
} from "./revalidate";

beforeEach(() => revalidatePath.mockClear());

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

  it("revalidateClubPages cubre ficha de club, actividad y listado", () => {
    revalidateClubPages();
    expect(calls()).toEqual([
      "/club/[slug] page",
      "/club/[slug]/actividad/[id] page",
      "/clubes",
    ]);
  });

  it("revalidateReadingLog toca ficha + perfiles + feed", () => {
    revalidateReadingLog("movie", "xyz");
    expect(calls()).toEqual(["/pelicula/xyz", "/u/[username] page", "/"]);
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
      "/clubes",
    ]);
  });
});
