import { describe, it, expect } from "vitest";
import { groupPersonEntries } from "./group-feed-entries";
import type { FeedEntry, FeedEvent } from "./feed";

function ev(partial: Partial<FeedEvent> & Pick<FeedEvent, "id" | "verb" | "actorId" | "eventDate">): FeedEvent {
  return {
    actorUsername: "u", actorDisplayName: null, actorAvatarUrl: null,
    itemType: "book", itemId: partial.itemId ?? "i1", itemTitle: "T", itemCoverUrl: null,
    itemSubtitle: null, entryStatus: null, rating: null, reviewExcerpt: null,
    episode: null, progress: null, interactionTarget: null,
    reactionCount: 0, viewerReacted: false, commentCount: 0, comments: [],
    ...partial,
  } as FeedEvent;
}
function person(e: FeedEvent): FeedEntry {
  return { source: "person", id: e.id, eventDate: e.eventDate, event: e };
}

describe("groupPersonEntries", () => {
  it("agrupa 3 altas del mismo actor y día en un person-group", () => {
    const entries = [
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-07-29T09:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-07-29T10:00:00+00:00", itemId: "b2" })),
      person(ev({ id: "diary_entries_added:c", verb: "added", actorId: "x", eventDate: "2026-07-29T17:00:00+00:00", itemId: "b3" })),
    ];
    const out = groupPersonEntries(entries);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
    if (out[0].source === "person-group") {
      expect(out[0].verb).toBe("added");
      expect(out[0].items).toHaveLength(3);
      expect(out[0].eventDate).toBe("2026-07-29T17:00:00+00:00"); // el más reciente
    }
  });

  it("no agrupa altas de días distintos", () => {
    const entries = [
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-07-29T09:00:00+00:00" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-07-28T09:00:00+00:00" })),
    ];
    expect(groupPersonEntries(entries)).toHaveLength(2);
    expect(groupPersonEntries(entries).every((e) => e.source === "person")).toBe(true);
  });

  it("no agrupa una sola alta (queda como person)", () => {
    const entries = [person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-07-29" }))];
    const out = groupPersonEntries(entries);
    expect(out[0].source).toBe("person");
  });

  it("agrupa progressed por actor+obra+día, no mezcla obras", () => {
    const entries = [
      person(ev({ id: "progress_sessions:a", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
      person(ev({ id: "progress_sessions:b", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
      person(ev({ id: "progress_sessions:c", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b2" })),
    ];
    const out = groupPersonEntries(entries);
    // b1 (2 sesiones) → grupo; b2 (1) → person
    expect(out.filter((e) => e.source === "person-group")).toHaveLength(1);
    expect(out.filter((e) => e.source === "person")).toHaveLength(1);
  });

  it("agrupa progressed de la misma obra dentro de 7 días", () => {
    const entries = [
      person(ev({ id: "progress_sessions:a", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
      person(ev({ id: "progress_sessions:b", verb: "progressed", actorId: "x", eventDate: "2026-07-25", itemId: "b1" })),
      person(ev({ id: "progress_sessions:c", verb: "progressed", actorId: "x", eventDate: "2026-07-23", itemId: "b1" })),
    ];
    const out = groupPersonEntries(entries);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
    if (out[0].source === "person-group") expect(out[0].items).toHaveLength(3);
  });

  it("NO agrupa progressed de la misma obra separados >7 días", () => {
    const entries = [
      person(ev({ id: "progress_sessions:a", verb: "progressed", actorId: "x", eventDate: "2026-07-29", itemId: "b1" })),
      person(ev({ id: "progress_sessions:b", verb: "progressed", actorId: "x", eventDate: "2026-07-10", itemId: "b1" })),
    ];
    const out = groupPersonEntries(entries);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.source === "person")).toBe(true);
  });

  it("no agrupa verbos no agrupables (finished/reviewed)", () => {
    const entries = [
      person(ev({ id: "diary_entries:a", verb: "finished", actorId: "x", eventDate: "2026-07-29" })),
      person(ev({ id: "diary_entries:b", verb: "reviewed", actorId: "x", eventDate: "2026-07-29" })),
    ];
    expect(groupPersonEntries(entries).every((e) => e.source === "person")).toBe(true);
  });

  it("deja pasar las entradas de club sin tocar", () => {
    const club = { source: "club" as const, id: "club:z", eventDate: "2026-07-29", event: {} as never };
    expect(groupPersonEntries([club])).toEqual([club]);
  });
});
