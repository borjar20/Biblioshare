// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/experiencias";
let query = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
// La campana lee acciones de servidor y push nativo: fuera de este contrato de navegación.
vi.mock("@/components/social/notification-bell", () => ({ NotificationBell: () => null }));

import { Header } from "./header";

const signedIn = { loggedIn: true, username: "ana", avatarUrl: null, unreadCount: 3 };
beforeEach(() => { pathname = "/experiencias"; query = ""; });
afterEach(cleanup);

describe("accesos globales separados de la identidad", () => {
  it("ofrece Partidas, Mascota y Ajustes desde el chrome de cualquier sección", async () => {
    render(await Header(signedIn));
    expect(screen.getByRole("link", { name: "you.profile" }).getAttribute("href")).toBe("/u/ana");
    const trigger = screen.getByRole("button", { name: "moreLabel" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "moreLabel" });
    expect(within(menu).getAllByRole("menuitem").map((link) => link.getAttribute("href"))).toEqual([
      "/partidas", "/mascota", "/ajustes",
    ]);
    expect(within(menu).queryByRole("menuitem", { name: "you.profile" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "you.experiences" })).toBeNull();
  });

  it("abre con teclado, recorre destinos y Escape devuelve el foco al disparador", async () => {
    render(await Header(signedIn));
    const trigger = screen.getByRole("button", { name: "moreLabel" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const play = screen.getByRole("menuitem", { name: "you.play" });
    await waitFor(() => expect(document.activeElement).toBe(play));
    fireEvent.keyDown(play, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "you.pet" }));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "you.settings" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("cierra al seguir un enlace y al pulsar fuera", async () => {
    render(await Header(signedIn));
    const trigger = screen.getByRole("button", { name: "moreLabel" });
    fireEvent.click(trigger);
    const link = screen.getByRole("menuitem", { name: "you.play" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("cierra al cambiar de sección y no reaparece al volver a la anterior", async () => {
    const element = await Header(signedIn);
    const view = render(element);
    fireEvent.click(screen.getByRole("button", { name: "moreLabel" }));
    pathname = "/buscar";
    view.rerender(await Header(signedIn));
    expect(screen.queryByRole("menu")).toBeNull();
    pathname = "/experiencias";
    view.rerender(await Header(signedIn));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("cierra en cambios solo de query y al volver atrás o adelante entre esas vistas", async () => {
    pathname = "/comunidad";
    query = "";
    const view = render(await Header(signedIn));
    // La URL conserva pathname; cambia la vista por navegación o historial.
    for (const nextQuery of ["tab=personas", "", "tab=personas"]) {
      fireEvent.click(screen.getByRole("button", { name: "moreLabel" }));
      expect(screen.getByRole("menu")).toBeTruthy();
      query = nextQuery;
      view.rerender(await Header(signedIn));
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.getByRole("button", { name: "moreLabel" }).getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("un visitante conserva Partidas públicas sin descubrir Mascota ni Ajustes privados", async () => {
    render(await Header({ ...signedIn, loggedIn: false, username: null }));
    fireEvent.click(screen.getByRole("button", { name: "moreLabel" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((link) => link.getAttribute("href"))).toEqual(["/partidas"]);
    expect(screen.queryByRole("link", { name: "you.profile" })).toBeNull();
  });

  it("el onboarding no muestra navegación privada antes de tener identidad completa", async () => {
    render(await Header({ ...signedIn, username: null }));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "moreLabel" })).toBeNull();
    expect(screen.queryByRole("link", { name: "you.profile" })).toBeNull();
  });
});
