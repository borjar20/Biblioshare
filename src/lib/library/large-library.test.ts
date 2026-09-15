import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getLibraryView, getUserGenres } from "./get-library-items";

// Real PostgREST builders and URL encoding, with the observed transport limit.
// The fixture also enforces the API row cap rather than returning unlimited rows.
function fixture(count: number, failCatalog = false) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    item_id: `20000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    item_type: "movie", status: "completed", is_active: true,
    position: null, pinned_order: null, edition_id: null,
    finished_on: "2026-01-01", created_at: "2026-01-01", rating: 8,
  }));
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.href.length > 16000) throw new TypeError("fetch failed: UND_ERR_HEADERS_OVERFLOW");
    const table = url.pathname.split("/").at(-1);
    if (table === "movies" && failCatalog) {
      return new Response(JSON.stringify({ message: "catalog unavailable", code: "XX000" }), { status: 500 });
    }
    let data: Record<string, unknown>[] = table === "movies"
      ? rows.map(r => ({ id: r.item_id, title: r.item_id, cover_url: null, genres: ["Drama"] }))
      : table === "pass_reviews" ? rows.map(r => ({ id: r.id, review: "Review" }))
      : table === "passes" ? rows : [];
    for (const [column, filter] of url.searchParams) {
      if (filter.startsWith("in.(")) {
        const ids = filter.slice(4, -1).split(",");
        data = data.filter(r => ids.includes(String(r[column])));
      }
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(1000, Number(url.searchParams.get("limit") ?? 1000));
    return new Response(JSON.stringify(data.slice(offset, offset + limit)), {
      headers: { "content-type": "application/json" },
    });
  };
  return createClient("https://fixture.supabase.co", "public-fixture", {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false },
  }) as never;
}

describe("large library transport regression", () => {
  it.each([895, 1205])("keeps all %i movies, ratings and reviews", async count => {
    const result = await getLibraryView(fixture(count), "owner", {});
    expect(result.total).toBe(count);
    expect(result.items).toHaveLength(count);
    expect(result.items.every(r => r.rating === 8 && r.notes === "Review" && r.rereadCount === 1)).toBe(true);
  });
  it("keeps the full genre counts", async () => {
    expect(await getUserGenres(fixture(1205), "owner")).toEqual([{ slug: "drama", label: "Drama", count: 1205 }]);
  });
  it("propagates catalog failures instead of claiming the library is empty", async () => {
    await expect(getLibraryView(fixture(2, true), "owner", {})).rejects.toMatchObject({ message: "catalog unavailable" });
  });
});
