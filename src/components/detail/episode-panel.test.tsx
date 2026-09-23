// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import { ItemStatusProvider } from "./item-status-context";
import { EpisodePanel } from "./episode-panel";

// Las server actions no deben tocar Supabase: se sustituyen por espías para
// comprobar QUÉ se pide al servidor.
const actions = vi.hoisted(() => ({
  setEpisodeWatched: vi.fn(async () => {}),
  rateEpisode: vi.fn(async () => {}),
  markEpisodesWatched: vi.fn(async () => {}),
}));
vi.mock("@/lib/series/episode-actions", () => actions);
vi.mock("@/lib/passes/actions", () => ({ ratePass: vi.fn() }));
vi.mock("@/lib/library/manage-actions", () => ({ updateStatus: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));

afterEach(cleanup);

// Fase 4: las acciones llevan la fecha LOCAL del visionado.
const LOCAL_DAY = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/);
beforeEach(() => vi.clearAllMocks());

function ep(season: number, episode: number, own: Partial<EpisodeRow["own"]> = {}): EpisodeRow {
  return {
    season,
    episode,
    title: `Episodio ${season}x${episode}`,
    synopsis: null,
    stillUrl: null,
    airDate: "2020-01-01",
    runtimeMinutes: null,
    avgRating: null,
    ratingCount: 0,
    own: { watched: false, rating: null, review: null, seenBefore: false, ...own },
    aired: true,
  };
}

// Los textos salen de `messages/es.json` DE VERDAD: una clave que falte rompe
// el test en vez de pintar la clave cruda.
function renderPanel(episodes: EpisodeRow[]) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus="in_progress">
        <EpisodePanel
          seriesId="s1"
          airing={false}
          nextAirDate={null}
          pass={{ id: "p1", rating: null }}
          seasons={[{ season: 1, episodes }]}
          isLoggedIn
        />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

describe("EpisodePanel · fase 3", () => {
  it("desmarcar un episodio con nota pide confirmación, y si se cancela no llama al servidor (#1194)", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel([ep(1, 1, { watched: true, rating: 8 }), ep(1, 2)]);

    fireEvent.click(screen.getAllByRole("button", { name: "Visto" })[0]);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(actions.setEpisodeWatched).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("desmarcar un episodio sin nota ni reseña no pregunta", () => {
    const confirm = vi.spyOn(window, "confirm");
    renderPanel([ep(1, 1, { watched: true }), ep(1, 2)]);

    fireEvent.click(screen.getAllByRole("button", { name: "Visto" })[0]);

    expect(confirm).not.toHaveBeenCalled();
    expect(actions.setEpisodeWatched).toHaveBeenCalledWith("s1", 1, 1, false, LOCAL_DAY);
    confirm.mockRestore();
  });

  it("«Marcar los que faltan» manda de una vez solo lo emitido y sin ver de la temporada", () => {
    renderPanel([ep(1, 1, { watched: true }), ep(1, 2), ep(1, 3), { ...ep(1, 4), aired: false }]);

    fireEvent.click(screen.getAllByRole("button", { name: "Marcar los 2 que faltan" })[0]);

    expect(actions.markEpisodesWatched).toHaveBeenCalledWith(
      "s1",
      [
        { season: 1, episode: 2 },
        { season: 1, episode: 3 },
      ],
      LOCAL_DAY,
    );
  });

  it("la cabecera marca el siguiente y ofrece puntuarlo en línea", () => {
    renderPanel([ep(1, 1, { watched: true }), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Visto: T1E2/ }));

    expect(actions.setEpisodeWatched).toHaveBeenCalledWith("s1", 1, 2, true, LOCAL_DAY);
    expect(screen.getByRole("group", { name: "¿Qué tal T1E2?" })).toBeTruthy();
  });
});
