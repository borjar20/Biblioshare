// @vitest-environment jsdom
// src/components/profile/profile-wall.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { FeedEntry, FeedEvent } from "@/lib/social/feed";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/social/feed-actions", () => ({ loadMoreProfileFeed: vi.fn() }));
vi.mock("@/components/social/feed-item", () => ({ FeedItem: ({ entry }: { entry: FeedEntry }) => <article data-testid="card">{entry.id}</article> }));

import { loadMoreProfileFeed } from "@/lib/social/feed-actions";
import { ProfileWall } from "./profile-wall";

afterEach(cleanup);

const person = (over: Partial<FeedEvent>): FeedEntry => {
  const event = {
    id: over.id ?? "posts:1", postId: "p1", actorId: "u", actorUsername: "mar", actorDisplayName: null, actorAvatarUrl: null,
    verb: "rated", entryStatus: null, itemType: "movie", itemId: "m1", itemTitle: "Pearl", itemCoverUrl: null, itemSubtitle: null,
    eventDate: "2026-10-10T10:00:00Z", orderDate: "2026-10-10T10:00:00Z", sortDate: "2026-10-10T10:00:00Z",
    rating: 10, reviewExcerpt: null, reviewIsSpoiler: false, episode: null, reviewMeta: null, progress: null, thought: null,
    interactionTarget: null, reactionCount: 2, viewerReacted: false, commentCount: 0, comments: [], reactions: {}, ...over,
  } as FeedEvent;
  return { source: "person", id: event.id, eventDate: event.eventDate, orderDate: event.orderDate, sortDate: event.sortDate, event };
};

const wrap = (events: FeedEntry[], cursor: string | null = null) =>
  render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      <ProfileWall actorId="u" initialEvents={events} initialCursor={cursor} initialKnownUsernames={[]} viewerLoggedIn />
    </NextIntlClientProvider>,
  );

describe("ProfileWall", () => {
  it("rotula el mes con su número de obras", () => {
    wrap([person({})]);
    expect(screen.getByText(/· 1 obra$/)).toBeTruthy();
  });

  it("la portada abre su publicación y anuncia título y estado", () => {
    wrap([person({})]);
    const link = screen.getByRole("link", { name: /Pearl/ });
    expect(link.getAttribute("href")).toBe("/post/p1");
  });

  it("sin publicación, la portada abre la ficha", () => {
    wrap([person({ postId: undefined })]);
    expect(screen.getByRole("link", { name: /Pearl/ }).getAttribute("href")).toBe("/pelicula/m1");
  });

  it("la reseña con texto es una baldosa de 2 columnas que abre la reseña y enseña la cita", () => {
    wrap([person({ verb: "reviewed", reviewExcerpt: "Preciosa", postId: "r9" })]);
    expect(screen.queryAllByTestId("card")).toHaveLength(0);
    const link = screen.getByRole("link", { name: /reseña: Preciosa/ });
    expect(link.getAttribute("href")).toBe("/post/r9");
    expect(link.closest("li")?.className).toContain("col-span-2");
    expect(screen.getByText("Preciosa")).toBeTruthy();
  });

  it("con spoiler no enseña el texto y sí «Reseña con spoilers»", () => {
    wrap([person({ verb: "reviewed", reviewExcerpt: "Se muere", reviewIsSpoiler: true })]);
    expect(screen.queryByText("Se muere")).toBeNull();
    expect(screen.getByText("Reseña con spoilers")).toBeTruthy();
    const link = screen.getByRole("link", { name: /reseña con spoilers/i });
    expect(link.getAttribute("aria-label")).not.toContain("Se muere");
  });

  it("la rejilla del mes rellena huecos (grid-flow-row-dense)", () => {
    wrap([person({})]);
    expect(screen.getByRole("list").className).toContain("grid-flow-row-dense");
  });

  it("un pensamiento se pinta como tarjeta de ancho completo", () => {
    wrap([person({ id: "posts:7", verb: "thought", thought: { body: "hola", isSpoiler: false, anchor: {} as never } })]);
    expect(screen.getByTestId("card").closest("li")?.className).toContain("col-span-full");
  });

  it("con cursor ofrece cargar más", () => {
    wrap([person({})], "c1");
    expect(screen.getByRole("button")).toBeTruthy();
  });

  it("la insignia «En curso» va en oro de texto (-ink)", () => {
    wrap([person({ verb: "started", rating: null })]);
    expect(screen.getByText("En curso").className).toContain("text-gold-ink");
  });

  it("«La dejó» atenúa solo la portada, no el enlace", () => {
    wrap([person({ verb: "dropped", rating: null })]);
    const link = screen.getByRole("link", { name: /Pearl/ });
    expect(link.className).not.toContain("opacity-55");
    expect(link.firstElementChild?.className).toContain("opacity-55");
  });

  it("solo episodios: muestra temporada y número", () => {
    wrap([person({ verb: "watchedEpisode", rating: null, itemType: "series", itemId: "s1", episode: { season: 2, episode: 1, title: null }, episodes: [1, 2, 3].map((n) => ({ season: 2, episode: n, title: null, rating: null })) })]);
    expect(screen.getByText(/^T2 · 3 ep\.$/i)).toBeTruthy();
  });

  it("el nombre accesible incluye las reacciones cuando hay", () => {
    wrap([person({ reactionCount: 3 })]);
    expect(screen.getByRole("link", { name: /3 reacciones/ })).toBeTruthy();
  });

  it("sin reacciones, el nombre no las menciona", () => {
    wrap([person({ reactionCount: 0 })]);
    expect(screen.getByRole("link", { name: /Pearl/ }).getAttribute("aria-label")).not.toMatch(/reacci/);
  });

  it("«Cargar más» une el mes partido entre páginas", async () => {
    vi.mocked(loadMoreProfileFeed).mockResolvedValue({
      events: [person({ id: "posts:0", verb: "dropped", rating: null, eventDate: "2026-10-05T10:00:00Z", sortDate: "2026-10-05T10:00:00Z", orderDate: "2026-10-05T10:00:00Z", reactionCount: 1 })],
      nextCursor: null,
      knownUsernames: [],
    } as never);
    wrap([person({ reactionCount: 2 })], "c1");
    await act(async () => { fireEvent.click(screen.getByRole("button")); });
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.getByText(/· 1 obra$/)).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /3 reacciones/ })).toBeTruthy();
  });
});
