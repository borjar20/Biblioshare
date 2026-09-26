// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { FeedEvent, MilestoneViewerContext } from "@/lib/social/feed";
import { makeFeedEvent } from "./test-feed-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/social/post-actions", () => ({ deletePost: vi.fn() }));
vi.mock("@/lib/library/quick-add-actions", () => ({ quickAddToLibrary: vi.fn() }));

import { MilestoneCard } from "./milestone-card";

afterEach(cleanup);

const event = makeFeedEvent;

function ctx(over: Partial<MilestoneViewerContext> = {}): MilestoneViewerContext {
  return { viewerPass: null, friends: [], friendsTotal: 0, friendsStatus: "mixed", ownPost: false, ...over };
}

function renderCard(e: FeedEvent) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      <MilestoneCard event={e} viewerLoggedIn knownUsernames={[]} />
    </NextIntlClientProvider>,
  );
}

describe("MilestoneCard", () => {
  it("una fila: frase, datos de la obra y un enlace «Comentar» sin «0 comentarios» ni «Ver hilo»", () => {
    const { container } = renderCard(event());
    expect(container.textContent).toContain("Borja empezó JoJo's Bizarre Adventure");
    expect(container.textContent).toContain("Serie · 2012 · 5 temporadas");
    expect(screen.getByRole("link", { name: "Comentar" }).getAttribute("href")).toBe("/post/p1");
    expect(container.textContent).not.toMatch(/0 comentarios|Ver hilo/);
  });

  it("sin contexto (anónimo, /post/[id]) no pinta la fila de contexto", () => {
    renderCard(event());
    expect(screen.queryByRole("button", { name: /añadir/i })).toBeNull();
  });

  it("seguidos viéndola y «Añadir» si quien mira no la tiene", () => {
    renderCard(
      event({
        viewerContext: ctx({
          friends: [
            { userId: "f", username: "flufli", displayName: "Flufli", avatarUrl: null },
            { userId: "a", username: "ana", displayName: "Ana", avatarUrl: null },
          ],
          friendsTotal: 2,
          friendsStatus: "in_progress",
        }),
      }),
    );
    expect(screen.getByText("Flufli y Ana también la están viendo")).toBeTruthy();
    expect(screen.getByRole("button", { name: /añadir/i })).toBeTruthy();
  });

  it("libro: concuerda en masculino y cuenta los que no se enseñan", () => {
    renderCard(
      event({
        itemType: "book",
        itemSeasons: null,
        itemSubtitle: "Frank Herbert",
        viewerContext: ctx({
          friends: [{ userId: "f", username: "flufli", displayName: null, avatarUrl: null }],
          friendsTotal: 3,
          friendsStatus: "completed",
        }),
      }),
    );
    expect(screen.getByText("flufli y 2 más ya lo han leído")).toBeTruthy();
  });

  it("si quien mira ya la tiene, dice qué hizo y no ofrece «Añadir»", () => {
    renderCard(event({ verb: "dropped", kind: "dropped", viewerContext: ctx({ viewerPass: { status: "completed", rating: 8 } }) }));
    expect(screen.getByText("La viste")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /añadir/i })).toBeNull();
  });

  it("el hito propio no se ofrece a añadir", () => {
    renderCard(event({ viewerContext: ctx({ ownPost: true }) }));
    expect(screen.queryByRole("button", { name: /añadir/i })).toBeNull();
  });
});
