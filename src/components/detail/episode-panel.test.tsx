// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    own: { watched: false, rating: null, review: null, reviewIsSpoiler: false, seenBefore: false, ...own },
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

function stubDesktop(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

// Variante que guarda los listeners de "change" para poder simular un cruce
// de breakpoint en caliente (resize real): cambia `matches` y dispara los
// listeners registrados, como haría el navegador.
function stubResizableDesktop(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    resize(next: boolean) {
      matches = next;
      listeners.forEach((l) => l());
    },
  };
}

describe("EpisodePanel · PC·1 en tres columnas", () => {
  it("en PC, sin episodio elegido, la tercera columna invita a elegir uno", () => {
    stubDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);
    expect(screen.getByTestId("episode-detail-column").textContent).toContain(
      messages.episode.pickEpisode,
    );
  });

  it("en PC, elegir un episodio lo abre en la columna y NO bajo su fila", () => {
    stubDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);
    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const column = screen.getByTestId("episode-detail-column");
    expect(column.querySelector("h3")?.textContent).toBe("Episodio 1x2");
    // Un solo cuadro de reseña en todo el panel: el de la columna.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(column.contains(screen.getByRole("textbox"))).toBe(true);
  });

  it("en móvil, el detalle se despliega bajo su fila (como siempre)", () => {
    stubDesktop(false);
    renderPanel([ep(1, 1), ep(1, 2)]);
    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(
      screen.getByTestId("episode-detail-column").contains(screen.getByRole("textbox")),
    ).toBe(false);
  });

  it("elegir un episodio en PC mueve el foco al título de la columna", () => {
    stubDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);
    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const heading = screen.getByTestId("episode-detail-column").querySelector("h3");
    expect(document.activeElement).toBe(heading);
  });

  it("elegir un episodio en PC sigue moviendo el foco al título tras cambiar a rejilla y volver a lista", () => {
    // Revisión final PR 4: EpisodeDetailColumn vive en la rama `list` del
    // `view === "grid" ? … : …`, así que lista → grid → lista la remonta.
    // Si el focusKey no se consume tras aplicar el foco, ese remontaje lo
    // vuelve a disparar sin que el usuario haya elegido nada.
    stubDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);
    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const heading = screen.getByTestId("episode-detail-column").querySelector("h3");
    expect(document.activeElement).toBe(heading);

    // Se retira el foco a propósito, como haría el usuario al seguir
    // navegando por el teclado o el ratón.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).not.toBe(heading);

    fireEvent.click(screen.getByRole("button", { name: "Rejilla" }));
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));

    const headingAfter = screen.getByTestId("episode-detail-column").querySelector("h3");
    expect(document.activeElement).not.toBe(headingAfter);
  });

  it("cruzar de PC a móvil con un borrador escrito conserva el mismo cuadro, ahora inline", () => {
    const { resize } = stubResizableDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "un borrador a medias" } });
    expect(screen.getAllByRole("textbox")).toHaveLength(1);

    act(() => resize(false));

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    const mobileTextarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(mobileTextarea.value).toBe("un borrador a medias");
    expect(
      screen.getByTestId("episode-detail-column").contains(mobileTextarea),
    ).toBe(false);
  });
});
