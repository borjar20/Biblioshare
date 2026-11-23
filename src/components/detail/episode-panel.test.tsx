// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { EpisodeRow } from "@/lib/series/get-episode-data";
import { ItemStatusProvider } from "./item-status-context";
import { useSeriesEpisodes } from "./series-episode-context";
import { EpisodeGrid } from "./episode-grid";
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
// Los server actions del margen arrastran server-only: aquí solo interesa el render.
vi.mock("@/lib/margin/actions", () => ({ createMarginNote: vi.fn() }));
vi.mock("@/lib/margin/follower-search", () => ({ searchMyFollowers: vi.fn() }));

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
function EpisodeControls() {
  const episodes = useSeriesEpisodes()!;
  return <>{episodes.primary}{episodes.feedback}{episodes.browser}</>;
}

function renderPanel(episodes: EpisodeRow[], initiallyExpanded = true) {
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
          initiallyExpanded={initiallyExpanded}
        >
          <EpisodeControls />
        </EpisodePanel>
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

it("agrupa todas las temporadas y calcula su media solo con las notas de la fuente elegida", () => {
  const first = ep(1, 1, { watched: true, rating: 6 });
  first.avgRating = 9;
  first.ratingCount = 2;
  const seasons = [
    { season: 1, episodes: [first, ...Array.from({ length: 24 }, (_, i) => ep(1, i + 2))] },
    ...Array.from({ length: 6 }, (_, i) => ({ season: i + 2, episodes: [ep(i + 2, 1)] })),
  ];
  const onSelect = vi.fn();
  const grid = (source: "community" | "mine") => (
    <NextIntlClientProvider locale="es" messages={messages}>
      <EpisodeGrid seasons={seasons} source={source} selectedKey={null} onSelect={onSelect} />
    </NextIntlClientProvider>
  );
  const { rerender } = render(grid("community"));
  const season = within(screen.getByRole("region", { name: "Temporada 1" }));
  expect(season.getByText("media 9.0")).toBeTruthy();
  const buttons = season.getAllByRole("button");
  expect(buttons).toHaveLength(25);
  expect(buttons[24].textContent).toContain("E25");
  expect(buttons[24].textContent).toContain("—");
  fireEvent.click(buttons[24]);
  expect(onSelect).toHaveBeenCalledWith(seasons[0].episodes[24]);
  expect(screen.getByRole("region", { name: "Temporada 7" })).toBeTruthy();
  rerender(grid("mine"));
  expect(season.getByText("media 6.0")).toBeTruthy();
});

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

  it("marca y deshace el siguiente sin abrir las temporadas", async () => {
    renderPanel([ep(1, 1), ep(1, 2)], false);
    const disclosure = screen.getByText(messages.episode.browseEpisodes).closest("details")!;
    expect(disclosure.open).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Visto: T1E1/ })));
    expect(screen.getByRole("button", { name: /Visto: T1E2/ })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: messages.episode.undoWatch })));
    expect(actions.setEpisodeWatched).toHaveBeenLastCalledWith("s1", 1, 1, false, LOCAL_DAY);
    expect(screen.getByRole("button", { name: /Visto: T1E1/ })).toBeTruthy();
    expect(disclosure.open).toBe(false);
  });

  it("restaura el cursor y avisa cuando la escritura del episodio falla", async () => {
    actions.setEpisodeWatched.mockRejectedValueOnce(new Error("write failed"));
    renderPanel([ep(1, 1), ep(1, 2)], false);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Visto: T1E1/ })));
    expect(screen.getByRole("alert").textContent).toBe(messages.episode.watchError);
    expect(screen.getByRole("button", { name: /Visto: T1E1/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: messages.episode.undoWatch })).toBeNull();
  });

  it("la cabecera marca el siguiente y ofrece puntuarlo en línea", () => {
    renderPanel([ep(1, 1, { watched: true }), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Visto: T1E2/ }));

    expect(actions.setEpisodeWatched).toHaveBeenCalledWith("s1", 1, 2, true, LOCAL_DAY);
    expect(screen.getByRole("group", { name: "¿Qué tal T1E2?" })).toBeTruthy();
  });
});

function stubDesktop(matches: boolean) {
  stubResizableDesktop(matches);
}

function stubResizableDesktop(initialMatches: boolean) {
  let width = initialMatches ? 800 : 390;
  const callbacks = new Set<() => void>();
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    notify = () => this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    observe() { callbacks.add(this.notify); this.notify(); }
    disconnect() { callbacks.delete(this.notify); }
  });
  return {
    resize(wide: boolean) {
      width = wide ? 800 : 390;
      callbacks.forEach((callback) => callback());
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

  it("guarda el borrador enfocado al cruzar de PC a móvil sin blur (#1216)", () => {
    const { resize } = stubResizableDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const textarea = screen.getByRole("textbox");
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: "reseña sin blur" } });

    act(() => resize(false));

    expect(actions.rateEpisode).toHaveBeenCalledTimes(1);
    expect(actions.rateEpisode).toHaveBeenCalledWith("s1", 1, 2, null, "reseña sin blur", false, LOCAL_DAY);
  });

  it("no duplica el guardado normal al perder foco antes del cambio de breakpoint", () => {
    const { resize } = stubResizableDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const textarea = screen.getByRole("textbox");
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: "reseña normal" } });
    fireEvent.blur(textarea);
    act(() => resize(false));

    expect(actions.rateEpisode).toHaveBeenCalledTimes(1);
  });

  it("guarda una vez si blur llega después del breakpoint pero antes del commit", () => {
    const { resize } = stubResizableDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const textarea = screen.getByRole("textbox");
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: "reseña con blur antes del commit" } });

    act(() => {
      resize(false);
      expect(textarea.isConnected).toBe(true);
      fireEvent.blur(textarea);
    });

    expect(actions.rateEpisode).toHaveBeenCalledTimes(1);
  });

  it("no guarda al cruzar el breakpoint sin foco o sin cambios", () => {
    const { resize } = stubResizableDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    act(() => resize(false));

    expect(actions.rateEpisode).not.toHaveBeenCalled();
  });

  it("no guarda un borrador cambiado que no conserva foco al cruzar el breakpoint", () => {
    const { resize } = stubResizableDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "sin foco" } });
    act(() => resize(false));

    expect(actions.rateEpisode).not.toHaveBeenCalled();
  });

  it("no guarda un cuadro enfocado sin cambios al cruzar el breakpoint", () => {
    const { resize } = stubResizableDesktop(true);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    fireEvent.focus(screen.getByRole("textbox"));
    act(() => resize(false));

    expect(actions.rateEpisode).not.toHaveBeenCalled();
  });

  it("guarda también al cruzar de móvil a PC con el cuadro enfocado", () => {
    const { resize } = stubResizableDesktop(false);
    renderPanel([ep(1, 1), ep(1, 2)]);

    fireEvent.click(screen.getByRole("button", { name: /Episodio 1x2/ }));
    const textarea = screen.getByRole("textbox");
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: "reseña desde móvil" } });
    act(() => resize(true));

    expect(actions.rateEpisode).toHaveBeenCalledTimes(1);
    expect(actions.rateEpisode).toHaveBeenCalledWith("s1", 1, 2, null, "reseña desde móvil", false, LOCAL_DAY);
  });
});
