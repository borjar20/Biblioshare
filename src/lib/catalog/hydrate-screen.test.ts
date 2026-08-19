import { describe, it, expect, vi } from "vitest";
import { ensureMovieHydrated, ensureSeriesHydrated } from "./hydrate-screen";
import * as tmdb from "./tmdb";

function fakeSupabase() {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return { supabase: { rpc, from: () => ({ update }) } as never, rpc, update };
}

describe("ensureMovieHydrated", () => {
  it("no hace nada si ya está hidratada", async () => {
    const { supabase, rpc } = fakeSupabase();
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 1, hydrated_at: "2026-01-01" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("llama a hydrate_movie con los campos del proveedor", async () => {
    const { supabase, rpc } = fakeSupabase();
    vi.spyOn(tmdb, "getMovieForHydration").mockResolvedValue({
      title: "T", originalTitle: null, director: "D", synopsis: "S",
      genres: ["g"], year: 2001, coverUrl: "c", durationMinutes: 100,
    });
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 129, hydrated_at: null });
    expect(rpc).toHaveBeenCalledWith("hydrate_movie", expect.objectContaining({
      p_movie_id: "m1", p_title: "T", p_director: "D", p_duration_minutes: 100,
    }));
  });

  it("marca hidratada sin tmdb_id, sin llamar al proveedor", async () => {
    const { supabase, rpc, update } = fakeSupabase();
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: null, hydrated_at: null });
    expect(rpc).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it("no marca si el fetch devuelve null (reintenta luego)", async () => {
    const { supabase, rpc, update } = fakeSupabase();
    vi.spyOn(tmdb, "getMovieForHydration").mockResolvedValue(null);
    await ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 129, hydrated_at: null });
    expect(rpc).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("nunca lanza aunque la RPC falle", async () => {
    const { supabase } = fakeSupabase();
    (supabase as never as { rpc: unknown }).rpc = vi.fn().mockRejectedValue(new Error("boom"));
    vi.spyOn(tmdb, "getMovieForHydration").mockResolvedValue({
      title: "T", originalTitle: null, director: null, synopsis: null,
      genres: null, year: null, coverUrl: null, durationMinutes: null,
    });
    await expect(
      ensureMovieHydrated(supabase, { id: "m1", tmdb_id: 1, hydrated_at: null })
    ).resolves.toBeUndefined();
  });
});

describe("ensureSeriesHydrated", () => {
  it("no hace nada si ya está hidratada", async () => {
    const { supabase, rpc } = fakeSupabase();
    await ensureSeriesHydrated(supabase, { id: "s1", tmdb_id: 1, hydrated_at: "2026-01-01" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("llama a hydrate_series con creator y tamaños del proveedor", async () => {
    const { supabase, rpc } = fakeSupabase();
    vi.spyOn(tmdb, "getSeriesForHydration").mockResolvedValue({
      title: "T", originalTitle: null, creator: "C", synopsis: "S",
      genres: ["g"], year: 2008, coverUrl: "c",
      totalSeasons: 5, totalEpisodes: 62, episodeRuntimeMinutes: 47,
    });
    await ensureSeriesHydrated(supabase, { id: "s1", tmdb_id: 1396, hydrated_at: null });
    expect(rpc).toHaveBeenCalledWith("hydrate_series", expect.objectContaining({
      p_series_id: "s1", p_creator: "C", p_total_seasons: 5,
      p_total_episodes: 62, p_episode_runtime_minutes: 47,
    }));
  });

  it("marca hidratada sin tmdb_id, sin llamar al proveedor", async () => {
    const { supabase, rpc, update } = fakeSupabase();
    await ensureSeriesHydrated(supabase, { id: "s1", tmdb_id: null, hydrated_at: null });
    expect(rpc).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });
});
