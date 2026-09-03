// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sheetEntry } from "@/lib/pet/manifest";
import { PetSprite } from "./pet-sprite";

afterEach(cleanup);

describe("PetSprite", () => {
  it("bellota: una sola imagen y sin sheet", () => {
    const { container } = render(<PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={2} label="Bellota" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe("/pet/acorn.png");
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("aria-label")).toBe("Bellota");
    expect(root.style.backgroundImage).toBe("");
    expect(root.getAttribute("data-anim")).toBeNull();
  });

  it("adulta maga contenta: sheet de maga adulta, fila idle, caja = celda × escala", () => {
    const e = sheetEntry("adult", "wizard");
    const { container } = render(<PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} label="Nuez" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.backgroundImage).toContain("/pet/sheets/adult/wizard.png");
    expect(root.style.width).toBe(`${e.cell * 2}px`);
    expect(root.style.height).toBe(`${e.cell * 2}px`);
    expect(root.getAttribute("data-anim")).toBe("idle");
    expect(root.getAttribute("data-frames")).toBe(String(e.anims.idle.frames));
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.anims.idle.row));
    expect(root.style.getPropertyValue("--pet-cell")).toBe(`${e.cell * 2}px`);
    expect(root.style.backgroundSize).toBe(`${e.width * 2}px ${e.height * 2}px`);
    expect(root.style.animationDuration).toBe("1s");
    expect(root.style.animationTimingFunction).toBe("steps(4)");
    expect(root.style.animationIterationCount).toBe("infinite");
  });

  it("dormida usa la fila sleepy; triste la fila sad", () => {
    const a = render(<PetSprite stage="young" petClass="bard" mood="sleepy" scale={1} label="Lira" />);
    expect(a.container.firstElementChild!.getAttribute("data-anim")).toBe("sleepy");
    cleanup();
    const b = render(<PetSprite stage="veteran" petClass="ranger" mood="sad" scale={1} label="Arco" />);
    expect(b.container.firstElementChild!.getAttribute("data-anim")).toBe("sad");
  });

  it("la reacción de alegría manda sobre el humor", () => {
    const { container } = render(<PetSprite stage="adult" petClass="cleric" mood="sad" scale={1} reaction="joy" label="Fray" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-anim")).toBe("joy");
    expect(root.getAttribute("data-reaction")).toBe("joy");
    expect(root.getAttribute("data-mood")).toBe("sad");
    expect(root.style.animationIterationCount).toBe("1");
  });

  it("la reacción de evolución no cancela la animación de la fila: ambas corren a la vez", () => {
    const { container } = render(<PetSprite stage="adult" petClass="cleric" mood="happy" scale={1} reaction="evolve" label="Fray" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-reaction")).toBe("evolve");
    expect(root.style.animationName).toContain("strip");
    expect(root.style.animationName).toContain("evolve");
  });

  it("otra dirección: frame estático de la fila de rotaciones, sin animación", () => {
    const e = sheetEntry("adult", "fighter");
    const { container } = render(<PetSprite stage="adult" petClass="fighter" mood="happy" scale={1} direction="east" label="Espada" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-anim")).toBeNull();
    expect(root.getAttribute("data-col")).toBe(String(e.directions.indexOf("east")));
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.rotationsRow));
  });
});
