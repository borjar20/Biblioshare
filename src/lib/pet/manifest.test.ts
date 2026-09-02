import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PET_CLASSES } from "./classes";
import { classLayerSrc, PET_MANIFEST } from "./manifest";

const PUBLIC = join(process.cwd(), "public");
const exists = (src: string) => existsSync(join(PUBLIC, src));

// Que falte una pieza en prod se caza AQUÍ, no mirando la app (spec §5).
describe("manifiesto de la mascota", () => {
  it("existen la bellota y las caras", () => {
    expect(exists(PET_MANIFEST.acorn.src)).toBe(true);
    for (const src of Object.values(PET_MANIFEST.faces)) expect(exists(src), src).toBe(true);
  });

  it("existen las cuatro piezas de cada etapa", () => {
    for (const spec of Object.values(PET_MANIFEST.stages)) {
      for (const piece of [spec.head, spec.body, spec.tail, spec.hand]) {
        expect(exists(piece.src), piece.src).toBe(true);
      }
    }
  });

  it("existen ropa y accesorio de cada clase en cada etapa", () => {
    for (const cls of PET_CLASSES) {
      for (const stage of ["young", "adult", "veteran"] as const) {
        expect(exists(classLayerSrc(cls, stage, "outfit")), `${cls}/${stage}/outfit`).toBe(true);
        expect(exists(classLayerSrc(cls, stage, "accessory")), `${cls}/${stage}/accessory`).toBe(true);
      }
    }
  });
});
