import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PET_CLASSES } from "./classes";
import { acornEntry, acornSrc, DRAWN_STAGES, PET_FACING, PET_MANIFEST, REACTION_MS, sheetEntry, sheetSrc } from "./manifest";

const PUBLIC = join(process.cwd(), "public");
// `sheetSrc()`/`acornSrc()` llevan `?v=<hash>` (#1058): para mirar el disco se quita la query.
const pathOf = (src: string) => src.split("?")[0];
const exists = (src: string) => existsSync(join(PUBLIC, pathOf(src)));
// Mismo hash que calcula fetch-character.mjs (sha1 del PNG, 10 hex): el test lo recalcula desde
// el fichero para cazar un PNG regenerado sin `--gen`.
const fileHash = (src: string) => createHash("sha1").update(readFileSync(join(PUBLIC, pathOf(src)))).digest("hex").slice(0, 10);
const ANIMS = ["idle", "sleepy", "sad", "joy"] as const;

// Que falte un sheet o una animación en prod se caza AQUÍ, no mirando la app
// (spec sprites-personaje §5).
describe("manifiesto de la mascota", () => {
  it("la bellota tiene sheet y las animaciones idle y ready", () => {
    expect(exists(acornSrc())).toBe(true);
    expect(pathOf(acornSrc())).toBe("/pet/sheets/acorn.png");
    const e = acornEntry();
    expect(e.cell).toBeGreaterThanOrEqual(64);
    expect(e.anims.idle.frames).toBeGreaterThan(0);
    expect(e.anims.ready.frames).toBeGreaterThan(0);
    expect(PET_MANIFEST.acorn.anims.idle.fps).toBeGreaterThan(0);
    expect(PET_MANIFEST.acorn.anims.ready.fps).toBeGreaterThan(0);
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
      expect(e.cell).toBeGreaterThanOrEqual(64);
      for (const a of ANIMS) expect(e.anims[a].frames, `${stage}/${cls} ${a}`).toBeGreaterThan(0);
    }
  });

  // #1058: el SW cachea los PNG caché-primero por URL. Sin hash en la URL, un re-roll cambia el
  // contenido del PNG y los índices de fila de sheets.gen.ts pero no la URL, y un cliente que
  // vuelve pinta las filas nuevas sobre el PNG viejo. El hash viaja en sheets.gen.ts (dentro del
  // JS hasheado de Next) y se recalcula aquí desde el disco: un PNG regenerado sin `--gen` falla.
  it("sheetSrc lleva ?v=<hash> y el hash es el sha1 del PNG en disco", () => {
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      const e = sheetEntry(stage, cls);
      const src = sheetSrc(stage, cls);
      expect(src, `${stage}/${cls}`).toBe(`/pet/sheets/${stage}/${cls}.png?v=${e.hash}`);
      expect(e.hash, `${stage}/${cls} hash`).toMatch(/^[0-9a-f]{10}$/);
      expect(e.hash, `${stage}/${cls} hash desincronizado del PNG: corre fetch-character.mjs --gen`).toBe(fileHash(src));
    }
  });

  it("acornSrc lleva ?v=<hash> del PNG de la bellota", () => {
    const e = acornEntry();
    expect(acornSrc()).toBe(`/pet/sheets/acorn.png?v=${e.hash}`);
    expect(e.hash).toBe(fileHash(acornSrc()));
  });

  // #1074: la celda (92-104 px) lleva un 30-40 % de relleno transparente alrededor del personaje
  // (~64 px). `box` es la caja real del personaje dentro de la celda (unión de todos los frames),
  // para que la zona táctil de la compañera sea el personaje y no la celda.
  it("cada entrada trae la caja del personaje, más pequeña que la celda y dentro de ella", () => {
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      const { box, cell } = sheetEntry(stage, cls);
      expect(box.x, `${stage}/${cls} x`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${stage}/${cls} y`).toBeGreaterThanOrEqual(0);
      expect(box.w, `${stage}/${cls} w`).toBeGreaterThan(0);
      expect(box.h, `${stage}/${cls} h`).toBeGreaterThan(0);
      expect(box.x + box.w, `${stage}/${cls} x+w`).toBeLessThanOrEqual(cell);
      expect(box.y + box.h, `${stage}/${cls} y+h`).toBeLessThanOrEqual(cell);
      expect(box.w, `${stage}/${cls} w < cell`).toBeLessThan(cell);
      expect(box.h, `${stage}/${cls} h < cell`).toBeLessThan(cell);
    }
  });

  it("todo humor apunta a una animación con fps", () => {
    for (const anim of Object.values(PET_MANIFEST.moodAnim)) {
      expect(PET_MANIFEST.anims[anim].fps).toBeGreaterThan(0);
    }
    expect(PET_MANIFEST.anims.joy.loop).toBe(false);
  });

  // REACTION_MS.joy es un literal compartido por pet-detail.tsx y pet-companion.tsx para
  // apagar la reacción de un solo disparo; que no se desacople en silencio de la fila real.
  it("REACTION_MS.joy coincide con la duración real de la fila joy (frames/fps)", () => {
    const e = sheetEntry("adult", "wizard");
    expect(REACTION_MS.joy).toBe(Math.round(1000 * (e.anims.joy.frames / PET_MANIFEST.anims.joy.fps)));
  });

  // PET_FACING es la única dirección animada (enmienda 2026-09-03, Task 2b): south-west, no
  // south. PetSprite y fetch-character.mjs la leen de aquí, nunca del literal "south".
  it("PET_FACING es south-west, la dirección con animaciones", () => {
    expect(PET_FACING).toBe("south-west");
  });

  it("PET_FACING está entre las direcciones de rotación de cada sheet", () => {
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      expect(sheetEntry(stage, cls).directions, `${stage}/${cls}`).toContain(PET_FACING);
    }
  });

  // El JSON que exporta PixelLab es la fuente; sheets.gen.ts es derivado por fetch-character.mjs.
  // Sin este cruce, un re-roll sin `--gen` (PixelLab reordena las filas por fecha) o un sheet viejo
  // con filas "south" compila, pasa el resto de tests y la mascota reproduce la fila equivocada.
  it("cada fila animada del JSON está en PET_FACING y coincide con sheets.gen.ts", () => {
    type Row = { type: string; animation?: string; direction?: string; row: number; frame_count: number };
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      const s = JSON.parse(readFileSync(join(PUBLIC, "pet", "sheets", stage, `${cls}.json`), "utf8")).spritesheet as {
        cell_size: { width: number };
        sheet_size: { width: number; height: number };
        rows: Row[];
      };
      const e = sheetEntry(stage, cls);
      for (const a of ANIMS) {
        const r = s.rows.find((x) => x.type === "animation" && x.animation === a && x.direction === PET_FACING);
        expect(r, `${stage}/${cls} ${a} en ${PET_FACING}`).toBeDefined();
        expect({ row: r!.row, frames: r!.frame_count }, `${stage}/${cls} ${a}`).toEqual(e.anims[a]);
      }
      expect(s.cell_size.width, `${stage}/${cls} cell`).toBe(e.cell);
      expect(s.sheet_size, `${stage}/${cls} sheet_size`).toEqual({ width: e.width, height: e.height });
    }
  });
});
