// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MiniMap } from "@/lib/sagas/mini-map";
import { AtlasTeaser } from "./atlas-teaser";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string) => k,
}));
afterEach(cleanup);

const map: MiniMap = {
  width: 160, height: 80,
  points: [
    { id: "a", cx: 8, cy: 40, accent: "verde", done: true },
    { id: "b", cx: 152, cy: 40, accent: "teal", done: false },
  ],
  lines: [{ x1: 8, y1: 40, x2: 152, y2: 40, dashed: true }],
};

describe("AtlasTeaser", () => {
  it("es un enlace al mapa con un SVG decorativo con un círculo por punto", async () => {
    const { container } = render(await AtlasTeaser({ href: "/saga/x/mapa", map }));
    const link = screen.getByTestId("atlas-teaser");
    expect(link.getAttribute("href")).toBe("/saga/x/mapa");
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.querySelectorAll("circle")).toHaveLength(2);
    expect(svg?.querySelectorAll("line")).toHaveLength(1);
    expect(screen.getByText("atlasTitle")).toBeTruthy();
    expect(screen.getByText("atlasSubtitle")).toBeTruthy();
  });
});
