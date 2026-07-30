import { describe, expect, it } from "vitest";
import { resolveEffectiveType, ALL_TYPES_PARAM } from "./effective-type";
import type { ItemType } from "@/lib/catalog/types";

describe("resolveEffectiveType", () => {
  it("un tipo válido en la URL manda", () => {
    expect(resolveEffectiveType("book", [])).toBe("book");
    expect(resolveEffectiveType("movie", ["book"])).toBe("movie");
    expect(resolveEffectiveType("series", ["book", "movie"])).toBe("series");
  });

  // El bug (issue #313): con un único interés, "Todos los tipos" no podía
  // escapar del preferido porque la ausencia de `type` era indistinguible del
  // arranque por defecto. El centinela lo hace explícito.
  it("el centinela 'todos' devuelve undefined AUNQUE haya un único interés", () => {
    expect(resolveEffectiveType(ALL_TYPES_PARAM, ["book"])).toBeUndefined();
    expect(resolveEffectiveType("todos", ["movie"])).toBeUndefined();
  });

  it("sin `type` y con exactamente un interés, arranca en ese interés", () => {
    expect(resolveEffectiveType(undefined, ["book"])).toBe("book");
    expect(resolveEffectiveType(undefined, ["series"])).toBe("series");
  });

  it("sin `type` y con dos o tres intereses, no fuerza ninguno (undefined)", () => {
    expect(resolveEffectiveType(undefined, ["book", "movie"])).toBeUndefined();
    expect(resolveEffectiveType(undefined, ["book", "movie", "series"])).toBeUndefined();
  });

  it("sin `type` y sin intereses, undefined", () => {
    expect(resolveEffectiveType(undefined, [])).toBeUndefined();
  });

  it("un `type` basura cae al comportamiento por defecto (preferido/todos)", () => {
    expect(resolveEffectiveType("xyz", ["book"])).toBe("book");
    expect(resolveEffectiveType("xyz", ["book", "movie"])).toBeUndefined();
  });

  it("ALL_TYPES_PARAM es 'todos' (en castellano como el resto de la URL)", () => {
    const _typed: ItemType[] = [];
    expect(ALL_TYPES_PARAM).toBe("todos");
    expect(_typed).toEqual([]);
  });
});
