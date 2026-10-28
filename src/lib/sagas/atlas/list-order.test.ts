import { describe, expect, it } from "vitest";
import type { AtlasWork } from "./model";
import { listOrder } from "./list-order";

const work = (key: string, i: number, extra: Partial<AtlasWork> = {}): AtlasWork => ({
  key, title: key, href: `/libro/${key}`, coverUrl: null, state: "todo", role: null, optional: false, skipped: false,
  ownerSagaId: "s1", regionKey: "r1", readingNo: i + 1, readingIndex: i, year: null, extra: false, window: null,
  tandem: null, step: null, stepNote: null, ...extra,
});

// Desordenadas a propósito: el orden no puede depender del de entrada.
const works = [
  work("c", 2, { role: "relato", year: 1990 }),
  work("a", 0, { year: 2005 }),
  work("d", 3, { role: "precuela" }),
  work("b", 1, { role: "relato", year: 1990 }),
];
const keys = (ws: AtlasWork[]) => ws.map((w) => w.key);

describe("listOrder", () => {
  it("Orden: por readingIndex", () => {
    expect(keys(listOrder(works, "orden"))).toEqual(["a", "b", "c", "d"]);
  });

  it("Rol: por carril (principal, luego el orden de SAGA_ITEM_ROLES) y dentro por lectura", () => {
    expect(keys(listOrder(works, "rol"))).toEqual(["a", "d", "b", "c"]);
  });

  it("Publicación: por año (sin año al final) y a igual año por lectura", () => {
    expect(keys(listOrder(works, "publicacion"))).toEqual(["b", "c", "a", "d"]);
  });
});
