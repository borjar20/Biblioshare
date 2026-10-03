import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_CASES, PAGE_PASS, PAGE_USER, pageFixture } from "@/lib/editions/edition-pages.test-fixture";

const boundary = vi.hoisted(() => ({ createClient: vi.fn(), createPublicClient: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => boundary);
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("Unexpected notFound in page fixture"); },
  redirect: () => { throw new Error("Unexpected redirect in page fixture"); },
}));
vi.mock("@/lib/library/ensure-series-episodes", () => ({ ensureSeriesEpisodes: () => { throw new Error("Unexpected series provider"); } }));
vi.mock("@/lib/series/get-episode-data", () => ({ getEpisodeData: () => { throw new Error("Unexpected series data"); } }));
import { loadSessionContext } from "@/lib/sessions/load-context";

beforeEach(() => {
  vi.clearAllMocks();
  boundary.getCurrentUser.mockResolvedValue({ id: PAGE_USER });
  vi.stubGlobal("fetch", () => { throw new Error("Real fetch forbidden in #901"); });
});
afterEach(() => vi.unstubAllGlobals());

describe("loadSessionContext aplica la precedencia de páginas (#901)", () => {
  it.each(PAGE_CASES)("$name", async (sample) => {
    const { client } = pageFixture(sample);
    boundary.createClient.mockResolvedValue(client);
    boundary.createPublicClient.mockReturnValue(client);
    // getActivePass/getPasses, getEditions and pagesForPass remain real.
    const context = await loadSessionContext(PAGE_PASS);
    expect(context).toMatchObject({ passId: PAGE_PASS, itemType: "book", position: { page: 100 } });
    expect(context.total).toBe(sample.expectedPages);
  });
});
