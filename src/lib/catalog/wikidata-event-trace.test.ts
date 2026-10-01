import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/database.types";
import { countBookEventTrace } from "./wikidata-event-trace";
import { chooseWinner, type BookRow } from "./wikidata-reconcile";

type Row = { kind: string; event_type: string; config: Json | null };
function client(pages: Array<{ data: Row[] | null; error: { message: string } | null }>) {
  const range = vi.fn().mockImplementation(async () => pages.shift());
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range };
  for (const method of [query.select, query.eq, query.in, query.order]) method.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  return { supabase: { from } as unknown as SupabaseClient, from, query };
}
const launch = (config: Json | null): Row => ({ kind: "evento", event_type: "lanzamiento", config });
const date = (config: Json | null): Row => ({ kind: "evento", event_type: "fecha_destacada", config });
const bookRef = (id: string) => ({ kind: "item", itemType: "book", itemId: id });

describe("book event trace for reconciliation (#875)", () => {
  it("counts releases and every date reference, preserving repeated references as trace", async () => {
    const { supabase } = client([{ error: null, data: [
      launch({ item: { itemType: "book", itemId: "book-a" } }),
      date({ relations: [bookRef("book-a"), bookRef("book-b"), bookRef("book-a")] }),
    ] }]);
    expect(await countBookEventTrace(supabase)).toEqual(new Map([["book-a", 3], ["book-b", 1]]));
  });

  it("does not count other media with the same ID, activity references or unknown relation kinds", async () => {
    const { supabase } = client([{ error: null, data: [
      launch({ item: { itemType: "movie", itemId: "same-id" } }),
      launch({ item: { itemType: "series", itemId: "same-id" } }),
      date({ relations: [
        { kind: "item", itemType: "movie", itemId: "same-id" },
        { kind: "item", itemType: "series", itemId: "same-id" },
        { kind: "activity", activityId: "same-id", itemType: "book", itemId: "same-id" },
        { kind: "other", itemType: "book", itemId: "same-id" },
      ] }),
    ] }]);
    expect(await countBookEventTrace(supabase)).toEqual(new Map());
  });

  it("does not reinterpret another activity kind or event type as a book event", async () => {
    const config = { item: { itemType: "book", itemId: "book-a" }, relations: [bookRef("book-a")] };
    const { supabase } = client([{ error: null, data: [
      { kind: "tierlist", event_type: "lanzamiento", config },
      { kind: "tierlist", event_type: "fecha_destacada", config },
      { kind: "evento", event_type: "encuentro", config },
    ] }]);
    expect(await countBookEventTrace(supabase)).toEqual(new Map());
  });

  it("tolerates opaque and malformed configs with the same parser as the event display", async () => {
    const { supabase } = client([{ error: null, data: [
      launch(null), launch(17), launch("opaque"), launch([]), launch({ item: null }),
      launch({ item: { itemType: "book", itemId: " " } }),
      date({ relations: bookRef("book-a") }), date({ relations: [] }), date("opaque"),
      date({ relations: [null, 17, "opaque", { kind: "item", itemType: "book" }] }),
    ] }]);
    expect(await countBookEventTrace(supabase)).toEqual(new Map());
  });

  it("reads beyond the PostgREST page limit in a total ID order", async () => {
    const first = Array.from({ length: 1000 }, () => launch({ item: { itemType: "book", itemId: "book-a" } }));
    const { supabase, from, query } = client([
      { data: first, error: null },
      { data: [date({ relations: [bookRef("book-b")] })], error: null },
    ]);
    expect(await countBookEventTrace(supabase)).toEqual(new Map([["book-a", 1000], ["book-b", 1]]));
    expect(from).toHaveBeenCalledWith("club_activities");
    expect(query.order).toHaveBeenCalledWith("id");
    expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("refuses a partial trace when a later page fails", async () => {
    const { supabase } = client([
      { data: Array.from({ length: 1000 }, () => launch({ item: { itemType: "book", itemId: "book-a" } })), error: null },
      { data: null, error: { message: "provider unavailable" } },
    ]);
    await expect(countBookEventTrace(supabase)).rejects.toThrow("club_activities: provider unavailable");
  });

  it("a user event makes its book beat an older empty duplicate in the real winner rule", async () => {
    const { supabase } = client([{ error: null, data: [launch({ item: { itemType: "book", itemId: "with-event" } })] }]);
    const trace = await countBookEventTrace(supabase);
    const row = (id: string, created_at: string): BookRow => ({ id, created_at, title: "Same book", author: "Same author", wikidata_id: null, passCount: 0, otherTraceCount: trace.get(id) ?? 0 });
    expect(chooseWinner([row("empty", "2020-01-01T00:00:00Z"), row("with-event", "2026-01-01T00:00:00Z")]).id).toBe("with-event");
  });
});
