// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { followSaga } from "@/lib/sagas/follow-actions";
import { renderSagasAtlas } from "./sagas-atlas-test-harness.test-utils";

vi.mock("@/lib/sagas/follow-actions", () => ({ followSaga: vi.fn(async () => {}), unfollowSaga: vi.fn(async () => {}) }));

const card = (id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard => ({
  id, name: `Saga ${id}`, coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
  typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
  progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
  started: false, lastTouchedAt: null, ...extra,
});

describe("SagasAtlas", () => {
  it("pinta una zona por territorio y cada saga en la suya", () => {
    renderSagasAtlas({ cards: [card("a", { started: true }), card("b", { isFollowed: true }), card("c")], authenticated: true });
    expect([...document.querySelectorAll("[data-zone]")].map((z) => z.getAttribute("data-zone"))).toEqual(["en-curso", "sigues", "por-descubrir"]);
    expect(document.querySelector('[data-saga-id="b"]')?.getAttribute("data-zone-of")).toBe("sigues");
  });
  it("barra superior: eyebrow y resumen", () => {
    renderSagasAtlas({ cards: [card("a", { started: true }), card("b", { isFollowed: true })], authenticated: true });
    const top = document.querySelector('header[data-atlas-chrome="top"]')!;
    expect(top.textContent).toContain("Atlas · 2 sagas");
    expect(top.textContent).toContain("En curso: Saga a");
    expect(top.textContent).toContain("sigues 1");
  });
  it("sin sesión: zonas por tipo y resumen de catálogo", () => {
    renderSagasAtlas({ cards: [card("a"), card("p", { typeBreakdown: { book: 0, movie: 2, series: 0 } })], authenticated: false });
    expect([...document.querySelectorAll("[data-zone]")].map((z) => z.getAttribute("data-zone"))).toEqual(["libros", "peliculas"]);
    expect(screen.getByText("2 sagas · 0 universos")).toBeTruthy();
  });
  it("cada saga es un botón con nombre accesible", () => {
    renderSagasAtlas({ cards: [card("a")], authenticated: true });
    expect(screen.getByRole("button", { name: "Saga a, 3 títulos" })).toBeTruthy();
  });
  it("una saga con portada pinta una imagen", () => {
    renderSagasAtlas({ cards: [card("a", { coverUrl: "https://example.com/a.jpg" })], authenticated: true });
    expect(document.querySelector('[data-saga-id="a"] img')).toBeTruthy();
  });
  it("una subsaga de universo es un enlace fuera del orden de tabulación", () => {
    renderSagasAtlas({
      cards: [card("u", { children: [{ id: "k1", name: "Hija", accent: "beige", titleCount: 1 }] })],
      authenticated: true,
    });
    const link = document.querySelector('a[href="/saga/k1"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute("tabindex")).toBe("-1");
  });

  describe("mini-ficha", () => {
    const zoneOf = (id: string) => document.querySelector(`[data-saga-id="${id}"]`)?.getAttribute("data-zone-of");

    it("Enter sobre una saga abre su diálogo", () => {
      renderSagasAtlas({ cards: [card("a")], authenticated: true });
      fireEvent.click(screen.getByRole("button", { name: "Saga a, 3 títulos" }));
      expect(screen.getByRole("dialog", { name: "Saga a" })).toBeTruthy();
    });
    it("«Seguir» mueve la saga a «Sigues» antes de que resuelva la acción", async () => {
      let resolve!: () => void;
      vi.mocked(followSaga).mockImplementationOnce(() => new Promise<void>((r) => (resolve = r)));
      renderSagasAtlas({ cards: [card("a")], authenticated: true });
      expect(zoneOf("a")).toBe("por-descubrir");
      fireEvent.click(screen.getByRole("button", { name: "Saga a, 3 títulos" }));
      fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
      expect(followSaga).toHaveBeenCalledWith("a");
      expect(zoneOf("a")).toBe("sigues");
      // La ficha sigue abierta y ahora dice «Sigues».
      expect(screen.getByRole("button", { name: "Sigues" }).getAttribute("aria-pressed")).toBe("true");
      await act(async () => resolve());
      expect(zoneOf("a")).toBe("sigues");
    });
    it("si la acción falla, la saga vuelve a su zona y aparece el aviso", async () => {
      vi.mocked(followSaga).mockImplementationOnce(() => Promise.reject(new Error("rls")));
      renderSagasAtlas({ cards: [card("a")], authenticated: true });
      fireEvent.click(screen.getByRole("button", { name: "Saga a, 3 títulos" }));
      fireEvent.click(screen.getByRole("button", { name: "Seguir" }));
      await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
      expect(zoneOf("a")).toBe("por-descubrir");
    });
  });

  describe("buscador y filtros", () => {
    const movie = { book: 0, movie: 3, series: 0 };
    const dimmed = (id: string) => document.querySelector(`[data-saga-id="${id}"]`)?.hasAttribute("data-dimmed");
    it("el filtro de la URL atenúa lo que no cumple", () => {
      renderSagasAtlas({ cards: [card("a"), card("p", { typeBreakdown: movie })], authenticated: true, search: "tipo=pelicula" });
      expect(dimmed("a")).toBe(true);
      expect(dimmed("p")).toBe(false);
    });
    it("pulsar un filtro escribe la URL sin router", () => {
      const spy = vi.spyOn(window.history, "replaceState");
      renderSagasAtlas({ cards: [card("a"), card("p", { typeBreakdown: movie })], authenticated: true });
      fireEvent.click(screen.getByRole("button", { name: "Películas" }));
      expect(spy).toHaveBeenCalledWith(null, "", "/sagas?tipo=pelicula");
      expect(dimmed("a")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
      expect(spy).toHaveBeenLastCalledWith(null, "", "/sagas");
      spy.mockRestore();
    });
    it("escribir en el buscador atenúa y elegir abre la ficha de la raíz", () => {
      renderSagasAtlas({
        cards: [card("a", { name: "Dune" }), card("u", { name: "Mundodisco", children: [{ id: "k1", name: "La Guardia", accent: "beige", titleCount: 1 }] })],
        authenticated: true,
      });
      const input = screen.getByRole("combobox");
      fireEvent.change(input, { target: { value: "guard" } });
      expect(dimmed("a")).toBe(true);
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByRole("dialog", { name: "Mundodisco" })).toBeTruthy();
    });
    it("sin coincidencias, la barra ofrece quitar filtros", () => {
      renderSagasAtlas({ cards: [card("a")], authenticated: true, search: "tipo=serie" });
      const top = document.querySelector('header[data-atlas-chrome="top"]') as HTMLElement;
      expect(top.textContent).toContain("Ninguna saga cumple los filtros");
      fireEvent.click(within(top).getByRole("button", { name: "Quitar filtros" }));
      expect(dimmed("a")).toBe(false);
    });
  });

  describe("vista de lista", () => {
    const plane = () => document.querySelector("[data-atlas-stage]") as HTMLElement;
    it("«Ver como lista» muestra la lista, aria-pressed y deja el plano inerte; otra pulsación vuelve", () => {
      renderSagasAtlas({ cards: [card("a")], authenticated: true });
      expect(screen.queryByRole("region", { name: "Sagas en lista" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Ver como lista" }));
      expect(screen.getByRole("region", { name: "Sagas en lista" })).toBeTruthy();
      expect(plane().hasAttribute("inert")).toBe(true);
      const back = screen.getByRole("button", { name: "Ver el mapa" });
      expect(back.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(back);
      expect(screen.queryByRole("region", { name: "Sagas en lista" })).toBeNull();
      expect(plane().hasAttribute("inert")).toBe(false);
    });
    it("abrir la lista cierra la mini-ficha", () => {
      renderSagasAtlas({ cards: [card("a")], authenticated: true });
      fireEvent.click(screen.getByRole("button", { name: "Saga a, 3 títulos" }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Ver como lista" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    it("elegir en el buscador con la lista abierta vuelve al mapa y abre la ficha de esa saga", () => {
      renderSagasAtlas({ cards: [card("a", { name: "Dune" }), card("b", { name: "Mundodisco" })], authenticated: true });
      fireEvent.click(screen.getByRole("button", { name: "Ver como lista" }));
      const input = screen.getByRole("combobox");
      fireEvent.change(input, { target: { value: "mundo" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(screen.getByRole("button", { name: "Ver como lista" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.queryByRole("region", { name: "Sagas en lista" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "Mundodisco" })).toBeTruthy();
    });
    it("Tab desde la barra superior llega a la primera saga en orden de lista", () => {
      renderSagasAtlas({ cards: [card("a"), card("b", { started: true })], authenticated: true });
      // jsdom no mueve el foco con Tab: se comprueba el orden de tabulación (orden DOM sin tabindex negativo).
      const tabbable = [...document.querySelectorAll<HTMLElement>("a[href], button, input")].filter((e) => e.tabIndex >= 0);
      const lastOfTop = tabbable.filter((e) => e.closest('header[data-atlas-chrome="top"]')).pop()!;
      const next = tabbable[tabbable.indexOf(lastOfTop) + 1];
      expect(next.dataset.sagaId).toBe("b"); // «En curso» va antes que «Por descubrir»
      const sagasInOrder = tabbable.filter((e) => e.matches("button[data-saga-id]")).map((e) => e.dataset.sagaId);
      expect(sagasInOrder).toEqual(["b", "a"]);
    });
  });

  describe("sin sagas", () => {
    it("muestra el estado vacío y, con permiso, «Nueva saga»", () => {
      renderSagasAtlas({ cards: [], authenticated: true, canCurate: true });
      expect(screen.getByText("Sin sagas")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Nueva saga" }).getAttribute("href")).toBe("/sagas/nueva");
      expect(document.querySelector("[data-zone]")).toBeNull();
    });
    it("sin permiso no hay enlace", () => {
      renderSagasAtlas({ cards: [], authenticated: true });
      expect(screen.queryByRole("link", { name: "Nueva saga" })).toBeNull();
    });
  });
  it("con permiso, la barra lleva «Nueva saga»", () => {
    renderSagasAtlas({ cards: [card("a")], authenticated: true, canCurate: true });
    expect(screen.getByRole("link", { name: "Nueva saga" }).getAttribute("href")).toBe("/sagas/nueva");
  });
});
