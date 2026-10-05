// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/social/post-actions", () => ({ deletePost: vi.fn() }));

import { FeedCardShell } from "./feed-card-shell";
import { FeedWorkRow } from "./feed-work-row";
import { FeedMiniList } from "./feed-mini-list";

afterEach(cleanup);

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="Europe/Madrid">
      {node}
    </NextIntlClientProvider>,
  );
}

const actor = { username: "maxteryo", displayName: null, avatarUrl: null };
const shell = (over: Partial<Parameters<typeof FeedCardShell>[0]> = {}) => (
  <FeedCardShell
    actor={actor}
    verb="valoró la serie"
    eventDate={new Date().toISOString()}
    postId="p1"
    reactionCount={0}
    commentCount={0}
    viewerCanDelete={false}
    {...over}
  >
    <p>cuerpo</p>
  </FeedCardShell>
);

describe("FeedCardShell", () => {
  it("cabecera en una línea: quién y verbo, y el icono de comentarios lleva al post", () => {
    const { container } = wrap(shell());
    expect(container.textContent).toContain("maxteryo valoró la serie");
    expect(screen.getByRole("link", { name: "Comentar" }).getAttribute("href")).toBe("/post/p1");
    expect(screen.getByText("cuerpo")).toBeTruthy();
  });

  it("con comentarios, el icono los cuenta", () => {
    wrap(shell({ commentCount: 2, reactionCount: 1 }));
    expect(screen.getByRole("link", { name: "2 comentarios" })).toBeTruthy();
  });

  it("en /post/[id] (showInteractions=false) no hay icono de comentarios", () => {
    wrap(shell({ showInteractions: false }));
    expect(screen.queryByRole("link", { name: "Comentar" })).toBeNull();
  });

  it("en el perfil (hideActor) no sale el nombre", () => {
    const { container } = wrap(shell({ hideActor: true }));
    expect(container.textContent).not.toContain("maxteryo");
    expect(container.textContent).toContain("valoró la serie");
  });
});

describe("FeedWorkRow", () => {
  it("título y datos enlazan a la obra; el valor va a la derecha", () => {
    wrap(
      <FeedWorkRow itemType="series" itemId="loki" coverUrl={null} title="Loki" facts="Serie · 2021" trailing={<span>nota</span>} />,
    );
    expect(screen.getByRole("link", { name: "Loki" }).getAttribute("href")).toContain("loki");
    expect(screen.getByText("Serie · 2021")).toBeTruthy();
    expect(screen.getByText("nota")).toBeTruthy();
  });
});

describe("FeedMiniList", () => {
  const rows = [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `S1E${n}`, text: `Ep ${n}`, value: null }));

  it("pinta como mucho 3 filas y «+N más»", () => {
    const { container } = wrap(<FeedMiniList rows={rows} />);
    expect(container.textContent).toContain("S1E3");
    expect(container.textContent).not.toContain("S1E4");
    expect(container.textContent).toContain("+2 más");
  });

  it("sin sobrante no dice «más»", () => {
    const { container } = wrap(<FeedMiniList rows={rows.slice(0, 3)} />);
    expect(container.textContent).not.toContain("más");
  });
});
