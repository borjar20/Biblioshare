// src/lib/profile/wall.test.ts
import { describe, expect, it } from "vitest";
import type { FeedEntry, FeedEvent } from "@/lib/social/feed";
import { buildProfileWall, madridMonthKey, wallMonthLabel } from "./wall";

let n = 0;
function ev(over: Partial<FeedEvent>): FeedEntry {
  n += 1;
  const event = {
    id: `posts:${n}`, postId: `p${n}`, actorId: "u", actorUsername: "mar", actorDisplayName: null,
    actorAvatarUrl: null, verb: "progressed", entryStatus: null, itemType: "book", itemId: "b1",
    itemTitle: "El imperio final", itemCoverUrl: null, itemSubtitle: null,
    eventDate: "2026-10-10T10:00:00Z", orderDate: "2026-10-10T10:00:00Z", sortDate: "2026-10-10T10:00:00Z",
    rating: null, reviewExcerpt: null, reviewIsSpoiler: false, episode: null, reviewMeta: null,
    progress: null, thought: null, interactionTarget: null, reactionCount: 0, viewerReacted: false,
    commentCount: 0, comments: [], reactions: {},
    ...over,
  } as FeedEvent;
  return { source: "person", id: event.id, eventDate: event.eventDate, orderDate: event.orderDate, sortDate: event.sortDate, event };
}
const at = (d: string) => ({ eventDate: d, orderDate: d, sortDate: d });

describe("madridMonthKey", () => {
  it("las 23:30 UTC del 31 de octubre ya son noviembre en Madrid", () => {
    expect(madridMonthKey("2026-10-31T23:30:00Z")).toBe("2026-11");
  });
});

describe("buildProfileWall", () => {
  it("una obra aparece una vez por mes con el estado de mayor precedencia", () => {
    const wall = buildProfileWall([
      ev({ verb: "rated", rating: 8, ...at("2026-10-20T10:00:00Z") }),
      ev({ verb: "progressed", ...at("2026-10-12T10:00:00Z") }),
      ev({ verb: "started", ...at("2026-10-01T10:00:00Z") }),
    ]);
    expect(wall).toHaveLength(1);
    expect(wall[0].coverCount).toBe(1);
    const seg = wall[0].segments[0];
    expect(seg.type).toBe("covers");
    if (seg.type === "covers") expect(seg.covers[0].state).toEqual({ kind: "rated", rating: 8 });
  });

  it("precedencias: abandonada sobre terminada, terminada sobre en curso", () => {
    const dropped = buildProfileWall([ev({ verb: "dropped" }), ev({ verb: "finished" })]);
    const finished = buildProfileWall([ev({ verb: "finished" }), ev({ verb: "progressed" })]);
    const firstCover = (w: ReturnType<typeof buildProfileWall>) =>
      w[0].segments[0].type === "covers" ? w[0].segments[0].covers[0].state : null;
    expect(firstCover(dropped)).toEqual({ kind: "dropped" });
    expect(firstCover(finished)).toEqual({ kind: "finished" });
  });

  it("solo episodios: cuenta los episodios y toma la temporada del más reciente", () => {
    const wall = buildProfileWall([
      ev({ verb: "watchedEpisode", itemType: "series", itemId: "s1", episode: { season: 2, episode: 6, title: null }, episodes: [{} as never, {} as never], ...at("2026-10-05T10:00:00Z") }),
      ev({ verb: "watchedEpisode", itemType: "series", itemId: "s1", episode: { season: 2, episode: 4, title: null }, ...at("2026-10-02T10:00:00Z") }),
    ]);
    const seg = wall[0].segments[0];
    if (seg.type !== "covers") throw new Error("esperaba portadas");
    expect(seg.covers[0].state).toEqual({ kind: "episodes", season: 2, count: 3 });
  });

  it("la nota de un episodio no es la nota de la serie", () => {
    const wall = buildProfileWall([
      ev({ verb: "rated", rating: 9, itemType: "series", itemId: "s1", episode: { season: 1, episode: 1, title: null } }),
    ]);
    const seg = wall[0].segments[0];
    if (seg.type !== "covers") throw new Error("esperaba portadas");
    expect(seg.covers[0].state.kind).toBe("episodes");
  });

  it("una reseña con texto deja portada y añade tarjeta detrás", () => {
    const wall = buildProfileWall([ev({ verb: "reviewed", rating: 10, reviewExcerpt: "Preciosa" })]);
    expect(wall[0].segments.map((s) => s.type)).toEqual(["covers", "card"]);
  });

  it("pensamientos, experiencias y crónicas son tarjetas en su sitio del tiempo", () => {
    const thought = ev({ verb: "thought", thought: { body: "hola", isSpoiler: false, anchor: {} as never }, ...at("2026-10-15T10:00:00Z") });
    const wall = buildProfileWall([
      ev({ itemId: "a", ...at("2026-10-20T10:00:00Z") }),
      thought,
      ev({ itemId: "b", ...at("2026-10-10T10:00:00Z") }),
      { source: "wrap_up", id: "w1", ...at("2026-10-05T10:00:00Z"), event: {} as never },
    ]);
    expect(wall[0].segments.map((s) => s.type)).toEqual(["covers", "card", "covers", "card"]);
  });

  it("los meses van en orden descendente y en hora de Madrid", () => {
    const wall = buildProfileWall([
      ev({ itemId: "a", ...at("2026-10-31T23:30:00Z") }),
      ev({ itemId: "b", ...at("2026-10-01T10:00:00Z") }),
    ]);
    expect(wall.map((m) => m.key)).toEqual(["2026-11", "2026-10"]);
  });

  it("un grupo de persona se deshace en sus eventos", () => {
    const a = ev({ itemId: "a" });
    const b = ev({ itemId: "b" });
    const group = {
      source: "person-group", id: "g1", ...at("2026-10-10T10:00:00Z"), verb: "progressed",
      actor: { id: "u", username: "mar", displayName: null, avatarUrl: null },
      items: [a, b].map((e) => (e as Extract<FeedEntry, { source: "person" }>).event),
    } as FeedEntry;
    expect(buildProfileWall([group])[0].coverCount).toBe(2);
  });

  it("suma reacciones y guarda el post más reciente", () => {
    const wall = buildProfileWall([
      ev({ postId: "nuevo", reactionCount: 2, ...at("2026-10-20T10:00:00Z") }),
      ev({ postId: "viejo", reactionCount: 1, ...at("2026-10-01T10:00:00Z") }),
    ]);
    const seg = wall[0].segments[0];
    if (seg.type !== "covers") throw new Error("esperaba portadas");
    expect(seg.covers[0]).toMatchObject({ postId: "nuevo", reactions: 3 });
  });

  it("un mes partido entre páginas se une al reconstruir con todos los eventos", () => {
    const page1 = [ev({ itemId: "a", ...at("2026-10-20T10:00:00Z") })];
    const page2 = [ev({ itemId: "a", verb: "finished", ...at("2026-10-02T10:00:00Z") })];
    const wall = buildProfileWall([...page1, ...page2]);
    expect(wall).toHaveLength(1);
    expect(wall[0].coverCount).toBe(1);
  });
});

describe("wallMonthLabel", () => {
  it("sin año en el año en curso, con año en otro", () => {
    expect(wallMonthLabel("2026-10", "2026-10")).toBe("Octubre");
    expect(wallMonthLabel("2025-12", "2026-10")).toBe("Diciembre de 2025");
  });
});
