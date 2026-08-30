import { describe, expect, it } from "vitest";
import { isFullscreenRoute } from "./fullscreen-routes";

describe("rutas que se comen el marco de la app", () => {
  it("el tablero sí: es la única pantalla que quita topbar y barra de cinco", () => {
    expect(isFullscreenRoute("/partida/activa")).toBe(true);
  });

  it("los hubs de Partidas NO: la subapp empieza dentro del marco", () => {
    // El corte entre «configurar» y «jugar» es justo este.
    expect(isFullscreenRoute("/partidas")).toBe(false);
    expect(isFullscreenRoute("/partidas/mtg")).toBe(false);
    expect(isFullscreenRoute("/partidas/mtg/nueva")).toBe(false);
  });

  it("no se lleva por delante rutas que empiezan igual", () => {
    // `/partidas` comparte prefijo con `/partida`: comparar con startsWith a secas
    // dejaría los hubs sin navegación.
    expect(isFullscreenRoute("/partidas/mtg")).toBe(false);
    expect(isFullscreenRoute("/")).toBe(false);
    expect(isFullscreenRoute("/post/123")).toBe(false);
  });
});
