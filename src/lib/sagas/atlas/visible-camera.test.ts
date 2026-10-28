import { describe, expect, it } from "vitest";
import { toScreen } from "@/lib/atlas/camera";
import { cardPosition, centreIn, fitVisible, inVisibleArea } from "./visible-camera";

const vp = { width: 400, height: 800 };
const insets = { top: 150, bottom: 100 };

describe("centreIn", () => {
  it("pone el punto en el centro de la zona libre entre barra y dock", () => {
    const cam = centreIn({ x: 10, y: 20 }, 2, insets);
    // Zona libre: de 150 a 700 → centro en y = 425.
    expect(toScreen(cam, vp, { x: 10, y: 20 })).toEqual({ x: 200, y: 425 });
  });

  it("sin cromo es el centro del viewport", () => {
    expect(centreIn({ x: 5, y: 5 }, 1, { top: 0, bottom: 0 })).toEqual({ x: 5, y: 5, k: 1 });
  });
});

describe("fitVisible", () => {
  const extent = { minX: 0, minY: 0, maxX: 200, maxY: 1000 };

  it("encaja la saga en la zona libre: ni la barra ni el dock tapan el primer ni el último extremo", () => {
    const cam = fitVisible(extent, vp, insets, 4);
    const top = toScreen(cam, vp, { x: 0, y: extent.minY });
    const bottom = toScreen(cam, vp, { x: 0, y: extent.maxY });
    expect(top.y).toBeGreaterThanOrEqual(insets.top);
    expect(bottom.y).toBeLessThanOrEqual(vp.height - insets.bottom);
    // Centrada en la zona libre.
    expect((top.y + bottom.y) / 2).toBeCloseTo(425);
  });

  it("respeta el zoom máximo", () => {
    expect(fitVisible({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, vp, insets, 2).k).toBe(2);
  });
});

describe("inVisibleArea", () => {
  const cam = { x: 0, y: 0, k: 1 }; // el origen cae en (200, 400)

  it("dentro de la zona libre", () => {
    expect(inVisibleArea(cam, vp, insets, { x: 0, y: 0 })).toBe(true);
  });

  it("bajo la barra o el dock cuenta como fuera", () => {
    expect(inVisibleArea(cam, vp, insets, { x: 0, y: -300 })).toBe(false); // y = 100 < 150
    expect(inVisibleArea(cam, vp, insets, { x: 0, y: 350 })).toBe(false); // y = 750 > 700
  });

  it("cuenta la portada entera: el centro dentro pero el borde fuera es fuera", () => {
    const half = { x: 30, y: 45 };
    expect(inVisibleArea(cam, vp, insets, { x: -170, y: 0 }, half)).toBe(true); // borde izquierdo en 0
    expect(inVisibleArea(cam, vp, insets, { x: -180, y: 0 }, half)).toBe(false); // centro en 20, borde en −10
    expect(inVisibleArea(cam, vp, insets, { x: -180, y: 0 })).toBe(true); // solo el centro: dentro
    expect(inVisibleArea(cam, vp, insets, { x: 0, y: -240 }, half)).toBe(false); // borde superior en 115 < 150
    expect(inVisibleArea(cam, vp, insets, { x: 0, y: 260 }, half)).toBe(false); // borde inferior en 705 > 700
    expect(inVisibleArea({ ...cam, k: 2 }, vp, insets, { x: 0, y: -100 }, half)).toBe(false); // centro 200, borde 110 < 150
  });

  it("a los lados del viewport cuenta como fuera", () => {
    expect(inVisibleArea(cam, vp, insets, { x: -250, y: 0 })).toBe(false);
    expect(inVisibleArea(cam, vp, insets, { x: 250, y: 0 })).toBe(false);
  });
});

describe("cardPosition", () => {
  const wide = { width: 1200, height: 800 };
  const card = { width: 300, height: 200 };

  it("a la derecha de la obra y centrada en vertical", () => {
    const pos = cardPosition({ x: 300, y: 400, halfW: 30, halfH: 45 }, wide, insets, card);
    expect(pos).toEqual({ left: 342, top: 300, side: "right" });
  });

  it("sin sitio a la derecha, se da la vuelta", () => {
    const pos = cardPosition({ x: 1000, y: 400, halfW: 30, halfH: 45 }, wide, insets, card);
    expect(pos.side).toBe("left");
    expect(pos.left).toBe(1000 - 30 - 12 - 300);
  });

  it("no se mete bajo la barra ni bajo el dock", () => {
    expect(cardPosition({ x: 300, y: 160, halfW: 30, halfH: 45 }, wide, insets, card).top).toBe(158);
    expect(cardPosition({ x: 300, y: 690, halfW: 30, halfH: 45 }, wide, insets, card).top).toBe(800 - 100 - 200 - 8);
  });

  it("sin sitio a ningún lado, queda dentro del viewport", () => {
    const pos = cardPosition({ x: 200, y: 400, halfW: 150, halfH: 45 }, { width: 500, height: 800 }, insets, card);
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + card.width).toBeLessThanOrEqual(492);
  });
});
