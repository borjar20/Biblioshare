import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), create: vi.fn(), hydrate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) },
  rpc: mocks.rpc,
}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/reactivity/revalidate", () => ({ revalidateSearch: vi.fn() }));
vi.mock("@/lib/catalog/find-or-create", () => ({ findOrCreateCatalogItem: mocks.create }));
vi.mock("@/lib/passes/apply-transition", () => ({ applyTransition: vi.fn() }));
vi.mock("@/lib/catalog/hydrate-book", () => ({ ensureBookHydrated: mocks.hydrate, bookShellFromSearchResult: vi.fn() }));
vi.mock("@/lib/catalog/hydrate-screen", () => ({ ensureMovieHydrated: mocks.hydrate, ensureSeriesHydrated: mocks.hydrate }));

import { addToLibrary, openCatalogItem } from "./actions";
import type { SearchResult } from "@/lib/catalog/types";
const result = { itemType: "movie", externalId: "42", title: "Fixture" } as SearchResult;

describe("catalog action quota boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue("created");
    mocks.hydrate.mockResolvedValue(undefined);
  });
  for (const action of [openCatalogItem, addToLibrary]) {
    it(`${action.name} stops before creation and external hydration when exhausted`, async () => {
      mocks.rpc.mockResolvedValue({ data: false, error: null });
      await expect(action(result)).rejects.toThrow("quota");
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.hydrate).not.toHaveBeenCalled();
    });
  }
  it("fails closed when the quota service cannot be read", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(openCatalogItem(result)).rejects.toThrow("quota");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not charge adding an existing catalog item", async () => {
    await addToLibrary({ ...result, catalogId: "existing" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
