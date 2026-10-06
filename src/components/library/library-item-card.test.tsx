// @vitest-environment jsdom
import { NextIntlClientProvider } from "next-intl";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { LibraryItem } from "@/lib/library/types";
import type { ToggleFavoriteState } from "@/lib/library/favorite-actions";
import { LibraryItemCard } from "./library-item-card";

// Las acciones cruzan la frontera de servidor; la tarjeta, el hook optimista,
// la hoja y sus traducciones se ejercitan de verdad.
const actions = vi.hoisted(() => ({
  toggleFavorite: vi.fn(),
  getCollectionsForSheet: vi.fn(),
  createCollection: vi.fn(),
  setItemCollections: vi.fn(),
}));
vi.mock("@/lib/library/favorite-actions", () => ({ toggleFavorite: actions.toggleFavorite }));
vi.mock("@/lib/library/collection-actions", () => ({
  getCollectionsForSheet: actions.getCollectionsForSheet,
  createCollection: actions.createCollection,
  setItemCollections: actions.setItemCollections,
}));

const item: LibraryItem = {
  entryId: "entry-1",
  itemId: "work-1",
  itemType: "book",
  status: "in_progress",
  rating: 8,
  position: { page: 42 },
  notes: null,
  title: "La obra de prueba",
  coverUrl: "/cover.jpg",
  subtitle: "Autora de prueba",
  publisher: null,
  pageCount: 300,
  totalEpisodes: null,
  watchedEpisodes: null,
  upToDate: false,
  rereadCount: 1,
  pinnedOrder: null,
  activePassId: "pass-1",
};

function renderCard(props: Partial<Parameters<typeof LibraryItemCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <LibraryItemCard item={item} isOwner {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.toggleFavorite.mockResolvedValue({});
  actions.getCollectionsForSheet.mockResolvedValue({ collections: [] });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

describe("LibraryItemCard · presentación material", () => {
  it.each([
    { itemType: "book" as const, href: "/libro/work-1", label: "En curso", upToDate: false },
    { itemType: "movie" as const, href: "/pelicula/work-1", label: "En curso", upToDate: false },
    { itemType: "series" as const, href: "/serie/work-1", label: "Al día", upToDate: true },
  ])("$itemType: deja el estado fuera de la portada y las acciones fuera de sus enlaces", ({ itemType, href, label, upToDate }) => {
    renderCard({ item: { ...item, itemType, upToDate }, presentation: "material" });
    const coverLink = screen.getByRole("img", { name: item.title }).closest("a")!;
    const badge = screen.getByTestId("status-badge");
    // El badge no forma parte del objeto que contiene portada y controles:
    // volver a colocarlo como overlay ocultaría otra vez el arte.
    expect(coverLink.parentElement!.contains(badge)).toBe(false);
    expect(badge.closest("a")).toBeNull();
    expect(badge.textContent).toBe(label);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([href, href]);
    for (const name of ["Fijar en el perfil", "Añadir a colección"]) {
      const button = screen.getByRole("button", { name });
      expect(button.closest("a")).toBeNull();
      expect(coverLink.parentElement!.contains(button)).toBe(true);
    }
  });

  it("sin optar por material conserva el estado junto a la portada", () => {
    renderCard({ isOwner: false });
    const coverLink = screen.getByRole("img", { name: item.title }).closest("a")!;
    expect(coverLink.parentElement!.contains(screen.getByTestId("status-badge"))).toBe(true);
    expect(screen.getByTestId("status-badge").textContent).toBe("En curso");
    expect(screen.queryByRole("button", { name: "Fijar en el perfil" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir a colección" })).toBeNull();
  });

  it("conserva el pin confirmado al recibir las props revalidadas sin navegar a la ficha", async () => {
    let finish!: (result: ToggleFavoriteState) => void;
    actions.toggleFavorite.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const beforeClickUrl = window.location.href;
    const { rerender } = renderCard({ presentation: "material" });
    const pinButton = screen.getByRole("button", { name: "Fijar en el perfil" });
    expect(pinButton.closest("a")).toBeNull();

    fireEvent.click(pinButton);
    const optimisticButton = screen.getByRole("button", { name: "Quitar de fijados" });
    expect(optimisticButton.getAttribute("aria-pressed")).toBe("true");
    expect((optimisticButton as HTMLButtonElement).disabled).toBe(true);

    // Next entrega el estado revalidado de la acción junto con su resultado.
    // El pin confirmado debe sobrevivir cuando se asienta la transición.
    await act(async () => {
      rerender(
        <NextIntlClientProvider locale="es" messages={messages}>
          <LibraryItemCard item={{ ...item, pinnedOrder: 1 }} isOwner presentation="material" />
        </NextIntlClientProvider>,
      );
      finish({});
    });

    const confirmedButton = screen.getByRole("button", { name: "Quitar de fijados" });
    expect(confirmedButton.getAttribute("aria-pressed")).toBe("true");
    expect((confirmedButton as HTMLButtonElement).disabled).toBe(false);
    expect(confirmedButton.closest("a")).toBeNull();
    expect(actions.toggleFavorite).toHaveBeenCalledWith("entry-1");
    expect(window.location.href).toBe(beforeClickUrl);
    expect(screen.queryByText(messages.library.pinError)).toBeNull();
  });

  it("fija de forma optimista y revierte con el error del servidor", async () => {
    let finish!: (result: ToggleFavoriteState) => void;
    actions.toggleFavorite.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderCard({ presentation: "material" });
    fireEvent.click(screen.getByRole("button", { name: "Fijar en el perfil" }));
    const optimisticButton = screen.getByRole("button", { name: "Quitar de fijados" });
    expect(optimisticButton.getAttribute("aria-pressed")).toBe("true");
    expect((optimisticButton as HTMLButtonElement).disabled).toBe(true);
    expect(actions.toggleFavorite).toHaveBeenCalledWith("entry-1");
    await act(async () => { finish({ error: "maxReached" }); });
    expect(screen.getByRole("button", { name: "Fijar en el perfil" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(messages.library.pinError)).toBeTruthy();
  });

  it("abre la hoja de colecciones de la obra desde su control propio", async () => {
    renderCard({ item: { ...item, itemType: "movie" }, presentation: "material" });
    fireEvent.click(screen.getByRole("button", { name: "Añadir a colección" }));
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("open")).not.toBeNull());
    expect(actions.getCollectionsForSheet).toHaveBeenCalledWith("movie", "work-1");
    expect(screen.getByRole("dialog").closest("a")).toBeNull();
  });
});
