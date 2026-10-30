import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/library/types";
import { toNowItems } from "./now";

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  entryId: "p", itemId: "b1", itemType: "book", status: "in_progress", rating: null,
  position: {}, notes: null, title: "El imperio final", coverUrl: null, subtitle: null,
  publisher: null, pageCount: 669, totalEpisodes: null, watchedEpisodes: null, upToDate: false,
  rereadCount: 1, pinnedOrder: null, activePassId: "p", ...over,
});

describe("toNowItems", () => {
  it("usa la posición CRUDA del pase para el avance y respeta el orden de las claves", () => {
    const out = toNowItems(
      [
        { item_type: "book", item_id: "b1", position: { page: 668 } },
        { item_type: "series", item_id: "s1", position: { season: 2, episode: 4 } },
      ],
      [item({ itemType: "series", itemId: "s1", title: "Severance", pageCount: null }), item({})],
    );
    expect(out.map((n) => n.itemId)).toEqual(["b1", "s1"]);
    expect(out[0]).toMatchObject({ progressLabel: "Pág. 668", progressPercent: 99 });
    expect(out[1]).toMatchObject({ progressLabel: "T2E4", progressPercent: null });
  });

  it("descarta claves que no se hidrataron", () => {
    expect(toNowItems([{ item_type: "book", item_id: "x", position: {} }], [])).toEqual([]);
  });
});
