// @vitest-environment jsdom
// src/components/profile/profile-wall.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { FeedEntry, FeedEvent } from "@/lib/social/feed";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/social/feed-actions", () => ({ loadMoreProfileFeed: vi.fn() }));
vi.mock("@/components/social/feed-item", () => ({ FeedItem: ({ entry }: { entry: FeedEntry }) => <article data-testid="card">{entry.id}</article> }));

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

  it("una reseña con texto pinta además su tarjeta", () => {
    wrap([person({ verb: "reviewed", reviewExcerpt: "Preciosa" })]);
    expect(screen.getAllByTestId("card")).toHaveLength(1);
  });

  it("con cursor ofrece cargar más", () => {
    wrap([person({})], "c1");
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
