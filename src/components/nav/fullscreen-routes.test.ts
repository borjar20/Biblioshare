import { describe, expect, it } from "vitest";
import { isFullscreenRoute } from "./fullscreen-routes";

describe("rutas que se comen el marco de la app", () => {
  it("el juego de mascota tiene su propio regreso y navegación", () => {
    expect(isFullscreenRoute("/mascota")).toBe(true);
    expect(isFullscreenRoute("/mascota/diario")).toBe(true);
    expect(isFullscreenRoute("/mascotas")).toBe(false);
    expect(isFullscreenRoute("/admin/mascota")).toBe(false);
  });
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

  it("Entre nosotros es un atlas a pantalla completa, pero no el resto de Comunidad", () => {
    expect(isFullscreenRoute("/comunidad/entre-nosotros")).toBe(true);
    expect(isFullscreenRoute("/comunidad")).toBe(false);
    expect(isFullscreenRoute("/comunidad/entre-nosotros-x")).toBe(false);
  });

  it("el atlas de una saga sí, pero no su editor ni la ficha", () => {
    expect(isFullscreenRoute("/saga/x/mapa")).toBe(true);
    expect(isFullscreenRoute("/saga/x/mapa/editar")).toBe(false);
    expect(isFullscreenRoute("/saga/x")).toBe(false);
    expect(isFullscreenRoute("/saga/x/mapas")).toBe(false);
  });

  it("/sagas es pantalla completa; /sagas/nueva no", () => {
    expect(isFullscreenRoute("/sagas")).toBe(true);
    expect(isFullscreenRoute("/sagas/nueva")).toBe(false);
  });
});
