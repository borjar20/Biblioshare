import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de server-only para evitar el error de módulo en tests.
vi.mock("server-only", () => ({}));

// Mock de next/cache: capturamos revalidatePath, updateTag y revalidateTag.
// Los dos de etiqueta van por separado A PROPÓSITO y no valdría con espiar uno
// solo: `updateTag` únicamente es legal dentro de una server action, así que
// que un helper llame a uno o al otro NO es un detalle — es lo que decide si
// revienta en runtime según desde dónde se invoque (F1-023).
const revalidatePath = vi.fn();
const updateTag = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  updateTag: (...a: unknown[]) => updateTag(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

import {
  revalidateFeed,
  revalidateItemPage,
  revalidateAllItemPages,
  revalidateProfile,
  revalidateClubPages,
  revalidateReadingLog,
  revalidateInteraction,
  revalidateCollection,
  revalidateQuickAdd,
  revalidateQuickAddMany,
  revalidateSagaMembership,
  expireItemCredits,
  expireSagaMembership,
} from "./revalidate";

beforeEach(() => {
  revalidatePath.mockClear();
  updateTag.mockClear();
  revalidateTag.mockClear();
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

// --- Pasada de revalidación (acción 9 de la auditoría) ---
//
// Estos asertos NO miran «se llamó a algo»: miran EXACTAMENTE qué rutas y qué
// etiquetas, porque los cuatro bugs que arreglan eran todos de ALCANCE —
// revalidar de menos (el alta rápida solo tocaba "/") o de más (la campana
// purgaba el layout raíz entero en cada apertura).
describe("pasada de revalidación (F1-014/023/030)", () => {
  it("revalidateCollection toca el listado Y el detalle", () => {
    revalidateCollection("col-1");
    expect(calls()).toEqual(["/coleccion", "/coleccion/c/col-1"]);
  });

  // Antes solo revalidaba "/": la obra recién añadida no aparecía en la
  // biblioteca ni el CTA de su ficha cambiaba (F1-030).
  it("revalidateQuickAdd toca feed, biblioteca y la ficha concreta", () => {
    revalidateQuickAdd("book", "b-1");
    expect(calls()).toEqual(["/", "/coleccion", "/libro/b-1"]);
  });

  it("revalidateQuickAddMany usa el patrón de fichas en vez de enumerarlas", () => {
    revalidateQuickAddMany();
    expect(calls()).toEqual([
      "/",
      "/coleccion",
      "/libro/[id] page",
      "/pelicula/[id] page",
      "/serie/[id] page",
    ]);
  });

  // Alta rápida = pase `planned`, que no lleva nota: tocar `ratings:*` aquí
  // tiraría la media de la comunidad sin que nadie haya puntuado nada.
  it("revalidateQuickAdd NO toca la etiqueta de notas", () => {
    revalidateQuickAdd("book", "b-1");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("expireItemCredits caduca la etiqueta del ítem, y de inmediato", () => {
    expireItemCredits("movie", "m-1");
    expect(revalidateTag).toHaveBeenCalledWith("credits:movie:m-1", { expire: 0 });
  });

  // La razón de ser del helper: el «nº X de Y» de CADA miembro cambia cuando
  // entra o sale uno, no solo el del ítem que se tocó (F1-023).
  it("revalidateSagaMembership invalida a todos los miembros, no solo a uno", () => {
    revalidateSagaMembership([
      { itemType: "book", itemId: "b-1" },
      { itemType: "book", itemId: "b-2" },
      { itemType: "movie", itemId: "m-1" },
    ]);
    expect(updateTag.mock.calls.flat()).toEqual([
      "saga-membership:book:b-1",
      "saga-membership:book:b-2",
      "saga-membership:movie:m-1",
    ]);
  });

  // Recomponer jerarquías de subsagas trae la misma obra por dos caminos.
  it("revalidateSagaMembership deduplica", () => {
    revalidateSagaMembership([
      { itemType: "book", itemId: "b-1" },
      { itemType: "book", itemId: "b-1" },
    ]);
    expect(updateTag).toHaveBeenCalledTimes(1);
  });

  // La distinción que cuesta un error de runtime si se equivoca: `updateTag`
  // solo es legal dentro de una server action, y los `expire*` se llaman desde
  // `after()`, que no lo es.
  it("expireSagaMembership usa revalidateTag, NUNCA updateTag", () => {
    expireSagaMembership([{ itemType: "series", itemId: "s-1" }]);
    expect(revalidateTag).toHaveBeenCalledWith("saga-membership:series:s-1", {
      expire: 0,
    });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
