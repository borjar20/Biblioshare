import { describe, expect, it } from "vitest";
import { legacyAtlasQuery, parseLens, parseRole } from "./lens";

describe("parseLens / parseRole", () => {
  it("desconocido → valor por defecto", () => {
    expect(parseLens(undefined)).toBe("orden");
    expect(parseLens("zzz")).toBe("orden");
    expect(parseLens("rol")).toBe("rol");
    expect(parseLens("publicacion")).toBe("publicacion");
    expect(parseRole("zzz")).toBeNull();
    expect(parseRole(undefined)).toBeNull();
    expect(parseRole("precuela")).toBe("precuela");
  });
});

describe("legacyAtlasQuery", () => {
  it("ruta=publicacion → lente=publicacion sin ruta", () => {
    expect(legacyAtlasQuery({ ruta: "publicacion" })?.toString()).toBe("lente=publicacion");
  });
  it("orden=publicacion → lente=publicacion sin orden", () => {
    expect(legacyAtlasQuery({ orden: "publicacion", ruta: "r1" })?.toString()).toBe("ruta=r1&lente=publicacion");
  });
  it("rol válido sin lente → lente=rol&rol", () => {
    expect(legacyAtlasQuery({ rol: "precuela" })?.toString()).toBe("lente=rol&rol=precuela");
  });
  it("sin cambios → null", () => {
    expect(legacyAtlasQuery({})).toBeNull();
    expect(legacyAtlasQuery({ ruta: "r1" })).toBeNull();
    expect(legacyAtlasQuery({ ruta: "r1", lente: "rol", rol: "precuela" })).toBeNull();
  });
});
