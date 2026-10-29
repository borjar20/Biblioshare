// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { deriveIndexAtlas, orderedSagas, type IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import { IndexList } from "./index-list";

afterEach(cleanup);

const card = (id: string, extra: Partial<SagaIndexCard> = {}): SagaIndexCard => ({
  id, name: `Saga ${id}`, coverUrl: null, accent: "terracota", titleCount: 3, children: [], creator: null,
  typeBreakdown: { book: 3, movie: 0, series: 0 }, hasGraph: false, routeCount: 0,
  progress: { completed: 0, total: 3, pct: 0, readingLabel: null }, ownedCount: 0, isFollowed: false,
  started: false, lastTouchedAt: null, ...extra,
});

function show(cards: SagaIndexCard[], dimmed: (s: IndexAtlasSaga) => boolean = () => false) {
  const model = deriveIndexAtlas(cards, true);
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <IndexList model={model} dimmed={dimmed} insets={{ top: 80, bottom: 60 }} />
    </NextIntlClientProvider>,
  );
  return model;
}

const cards = [
  card("a", { started: true, progress: { completed: 1, total: 3, pct: 33, readingLabel: null } }),
  card("b", { isFollowed: true }),
  card("p", { typeBreakdown: { book: 0, movie: 2, series: 0 } }),
  card("l"),
];

describe("IndexList", () => {
  it("un h2 por zona, en orden, con su recuento", () => {
    show(cards);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "En curso · 1", "Sigues · 1", "Por descubrir · 2",
    ]);
  });
  it("en «Por descubrir», un h3 por comarca", () => {
    show(cards);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Libros", "Películas"]);
  });
  it("los enlaces de saga siguen el orden de orderedSagas", () => {
    const model = show(cards);
    const hrefs = [...document.querySelectorAll("li[data-saga-id] > a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(orderedSagas(model).map((s) => `/saga/${s.id}`));
  });
  it("nombre, número de títulos y avance", () => {
    show(cards);
    const link = document.querySelector('a[href="/saga/a"]')!;
    expect(link.textContent).toContain("Saga a");
    expect(link.textContent).toContain("3 títulos");
    expect(link.textContent).toContain("Llevas 1 de 3");
  });
  it("las subsagas son una sublista de enlaces", () => {
    show([card("u", { children: [{ id: "k1", name: "Hija", accent: "beige", titleCount: 1 }] })]);
    const sub = document.querySelector('li[data-saga-id="u"] ul a');
    expect(sub?.getAttribute("href")).toBe("/saga/k1");
    expect(sub?.textContent).toContain("Hija");
  });
  it("una saga atenuada lleva data-dimmed y el texto oculto, y sigue en la lista", () => {
    show(cards, (s) => s.id === "b");
    const li = document.querySelector('li[data-saga-id="b"]')!;
    expect(li.hasAttribute("data-dimmed")).toBe(true);
    expect(li.textContent).toContain("(no coincide con los filtros)");
    expect(document.querySelector('li[data-saga-id="a"]')!.hasAttribute("data-dimmed")).toBe(false);
    expect(document.querySelector('li[data-saga-id="a"]')!.textContent).not.toContain("no coincide");
  });
  it("es una región con nombre", () => {
    show(cards);
    expect(screen.getByRole("region", { name: "Sagas en lista" })).toBeTruthy();
  });
});
