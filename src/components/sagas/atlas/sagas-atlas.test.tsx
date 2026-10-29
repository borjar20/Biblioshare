// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
});
