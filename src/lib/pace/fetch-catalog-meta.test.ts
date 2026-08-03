import { describe, expect, it } from "vitest";
import { pickEditionPages } from "./fetch-catalog-meta";

const alianza = { id: "ed-alianza", total_pages: 736, is_primary: false };
const runas = { id: "ed-runas", total_pages: 684, is_primary: true };

describe("pickEditionPages", () => {
  it("prefiere la edición del pase sobre la primaria", () => {
    expect(pickEditionPages([alianza, runas], "ed-alianza")).toBe(736);
  });

  it("cae en la primaria cuando el pase no fija edición", () => {
    expect(pickEditionPages([alianza, runas], null)).toBe(684);
  });

  it("devuelve null sin ediciones, para que mande books.total_pages", () => {
    expect(pickEditionPages([], "ed-alianza")).toBeNull();
  });

  it("devuelve null cuando ninguna edición tiene páginas", () => {
    expect(pickEditionPages([{ ...alianza, total_pages: null }], "ed-alianza")).toBeNull();
  });

  // El caso de «El Imperio Final» en prod: primaria sin páginas, pase sin
  // edición fijada y una hermana que sí las tiene. Antes caía en "sin estimar".
  it("usa cualquier edición con páginas si el pase y la primaria no las traen", () => {
    const sinPaginas = { id: "ed-primaria", total_pages: null, is_primary: true };
    expect(pickEditionPages([sinPaginas, alianza], null)).toBe(736);
  });
});
