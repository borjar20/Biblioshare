// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AtRule } from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acornEntry, sheetEntry } from "@/lib/pet/manifest";
import { compilePetSpriteCss } from "./pet-sprite-css.test-support";

// Sustituye sólo el loader CSS de Vitest (identidad) por las exportaciones del
// fichero compilado REAL. PetSprite, manifiesto y datos no se sustituyen.
vi.mock("./pet-sprite.module.css", async () => {
  const { compilePetSpriteCss } = await import("./pet-sprite-css.test-support");
  return { default: compilePetSpriteCss().names };
});
import { PetSprite, type PetSpriteProps } from "./pet-sprite";

const css = compilePetSpriteCss();
const base = { stage: "adult", petClass: "wizard", scale: 1, label: "Nuez" } as const;
afterEach(cleanup);

function existingAnimation(element: HTMLElement, name: string) {
  const actual = element.style.animationName.split(",").map((value) => value.trim());
  const rules: AtRule[] = [];
  css.root.walkAtRules("keyframes", (rule) => { if (actual.includes(rule.params)) rules.push(rule); });
  expect(actual).toContain(css.names[name]);
  expect(rules.map((rule) => rule.params).sort()).toEqual([...actual].sort());
}

describe("PetSprite: filas y reacciones con CSS real compilado", () => {
  it.each([
    ["happy", "idle", "stripIdle", 4],
    ["neutral", "idle", "stripIdle", 4],
    ["sleepy", "sleepy", "stripSleepy", 3],
    ["sad", "sad", "stripSad", 3],
  ] as const)("humor %s selecciona la fila %s, su keyframe existente y bucle", (mood, anim, keyframe, fps) => {
    render(<PetSprite {...base} mood={mood} />);
    const sprite = screen.getByRole("img", { name: "Nuez" });
    const row = sheetEntry("adult", "wizard").anims[anim];
    expect(sprite.getAttribute("data-mood")).toBe(mood);
    expect(sprite.getAttribute("data-anim")).toBe(anim);
    expect(sprite.getAttribute("data-reaction")).toBeNull();
    expect(sprite.style.getPropertyValue("--pet-row")).toBe(String(row.row));
    expect(sprite.style.getPropertyValue("--pet-frames")).toBe(String(row.frames));
    expect(sprite.style.animationTimingFunction).toBe(`steps(${row.frames})`);
    expect(sprite.style.animationDuration).toBe(`${row.frames / fps}s`);
    expect(sprite.style.animationIterationCount).toBe("infinite");
    expect(sprite.classList.contains(css.names.animated)).toBe(true);
    existingAnimation(sprite, keyframe);
  });

  it("cambiar sleepy → sad → joy → sad mantiene el nodo y cambia el nombre para reiniciar la fila", () => {
    const { rerender } = render(<PetSprite {...base} mood="sleepy" />);
    const sprite = screen.getByRole("img", { name: "Nuez" });
    const sleepy = sprite.style.animationName;
    rerender(<PetSprite {...base} mood="sad" />);
    expect(screen.getByRole("img", { name: "Nuez" })).toBe(sprite);
    const sad = sprite.style.animationName;
    existingAnimation(sprite, "stripSad");
    expect(sad).not.toBe(sleepy);
    rerender(<PetSprite {...base} mood="sad" reaction="joy" />);
    expect(screen.getByRole("img", { name: "Nuez" })).toBe(sprite);
    existingAnimation(sprite, "stripJoy");
    expect(sprite.style.animationName).not.toBe(sad);
    expect(sprite.getAttribute("data-mood")).toBe("sad");
    expect(sprite.getAttribute("data-reaction")).toBe("joy");
    expect(sprite.getAttribute("data-anim")).toBe("joy");
    expect(sprite.style.animationIterationCount).toBe("1");
    expect(sprite.style.animationDuration).toBe("0.9s");
    rerender(<PetSprite {...base} mood="sad" reaction={null} />);
    expect(screen.getByRole("img", { name: "Nuez" })).toBe(sprite);
    expect(sprite.style.animationName).toBe(sad);
    expect(sprite.getAttribute("data-reaction")).toBeNull();
    expect(sprite.style.animationIterationCount).toBe("infinite");
  });

  it("evolve se añade al strip vigente y al salir conserva el humor sin remontar", () => {
    const { rerender } = render(<PetSprite {...base} mood="sleepy" />);
    const sprite = screen.getByRole("img", { name: "Nuez" });
    const idleName = sprite.style.animationName;
    const duration = sprite.style.animationDuration;
    const timing = sprite.style.animationTimingFunction;
    rerender(<PetSprite {...base} mood="sleepy" reaction="evolve" />);
    expect(screen.getByRole("img", { name: "Nuez" })).toBe(sprite);
    expect(sprite.getAttribute("data-anim")).toBe("sleepy");
    expect(sprite.getAttribute("data-reaction")).toBe("evolve");
    expect(sprite.style.animationName.split(", ")).toEqual([idleName, css.names.evolve]);
    expect(sprite.style.animationDuration).toBe(`${duration}, 1.2s`);
    expect(sprite.style.animationTimingFunction).toBe(`${timing}, ease-out`);
    expect(sprite.style.animationIterationCount).toBe("infinite, 1");
    expect(sprite.classList.contains(css.names.root)).toBe(true);
    expect(sprite.classList.contains(css.names.animated)).toBe(true);
    existingAnimation(sprite, "evolve");
    rerender(<PetSprite {...base} mood="sleepy" reaction={null} />);
    expect(sprite.style.animationName).toBe(idleName);
    expect(sprite.style.animationDuration).toBe(duration);
    expect(sprite.getAttribute("data-reaction")).toBeNull();
  });

  it("bellota idle → ready usa dos keyframes existentes sin depender del humor ni de joy", () => {
    const props = { ...base, stage: "acorn", mood: "sad", reaction: "joy" } satisfies PetSpriteProps;
    const { rerender } = render(<PetSprite {...props} />);
    const sprite = screen.getByRole("img", { name: "Nuez" });
    existingAnimation(sprite, "stripIdle");
    const idle = sprite.style.animationName;
    rerender(<PetSprite {...props} hatchReady />);
    expect(screen.getByRole("img", { name: "Nuez" })).toBe(sprite);
    expect(sprite.getAttribute("data-anim")).toBe("ready");
    existingAnimation(sprite, "stripReady");
    expect(sprite.style.animationName).not.toBe(idle);
    expect(sprite.style.getPropertyValue("--pet-row")).toBe(String(acornEntry().anims.ready.row));
    expect(sprite.style.animationIterationCount).toBe("infinite");
  });

  it("dirección estática no emite strip; evolve queda dirigido por el selector CSS real", () => {
    render(<PetSprite {...base} mood="sad" direction="east" reaction="evolve" />);
    const sprite = screen.getByRole("img", { name: "Nuez" });
    expect(sprite.getAttribute("data-anim")).toBeNull();
    expect(sprite.getAttribute("data-frames")).toBeNull();
    expect(sprite.style.animationName).toBe("");
    expect(sprite.classList.contains(css.names.animated)).toBe(false);
    expect(sprite.classList.contains(css.names.root)).toBe(true);
    expect(sprite.getAttribute("data-reaction")).toBe("evolve");
  });
});
