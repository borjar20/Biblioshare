import { describe, expect, it } from "vitest";
import { pickEditionPages } from "./fetch-catalog-meta";

const alianza = { id: "ed-alianza", total_pages: 736 };
const runas = { id: "ed-runas", total_pages: 684 };

// Precedencia de DOS peldaños (spec 2026-08-26 §5): la edición identificada en
// el pase → `books.total_pages`. Hasta la Task 12 esta función tenía dos
// peldaños propios en medio —la «edición primaria» y «cualquier edición con
// páginas»— y era el ÚNICO consumidor con una precedencia distinta a la del
// resto de la app: el mismo libro salía con 736 páginas en el sorteo y con 684
// en la barra de progreso.
describe("pickEditionPages", () => {
  it("manda la edición identificada en el pase, no la obra", () => {
    expect(pickEditionPages([alianza, runas], "ed-alianza", 1200)).toBe(736);
  });

  it("cae en las páginas de la obra cuando el pase no fija edición", () => {
    expect(pickEditionPages([alianza, runas], null, 1200)).toBe(1200);
  });

  it("NO usa una edición hermana cuando el pase no fija ninguna", () => {
    // El caso que antes devolvía 736 por el peldaño «cualquiera con páginas».
    expect(pickEditionPages([alianza, runas], null, null)).toBeNull();
  });

  it("la edición del pase sin páginas cae a la obra, no a una hermana", () => {
    const sinPaginas = { id: "ed-sin", total_pages: null };
    expect(pickEditionPages([sinPaginas, alianza], "ed-sin", 1200)).toBe(1200);
  });

  it("una edición del pase que ya no existe cae a la obra", () => {
    expect(pickEditionPages([alianza], "ed-borrada", 1200)).toBe(1200);
  });

  it("null sin ediciones y sin páginas de la obra", () => {
    expect(pickEditionPages([], "ed-alianza", null)).toBeNull();
  });
});
