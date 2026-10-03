import { describe, expect, it } from "vitest";
import { getOwnCollectionAlias } from "./collection-alias";
import { resolveEffectiveType } from "@/lib/library/effective-type";

describe("alias de la colección propia (#1325)", () => {
  it("conserva movie aunque Biblioteca tenga un único interés book", () => {
    const destination = getOwnCollectionAlias(true, "coleccion", "movie");
    expect(destination).toBe("/coleccion?type=movie");
    const requestedType = new URL(destination!, "https://biblioshare.test").searchParams.get("type") ?? undefined;
    expect(resolveEffectiveType(requestedType, ["book"])).toBe("movie");
  });

  it.each([
    ["book", "/coleccion?type=book", "book"],
    ["series", "/coleccion?type=series", "series"],
    ["todos", "/coleccion?type=todos", undefined],
  ] as const)("conserva %s como elección explícita", (type, expectedDestination, expectedScope) => {
    const destination = getOwnCollectionAlias(true, "coleccion", type);
    expect(destination).toBe(expectedDestination);
    const requestedType = new URL(destination!, "https://biblioshare.test").searchParams.get("type") ?? undefined;
    expect(resolveEffectiveType(requestedType, ["book"])).toBe(expectedScope);
  });

  it.each([undefined, "", "invalid", "Movie", "movie&status=planned"])(
    "deja el default de Biblioteca cuando type es %s",
    (type) => {
      const destination = getOwnCollectionAlias(true, "coleccion", type);
      expect(destination).toBe("/coleccion");
      const requestedType = new URL(destination!, "https://biblioshare.test").searchParams.get("type") ?? undefined;
      expect(resolveEffectiveType(requestedType, ["book"])).toBe("book");
    },
  );

  it.each(["book", "movie", "series", "todos"])(
    "un visitante conserva el perfil visitado con type=%s",
    (type) => {
      expect(getOwnCollectionAlias(false, "coleccion", type)).toBeNull();
    },
  );

  it.each([undefined, "actividad", "panel"])(
    "no sustituye la navegación del dueño a tab=%s",
    (tab) => {
      expect(getOwnCollectionAlias(true, tab, "movie")).toBeNull();
    },
  );
});
