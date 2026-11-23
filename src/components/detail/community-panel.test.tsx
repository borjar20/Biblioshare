// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Community } from "@/lib/community/get-community";
import type { EpisodeReview } from "@/lib/series/get-episode-reviews";
import { CommunityPanel, CommunityReviews } from "./community-panel";

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
  return render(<>{await CommunityPanel({ itemType: "series", community, reviewCount: community.reviews.length + (episodeReviews?.length ?? 0) })}
    {await CommunityReviews({itemType: "series", viewerLoggedIn: true, community, episodeReviews})}</>);
}

afterEach(cleanup);

describe("CommunityPanel en la ficha compartida", () => {
  it("resume la ausencia de actividad en una línea", async () => {
    const { container } = await renderPanel(empty);
    expect(screen.getByText("communityEmpty")).toBeTruthy();
    expect(container.querySelector("details, article")).toBeNull();
  });

  it("muestra la distribución desde la primera valoración", async () => {
    const { container } = await renderPanel({
      ...empty, avgRating: 7, ratingCount: 1, distribution: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    });
    expect(container.textContent).toContain("3,5/5");
    expect(screen.getByText("ratings 1")).toBeTruthy();
    expect(screen.getByRole("group", { name: "ratingDistribution" })).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
  });

  it("muestra los diez intervalos sin desplegar ningún control", async () => {
    await renderPanel({
      ...empty, avgRating: 7.5, ratingCount: 2, distribution: [0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    });
    const chart = screen.getByRole("group", { name: "ratingDistribution" });
    expect(chart.closest("details")).toBeNull();
    expect(chart.querySelectorAll("button")).toHaveLength(10);
  });

  it("destaca la reseña más reciente entre pase y episodio y conserva spoilers e interacciones al desplegar", async () => {
    const common = {
      id: "pass", interactionTargetId: "pase-hilo", author: "Ana", initials: "A",
      username: null, avatarUrl: null, rating: null, text: "El desenlace",
      isSpoiler: true, reactionCount: 0, viewerReacted: false, commentCount: 0,
      comments: [], reactions: {},
    };
    await renderPanel({
      ...empty, reviews: [3, 2, 1].map(day => ({ ...common, id: String(day), text: day === 1 ? common.text : String(day), editionLabel: null, finishedOn: "2026-11-0"+day })),
    }, [{
      ...common, id: "episode", interactionTargetId: "episodio-hilo", watchedOn: "2026-11-21",
      isSpoiler: false, text: "El estreno", season: 1, episode: 1, episodeTitle: null,
    }]);

    expect(screen.getByText("El estreno").closest("details")).toBeNull();
    expect(screen.getByText("episodio-hilo").closest("article")?.textContent).toContain("S1E1");
    expect(screen.queryByText("El desenlace")).toBeNull();
    const summary = screen.getByText("moreReviews 1");
    fireEvent.click(summary);
    fireEvent.click(screen.getAllByRole("button", { name: "progress.showSpoiler" }).at(-1)!);
    expect(screen.getByText("El desenlace").closest("article")?.textContent).toContain("pase-hilo");
  });
});
