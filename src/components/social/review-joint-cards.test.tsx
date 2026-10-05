// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { FeedEpisode, JointCardMember } from "@/lib/social/feed";
import { makeFeedEvent } from "./test-feed-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/social/post-actions", () => ({ deletePost: vi.fn() }));

import { ReviewCard } from "./review-card";
import { JointCard } from "./joint-card";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      {node}
    </NextIntlClientProvider>,
  );
}

const review = (over: Parameters<typeof makeFeedEvent>[0] = {}) =>
  makeFeedEvent({
    kind: "finished",
    verb: "reviewed",
    itemType: "movie",
    itemId: "interstellar",
    itemTitle: "Interstellar",
    itemYear: 2014,
    itemSeasons: null,
    rating: 10,
    reviewExcerpt: "Top 3 peores apocalipsis:\n1. Solo poder comer maíz.",
    ...over,
  });

describe("ReviewCard", () => {
  it("una sola etiqueta: el verbo, sin chip «Reseña» ni estado «Finalizado»", () => {
    const { container } = wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} />);
    expect(container.textContent).toContain("reseñó");
    expect(container.textContent).not.toMatch(/Reseña|Finalizado|Visto/);
    expect(container.textContent).toContain("Película · 2014");
  });

  it("en el feed la reseña va recortada a 4 líneas, sin caja interior ni pie «Comentar»", () => {
    wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} />);
    const text = screen.getByText(/Top 3 peores apocalipsis/);
    expect(text.className).toContain("line-clamp-4");
    expect(text.closest(".bg-surface-muted")).toBeNull();
    expect(screen.getByRole("link", { name: "Comentar" }).textContent).toBe("");
  });

  it("«Seguir leyendo» lleva al post cuando el servidor cortó el extracto", () => {
    wrap(<ReviewCard event={review({ reviewExcerpt: "Muy larga…" })} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.getByRole("link", { name: "Seguir leyendo" }).getAttribute("href")).toBe("/post/p1");
  });

  it("una reseña corta no ofrece «Seguir leyendo»", () => {
    wrap(<ReviewCard event={review({ reviewExcerpt: "Pues eso." })} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.queryByRole("link", { name: "Seguir leyendo" })).toBeNull();
  });

  it("en /post/[id] (sin interacciones) el texto va entero, sin recortar ni icono de comentarios", () => {
    wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} showInteractions={false} />);
    expect(screen.getByText(/Top 3 peores apocalipsis/).className).not.toContain("line-clamp");
    expect(screen.queryByRole("link", { name: "Comentar" })).toBeNull();
  });

  it("valorar la serie entera dice «valoró la serie»", () => {
    const { container } = wrap(
      <ReviewCard
        event={review({ verb: "rated", itemType: "series", itemId: "loki", itemTitle: "Loki", itemYear: 2021, reviewExcerpt: null, rating: 7 })}
        viewerLoggedIn
        knownUsernames={[]}
      />,
    );
    expect(container.textContent).toContain("valoró la serie");
    expect(container.textContent).toContain("Serie · 2021");
  });

  const watched = (episodes: FeedEpisode[]) =>
    makeFeedEvent({
      kind: "watched",
      verb: episodes[0].rating != null ? "rated" : "watchedEpisode",
      itemType: "series",
      itemId: "loki",
      itemTitle: "Loki",
      rating: episodes[0].rating,
      episode: { season: episodes[0].season, episode: episodes[0].episode, title: episodes[0].title },
      episodes,
    });
  const ep = (episode: number, rating: number | null, title: string | null = null): FeedEpisode => ({ season: 2, episode, title, rating });

  it("un episodio valorado: el episodio es el título y la serie va en los datos", () => {
    const { container } = wrap(<ReviewCard event={watched([ep(3, 4, "1893")])} viewerLoggedIn knownUsernames={[]} />);
    expect(container.textContent).toContain("valoró un episodio");
    expect(screen.getByRole("link", { name: "S2E3 · 1893" })).toBeTruthy();
    expect(container.textContent).toContain("de Loki");
  });

  it("varios episodios: cada uno con su nota, «Sin nota» si no la tiene y «+N más» pasado el tercero", () => {
    const { container } = wrap(
      <ReviewCard event={watched([ep(3, 4, "1893"), ep(4, 8), ep(5, null), ep(6, 6)])} viewerLoggedIn knownUsernames={[]} />,
    );
    expect(container.textContent).toContain("valoró 4 episodios");
    expect(screen.getByRole("link", { name: "Loki" })).toBeTruthy();
    expect(container.textContent).toContain("S2E4");
    expect(screen.getByLabelText("Sin nota")).toBeTruthy();
    expect(container.textContent).not.toContain("S2E6");
    expect(container.textContent).toContain("+1 más");
  });

  it("episodios sin ninguna nota dicen «vio», no «valoró»", () => {
    const { container } = wrap(<ReviewCard event={watched([ep(3, null), ep(4, null)])} viewerLoggedIn knownUsernames={[]} />);
    expect(container.textContent).toContain("vio 2 episodios");
    expect(container.textContent).not.toContain("valoró");
  });
});

function member(userId: string, rating: number | null, reviewExcerpt: string | null = null): JointCardMember {
  return { userId, username: userId, displayName: null, avatarUrl: null, rating, reviewExcerpt, reviewIsSpoiler: false };
}

const joint = (members: JointCardMember[]) =>
  makeFeedEvent({
    kind: "joint",
    verb: "joint",
    itemType: "movie",
    itemId: "momia",
    itemTitle: "La momia",
    itemYear: 1999,
    itemSeasons: null,
    joint: { viewingId: "v1", watchedOn: null, members, hiddenCount: 0 },
  });

describe("JointCard", () => {
  it("hidrata la media del grupo sin regenerar el HTML del servidor", async () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    const errors = vi.spyOn(console, "error");
    const recoverableErrors: unknown[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | undefined;

    try {
      const event = {
        ...joint([member("ana", 9), member("luis", 8), member("marta", 10)]),
        eventDate: "2026-10-03T10:00:00.000Z",
      };
      const tree = (
        <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid" now={now}>
          <JointCard event={event} viewerLoggedIn knownUsernames={[]} />
        </NextIntlClientProvider>
      );
      // Interpretar el SSR como HTML aplica las mismas correcciones de anidación
      // que un navegador; un montaje cliente directo no ejercita esta frontera.
      container.innerHTML = renderToString(tree);
      const article = container.querySelector("article");
      expect(article).not.toBeNull();

      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      expect(recoverableErrors.map(String)).toEqual([]);
      expect(errors.mock.calls).toEqual([]);
      expect(container.querySelector("article")).toBe(article);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      errors.mockRestore();
      clock.mockRestore();
    }
  });

  it("«juntos» una sola vez, datos de la obra y media del grupo", () => {
    const { container } = wrap(
      <JointCard event={joint([member("borja", 9), member("maxteryo", 8), member("flufli", 10)])} viewerLoggedIn knownUsernames={[]} />,
    );
    expect(container.textContent!.match(/juntos/gi)).toHaveLength(1);
    expect(container.textContent).toContain("Película · 1999");
    expect(container.textContent).toContain("Media del grupo");
    expect(container.textContent).toContain("4,5");
  });

  it("cada persona sale una vez (sin avatares en la cabecera)", () => {
    wrap(<JointCard event={joint([member("borja", 9), member("maxteryo", 8)])} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.getAllByRole("link", { name: "borja" })).toHaveLength(1);
  });

  it("con menos de dos notas no hay media", () => {
    const { container } = wrap(
      <JointCard event={joint([member("borja", 9), member("maxteryo", null)])} viewerLoggedIn knownUsernames={[]} />,
    );
    expect(container.textContent).not.toContain("Media del grupo");
  });
});
