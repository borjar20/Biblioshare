// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/experiencias" }));
vi.mock("@/lib/experiences/participant-actions", () => ({ setFavorite: vi.fn() }));
vi.mock("@/lib/social/post-actions", () => ({ deletePost: vi.fn() }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
import type { ExperienceFeedEvent } from "@/lib/social/feed";
import { MomentFavorite } from "./moment-favorite";
import { ExperienceCard } from "./experience-card";
import { ExperienceFiltersBar } from "./experience-filters";
import { ExperienceFeedCard } from "@/components/social/experience-feed-card";
import { withIntl, detailFixture } from "./test-helpers";
afterEach(cleanup);

describe("favorito, nota en tarjetas y orden del hub", () => {
  it("favorite uses the ribbon, never a star", () => {
    const e = detailFixture({ state: "lived", ownAttendance: "attended" });
    const { container } = render(withIntl(<MomentFavorite experience={e} moment={e.moments[0]} />));
    expect(container.querySelector("[data-icon='ribbon']")).not.toBeNull();
    expect(screen.getByRole("button", { name: /mi momento/i })).toBeTruthy();
    expect(screen.getByText("Mi momento")).toBeTruthy();
  });

  it("card shows the visible average only when there is one", () => {
    const e = detailFixture({});
    const { rerender } = render(withIntl(<ExperienceCard experience={{ ...e, rating: null }} />));
    expect(screen.queryByText(/reseña/)).toBeNull();
    rerender(withIntl(<ExperienceCard experience={{ ...e, rating: { avg: 8.5, count: 2 } }} />));
    expect(screen.getByText("8.5")).toBeTruthy();
    expect(screen.getByText(/2 reseñas/)).toBeTruthy();
  });

  it("hub offers sorting by rating", () => {
    render(withIntl(<ExperienceFiltersBar filters={{ state: "all", sort: "recent" }} people={[]} showSort />));
    expect(screen.getByRole("link", { name: "Mejor valoradas" }).getAttribute("href")).toBe("/experiencias?sort=rating");
    expect(screen.getByRole("link", { name: "Recientes" }).getAttribute("aria-current")).toBe("page");
  });

  it("recent sort writes a clean URL and any filter change resets cursor and offset", () => {
    render(withIntl(<ExperienceFiltersBar filters={{ state: "lived", sort: "rating", offset: 24, cursor: "c" }} people={[]} showSort />));
    expect(screen.getByRole("link", { name: "Recientes" }).getAttribute("href")).toBe("/experiencias?state=lived");
    expect(screen.getByRole("link", { name: "Por vivir" }).getAttribute("href")).toBe("/experiencias?state=planned&sort=rating");
  });

  it("profile filters do not offer sorting", () => {
    render(withIntl(<ExperienceFiltersBar filters={{ state: "all" }} people={[]} basePath="/u/mar?tab=experiencias" />));
    expect(screen.queryByRole("link", { name: "Mejor valoradas" })).toBeNull();
  });

  it("excerpt shows the rating in dots and keeps «Solo puso nota» as text fallback", () => {
    const e = detailFixture({});
    const { rerender } = render(withIntl(<ExperienceCard experience={e} excerpt={{ momentId: "moment-1", rating: 8, body: "Muy bonito" }} />));
    expect(screen.getByRole("img", { name: "4 de 5" })).toBeTruthy();
    expect(screen.getByText("Muy bonito")).toBeTruthy();
    expect(screen.queryByText("Solo puso nota")).toBeNull();
    rerender(withIntl(<ExperienceCard experience={e} excerpt={{ momentId: "moment-1", rating: 7, body: null }} />));
    expect(screen.getByRole("img", { name: "3,5 de 5" })).toBeTruthy();
    expect(screen.getByText("Solo puso nota")).toBeTruthy();
    rerender(withIntl(<ExperienceCard experience={e} excerpt={{ momentId: "moment-1", rating: null, body: "Solo texto" }} />));
    expect(screen.queryByRole("img", { name: /de 5/ })).toBeNull();
  });

  it("feed review header starts uppercase when the actor is hidden", () => {
    const e = detailFixture({});
    const event = { id: "ev", postId: null, actorId: "viewer", actorUsername: "yo", actorDisplayName: "Yo", actorAvatarUrl: null, eventDate: "2026-10-04T10:00:00Z", orderDate: "2026-10-04T10:00:00Z", sortDate: "2026-10-04T10:00:00Z", interactionTarget: null, reactionCount: 0, viewerReacted: false, commentCount: 0, comments: [], reactions: [], viewerCanDelete: false, kind: "experience", experience: e, body: null, review: { id: "r1", momentId: "moment-1", momentTitle: "Museo", rating: 8, body: null } } as unknown as ExperienceFeedEvent;
    const { rerender } = render(withIntl(<ExperienceFeedCard event={event} viewerLoggedIn hideActor knownUsernames={[]} />));
    expect(screen.getByText(/reseñó Museo/i).className).toContain("first-letter:uppercase");
    rerender(withIntl(<ExperienceFeedCard event={event} viewerLoggedIn knownUsernames={[]} />));
    expect(screen.getByText(/reseñó Museo/i).className).not.toContain("first-letter:uppercase");
  });
});
