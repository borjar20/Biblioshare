import { describe, expect, it } from "vitest";
import { resolveActiveRoute } from "./resolve-active-route";

const detail = {
  routes: [{ slug: "lectura" }, { slug: "publicacion" }, { slug: "cronologico" }] as never,
  routeChoice: "cronologico",
};

describe("resolveActiveRoute", () => {
  it("?ruta= conocida manda", () => expect(resolveActiveRoute(detail, { ruta: "publicacion" })).toBe("publicacion"));
  it("compatibilidad con ?orden=publicacion", () => expect(resolveActiveRoute({ ...detail, routeChoice: null }, { orden: "publicacion" })).toBe("publicacion"));
  it("sin parámetros, la adoptada", () => expect(resolveActiveRoute(detail, {})).toBe("cronologico"));
  it("slug desconocido degrada a la adoptada y, sin ella, a la primera", () => {
    expect(resolveActiveRoute(detail, { ruta: "borrada" })).toBe("cronologico");
    expect(resolveActiveRoute({ ...detail, routeChoice: null }, { ruta: "borrada" })).toBe("lectura");
  });
});
