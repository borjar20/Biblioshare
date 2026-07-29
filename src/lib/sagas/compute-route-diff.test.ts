import { describe, expect, it } from "vitest";
import { computeRouteDiff } from "./compute-route-diff";

const e = (key: string, note: string | null = null) => ({ key, note });

describe("computeRouteDiff", () => {
  it("sin cambios: todo a cero", () => {
    const initial = [e("i:book:a"), e("i:book:b")];
    const diff = computeRouteDiff(initial, initial.map((x) => ({ ...x })));
    expect(diff).toEqual({ added: 0, removed: 0, moved: 0, noted: 0, total: 0 });
  });

  it("un paso añadido", () => {
    const initial = [e("i:book:a")];
    const draft = [e("i:book:a"), e("i:book:b")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 1, removed: 0, moved: 0, noted: 0, total: 1 });
  });

  it("un paso quitado", () => {
    const initial = [e("i:book:a"), e("i:book:b")];
    const draft = [e("i:book:a")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 1, moved: 0, noted: 0, total: 1 });
  });

  it("un intercambio adyacente cuenta como 1 movido, no 2", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c")];
    const draft = [e("i:book:b"), e("i:book:a"), e("i:book:c")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 0, moved: 1, noted: 0, total: 1 });
  });

  it("mover el primero al final cuenta como 1 movido", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c"), e("i:book:d")];
    const draft = [e("i:book:b"), e("i:book:c"), e("i:book:d"), e("i:book:a")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 0, moved: 1, noted: 0, total: 1 });
  });

  it("borrar un paso NO cuenta como movidos a los que le seguían", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c")];
    const draft = [e("i:book:b"), e("i:book:c")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 1, moved: 0, noted: 0, total: 1 });
  });

  it("nota creada, editada y borrada cuentan como 'noted'", () => {
    const initial = [e("i:book:a", null), e("i:book:b", "vieja"), e("i:book:c", "igual")];
    const draft = [e("i:book:a", "nueva"), e("i:book:b", "editada"), e("i:book:c", "igual")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 0, moved: 0, noted: 2, total: 2 });
  });

  it("combinación: 1 movido + 1 nota nueva + 1 quitado, como en el mockup", () => {
    const initial = [e("i:book:a"), e("i:book:b"), e("i:book:c")];
    const draft = [e("i:book:b", "nota nueva"), e("i:book:a")];
    expect(computeRouteDiff(initial, draft)).toEqual({ added: 0, removed: 1, moved: 1, noted: 1, total: 3 });
  });
});
