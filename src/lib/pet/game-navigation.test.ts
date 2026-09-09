import { describe, expect, it } from "vitest";
import { petSection, safePetReturn, isPetRoute } from "./game-navigation";

describe("pet game navigation", () => {
  it("validates views and keeps explicit camp", () => {
    expect(petSection("bag")).toBe("bag");
    expect(petSection("camp")).toBe("camp");
    expect(petSection("invented")).toBe("camp");
    expect(petSection(null)).toBe("camp");
  });
  it("keeps return URLs inside the app and outside game/auth/actions", () => {
    for (const bad of ["//example.com", "https://example.com", "javascript:alert(1)", "/\\example.com", "/mascota?view=bag", "/login", "/onboarding", "/api/logout", "/auth/callback", "/logout", "/%2fexample.com", " /coleccion"]) {
      expect(safePetReturn(bad), bad).toBe("/");
    }
    expect(safePetReturn("/coleccion?tipo=book")).toBe("/coleccion?tipo=book");
    expect(safePetReturn("/libro/123#notas")).toBe("/libro/123#notas");
  });
  it("matches only the mascot route boundary", () => {
    expect(isPetRoute("/mascota")).toBe(true);
    expect(isPetRoute("/mascota/diario")).toBe(true);
    expect(isPetRoute("/mascotas")).toBe(false);
    expect(isPetRoute("/admin/mascota")).toBe(false);
  });
});
