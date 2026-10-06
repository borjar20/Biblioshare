import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { collectTmdbReleases, getTmdbWorkReleases } from "./tmdb-provider";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubEnv("TMDB_API_KEY", "fixture-provider-token"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("bounded provider review", () => {
  it("revisits tracked upcoming works even when discovery no longer lists them", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes("discover")) return json({ results: [], total_pages: 0 });
      return json({ id: 9, title: "Pospuesta", release_dates: { results: [{ iso_3166_1: "ES", release_dates: [{ type: 3, release_date: "2028-01-10T00:00:00Z" }] }] } });
    });
    const batch = await collectTmdbReleases("2026-10-06", "2027-04-01", [{ item_type: "movie", tmdb_id: 9 }]);
    expect(batch.releases[0]).toMatchObject({ date_value: "2028-01-10", source_key: "movie:9:cinema:ES" });
    expect(batch.checkedWorks).toEqual([{ item_type: "movie", tmdb_id: 9 }]);
    expect(batch.failedWorks).toBe(0);
  });
  it("keeps failed sources distinct from a successful empty response", async () => {
    fetchMock.mockImplementation(async (input) => String(input).includes("discover") ? json({ results: [], total_pages: 0 }) : json({}, 503));
    const batch = await collectTmdbReleases("2026-10-06", "2027-04-01", [{ item_type: "movie", tmdb_id: 9 }]);
    expect(batch.releases).toEqual([]);
    expect(batch.checkedWorks).toEqual([]);
    expect(batch.failedWorks).toBe(1);
    expect(batch.discoveryFailed).toBe(false);
    fetchMock.mockResolvedValue(json({ total_pages: 0 }));
    expect((await collectTmdbReleases("2026-10-06", "2027-04-01")).discoveryFailed).toBe(true);
  });
  it("caps every discover query and supplies a timeout without exposing credentials in URLs", async () => {
    fetchMock.mockImplementation(async () => json({ results: [], total_pages: 999 }));
    await collectTmdbReleases("2026-10-06", "2027-04-01", [], 999);
    expect(fetchMock).toHaveBeenCalledTimes(12);
    for (const [input, options] of fetchMock.mock.calls) {
      expect(Number(new URL(String(input)).searchParams.get("page"))).toBeLessThanOrEqual(3);
      expect(String(input)).not.toContain("fixture-provider-token");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(options?.cache).toBe("no-store");
    }
  });
  it("fails closed when provider credentials are missing", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    await expect(collectTmdbReleases("2026-10-06", "2027-04-01")).rejects.toThrow("tmdb_configuration");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a mismatched detail identity and malformed seasons instead of rewriting another work", async () => {
    fetchMock.mockResolvedValue(json({ id: 8, name: "Otra", seasons: [] }));
    await expect(getTmdbWorkReleases({ item_type: "series", tmdb_id: 7 })).rejects.toThrow("tmdb_malformed");
    fetchMock.mockResolvedValue(json({ id: 7, name: "Otra" }));
    await expect(getTmdbWorkReleases({ item_type: "series", tmdb_id: 7 })).rejects.toThrow("malformed_provider_response");
  });
});
