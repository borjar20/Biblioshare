// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedEntry, FeedPage } from "@/lib/social/feed";

const loadMoreFeed = vi.fn<(cursor: string | null) => Promise<FeedPage>>();
vi.mock("@/lib/social/feed-actions", () => ({
  loadMoreFeed: (cursor: string | null) => loadMoreFeed(cursor),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
// La tarjeta no es lo que se prueba: basta con que cada evento deje rastro.
vi.mock("./feed-item", () => ({
  FeedItem: ({ entry }: { entry: FeedEntry }) => <article data-testid="feed-item">{entry.id}</article>,
}));

import { FeedList } from "./feed-list";

type IOCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let fire: IOCallback = () => {};
let observers = 0;

beforeEach(() => {
  observers = 0;
  loadMoreFeed.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IOCallback) {
        fire = cb;
        observers++;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entry = (id: string) => ({ id }) as FeedEntry;

function renderList(cursor: string | null = "c1") {
  return render(
    <FeedList
      initialEvents={[entry("e1")]}
      initialCursor={cursor}
      initialKnownUsernames={[]}
      viewerLoggedIn
    />,
  );
}

describe("FeedList · scroll infinito", () => {
  it("carga la página siguiente cuando el centinela entra en pantalla", async () => {
    loadMoreFeed.mockResolvedValue({ events: [entry("e2")], nextCursor: null, knownUsernames: [] });
    renderList();
    await act(async () => fire([{ isIntersecting: true }]));
    expect(loadMoreFeed).toHaveBeenCalledWith("c1");
    expect(screen.getAllByTestId("feed-item").map((n) => n.textContent)).toEqual(["e1", "e2"]);
    // Sin cursor no queda nada que observar ni que animar.
    expect(screen.queryByTestId("feed-sentinel")).toBeNull();
    expect(screen.queryByTestId("feed-loading")).toBeNull();
  });

  it("con más por cargar enseña la animación, no un botón", () => {
    renderList();
    expect(screen.getByTestId("feed-loading")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("no carga mientras el centinela no está a la vista", async () => {
    renderList();
    await act(async () => fire([{ isIntersecting: false }]));
    expect(loadMoreFeed).not.toHaveBeenCalled();
  });

  it("sin cursor no monta el observador", () => {
    renderList(null);
    expect(observers).toBe(0);
    expect(screen.queryByTestId("feed-sentinel")).toBeNull();
  });

  it("si la carga falla deja de reintentar sola y cambia la animación por un reintento", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loadMoreFeed.mockRejectedValue(new Error("red"));
    renderList();
    await act(async () => fire([{ isIntersecting: true }]));
    const afterFailure = observers;
    await act(async () => {});
    expect(observers).toBe(afterFailure); // no se re-observa: sin bucle
    expect(loadMoreFeed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("feed-loading")).toBeNull();
    const retry = screen.getByRole("button", { name: "loadMoreRetry" });

    // El reintento manual vuelve a pedir la página y devuelve la animación.
    loadMoreFeed.mockResolvedValue({ events: [entry("e2")], nextCursor: "c2", knownUsernames: [] });
    await act(async () => retry.click());
    expect(loadMoreFeed).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("feed-loading")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
