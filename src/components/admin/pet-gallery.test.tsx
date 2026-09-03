// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acornEntry, sheetEntry } from "@/lib/pet/manifest";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { PetGallery } from "./pet-gallery";

// jsdom no implementa `window.matchMedia`: por defecto simulamos "sin reducir movimiento"
// para no romper los tests que no le prestan atención; los tests de reduced-motion
// sobrescriben este stub con su propio mock.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sprites = () => screen.getAllByRole("img");

describe("PetGallery", () => {
  it("pinta las 18 combinaciones más la bellota", () => {
    render(<PetGallery />);
    expect(sprites().length).toBe(19);
  });

  it("la escala cambia el ancho de todos los sprites", () => {
    render(<PetGallery />);
    fireEvent.change(screen.getByTestId("pet-gallery-scale"), { target: { value: "3" } });
    const w = sheetEntry("adult", "wizard").cell * 3;
    expect(sprites().some((el) => (el as HTMLElement).style.width === `${w}px`)).toBe(true);
    expect((sprites().at(-1) as HTMLElement).style.width).toBe(`${acornEntry().cell * 3}px`);
  });

  it("animación sleepy y bellota lista", () => {
    render(<PetGallery />);
    fireEvent.change(screen.getByTestId("pet-gallery-anim"), { target: { value: "sleepy" } });
    expect(sprites()[0].getAttribute("data-anim")).toBe("sleepy");
    fireEvent.click(screen.getByTestId("pet-gallery-ready"));
    expect(sprites().at(-1)!.getAttribute("data-anim")).toBe("ready");
  });

  it("joy manda como reacción; dirección east deja el frame estático", () => {
    render(<PetGallery />);
    fireEvent.change(screen.getByTestId("pet-gallery-anim"), { target: { value: "joy" } });
    expect(sprites()[0].getAttribute("data-reaction")).toBe("joy");
    fireEvent.change(screen.getByTestId("pet-gallery-direction"), { target: { value: "east" } });
    expect(sprites()[0].getAttribute("data-anim")).toBeNull();
    expect(sprites()[0].getAttribute("data-col")).toBe("2");
  });

  it("con prefers-reduced-motion, los controles de transporte quedan deshabilitados", () => {
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMediaMock);
    render(<PetGallery />);
    expect((screen.getByTestId("pet-gallery-play") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("pet-gallery-prev") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("pet-gallery-next") as HTMLButtonElement).disabled).toBe(true);
    vi.unstubAllGlobals();
  });

  it("sin prefers-reduced-motion, los controles de transporte quedan habilitados", () => {
    const matchMediaMock = vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMediaMock);
    render(<PetGallery />);
    expect((screen.getByTestId("pet-gallery-play") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("pet-gallery-prev") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("pet-gallery-next") as HTMLButtonElement).disabled).toBe(false);
    vi.unstubAllGlobals();
  });

  it("«Repetir» reinicia las animaciones de joy sin romper y vuelve a mostrar Pausar", () => {
    render(<PetGallery />);
    fireEvent.change(screen.getByTestId("pet-gallery-anim"), { target: { value: "joy" } });
    expect(() => fireEvent.click(screen.getByTestId("pet-gallery-replay"))).not.toThrow();
    expect(screen.getByTestId("pet-gallery-play").textContent).toBe("pet.pause");
  });
});
