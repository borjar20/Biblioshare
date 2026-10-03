// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { BottomNav } from "./bottom-nav";
import { TopNav } from "./top-nav";
import { UserMenu } from "./user-menu";

beforeEach(() => { pathname = "/"; });
afterEach(cleanup);

describe("destinos de la navegación principal", () => {
  for (const [name, Component] of [["móvil", BottomNav], ["escritorio", TopNav]] as const) {
    it(`${name}: descubre experiencias y comunidad sin pasar por el perfil`, () => {
      render(<Component username="ana" />);
      expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        "/", "/coleccion", "/experiencias", "/comunidad", "/buscar",
      ]);
      expect(screen.queryByRole("link", { name: "profile" })).toBeNull();
    });

    it(`${name}: un visitante no recibe destinos privados`, () => {
      render(<Component username={null} />);
      const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
      expect(hrefs).toContain("/comunidad");
      expect(hrefs).toContain("/buscar");
      expect(hrefs).not.toContain("/coleccion");
      expect(hrefs).not.toContain("/experiencias");
      expect(hrefs.some((href) => href?.startsWith("/u/"))).toBe(false);
    });
  }

  it.each(["/experiencia/recuerdo", "/experiencia/recuerdo/editar", "/experiencias/nueva"])("%s mantiene Experiencias como destino activo", (route) => {
    pathname = route;
    render(<BottomNav username="ana" />);
    expect(screen.getByRole("link", { name: "experiences" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it.each(["/comunidad", "/clubes", "/club/club-lector", "/club/club-lector/miembros"])("%s permanece dentro de Comunidad", (route) => {
    pathname = route;
    render(<TopNav username="ana" />);
    expect(screen.getByRole("link", { name: "community" }).getAttribute("aria-current")).toBe("page");
  });

  it.each(["/coleccion/rincon", "/coleccion/c/lista", "/notas", "/estadisticas"])("%s conserva Biblioteca como área de sus herramientas", (route) => {
    pathname = route;
    render(<TopNav username="ana" />);
    expect(screen.getByRole("link", { name: "collection" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it.each(["/experiencia-ajena", "/club-ajeno", "/notas-ajenas"])("%s no activa un área por un prefijo ambiguo", (route) => {
    pathname = route;
    render(<TopNav username="ana" />);
    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(0);
  });

  it.each(["/partida/activa", "/mascota", "/post/hilo"])("cede el borde inferior en %s", (route) => {
    pathname = route;
    render(<BottomNav username="ana" />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("el avatar entra directamente al perfil y no abre un menú de funciones", () => {
    render(<UserMenu username="ana" avatarUrl={null} />);
    const avatar = screen.getByRole("link", { name: "you.profile" });
    expect(avatar.getAttribute("href")).toBe("/u/ana");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
