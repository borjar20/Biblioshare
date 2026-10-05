// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../../messages/es.json";
import type { FeedEpisode } from "@/lib/social/feed";
import { EpisodeTiles } from "./episode-tiles";
import { EpisodeCurve } from "./episode-curve";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      {node}
    </NextIntlClientProvider>,
  );
}

const ep = (episode: number, rating: number | null, title: string | null = `Título ${episode}`, season = 1): FeedEpisode => ({ season, episode, title, rating });

describe("EpisodeTiles", () => {
  it("una ficha por episodio con la nota sobre 5 y el título", () => {
    const { container } = wrap(<EpisodeTiles episodes={[ep(4, 8), ep(5, 7)]} itemType="series" size="feed" />);
    expect(container.textContent).toContain("S1E4");
    expect(container.textContent).toContain("Título 5");
    expect(container.textContent).toContain("3,5/5");
  });

  it("el mejor lleva ★; sin nota dice «sin nota»", () => {
    const { container } = wrap(<EpisodeTiles episodes={[ep(4, 9), ep(5, null), ep(6, 6)]} itemType="series" size="feed" />);
    expect(container.textContent).toContain("S1E4 ★");
    expect(container.textContent).not.toContain("S1E6 ★");
    expect(container.textContent).toContain("sin nota");
  });
});

describe("EpisodeCurve", () => {
  const four = [ep(4, 8), ep(5, 7), ep(6, null), ep(7, 10)];

  it("es una imagen con las notas de cada episodio en su nombre accesible", () => {
    wrap(<EpisodeCurve episodes={four} size="feed" />);
    expect(screen.getByRole("img", { name: /S1E4: 4; S1E5: 3,5; S1E6: sin nota; S1E7: 5/ })).toBeTruthy();
  });

  it("eje 1-5 siempre, también en modo compacto", () => {
    const many = Array.from({ length: 14 }, (_, i) => ep(i + 1, 6 + (i % 4)));
    const { container } = wrap(<EpisodeCurve episodes={many} size="feed" />);
    const axis = [...container.querySelectorAll("[data-axis-tick]")].map((n) => n.textContent);
    expect(axis).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("en el feed, etiquetas por punto hasta 8; desde 9, sin etiquetas", () => {
    const { container: few } = wrap(<EpisodeCurve episodes={four} size="feed" />);
    expect(few.querySelectorAll("[data-point-label]")).toHaveLength(3);
    cleanup();
    const nine = Array.from({ length: 9 }, (_, i) => ep(i + 1, 7));
    const { container: many } = wrap(<EpisodeCurve episodes={nine} size="feed" />);
    expect(many.querySelectorAll("[data-point-label]")).toHaveLength(0);
  });

  it("en el post hay dos SVG: con 9 episodios ambos llevan etiquetas", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ep(i + 1, 5 + (i % 5)));
    const { container } = wrap(<EpisodeCurve episodes={nine} size="post" />);
    const [narrow, wide] = [...container.querySelectorAll("svg")];
    expect(container.querySelectorAll("svg")).toHaveLength(2);
    expect(narrow.querySelectorAll("[data-point-label]")).toHaveLength(9);
    expect(wide.querySelectorAll("[data-point-label]")).toHaveLength(9);
  });

  it("en el post con 14: el estrecho (móvil) es compacto con pie y el ancho lleva etiquetas", () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => ep(i + 1, 5 + (i % 5)));
    const { container } = wrap(<EpisodeCurve episodes={fourteen} size="post" />);
    const [narrow, wide] = [...container.querySelectorAll("svg")];
    expect(narrow.getAttribute("class")).toContain("sm:hidden");
    expect(wide.getAttribute("class")).toContain("hidden sm:block");
    expect(narrow.querySelectorAll("[data-point-label]")).toHaveLength(0);
    expect(wide.querySelectorAll("[data-point-label]")).toHaveLength(14);
    expect(container.querySelectorAll("p[aria-hidden]")).toHaveLength(1);
  });

  it("los degradados de los dos SVG del post tienen id distinto", () => {
    const { container } = wrap(<EpisodeCurve episodes={four} size="post" />);
    const ids = [...container.querySelectorAll("linearGradient")].map((n) => n.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("showBest pinta el mejor episodio con su título y nota", () => {
    const { container } = wrap(<EpisodeCurve episodes={four} size="feed" showBest />);
    expect(container.textContent).toContain("S1E7 · Título 7");
  });

  it("showBest con empate nombra el primer episodio empatado", () => {
    const tie = [ep(4, 10), ep(5, 6), ep(6, 10), ep(7, 7)];
    const { container } = wrap(<EpisodeCurve episodes={tie} size="feed" showBest />);
    expect(container.textContent).toContain("S1E4");
    expect(container.textContent).not.toContain("S1E6 ·");
  });

  it("separador de temporada rotulado", () => {
    const { container } = wrap(<EpisodeCurve episodes={[ep(25, 8, null, 1), ep(26, 7, null, 1), ep(1, 6, null, 2), ep(2, 9, null, 2)]} size="feed" />);
    expect(container.textContent).toContain("T2");
  });
});
