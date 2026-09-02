// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PetSprite } from "./pet-sprite";

afterEach(cleanup);

describe("PetSprite", () => {
  it("bellota: una sola imagen y sin capas de clase", () => {
    const { container } = render(
      <PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={2} label="Bellota" />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe("/pet/acorn.png");
  });

  it("adulta maga contenta: cola, cuerpo, cabeza, cara, mano, ropa en cabeza y accesorio en mano", () => {
    const { container } = render(
      <PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} label="Nuez" />,
    );
    const srcs = [...container.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toContain("/pet/adult/tail.png");
    expect(srcs).toContain("/pet/adult/body.png");
    expect(srcs).toContain("/pet/adult/head.png");
    expect(srcs).toContain("/pet/face/happy.png");
    expect(srcs).toContain("/pet/adult/hand.png");
    expect(srcs).toContain("/pet/class/wizard/adult/outfit.png");
    expect(srcs).toContain("/pet/class/wizard/adult/accessory.png");
    // la ropa de maga cuelga de la cabeza: comparte contenedor con head.png
    const head = container.querySelector('[data-part="head"]')!;
    expect(head.querySelector('img[src="/pet/class/wizard/adult/outfit.png"]')).not.toBeNull();
  });

  it("clérigo: la túnica cuelga del cuerpo", () => {
    const { container } = render(
      <PetSprite stage="adult" petClass="cleric" mood="neutral" scale={1} label="Fray" />,
    );
    const body = container.querySelector('[data-part="body"]')!;
    expect(body.querySelector('img[src="/pet/class/cleric/adult/outfit.png"]')).not.toBeNull();
  });

  it("expone humor y reacción como data-attributes para el CSS y el e2e", () => {
    const { container } = render(
      <PetSprite stage="young" petClass="bard" mood="sleepy" scale={1} reaction="joy" label="Lira" />,
    );
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-mood")).toBe("sleepy");
    expect(root.getAttribute("data-reaction")).toBe("joy");
    expect(root.getAttribute("aria-label")).toBe("Lira");
  });
});
