// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { acornEntry, PET_FACING, sheetEntry } from "@/lib/pet/manifest";
import { PetSprite } from "./pet-sprite";

afterEach(cleanup);

describe("PetSprite", () => {
  it("bellota: sheet de la bellota, fila idle, sin img", () => {
    const e = acornEntry();
    const { container } = render(<PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={2} label="Bellota" />);
    const root = container.firstElementChild as HTMLElement;
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(root.style.backgroundImage).toContain("/pet/sheets/acorn.png");
    expect(root.style.width).toBe(`${e.cell * 2}px`);
    expect(root.getAttribute("data-anim")).toBe("idle");
    expect(root.getAttribute("aria-label")).toBe("Bellota");
    expect(root.style.animationName).toContain("stripIdle");
  });

  it("bellota lista para eclosionar: fila ready", () => {
    const e = acornEntry();
    const { container } = render(<PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={3} hatchReady label="Bellota" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-anim")).toBe("ready");
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.anims.ready.row));
    expect(root.style.animationName).toContain("stripReady");
    expect(root.style.animationDuration).toBe(`${e.anims.ready.frames / 6}s`);
  });

  it("hatchReady se ignora fuera de la bellota", () => {
    const { container } = render(<PetSprite stage="adult" petClass="bard" mood="happy" scale={1} hatchReady label="Lira" />);
    expect(container.firstElementChild!.getAttribute("data-anim")).toBe("idle");
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
    expect(root.style.animationName).not.toBe("");
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
    expect(root.style.animationDuration).toBe("0.9s"); // 9 frames @ 10 fps: distingue frames/fps de fps/frames
  });

  // CSS solo reinicia una animación cuando cambia la lista `animation-name`: si idle y joy
  // comparten nombre de @keyframes, un componente que pasa de reaction=null (idle) a
  // reaction="joy" sin desmontarse (pet-companion.tsx) no reinicia nada — el navegador ve el
  // mismo animation-name y sigue el `currentTime` que ya llevaba, minutos por delante de la
  // duración corta de joy, así que la fila se queda congelada en el último frame. Cada fila
  // necesita su propio nombre de keyframe para que el cambio de fila SIEMPRE reinicie el strip.
  it("idle y joy usan nombres de keyframe distintos: el cambio de nombre es lo que reinicia la animación", () => {
    const idle = render(<PetSprite stage="adult" petClass="cleric" mood="happy" scale={1} reaction={null} label="Fray" />);
    const idleName = (idle.container.firstElementChild as HTMLElement).style.animationName;
    cleanup();
    const joy = render(<PetSprite stage="adult" petClass="cleric" mood="happy" scale={1} reaction="joy" label="Fray" />);
    const joyName = (joy.container.firstElementChild as HTMLElement).style.animationName;
    expect(idleName).not.toBe("");
    expect(joyName).not.toBe("");
    expect(idleName).not.toBe(joyName);
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

  // PET_FACING (south-west, enmienda 2026-09-03 Task 2b) es la única dirección animada; south
  // ya no lo es aunque siga siendo la primera de `directions`.
  it("sin direction explícita anima con PET_FACING, el valor por defecto", () => {
    const e = sheetEntry("adult", "wizard");
    const { container } = render(<PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} label="Nuez" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.anims.idle.row));
    expect(root.style.animationName).not.toBe("");
  });

  it('direction="south" ya no anima: pinta el frame estático de la fila de rotaciones', () => {
    const e = sheetEntry("adult", "wizard");
    const { container } = render(<PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} direction="south" label="Nuez" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.rotationsRow));
    expect(root.style.getPropertyValue("--pet-col")).toBe("0");
    expect(root.style.animationName).toBe("");
  });

  it("direction=PET_FACING explícita anima igual que sin la prop", () => {
    const e = sheetEntry("adult", "wizard");
    const { container } = render(<PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} direction={PET_FACING} label="Nuez" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.anims.idle.row));
    expect(root.style.animationName).not.toBe("");
  });
});
