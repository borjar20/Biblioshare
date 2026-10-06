// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { LibraryItem } from "@/lib/library/types";
import { LibraryHighlights } from "./library-highlights";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: "profile" | "library" | "item.sessions") =>
    createTranslator({ locale: "es", messages, namespace }),
}));

afterEach(cleanup);

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    entryId: "entry-book",
    itemId: "book-1",
    itemType: "book",
    status: "in_progress",
    rating: null,
    position: { page: 24 },
    notes: null,
    title: "La isla de las voces",
    coverUrl: "/covers/book.jpg",
    subtitle: "Robert Louis Stevenson",
    publisher: null,
    pageCount: 120,
    totalEpisodes: null,
    watchedEpisodes: null,
    upToDate: false,
    rereadCount: 0,
    pinnedOrder: 0,
    activePassId: "pass-book",
    ...overrides,
  };
}

describe("LibraryHighlights", () => {
  it("presents every favorite with equal cards and keeps their linked order", async () => {
    const favorites = [
      item({ status: "completed" }),
      item({ entryId: "entry-movie", itemId: "movie-2", itemType: "movie", title: "El espíritu de la colmena", subtitle: null, pinnedOrder: 1 }),
      item({ entryId: "entry-series", itemId: "series-3", itemType: "series", title: "Detectorists", subtitle: null, pinnedOrder: 2 }),
      item({ entryId: "entry-book-4", itemId: "book-4", title: "Los inconsolables", subtitle: null, pinnedOrder: 3 }),
      item({ entryId: "entry-movie-5", itemId: "movie-5", itemType: "movie", title: "El sur", subtitle: null, pinnedOrder: 4 }),
      item({ entryId: "entry-book-6", itemId: "book-6", title: "Solaris", subtitle: null, pinnedOrder: 5 }),
    ];

    render(await LibraryHighlights({ items: favorites }));

    expect(screen.getAllByRole("heading", { name: "Destacados" })).toHaveLength(1);
    const cards = within(screen.getByRole("list")).getAllByRole("article");
    expect(cards).toHaveLength(6);
    expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual([
      "La isla de las voces", "El espíritu de la colmena", "Detectorists", "Los inconsolables", "El sur", "Solaris",
    ]);
    expect(new Set(cards.map((card) => card.className)).size).toBe(1);
    expect(cards.map((card) => within(card).getByRole("link", { name: "Ver ficha" }).getAttribute("href"))).toEqual([
      "/libro/book-1", "/pelicula/movie-2", "/serie/series-3", "/libro/book-4", "/pelicula/movie-5", "/libro/book-6",
    ]);
    for (const card of cards) {
      expect(within(card).getByText(/Completado|En curso/)).toBeTruthy();
    }
  });

  it("offers session registration for eligible favorites after the first item", async () => {
    render(await LibraryHighlights({ items: [
      item({ itemType: "movie", status: "completed", title: "Primera película" }),
      item({ entryId: "entry-second", itemId: "book-2", title: "Segundo libro", activePassId: "pass-second" }),
      item({ entryId: "entry-third", itemId: "series-3", itemType: "series", title: "Tercera serie", activePassId: "pass-third" }),
    ] }));

    expect(within(screen.getByRole("article", { name: "Primera película" })).queryByRole("link", { name: "Registrar sesión" })).toBeNull();
    expect(within(screen.getByRole("article", { name: "Segundo libro" })).getByRole("link", { name: "Registrar sesión" }).getAttribute("href")).toBe("/sesion/pass-second");
    expect(within(screen.getByRole("article", { name: "Tercera serie" })).getByRole("link", { name: "Registrar sesión" }).getAttribute("href")).toBe("/sesion/pass-third");
  });

  it.each(["book", "series"] as const)("offers session registration for an in-progress %s with its active pass", async (itemType) => {
    render(await LibraryHighlights({ items: [item({ itemType })] }));
    expect(screen.getByRole("link", { name: "Registrar sesión" }).getAttribute("href")).toBe("/sesion/pass-book");
  });

  it.each([
    { status: "planned" as const },
    { status: "completed" as const },
    { status: "dropped" as const },
    { activePassId: null },
    { activePassId: "" },
    { activePassId: "   " },
    { itemType: "movie" as const },
  ])("keeps session registration unavailable for $status $activePassId $itemType", async (overrides) => {
    render(await LibraryHighlights({ items: [item(overrides)] }));
    expect(screen.queryByRole("link", { name: "Registrar sesión" })).toBeNull();
  });

  it("announces an up-to-date series using its actual follow state", async () => {
    render(await LibraryHighlights({ items: [item({ itemType: "series", upToDate: true })] }));
    expect(screen.getByText("Al día")).toBeTruthy();
    expect(screen.queryByText("En curso")).toBeNull();
  });

  it("keeps a favorite with no cover identifiable and linked", async () => {
    render(await LibraryHighlights({ items: [item({ coverUrl: null, subtitle: null })] }));
    expect(screen.getByRole("heading", { name: "La isla de las voces" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver ficha" }).getAttribute("href")).toBe("/libro/book-1");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders nothing when there are no favorites", async () => {
    const { container } = render(await LibraryHighlights({ items: [] }));
    expect(container.innerHTML).toBe("");
  });
});
