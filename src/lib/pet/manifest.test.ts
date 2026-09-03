import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PET_CLASSES } from "./classes";
import { DRAWN_STAGES, PET_MANIFEST, sheetEntry, sheetSrc } from "./manifest";

const PUBLIC = join(process.cwd(), "public");
const exists = (src: string) => existsSync(join(PUBLIC, src));
const ANIMS = ["idle", "sleepy", "sad", "joy"] as const;

// Que falte un sheet o una animación en prod se caza AQUÍ, no mirando la app
// (spec sprites-personaje §5).
describe("manifiesto de la mascota", () => {
  it("existe la bellota", () => {
    expect(exists(PET_MANIFEST.acorn.src)).toBe(true);
  });

  it("existe el sheet PNG de cada etapa × clase", () => {
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      expect(exists(sheetSrc(stage, cls)), `${stage}/${cls}`).toBe(true);
    }
  });

  it("cada entrada generada tiene 8 direcciones y las cuatro animaciones sur", () => {
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      const e = sheetEntry(stage, cls);
      expect(e.directions.length, `${stage}/${cls} direcciones`).toBe(8);
      expect(e.directions[0]).toBe("south");
      expect(e.cell).toBeGreaterThanOrEqual(40);
      for (const a of ANIMS) expect(e.anims[a].frames, `${stage}/${cls} ${a}`).toBeGreaterThan(0);
    }
  });

  it("todo humor apunta a una animación con fps", () => {
    for (const anim of Object.values(PET_MANIFEST.moodAnim)) {
      expect(PET_MANIFEST.anims[anim].fps).toBeGreaterThan(0);
    }
    expect(PET_MANIFEST.anims.joy.loop).toBe(false);
  });
});
