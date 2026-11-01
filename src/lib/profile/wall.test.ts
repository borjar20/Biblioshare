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

type Wall = ReturnType<typeof buildProfileWall>;
const firstCover = (w: Wall) => {
  const item = w[0].items[0];
  return item?.type === "cover" ? item.cover : null;
};

describe("buildProfileWall", () => {
  it("una obra aparece una vez por mes con el estado de mayor precedencia", () => {
    const wall = buildProfileWall([
      ev({ verb: "rated", rating: 8, ...at("2026-10-20T10:00:00Z") }),
      ev({ verb: "progressed", ...at("2026-10-12T10:00:00Z") }),
      ev({ verb: "started", ...at("2026-10-01T10:00:00Z") }),
    ]);
    expect(wall).toHaveLength(1);
    expect(wall[0].coverCount).toBe(1);
    expect(firstCover(wall)?.state).toEqual({ kind: "rated", rating: 8 });
  });

  it("precedencias: abandonada sobre terminada, terminada sobre en curso", () => {
    const dropped = buildProfileWall([ev({ verb: "dropped" }), ev({ verb: "finished" })]);
    const finished = buildProfileWall([ev({ verb: "finished" }), ev({ verb: "progressed" })]);
    expect(firstCover(dropped)?.state).toEqual({ kind: "dropped" });
    expect(firstCover(finished)?.state).toEqual({ kind: "finished" });
  });

  it("solo episodios: cuenta los episodios y toma la temporada del más reciente", () => {
    const wall = buildProfileWall([
      ev({ verb: "watchedEpisode", itemType: "series", itemId: "s1", episode: { season: 2, episode: 6, title: null }, episodes: [{} as never, {} as never], ...at("2026-10-05T10:00:00Z") }),
      ev({ verb: "watchedEpisode", itemType: "series", itemId: "s1", episode: { season: 2, episode: 4, title: null }, ...at("2026-10-02T10:00:00Z") }),
    ]);
    expect(firstCover(wall)?.state).toEqual({ kind: "episodes", season: 2, count: 3 });
  });

  it("la nota de un episodio no es la nota de la serie", () => {
    const wall = buildProfileWall([
      ev({ verb: "rated", rating: 9, itemType: "series", itemId: "s1", episode: { season: 1, episode: 1, title: null } }),
    ]);
    expect(firstCover(wall)?.state.kind).toBe("episodes");
  });

  it("una reseña con texto es UN solo item portada con la reseña, sin tarjeta extra", () => {
    const wall = buildProfileWall([ev({ verb: "reviewed", rating: 10, reviewExcerpt: "Preciosa", postId: "r1" })]);
    expect(wall[0].items.map((i) => i.type)).toEqual(["cover"]);
    expect(firstCover(wall)?.review).toEqual({ excerpt: "Preciosa", isSpoiler: false, postId: "r1", rating: 10 });
  });

  it("sin reseña con texto, la portada no lleva review", () => {
    expect(firstCover(buildProfileWall([ev({ verb: "rated", rating: 8 })]))?.review).toBeNull();
  });

  it("gana la reseña más reciente de la obra en el mes", () => {
    const wall = buildProfileWall([
      ev({ verb: "reviewed", rating: 6, reviewExcerpt: "Vieja", postId: "viejo", ...at("2026-10-02T10:00:00Z") }),
      ev({ verb: "reviewed", rating: 9, reviewExcerpt: "Nueva", postId: "nuevo", ...at("2026-10-20T10:00:00Z") }),
    ]);
    expect(wall[0].items).toHaveLength(1);
    expect(firstCover(wall)?.review).toEqual({ excerpt: "Nueva", isSpoiler: false, postId: "nuevo", rating: 9 });
  });

  it("conserva el spoiler de la reseña", () => {
    const wall = buildProfileWall([ev({ verb: "reviewed", rating: 7, reviewExcerpt: "Muere", reviewIsSpoiler: true })]);
    expect(firstCover(wall)?.review?.isSpoiler).toBe(true);
  });

  it("pensamientos, experiencias y crónicas son tarjetas en su sitio del tiempo", () => {
    const thought = ev({ verb: "thought", thought: { body: "hola", isSpoiler: false, anchor: {} as never }, ...at("2026-10-15T10:00:00Z") });
    const wall = buildProfileWall([
      ev({ itemId: "a", ...at("2026-10-20T10:00:00Z") }),
      thought,
      ev({ itemId: "b", ...at("2026-10-10T10:00:00Z") }),
      { source: "wrap_up", id: "w1", ...at("2026-10-05T10:00:00Z"), event: {} as never },
    ]);
    expect(wall[0].items.map((i) => i.type)).toEqual(["cover", "card", "cover", "card"]);
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
    expect(firstCover(wall)).toMatchObject({ postId: "nuevo", reactions: 3 });
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
