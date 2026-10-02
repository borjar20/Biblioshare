import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), create: vi.fn(), hydrate: vi.fn(), transition: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) },
  rpc: mocks.rpc,
}) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateSearch: vi.fn() }));
vi.mock("@/lib/catalog/find-or-create", () => ({ findOrCreateCatalogItem: mocks.create }));
vi.mock("@/lib/passes/apply-transition", () => ({ applyTransition: mocks.transition }));
vi.mock("@/lib/catalog/hydrate-book", () => ({ ensureBookHydrated: mocks.hydrate, bookShellFromSearchResult: vi.fn() }));
vi.mock("@/lib/catalog/hydrate-screen", () => ({ ensureMovieHydrated: mocks.hydrate, ensureSeriesHydrated: mocks.hydrate }));

import { addToLibrary, openCatalogItem } from "./actions";
import type { SearchResult } from "@/lib/catalog/types";

const result = { itemType: "movie", externalId: "42", title: "Fixture" } as SearchResult;
const gbOnly = { itemType: "book", externalId: "", googleVolumeId: "vol-1", title: "Fixture" } as SearchResult;

describe("catalog action quota boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.create.mockResolvedValue("created");
    mocks.hydrate.mockResolvedValue(undefined);
    mocks.transition.mockResolvedValue(undefined);
  });

  for (const action of [openCatalogItem, addToLibrary]) {
    it(`${action.name} maps an exhausted request quota before creation`, async () => {
      mocks.rpc.mockResolvedValue({ data: false, error: null });
      await expect(action(result)).resolves.toEqual({ ok: false, error: "RATE_LIMIT", reason: "catalogRequest" });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.hydrate).not.toHaveBeenCalled();
      expect(mocks.transition).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  }

  for (const action of [openCatalogItem, addToLibrary]) {
    it(`${action.name} maps PT429 from a GB-only creation without follow-up work`, async () => {
      mocks.create.mockRejectedValue({ code: "PT429", message: "request quota exceeded" });
      await expect(action(gbOnly)).resolves.toEqual({ ok: false, error: "RATE_LIMIT", reason: "googleBooksCreate" });
      expect(mocks.hydrate).not.toHaveBeenCalled();
      expect(mocks.transition).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });
  }

  it("keeps quota service failures closed and uncaught", async () => {
    const failure = new Error("offline");
    mocks.rpc.mockRejectedValue(failure);
    await expect(openCatalogItem(result)).rejects.toBe(failure);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps non-quota catalog failures uncaught", async () => {
    const failure = { code: "42501", message: "denied" };
    mocks.create.mockRejectedValue(failure);
    await expect(addToLibrary(gbOnly)).rejects.toBe(failure);
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it("keeps the successful open redirect and add transition", async () => {
    await openCatalogItem(result);
    expect(mocks.redirect).toHaveBeenLastCalledWith("/pelicula/created");

    await expect(addToLibrary(result)).resolves.toBeUndefined();
    expect(mocks.transition).toHaveBeenCalledWith(expect.anything(), "reader", "movie", "created", "planned", undefined, { silent: true });
  });

  it("does not charge adding an existing catalog item", async () => {
    await addToLibrary({ ...result, catalogId: "existing" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
