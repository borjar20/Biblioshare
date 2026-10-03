// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SectionTabs } from "./section-tabs";

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
afterEach(cleanup);

describe("pestañas públicas del perfil", () => {
  it("el dueño solo tiene Actividad y Experiencias", async () => {
    render(await SectionTabs({ active: "actividad", basePath: "/u/mar", isOwner: true }));
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["actividad", "experiencias"]);
    expect(screen.getByRole("link", { name: "actividad" }).getAttribute("aria-current")).toBe("page");
  });

  it("el visitante mantiene Biblioteca y no recibe herramientas personales", async () => {
    render(await SectionTabs({ active: "coleccion", basePath: "/u/mar", isOwner: false }));
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/u/mar?tab=actividad", "/u/mar?tab=experiencias", "/u/mar?tab=coleccion",
    ]);
    expect(screen.getByRole("link", { name: "coleccion" }).getAttribute("aria-current")).toBe("page");
  });
});
