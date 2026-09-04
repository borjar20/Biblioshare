// Post-proceso de cada sheet que baja fetch-character.mjs (y del de la bellota de pack-strip.mjs):
//   - compressSheet: PNG truecolor (PixelLab exporta colortype 6) → paleta, SOLO si tiene ≤ 256
//     colores (entonces es sin pérdida; se comprueba píxel a píxel antes de escribir). #1072.
//   - cellBox: caja real del personaje dentro de la celda (unión de los píxeles no transparentes
//     de todas las celdas, en coordenadas de celda). La zona táctil de la compañera. #1074.
//   - sheetHash: sha1 corto del PNG, para `?v=<hash>` en sheetSrc(). #1058.
// Se prueba en src/lib/pet/sheet-postprocess.test.ts.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const MAX_PALETTE = 256;

function countColours(rgba) {
  const seen = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    // Un píxel totalmente transparente es un solo color sea cual sea su RGB.
    const key = rgba[i + 3] === 0 ? 0 : ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3]) >>> 0;
    seen.add(key);
    if (seen.size > MAX_PALETTE) return seen.size;
  }
  return seen.size;
}

function samePixels(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3]) return false;
    if (a[i + 3] === 0) continue;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) return false;
  }
  return true;
}

/**
 * Reescribe `path` más pequeño sin cambiar un píxel: PNG de paleta si cabe en 256 colores (~1/3
 * del peso); si no, truecolor recomprimido al máximo (zlib 9 + filtros adaptativos). En ambos
 * casos se decodifica el resultado y se compara píxel a píxel antes de escribir; si no es idéntico,
 * lanza y deja el fichero como estaba. Si no sale más pequeño, tampoco se toca.
 * @returns {{ before: number, after: number, colours: number, palette: boolean }}
 *   `colours` se corta en 257 = «más de 256»; `palette` dice qué codificación se eligió.
 */
export async function compressSheet(path) {
  const buf = readFileSync(path);
  const before = buf.length;
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const colours = countColours(data);
  const palette = colours <= MAX_PALETTE;
  const out = await sharp(buf)
    .png(palette ? { palette: true, colours: MAX_PALETTE, effort: 10, dither: 0 } : { palette: false, compressionLevel: 9, effort: 10, adaptiveFiltering: true })
    .toBuffer();
  const check = await sharp(out).ensureAlpha().raw().toBuffer();
  if (!samePixels(data, check)) throw new Error(`${path}: la recodificación (${palette ? "paleta" : "truecolor"}) no es idéntica píxel a píxel; no se escribe`);
  if (out.length < before) writeFileSync(path, out);
  return { before, after: Math.min(before, out.length), colours, palette };
}

/**
 * Unión de los píxeles con alpha > 0 de todas las celdas de `cell`×`cell` px, plegada a una celda.
 * @returns {Promise<{ x: number, y: number, w: number, h: number }>}
 */
export async function cellBox(path, cell) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    const ly = y % cell;
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] === 0) continue;
      const lx = x % cell;
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
    }
  }
  if (maxX < 0) throw new Error(`${path}: sin píxeles opacos, no hay caja que calcular`);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** sha1 del fichero, 10 hex: suficiente para distinguir re-rolls, corto para la URL. */
export function sheetHash(path) {
  return createHash("sha1").update(readFileSync(path)).digest("hex").slice(0, 10);
}
