import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => null }));
import { getFeed, getPostContext, getPostEvent, isWrapUpEvent } from "./feed";
import { parseShareSummary } from "./feed-wrap-ups";
import { fakeSupabase, FAKE_ACTOR_ID } from "./fake-feed-supabase";
import type { ShareSummary } from "@/lib/wrap-ups/types";

const SHARE_ID = "5b0f3a52-8f0e-4b1f-9a3e-1c2d3e4f5a6b";
const summary: ShareSummary = {
  kind: "week", periodStart: "2026-09-28", periodEnd: "2026-10-04", narrator: "reader", palette: "book",
  minutes: 372, episodesWithoutRuntime: 0, finished: 2,
  covers: [
    { type: "book", id: "b1", title: "La sombra del viento", coverUrl: "https://covers.example/b1.jpg", times: 1 },
    { type: "movie", id: "m1", title: "Perfect Days", coverUrl: null, times: 1 },
  ],
  pet: { name: "Bellota", petClass: "wizard", stage: "young" },
};
const wrapPost = (over: Record<string, unknown> = {}) => ({
  id: "wp", author_id: FAKE_ACTOR_ID, kind: "wrap_up", anchor_type: "wrap_up", anchor_id: SHARE_ID,
  source_kind: "wrap_up_share", source_id: SHARE_ID, body: null, created_at: "2026-10-05T08:00:00Z", ...over,
});

describe("posts wrap_up en el feed", () => {
  it("un share visible da una entrada wrap_up con el resumen público", async () => {
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [{ id: SHARE_ID, summary }] });
    const page = await getFeed(sb.client, "viewer", {});
    expect(page.events).toHaveLength(1);
    const entry = page.events[0];
    if (entry.source !== "wrap_up") throw new Error(`Wrong source ${entry.source}`);
    expect(entry.id).toBe("posts:wp");
    expect(entry.event.kind).toBe("wrap_up");
    expect(entry.event.shareId).toBe(SHARE_ID);
    expect(entry.event.summary.minutes).toBe(372);
    expect(entry.event.summary.covers).toHaveLength(2);
    expect(entry.event.actorUsername).toBe(`user_${FAKE_ACTOR_ID}`);
    expect(entry.event.interactionTarget?.interactionTargetId).toBe("interaction-target:post:wp");
    expect(entry.event).not.toHaveProperty("itemType");
    expect(isWrapUpEvent(entry.event)).toBe(true);
    expect(sb.inFilters.wrap_up_shares?.id).toEqual([SHARE_ID]);
  });

  it("si la RLS oculta el share, el post no aparece (nunca media tarjeta)", async () => {
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [] });
    const page = await getFeed(sb.client, "viewer", {});
    expect(page.events).toEqual([]);
  });

  it("un resumen inválido descarta el post", async () => {
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [{ id: SHARE_ID, summary: { ...summary, minutes: "mucho" } }] });
    const page = await getFeed(sb.client, "viewer", {});
    expect(page.events).toEqual([]);
  });

  it("convive con un post de catálogo sin romper el mapeo del catálogo", async () => {
    const sb = fakeSupabase({
      posts: [wrapPost(), { id: "t1", kind: "thought", body: "Hola", created_at: "2026-10-04T08:00:00Z" }],
      wrapUpShares: [{ id: SHARE_ID, summary }],
    });
    const page = await getFeed(sb.client, "viewer", {});
    expect(page.events.map((e) => [e.id, e.source])).toEqual([["posts:wp", "wrap_up"], ["posts:t1", "person"]]);
  });

  it.each(["book", "screen"] as const)("el filtro %s no pide posts wrap_up (anchor_type de catálogo)", async (filter) => {
    const sb = fakeSupabase({ posts: [], wrapUpShares: [{ id: SHARE_ID, summary }] });
    await getFeed(sb.client, "viewer", { filter });
    expect(sb.inFilters.posts?.anchor_type).not.toContain("wrap_up");
    expect(sb.inFilters.posts?.anchor_type?.length).toBeGreaterThan(0);
  });

  it("«Reseñas» no trae wrap_up aunque la fila llegase", async () => {
    // El doble no aplica `.eq("kind", "finished")`: aun así no se resuelve como crónica.
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [{ id: SHARE_ID, summary }] });
    const page = await getFeed(sb.client, "viewer", { filter: "reviews" });
    expect(sb.eqFilters.posts?.kind).toBe("finished");
    expect(page.events.some((e) => e.source === "wrap_up")).toBe(false);
  });

  it("«Clubes» no pide posts", async () => {
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [{ id: SHARE_ID, summary }] });
    const page = await getFeed(sb.client, "viewer", { filter: "clubs" });
    expect(page.events.some((e) => e.source === "wrap_up")).toBe(false);
  });

  it("el feed de perfil (actor) también la pinta", async () => {
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [{ id: SHARE_ID, summary }] });
    const page = await getFeed(sb.client, null, { actorId: FAKE_ACTOR_ID });
    expect(page.events.map((e) => e.source)).toEqual(["wrap_up"]);
  });
});

describe("posts wrap_up en /post/[id]", () => {
  it("getPostEvent devuelve el evento wrap_up y getPostContext no busca obra", async () => {
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [{ id: SHARE_ID, summary }] });
    const detail = await getPostEvent(sb.client, null, "wp");
    expect(detail).not.toBeNull();
    const event = detail!.event;
    if (!isWrapUpEvent(event)) throw new Error("Wrong event");
    expect(event.summary.finished).toBe(2);
    expect(event.shareId).toBe(SHARE_ID);
    const context = await getPostContext(sb.client, event);
    expect(context.moreAboutWork).toEqual([]);
    // «Más de» no repite el propio post (el doble no aplica `.neq`; aquí basta con que no reviente
    // y con que ninguna crónica caiga en los raíles, que pintan obras).
    expect(context.moreByAuthor.every((p) => p.postId !== "wp")).toBe(true);
  });

  it("getPostEvent devuelve null si el share no es visible", async () => {
    const sb = fakeSupabase({ posts: [wrapPost()], wrapUpShares: [] });
    expect(await getPostEvent(sb.client, null, "wp")).toBeNull();
  });
});

describe("parseShareSummary", () => {
  it("acepta el resumen que escribe el servidor", () => {
    expect(parseShareSummary(summary)).toEqual(summary);
  });
  it("recorta a 4 portadas y descarta las ilegibles", () => {
    const covers = Array.from({ length: 6 }, (_, i) => ({ type: "book", id: `b${i}`, title: `T${i}`, coverUrl: null, times: 1 }));
    const parsed = parseShareSummary({ ...summary, covers: [{ nope: true }, ...covers] });
    expect(parsed?.covers.map((c) => c.id)).toEqual(["b0", "b1", "b2", "b3"]);
  });
  it("una portada con URL no http(s) se queda sin imagen (carta con título)", () => {
    const parsed = parseShareSummary({ ...summary, covers: [{ ...summary.covers[0], coverUrl: "javascript:alert(1)" }] });
    expect(parsed?.covers[0].coverUrl).toBeNull();
  });
  it("una ardilla ilegible se trata como sin ardilla", () => {
    expect(parseShareSummary({ ...summary, pet: { name: "X", petClass: "dragon", stage: "young" } })?.pet).toBeNull();
  });
  it.each([
    ["null", null],
    ["kind desconocido", { ...summary, kind: "day" }],
    ["fecha rota", { ...summary, periodStart: "ayer" }],
    ["narradora desconocida", { ...summary, narrator: "pirate" }],
    ["paleta desconocida", { ...summary, palette: "music" }],
    ["minutos negativos", { ...summary, minutes: -1 }],
    ["minutos no finitos", { ...summary, minutes: Number.NaN }],
    ["terminadas no enteras", { ...summary, finished: 1.5 }],
    ["portadas que no son lista", { ...summary, covers: "x" }],
  ])("rechaza: %s", (_label, raw) => {
    expect(parseShareSummary(raw)).toBeNull();
  });
});
