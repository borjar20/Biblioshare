// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { SagaHeroCinematic } from "./saga-hero-cinematic";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/saga/saga-follow-button", () => ({ SagaFollowButton: () => <button>seguir</button> }));

afterEach(cleanup);

function detail(over: { childCount?: number; covers?: (string | null)[] } = {}): SagaDetail {
  const covers = over.covers ?? ["/c1.jpg", "/c2.jpg"];
  return {
    saga: { id: "s1", name: "Mi Saga" },
    parent: null,
    byline: null,
    memberCount: covers.length,
    childCount: over.childCount ?? 0,
    avgRating: null,
    isAuthenticated: false,
    isFollowing: false,
    groups: [{ members: covers.map((coverUrl, i) => ({ coverUrl, year: 2000 + i })) }],
  } as unknown as SagaDetail;
}

async function renderHero(d: SagaDetail, backdropUrl: string | null) {
  render(await SagaHeroCinematic({ detail: d, backdropUrl, curatorMenu: <i data-testid="menu-slot" /> }));
}

describe("SagaHeroCinematic", () => {
  it("pinta el título y el slot del menú de curador", async () => {
    await renderHero(detail(), null);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mi Saga");
    expect(screen.getByTestId("menu-slot")).toBeTruthy();
  });
  it("sin backdrop, fondo de mosaico", async () => {
    await renderHero(detail(), null);
    expect(screen.getByTestId("saga-hero-mosaic")).toBeTruthy();
  });
  it("con backdrop, la imagen del backdrop y sin mosaico", async () => {
    await renderHero(detail(), "/b.jpg");
    expect(document.querySelector('img[src="/b.jpg"]')).toBeTruthy();
    expect(screen.queryByTestId("saga-hero-mosaic")).toBeNull();
  });
  it("eyebrow «Universo» solo si hay subsagas", async () => {
    await renderHero(detail({ childCount: 2 }), null);
    expect(screen.getByText(/eyebrowUniverse/)).toBeTruthy();
    cleanup();
    await renderHero(detail({ childCount: 0 }), null);
    expect(screen.queryByText(/eyebrowUniverse/)).toBeNull();
  });
});
