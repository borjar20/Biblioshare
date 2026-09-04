import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { cellBox, compressSheet } from "../../../scripts/pet-pixellab/sheet-postprocess.mjs";

// Post-proceso que fetch-character.mjs aplica a cada sheet que baja de PixelLab (#1072, #1074).
// Se prueba con PNG sintéticos: PixelLab exporta RGBA truecolor (colortype 6) con < 256 colores.
const dir = mkdtempSync(join(tmpdir(), "pet-sheet-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** Lienzo transparente W×H con rectángulos opacos de un color cada uno; PNG truecolor. */
async function canvas(file: string, w: number, h: number, rects: { x: number; y: number; w: number; h: number; rgb: [number, number, number] }[]) {
  const comps = rects.map((r) => ({
    input: { create: { width: r.w, height: r.h, channels: 4 as const, background: { r: r.rgb[0], g: r.rgb[1], b: r.rgb[2], alpha: 1 } } },
    left: r.x,
    top: r.y,
  }));
  const p = join(dir, file);
  await sharp({ create: { width: w, height: h, channels: 4, background: CLEAR } }).composite(comps).png({ palette: false }).toFile(p);
  return p;
}

async function pixels(p: string) {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Byte «colour type» del IHDR: firma (8) + longitud (4) + "IHDR" (4) + ancho (4) + alto (4) + profundidad (1). */
const pngColourType = (p: string) => readFileSync(p)[25];

/** Igualdad píxel a píxel; un píxel transparente cuenta igual sea cual sea su RGB. */
function samePixels(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3]) return false;
    if (a[i + 3] === 0) continue;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) return false;
  }
  return true;
}

describe("compressSheet", () => {
  it("pasa un PNG truecolor de pocos colores a paleta sin cambiar ni un píxel", async () => {
    const p = await canvas("few.png", 120, 120, [
      { x: 10, y: 10, w: 40, h: 40, rgb: [200, 30, 30] },
      { x: 60, y: 60, w: 30, h: 30, rgb: [30, 200, 30] },
      { x: 5, y: 90, w: 100, h: 20, rgb: [30, 30, 200] },
    ]);
    const before = await pixels(p);
    const sizeBefore = statSync(p).size;
    const r = await compressSheet(p);
    const after = await pixels(p);
    expect(r.palette).toBe(true);
    expect(r.colours).toBe(4); // 3 colores + transparente
    expect(r.before).toBe(sizeBefore);
    expect(r.after).toBe(statSync(p).size);
    expect(r.after).toBeLessThanOrEqual(r.before);
    expect(pngColourType(p)).toBe(3); // 3 = indexed (paleta); PixelLab exporta 6 = RGBA truecolor
    expect(samePixels(before.data, after.data)).toBe(true);
  });

  // Siete de los 19 sheets reales superan los 256 colores (2026-09-04): a paleta sería con
  // pérdida, así que se quedan truecolor — pero recomprimidos al máximo (zlib 9, filtros
  // adaptativos), que también es sin pérdida.
  it("con más de 256 colores no pone paleta: recomprime truecolor sin cambiar ni un píxel", async () => {
    const w = 64, h = 64;
    const raw = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[i] = x * 4; raw[i + 1] = y * 4; raw[i + 2] = (x + y) * 2; raw[i + 3] = 255;
    }
    const p = join(dir, "many.png");
    // Se guarda SIN comprimir (zlib 0) para que la recompresión tenga margen de sobra.
    await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png({ palette: false, compressionLevel: 0 }).toFile(p);
    const before = await pixels(p);
    const sizeBefore = statSync(p).size;
    const r = await compressSheet(p);
    expect(r.palette).toBe(false);
    expect(r.colours).toBeGreaterThan(256);
    expect(r.before).toBe(sizeBefore);
    expect(r.after).toBe(statSync(p).size);
    expect(r.after).toBeLessThan(r.before);
    expect(pngColourType(p)).not.toBe(3);
    expect(samePixels(before.data, (await pixels(p)).data)).toBe(true);
  });

  it("es idempotente: un sheet ya en paleta se queda como está", async () => {
    const p = await canvas("twice.png", 40, 40, [{ x: 4, y: 4, w: 10, h: 10, rgb: [1, 2, 3] }]);
    await compressSheet(p);
    const once = readFileSync(p);
    const r = await compressSheet(p);
    expect(r.palette).toBe(true);
    expect(r.after).toBeLessThanOrEqual(r.before);
    expect(samePixels((await pixels(p)).data, (await sharp(once).ensureAlpha().raw().toBuffer()))).toBe(true);
  });
});

describe("cellBox", () => {
  it("devuelve la unión de los píxeles opacos de todas las celdas, en coordenadas de celda", async () => {
    // Rejilla 2×2 de celdas de 20 px. Celda (0,0): rect en (3,5)-(8,12) → local x 3..8, y 5..12.
    // Celda (1,1): rect en (25,22)-(31,30) → local x 5..11, y 2..10. Unión: x 3..11, y 2..12.
    const p = await canvas("grid.png", 40, 40, [
      { x: 3, y: 5, w: 6, h: 8, rgb: [255, 0, 0] },
      { x: 25, y: 22, w: 7, h: 9, rgb: [0, 255, 0] },
    ]);
    expect(await cellBox(p, 20)).toEqual({ x: 3, y: 2, w: 9, h: 11 });
  });

  it("ignora los píxeles totalmente transparentes aunque tengan color", async () => {
    const w = 20, h = 20;
    const raw = Buffer.alloc(w * h * 4);
    for (let i = 0; i < raw.length; i += 4) { raw[i] = 255; raw[i + 1] = 128; raw[i + 2] = 0; raw[i + 3] = 0; }
    const at = (x: number, y: number) => (y * w + x) * 4;
    raw[at(7, 9) + 3] = 255;
    raw[at(9, 11) + 3] = 40; // semitransparente también cuenta: se ve
    const p = join(dir, "alpha.png");
    await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png({ palette: false }).toFile(p);
    expect(await cellBox(p, 20)).toEqual({ x: 7, y: 9, w: 3, h: 3 });
  });

  it("un sheet vacío no tiene caja", async () => {
    const p = await canvas("empty.png", 20, 20, []);
    await expect(cellBox(p, 20)).rejects.toThrow(/sin píxeles opacos/);
  });
});
