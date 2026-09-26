// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { JointCardMember } from "@/lib/social/feed";
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

  it("en el feed la reseña va dentro de la caja de la obra", () => {
    wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} />);
    const text = screen.getByText(/Top 3 peores apocalipsis/);
    const box = screen.getAllByRole("link", { name: "Interstellar" }).at(-1)!.parentElement!;
    expect(box.contains(text)).toBe(true);
    expect(text.className).toContain("line-clamp-4");
  });

  it("«Seguir leyendo» lleva al post cuando el servidor cortó el extracto", () => {
    wrap(<ReviewCard event={review({ reviewExcerpt: "Muy larga…" })} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.getByRole("link", { name: "Seguir leyendo" }).getAttribute("href")).toBe("/post/p1");
  });

  it("una reseña corta no ofrece «Seguir leyendo»", () => {
    wrap(<ReviewCard event={review({ reviewExcerpt: "Pues eso." })} viewerLoggedIn knownUsernames={[]} />);
    expect(screen.queryByRole("link", { name: "Seguir leyendo" })).toBeNull();
  });

  it("en /post/[id] (sin interacciones) el texto entero va fuera de la caja y sin recortar", () => {
    wrap(<ReviewCard event={review()} viewerLoggedIn knownUsernames={[]} showInteractions={false} />);
    const text = screen.getByText(/Top 3 peores apocalipsis/);
    const box = screen.getAllByRole("link", { name: "Interstellar" }).at(-1)!.parentElement!;
    expect(box.contains(text)).toBe(false);
    expect(text.className).not.toContain("line-clamp");
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
