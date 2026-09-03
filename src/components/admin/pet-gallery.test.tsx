// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acornEntry, sheetEntry } from "@/lib/pet/manifest";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { PetGallery } from "./pet-gallery";

afterEach(cleanup);
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
});
