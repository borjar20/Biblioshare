// src/components/detail/poster-art-view.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, src, onError }: { alt: string; src: string; onError?: () => void }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} onError={onError} />
  ),
}));
vi.mock("@/components/ui/image-zoom", () => ({
  ImageZoom: ({ children }: { children: React.ReactNode }) => <div data-testid="zoom">{children}</div>,
}));
import { PosterArtView } from "./poster-art-view";
afterEach(cleanup);

describe("PosterArtView", () => {
  it("bleed: una imagen con zoom", () => {
    const { container } = render(<PosterArtView art={{ kind: "bleed", src: "/a.jpg" }} title="X" />);
    expect(screen.getByAltText("X")).toBeTruthy();
    expect(screen.getByTestId("zoom")).toBeTruthy();
    expect(container.querySelector('[data-poster="bleed"]')).toBeTruthy();
  });
  it("atmosphere: fondo difuminado decorativo y portada nítida", () => {
    const { container } = render(<PosterArtView art={{ kind: "atmosphere", src: "/a.jpg" }} title="X" />);
    expect(screen.getByAltText("X")).toBeTruthy();
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelector('[data-poster="atmosphere"]')).toBeTruthy();
  });
  it("atmosphere: grano decorativo sobre el fondo y bajo la portada", () => {
    const { container } = render(<PosterArtView art={{ kind: "atmosphere", src: "/a.jpg" }} title="X" />);
    const grain = container.querySelector("[data-grain]");
    expect(grain?.getAttribute("aria-hidden")).toBe("true");
    expect(grain?.previousElementSibling?.tagName).toBe("IMG");
    expect(grain?.nextElementSibling?.contains(screen.getByAltText("X"))).toBe(true);
  });
  it("type: el título como imagen, oculto al lector de pantalla", () => {
    const { container } = render(<PosterArtView art={{ kind: "type" }} title="Tress" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-poster="type"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toContain("Tress");
  });
  it("si la imagen falla pasa a type", () => {
    const { container } = render(<PosterArtView art={{ kind: "bleed", src: "/a.jpg" }} title="X" />);
    fireEvent.error(screen.getByAltText("X"));
    expect(container.querySelector('[data-poster="type"]')).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
  it("si falla la portada de atmosphere pasa a type, sin fondo ni grano", () => {
    const { container } = render(<PosterArtView art={{ kind: "atmosphere", src: "/a.jpg" }} title="X" />);
    fireEvent.error(screen.getByAltText("X"));
    expect(container.querySelector('[data-poster="type"]')).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-grain]")).toBeNull();
  });
  it("si cambia la imagen vuelve a intentarlo", () => {
    const { container, rerender } = render(<PosterArtView art={{ kind: "bleed", src: "/a.jpg" }} title="X" />);
    fireEvent.error(screen.getByAltText("X"));
    rerender(<PosterArtView art={{ kind: "bleed", src: "/b.jpg" }} title="X" />);
    expect(container.querySelector('[data-poster="bleed"]')).toBeTruthy();
  });
});
