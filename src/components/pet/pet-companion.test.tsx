// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acornEntry, sheetEntry } from "@/lib/pet/manifest";
import type { CompanionState } from "@/lib/pet/get-companion-state";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/lib/celebrations/preference", () => ({ onCelebrationsShown: () => () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { PetCompanion } from "./pet-companion";

afterEach(cleanup);

const state: CompanionState = { name: "Nuez", petClass: "wizard", stage: "adult", mood: "happy", hidden: false };

// #1074: la celda del sheet (92-104 px) lleva un 30-40 % de relleno transparente. La zona táctil
// del enlace a /mascota tiene que ser el personaje (`box` de sheets.gen.ts), no la celda: si no,
// el relleno intercepta taps sobre lo que haya debajo de la esquina (compositor, barra de voz).
describe("PetCompanion", () => {
  it("el enlace mide lo que el personaje, no la celda", () => {
    const { box } = sheetEntry("adult", "wizard");
    render(<PetCompanion state={state} />);
    const link = screen.getByTestId("pet-companion");
    expect(link.style.width).toBe(`${box.w}px`);
    expect(link.style.height).toBe(`${box.h}px`);
  });

  // El personaje se queda EXACTAMENTE donde estaba en pantalla (la QA de la rama de 64 px lo dio
  // por bueno): el relleno que la celda tenía a la derecha y abajo del personaje se suma al
  // desplazamiento del enlace, en vez de acercarlo al borde y a la barra de navegación.
  it("conserva la posición visual: el relleno derecho e inferior de la celda pasa al desplazamiento", () => {
    const { box, cell } = sheetEntry("adult", "wizard");
    render(<PetCompanion state={state} />);
    const link = screen.getByTestId("pet-companion");
    expect(link.style.getPropertyValue("--pet-pad-r")).toBe(`${cell - box.x - box.w}px`);
    expect(link.style.getPropertyValue("--pet-pad-b")).toBe(`${cell - box.y - box.h}px`);
  });

  it("en bellota usa la caja del sheet de la bellota", () => {
    const { box } = acornEntry();
    render(<PetCompanion state={{ ...state, stage: "acorn" }} />);
    const link = screen.getByTestId("pet-companion");
    expect(link.style.width).toBe(`${box.w}px`);
    expect(link.style.height).toBe(`${box.h}px`);
  });

  it("el sprite se desplaza para que el personaje coincida con el enlace y no intercepta taps", () => {
    const { box } = sheetEntry("adult", "wizard");
    render(<PetCompanion state={state} />);
    const sprite = screen.getByRole("img", { name: "Nuez" });
    const holder = sprite.parentElement as HTMLElement;
    expect(holder.style.pointerEvents).toBe("none");
    expect(holder.style.left).toBe(`${-box.x}px`);
    expect(holder.style.top).toBe(`${-box.y}px`);
  });
});
