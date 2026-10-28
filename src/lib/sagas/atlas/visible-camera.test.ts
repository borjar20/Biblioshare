import { describe, expect, it } from "vitest";
import { toScreen } from "@/lib/atlas/camera";
import { centreIn, fitVisible } from "./visible-camera";

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
