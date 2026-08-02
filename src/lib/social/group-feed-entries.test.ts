import { describe, it, expect } from "vitest";
import { groupPersonEntries } from "./group-feed-entries";
import type { FeedEntry, FeedEvent } from "./feed";

function ev(partial: Partial<FeedEvent> & Pick<FeedEvent, "id" | "verb" | "actorId" | "eventDate">): FeedEvent {
  return {
    actorUsername: "u", actorDisplayName: null, actorAvatarUrl: null,
    itemType: "book", itemId: partial.itemId ?? "i1", itemTitle: "T", itemCoverUrl: null,
    itemSubtitle: null, entryStatus: null, rating: null, reviewExcerpt: null,
    episode: null, progress: null, interactionTarget: null,
    sortDate: partial.sortDate ?? partial.eventDate,
    reactionCount: 0, viewerReacted: false, commentCount: 0, comments: [],
    ...partial,
  } as FeedEvent;
}
function person(e: FeedEvent): FeedEntry {
  return { source: "person", id: e.id, eventDate: e.eventDate, sortDate: e.sortDate, event: e };
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

  it("agrupa altas de días adyacentes (la ventana son 2 días naturales)", () => {
    const out = groupPersonEntries([
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-08-02T10:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-08-01T22:00:00+00:00", itemId: "b2" })),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
  });

  it("parte las altas cuando el grupo pasaría de 2 días naturales", () => {
    const out = groupPersonEntries([
      person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-08-03T10:00:00+00:00", itemId: "b1" })),
      person(ev({ id: "diary_entries_added:b", verb: "added", actorId: "x", eventDate: "2026-08-02T10:00:00+00:00", itemId: "b2" })),
      person(ev({ id: "diary_entries_added:c", verb: "added", actorId: "x", eventDate: "2026-08-01T10:00:00+00:00", itemId: "b3" })),
    ]);
    // El feed va de más nuevo a más viejo, así que el par pegado es el de los
    // dos días más nuevos y el más antiguo queda suelto.
    expect(out).toHaveLength(2);
    expect(out[0].source).toBe("person-group");
    if (out[0].source === "person-group") {
      expect(out[0].items.map((i) => i.id)).toEqual([
        "diary_entries_added:a",
        "diary_entries_added:b",
      ]);
    }
    expect(out[1].source).toBe("person");
  });

  it("no agrupa una sola alta (queda como person)", () => {
    const entries = [person(ev({ id: "diary_entries_added:a", verb: "added", actorId: "x", eventDate: "2026-07-29" }))];
    const out = groupPersonEntries(entries);
    expect(out[0].source).toBe("person");
  });

  it("agrupa progressed de la misma obra el mismo día (dentro de la ventana)", () => {
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

  it("ordena las sesiones del mismo día por sortDate (created_at) desc, no por id", () => {
    // Sesiones backdateadas al mismo día: eventDate empata (date-only). El
    // desempate debe ser la hora real de registro (sortDate=created_at), no el
    // uuid del id — que es aleatorio. Ids en orden inverso a created_at para
    // que un desempate por id daría el orden equivocado.
    const entries = [
      person(ev({ id: "progress_sessions:zzz", verb: "progressed", actorId: "x", eventDate: "2026-07-28", itemId: "b1", sortDate: "2026-07-28T08:00:00+00:00", progress: { durationMinutes: null, page: 121, percent: 33, note: null } })),
      person(ev({ id: "progress_sessions:mmm", verb: "progressed", actorId: "x", eventDate: "2026-07-28", itemId: "b1", sortDate: "2026-07-28T12:00:00+00:00", progress: { durationMinutes: null, page: 144, percent: 39, note: null } })),
      person(ev({ id: "progress_sessions:aaa", verb: "progressed", actorId: "x", eventDate: "2026-07-28", itemId: "b1", sortDate: "2026-07-28T20:00:00+00:00", progress: { durationMinutes: null, page: 210, percent: 56, note: null } })),
    ];
    const out = groupPersonEntries(entries);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
    if (out[0].source === "person-group") {
      // created_at desc: 20h (210) → 12h (144) → 08h (121)
      expect(out[0].items.map((i) => i.progress?.page)).toEqual([210, 144, 121]);
    }
  });

  const sesion = (id: string, date: string) =>
    person(ev({ id: `progress_sessions:${id}`, verb: "progressed", actorId: "x", eventDate: date, itemId: "obra" }));

  it("agrupa progressed de la misma obra separados exactamente 2 días (borde de la ventana)", () => {
    const out = groupPersonEntries([sesion("p1", "2026-08-03"), sesion("p2", "2026-08-01")]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("person-group");
  });

  it("NO agrupa progressed de la misma obra separados >2 días", () => {
    const out = groupPersonEntries([sesion("p1", "2026-08-04"), sesion("p2", "2026-08-01")]);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.source === "person")).toBe(true);
  });

  it("una racha diaria larga sigue siendo UN timeline (la ventana es por hueco)", () => {
    const out = groupPersonEntries([
      sesion("p1", "2026-08-05"),
      sesion("p2", "2026-08-04"),
      sesion("p3", "2026-08-03"),
      sesion("p4", "2026-08-02"),
      sesion("p5", "2026-08-01"),
    ]);
    expect(out).toHaveLength(1);
    if (out[0].source === "person-group") expect(out[0].items).toHaveLength(5);
  });

  it("no agrupa verbos no agrupables (finished/reviewed)", () => {
    const entries = [
      person(ev({ id: "diary_entries:a", verb: "finished", actorId: "x", eventDate: "2026-07-29" })),
      person(ev({ id: "diary_entries:b", verb: "reviewed", actorId: "x", eventDate: "2026-07-29" })),
    ];
    expect(groupPersonEntries(entries).every((e) => e.source === "person")).toBe(true);
  });

  it("deja pasar las entradas de club sin tocar", () => {
    const club = { source: "club" as const, id: "club:z", eventDate: "2026-07-29", sortDate: "2026-07-29", event: {} as never };
    expect(groupPersonEntries([club])).toEqual([club]);
  });
});
