import { describe, it, expect } from "vitest";
import { bucketProfileFeed } from "./profile-feed-buckets";
import { groupPersonEntries } from "./group-feed-entries";
import type { FeedEntry, FeedEvent } from "./feed";

function ev(
  partial: Partial<FeedEvent> & Pick<FeedEvent, "id" | "verb" | "actorId" | "eventDate">,
): FeedEvent {
  return {
    actorUsername: "u", actorDisplayName: null, actorAvatarUrl: null,
    itemType: "book", itemId: partial.itemId ?? "i1", itemTitle: "T", itemCoverUrl: null,
    itemSubtitle: null, entryStatus: null, rating: null, reviewExcerpt: null,
    episode: null, progress: null, interactionTarget: null,
    orderDate: partial.orderDate ?? partial.eventDate,
    sortDate: partial.sortDate ?? partial.eventDate,
    reactionCount: 0, viewerReacted: false, commentCount: 0, comments: [],
    ...partial,
  } as FeedEvent;
}
function person(e: FeedEvent): FeedEntry {
  return { source: "person", id: e.id, eventDate: e.eventDate, orderDate: e.orderDate, sortDate: e.sortDate, event: e };
}

describe("bucketProfileFeed", () => {
  it("parte un grupo 'added' de 2 días en un bucket por día natural (#348)", () => {
    // Dos altas de días adyacentes: groupPersonEntries las funde en UN
    // person-group (la ventana de altas son 2 días). En el perfil, con
    // cabeceras de día, esa tarjeta de 2 días debe repartirse: la de hoy bajo
    // hoy, la de ayer bajo ayer — no toda bajo el día más reciente.
    const grouped = groupPersonEntries([
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-08-02T10:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-08-01T22:00:00+00:00", itemId: "b2" })),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].source).toBe("person-group");

    const buckets = bucketProfileFeed(grouped);
    expect(buckets.map((b) => b.key)).toEqual(["2026-08-02", "2026-08-01"]);
    expect(buckets[0].entries).toHaveLength(1);
    expect(buckets[1].entries).toHaveLength(1);
  });

  it("no fragmenta cabeceras: el sub-grupo de ayer no se cuela entre eventos de hoy", () => {
    // Grupo de altas D2/D1 + un 'finished' en D2 con hora MENOR que el alta más
    // nueva. Un troceo ingenuo en el sitio dejaría [D2-altas, D1-alta, D2-finished]
    // → cabeceras Hoy/Ayer/Hoy en desorden. El re-orden debe dar Hoy{alta,finished},
    // Ayer{alta}.
    const grouped = groupPersonEntries([
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-08-02T23:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-08-01T22:00:00+00:00", itemId: "b2" })),
      person(ev({ id: "diary_entries:c", verb: "finished", actorId: "x", eventDate: "2026-08-02T20:00:00+00:00", itemId: "b3", orderDate: "2026-08-02", sortDate: "2026-08-02T20:00:00+00:00" })),
    ]);

    const buckets = bucketProfileFeed(grouped);
    expect(buckets.map((b) => b.key)).toEqual(["2026-08-02", "2026-08-01"]);
    // Hoy contiene el alta suelta de hoy Y el finished; Ayer solo el alta de ayer.
    expect(buckets[0].entries).toHaveLength(2);
    expect(buckets[1].entries).toHaveLength(1);
    expect(buckets[1].entries[0].id).toBe("diary_entries_added:b");
  });

  it("no parte un grupo de altas de un solo día", () => {
    const grouped = groupPersonEntries([
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-08-02T09:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-08-02T17:00:00+00:00", itemId: "b2" })),
    ]);
    const buckets = bucketProfileFeed(grouped);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].entries).toHaveLength(1);
    expect(buckets[0].entries[0].source).toBe("person-group");
  });

  it("no parte un timeline de avances que abarca varios días (grupo por hueco)", () => {
    const sesion = (id: string, date: string) =>
      person(ev({ id: `progress_sessions:${id}`, verb: "progressed", actorId: "x", eventDate: date, itemId: "obra" }));
    const grouped = groupPersonEntries([
      sesion("p1", "2026-08-05"),
      sesion("p2", "2026-08-04"),
      sesion("p3", "2026-08-03"),
    ]);
    const buckets = bucketProfileFeed(grouped);
    // Una sola tarjeta timeline, bajo el día más reciente, sin trocear.
    expect(buckets).toHaveLength(1);
    expect(buckets[0].entries).toHaveLength(1);
    if (buckets[0].entries[0].source === "person-group") {
      expect(buckets[0].entries[0].items).toHaveLength(3);
    }
  });
});
