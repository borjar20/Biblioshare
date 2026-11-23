// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Community } from "@/lib/community/get-community";
import type { EpisodeReview } from "@/lib/series/get-episode-reviews";
import { CommunityPanel } from "./community-panel";

const { translate } = vi.hoisted(() => ({
  translate: (key: string, args?: { count: number }) => args ? `${key} ${args.count}` : key,
}));
vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => translate,
  getFormatter: async () => ({ dateTime: (date: Date) => date.toISOString() }),
}));
vi.mock("@/components/social/review-interactions", () => ({
  ReviewInteractions: ({ interactionTargetId }: { interactionTargetId: string }) => (
    <button>{interactionTargetId}</button>
  ),
}));

const empty: Community = {
  avgRating: null, ratingCount: 0, distribution: Array(10).fill(0),
  knownUsernames: [], reviews: [],
};

async function renderPanel(community: Community, episodeReviews?: EpisodeReview[]) {
  return render(await CommunityPanel({ itemType: "series", viewerLoggedIn: true, community, episodeReviews }));
}

afterEach(cleanup);

describe("CommunityPanel en la ficha compartida", () => {
  it("resume la ausencia de actividad en una línea", async () => {
    const { container } = await renderPanel(empty);
    expect(screen.getByText("communityEmpty")).toBeTruthy();
    expect(container.querySelector("details, article")).toBeNull();
  });

  it("muestra una única nota sobre cinco sin ofrecer distribución", async () => {
    const { container } = await renderPanel({
      ...empty, avgRating: 7, ratingCount: 1, distribution: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    });
    expect(container.textContent).toContain("3,5/5");
    expect(screen.getByText("ratings 1")).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
  });

  it("con varias notas la distribución conserva sus diez cubos y se puede desplegar", async () => {
    await renderPanel({
      ...empty, avgRating: 7.5, ratingCount: 2, distribution: [0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    });
    const summary = screen.getByText("ratingDistribution");
    const disclosure = summary.closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
    expect(disclosure.querySelectorAll("button")).toHaveLength(10);
  });

  it("destaca la reseña más reciente entre pase y episodio y conserva spoilers e interacciones al desplegar", async () => {
    const common = {
      id: "pass", interactionTargetId: "pase-hilo", author: "Ana", initials: "A",
      username: null, avatarUrl: null, rating: null, text: "El desenlace",
      isSpoiler: true, reactionCount: 0, viewerReacted: false, commentCount: 0,
      comments: [], reactions: {},
    };
    await renderPanel({
      ...empty, reviews: [{ ...common, editionLabel: null, finishedOn: "2026-11-20" }],
    }, [{
      ...common, id: "episode", interactionTargetId: "episodio-hilo", watchedOn: "2026-11-21",
      isSpoiler: false, text: "El estreno", season: 1, episode: 1, episodeTitle: null,
    }]);

    expect(screen.getByText("El estreno").closest("details")).toBeNull();
    expect(screen.getByText("episodio-hilo").closest("article")?.textContent).toContain("S1E1");
    expect(screen.queryByText("El desenlace")).toBeNull();
    const summary = screen.getByText("moreReviews 1");
    const disclosure = summary.closest("details")!;
    expect(disclosure.open).toBe(false);
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "progress.showSpoiler" }));
    expect(screen.getByText("El desenlace").closest("article")?.textContent).toContain("pase-hilo");
  });
});
