// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import { EpisodeDetailColumn, type EpisodeDetailColumnProps } from "./episode-detail-column";

vi.mock("next/image", () => ({ default: () => null }));
// Los server actions del margen arrastran server-only: aquí solo interesa el render.
vi.mock("@/lib/margin/actions", () => ({ createMarginNote: vi.fn() }));
vi.mock("@/lib/margin/follower-search", () => ({ searchMyFollowers: vi.fn() }));
afterEach(cleanup);

const episode: EpisodeRow = {
  season: 2,
  episode: 3,
  title: "Tormenta",
  synopsis: "Todo se complica en la costa.",
  stillUrl: null,
  airDate: "2020-01-01",
  runtimeMinutes: 48,
  avgRating: null,
  ratingCount: 0,
  own: { watched: false, rating: null, review: null, seenBefore: false },
  aired: true,
} as EpisodeRow;

const base: EpisodeDetailColumnProps = {
  episode,
  own: episode.own,
  source: "mine",
  interactive: true,
  isPending: false,
  draft: "",
  onDraftChange: () => {},
  onReviewFocusChange: () => {},
  onSave: () => {},
  markUpToCount: 0,
  onMarkUpTo: () => {},
  focusKey: null,
};

function renderColumn(props: Partial<EpisodeDetailColumnProps> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <EpisodeDetailColumn {...base} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("EpisodeDetailColumn", () => {
  it("sin episodio: estado vacío con el texto de es.json", () => {
    renderColumn({ episode: null, own: null });
    expect(screen.getByText(messages.episode.pickEpisode)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("con episodio: código, título, sinopsis y el cuadro de reseña", () => {
    renderColumn();
    expect(screen.getByText("T2E3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tormenta" })).toBeTruthy();
    expect(screen.getByText("Todo se complica en la costa.")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("«Dejar nota en este episodio» solo en episodios vistos (y con itemId)", () => {
    const watched = { ...episode.own, watched: true };
    renderColumn({ itemId: "s1", own: watched });
    expect(screen.getByRole("button", { name: "Dejar nota en este episodio" })).toBeTruthy();
    cleanup();
    renderColumn({ itemId: "s1" });
    expect(screen.queryByRole("button", { name: "Dejar nota en este episodio" })).toBeNull();
    cleanup();
    renderColumn({ own: watched });
    expect(screen.queryByRole("button", { name: "Dejar nota en este episodio" })).toBeNull();
  });

  it("sin título, usa el «sin título» de es.json", () => {
    renderColumn({ episode: { ...episode, title: null } as EpisodeRow });
    expect(screen.getByRole("heading", { name: messages.episode.untitled })).toBeTruthy();
  });

  it("con focusKey no nulo, el título recibe el foco (tabIndex -1)", () => {
    renderColumn({ focusKey: "2:3:123" });
    const heading = screen.getByRole("heading", { name: "Tormenta" });
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("con focusKey null (montaje), el título NO recibe el foco", () => {
    renderColumn({ focusKey: null });
    const heading = screen.getByRole("heading", { name: "Tormenta" });
    expect(document.activeElement).not.toBe(heading);
  });
});
