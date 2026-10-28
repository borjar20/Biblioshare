// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { renderSagasAtlas } from "./sagas-atlas-test-harness.test-utils";

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
});
