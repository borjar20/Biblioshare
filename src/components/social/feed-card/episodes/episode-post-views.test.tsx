// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../../messages/es.json";
import type { FeedEpisode } from "@/lib/social/feed";
import { EpisodeList } from "./episode-list";
import { EpisodeHighlights } from "./episode-highlights";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      {node}
    </NextIntlClientProvider>,
  );
}

const ep = (episode: number, rating: number | null): FeedEpisode => ({ season: 1, episode, title: `Título ${episode}`, rating });

describe("EpisodeList", () => {
  it("todos los episodios con título y nota sobre 5; el mejor con ★", () => {
    const eps = [ep(1, 6), ep(2, 9), ep(3, null), ep(4, 7)];
    const { container } = wrap(<EpisodeList episodes={eps} itemType="series" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(container.textContent).toContain("Título 3");
    expect(container.textContent).toContain("4,5");
    expect(screen.getByText("Título 2").parentElement!.textContent).toContain("★");
  });

  it("el ★ del mejor tiene nombre accesible y las demás filas no lo llevan", () => {
    const eps = [ep(1, 6), ep(2, 9), ep(3, null), ep(4, 7)];
    wrap(<EpisodeList episodes={eps} itemType="series" />);
    expect(screen.getAllByRole("img", { name: "Mejor episodio" })).toHaveLength(1);
    expect(screen.getByText("Título 1").parentElement!.textContent).not.toContain("★");
    expect(screen.getByText("Título 4").parentElement!.textContent).not.toContain("★");
  });

  it("con varias temporadas usa códigos largos para no confundir dos «E4»", () => {
    const eps = [{ ...ep(26, 6), season: 1 }, { ...ep(1, 8), season: 2 }];
    const { container } = wrap(<EpisodeList episodes={eps} itemType="series" />);
    expect(container.textContent).toContain("S1E26");
    expect(container.textContent).toContain("S2E1");
  });
});

describe("EpisodeHighlights", () => {
  it("sin notas no pinta columnas vacías, pero sí «Ver los 13 episodios»", () => {
    const eps = Array.from({ length: 13 }, (_, i) => ep(i + 1, null));
    const { container } = wrap(<EpisodeHighlights episodes={eps} itemType="series" />);
    expect(container.textContent).not.toContain("Lo mejor");
    expect(container.textContent).not.toContain("Lo peor");
    expect(screen.getByRole("button", { name: "Ver los 13 episodios" })).toBeTruthy();
  });

  const many = Array.from({ length: 14 }, (_, i) => ep(i + 1, [6, 10, 4, 8, 2, 7, 9, 5, 6, 3, 8, 7, 6, 5][i]));

  it("3 mejores y 3 peores, el resto plegado", () => {
    const { container } = wrap(<EpisodeHighlights episodes={many} itemType="series" />);
    expect(container.textContent).toContain("Lo mejor");
    expect(container.textContent).toContain("Lo peor");
    expect(container.textContent).toContain("Título 2"); // 10
    expect(container.textContent).toContain("Título 5"); // 2
    expect(container.textContent).not.toContain("Título 13");
  });

  it("«Ver los 14 episodios» despliega la lista completa y «Ver menos» la recoge", () => {
    const { container } = wrap(<EpisodeHighlights episodes={many} itemType="series" />);
    fireEvent.click(screen.getByRole("button", { name: "Ver los 14 episodios" }));
    expect(container.textContent).toContain("Título 13");
    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(container.textContent).not.toContain("Título 13");
  });
});
